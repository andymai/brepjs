import { describe, expect, it } from 'vitest';
import { textMetrics, fontMetrics, loadFont, unwrap, isOk, isErr } from '../src/index.js';
import { readFileSync, existsSync } from 'node:fs';

// Load a real font for testing — use any available system TTF
let fontLoaded = false;

async function ensureFont() {
  if (fontLoaded) return;
  const fontPaths = [
    // Linux
    '/usr/share/fonts/google-noto/NotoSans-Regular.ttf',
    '/usr/share/fonts/noto/NotoSans-Regular.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/dejavu-sans-fonts/DejaVuSans.ttf',
    // macOS
    '/System/Library/Fonts/Supplemental/Arial.ttf',
    '/System/Library/Fonts/Supplemental/Courier New.ttf',
  ];
  for (const p of fontPaths) {
    try {
      if (!existsSync(p)) continue;
      const buf = readFileSync(p);
      const result = await loadFont(buf.buffer as ArrayBuffer, 'default');
      if (isOk(result)) {
        fontLoaded = true;
        return;
      }
    } catch {
      // try next
    }
  }
}

describe('textMetrics', () => {
  it('returns width, height, ascender, descender for a string', async () => {
    await ensureFont();
    if (!fontLoaded) return; // skip on environments without system fonts
    const m = unwrap(textMetrics('Hello', { fontSize: 16 }));
    expect(m.width).toBeGreaterThan(0);
    expect(m.height).toBeGreaterThan(0);
    expect(m.ascender).toBeGreaterThan(0);
    expect(m.descender).toBeLessThan(0);
  });

  it('scales with fontSize', async () => {
    await ensureFont();
    if (!fontLoaded) return; // skip on environments without system fonts
    const m1 = unwrap(textMetrics('A', { fontSize: 10 }));
    const m2 = unwrap(textMetrics('A', { fontSize: 20 }));
    expect(m2.width).toBeCloseTo(m1.width * 2, 1);
    expect(m2.height).toBeCloseTo(m1.height * 2, 1);
  });

  it('returns error when no font loaded for family', () => {
    const result = textMetrics('X', { fontFamily: 'nonexistent-font-xyz' });
    expect(isErr(result)).toBe(true);
  });
});

describe('fontMetrics', () => {
  it('returns font-level metrics', async () => {
    await ensureFont();
    if (!fontLoaded) return; // skip on environments without system fonts
    const m = unwrap(fontMetrics({ fontSize: 16 }));
    expect(m.ascender).toBeGreaterThan(0);
    expect(m.descender).toBeLessThan(0);
    expect(m.unitsPerEm).toBeGreaterThan(0);
    expect(m.lineHeight).toBeGreaterThan(0);
    expect(m.lineHeight).toBeGreaterThanOrEqual(m.ascender - m.descender);
  });
});
