// Puppeteer launch flags mirror apps/playground/scripts/shootExamples.ts (canonical swiftshader recipe);
// keep in sync if that script's GL flags change.
import puppeteer from 'puppeteer';
import { mkdir } from 'node:fs/promises';
import { resolve, basename, dirname } from 'node:path';
import { acquireServer, type AcquireOptions } from './registry.js';
import type { SectionSpec } from './aiming.js';

export type ViewName = 'iso' | 'front' | 'top' | 'right';
type ViewMode = 'solid' | 'wireframe' | 'xray';
/** One capture: a camera view + render mode (+ optional section), written to `<name>.png`. */
export interface Shot {
  name: string;
  view: ViewName;
  viewMode?: ViewMode;
  section?: SectionSpec;
}
// The default recipe: the four orthographic-ish views plus an xray pass that reveals internal
// features (bores, shelled walls, internal teeth) an opaque exterior render is blind to — the
// internal-visibility gap that exterior-only shots leave (most of the mechanical corpus has internals).
const DEFAULT_SHOTS: readonly Shot[] = [
  { name: 'iso', view: 'iso' },
  { name: 'front', view: 'front' },
  { name: 'top', view: 'top' },
  { name: 'right', view: 'right' },
  { name: 'iso-xray', view: 'iso', viewMode: 'xray' },
];
// The section is shot from iso, not flat-on along the cut axis. Render-tested both: looking ALONG the
// cut axis shows the *closed* far half (the clip keeps the side away from the camera, so its cut face
// points away), whereas the iso 3/4 angle looks INTO the opened cavity and legibly shows the bore +
// walls — more informative for the judge than a foreshortened-but-flat profile.
function sectionShots(section: SectionSpec | undefined): Shot[] {
  return section ? [{ name: 'section', view: 'iso', section }] : [];
}

// The viewer boots WASM in-browser, so __ready arrives far later than a plain GLB load.
const READY_TIMEOUT_MS = 90_000;

export interface ShootOptions extends AcquireOptions {
  file: string;
  outDir: string;
  /** Capture recipe; defaults to the four views + an xray internal pass. */
  shots?: readonly Shot[];
  /** When set (and no explicit `shots`), append an aimed cross-section capture to the default recipe. */
  section?: SectionSpec;
  /** Wall-clock ms to let the camera settle before each capture (default 400; raise on slow CI). */
  settleMs?: number;
  /** Burn the model's bbox dimensions into each PNG so the agent can read scale (default true). */
  dimensions?: boolean;
}
export interface ShootResult {
  outDir: string;
  pngs: string[];
}

export async function shoot(opts: ShootOptions): Promise<ShootResult> {
  const absFile = resolve(opts.file);
  const dir = dirname(absFile);
  const rel = basename(absFile);
  const shots = opts.shots ?? [...DEFAULT_SHOTS, ...sectionShots(opts.section)];

  await mkdir(opts.outDir, { recursive: true });
  const server = await acquireServer(opts);

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
  });
  const pngs: string[] = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 900 });
    // ui=0 hides the interactive toolbar so captured PNGs contain only the model; dims=1
    // overlays the bbox size so the agent can read scale from the image.
    const dimsParam = opts.dimensions === false ? '' : '&dims=1';
    const target = `${server.url}/?dir=${encodeURIComponent(dir)}&file=${encodeURIComponent(rel)}&ui=0${dimsParam}`;
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForFunction('window.__ready === true', { timeout: READY_TIMEOUT_MS });
    for (const shot of shots) {
      await page.evaluate((s: Shot) => {
        (globalThis as unknown as { __setScene(c: Shot): void }).__setScene(s);
      }, shot);
      await new Promise((r) => setTimeout(r, opts.settleMs ?? 400));
      const path = resolve(opts.outDir, `${shot.name}.png`) as `${string}.png`;
      await page.screenshot({ path });
      pngs.push(path);
    }
  } finally {
    await browser.close();
    await server.close();
  }
  return { outDir: opts.outDir, pngs };
}
