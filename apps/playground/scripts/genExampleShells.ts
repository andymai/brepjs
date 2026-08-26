/**
 * Emit dist/examples/<id>.html — copies of the built index.html with
 * per-example meta — so example permalinks unfurl with their own title,
 * description, and OG card. Vercel serves static files before rewrites and
 * cleanUrls maps /playground/examples/<id> to <id>.html, so known ids get
 * their shell while unknown paths still reach the SPA via the
 * /playground/examples/:path → index.html rewrite. Runs as the last step of
 * `npm run build`.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXAMPLES } from '../src/lib/examples/index.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(scriptDir, '../dist');
const ogDir = resolve(scriptDir, '../public/og');
const SITE = 'https://brepjs.dev';

const attrEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Each helper throws unless its pattern matches exactly once, so copy edits to
// index.html fail the build here instead of shipping shells with stale meta.
function subOnce(html: string, re: RegExp, what: string, apply: () => string): string {
  const count = (html.match(new RegExp(re.source, `${re.flags.replace('g', '')}g`)) ?? []).length;
  if (count !== 1) throw new Error(`expected exactly one ${what} in index.html, found ${count}`);
  return apply();
}
const setTitle = (html: string, value: string) =>
  subOnce(html, /<title>[^<]*<\/title>/, '<title>', () =>
    html.replace(/<title>[^<]*<\/title>/, () => `<title>${value}</title>`)
  );
const setMeta = (html: string, key: string, value: string) => {
  const re = new RegExp(`(<meta[^>]*(?:property|name)="${key}"[^>]*content=")[^"]*(")`);
  return subOnce(html, re, `<meta ${key}>`, () =>
    html.replace(re, (_, pre: string, post: string) => `${pre}${value}${post}`)
  );
};
const setCanonical = (html: string, value: string) => {
  const re = /(<link[^>]*rel="canonical"[^>]*href=")[^"]*(")/;
  return subOnce(html, re, 'canonical link', () =>
    html.replace(re, (_, pre: string, post: string) => `${pre}${value}${post}`)
  );
};

const base = await readFile(resolve(distDir, 'index.html'), 'utf8');
await mkdir(resolve(distDir, 'examples'), { recursive: true });

for (const example of EXAMPLES) {
  const url = `${SITE}/playground/examples/${example.id}`;
  const title = attrEscape(`${example.label} | brepjs Playground`);
  const description = attrEscape(example.description);
  const image = existsSync(resolve(ogDir, `${example.id}.png`))
    ? `${SITE}/playground/og/${example.id}.png`
    : `${SITE}/playground/og.png`;

  let html = base;
  html = setTitle(html, title);
  html = setMeta(html, 'description', description);
  html = setCanonical(html, url);
  html = setMeta(html, 'og:url', url);
  html = setMeta(html, 'og:title', title);
  html = setMeta(html, 'og:description', description);
  html = setMeta(html, 'og:image', image);
  html = setMeta(html, 'og:image:alt', attrEscape(`${example.label}, rendered in the brepjs Playground`));
  html = setMeta(html, 'twitter:title', title);
  html = setMeta(html, 'twitter:description', description);
  html = setMeta(html, 'twitter:image', image);
  await writeFile(resolve(distDir, 'examples', `${example.id}.html`), html);
}
console.warn(`wrote ${EXAMPLES.length} example shells to dist/examples/`);
