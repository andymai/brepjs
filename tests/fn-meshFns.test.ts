import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  box,
  mesh,
  meshEdges,
  exportSTEP,
  exportSTL,
  isOk,
  unwrap,
  clearMeshCache,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('mesh', () => {
  it('meshes a box into triangles', () => {
    const b = box(10, 10, 10);
    const m = mesh(b);
    expect(m.vertices.length).toBeGreaterThan(0);
    expect(m.triangles.length).toBeGreaterThan(0);
    expect(m.normals.length).toBeGreaterThan(0);
    expect(m.faceGroups.length).toBe(6); // 6 faces
  });

  it('respects tolerance option', () => {
    const b = box(10, 10, 10);
    const coarse = mesh(b, { tolerance: 1 });
    const fine = mesh(b, { tolerance: 0.01 });
    // Fine mesh may have more vertices
    expect(fine.vertices.length).toBeGreaterThanOrEqual(coarse.vertices.length);
  });

  it('returns cached result on second call with same parameters', () => {
    clearMeshCache();
    const b = box(10, 10, 10);
    const mesh1 = mesh(b, { tolerance: 0.1 });
    const mesh2 = mesh(b, { tolerance: 0.1 });
    // Cached — same object reference
    expect(mesh2).toBe(mesh1);
  });

  it('bypasses cache when cache option is false', () => {
    clearMeshCache();
    const b = box(10, 10, 10);
    const mesh1 = mesh(b, { tolerance: 0.1 });
    const mesh2 = mesh(b, { tolerance: 0.1, cache: false });
    // Not cached — different object
    expect(mesh2).not.toBe(mesh1);
  });
});

describe('meshEdges', () => {
  it('meshes edge curves of a box', () => {
    const b = box(10, 10, 10);
    const edgeMesh = meshEdges(b);
    expect(edgeMesh.lines.length).toBeGreaterThan(0);
    expect(edgeMesh.edgeGroups.length).toBe(12); // 12 edges on a box
  });

  it('returns cached result on second call with same parameters', () => {
    clearMeshCache();
    const b = box(10, 10, 10);
    const mesh1 = meshEdges(b, { tolerance: 0.1 });
    const mesh2 = meshEdges(b, { tolerance: 0.1 });
    // Cached — same object reference
    expect(mesh2).toBe(mesh1);
  });

  it('bypasses cache when cache option is false', () => {
    clearMeshCache();
    const b = box(10, 10, 10);
    const mesh1 = meshEdges(b, { tolerance: 0.1 });
    const mesh2 = meshEdges(b, { tolerance: 0.1, cache: false });
    // Not cached — different object
    expect(mesh2).not.toBe(mesh1);
  });
});

describe('exportSTEP', () => {
  it('exports a shape to STEP blob', () => {
    const b = box(10, 10, 10);
    const result = exportSTEP(b);
    expect(isOk(result)).toBe(true);
    const blob = unwrap(result);
    expect(blob.size).toBeGreaterThan(0);
  });
});

describe('exportSTL', () => {
  it('exports a shape to STL blob', () => {
    const b = box(10, 10, 10);
    const result = exportSTL(b);
    expect(isOk(result)).toBe(true);
    const blob = unwrap(result);
    expect(blob.size).toBeGreaterThan(0);
  });
});
