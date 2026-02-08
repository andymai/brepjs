import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  draw,
  drawRectangle,
  drawCircle as _drawCircle,
  drawRoundedRectangle as _drawRoundedRectangle,
  sketchRectangle,
  sketchCircle,
  measureVolume as _measureVolume,
  measureArea as _measureArea,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('Drawing API', () => {
  it('draws a rectangle', () => {
    const bp = drawRectangle(10, 20);
    expect(bp).toBeDefined();
  });

  it('draws a circle', () => {
    const bp = drawCircle(5);
    expect(bp).toBeDefined();
  });

  it('draws a rounded rectangle', () => {
    const bp = drawRoundedRectangle(10, 20, 2);
    expect(bp).toBeDefined();
  });

  it('draws a custom path', () => {
    const bp = draw().hLine(10).vLine(10).hLine(-10).close();
    expect(bp).toBeDefined();
  });
});

describe('Sketch extrusion', () => {
  it('extrudes a rectangle sketch', () => {
    const sketch = sketchRectangle(10, 20);
    const solid = sketch.extrude(5);
    expect(solid).toBeDefined();
    const vol = measureVolume(solid);
    expect(vol).toBeCloseTo(10 * 20 * 5, 0);
  });

  it('extrudes a circle sketch', () => {
    const sketch = sketchCircle(10);
    const solid = sketch.extrude(5);
    expect(solid).toBeDefined();
    const vol = measureVolume(solid);
    expect(vol).toBeCloseTo(Math.PI * 100 * 5, 0);
  });
});
