/**
 * Headless e2e for the example gallery, mirroring scripts/smoke.ts (standalone,
 * runs against a dev/preview URL, exits 0 on success / 1 on failure).
 *
 *   npx tsx scripts/galleryE2e.ts <BASE_URL>
 *
 * Verifies: the toolbar button opens the gallery, cards render, the category
 * rail and search box filter the grid, focus stays trapped, selecting a card
 * closes it, and the /examples deep-link routes open the gallery (focused on a
 * card for /examples/<id>). No jsdom — this is the playground's testing style
 * (smoke, shootExamples) for browser-only behaviour, driven via page.evaluate.
 */
import puppeteer from 'puppeteer';
import { CATEGORIES, EXAMPLES } from '../src/lib/examples';

const baseUrl = (process.argv[2] ?? 'http://localhost:5173').replace(/\/$/, '');

const browser = await puppeteer.launch({
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});

const fail = (msg: string): never => {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
  throw new Error(msg);
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const gallerySel = '[aria-label="Example gallery"]';
const cardSel = `${gallerySel} button[data-id]`;
const engineReady = () => !document.querySelector('.absolute.inset-0.z-50');

try {
  const firstCat = CATEGORIES[0];
  const firstExample = EXAMPLES[0];
  if (!firstCat || !firstExample) fail('no categories/examples to test against');

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(`${baseUrl}/playground/`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForFunction(engineReady, { timeout: 60_000 });
  await sleep(1000);

  // Click a rail/toolbar <button> by the trimmed text of its first <span> (rail
  // buttons carry a trailing count span, so exact textContent won't match).
  const clickRail = (label: string) =>
    page.evaluate((l) => {
      const nav = document.querySelector('[aria-label="Categories"]');
      const btn = [...(nav?.querySelectorAll('button') ?? [])].find(
        (b) => b.querySelector('span')?.textContent?.trim() === l
      );
      if (!btn) throw new Error(`rail button not found: ${l}`);
      (btn as HTMLElement).click();
    }, label);

  // 1. Toolbar button opens the gallery with one card per example.
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Examples'
    );
    if (!el) throw new Error('Examples button not found');
    el.click();
  });
  await page.waitForSelector(gallerySel, { timeout: 5_000 });
  await sleep(300);
  const totalCards = await page.$$eval(cardSel, (els) => els.length);
  if (totalCards !== EXAMPLES.length) fail(`expected ${EXAMPLES.length} cards, got ${totalCards}`);
  console.log(`✓ gallery opens with ${totalCards} cards`);

  // 2. The category rail filters the grid.
  await clickRail(firstCat.label);
  await sleep(200);
  const filtered = await page.$$eval(cardSel, (els) => els.length);
  if (filtered !== firstCat.examples.length) {
    fail(`category '${firstCat.label}': expected ${firstCat.examples.length}, got ${filtered}`);
  }
  console.log(`✓ category '${firstCat.label}' shows ${filtered} cards`);

  // 3. Search narrows the grid (back to All first).
  await clickRail('All');
  await sleep(150);
  const term = firstExample.label.slice(0, 4).toLowerCase();
  await page.type(`${gallerySel} input[aria-label="Search examples"]`, term);
  await sleep(250);
  const searched = await page.$$eval(cardSel, (els) => els.length);
  if (searched < 1 || searched >= EXAMPLES.length) {
    fail(`search '${term}' did not narrow results (got ${searched})`);
  }
  console.log(`✓ search '${term}' narrows to ${searched} cards`);

  // 4. Focus starts inside the dialog and Tab never escapes it.
  const focusInDialog = () =>
    page.evaluate((sel) => {
      const dialog = document.querySelector(sel);
      return !!(dialog && document.activeElement && dialog.contains(document.activeElement));
    }, gallerySel);
  if (!(await focusInDialog())) fail('focus did not start inside the dialog');
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    if (!(await focusInDialog())) fail(`Tab escaped the dialog after ${i + 1} presses`);
  }
  console.log('✓ focus stays trapped within the dialog across 40 Tabs');

  // 5. Clicking a card closes the gallery.
  await page.$eval(cardSel, (el) => (el as HTMLElement).click());
  await sleep(500);
  if (await page.$(gallerySel)) fail('gallery did not close after selecting a card');
  console.log('✓ selecting a card closes the gallery');

  // 6. /examples deep-link opens the gallery.
  await page.goto(`${baseUrl}/playground/examples`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await page.waitForFunction(engineReady, { timeout: 60_000 });
  await page.waitForSelector(gallerySel, { timeout: 5_000 });
  console.log('✓ /examples deep-link opens the gallery');

  // 7. /examples/<id> deep-link focuses that card.
  await page.goto(`${baseUrl}/playground/examples/${firstExample.id}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await page.waitForFunction(engineReady, { timeout: 60_000 });
  await page.waitForSelector(`${gallerySel} button[data-id="${firstExample.id}"]`, {
    timeout: 5_000,
  });
  console.log(`✓ /examples/${firstExample.id} deep-link focuses the card`);

  console.log('\nexample gallery e2e passed');
} finally {
  await browser.close();
}
