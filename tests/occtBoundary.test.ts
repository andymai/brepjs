import { describe, expect, it, beforeAll } from 'vitest';
import { currentKernel, initKernel } from './setup.js';
import {
  toKernelVec,
  toKernelPnt,
  toKernelDir,
  fromKernelVec,
  fromKernelPnt,
  fromKernelDir,
  withKernelVec,
  withKernelPnt,
  withKernelDir,
  makeKernelAx1,
  makeKernelAx2,
  makeKernelAx3,
} from '@/core/kernelBoundary.js';
import { vecEquals } from '@/core/vecOps.js';
import type { Vec3 } from '@/core/types.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

// ---------------------------------------------------------------------------
// Direct conversions
// ---------------------------------------------------------------------------

describe.skipIf(currentKernel !== 'occt')('OCCT-specific: toKernelVec / fromKernelVec', () => {
  describe('toKernelVec / fromKernelVec', () => {
    it('round-trips a vector', () => {
      const v: Vec3 = [1, 2, 3];
      const ocVec = toKernelVec(v);
      const back = fromKernelVec(ocVec);
      ocVec.delete();
      expect(vecEquals(back, v)).toBe(true);
    });

    it('handles negative values', () => {
      const v: Vec3 = [-5, -10, -15];
      const ocVec = toKernelVec(v);
      const back = fromKernelVec(ocVec);
      ocVec.delete();
      expect(vecEquals(back, v)).toBe(true);
    });

    it('handles zero vector', () => {
      const v: Vec3 = [0, 0, 0];
      const ocVec = toKernelVec(v);
      const back = fromKernelVec(ocVec);
      ocVec.delete();
      expect(vecEquals(back, v)).toBe(true);
    });
  });

  describe('toKernelPnt / fromKernelPnt', () => {
    it('round-trips a point', () => {
      const p: Vec3 = [10, 20, 30];
      const ocPnt = toKernelPnt(p);
      const back = fromKernelPnt(ocPnt);
      ocPnt.delete();
      expect(vecEquals(back, p)).toBe(true);
    });

    it('handles origin', () => {
      const p: Vec3 = [0, 0, 0];
      const ocPnt = toKernelPnt(p);
      const back = fromKernelPnt(ocPnt);
      ocPnt.delete();
      expect(vecEquals(back, p)).toBe(true);
    });
  });

  describe('toKernelDir / fromKernelDir', () => {
    it('round-trips a direction', () => {
      const d: Vec3 = [1, 0, 0];
      const ocDir = toKernelDir(d);
      const back = fromKernelDir(ocDir);
      ocDir.delete();
      expect(vecEquals(back, d)).toBe(true);
    });

    it('round-trips Z direction', () => {
      const d: Vec3 = [0, 0, 1];
      const ocDir = toKernelDir(d);
      const back = fromKernelDir(ocDir);
      ocDir.delete();
      expect(vecEquals(back, d)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Scoped conversions
  // ---------------------------------------------------------------------------

  describe('withKernelVec', () => {
    it('provides kernel gp_Vec and auto-cleans', () => {
      const result = withKernelVec([3, 4, 5], (ocVec) => {
        return fromKernelVec(ocVec);
      });
      expect(vecEquals(result, [3, 4, 5])).toBe(true);
    });

    it('cleans up even on throw', () => {
      expect(() =>
        withKernelVec([1, 0, 0], () => {
          throw new Error('test');
        })
      ).toThrow('test');
    });
  });

  describe('withKernelPnt', () => {
    it('provides kernel gp_Pnt and auto-cleans', () => {
      const result = withKernelPnt([10, 20, 30], (ocPnt) => {
        return fromKernelPnt(ocPnt);
      });
      expect(vecEquals(result, [10, 20, 30])).toBe(true);
    });

    it('cleans up even on throw', () => {
      expect(() =>
        withKernelPnt([1, 0, 0], () => {
          throw new Error('test');
        })
      ).toThrow('test');
    });
  });

  describe('withKernelDir', () => {
    it('provides kernel gp_Dir and auto-cleans', () => {
      const result = withKernelDir([0, 1, 0], (ocDir) => {
        return fromKernelDir(ocDir);
      });
      expect(vecEquals(result, [0, 1, 0])).toBe(true);
    });

    it('cleans up even on throw', () => {
      expect(() =>
        withKernelDir([0, 0, 1], () => {
          throw new Error('test');
        })
      ).toThrow('test');
    });
  });

  // ---------------------------------------------------------------------------
  // Axis construction
  // ---------------------------------------------------------------------------

  describe('makeKernelAx1', () => {
    it('creates axis with point and direction', () => {
      const ax = makeKernelAx1([0, 0, 0], [0, 0, 1]);
      const loc = ax.Location();
      const dir = ax.Direction();
      expect(loc.X()).toBeCloseTo(0);
      expect(loc.Y()).toBeCloseTo(0);
      expect(loc.Z()).toBeCloseTo(0);
      expect(dir.X()).toBeCloseTo(0);
      expect(dir.Y()).toBeCloseTo(0);
      expect(dir.Z()).toBeCloseTo(1);
      loc.delete();
      dir.delete();
      ax.delete();
    });

    it('creates axis at non-origin', () => {
      const ax = makeKernelAx1([5, 10, 15], [1, 0, 0]);
      const loc = ax.Location();
      expect(loc.X()).toBeCloseTo(5);
      expect(loc.Y()).toBeCloseTo(10);
      expect(loc.Z()).toBeCloseTo(15);
      loc.delete();
      ax.delete();
    });
  });

  describe('makeKernelAx2', () => {
    it('creates Ax2 with z direction only', () => {
      const ax = makeKernelAx2([0, 0, 0], [0, 0, 1]);
      const dir = ax.Direction();
      expect(dir.Z()).toBeCloseTo(1);
      dir.delete();
      ax.delete();
    });

    it('creates Ax2 with z and x directions', () => {
      const ax = makeKernelAx2([0, 0, 0], [0, 0, 1], [1, 0, 0]);
      const xDir = ax.XDirection();
      const dir = ax.Direction();
      expect(xDir.X()).toBeCloseTo(1);
      expect(dir.Z()).toBeCloseTo(1);
      xDir.delete();
      dir.delete();
      ax.delete();
    });
  });

  describe('makeKernelAx3', () => {
    it('creates Ax3 with z direction only', () => {
      const ax = makeKernelAx3([0, 0, 0], [0, 0, 1]);
      const dir = ax.Direction();
      expect(dir.Z()).toBeCloseTo(1);
      dir.delete();
      ax.delete();
    });

    it('creates Ax3 with z and x directions', () => {
      const ax = makeKernelAx3([0, 0, 0], [0, 0, 1], [1, 0, 0]);
      const xDir = ax.XDirection();
      expect(xDir.X()).toBeCloseTo(1);
      xDir.delete();
      ax.delete();
    });

    it('creates Ax3 at non-origin', () => {
      const ax = makeKernelAx3([5, 10, 15], [0, 1, 0]);
      const loc = ax.Location();
      expect(loc.X()).toBeCloseTo(5);
      expect(loc.Y()).toBeCloseTo(10);
      expect(loc.Z()).toBeCloseTo(15);
      loc.delete();
      ax.delete();
    });
  });
});
