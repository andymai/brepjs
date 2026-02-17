import { describe, expect, it } from 'vitest';
import { surfaceFromImage } from '../src/index.js';

describe('surfaceFromImage', () => {
  it('is exported as a function', () => {
    expect(surfaceFromImage).toBeTypeOf('function');
  });

  it('fails gracefully when createImageBitmap is unavailable', async () => {
    const blob = new Blob(['not an image']);
    const result = await surfaceFromImage(blob);
    // In Node.js, createImageBitmap is not available
    expect(result.ok).toBe(false);
  });
});
