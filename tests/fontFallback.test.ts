import { describe, expect, it, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { initKernel } from './setup.js';
import { loadFont, getFont, setFallbackFont } from '@/text/fontRegistry.js';
import { textBlueprints } from '@/text/textBlueprints.js';
import { isOk, isErr, unwrap } from '@/core/result.js';

// The registry is module state, so these run in order within one file: fallback first,
// then a real loadFont() taking over 'default'.
let fontBytes: ArrayBuffer;

beforeAll(async () => {
  await initKernel();
  const path = fileURLToPath(
    new URL('../packages/brepjs-cad/assets/fonts/Inter-Bold.ttf', import.meta.url)
  );
  fontBytes = new Uint8Array(await readFile(path)).slice().buffer;
}, 30000);

describe('setFallbackFont', () => {
  it('rejects bytes that are not a font', () => {
    const result = setFallbackFont(new ArrayBuffer(16));
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe('FONT_PARSE_FAILED');
    expect(getFont()).toBeUndefined();
  });

  it('serves the default family and text until a font is loaded', () => {
    const fallback = unwrap(setFallbackFont(fontBytes));
    expect(getFont()).toBe(fallback);
    expect(getFont('Other')).toBeUndefined();
    expect(textBlueprints('Pi 5', { fontSize: 10 }).blueprints.length).toBeGreaterThan(0);
  });

  it('yields to the first loaded font', async () => {
    const fallback = getFont();
    const loaded = await loadFont(fontBytes, 'Custom');
    expect(isOk(loaded)).toBe(true);
    expect(getFont()).not.toBe(fallback);
    expect(getFont()).toBe(getFont('Custom'));
  });
});
