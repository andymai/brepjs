import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import {
  box,
  translate,
  fuse,
  cut,
  fillet,
  unwrap,
  isOk,
  setShapeOrigin,
  getFaceOrigins,
  tagFaces,
  findFacesByTag,
  colorShape,
  colorFaces,
  getShapeColor,
  getFaceColor,
  getFaces,
  getEdges,
} from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('metadata propagation pipeline', () => {
  describe('origin propagation through transforms', () => {
    it('preserves face origins after translate', () => {
      const b = box(10, 10, 10);
      setShapeOrigin(b, 42);
      const translated = translate(b, [5, 0, 0]);
      const origins = getFaceOrigins(translated);
      expect(origins).toBeDefined();
      expect(origins?.size).toBeGreaterThan(0);
    });
  });

  describe('full metadata propagation through booleans', () => {
    it('preserves face tags through fuse', () => {
      const b1 = box(10, 10, 10);
      const faces1 = getFaces(b1);
      expect(faces1.length).toBeGreaterThan(0);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length checked above
      tagFaces(b1, [faces1[0]!], 'top');

      const b2 = box(10, 10, 10);
      const moved = translate(b2, [10, 0, 0]);

      const result = fuse(b1, moved);
      expect(isOk(result)).toBe(true);
      const fused = unwrap(result);
      const taggedFaces = findFacesByTag(fused, 'top');
      expect(taggedFaces.length).toBeGreaterThan(0);
    });

    it('preserves face colors through fuse', () => {
      const b1 = box(10, 10, 10);
      colorShape(b1, '#ff0000');

      const b2 = box(10, 10, 10);
      const moved = translate(b2, [10, 0, 0]);

      const result = fuse(b1, moved);
      expect(isOk(result)).toBe(true);
      const fused = unwrap(result);
      const color = getShapeColor(fused);
      expect(color).toBeDefined();
      expect(color?.[0]).toBeCloseTo(1, 1); // red channel
    });

    it('preserves per-face colors through cut', () => {
      const b1 = box(20, 20, 20);
      const faces1 = getFaces(b1);
      expect(faces1.length).toBeGreaterThan(0);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length checked above
      colorFaces(b1, [faces1[0]!], '#00ff00');

      const tool = box(5, 5, 5);
      const movedTool = translate(tool, [7.5, 7.5, 7.5]);

      const result = cut(b1, movedTool);
      expect(isOk(result)).toBe(true);
      const cutShape = unwrap(result);
      // At least one face should still have the green color
      const resultFaces = getFaces(cutShape);
      const colorsFound = resultFaces.some((f) => {
        const c = getFaceColor(cutShape, f);
        return c !== undefined && c[1] > 0.9;
      });
      expect(colorsFound).toBe(true);
    });

    it('preserves origins through fuse', () => {
      const b1 = box(10, 10, 10);
      setShapeOrigin(b1, 1);
      const b2 = box(10, 10, 10);
      setShapeOrigin(b2, 2);
      const moved = translate(b2, [10, 0, 0]);

      const result = fuse(b1, moved);
      expect(isOk(result)).toBe(true);
      const fused = unwrap(result);
      const origins = getFaceOrigins(fused);
      expect(origins).toBeDefined();
      expect(origins?.size).toBeGreaterThan(0);
    });
  });

  describe('full metadata propagation through modifiers', () => {
    it('preserves face tags through fillet', () => {
      const b = box(20, 20, 20);
      const faces = getFaces(b);
      expect(faces.length).toBeGreaterThan(0);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length checked above
      tagFaces(b, [faces[0]!], 'bottom');

      const edges = getEdges(b);
      expect(edges.length).toBeGreaterThan(0);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length checked above
      const result = fillet(b, [edges[0]!], 2);
      expect(isOk(result)).toBe(true);
      const filleted = unwrap(result);
      const taggedFaces = findFacesByTag(filleted, 'bottom');
      expect(taggedFaces.length).toBeGreaterThan(0);
    });

    it('preserves shape color through fillet', () => {
      const b = box(20, 20, 20);
      colorShape(b, '#0000ff');

      const edges = getEdges(b);
      expect(edges.length).toBeGreaterThan(0);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length checked above
      const result = fillet(b, [edges[0]!], 2);
      expect(isOk(result)).toBe(true);
      const filleted = unwrap(result);
      const color = getShapeColor(filleted);
      expect(color).toBeDefined();
      expect(color?.[2]).toBeCloseTo(1, 1); // blue channel
    });
  });
});
