/**
 * Headless screenshotter for playground examples. Three modes:
 *
 *   npx tsx scripts/shootExamples.ts <BASE_URL> [outDir] [exampleId ...]
 *     Audit mode (default): full-page PNG per example into <outDir> (tmp/shots).
 *     Used for visual review and the scad-to-playground workflow's audit stage.
 *
 *   npx tsx scripts/shootExamples.ts --thumbs <BASE_URL> [exampleId ...]
 *     Thumbnail mode: frames each example (Iso preset, Fit, grid off) and writes
 *     a square WebP to public/example-thumbs/<id>.webp for the example gallery.
 *     This is `npm run thumbs`.
 *
 *   npx tsx scripts/shootExamples.ts --turntable <BASE_URL> [exampleId ...]
 *     Turntable mode: same framing, then orbits the camera a full 360° via the
 *     DEV-only window.__brepjsOrbit hook, capturing frames into an animated WebP
 *     at public/example-thumbs/<id>.turntable.webp — the gallery lazy-loads it
 *     on hover. This is `npm run turntables`. Requires img2webp or ffmpeg.
 *
 * All modes load each EXAMPLES entry into a running playground via a `?code=`
 * share URL (the format the Share button produces — see src/lib/urlCodec.ts) and
 * wait for the WASM engine + a render. A shape can pass the eval+mesh test yet
 * still render wrong (off-centre, floating, degenerate) — capturing it is how we
 * catch that. Exits non-zero if any requested example fails to load or render.
 */
import puppeteer, { type Page } from 'puppeteer';
import lzString from 'lz-string';
const { compressToEncodedURIComponent } = lzString;
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXAMPLES, type Example } from '../src/lib/examples';

// Optional frame downscaler — keeps the animated asset small. If sharp isn't
// resolvable we just encode native-resolution frames (larger, still valid).
type Resizer = (png: Buffer) => Promise<Buffer>;
let resizerPromise: Promise<Resizer | null> | undefined;
function loadResizer(): Promise<Resizer | null> {
  resizerPromise ??= import('sharp')
    .then((m) => (png: Buffer) => m.default(png).resize(TT_SIZE, TT_SIZE).png().toBuffer())
    .catch(() => null);
  return resizerPromise;
}

const scriptDir = dirname(fileURLToPath(import.meta.url));

const argv = process.argv.slice(2);
const thumbsMode = argv.includes('--thumbs');
const turntableMode = argv.includes('--turntable');
const positional = argv.filter((a) => a !== '--thumbs' && a !== '--turntable');

const baseUrl = (positional.find((a) => a.startsWith('http')) ?? 'http://localhost:5173').replace(
  /\/$/,
  ''
);
// Thumbnails and turntables go to the committed public/ dir; audit mode takes an
// optional outDir.
const THUMB_DIR = resolve(scriptDir, '../public/example-thumbs');
const outDir =
  thumbsMode || turntableMode
    ? THUMB_DIR
    : resolve(positional.find((a) => !a.startsWith('http') && !looksLikeId(a)) ?? 'tmp/shots');
const idFilter = positional.filter((a) => !a.startsWith('http') && looksLikeId(a));

// Turntable framing/encoding knobs.
const TT_FRAMES = 32; // azimuth steps over the full 360° (11.25° each)
const TT_SIZE = 512; // square output edge (px) — crisp on a ~256px card
const TT_FRAME_MS = 80; // per-frame hold (32 * 80ms ≈ 2.6s per loop)

function looksLikeId(a: string): boolean {
  return EXAMPLES.some((e) => e.id === a);
}

function shareUrl(code: string): string {
  return `${baseUrl}/playground/?code=${compressToEncodedURIComponent(code)}`;
}

/** Click a viewer-toolbar button by its visible label (Iso, Fit, Grid, …). */
async function clickViewerButton(page: Page, label: string): Promise<void> {
  await page.evaluate((text) => {
    const btn = [...document.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === text
    );
    btn?.click();
  }, label);
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Collapse the editor, frame the model (Iso + Fit, grid off), hide floating
 * chrome, and return the WebGL canvas's screen box. Shared by thumbnail and
 * turntable capture.
 */
async function frameModel(page: Page): Promise<Box> {
  // Collapse the editor so the viewer fills the width (Ctrl/Cmd+Shift+\).
  // Dispatched on <body> so Monaco doesn't swallow it.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.down('Control');
  await page.keyboard.down('Shift');
  await page.keyboard.press('\\');
  await page.keyboard.up('Shift');
  await page.keyboard.up('Control');
  await new Promise((r) => setTimeout(r, 300));

  // Iso angle + fit; turn the grid off so only the part shows. The Grid button
  // exposes its state via aria-pressed — only toggle when it's currently on.
  await clickViewerButton(page, 'Iso');
  const gridOn = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Grid'
    );
    return btn?.getAttribute('aria-pressed') === 'true';
  });
  if (gridOn) await clickViewerButton(page, 'Grid');
  await clickViewerButton(page, 'Fit');
  await new Promise((r) => setTimeout(r, 800)); // let the camera settle

  // Hide floating chrome so only the model shows: the onboarding hint and
  // toasts (both role="status"), any role="alert", and the viewer toolbar
  // (the only absolutely-positioned top-3 cluster).
  await page.evaluate(() => {
    const sel = '[role="status"], [role="alert"], .absolute.top-3';
    for (const el of document.querySelectorAll(sel)) {
      (el as HTMLElement).style.display = 'none';
    }
  });
  await new Promise((r) => setTimeout(r, 100));

  // The page has more than one <canvas> (e.g. a tiny hidden measurement canvas);
  // pick the largest by area — that's the WebGL viewer.
  const box = await page.evaluate(() => {
    const canvases = [...document.querySelectorAll('canvas')];
    let best: DOMRect | null = null;
    for (const c of canvases) {
      const r = c.getBoundingClientRect();
      if (!best || r.width * r.height > best.width * best.height) best = r;
    }
    return best && { x: best.x, y: best.y, width: best.width, height: best.height };
  });
  if (!box || box.width < 50)
    throw new Error(`no usable viewer canvas (box=${JSON.stringify(box)})`);
  return box;
}

/** Centred square clip from the viewer canvas box. */
function squareClip(box: Box): Box {
  const side = Math.min(box.width, box.height);
  return {
    x: box.x + (box.width - side) / 2,
    y: box.y + (box.height - side) / 2,
    width: side,
    height: side,
  };
}

/** Frame the model and capture a centred square WebP thumbnail. */
async function captureThumbnail(page: Page, id: string): Promise<void> {
  const box = await frameModel(page);
  // Capture at the viewer canvas's natural height (~800px at the 1280×800
  // viewport) — well above each card's ~256px display size, so it stays crisp.
  await page.screenshot({
    path: resolve(THUMB_DIR, `${id}.webp`) as `${string}.webp`,
    type: 'webp',
    quality: 90,
    clip: squareClip(box),
  });
}

/** Encode an animated WebP from PNG frames; prefer img2webp, fall back to ffmpeg. */
function encodeAnimatedWebp(frameFiles: string[], out: string): void {
  try {
    execFileSync(
      'img2webp',
      ['-loop', '0', '-lossy', '-q', '76', '-m', '6', '-d', String(TT_FRAME_MS), ...frameFiles, '-o', out],
      { stdio: 'pipe' }
    );
    return;
  } catch {
    // img2webp unavailable — fall back to ffmpeg's image2 demuxer. Frame files
    // are frame%03d.png in the same dir, so point ffmpeg at the pattern.
    const pattern = join(dirname(frameFiles[0] ?? ''), 'frame%03d.png');
    const fps = Math.round(1000 / TT_FRAME_MS);
    execFileSync(
      'ffmpeg',
      ['-y', '-framerate', String(fps), '-i', pattern, '-loop', '0', '-q:v', '60', out],
      { stdio: 'pipe' }
    );
  }
}

/** Frame the model, orbit a full turn, and write an animated-WebP turntable. */
async function captureTurntable(page: Page, id: string): Promise<void> {
  const box = await frameModel(page);
  const clip = squareClip(box);
  const hasHook = await page.evaluate(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- screenshot hook
    () => typeof (window as any).__brepjsOrbit?.begin === 'function'
  );
  if (!hasHook) throw new Error('window.__brepjsOrbit missing (is this a DEV build?)');

  const resize = await loadResizer();
  const frameDir = mkdtempSync(join(tmpdir(), `tt-${id}-`));
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- screenshot hook
    await page.evaluate(() => (window as any).__brepjsOrbit.begin());
    const frameFiles: string[] = [];
    for (let i = 0; i < TT_FRAMES; i++) {
      await page.evaluate(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- screenshot hook
        (f: number) => (window as any).__brepjsOrbit.set(f),
        i / TT_FRAMES
      );
      await new Promise((r) => setTimeout(r, 110)); // let R3F render the new angle
      const png = (await page.screenshot({ type: 'png', clip })) as Buffer;
      const file = join(frameDir, `frame${String(i).padStart(3, '0')}.png`);
      // Downscale to a card-sized square so the animated asset stays small.
      writeFileSync(file, resize ? await resize(png) : png);
      frameFiles.push(file);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- screenshot hook
    await page.evaluate(() => (window as any).__brepjsOrbit.end());
    encodeAnimatedWebp(frameFiles, resolve(THUMB_DIR, `${id}.turntable.webp`));
  } finally {
    rmSync(frameDir, { recursive: true, force: true });
  }
}

const targets: Example[] = idFilter.length
  ? EXAMPLES.filter((e) => idFilter.includes(e.id))
  : [...EXAMPLES];

mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    // SwiftShader gives a deterministic software GL so WebGL renders on a
    // headless runner with no GPU.
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});
const page = await browser.newPage();
// A large viewport in all modes — at small sizes the editor/viewer split leaves
// the WebGL canvas too small to render. Thumbnail/turntable modes collapse the
// editor and clip a centred square from the (large) viewer canvas.
await page.setViewport({ width: 1280, height: 800 });

const verb = turntableMode ? 'turntable' : thumbsMode ? 'thumb' : 'shoot';
let failures = 0;
for (const ex of targets) {
  process.stdout.write(`${verb} ${ex.id} ... `);
  try {
    await page.goto(shareUrl(ex.code), { waitUntil: 'domcontentloaded', timeout: 30_000 });
    // Engine ready = LoadingOverlay (.absolute.inset-0.z-50) removed; matches
    // scripts/smoke.ts.
    await page.waitForFunction(() => !document.querySelector('.absolute.inset-0.z-50'), {
      timeout: 60_000,
    });
    // The shared link auto-runs. Wait for the run to actually finish rather than
    // a fixed delay — the status bar shows a `<n>ms` timing only once a run
    // completes (!isRunning && timeMs set), so heavy examples aren't captured
    // mid-evaluation as a blank viewer.
    await page.waitForFunction(
      () => {
        const bar = [...document.querySelectorAll('[role="status"]')].find((b) =>
          b.textContent?.includes('OCCT')
        );
        return !!bar && /\d+\s*ms/.test(bar.textContent ?? '');
      },
      { timeout: 60_000 }
    );
    await new Promise((r) => setTimeout(r, 700)); // settle the mesh + camera framing
    if (turntableMode) {
      await captureTurntable(page, ex.id);
    } else if (thumbsMode) {
      await captureThumbnail(page, ex.id);
    } else {
      await page.screenshot({ path: resolve(outDir, `${ex.id}.png`) as `${string}.png` });
    }
    console.log('ok');
  } catch (e) {
    failures++;
    console.log(`FAIL: ${(e as Error).message.split('\n')[0]}`);
  }
}

await browser.close();
console.log(`\n${targets.length - failures}/${targets.length} ${verb} → ${outDir}`);
process.exit(failures > 0 ? 1 : 0);
