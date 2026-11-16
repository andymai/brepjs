import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser, Page } from 'puppeteer';
import { publishPart } from '@/publish/publish.js';
import { CHROME_ARGS } from '@/snapshot/chrome.js';

const fix = (n: string) => fileURLToPath(new URL(`./fixtures/${n}`, import.meta.url));

async function renderAvailable(): Promise<boolean> {
  const runtime = fileURLToPath(new URL('../viewer/dist/publish/index.html', import.meta.url));
  if (!existsSync(runtime)) return false;
  try {
    const puppeteer = (await import('puppeteer')).default;
    return existsSync(await puppeteer.executablePath());
  } catch {
    return false;
  }
}
const canRender = await renderAvailable();

const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
};

// A plain file server with no special headers, below a sub-path, as a static host serves a page.
function serveBelow(prefix: string, root: string): Promise<Server> {
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '').split('?')[0] ?? '');
    const rel = path.startsWith(prefix) ? path.slice(prefix.length) || 'index.html' : null;
    const file = rel === null ? null : join(root, normalize(rel));
    if (file === null || !file.startsWith(root) || !existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

describe.skipIf(!canRender)('a published page', () => {
  let out: string;
  let server: Server;
  let browser: Browser;
  let page: Page;
  let base: string;
  const errors: string[] = [];

  const info = () =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.viewport div')]
        .map((d) => d.innerText)
        .find((t) => t.startsWith('Size'))
        ?.replace(/\s+/g, ' ')
    );
  const waitForInfo = (text: string) =>
    page.waitForFunction(
      (want: string) =>
        [...document.querySelectorAll<HTMLElement>('.viewport div')].some((d) =>
          d.innerText.replace(/\s+/g, ' ').includes(want)
        ),
      { timeout: 60000 },
      text
    );
  const type = (selector: string, value: string) =>
    page.$eval(
      selector,
      (el, v) => {
        // React tracks the value through the element's own setter, so use the native one.
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      },
      value
    );

  beforeAll(async () => {
    out = mkdtempSync(join(tmpdir(), 'brep-publish-page-'));
    const result = await publishPart(fix('paramPlate/plate.brep.ts'), out, { title: 'Plate' });
    expect(result.ok).toBe(true);
    server = await serveBelow('/user/repo/', out);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/user/repo/`;
    const puppeteer = (await import('puppeteer')).default;
    browser = await puppeteer.launch({ headless: true, args: [...CHROME_ARGS] });
    page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(String(e)));
  }, 120000);

  afterAll(async () => {
    await browser?.close();
    server?.close();
    rmSync(out, { recursive: true, force: true });
  });

  it('builds the part at the values in the URL', async () => {
    await page.goto(`${base}?thickness=8&bolt=M4`);
    await waitForInfo('60 × 30 × 8');
    expect(await page.title()).toBe('Plate');
    expect(await page.$eval('#param-bolt', (el) => (el as HTMLSelectElement).value)).toBe('M4');
  }, 120000);

  it('builds again when a value changes, and puts the value in the URL', async () => {
    await type('#param-width', '120');
    await waitForInfo('120 × 30 × 8');
    expect(new URL(page.url()).searchParams.get('width')).toBe('120');
  }, 120000);

  it('keeps the last part and shows the reason when a value does not fit', async () => {
    await type('#param-width', '900');
    await page.waitForSelector('[role="alert"]', { timeout: 60000 });
    expect(await page.$eval('[role="alert"]', (el) => (el as HTMLElement).innerText)).toContain(
      'must be <= 160'
    );
    expect(await info()).toContain('120 × 30 × 8');
  }, 120000);

  it('applies a preset', async () => {
    await page.select('select[aria-label="Preset"]', 'Small');
    await waitForInfo('40 × 20 × 4');
    expect(await page.$('[role="alert"]')).toBeNull();
  }, 120000);

  it('shows the source of each file', async () => {
    await page.evaluate(() => {
      [...document.querySelectorAll('button')].find((b) => b.innerText === 'Source')?.click();
    });
    await page.waitForSelector('.source h2');
    expect(
      await page.$$eval('.source h2', (els) => els.map((el) => (el as HTMLElement).innerText))
    ).toEqual(['lib/holes.ts', 'plate.brep.ts']);
    expect(errors).toEqual([]);
  }, 120000);

  it('builds a part that draws text with the fallback font', async () => {
    const textOut = mkdtempSync(join(tmpdir(), 'brep-publish-text-'));
    const textServer = await serveBelow('/', textOut);
    try {
      const result = await publishPart(fix('engravedText.brep.ts'), textOut);
      expect(result.ok).toBe(true);
      await page.goto(`http://127.0.0.1:${(textServer.address() as AddressInfo).port}/`);
      await waitForInfo('40 × 20 × 3');
      expect(await page.$('[role="alert"]')).toBeNull();
    } finally {
      textServer.close();
      rmSync(textOut, { recursive: true, force: true });
    }
  }, 120000);
});
