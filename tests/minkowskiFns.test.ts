import { describe, expect, it, beforeAll } from 'vitest';
import { currentKernel, initKernel } from './setup.js';
import {
  box,
  sphere,
  translate,
  minkowski,
  offset,
  isOk,
  isErr,
  unwrap,
  unwrapErr,
  measureVolume,
  isSolid,
  getKernel,
  createSolid,
} from '@/index.js';
import type { Shape3D } from '@/core/shapeTypes.js';

describe.skipIf(currentKernel !== 'occt')('OCCT-specific: minkowskiFns', () => {
  beforeAll(async () => {
    await initKernel();
  }, 30000);

  function makeNullShape(): Shape3D {
    const oc = getKernel().oc;
    return createSolid(new oc.TopoDS_Solid()) as Shape3D;
  }

  describe('minkowski', () => {
    describe('sphere fast path', () => {
      it('produces a solid with volume > 1000 for box + sphere(1)', () => {
        const result = minkowski(box(10, 10, 10), sphere(1));

        expect(isOk(result)).toBe(true);
        const shape = unwrap(result);
        expect(isSolid(shape)).toBe(true);
        expect(unwrap(measureVolume(shape))).toBeGreaterThan(1000);
      });

      it('volume approximately matches offset(box, 2) for sphere(2)', () => {
        const b = box(10, 10, 10);
        const minkResult = minkowski(b, sphere(2));
        expect(isOk(minkResult)).toBe(true);
        const minkShape = unwrap(minkResult);

        const offsetResult = offset(b, 2);
        expect(isOk(offsetResult)).toBe(true);
        const offsetShape = unwrap(offsetResult);

        const minkVol = unwrap(measureVolume(minkShape));
        const offsetVol = unwrap(measureVolume(offsetShape));

        // Within 1% tolerance
        expect(Math.abs(minkVol - offsetVol) / offsetVol).toBeLessThan(0.01);
      });
    });

    describe('general path', () => {
      it('box + translated box produces volume ~1728 (12^3)', () => {
        const b = box(10, 10, 10);
        const tool = translate(box(2, 2, 2), [-1, -1, -1]);
        const result = minkowski(b, tool);

        expect(isOk(result)).toBe(true);
        const shape = unwrap(result);
        expect(isSolid(shape)).toBe(true);
        expect(unwrap(measureVolume(shape))).toBeCloseTo(1728, -1);
      });
    });

    describe('error handling', () => {
      it('returns error for null shape input', () => {
        const result = minkowski(makeNullShape(), sphere(1));
        expect(isErr(result)).toBe(true);
        expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
      });

      it('returns error for null tool input', () => {
        const result = minkowski(box(10, 10, 10), makeNullShape());
        expect(isErr(result)).toBe(true);
        expect(unwrapErr(result).code).toBe('MINKOWSKI_NULL_TOOL');
      });
    });
  });
});
