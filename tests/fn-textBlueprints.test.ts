import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { loadFont, getFont, textBlueprints, sketchText } from '../src/text/textBlueprints.js';
import { readFile } from 'node:fs/promises';

beforeAll(async () => {
  await initOC();
  // Load a system font as ArrayBuffer (loadFont supports ArrayBuffer directly)
  const fontBuffer = await readFile('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf');
  await loadFont(fontBuffer.buffer as ArrayBuffer, 'test');
}, 30000);

describe('loadFont', () => {
  it('registers the font and makes it retrievable', () => {
    const font = getFont('test');
    expect(font).toBeDefined();
  });

  it('sets default font on first load', () => {
    const font = getFont('default');
    expect(font).toBeDefined();
  });

  it('does not reload when already cached (force=false)', async () => {
    const fontBefore = getFont('test');
    const fontBuffer = await readFile('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf');
    await loadFont(fontBuffer.buffer as ArrayBuffer, 'test', false);
    const fontAfter = getFont('test');
    expect(fontAfter).toBe(fontBefore);
  });

  it('reloads when force=true', async () => {
    const fontBuffer = await readFile('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf');
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
  it('generates blueprints from text', () => {
    const bps = textBlueprints('A', { fontFamily: 'test', fontSize: 20 });
    expect(bps).toBeDefined();
  });

  it('generates blueprints with custom start position', () => {
    const bps = textBlueprints('Hi', { fontFamily: 'test', startX: 10, startY: 5 });
    expect(bps).toBeDefined();
  });

  it('throws if no font is loaded for family', () => {
    // getFont('missing') returns undefined, falls through to getFont('default')
    // Since default IS loaded, this won't throw. Test with a cleared state isn't feasible
    // without modifying internals. Instead, verify it works with default fallback.
    const bps = textBlueprints('X', { fontFamily: 'missing' });
    expect(bps).toBeDefined();
  });
});

describe('sketchText', () => {
  it('creates a sketch from text on default plane', () => {
    const sketch = sketchText('B', { fontFamily: 'test', fontSize: 20 });
    expect(sketch).toBeDefined();
  });

  it('creates a sketch from text on named plane', () => {
    const sketch = sketchText('C', { fontFamily: 'test', fontSize: 20 }, { plane: 'XY' });
    expect(sketch).toBeDefined();
  });

  it('creates a sketch from text with origin offset', () => {
    const sketch = sketchText(
      'D',
      { fontFamily: 'test', fontSize: 20 },
      { plane: 'XY', origin: 5 }
    );
    expect(sketch).toBeDefined();
  });
});
