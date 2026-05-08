/**
 * Headless smoke test for the production / preview playground.
 *
 *   npx tsx scripts/smoke.ts <BASE_URL>
 *
 * Loads `<BASE_URL>/playground` and waits up to 60s for the WASM kernel
 * to reach the `Ready` state (LoadingOverlay disappears). Exits 0 on
 * success, 1 on failure with captured browser console errors. Designed
 * to gate Vercel preview deployments — any CSP, COEP, or asset
 * regression that blocks engine init will fail this check.
 */
import puppeteer from 'puppeteer';

const baseUrl = (process.argv[2] ?? process.env.BASE_URL ?? 'http://localhost:5173').replace(
  /\/$/,
  ''
);
const target = `${baseUrl}/playground`;
const ENGINE_READY_TIMEOUT_MS = 60_000;
const NAV_TIMEOUT_MS = 30_000;

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();

const errors: string[] = [];
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) =>
  errors.push(`[netfail] ${r.url()} — ${r.failure()?.errorText ?? 'unknown'}`)
);
page.on('response', (r) => {
  if (r.status() >= 400 && !r.url().endsWith('/hero-mesh.bin')) {
    errors.push(`[net ${r.status()}] ${r.url()}`);
  }
});
page.on('console', (m) => {
  // Capture only errors. WebGL warnings on headless runners are noisy and
  // expected — those don't affect the engine's ability to reach Ready.
  if (m.type() === 'error' && !m.text().includes('WebGL')) {
    errors.push(`[console.error] ${m.text()}`);
  }
});

console.log(`Loading ${target}...`);
try {
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
} catch (e) {
  console.error(`✗ Navigation to ${target} failed: ${(e as Error).message}`);
  for (const err of errors) console.error(err);
  await browser.close();
  process.exit(1);
}

console.log(`Waiting up to ${ENGINE_READY_TIMEOUT_MS / 1000}s for engine ready...`);
try {
  // LoadingOverlay class signature must stay in sync with
  // apps/playground/src/components/playground/LoadingOverlay.tsx.
  await page.waitForFunction(
    () => !document.querySelector('.absolute.inset-0.z-50'),
    { timeout: ENGINE_READY_TIMEOUT_MS }
  );
  console.log('✓ Engine reached Ready');
  await browser.close();
  process.exit(0);
} catch (e) {
  console.error(`✗ Engine did not reach Ready within ${ENGINE_READY_TIMEOUT_MS / 1000}s`);
  console.error(`  Reason: ${(e as Error).message}`);
  if (errors.length > 0) {
    console.error('--- captured browser errors ---');
    for (const err of errors) console.error(err);
  } else {
    console.error('  (no errors captured — page may be slow or selector outdated)');
  }
  await browser.close();
  process.exit(1);
}
