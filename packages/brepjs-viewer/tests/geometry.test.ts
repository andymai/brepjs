import { describe, it, expect } from 'vitest';
import { buildGeometry, findFaceGroupAt, meshBounds, meshSize, sectionPlane } from '@/geometry.js';
import type { MeshData } from '@/types.js';

const data: MeshData = {
  position: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  normal: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
  index: new Uint32Array([0, 1, 2]),
  edges: new Float32Array([]),
  faceGroups: [{ start: 0, count: 3, faceId: 7 }],
};

describe('render core', () => {
  it('buildGeometry sets position/normal/index attributes', () => {
    const g = buildGeometry(data);
    expect(g.getAttribute('position').count).toBe(3);
    expect(g.getAttribute('normal').count).toBe(3);
    expect(g.getIndex()?.count).toBe(3);
  });
  it('findFaceGroupAt maps a triangle index to its faceId via binary search', () => {
    expect(findFaceGroupAt(data.faceGroups!, 0)?.faceId).toBe(7);
    expect(findFaceGroupAt(data.faceGroups!, 5)).toBeNull();
  });
});

describe('bounds + section', () => {
  const box: MeshData = {
    position: new Float32Array([-2, -1, -3, 4, 5, 6]),
    normal: new Float32Array([0, 0, 1, 0, 0, 1]),
    index: new Uint32Array([0, 1, 0]),
    edges: new Float32Array([]),
  };
  it('meshBounds spans min/max per axis; meshSize is the extent', () => {
    expect(meshBounds(box)).toEqual({ min: [-2, -1, -3], max: [4, 5, 6] });
    expect(meshSize(box)).toEqual([6, 6, 9]);
  });
  it('sectionPlane keeps axis·point >= position; flip inverts the kept half', () => {
    const p = sectionPlane('x', 1);
    // distanceToPoint >= 0 is kept; < 0 is clipped
    expect(p.distanceToPoint({ x: 3, y: 0, z: 0 } as never)).toBeGreaterThan(0);
    expect(p.distanceToPoint({ x: -1, y: 0, z: 0 } as never)).toBeLessThan(0);
    const flipped = sectionPlane('x', 1, true);
    expect(flipped.distanceToPoint({ x: 3, y: 0, z: 0 } as never)).toBeLessThan(0);
    expect(flipped.distanceToPoint({ x: -1, y: 0, z: 0 } as never)).toBeGreaterThan(0);
  });
});
