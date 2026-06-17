#!/usr/bin/env node
// Render the docs Open Graph card (apps/docs/public/og.png) from an HTML/CSS
// template via headless Chrome. We use a browser rather than rsvg-convert
// (scripts/gen-og.sh) because the brand display face, Space Grotesk, isn't
// installed locally — Chrome fetches it from Google Fonts so the type matches
// the landing page exactly. Rendered at 2x then downscaled for crisp edges.
import puppeteer from 'puppeteer';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'apps/docs/public/og.png');
const W = 1200;
const H = 630;
const SCALE = 2;

const logoSvg = await readFile(resolve(root, 'apps/docs/public/logo.svg'), 'utf8');

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

const html = `<!doctype html>
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
    position: relative;
    width: ${W}px;
    height: ${H}px;
    overflow: hidden;
    background-color: #080b0e;
    background-image:
      radial-gradient(120% 86% at 82% 4%, rgba(3, 176, 173, 0.18), transparent 56%),
      radial-gradient(78% 62% at 4% 104%, rgba(7, 96, 111, 0.18), transparent 52%),
      linear-gradient(rgba(255, 255, 255, 0.028) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.028) 1px, transparent 1px);
    background-size: 100% 100%, 100% 100%, 36px 36px, 36px 36px;
    font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
    color: #f1f6f7;
    -webkit-font-smoothing: antialiased;
  }
  /* thin teal hairline along the very top — echoes the landing CTA gradient */
  .topline {
    position: absolute; top: 0; left: 0; right: 0; height: 4px;
    background: linear-gradient(90deg, transparent, #03b0ad 28%, #4acecc 60%, transparent);
    opacity: 0.8;
  }
  .brand {
    position: absolute; top: 52px; left: 72px;
    display: flex; align-items: center; gap: 13px;
    font-family: 'Space Grotesk', sans-serif; font-weight: 600;
    font-size: 30px; letter-spacing: -0.01em;
  }
  .brand svg { width: 36px; height: 36px; display: block; }
  .content {
    position: absolute; left: 72px; top: 0; bottom: 0; width: 700px;
    display: flex; flex-direction: column; justify-content: center;
  }
  .eyebrow {
    font-family: 'JetBrains Mono', monospace; font-weight: 500;
    font-size: 16px; letter-spacing: 0.2em; text-transform: uppercase;
    color: #7adbdd; margin-bottom: 22px;
  }
  .headline {
    font-family: 'Space Grotesk', sans-serif; font-weight: 600;
    font-size: 64px; line-height: 1.05; letter-spacing: -0.022em;
  }
  .headline .grad {
    background: linear-gradient(118deg, #07606f 0%, #03b0ad 36%, #4acecc 72%, #7adbdd 100%);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .subhead {
    margin-top: 26px; max-width: 540px;
    font-size: 22px; line-height: 1.45; color: #aab6bd;
  }
  .foot {
    position: absolute; left: 72px; bottom: 50px;
    display: flex; align-items: center; gap: 14px;
    font-family: 'JetBrains Mono', monospace; font-size: 15px;
    letter-spacing: 0.03em; color: #828d96;
  }
  .foot .dot { color: #283340; }
  .foot .dom { color: #aab6bd; }
  .geo-glow {
    position: absolute; right: -40px; top: 50%;
    width: 560px; height: 560px; transform: translateY(-50%);
    background: radial-gradient(circle at 50% 50%, rgba(3, 176, 173, 0.20), transparent 62%);
  }
  .geo {
    position: absolute; right: 20px; top: 50%;
    width: 420px; height: 420px; transform: translateY(-50%) rotate(-2deg);
    filter: drop-shadow(0 26px 70px rgba(3, 176, 173, 0.22));
  }
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
      <div class="eyebrow">Exact B-Rep · TypeScript · Browser-native</div>
      <div class="headline">Exact CAD geometry,<br /><span class="grad">written in TypeScript.</span></div>
      <div class="subhead">A real B-Rep kernel in your browser — type-safe and STEP-accurate.</div>
    </div>

    <div class="foot">
      <span class="dom">brepjs.dev</span>
      <span class="dot">·</span><span>OpenCascade kernel</span>
      <span class="dot">·</span><span>Apache-2.0</span>
    </div>
  </div>
</body>
</html>`;

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--force-color-profile=srgb', '--hide-scrollbars'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: SCALE });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  const shot = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: W, height: H } });
  await sharp(shot).resize(W, H, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toFile(out);
  console.warn(`wrote ${out}`);
} finally {
  await browser.close();
}
