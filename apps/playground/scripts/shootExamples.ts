/**
 * Headless screenshotter for playground examples — the visual half of the
 * example quality gate (the eval+mesh half lives in tests/playgroundExamples).
 *
 *   npx tsx scripts/shootExamples.ts <BASE_URL> [outDir] [exampleId ...]
 *
 * Loads each EXAMPLES entry into a running playground via a `?code=` share URL
 * (the exact format the Share button produces — see src/lib/urlCodec.ts),
 * waits for the WASM engine and a render, and writes <outDir>/<id>.png.
 *
 * A shape can pass the eval+mesh test yet still render wrong (off-centre,
 * floating, degenerate) — this is how we catch that. Used both by humans
 * eyeballing tmp/shots and by the scad-to-playground workflow's audit stage,
 * which feeds each PNG to a vision agent.
 *
 * Exits non-zero if any requested example fails to load or render.
 */
import puppeteer from 'puppeteer';
import lzString from 'lz-string';
const { compressToEncodedURIComponent } = lzString;
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { EXAMPLES, type Example } from '../src/lib/examples';

const argv = process.argv.slice(2);
const baseUrl = (argv.find((a) => a.startsWith('http')) ?? 'http://localhost:5173').replace(
  /\/$/,
  ''
);
const outDir = resolve(argv.find((a) => !a.startsWith('http') && !looksLikeId(a)) ?? 'tmp/shots');
const idFilter = argv.filter((a) => !a.startsWith('http') && looksLikeId(a));

function looksLikeId(a: string): boolean {
  return EXAMPLES.some((e) => e.id === a);
}

function shareUrl(code: string): string {
  return `${baseUrl}/playground/?code=${compressToEncodedURIComponent(code)}`;
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
await page.setViewport({ width: 1280, height: 800 });

let failures = 0;
for (const ex of targets) {
  process.stdout.write(`shoot ${ex.id} ... `);
  try {
    await page.goto(shareUrl(ex.code), { waitUntil: 'domcontentloaded', timeout: 30_000 });
    // Engine ready = LoadingOverlay (.absolute.inset-0.z-50) removed; matches
    // scripts/smoke.ts.
    await page.waitForFunction(() => !document.querySelector('.absolute.inset-0.z-50'), {
      timeout: 60_000,
    });
    // The shared link auto-runs; give the viewer time to mesh and frame.
    await new Promise((r) => setTimeout(r, 3500));
    await page.screenshot({ path: resolve(outDir, `${ex.id}.png`) as `${string}.png` });
    console.log('ok');
  } catch (e) {
    failures++;
    console.log(`FAIL: ${(e as Error).message.split('\n')[0]}`);
  }
}

await browser.close();
console.log(`\n${targets.length - failures}/${targets.length} shot → ${outDir}`);
process.exit(failures > 0 ? 1 : 0);
