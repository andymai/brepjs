/**
 * Headless check of the /mesh-to-solid page against a preview or deployed origin.
 * Exits 0 when every step passes and 1 when one fails.
 *
 *   npm run e2e --workspace=apps/mesh2solid -- <ORIGIN> [--shots <dir>] [--playground [ORIGIN]]
 *
 * Steps: each sample converts to the expected kind of result, a file from disk
 * goes through the unit confirmation, a cancel leaves a working page, and the
 * distance map shows. `--shots` writes a picture of each sample result.
 * `--playground` also opens the generated program in the playground. Without an
 * origin of its own, the playground must be on the same origin as the page.
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer, { type Page } from 'puppeteer';
import { HANDOFF_KEY } from '../src/playground.js';
import { SAMPLES } from '../src/samples.js';

const args = process.argv.slice(2);
const origin = (args[0]?.startsWith('http') ? args[0] : 'http://localhost:4173').replace(/\/$/, '');
const shotsAt = args.indexOf('--shots');
const shots = shotsAt === -1 ? null : resolve(args[shotsAt + 1] ?? 'shots');
const playgroundAt = args.indexOf('--playground');
const withPlayground = playgroundAt !== -1;
const playgroundOrigin = args[playgroundAt + 1]?.startsWith('http')
  ? (args[playgroundAt + 1] ?? origin).replace(/\/$/, '')
  : origin;
const here = dirname(fileURLToPath(import.meta.url));

const EXPECTED: Record<string, string> = {
  'bracket.stl': 'Rebuilt as a feature program',
  'knob-scan.ply': 'Rebuilt as a feature program',
  'blob.obj': 'Rebuilt from exact surfaces',
};

// Text that only the program of that sample has, without white space.
const PROGRAM_MARKER: Record<string, string> = {
  'bracket.stl': 'box(60,30,6)',
  'knob-scan.ply': 'threePointArc(',
};

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
const pass = (msg: string) => console.log(`✓ ${msg}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const clickButton = (page: Page, text: string) =>
  page.evaluate((t) => {
    const el = [...document.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === t || b.querySelector('.sample-title')?.textContent === t
    );
    if (!el) throw new Error(`no button "${t}"`);
    el.click();
  }, text);

const reportTitle = (page: Page) =>
  page.$eval('[aria-label="Conversion report"] h2', (h) => h.textContent ?? '');

async function waitForResult(page: Page): Promise<void> {
  await page.waitForFunction(
    () => document.querySelector('.result') !== null || document.querySelector('.error') !== null,
    { timeout: 180_000 }
  );
  const error = await page.$eval('.error', (e) => e.textContent).catch(() => null);
  if (error !== null) fail(`the page reported: ${error}`);
}

try {
  const page = await browser.newPage();
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(String(e)));
  page.on('console', (m) => {
    // A failed request is reported with its address by the response listener.
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource'))
      problems.push(m.text());
  });
  page.on('response', (r) => {
    // Vercel serves the analytics script. A local preview does not have it.
    if (r.status() >= 400 && !r.url().includes('/_vercel/'))
      problems.push(`${r.status()} ${r.url()}`);
  });
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(`${origin}/mesh-to-solid/`, { waitUntil: 'networkidle2', timeout: 60_000 });

  const cards = await page.$$eval('button.sample', (b) => b.length);
  if (cards !== SAMPLES.length) fail(`expected ${SAMPLES.length} samples, the page shows ${cards}`);
  const broken = await page.$$eval(
    'img',
    (imgs) => imgs.filter((i) => i.complete && i.naturalWidth === 0).length
  );
  if (broken > 0 && shots === null) fail(`${broken} pictures did not load`);
  pass(`the page shows ${cards} samples`);

  if (shots !== null) mkdirSync(shots, { recursive: true });
  const programs: { file: string; href: string; code: string }[] = [];
  for (const sample of SAMPLES) {
    await clickButton(page, sample.title);
    await waitForResult(page);
    const title = await reportTitle(page);
    if (title !== EXPECTED[sample.file]) fail(`${sample.file}: got "${title}"`);
    const report = await page.$eval('[aria-label="Conversion report"]', (p) => p.textContent ?? '');
    if (!report.includes('Closed solid')) fail(`${sample.file}: the result is not a closed solid`);
    const step = await page.$$eval('[aria-label="Downloads"] button', (b) =>
      b.some((x) => x.textContent === 'STEP' && !x.disabled)
    );
    if (!step) fail(`${sample.file}: no STEP download`);
    if (sample.file === 'knob-scan.ply') {
      await clickButton(page, 'Distance to mesh');
      await page.waitForSelector('.legend', { timeout: 10_000 });
      await clickButton(page, 'Solid');
    }
    if (EXPECTED[sample.file] === 'Rebuilt as a feature program') {
      // The link hands the program over through localStorage. Stop the new tab
      // here, so the playground step can open its own.
      const handoff = await page.evaluate((prefix) => {
        const link = document.querySelector<HTMLAnchorElement>('[aria-label="Downloads"] a.button');
        if (!link) return null;
        link.addEventListener('click', (e) => e.preventDefault(), { once: true });
        link.click();
        const href = link.getAttribute('href') ?? '';
        const id = href.split('#handoff/')[1] ?? '';
        return { href, code: localStorage.getItem(prefix + id) ?? '' };
      }, HANDOFF_KEY);
      if (!handoff?.href.startsWith('/playground#handoff/') || handoff.code.trim() === '')
        fail(`${sample.file}: the playground link hands over no program`);
      else programs.push({ file: sample.file, ...handoff });
    }
    if (shots !== null) {
      await page.addStyleTag({ content: '.view-toggle { visibility: hidden; }' });
      await sleep(1500);
      const viewer = await page.$('.viewer canvas');
      await viewer?.screenshot({ path: resolve(shots, `${sample.file}.png`) as `${string}.png` });
      await page.screenshot({ path: resolve(shots, `${sample.file}.page.png`) as `${string}.png` });
    }
    pass(`${sample.file}: ${title.toLowerCase()}`);
    await clickButton(page, 'Convert another file');
  }

  // A file from disk stops at the unit confirmation.
  const input = await page.$('input[type=file]');
  await input?.uploadFile(resolve(here, '../public/samples/bracket.stl'));
  await page.waitForSelector('[aria-label="Confirm units"]', { timeout: 30_000 });
  const confirm = await page.$eval('[aria-label="Confirm units"]', (p) => p.textContent ?? '');
  if (!confirm.includes('STL, 1,044 triangles')) fail(`unit confirmation shows: ${confirm}`);
  if (!confirm.includes('60 × 30 × 40 mm')) fail(`unit confirmation has no size: ${confirm}`);
  await clickButton(page, 'Convert');
  await waitForResult(page);
  pass('a file from disk converts after the unit confirmation');
  await clickButton(page, 'Convert another file');

  // A cancel replaces the worker. The page must convert again after it.
  await clickButton(page, 'Scanned knob');
  await page.waitForFunction(
    () => [...document.querySelectorAll('button')].some((b) => b.textContent === 'Cancel'),
    { timeout: 30_000 }
  );
  await clickButton(page, 'Cancel');
  await page.waitForSelector('.drop', { timeout: 5_000 });
  if ((await page.$('.error')) !== null) fail('a cancel shows an error');
  await clickButton(page, 'Bracket');
  await waitForResult(page);
  pass('a cancel leaves a page that converts again');

  const tabs: { file: string; tab: Page }[] = [];
  for (const program of withPlayground ? programs : []) {
    const tab = await browser.newPage();
    await tab.setViewport({ width: 1280, height: 800 });
    const id = program.href.split('#handoff/')[1] ?? '';
    const seed = await tab.evaluateOnNewDocument(
      (key, code) => localStorage.setItem(key, code),
      HANDOFF_KEY + id,
      program.code
    );
    // A Vite server needs the slash after its base. Vercel serves both forms.
    await tab.goto(`${playgroundOrigin}${program.href.replace('#', '/#')}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    // The seed is for the first load only. A reload must read what is in storage.
    await tab.removeScriptToEvaluateOnNewDocument(seed.identifier);
    // The loading overlay goes when the engine is ready. The status bar shows
    // a time in milliseconds only after a run that made a shape.
    await tab.waitForFunction(() => !document.querySelector('.absolute.inset-0.z-50'), {
      timeout: 120_000,
    });
    await tab
      .waitForFunction(
        () =>
          [...document.querySelectorAll('[role="status"]')].some(
            (b) => b.textContent?.includes('OCCT') && /\d+\s*ms/.test(b.textContent ?? '')
          ),
        { timeout: 60_000 }
      )
      .catch(() => fail(`${program.file}: the playground did not run the generated program`));
    // The program must not be in the address, which goes to the server.
    if ((await tab.evaluate(() => location.search)) !== '')
      fail(`${program.file}: the playground address holds the program`);
    if (shots !== null) {
      await sleep(1000);
      await tab.screenshot({
        path: resolve(shots, `${program.file}.playground.png`) as `${string}.png`,
      });
    }
    tabs.push({ file: program.file, tab });
    pass(`${program.file}: the playground runs the generated program`);
  }

  // Each handoff has its own entry. A reload of the first tab must show the
  // first program again, not the one that a later tab opened.
  const first = tabs[0];
  if (first !== undefined && tabs.length > 1) {
    // Chrome slows a tab that is not in front.
    await first.tab.bringToFront();
    await first.tab.reload({ waitUntil: 'domcontentloaded' });
    await first.tab.waitForFunction(() => !document.querySelector('.absolute.inset-0.z-50'), {
      timeout: 120_000,
    });
    await first.tab
      .waitForFunction(
        (marker) =>
          (document.querySelector('.monaco-editor')?.textContent ?? '')
            .replace(/\s/g, '')
            .includes(marker),
        { timeout: 30_000 },
        PROGRAM_MARKER[first.file] ?? ''
      )
      .catch(() => fail(`${first.file}: a reload of its playground tab shows another program`));
    pass(`${first.file}: a reload of its playground tab keeps its program`);
  }
  for (const { tab } of tabs) await tab.close();

  if (problems.length > 0) fail(`browser errors:\n  ${problems.join('\n  ')}`);
  console.log('all steps passed');
} catch (e) {
  if (process.exitCode !== 1) {
    console.error(e);
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
