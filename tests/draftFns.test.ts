/* eslint-disable @typescript-eslint/no-non-null-assertion -- test array indexing */
import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { isBrepkit } from './helpers/kernelEnv.js';
import {
  box,
  isSolid,
  getFaces,
  measureVolume,
  isOk,
  isErr,
  unwrap,
  unwrapErr,
  draft,
} from '@/index.js';
import type { Face, Solid } from '@/core/shapeTypes.js';
import { faceFinder } from '@/query/finderFns.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

/**
 * Helper: find faces of a box whose outward normal is parallel to a given axis.
 */
function findFacesByNormal(solid: Solid, axis: 'X' | 'Y'): Face[] {
  const finder = faceFinder().parallelTo(axis === 'X' ? [1, 0, 0] : [0, 1, 0]);
  return finder.findAll(solid);
}

describe('draft', () => {
  // ------------------------------------------------------------------
  // Kernel-independent validation tests (no kernel draft call needed)
  // ------------------------------------------------------------------

  describe('validation', () => {
    it('returns error for zero angle', () => {
      const b = box(10, 10, 10);
      const faces = getFaces(b);
      const result = draft(b, [faces[0]!], {
        pullDirection: [0, 0, 1],
        neutralPlane: [0, 0, 0],
        angle: 0,
      });
      expect(isErr(result)).toBe(true);
      expect(unwrapErr(result).code).toBe('DRAFT_INVALID_ANGLE');
    });

    it('returns error for angle >= 90', () => {
      const b = box(10, 10, 10);
      const faces = getFaces(b);
      const result = draft(b, [faces[0]!], {
        pullDirection: [0, 0, 1],
        neutralPlane: [0, 0, 0],
        angle: 90,
      });
      expect(isErr(result)).toBe(true);
      expect(unwrapErr(result).code).toBe('DRAFT_INVALID_ANGLE');
    });

    it('returns error for empty faces array', () => {
      const b = box(10, 10, 10);
      const result = draft(b, [], {
        pullDirection: [0, 0, 1],
        neutralPlane: [0, 0, 0],
        angle: 5,
      });
      expect(isErr(result)).toBe(true);
      expect(unwrapErr(result).code).toBe('DRAFT_NO_FACES');
    });

    it('returns error when callback returns null for all faces', () => {
      const b = box(10, 10, 10);
      const faces = getFaces(b);
      const result = draft(b, faces, {
        pullDirection: [0, 0, 1],
        neutralPlane: [0, 0, 0],
        angle: () => null,
      });
      expect(isErr(result)).toBe(true);
      expect(unwrapErr(result).code).toBe('DRAFT_NO_FACES');
    });
  });

  // ------------------------------------------------------------------
  // Operational tests — brepkit only (OCCT needs WASM rebuild)
  // ------------------------------------------------------------------

  describe('brepkit operations', () => {
    it.skipIf(!isBrepkit)('applies uniform draft to side faces of a box', () => {
      const b = box(10, 10, 10);
      const sideFaces = findFacesByNormal(b, 'X');
      expect(sideFaces.length).toBeGreaterThan(0);

      const result = draft(b, sideFaces, {
        pullDirection: [0, 0, 1],
        neutralPlane: [0, 0, 0],
        angle: 5,
      });

      expect(isOk(result)).toBe(true);
      const solid = unwrap(result);
      expect(isSolid(solid)).toBe(true);
      const vol = unwrap(measureVolume(solid));
      expect(vol).toBeGreaterThan(0);
    });

    it.skipIf(!isBrepkit)('applies uniform-angle callback draft', () => {
      const b = box(10, 10, 10);
      const sideFaces = findFacesByNormal(b, 'X');

      // Callback that returns the same angle for all faces (supported by brepkit)
      const result = draft(b, sideFaces, {
        pullDirection: [0, 0, 1],
        neutralPlane: [0, 0, 0],
        angle: () => 5,
      });

      expect(isOk(result)).toBe(true);
      const solid = unwrap(result);
      expect(isSolid(solid)).toBe(true);
    });

    it.skipIf(!isBrepkit)('rejects multi-angle callback draft', () => {
      const b = box(10, 10, 10);
      const xFaces = findFacesByNormal(b, 'X');
      const yFaces = findFacesByNormal(b, 'Y');
      const allSideFaces = [...xFaces, ...yFaces];

      // Brepkit does not support multiple distinct angles in a single draft call
      const result = draft(b, allSideFaces, {
        pullDirection: [0, 0, 1],
        neutralPlane: [0, 0, 0],
        angle: (face) => {
          if (xFaces.includes(face)) return 5;
          if (yFaces.includes(face)) return 3;
          return null;
        },
      });

      expect(isErr(result)).toBe(true);
      expect(unwrapErr(result).message).toMatch(/multiple distinct angles/);
    });

    it.skipIf(!isBrepkit)('works with FinderFn face selection', () => {
      const b = box(10, 10, 10);
      const result = draft(b, (f) => f.parallelTo([1, 0, 0]), {
        pullDirection: [0, 0, 1],
        neutralPlane: [0, 0, 0],
        angle: 3,
      });
      expect(isOk(result)).toBe(true);
    });

    it.skipIf(!isBrepkit)('accepts negative angle (taper inward)', () => {
      const b = box(10, 10, 10);
      const sideFaces = findFacesByNormal(b, 'X');
      const result = draft(b, sideFaces, {
        pullDirection: [0, 0, 1],
        neutralPlane: [0, 0, 0],
        angle: -5,
      });
      expect(isOk(result)).toBe(true);
    });
  });

  // ------------------------------------------------------------------
  // OCCT tests — skip until WASM is rebuilt with BRepOffsetAPI_DraftAngle
  // ------------------------------------------------------------------

  describe('OCCT operations', () => {
    it.skipIf(isBrepkit)('applies uniform draft to side faces of a box', (ctx) => {
      const b = box(10, 10, 10);
      const sideFaces = findFacesByNormal(b, 'X');

      const result = draft(b, sideFaces, {
        pullDirection: [0, 0, 1],
        neutralPlane: [0, 0, 0],
        angle: 5,
      });

      // Will fail until WASM is rebuilt — skip gracefully if BRepOffsetAPI_DraftAngle missing
      if (isErr(result) && unwrapErr(result).message.includes('not available in this WASM build')) {
        ctx.skip();
        return;
      }

      expect(isOk(result)).toBe(true);
      const solid = unwrap(result);
      expect(isSolid(solid)).toBe(true);
      const vol = unwrap(measureVolume(solid));
      expect(vol).toBeGreaterThan(0);
      expect(vol).not.toBeCloseTo(1000, 0);
    });
  });
});
