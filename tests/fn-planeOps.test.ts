import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  createPlane,
  createNamedPlane,
  resolvePlane,
  planeToWorld,
  planeToLocal,
  planeToWorldVec3,
  planeToLocalVec3,
  translatePlane,
  translatePlaneTo,
  pivotPlane,
  rotatePlane2DAxes,
} from '../src/core/planeOps.js';
import { vecEquals, vecLength, vecDot } from '../src/core/vecOps.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('createPlane', () => {
  it('creates XY plane with default args', () => {
    const plane = createPlane([0, 0, 0], null, [0, 0, 1]);
    expect(vecEquals(plane.origin, [0, 0, 0])).toBe(true);
    expect(vecEquals(plane.zDir, [0, 0, 1])).toBe(true);
    // xDir should be perpendicular to zDir
    expect(Math.abs(vecDot(plane.xDir, plane.zDir))).toBeLessThan(1e-10);
    // yDir should be perpendicular to both
    expect(Math.abs(vecDot(plane.yDir, plane.zDir))).toBeLessThan(1e-10);
    expect(Math.abs(vecDot(plane.yDir, plane.xDir))).toBeLessThan(1e-10);
  });

  it('creates plane with explicit xDir', () => {
    const plane = createPlane([0, 0, 0], [1, 0, 0], [0, 0, 1]);
    expect(vecEquals(plane.xDir, [1, 0, 0])).toBe(true);
    expect(vecEquals(plane.zDir, [0, 0, 1])).toBe(true);
  });

  it('creates plane with non-origin', () => {
    const plane = createPlane([5, 10, 15], null, [0, 1, 0]);
    expect(vecEquals(plane.origin, [5, 10, 15])).toBe(true);
    expect(vecEquals(plane.zDir, [0, 1, 0])).toBe(true);
  });

  it('all directions have unit length', () => {
    const plane = createPlane([0, 0, 0], null, [0, 0, 1]);
    expect(vecLength(plane.xDir)).toBeCloseTo(1);
    expect(vecLength(plane.yDir)).toBeCloseTo(1);
    expect(vecLength(plane.zDir)).toBeCloseTo(1);
  });

  it('throws for zero normal', () => {
    expect(() => createPlane([0, 0, 0], null, [0, 0, 0])).toThrow();
  });

  it('throws for zero xDir when explicitly provided', () => {
    expect(() => createPlane([0, 0, 0], [0, 0, 0], [0, 0, 1])).toThrow();
  });
});

describe('createNamedPlane', () => {
  it('creates XY plane', () => {
    const result = createNamedPlane('XY');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(vecEquals(result.value.zDir, [0, 0, 1])).toBe(true);
    expect(vecEquals(result.value.xDir, [1, 0, 0])).toBe(true);
  });

  it('creates YZ plane', () => {
    const result = createNamedPlane('YZ');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(vecEquals(result.value.zDir, [1, 0, 0])).toBe(true);
  });

  it('creates ZX plane', () => {
    const result = createNamedPlane('ZX');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(vecEquals(result.value.zDir, [0, 1, 0])).toBe(true);
  });

  it('creates plane with numeric origin offset', () => {
    const result = createNamedPlane('XY', 5);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // offset along normal (Z axis for XY)
    expect(result.value.origin[2]).toBeCloseTo(5);
  });

  it('creates plane with point origin', () => {
    const result = createNamedPlane('XY', [1, 2, 3]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(vecEquals(result.value.origin, [1, 2, 3])).toBe(true);
  });

  it('creates front/back/left/right/top/bottom planes', () => {
    for (const name of ['front', 'back', 'left', 'right', 'top', 'bottom'] as const) {
      const result = createNamedPlane(name);
      expect(result.ok).toBe(true);
    }
  });

  it('returns Err for unknown plane', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing invalid input
    const result = createNamedPlane('INVALID' as any);
    expect(result.ok).toBe(false);
  });
});

describe('resolvePlane', () => {
  it('resolves string plane name', () => {
    const plane = resolvePlane('XY');
    expect(vecEquals(plane.zDir, [0, 0, 1])).toBe(true);
  });

  it('passes through Plane object', () => {
    const custom = createPlane([1, 2, 3], [1, 0, 0], [0, 0, 1]);
    const resolved = resolvePlane(custom);
    expect(resolved).toBe(custom);
  });

  it('throws for invalid plane name', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing invalid input
    expect(() => resolvePlane('INVALID' as any)).toThrow();
  });
});

describe('planeToWorld / planeToLocal', () => {
  it('converts local to world on XY plane', () => {
    const plane = resolvePlane('XY');
    const world = planeToWorld(plane, [3, 4]);
    expect(world[0]).toBeCloseTo(3);
    expect(world[1]).toBeCloseTo(4);
    expect(world[2]).toBeCloseTo(0);
  });

  it('converts world to local on XY plane', () => {
    const plane = resolvePlane('XY');
    const local = planeToLocal(plane, [3, 4, 0]);
    expect(local[0]).toBeCloseTo(3);
    expect(local[1]).toBeCloseTo(4);
  });

  it('round-trips correctly', () => {
    const plane = resolvePlane('XY');
    const local = [7, 11] as const;
    const world = planeToWorld(plane, local);
    const backToLocal = planeToLocal(plane, world);
    expect(backToLocal[0]).toBeCloseTo(local[0]);
    expect(backToLocal[1]).toBeCloseTo(local[1]);
  });

  it('works with offset plane', () => {
    const plane = resolvePlane('XY', 10);
    const world = planeToWorld(plane, [1, 2]);
    expect(world[2]).toBeCloseTo(10);
  });
});

describe('planeToWorldVec3 / planeToLocalVec3', () => {
  it('converts 3D local to world on XY plane', () => {
    const plane = resolvePlane('XY');
    const world = planeToWorldVec3(plane, [3, 4, 5]);
    expect(world[0]).toBeCloseTo(3);
    expect(world[1]).toBeCloseTo(4);
    expect(world[2]).toBeCloseTo(5);
  });

  it('converts 3D world to local on XY plane', () => {
    const plane = resolvePlane('XY');
    const local = planeToLocalVec3(plane, [3, 4, 5]);
    expect(local[0]).toBeCloseTo(3);
    expect(local[1]).toBeCloseTo(4);
    expect(local[2]).toBeCloseTo(5);
  });

  it('round-trips correctly with 3D coordinates', () => {
    const plane = resolvePlane('XY');
    const local = [7, 11, 13] as const;
    const world = planeToWorldVec3(plane, local);
    const backToLocal = planeToLocalVec3(plane, world);
    expect(backToLocal[0]).toBeCloseTo(local[0]);
    expect(backToLocal[1]).toBeCloseTo(local[1]);
    expect(backToLocal[2]).toBeCloseTo(local[2]);
  });

  it('works with rotated plane', () => {
    const plane = resolvePlane('YZ'); // Normal along X
    const world = planeToWorldVec3(plane, [1, 2, 3]);
    // YZ plane: x maps to Y, y maps to Z, z maps to X
    expect(world[0]).toBeCloseTo(3); // z component along X
    expect(world[1]).toBeCloseTo(1); // x component along Y
    expect(world[2]).toBeCloseTo(2); // y component along Z
  });

  it('works with offset plane', () => {
    const plane = resolvePlane('XY', 10);
    const world = planeToWorldVec3(plane, [1, 2, 3]);
    expect(world[0]).toBeCloseTo(1);
    expect(world[1]).toBeCloseTo(2);
    expect(world[2]).toBeCloseTo(13); // 10 + 3
  });
});

describe('translatePlane', () => {
  it('translates origin by vector', () => {
    const plane = resolvePlane('XY');
    const translated = translatePlane(plane, [5, 10, 15]);
    expect(vecEquals(translated.origin, [5, 10, 15])).toBe(true);
    // Directions unchanged
    expect(vecEquals(translated.xDir, plane.xDir)).toBe(true);
    expect(vecEquals(translated.yDir, plane.yDir)).toBe(true);
    expect(vecEquals(translated.zDir, plane.zDir)).toBe(true);
  });
});

describe('translatePlaneTo', () => {
  it('moves plane to new origin', () => {
    const plane = resolvePlane('XY');
    const moved = translatePlaneTo(plane, [100, 200, 300]);
    expect(vecEquals(moved.origin, [100, 200, 300])).toBe(true);
    expect(vecEquals(moved.zDir, plane.zDir)).toBe(true);
  });
});

describe('pivotPlane', () => {
  it('rotates plane around axis', () => {
    const plane = resolvePlane('XY');
    const pivoted = pivotPlane(plane, 90, [1, 0, 0]);
    // After 90 degree rotation around X, Z normal [0,0,1] becomes [0,-1,0]
    expect(pivoted.zDir[1]).toBeCloseTo(-1, 3);
    expect(pivoted.zDir[2]).toBeCloseTo(0, 3);
  });

  it('preserves origin', () => {
    const plane = translatePlaneTo(resolvePlane('XY'), [5, 5, 5]);
    const pivoted = pivotPlane(plane, 45);
    expect(vecEquals(pivoted.origin, [5, 5, 5])).toBe(true);
  });

  it('all directions remain unit length', () => {
    const pivoted = pivotPlane(resolvePlane('XY'), 37, [1, 1, 0]);
    expect(vecLength(pivoted.xDir)).toBeCloseTo(1);
    expect(vecLength(pivoted.yDir)).toBeCloseTo(1);
    expect(vecLength(pivoted.zDir)).toBeCloseTo(1);
  });
});

describe('rotatePlane2DAxes', () => {
  it('rotates x/y around normal', () => {
    const plane = resolvePlane('XY');
    const rotated = rotatePlane2DAxes(plane, 90);
    // After 90deg rotation on XY plane: xDir should become Y direction
    expect(rotated.xDir[0]).toBeCloseTo(0, 3);
    expect(rotated.xDir[1]).toBeCloseTo(1, 3);
  });

  it('preserves normal direction', () => {
    const plane = resolvePlane('XY');
    const rotated = rotatePlane2DAxes(plane, 45);
    expect(vecEquals(rotated.zDir, plane.zDir)).toBe(true);
  });

  it('preserves origin', () => {
    const plane = translatePlaneTo(resolvePlane('XY'), [5, 5, 5]);
    const rotated = rotatePlane2DAxes(plane, 30);
    expect(vecEquals(rotated.origin, [5, 5, 5])).toBe(true);
  });
});
