import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import {
  box,
  translate,
  fuse,
  cut,
  fillet,
  chamfer,
  chamferDistAngleShape,
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
  getBounds,
} from '@/index.js';
import type { Dimension, Face, Shape3D } from '@/core/shapeTypes.js';
import type { ValidSolid } from '@/core/validityTypes.js';
import { skipIfDiverges } from './helpers/kernelDivergences.js';

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

    it('gives boolean-generated seam faces the origin of their parent face', () => {
      // Two OVERLAPPING boxes sharing one origin: the union regenerates faces
      // at the intersection seam. Those generated faces must inherit the
      // origin (7), not default to 0 (body) — otherwise a feature tool's seam
      // with the body renders body-colored downstream (GH #1654).
      const b1 = box(10, 10, 10);
      setShapeOrigin(b1, 7);
      const b2 = box(10, 10, 10);
      setShapeOrigin(b2, 7);
      const moved = translate(b2, [5, 5, 0]); // overlaps b1

      const result = fuse(b1, moved);
      expect(isOk(result)).toBe(true);
      const fused = unwrap(result);
      const origins = getFaceOrigins(fused);
      expect(origins).toBeDefined();
      expect(origins?.size).toBeGreaterThan(0);
      // No face should have leaked to origin 0 (the pre-fix bug).
      expect([...(origins?.values() ?? [])].every((v) => v === 7)).toBe(true);
    });

    it('keeps a tagged tool feature on seam faces when fused into an untagged body', () => {
      // Mirrors the gridfinity case: the body carries no origin, a feature tool
      // does. Generated seam faces derived from the tool must keep the tool's
      // origin (2), not fall back to 0 (body). Guards both the fix and the
      // first-writer-wins ordering (untagged body contributes no origins).
      const body = box(10, 10, 10); // intentionally NOT tagged
      const tool = box(10, 10, 10);
      setShapeOrigin(tool, 2);
      const movedTool = translate(tool, [5, 5, 0]); // overlaps body

      const result = fuse(body, movedTool);
      expect(isOk(result)).toBe(true);
      const fused = unwrap(result);
      const origins = getFaceOrigins(fused);
      expect(origins).toBeDefined();
      // Only the tool's origin is in play; nothing should read as 0 (body leak).
      const values = [...(origins?.values() ?? [])];
      expect(values.length).toBeGreaterThan(0);
      expect(values).toContain(2);
      expect(values.every((v) => v === 2)).toBe(true);
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

  describe('full metadata propagation through distance-angle chamfers', () => {
    const verticalEdges = (solid: Shape3D) =>
      getEdges(solid).filter((e) => getBounds(e).zMax - getBounds(e).zMin > 5);
    const isTop = (f: Face<Dimension>) => getBounds(f).zMin > 10 - 1e-6;
    const isLeft = (f: Face<Dimension>) => getBounds(f).xMax < 1e-6;
    const isGreen = (solid: Shape3D, f: Face<Dimension>) => getFaceColor(solid, f)?.[1] === 1;

    /** A 10 mm cube with its top face tagged 'top' and its x = 0 face green. */
    function markedCube(): ValidSolid {
      const b = box(10, 10, 10);
      tagFaces(b, getFaces(b).filter(isTop), 'top');
      colorFaces(b, getFaces(b).filter(isLeft), '#00ff00');
      return b;
    }

    function expectMarksKept(solid: Shape3D): void {
      const tagged = findFacesByTag(solid, 'top');
      expect(tagged).toHaveLength(1);
      expect(tagged.every(isTop)).toBe(true);
      const green = getFaces(solid).filter((f) => isGreen(solid, f));
      expect(green).toHaveLength(1);
      expect(green.every(isLeft)).toBe(true);
    }

    it('keeps face tags and colors through one { distance, angle }', (ctx) => {
      skipIfDiverges(ctx, 'chamferAngle.distAngle');
      skipIfDiverges(ctx, 'chamferAngle.faceHistory');
      using b = markedCube();
      using uniform = unwrap(chamfer(b, verticalEdges(b), { distance: 1, angle: 30 }));
      expectMarksKept(uniform);
      using direct = unwrap(chamferDistAngleShape(b, verticalEdges(b), 1, 30));
      expectMarksKept(direct);
    });

    it('keeps face tags and colors through per-edge { distance, angle }', (ctx) => {
      skipIfDiverges(ctx, 'chamferAngle.perEdge');
      skipIfDiverges(ctx, 'chamferAngle.faceHistory');
      using b = markedCube();
      using chamfered = unwrap(
        chamfer(b, verticalEdges(b), (e) =>
          getBounds(e).xMin < 5 ? { distance: 1, angle: 30 } : { distance: 2, angle: 60 }
        )
      );
      expectMarksKept(chamfered);
    });
  });
});
