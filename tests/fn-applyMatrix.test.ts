import { describe, expect, it, beforeAll } from 'vitest';
import { currentKernel, initKernel } from './setup.js';
import {
  box,
  translate,
  scale,
  applyMatrix,
  getBounds,
  measureVolume,
  getKernel,
  type Matrix4x4,
  type MatrixTransform,
} from '../src/index.js';

describe.skipIf(currentKernel !== 'occt')('OCCT-specific: applyMatrix', () => {
  let hasGTransform = false;

  beforeAll(async () => {
    await initKernel();
    // Check if BRepBuilderAPI_GTransform is available in the WASM build

    hasGTransform = typeof getKernel().oc.BRepBuilderAPI_GTransform_2 === 'function';
  }, 30000);

  // ── Helpers ──

  /** Identity 4x4 matrix */
  const IDENTITY: Matrix4x4 = [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];

  /** Builds a translation-only 4x4 matrix */
  function translationMatrix(tx: number, ty: number, tz: number): Matrix4x4 {
    return [
      [1, 0, 0, tx],
      [0, 1, 0, ty],
      [0, 0, 1, tz],
      [0, 0, 0, 1],
    ];
  }

  /** 90-degree rotation around Z axis */
  const ROTATE_Z_90: Matrix4x4 = [
    [0, -1, 0, 0],
    [1, 0, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];

  /** Uniform scale by factor 2 */
  const UNIFORM_SCALE_2: Matrix4x4 = [
    [2, 0, 0, 0],
    [0, 2, 0, 0],
    [0, 0, 2, 0],
    [0, 0, 0, 1],
  ];

  /** Non-uniform scale: stretch X by 2, keep Y and Z */
  const NONUNIFORM_SCALE: Matrix4x4 = [
    [2, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];

  /** Shear: X sheared by Y */
  const SHEAR_XY: Matrix4x4 = [
    [1, 1, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];

  // ── Orthogonal fast-path tests ──

  describe('applyMatrix — orthogonal (fast path)', () => {
    it('identity matrix preserves shape bounds', () => {
      const b = box(10, 10, 10);
      const result = applyMatrix(b, IDENTITY);
      const bounds = getBounds(result);
      expect(bounds.xMin).toBeCloseTo(0, 5);
      expect(bounds.xMax).toBeCloseTo(10, 5);
      expect(bounds.yMin).toBeCloseTo(0, 5);
      expect(bounds.yMax).toBeCloseTo(10, 5);
    });

    it('pure translation matches translate()', () => {
      const b = box(10, 10, 10);
      const viaMatrix = applyMatrix(b, translationMatrix(5, 10, 15));
      const viaTranslate = translate(b, [5, 10, 15]);
      const mb = getBounds(viaMatrix);
      const tb = getBounds(viaTranslate);
      expect(mb.xMin).toBeCloseTo(tb.xMin, 5);
      expect(mb.xMax).toBeCloseTo(tb.xMax, 5);
      expect(mb.yMin).toBeCloseTo(tb.yMin, 5);
      expect(mb.yMax).toBeCloseTo(tb.yMax, 5);
      expect(mb.zMin).toBeCloseTo(tb.zMin, 5);
      expect(mb.zMax).toBeCloseTo(tb.zMax, 5);
    });

    it('90° Z rotation moves box correctly', () => {
      const b = box(10, 20, 5);
      const result = applyMatrix(b, ROTATE_Z_90);
      const bounds = getBounds(result);
      // Box [0,10]x[0,20] rotated 90° CCW → [-20,0]x[0,10]
      expect(bounds.xMin).toBeCloseTo(-20, 3);
      expect(bounds.xMax).toBeCloseTo(0, 3);
      expect(bounds.yMin).toBeCloseTo(0, 3);
      expect(bounds.yMax).toBeCloseTo(10, 3);
    });

    it('uniform scale doubles dimensions and volume 8x', () => {
      const b = box(10, 10, 10);
      const result = applyMatrix(b, UNIFORM_SCALE_2);
      const bounds = getBounds(result);
      expect(bounds.xMax).toBeCloseTo(20, 3);
      expect(bounds.yMax).toBeCloseTo(20, 3);
      expect(bounds.zMax).toBeCloseTo(20, 3);
      expect(measureVolume(result)).toBeCloseTo(8000, 0);
    });

    it('uniform scale matches scale()', () => {
      const b = box(10, 10, 10);
      const viaMatrix = applyMatrix(b, UNIFORM_SCALE_2);
      const viaScale = scale(b, 2);
      expect(measureVolume(viaMatrix)).toBeCloseTo(measureVolume(viaScale), 0);
    });
  });

  // ── General affine tests (require BRepBuilderAPI_GTransform) ──

  describe('applyMatrix — general affine (non-orthogonal)', () => {
    it('non-uniform scale stretches one axis', () => {
      if (!hasGTransform) return; // requires WASM rebuild with BRepBuilderAPI_GTransform
      const b = box(10, 10, 10);
      const result = applyMatrix(b, NONUNIFORM_SCALE);
      const bounds = getBounds(result);
      expect(bounds.xMin).toBeCloseTo(0, 3);
      expect(bounds.xMax).toBeCloseTo(20, 3);
      expect(bounds.yMax).toBeCloseTo(10, 3);
      expect(bounds.zMax).toBeCloseTo(10, 3);
      // Volume doubles (2x in X, 1x in Y, 1x in Z)
      expect(measureVolume(result)).toBeCloseTo(2000, 0);
    });

    it('shear preserves volume', () => {
      if (!hasGTransform) return; // requires WASM rebuild with BRepBuilderAPI_GTransform
      const b = box(10, 10, 10);
      const result = applyMatrix(b, SHEAR_XY);
      // Shear det = 1, so volume is preserved
      expect(measureVolume(result)).toBeCloseTo(1000, 0);
    });

    it('combined non-uniform scale + translation', () => {
      if (!hasGTransform) return; // requires WASM rebuild with BRepBuilderAPI_GTransform
      const m: Matrix4x4 = [
        [2, 0, 0, 5],
        [0, 3, 0, 10],
        [0, 0, 1, 0],
        [0, 0, 0, 1],
      ];
      const b = box(10, 10, 10);
      const result = applyMatrix(b, m);
      const bounds = getBounds(result);
      expect(bounds.xMin).toBeCloseTo(5, 3);
      expect(bounds.xMax).toBeCloseTo(25, 3); // 10*2 + 5
      expect(bounds.yMin).toBeCloseTo(10, 3);
      expect(bounds.yMax).toBeCloseTo(40, 3); // 10*3 + 10
    });
  });

  // ── MatrixTransform input ──

  describe('applyMatrix — MatrixTransform input', () => {
    it('structured orthogonal input produces correct result', () => {
      const b = box(10, 10, 10);
      const mt: MatrixTransform = {
        linear: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        translation: [5, 10, 15],
      };
      const result = getBounds(applyMatrix(b, mt));
      expect(result.xMin).toBeCloseTo(5, 5);
      expect(result.xMax).toBeCloseTo(15, 5);
      expect(result.yMin).toBeCloseTo(10, 5);
      expect(result.yMax).toBeCloseTo(20, 5);
      expect(result.zMin).toBeCloseTo(15, 5);
      expect(result.zMax).toBeCloseTo(25, 5);
    });

    it('structured input matches equivalent Matrix4x4', () => {
      if (!hasGTransform) return; // uses non-uniform scale, requires WASM rebuild
      const b = box(10, 10, 10);
      const m4: Matrix4x4 = [
        [2, 0, 0, 5],
        [0, 1, 0, 10],
        [0, 0, 1, 0],
        [0, 0, 0, 1],
      ];
      const mt: MatrixTransform = {
        linear: [2, 0, 0, 0, 1, 0, 0, 0, 1],
        translation: [5, 10, 0],
      };
      const r1 = getBounds(applyMatrix(b, m4));
      const r2 = getBounds(applyMatrix(b, mt));
      expect(r1.xMin).toBeCloseTo(r2.xMin, 5);
      expect(r1.xMax).toBeCloseTo(r2.xMax, 5);
      expect(r1.yMin).toBeCloseTo(r2.yMin, 5);
      expect(r1.yMax).toBeCloseTo(r2.yMax, 5);
    });
  });

  // ── Validation ──

  describe('applyMatrix — validation', () => {
    it('throws on singular matrix (zero row)', () => {
      const singular: Matrix4x4 = [
        [1, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 1, 0],
        [0, 0, 0, 1],
      ];
      expect(() => applyMatrix(box(10, 10, 10), singular)).toThrow(/singular/i);
    });

    it('throws on invalid bottom row', () => {
      const bad: Matrix4x4 = [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [0, 0, 1, 0],
        [0, 0, 1, 1],
      ];
      expect(() => applyMatrix(box(10, 10, 10), bad)).toThrow(/bottom row/i);
    });
  });

  // ── Immutability ──

  describe('applyMatrix — immutability', () => {
    it('does not mutate the original shape', () => {
      const b = box(10, 10, 10);
      const before = getBounds(b);
      applyMatrix(b, translationMatrix(100, 200, 300));
      const after = getBounds(b);
      expect(after.xMin).toBeCloseTo(before.xMin, 5);
      expect(after.xMax).toBeCloseTo(before.xMax, 5);
    });
  });
});
