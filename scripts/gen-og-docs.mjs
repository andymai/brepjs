#!/usr/bin/env node
// Render the docs Open Graph cards from an HTML/CSS template via headless Chrome.
// We use a browser rather than rsvg-convert (scripts/gen-og.sh) because the brand
// display face, Signifier (Klim, licensed), is self-hosted — we inline the local
// woff2 as base64 so the type matches the landing page exactly. Body/mono (Inter,
// DM Mono) load from Google Fonts. The template and render pipeline live in
// lib/ogCard.mjs, shared with the playground example cards.
//
// Produces:
//   apps/docs/public/og.png             — the default/home card
//   apps/docs/public/og/<path>.png      — one templated card per docs page
// config.ts points each page's og:image at its card, falling back to og.png.
import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cardHtml,
  createOgRenderer,
  escapeHtml,
  headlineSize,
  signifierFontCss,
} from './lib/ogCard.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const docsDir = resolve(root, 'apps/docs');
const publicDir = resolve(docsDir, 'public');

const logoSvg = await readFile(resolve(publicDir, 'logo.svg'), 'utf8');
const signifierCss = await signifierFontCss(resolve(publicDir, 'fonts'));
const html = (opts) => cardHtml({ signifierCss, logoSvg, ...opts });

// Path-segment → sidebar section label (mirrors themeConfig.sidebar groups).
const SECTIONS = {
  introduction: 'Introduction',
  'getting-started': 'Getting Started',
  concepts: 'Core Concepts',
  tasks: 'Common Tasks',
  advanced: 'Advanced',
  agent: 'Authoring with AI',
  integration: 'Integration',
  migration: 'Migration',
  compare: 'Compare',
  extending: 'Extending brepjs',
  reference: 'Reference',
};

function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const get = (key) => {
    const r = m[1].match(new RegExp(`^${key}:\\s*(.*)$`, 'm'));
    if (!r) return undefined;
    return r[1].trim().replace(/^["']|["']$/g, '');
  };
  return { title: get('title'), description: get('description') };
}

async function mdFiles(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const p = resolve(dir, e.name);
    if (e.isDirectory()) out.push(...(await mdFiles(p)));
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

const { render, close } = await createOgRenderer();
try {
  // Default / home card.
  await render(
    html({
      eyebrow: 'Exact B-Rep · TypeScript · Browser-native',
      headlineHtml: 'Exact CAD geometry,<br /><span class="grad">written in TypeScript.</span>',
      hSize: 64,
      subhead: 'A real B-Rep kernel in your browser — type-safe and STEP-accurate.',
    }),
    resolve(publicDir, 'og.png')
  );
  console.warn('wrote og.png (home)');

  // One templated card per docs page.
  const files = (await mdFiles(docsDir)).filter((f) => relative(docsDir, f) !== 'index.md');
  let n = 0;
  for (const file of files) {
    const rel = relative(docsDir, file).replace(/\.md$/, '');
    const { title, description } = parseFrontmatter(await readFile(file, 'utf8'));
    if (!title) {
      console.warn(`skip (no title): ${rel}`);
      continue;
    }
    const section = SECTIONS[rel.split('/')[0]] ?? 'brepjs docs';
    await render(
      html({
        eyebrow: section,
        headlineHtml: escapeHtml(title),
        hSize: headlineSize(title),
        subhead: description ?? '',
      }),
      resolve(publicDir, 'og', `${rel}.png`)
    );
    n++;
  }
  console.warn(`wrote ${n} per-page cards to public/og/`);
} finally {
  await close();
}
