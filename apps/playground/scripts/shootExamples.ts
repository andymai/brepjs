/**
 * Headless screenshotter for playground examples. Two modes:
 *
 *   npx tsx scripts/shootExamples.ts <BASE_URL> [outDir] [exampleId ...]
 *     Audit mode (default): full-page PNG per example into <outDir> (tmp/shots).
 *     Used for visual review and the scad-to-playground workflow's audit stage.
 *
 *   npx tsx scripts/shootExamples.ts --thumbs <BASE_URL> [exampleId ...]
 *     Thumbnail mode: frames each example (Iso preset, Fit, grid off) and writes
 *     a square WebP to public/example-thumbs/<id>.webp for the example picker.
 *     This is `npm run thumbs`.
 *
 * Both load each EXAMPLES entry into a running playground via a `?code=` share
 * URL (the format the Share button produces — see src/lib/urlCodec.ts) and wait
 * for the WASM engine + a render. A shape can pass the eval+mesh test yet still
 * render wrong (off-centre, floating, degenerate) — capturing it is how we catch
 * that. Exits non-zero if any requested example fails to load or render.
 */
import puppeteer, { type Page } from 'puppeteer';
import lzString from 'lz-string';
const { compressToEncodedURIComponent } = lzString;
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXAMPLES, type Example } from '../src/lib/examples';

const scriptDir = dirname(fileURLToPath(import.meta.url));

const argv = process.argv.slice(2);
const thumbsMode = argv.includes('--thumbs');
const positional = argv.filter((a) => a !== '--thumbs');

const baseUrl = (positional.find((a) => a.startsWith('http')) ?? 'http://localhost:5173').replace(
  /\/$/,
  ''
);
// Thumbnails always go to the committed public/ dir; audit mode takes an optional outDir.
const THUMB_DIR = resolve(scriptDir, '../public/example-thumbs');
const outDir = thumbsMode
  ? THUMB_DIR
  : resolve(positional.find((a) => !a.startsWith('http') && !looksLikeId(a)) ?? 'tmp/shots');
const idFilter = positional.filter((a) => !a.startsWith('http') && looksLikeId(a));

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

/** Frame the model for a clean thumbnail and capture a centred square WebP. */
async function captureThumbnail(page: Page, id: string): Promise<void> {
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

  // Capture a centred square at the viewer canvas's natural height (~800px at
  // the 1280×800 viewport — well above each card's ~256px display size, so it
  // stays crisp on retina). Resize here later if a fixed output size is needed.
  const side = Math.min(box.width, box.height);
  await page.screenshot({
    path: resolve(outDir, `${id}.webp`) as `${string}.webp`,
    type: 'webp',
    quality: 90,
    clip: {
      x: box.x + (box.width - side) / 2,
      y: box.y + (box.height - side) / 2,
      width: side,
      height: side,
    },
  });
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
// A large viewport in both modes — at small sizes the editor/viewer split
// leaves the WebGL canvas too small to render. Thumbnail mode collapses the
// editor and clips a centred square from the (large) viewer canvas.
await page.setViewport({ width: 1280, height: 800 });

let failures = 0;
for (const ex of targets) {
  process.stdout.write(`${thumbsMode ? 'thumb' : 'shoot'} ${ex.id} ... `);
  try {
    await page.goto(shareUrl(ex.code), { waitUntil: 'domcontentloaded', timeout: 30_000 });
    // Engine ready = LoadingOverlay (.absolute.inset-0.z-50) removed; matches
    // scripts/smoke.ts.
    await page.waitForFunction(() => !document.querySelector('.absolute.inset-0.z-50'), {
      timeout: 60_000,
    });
    // The shared link auto-runs; give the viewer time to mesh and frame.
    await new Promise((r) => setTimeout(r, 3500));
    if (thumbsMode) {
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
console.log(
  `\n${targets.length - failures}/${targets.length} ${thumbsMode ? 'thumbed' : 'shot'} → ${outDir}`
);
process.exit(failures > 0 ? 1 : 0);
