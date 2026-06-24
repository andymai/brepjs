import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  buildGeometry,
  buildInstancedMesh,
  instanceMatrix,
  findFaceGroupAt,
  meshBounds,
  meshSize,
  sectionPlane,
} from '@/geometry.js';
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

describe('instancing', () => {
  const tri: MeshData = {
    position: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normal: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    index: new Uint32Array([0, 1, 2]),
    edges: new Float32Array([]),
  };

  it('instanceMatrix maps a row-major 4x4 to a THREE.Matrix4 translation', () => {
    const m = instanceMatrix([
      [1, 0, 0, 5],
      [0, 1, 0, 6],
      [0, 0, 1, 7],
      [0, 0, 0, 1],
    ]);
    // THREE stores column-major; the translation lives in elements[12..14].
    expect(m.elements[12]).toBe(5);
    expect(m.elements[13]).toBe(6);
    expect(m.elements[14]).toBe(7);
  });

  it('buildInstancedMesh is one InstancedMesh + N placements, geometry meshed once', () => {
    const mesh = buildInstancedMesh(tri, [
      [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [0, 0, 1, 0],
        [0, 0, 0, 1],
      ],
      [
        [1, 0, 0, 10],
        [0, 1, 0, 0],
        [0, 0, 1, 0],
        [0, 0, 0, 1],
      ],
    ]);
    expect(mesh.count).toBe(2);
    expect(mesh.geometry.getAttribute('position').count).toBe(3); // one source mesh
    const out = new THREE.Matrix4();
    mesh.getMatrixAt(1, out);
    expect(out.elements[12]).toBe(10); // second instance translated +10 in x
  });

  it('computes instance-aware bounds covering far-translated placements', () => {
    const mesh = buildInstancedMesh(tri, [
      [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [0, 0, 1, 0],
        [0, 0, 0, 1],
      ],
      [
        [1, 0, 0, 100],
        [0, 1, 0, 0],
        [0, 0, 1, 0],
        [0, 0, 0, 1],
      ],
    ]);
    // Source spans x~0..1; the far instance sits at x=100, so the InstancedMesh
    // bounds must reach it (geometry-only bounds would be ~radius 1).
    expect(mesh.boundingSphere).not.toBeNull();
    expect(mesh.boundingSphere?.radius ?? 0).toBeGreaterThan(40);
  });
});
