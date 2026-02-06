import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  sketchRectangle,
  thickenSurface,
  castShape,
  measureVolume,
  fnIsSolid,
  isOk,
  unwrap,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('thickenSurface', () => {
  it('thickens a planar face into a solid', () => {
    const sketch = sketchRectangle(10, 10);
    const face = castShape(sketch.face().wrapped);
    const result = thickenSurface(face, 5);

    expect(isOk(result)).toBe(true);
    const solid = unwrap(result);
    expect(fnIsSolid(solid)).toBe(true);
  });

  it('thickens with negative thickness (offsets in opposite direction)', () => {
    const sketch = sketchRectangle(10, 10);
    const face = castShape(sketch.face().wrapped);
    const result = thickenSurface(face, -5);

    expect(isOk(result)).toBe(true);
    const solid = unwrap(result);
    expect(fnIsSolid(solid)).toBe(true);
  });

  it('produces expected volume for a rectangular face thickened by a known amount', () => {
    const sketch = sketchRectangle(10, 20);
    const face = castShape(sketch.face().wrapped);
    const result = thickenSurface(face, 3);

    expect(isOk(result)).toBe(true);
    const solid = unwrap(result);
    // 10 x 20 face thickened by 3 => |volume| ≈ 600
    const vol = measureVolume({ wrapped: solid.wrapped } as Parameters<typeof measureVolume>[0]);
    expect(Math.abs(vol)).toBeCloseTo(600, 0);
  });
});
