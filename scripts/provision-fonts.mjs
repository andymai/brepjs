/**
 * Provision licensed brand fonts (Signifier, Klim) into the docs `public/fonts/`
 * directory at build time, from Vercel Blob.
 *
 * Why: Klim's Web Font Licence §3d forbids exposing the font files for direct
 * download, and this repo is public + Apache-2.0 — so the woff2 are gitignored
 * and never committed. The deployed site serves them from `/fonts/`; here we
 * pull them into the build container from a private source.
 *
 * Setup (one-time):
 *   1. Create a Vercel Blob store (Storage tab) and upload the three woff2:
 *        signifier-regular.woff2, signifier-italic.woff2, signifier-medium.woff2
 *   2. Add a Vercel env var `FONT_BLOB_URLS` = the three blob URLs, comma-separated.
 *   3. (Private store only) `BLOB_READ_WRITE_TOKEN` is auto-added by Vercel and is
 *      used here to authorize the download.
 *
 * No `FONT_BLOB_URLS` (local dev, forks, fork PRs) → no-op, and the landing falls
 * back to the `Georgia, serif` stack. Drop the licensed woff2 into
 * apps/docs/public/fonts/ locally to preview the real face.
 *
 * Dependency-free: uses Node's global fetch (Node >= 24).
 */
import { mkdir, writeFile } from 'node:fs/promises';

const DIR = 'apps/docs/public/fonts';
const urls = (process.env.FONT_BLOB_URLS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const token = process.env.BLOB_READ_WRITE_TOKEN; // required for private-store downloads

// Map each source blob to a canonical filename the CSS @font-face expects.
// Order matters: "regular-italic" must match `italic` before `regular`.
const TARGETS = [
  { test: /italic/i, out: 'signifier-italic.woff2' },
  { test: /medium/i, out: 'signifier-medium.woff2' },
  { test: /regular/i, out: 'signifier-regular.woff2' },
];

if (urls.length === 0) {
  console.warn('[fonts] FONT_BLOB_URLS not set — skipping (Georgia fallback).');
  process.exit(0);
}

await mkdir(DIR, { recursive: true });

let count = 0;
for (const url of urls) {
  const parsed = new URL(url);
  const base = decodeURIComponent(parsed.pathname.split('/').pop() ?? '');
  const target = TARGETS.find((t) => t.test.test(base));
  if (!target) throw new Error(`[fonts] cannot map blob URL to a known weight: ${base}`);

  // Decide auth by the parsed hostname, not a substring of the whole URL — a
  // substring check could be fooled by an attacker-controlled path/query and
  // leak the token to an arbitrary host.
  const isPrivate = parsed.hostname.endsWith('.private.blob.vercel-storage.com');
  const headers = isPrivate && token ? { authorization: `Bearer ${token}` } : {};
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`[fonts] download failed for ${target.out}: ${res.status}`);

  await writeFile(`${DIR}/${target.out}`, Buffer.from(await res.arrayBuffer()));
  console.log(`[fonts] ✓ ${target.out}`);
  count++;
}

console.log(`[fonts] provisioned ${count} font(s) into ${DIR}`);
