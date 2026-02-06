/**
 * Take screenshots of all playground examples for visual QA.
 *
 * Prerequisites:
 *   1. Start dev server: cd site && npm run dev
 *   2. Run this script: npm run screenshot-examples
 *
 * Screenshots are saved to site/screenshots/{id}.png
 */
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Import example list
const { examples } = await import('../src/lib/examples.js');

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173';
const SCREENSHOT_DIR = join(__dirname, '..', 'screenshots');
const WAIT_AFTER_RENDER_MS = 2000;

mkdirSync(SCREENSHOT_DIR, { recursive: true });

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
});

const passed: string[] = [];
const failed: string[] = [];

for (const ex of examples) {
  process.stdout.write(`Screenshotting "${ex.title}" (${ex.id})... `);

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  try {
    // Navigate to the example
    await page.goto(`${BASE_URL}/playground#example/${ex.id}`, {
      waitUntil: 'networkidle2',
      timeout: 30_000,
    });

    // Wait for loading overlay to disappear (engine status becomes 'ready')
    await page.waitForFunction(
      () => {
        const overlay = document.querySelector('.absolute.inset-0.z-50');
        return !overlay;
      },
      { timeout: 60_000 }
    );

    // Wait for canvas to appear with non-zero dimensions
    await page.waitForFunction(
      () => {
        const canvas = document.querySelector('canvas');
        return canvas && canvas.width > 0 && canvas.height > 0;
      },
      { timeout: 10_000 }
    );

    // Extra wait for Three.js to render + auto-fit camera
    await new Promise((r) => setTimeout(r, WAIT_AFTER_RENDER_MS));

    // Screenshot the full page
    const outPath = join(SCREENSHOT_DIR, `${ex.id}.png`);
    await page.screenshot({ path: outPath, fullPage: false });

    console.log(`OK -> screenshots/${ex.id}.png`);
    passed.push(ex.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`FAIL: ${msg}`);
    failed.push(ex.id);
  } finally {
    await page.close();
  }
}

await browser.close();

console.log('\n── Summary ──');
console.log(`Passed: ${passed.length}/${examples.length}`);
if (failed.length > 0) {
  console.log(`Failed: ${failed.join(', ')}`);
}
console.log(`Screenshots saved to: ${SCREENSHOT_DIR}/`);

process.exit(failed.length > 0 ? 1 : 0);
