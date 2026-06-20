#!/usr/bin/env node
// Render the r/brepjs community banners from an HTML/CSS template via headless
// Chrome. Mirrors scripts/gen-og-docs.mjs: the brand display face Signifier
// (Klim, licensed) is self-hosted and inlined as base64; Inter + DM Mono load
// from Google Fonts. Type matches brepjs.dev exactly.
//
// Produces (sized for Reddit's "small" 128px-tall community banner):
//   branding/reddit/banner-desktop.png  — 1072 x 128
//   branding/reddit/banner-mobile.png   — 1080 x 128
// Each is rendered at 2x then downscaled (crisp white B-Rep edges) and
// palette-quantized to stay well under Reddit's 500 KB cap.
import puppeteer from 'puppeteer';
import sharp from 'sharp';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = resolve(root, 'apps/docs/public');
const outDir = resolve(root, 'branding/reddit');
const SCALE = 2;

const TARGETS = [
  { name: 'banner-desktop', w: 1072, h: 128 },
  { name: 'banner-mobile', w: 1080, h: 128 },
];

const logoSvg = await readFile(resolve(publicDir, 'logo.svg'), 'utf8');

// Real brepjs output: a flanged pipe tee whose perpendicular run/branch fusion
// yields the saddle boolean seam. Authored as branding/reddit/part/pipe-tee.brep.ts,
// rendered through brepjs-cad's snapshot pipeline, then luminance-keyed onto the
// brand teal ramp by branding/reddit/part/processPart.mjs.
const partPng = await readFile(resolve(root, 'branding/reddit/part/part-teal.png'));
const partDataUri = `data:image/png;base64,${partPng.toString('base64')}`;

// Signifier is licensed + self-hosted — inline the local woff2 (see OG generator).
const fontFile = (f) => resolve(publicDir, 'fonts', f);
for (const f of ['signifier-regular.woff2', 'signifier-medium.woff2']) {
  if (!existsSync(fontFile(f)))
    throw new Error(`Missing ${f} in apps/docs/public/fonts — license Signifier to regenerate the banner.`);
}
const fontFace = async (file, weight) =>
  `@font-face{font-family:'Signifier';src:url(data:font/woff2;base64,${(
    await readFile(fontFile(file))
  ).toString('base64')}) format('woff2');font-weight:${weight};font-style:normal;font-display:block;}`;
const signifierCss = [
  await fontFace('signifier-regular.woff2', 400),
  await fontFace('signifier-medium.woff2', 500),
].join('\n');

function html({ w, h }) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=DM+Mono:wght@400;500&display=block" rel="stylesheet" />
<style>
  ${signifierCss}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${w}px; height: ${h}px; }
  .banner {
    position: relative; width: ${w}px; height: ${h}px; overflow: hidden;
    background-color: #080b0e;
    background-image:
      radial-gradient(70% 180% at 80% 50%, rgba(3, 176, 173, 0.20), transparent 60%),
      radial-gradient(60% 160% at 8% 120%, rgba(7, 96, 111, 0.16), transparent 55%),
      linear-gradient(rgba(255, 255, 255, 0.026) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.026) 1px, transparent 1px);
    background-size: 100% 100%, 100% 100%, 26px 26px, 26px 26px;
    font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
    color: #f1f6f7; -webkit-font-smoothing: antialiased;
  }
  .topline { position: absolute; top: 0; left: 0; right: 0; height: 3px;
    background: linear-gradient(90deg, transparent, #03b0ad 26%, #4acecc 58%, #7adbdd 78%, transparent); opacity: 0.85; }

  /* Brand block — held in the center-left safe zone, clear of Reddit's
     community-icon overlay at the far left. */
  .brand { position: absolute; left: 132px; top: 50%; transform: translateY(-50%); }
  .wordmark { display: flex; align-items: center; gap: 13px; }
  .wordmark svg { width: 36px; height: 36px; display: block; }
  .wordmark span { font-family: 'Signifier', Georgia, serif; font-weight: 500;
    font-size: 40px; letter-spacing: -0.01em; line-height: 1; }
  .tagline { margin-top: 11px; font-family: 'DM Mono', monospace; font-weight: 500;
    font-size: 15px; letter-spacing: 0.04em; color: #aeb9bf; white-space: nowrap; }
  .tagline .accent { color: #4acecc; }

  /* Annotated schematic — orthoscheme cube with mono leader-line callouts. */
  .schematic { position: absolute; right: 52px; top: 50%; transform: translateY(-50%);
    display: flex; align-items: center; }
  .geo { height: 104px; filter: drop-shadow(0 6px 22px rgba(3, 176, 173, 0.34)); }
  .geo img { height: 104px; width: auto; display: block; }
  .bridge { width: 28px; height: 1px; background: rgba(122, 219, 221, 0.55); }
  .labels { display: flex; flex-direction: column; gap: 11px;
    padding-left: 14px; border-left: 1px solid rgba(122, 219, 221, 0.4); }
  .lab { position: relative; font-family: 'DM Mono', monospace; font-weight: 500;
    font-size: 13px; letter-spacing: 0.16em; text-transform: uppercase; color: #7adbdd; white-space: nowrap; }
  .lab::before { content: ''; position: absolute; left: -14px; top: 50%; width: 9px; height: 1px;
    background: rgba(122, 219, 221, 0.4); }
</style>
</head>
<body>
  <div class="banner">
    <div class="topline"></div>
    <div class="brand">
      <div class="wordmark">${logoSvg}<span>brepjs</span></div>
      <div class="tagline">Exact <span class="accent">B-Rep</span> CAD, in <span class="accent">TypeScript</span></div>
    </div>
    <div class="schematic">
      <div class="geo"><img src="${partDataUri}" alt="" /></div>
      <div class="bridge"></div>
      <div class="labels">
        <div class="lab">STEP-accurate</div>
        <div class="lab">Browser-native</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// Prefer a system Chrome but fall back to puppeteer's bundled browser.
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
  await mkdir(outDir, { recursive: true });
  for (const { name, w, h } of TARGETS) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: SCALE });
    await page.setContent(html({ w, h }), { waitUntil: 'load' });
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const shot = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: w, height: h } });
    const outPath = resolve(outDir, `${name}.png`);
    await sharp(shot)
      .resize(w, h, { kernel: 'lanczos3' })
      .png({ compressionLevel: 9, palette: true, quality: 92, dither: 1 })
      .toFile(outPath);
    console.warn(`wrote ${name}.png (${w}x${h})`);
  }
} finally {
  await browser.close();
}
