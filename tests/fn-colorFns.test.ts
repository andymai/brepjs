import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import {
  box,
  translate,
  fuse,
  unwrap,
  isOk,
  colorShape,
  colorFaces,
  getShapeColor,
  getFaceColor,
  getFaces,
} from '../src/index.js';
import { hasColorMetadata } from '../src/topology/colorFns.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('shape colors', () => {
  it('assigns and retrieves a hex color on a shape', () => {
    const b = box(10, 10, 10);
    const colored = colorShape(b, '#ff0000');
    const c = getShapeColor(colored);
    expect(c).toBeDefined();
    expect(c?.[0]).toBeCloseTo(1, 1);
    expect(c?.[1]).toBeCloseTo(0, 1);
    expect(c?.[2]).toBeCloseTo(0, 1);
    expect(c?.[3]).toBeCloseTo(1, 1);
  });

  it('assigns color with RGB tuple (alpha defaults to 1)', () => {
    const b = box(10, 10, 10);
    const colored = colorShape(b, [1, 0, 0]);
    const c = getShapeColor(colored);
    expect(c).toBeDefined();
    expect(c?.[0]).toBeCloseTo(1, 5);
    expect(c?.[1]).toBeCloseTo(0, 5);
    expect(c?.[2]).toBeCloseTo(0, 5);
    expect(c?.[3]).toBeCloseTo(1, 5);
  });

  it('assigns color with RGBA tuple', () => {
    const b = box(10, 10, 10);
    const colored = colorShape(b, [1, 0, 0, 0.5]);
    const c = getShapeColor(colored);
    expect(c).toBeDefined();
    expect(c?.[0]).toBeCloseTo(1, 5);
    expect(c?.[1]).toBeCloseTo(0, 5);
    expect(c?.[2]).toBeCloseTo(0, 5);
    expect(c?.[3]).toBeCloseTo(0.5, 5);
  });

  it('returns correct values from getShapeColor and getFaceColor', () => {
    const b = box(10, 10, 10);
    colorShape(b, [0.2, 0.4, 0.6, 0.8]);
    const c = getShapeColor(b);
    expect(c?.[0]).toBeCloseTo(0.2, 5);
    expect(c?.[1]).toBeCloseTo(0.4, 5);
    expect(c?.[2]).toBeCloseTo(0.6, 5);
    expect(c?.[3]).toBeCloseTo(0.8, 5);

    const faces = getFaces(b);
    expect(faces.length).toBeGreaterThan(0);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length checked above
    colorFaces(b, [faces[0]!], [0.9, 0.1, 0.3, 1]);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length checked above
    const fc = getFaceColor(b, faces[0]!);
    expect(fc?.[0]).toBeCloseTo(0.9, 5);
    expect(fc?.[1]).toBeCloseTo(0.1, 5);
    expect(fc?.[2]).toBeCloseTo(0.3, 5);
    expect(fc?.[3]).toBeCloseTo(1, 5);
  });

  it('hasColorMetadata returns false for fresh shapes, true after colorShape', () => {
    const b = box(10, 10, 10);
    expect(hasColorMetadata(b)).toBe(false);

    colorShape(b, '#00ff00');
    expect(hasColorMetadata(b)).toBe(true);
  });

  it('shape color propagates through fuse', () => {
    const b1 = colorShape(box(10, 10, 10), [1, 0, 0, 1]);
    const b2 = box(5, 5, 5);
    const result = fuse(b1, b2);
    expect(isOk(result)).toBe(true);
    const fused = unwrap(result);
    const c = getShapeColor(fused);
    expect(c).toBeDefined();
    expect(c?.[0]).toBeCloseTo(1, 1);
    expect(c?.[1]).toBeCloseTo(0, 1);
    expect(c?.[2]).toBeCloseTo(0, 1);
    expect(c?.[3]).toBeCloseTo(1, 1);
  });

  it('shape color propagates through translate', () => {
    const b = colorShape(box(10, 10, 10), [0, 0, 1, 1]);
    const moved = translate(b, [5, 0, 0]);
    const c = getShapeColor(moved);
    expect(c).toBeDefined();
    expect(c?.[0]).toBeCloseTo(0, 1);
    expect(c?.[1]).toBeCloseTo(0, 1);
    expect(c?.[2]).toBeCloseTo(1, 1);
    expect(c?.[3]).toBeCloseTo(1, 1);
  });

  it('per-face color survives translate', () => {
    const b = box(10, 10, 10);
    const faces = getFaces(b);
    expect(faces.length).toBeGreaterThan(0);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length checked above
    colorFaces(b, [faces[0]!], [1, 1, 0, 1]);
    const moved = translate(b, [10, 0, 0]);
    const movedFaces = getFaces(moved);
    const withColor = movedFaces.filter((f) => getFaceColor(moved, f) !== undefined);
    expect(withColor.length).toBeGreaterThan(0);
  });

  it('returns undefined for uncolored shape', () => {
    expect(getShapeColor(box(10, 10, 10))).toBeUndefined();
  });
});
