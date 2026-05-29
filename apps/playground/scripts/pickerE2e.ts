/**
 * Headless e2e for the example picker, mirroring scripts/smoke.ts (standalone,
 * runs against a dev/preview URL, exits 0 on success / 1 on failure).
 *
 *   npx tsx scripts/pickerE2e.ts <BASE_URL>
 *
 * Verifies: the toolbar button opens the modal, cards render, a category pill
 * filters the grid, and clicking a card closes the modal. No jsdom — this is
 * the playground's testing style (smoke, shootExamples) for browser-only
 * behaviour. Uses puppeteer's page.evaluate to drive the live DOM.
 */
import puppeteer from 'puppeteer';
import { CATEGORIES } from '../src/lib/examples';

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

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(`${baseUrl}/playground/`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForFunction(() => !document.querySelector('.absolute.inset-0.z-50'), {
    timeout: 60_000,
  });
  await new Promise((r) => setTimeout(r, 1000));

  // Click a <button> by its visible text in the live DOM.
  const clickByText = (text: string) =>
    page.evaluate((t) => {
      const el = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === t);
      if (!el) throw new Error(`button not found: ${t}`);
      el.click();
    }, text);

  const pickerSel = '[aria-label="Example picker"]';

  // 1. Toolbar button opens the modal with one card per example.
  await clickByText('Examples');
  await page.waitForSelector(pickerSel, { timeout: 5_000 });
  await new Promise((r) => setTimeout(r, 300));
  const totalCards = await page.$$eval(`${pickerSel} img`, (els) => els.length);
  const totalExamples = CATEGORIES.reduce((n, c) => n + c.examples.length, 0);
  if (totalCards !== totalExamples) {
    fail(`expected ${totalExamples} cards, got ${totalCards}`);
  }
  console.log(`✓ modal opens with ${totalCards} cards`);

  // 2. A category pill filters the grid.
  const firstCat = CATEGORIES[0];
  await clickByText(firstCat.label);
  await new Promise((r) => setTimeout(r, 200));
  const filtered = await page.$$eval(`${pickerSel} img`, (els) => els.length);
  if (filtered !== firstCat.examples.length) {
    fail(`filter '${firstCat.label}': expected ${firstCat.examples.length}, got ${filtered}`);
  }
  console.log(`✓ filter '${firstCat.label}' shows ${filtered} cards`);

  // 3. Focus trap: focus starts inside the dialog, and Tab never escapes it.
  const focusInDialog = () =>
    page.evaluate((sel) => {
      const dialog = document.querySelector(sel);
      return !!(dialog && document.activeElement && dialog.contains(document.activeElement));
    }, pickerSel);
  if (!(await focusInDialog())) fail('focus did not move into the dialog on open');
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    if (!(await focusInDialog())) fail(`Tab escaped the dialog after ${i + 1} presses`);
  }
  console.log('✓ focus stays trapped within the dialog across 40 Tabs');

  // 4. Clicking a card closes the modal.
  await page.$eval(`${pickerSel} button[class*="group"]`, (el) => (el as HTMLElement).click());
  await new Promise((r) => setTimeout(r, 500));
  const stillOpen = await page.$(pickerSel);
  if (stillOpen) fail('modal did not close after selecting a card');
  console.log('✓ selecting a card closes the modal');

  console.log('\nexample picker e2e passed');
} finally {
  await browser.close();
}
