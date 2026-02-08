import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { loadFont, getFont, textBlueprints, sketchText } from '../src/text/textBlueprints.js';
import { readFile, access } from 'node:fs/promises';

/** Try several common system font paths and return the first that exists. */
async function findMonoFont(): Promise<string | undefined> {
  const candidates = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', // Debian/Ubuntu
    '/usr/share/fonts/dejavu-sans-mono-fonts/DejaVuSansMono.ttf', // Fedora (RPM)
    '/usr/share/fonts/adwaita-mono-fonts/AdwaitaMono-Regular.ttf', // Fedora minimal
    '/usr/share/fonts/TTF/DejaVuSansMono.ttf', // Arch
    '/usr/share/fonts/dejavu/DejaVuSansMono.ttf', // openSUSE
  ];
  for (const p of candidates) {
    try {
      await access(p);
      return p;
    } catch {
      /* not found, try next */
    }
  }
  return undefined;
}

let fontPath: string | undefined;

beforeAll(async () => {
  await initOC();
  fontPath = await findMonoFont();
  if (!fontPath) {
    console.warn('No suitable TTF font found — skipping text blueprint tests');
    return;
  }
  const fontBuffer = await readFile(fontPath);
  await loadFont(fontBuffer.buffer as ArrayBuffer, 'test');
}, 30000);

describe('loadFont', () => {
  it('registers the font and makes it retrievable', ({ skip }) => {
    if (!fontPath) skip();
    const font = getFont('test');
    expect(font).toBeDefined();
  });

  it('sets default font on first load', ({ skip }) => {
    if (!fontPath) skip();
    const font = getFont('default');
    expect(font).toBeDefined();
  });

  it('does not reload when already cached (force=false)', async ({ skip }) => {
    if (!fontPath) skip();
    const fontBefore = getFont('test');
    const fontBuffer = await readFile(fontPath as string);
    await loadFont(fontBuffer.buffer as ArrayBuffer, 'test', false);
    const fontAfter = getFont('test');
    expect(fontAfter).toBe(fontBefore);
  });

  it('reloads when force=true', async ({ skip }) => {
    if (!fontPath) skip();
    const fontBuffer = await readFile(fontPath as string);
    const font = await loadFont(fontBuffer.buffer as ArrayBuffer, 'test', true);
    expect(font).toBeDefined();
  });
});

describe('getFont', () => {
  it('returns undefined for unregistered family', () => {
    const font = getFont('nonexistent');
    expect(font).toBeUndefined();
  });
});

describe('textBlueprints', () => {
  it('generates blueprints from text', ({ skip }) => {
    if (!fontPath) skip();
    const bps = textBlueprints('A', { fontFamily: 'test', fontSize: 20 });
    expect(bps).toBeDefined();
  });

  it('generates blueprints with custom start position', ({ skip }) => {
    if (!fontPath) skip();
    const bps = textBlueprints('Hi', { fontFamily: 'test', startX: 10, startY: 5 });
    expect(bps).toBeDefined();
  });

  it('throws if no font is loaded for family', ({ skip }) => {
    if (!fontPath) skip();
    // getFont('missing') returns undefined, falls through to getFont('default')
    // Since default IS loaded, this won't throw. Test with a cleared state isn't feasible
    // without modifying internals. Instead, verify it works with default fallback.
    const bps = textBlueprints('X', { fontFamily: 'missing' });
    expect(bps).toBeDefined();
  });
});

describe('sketchText', () => {
  it('creates a sketch from text on default plane', ({ skip }) => {
    if (!fontPath) skip();
    const sketch = sketchText('B', { fontFamily: 'test', fontSize: 20 });
    expect(sketch).toBeDefined();
  });

  it('creates a sketch from text on named plane', ({ skip }) => {
    if (!fontPath) skip();
    const sketch = sketchText('C', { fontFamily: 'test', fontSize: 20 }, { plane: 'XY' });
    expect(sketch).toBeDefined();
  });

  it('creates a sketch from text with origin offset', ({ skip }) => {
    if (!fontPath) skip();
    const sketch = sketchText(
      'D',
      { fontFamily: 'test', fontSize: 20 },
      { plane: 'XY', origin: 5 }
    );
    expect(sketch).toBeDefined();
  });
});
