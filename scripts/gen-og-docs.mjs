#!/usr/bin/env node
// Render the docs Open Graph cards from an HTML/CSS template via headless Chrome.
// We use a browser rather than rsvg-convert (scripts/gen-og.sh) because the
// brand display face, Space Grotesk, isn't installed locally — Chrome fetches it
// from Google Fonts so the type matches the landing page exactly.
//
// Produces:
//   apps/docs/public/og.png             — the default/home card
//   apps/docs/public/og/<path>.png      — one templated card per docs page
// Each is rendered at 2x then downscaled (crisp edges) and palette-quantized.
// config.ts points each page's og:image at its card, falling back to og.png.
import puppeteer from 'puppeteer';
import sharp from 'sharp';
import { readFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const docsDir = resolve(root, 'apps/docs');
const publicDir = resolve(docsDir, 'public');
const W = 1200;
const H = 630;
const SCALE = 2;

const logoSvg = await readFile(resolve(publicDir, 'logo.svg'), 'utf8');

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
  extending: 'Extending brepjs',
  reference: 'Reference',
};

// Exploded scissors-congruent decomposition of a cube — the landing hero motif.
// Real edged B-Rep faces (white strokes), teal-shaded. From hero-poster.svg.
const orthoscheme = `
<svg viewBox="0 0 440 440" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="hcA" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#A8E8E8"/><stop offset="100%" stop-color="#4ACECC"/></linearGradient>
    <linearGradient id="hcB" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#7ADBDD"/><stop offset="100%" stop-color="#03B0AD"/></linearGradient>
    <linearGradient id="hcC" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#4ACECC"/><stop offset="100%" stop-color="#0C8698"/></linearGradient>
    <linearGradient id="hcD" x1="0" y1="1" x2="1" y2="0"><stop offset="0%" stop-color="#0C8698"/><stop offset="100%" stop-color="#03B0AD"/></linearGradient>
    <linearGradient id="hcE" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#03B0AD"/><stop offset="100%" stop-color="#07606F"/></linearGradient>
    <linearGradient id="hcF" x1="0" y1="1" x2="1" y2="0"><stop offset="0%" stop-color="#7ADBDD"/><stop offset="100%" stop-color="#0C8698"/></linearGradient>
  </defs>
  <g stroke="#ffffff" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">
    <polygon points="158,108 232,86 196,162 138,178" fill="url(#hcA)"/>
    <polygon points="246,76 322,128 282,164 224,144" fill="url(#hcB)"/>
    <polygon points="318,176 372,222 322,272 290,222" fill="url(#hcC)"/>
    <polygon points="248,278 304,308 258,366 218,322" fill="url(#hcD)"/>
    <polygon points="116,272 188,260 198,330 134,344" fill="url(#hcE)"/>
    <polygon points="76,178 142,196 158,254 92,250" fill="url(#hcF)"/>
  </g>
</svg>`;

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Shrink the headline as the title grows so long titles still fit one column.
const headlineSize = (text) => {
  const n = text.length;
  if (n <= 16) return 66;
  if (n <= 26) return 56;
  if (n <= 38) return 48;
  return 40;
};

function html({ eyebrow, headlineHtml, hSize, subhead }) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500&family=Inter:wght@400;500&display=block" rel="stylesheet" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${W}px; height: ${H}px; }
  .card {
    position: relative; width: ${W}px; height: ${H}px; overflow: hidden;
    background-color: #080b0e;
    background-image:
      radial-gradient(120% 86% at 82% 4%, rgba(3, 176, 173, 0.18), transparent 56%),
      radial-gradient(78% 62% at 4% 104%, rgba(7, 96, 111, 0.18), transparent 52%),
      linear-gradient(rgba(255, 255, 255, 0.028) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.028) 1px, transparent 1px);
    background-size: 100% 100%, 100% 100%, 36px 36px, 36px 36px;
    font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
    color: #f1f6f7; -webkit-font-smoothing: antialiased;
  }
  .topline { position: absolute; top: 0; left: 0; right: 0; height: 4px;
    background: linear-gradient(90deg, transparent, #03b0ad 28%, #4acecc 60%, transparent); opacity: 0.8; }
  .brand { position: absolute; top: 52px; left: 72px; display: flex; align-items: center; gap: 13px;
    font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 30px; letter-spacing: -0.01em; }
  .brand svg { width: 36px; height: 36px; display: block; }
  .content { position: absolute; left: 72px; top: 0; bottom: 0; width: 700px;
    display: flex; flex-direction: column; justify-content: center; }
  .eyebrow { font-family: 'JetBrains Mono', monospace; font-weight: 500; font-size: 16px;
    letter-spacing: 0.2em; text-transform: uppercase; color: #7adbdd; margin-bottom: 22px; }
  .headline { font-family: 'Space Grotesk', sans-serif; font-weight: 600;
    font-size: ${hSize}px; line-height: 1.05; letter-spacing: -0.022em; }
  .headline .grad { background: linear-gradient(118deg, #07606f 0%, #03b0ad 36%, #4acecc 72%, #7adbdd 100%);
    -webkit-background-clip: text; background-clip: text; color: transparent; }
  .subhead { margin-top: 24px; max-width: 580px; font-size: 21px; line-height: 1.45; color: #aab6bd;
    display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .foot { position: absolute; left: 72px; bottom: 50px; display: flex; align-items: center; gap: 14px;
    font-family: 'JetBrains Mono', monospace; font-size: 15px; letter-spacing: 0.03em; color: #828d96; }
  .foot .dom { color: #aab6bd; }
  .geo-glow { position: absolute; right: -40px; top: 50%; width: 560px; height: 560px;
    transform: translateY(-50%); background: radial-gradient(circle at 50% 50%, rgba(3, 176, 173, 0.20), transparent 62%); }
  .geo { position: absolute; right: 20px; top: 50%; width: 420px; height: 420px;
    transform: translateY(-50%) rotate(-2deg); filter: drop-shadow(0 26px 70px rgba(3, 176, 173, 0.22)); }
  .geo svg { width: 100%; height: 100%; display: block; }
</style>
</head>
<body>
  <div class="card">
    <div class="topline"></div>
    <div class="brand">${logoSvg}<span>brepjs</span></div>
    <div class="geo-glow"></div>
    <div class="geo">${orthoscheme}</div>
    <div class="content">
      <div class="eyebrow">${escapeHtml(eyebrow)}</div>
      <div class="headline">${headlineHtml}</div>
      ${subhead ? `<div class="subhead">${escapeHtml(subhead)}</div>` : ''}
    </div>
    <div class="foot"><span class="dom">brepjs.dev</span></div>
  </div>
</body>
</html>`;
}

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

// Prefer a system Chrome (what the committed cards were rendered with) but fall
// back to puppeteer's bundled browser so `npm run gen:og` also works on macOS
// and Chromium-only Linux.
const systemChrome = [
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
].find((p) => existsSync(p));
const browser = await puppeteer.launch({
  ...(systemChrome ? { executablePath: systemChrome } : {}),
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--force-color-profile=srgb', '--hide-scrollbars'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: SCALE });

  const render = async (markup, outPath) => {
    // 'load' (not 'networkidle0' — Google Fonts holds a keep-alive connection
    // that never goes idle) plus an explicit fonts.ready wait below.
    await page.setContent(markup, { waitUntil: 'load' });
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const shot = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: W, height: H } });
    await mkdir(dirname(outPath), { recursive: true });
    await sharp(shot)
      .resize(W, H, { kernel: 'lanczos3' })
      .png({ compressionLevel: 9, palette: true, quality: 92, dither: 1 })
      .toFile(outPath);
  };

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
  await browser.close();
}
