import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  toOcVec,
  toOcPnt,
  toOcDir,
  pointToOcPnt,
  pointToOcDir,
  fromOcVec,
  fromOcPnt,
  fromOcDir,
  withOcVec,
  withOcPnt,
  withOcDir,
  makeOcAx1,
  makeOcAx2,
  makeOcAx3,
} from '../src/core/occtBoundary.js';
import { vecEquals } from '../src/core/vecOps.js';
import type { Vec3 } from '../src/core/types.js';

beforeAll(async () => {
  await initOC();
}, 30000);

// ---------------------------------------------------------------------------
// Direct conversions
// ---------------------------------------------------------------------------

describe('toOcVec / fromOcVec', () => {
  it('round-trips a vector', () => {
    const v: Vec3 = [1, 2, 3];
    const ocVec = toOcVec(v);
    const back = fromOcVec(ocVec);
    ocVec.delete();
    expect(vecEquals(back, v)).toBe(true);
  });

  it('handles negative values', () => {
    const v: Vec3 = [-5, -10, -15];
    const ocVec = toOcVec(v);
    const back = fromOcVec(ocVec);
    ocVec.delete();
    expect(vecEquals(back, v)).toBe(true);
  });

  it('handles zero vector', () => {
    const v: Vec3 = [0, 0, 0];
    const ocVec = toOcVec(v);
    const back = fromOcVec(ocVec);
    ocVec.delete();
    expect(vecEquals(back, v)).toBe(true);
  });
});

describe('toOcPnt / fromOcPnt', () => {
  it('round-trips a point', () => {
    const p: Vec3 = [10, 20, 30];
    const ocPnt = toOcPnt(p);
    const back = fromOcPnt(ocPnt);
    ocPnt.delete();
    expect(vecEquals(back, p)).toBe(true);
  });

  it('handles origin', () => {
    const p: Vec3 = [0, 0, 0];
    const ocPnt = toOcPnt(p);
    const back = fromOcPnt(ocPnt);
    ocPnt.delete();
    expect(vecEquals(back, p)).toBe(true);
  });
});

describe('toOcDir / fromOcDir', () => {
  it('round-trips a direction', () => {
    const d: Vec3 = [1, 0, 0];
    const ocDir = toOcDir(d);
    const back = fromOcDir(ocDir);
    ocDir.delete();
    expect(vecEquals(back, d)).toBe(true);
  });

  it('round-trips Z direction', () => {
    const d: Vec3 = [0, 0, 1];
    const ocDir = toOcDir(d);
    const back = fromOcDir(ocDir);
    ocDir.delete();
    expect(vecEquals(back, d)).toBe(true);
  });
});

describe('pointToOcPnt / pointToOcDir', () => {
  it('converts Vec2 to gp_Pnt with z=0', () => {
    const ocPnt = pointToOcPnt([5, 10]);
    const back = fromOcPnt(ocPnt);
    ocPnt.delete();
    expect(vecEquals(back, [5, 10, 0])).toBe(true);
  });

  it('converts Vec3 to gp_Pnt', () => {
    const ocPnt = pointToOcPnt([1, 2, 3]);
    const back = fromOcPnt(ocPnt);
    ocPnt.delete();
    expect(vecEquals(back, [1, 2, 3])).toBe(true);
  });

  it('converts PointInput to gp_Dir', () => {
    const ocDir = pointToOcDir([0, 0, 1]);
    const back = fromOcDir(ocDir);
    ocDir.delete();
    expect(vecEquals(back, [0, 0, 1])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scoped conversions
// ---------------------------------------------------------------------------

describe('withOcVec', () => {
  it('provides OCCT gp_Vec and auto-cleans', () => {
    const result = withOcVec([3, 4, 5], (ocVec) => {
      return fromOcVec(ocVec);
    });
    expect(vecEquals(result, [3, 4, 5])).toBe(true);
  });

  it('cleans up even on throw', () => {
    expect(() =>
      withOcVec([1, 0, 0], () => {
        throw new Error('test');
      })
    ).toThrow('test');
  });
});

describe('withOcPnt', () => {
  it('provides OCCT gp_Pnt and auto-cleans', () => {
    const result = withOcPnt([10, 20, 30], (ocPnt) => {
      return fromOcPnt(ocPnt);
    });
    expect(vecEquals(result, [10, 20, 30])).toBe(true);
  });

  it('cleans up even on throw', () => {
    expect(() =>
      withOcPnt([1, 0, 0], () => {
        throw new Error('test');
      })
    ).toThrow('test');
  });
});

describe('withOcDir', () => {
  it('provides OCCT gp_Dir and auto-cleans', () => {
    const result = withOcDir([0, 1, 0], (ocDir) => {
      return fromOcDir(ocDir);
    });
    expect(vecEquals(result, [0, 1, 0])).toBe(true);
  });

  it('cleans up even on throw', () => {
    expect(() =>
      withOcDir([0, 0, 1], () => {
        throw new Error('test');
      })
    ).toThrow('test');
  });
});

// ---------------------------------------------------------------------------
// Axis construction
// ---------------------------------------------------------------------------

describe('makeOcAx1', () => {
  it('creates axis with point and direction', () => {
    const ax = makeOcAx1([0, 0, 0], [0, 0, 1]);
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
    const ax = makeOcAx1([5, 10, 15], [1, 0, 0]);
    const loc = ax.Location();
    expect(loc.X()).toBeCloseTo(5);
    expect(loc.Y()).toBeCloseTo(10);
    expect(loc.Z()).toBeCloseTo(15);
    loc.delete();
    ax.delete();
  });
});

describe('makeOcAx2', () => {
  it('creates Ax2 with z direction only', () => {
    const ax = makeOcAx2([0, 0, 0], [0, 0, 1]);
    const dir = ax.Direction();
    expect(dir.Z()).toBeCloseTo(1);
    dir.delete();
    ax.delete();
  });

  it('creates Ax2 with z and x directions', () => {
    const ax = makeOcAx2([0, 0, 0], [0, 0, 1], [1, 0, 0]);
    const xDir = ax.XDirection();
    const dir = ax.Direction();
    expect(xDir.X()).toBeCloseTo(1);
    expect(dir.Z()).toBeCloseTo(1);
    xDir.delete();
    dir.delete();
    ax.delete();
  });
});

describe('makeOcAx3', () => {
  it('creates Ax3 with z direction only', () => {
    const ax = makeOcAx3([0, 0, 0], [0, 0, 1]);
    const dir = ax.Direction();
    expect(dir.Z()).toBeCloseTo(1);
    dir.delete();
    ax.delete();
  });

  it('creates Ax3 with z and x directions', () => {
    const ax = makeOcAx3([0, 0, 0], [0, 0, 1], [1, 0, 0]);
    const xDir = ax.XDirection();
    expect(xDir.X()).toBeCloseTo(1);
    xDir.delete();
    ax.delete();
  });

  it('creates Ax3 at non-origin', () => {
    const ax = makeOcAx3([5, 10, 15], [0, 1, 0]);
    const loc = ax.Location();
    expect(loc.X()).toBeCloseTo(5);
    expect(loc.Y()).toBeCloseTo(10);
    expect(loc.Z()).toBeCloseTo(15);
    loc.delete();
    ax.delete();
  });
});
