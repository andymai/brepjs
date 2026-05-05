/**
 * Render hero images for chapter pages by driving the /site playground via
 * puppeteer. Each entry produces a PNG at docs-site/public/images/<chapter>/<name>.png
 * which chapters reference inline.
 *
 * Prereqs:
 *   1. Start the playground: cd site && npm run dev (default http://localhost:5173)
 *   2. Run: npm run docs:render-images
 *
 * The registry below is the canonical list; add a new entry per chapter hero
 * and run again. Failures are reported and skipped — the rest still render.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import lzString from 'lz-string';
import puppeteer from 'puppeteer';

const { compressToEncodedURIComponent } = lzString;

interface DocHero {
  /** Chapter path under docs-site, e.g. 'tasks/booleans' */
  chapter: string;
  /** Image filename (sans extension), e.g. 'drilled-and-filleted' */
  name: string;
  /** Camera position [x,y,z] (optional; default fits to bounds) */
  cameraPosition?: [number, number, number];
  /** Self-contained brepjs/quick snippet that returns a 3D shape */
  code: string;
}

const HEROES: DocHero[] = [
  {
    chapter: 'getting-started/first-solid',
    name: 'drilled-and-filleted',
    code: `
import { box, cylinder, shape } from 'brepjs/quick';

return shape(box(30, 20, 10))
  .cut(cylinder(5, 15, { at: [15, 10, -2] }))
  .fillet((e) => e.inDirection('Z'), 1.5).val;
    `.trim(),
  },
  {
    chapter: 'tasks/primitives',
    name: 'box',
    code: `
import { box } from 'brepjs/quick';
return box(30, 20, 10);
    `.trim(),
  },
  {
    chapter: 'tasks/booleans',
    name: 'cut',
    code: `
import { box, cylinder, shape } from 'brepjs/quick';
return shape(box(20, 20, 20)).cut(cylinder(8, 30, { at: [10, 10, -5] })).val;
    `.trim(),
  },
  {
    chapter: 'tasks/fillets',
    name: 'rounded-corners',
    code: `
import { box, shape } from 'brepjs/quick';
return shape(box(30, 20, 10)).fillet((e) => e.inDirection('Z'), 2).val;
    `.trim(),
  },
  {
    chapter: 'tasks/sketching',
    name: 'sketcher-profile',
    code: `
import { Sketcher } from 'brepjs/quick';
return new Sketcher('XY')
  .movePointerTo([0, 0])
  .lineTo([20, 0])
  .lineTo([20, 10])
  .lineTo([15, 10])
  .lineTo([15, 5])
  .lineTo([5, 5])
  .lineTo([5, 10])
  .lineTo([0, 10])
  .close()
  .extrude(8);
    `.trim(),
  },
  {
    chapter: 'tasks/lofts-sweeps',
    name: 'goblet-revolve',
    code: `
import { Sketcher } from 'brepjs/quick';
return new Sketcher('XZ')
  .movePointerTo([0, 0])
  .hLine(8)
  .vLine(2)
  .hLine(-6)
  .vLine(20)
  .hLine(15)
  .tangentArc(0, 4)
  .hLine(-17)
  .vLine(-26)
  .close()
  .revolve();
    `.trim(),
  },
  {
    chapter: 'tasks/finders',
    name: 'vertical-edges',
    code: `
import { box, shape } from 'brepjs/quick';
return shape(box(30, 20, 10)).fillet((e) => e.inDirection('Z'), 3).val;
    `.trim(),
  },
  {
    chapter: 'tasks/measurement',
    name: 'sphere-volume',
    code: `
import { sphere } from 'brepjs/quick';
return sphere(10);
    `.trim(),
  },
  {
    chapter: 'tasks/import-export',
    name: 'export-target',
    code: `
import { box, cylinder, shape } from 'brepjs/quick';
return shape(box(30, 20, 10))
  .cut(cylinder(4, 15, { at: [15, 10, -2] }))
  .fillet((e) => e.inDirection('Z'), 1).val;
    `.trim(),
  },
];

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173';
const OUT_DIR = 'docs-site/public/images';
const WAIT_AFTER_RENDER_MS = 2500;

async function renderHero(browser: import('puppeteer').Browser, hero: DocHero): Promise<boolean> {
  const encoded = compressToEncodedURIComponent(hero.code);
  const url = `${BASE_URL}/#code/${encoded}`;
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 });

    await page.waitForFunction(
      () => {
        const canvas = document.querySelector('canvas');
        return canvas && canvas.width > 0 && canvas.height > 0;
      },
      { timeout: 30_000 }
    );

    await new Promise((r) => setTimeout(r, WAIT_AFTER_RENDER_MS));

    const outPath = join(OUT_DIR, hero.chapter, `${hero.name}.png`);
    mkdirSync(dirname(outPath), { recursive: true });
    await page.screenshot({ path: outPath as `${string}.png`, fullPage: false });

    process.stdout.write(`  ✓ ${hero.chapter}/${hero.name}.png\n`);
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stdout.write(`  ✗ ${hero.chapter}/${hero.name}: ${msg}\n`);
    return false;
  } finally {
    await page.close();
  }
}

async function main(): Promise<void> {
  console.log(`Rendering ${HEROES.length} doc hero images via ${BASE_URL}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  let pass = 0;
  let fail = 0;
  for (const hero of HEROES) {
    if (await renderHero(browser, hero)) pass++;
    else fail++;
  }

  await browser.close();

  console.log(`\n${pass} rendered, ${fail} failed.`);
  if (fail > 0) process.exit(1);
}

await main();
