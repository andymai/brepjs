import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  box,
  fuse,
  fillet,
  colorShape,
  colorFaces,
  getShapeColor,
  getFaceColor,
  getFaces,
  unwrap,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('shape colors', () => {
  it('assigns and retrieves hex color on a shape', () => {
    const b = box(10, 10, 10);
    const colored = colorShape(b, '#ff0000');
    const c = getShapeColor(colored);
    expect(c).toBeDefined();
    expect(c?.[0]).toBeCloseTo(1, 1);
    expect(c?.[1]).toBeCloseTo(0, 1);
    expect(c?.[2]).toBeCloseTo(0, 1);
    expect(c?.[3]).toBeCloseTo(1, 1);
  });

  it('assigns color with 3-char hex shorthand', () => {
    const b = box(10, 10, 10);
    const colored = colorShape(b, '#f00');
    const c = getShapeColor(colored);
    expect(c).toBeDefined();
    expect(c?.[0]).toBeCloseTo(1, 1);
    expect(c?.[1]).toBeCloseTo(0, 1);
    expect(c?.[2]).toBeCloseTo(0, 1);
    expect(c?.[3]).toBeCloseTo(1, 1);
  });

  it('parses hex without # prefix', () => {
    const b = box(10, 10, 10);
    const colored = colorShape(b, '00ff00');
    const c = getShapeColor(colored);
    expect(c?.[0]).toBeCloseTo(0, 1);
    expect(c?.[1]).toBeCloseTo(1, 1);
    expect(c?.[2]).toBeCloseTo(0, 1);
  });

  it('assigns color with RGB tuple', () => {
    const b = box(10, 10, 10);
    const colored = colorShape(b, [0.5, 0.5, 0.5]);
    expect(getShapeColor(colored)).toEqual([0.5, 0.5, 0.5, 1]);
  });

  it('assigns color with RGBA tuple', () => {
    const b = box(10, 10, 10);
    const colored = colorShape(b, [1, 0, 0, 0.5]);
    expect(getShapeColor(colored)).toEqual([1, 0, 0, 0.5]);
  });

  it('assigns color per-face', () => {
    const b = box(10, 10, 10);
    const faces = getFaces(b);
    const colored = colorFaces(b, [faces[0]], [1, 0, 0, 1]);
    expect(getFaceColor(colored, faces[0])).toEqual([1, 0, 0, 1]);
  });

  it('returns undefined for uncolored shape', () => {
    expect(getShapeColor(box(10, 10, 10))).toBeUndefined();
  });

  it('shape color persists through fuse', () => {
    const b1 = colorShape(box(10, 10, 10), [1, 0, 0, 1]);
    const b2 = box(5, 5, 5);
    const fused = unwrap(fuse(b1, b2));
    expect(getShapeColor(fused)).toEqual([1, 0, 0, 1]);
  });

  it('face colors persist through fillet', () => {
    const b = box(10, 10, 10);
    const allFaces = getFaces(b);
    const colored = colorFaces(b, allFaces, [0, 1, 0, 1]);
    const filleted = unwrap(fillet(colored, 0.5));
    const faces = getFaces(filleted);
    const withColor = faces.filter((f) => getFaceColor(filleted, f) !== undefined);
    expect(withColor.length).toBeGreaterThan(0);
  });
});
