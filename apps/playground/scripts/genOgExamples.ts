/**
 * Render a branded 1200x630 Open Graph card per playground example into
 * public/og/<id>.png (committed, like the docs cards). Each card composites the
 * example's gallery thumbnail (public/example-thumbs/<id>.webp) onto the brand
 * template from scripts/lib/ogCard.mjs; genExampleShells.ts points each
 * permalink's og:image at it.
 *
 *   npm run og            — all examples
 *   npm run og -- <id...> — just those ids
 *
 * Requires the licensed Signifier woff2 in apps/docs/public/fonts (gitignored;
 * see that folder's README) and an example thumbnail — run `npm run thumbs`
 * first for new examples.
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES } from '../src/lib/examples/index.js';
import {
  cardHtml,
  createOgRenderer,
  escapeHtml,
  headlineSize,
  signifierFontCss,
} from '../../../scripts/lib/ogCard.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(scriptDir, '../public');
const docsPublic = resolve(scriptDir, '../../docs/public');

const only = new Set(process.argv.slice(2));

const logoSvg = await readFile(resolve(docsPublic, 'logo.svg'), 'utf8');
const signifierCss = await signifierFontCss(resolve(docsPublic, 'fonts'));

const { render, close } = await createOgRenderer();
try {
  let n = 0;
  for (const category of CATEGORIES) {
    for (const example of category.examples) {
      if (only.size > 0 && !only.has(example.id)) continue;
      const thumb = resolve(publicDir, 'example-thumbs', `${example.id}.webp`);
      if (!existsSync(thumb))
        throw new Error(`No thumbnail for '${example.id}' — run \`npm run thumbs\` first.`);
      const dataUri = `data:image/webp;base64,${(await readFile(thumb)).toString('base64')}`;
      await render(
        cardHtml({
          signifierCss,
          logoSvg,
          eyebrow: `Playground · ${category.label}`,
          headlineHtml: escapeHtml(example.label),
          hSize: headlineSize(example.label),
          subhead: example.description,
          contentWidth: 620,
          visualHtml: `<div class="geo-glow"></div><div class="thumb"><img src="${dataUri}" alt="" /></div>`,
          footHtml: `<span class="dom">brepjs.dev</span><span>/playground/examples/${example.id}</span>`,
        }),
        resolve(publicDir, 'og', `${example.id}.png`)
      );
      n++;
    }
  }
  console.warn(`wrote ${n} example cards to public/og/`);
} finally {
  await close();
}
