// Puppeteer launch flags mirror apps/playground/scripts/shootExamples.ts (canonical swiftshader recipe);
// keep in sync if that script's GL flags change.
import puppeteer from 'puppeteer';
import { mkdir } from 'node:fs/promises';
import { resolve, basename, dirname } from 'node:path';
import { acquireServer, type AcquireOptions } from './registry.js';

export type ViewName = 'iso' | 'front' | 'top' | 'right';
const VIEWS: readonly ViewName[] = ['iso', 'front', 'top', 'right'];
// The viewer boots WASM in-browser, so __ready arrives far later than a plain GLB load.
const READY_TIMEOUT_MS = 90_000;

export interface ShootOptions extends AcquireOptions {
  file: string;
  outDir: string;
  views?: readonly ViewName[];
  /** Wall-clock ms to let the camera settle before each capture (default 400; raise on slow CI). */
  settleMs?: number;
}
export interface ShootResult {
  outDir: string;
  pngs: string[];
}

export async function shoot(opts: ShootOptions): Promise<ShootResult> {
  const absFile = resolve(opts.file);
  const dir = dirname(absFile);
  const rel = basename(absFile);
  const views = opts.views ?? VIEWS;

  await mkdir(opts.outDir, { recursive: true });
  const server = await acquireServer(opts);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const pngs: string[] = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 900 });
    // ui=0 hides the interactive toolbar so captured PNGs contain only the model.
    const target = `${server.url}/?dir=${encodeURIComponent(dir)}&file=${encodeURIComponent(rel)}&ui=0`;
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForFunction('window.__ready === true', { timeout: READY_TIMEOUT_MS });
    for (const view of views) {
      await page.evaluate((v: string) => {
        (globalThis as unknown as { __renderView(s: string): void }).__renderView(v);
      }, view);
      await new Promise((r) => setTimeout(r, opts.settleMs ?? 400));
      const path = resolve(opts.outDir, `${view}.png`) as `${string}.png`;
      await page.screenshot({ path });
      pngs.push(path);
    }
  } finally {
    await browser.close();
    await server.close();
  }
  return { outDir: opts.outDir, pngs };
}
