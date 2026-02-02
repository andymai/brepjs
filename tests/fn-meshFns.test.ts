import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  makeBox,
  makeLine,
  // functional API
  castShape,
  meshShape,
  meshShapeEdges,
  fnExportSTEP,
  fnExportSTL,
  isOk,
  unwrap,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('meshShape', () => {
  it('meshes a box into triangles', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const mesh = meshShape(castShape(box.wrapped));
    expect(mesh.vertices.length).toBeGreaterThan(0);
    expect(mesh.triangles.length).toBeGreaterThan(0);
    expect(mesh.normals.length).toBeGreaterThan(0);
    expect(mesh.faceGroups.length).toBe(6); // 6 faces
  });

  it('respects tolerance option', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const coarse = meshShape(castShape(box.wrapped), { tolerance: 1 });
    const fine = meshShape(castShape(box.wrapped), { tolerance: 0.01 });
    // Fine mesh may have more vertices
    expect(fine.vertices.length).toBeGreaterThanOrEqual(coarse.vertices.length);
  });
});

describe('meshShapeEdges', () => {
  it('meshes edge curves of a box', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const edgeMesh = meshShapeEdges(castShape(box.wrapped));
    expect(edgeMesh.lines.length).toBeGreaterThan(0);
    expect(edgeMesh.edgeGroups.length).toBe(12); // 12 edges on a box
  });
});

describe('fnExportSTEP', () => {
  it('exports a shape to STEP blob', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const result = fnExportSTEP(castShape(box.wrapped));
    expect(isOk(result)).toBe(true);
    const blob = unwrap(result);
    expect(blob.size).toBeGreaterThan(0);
  });
});

describe('fnExportSTL', () => {
  it('exports a shape to STL blob', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const result = fnExportSTL(castShape(box.wrapped));
    expect(isOk(result)).toBe(true);
    const blob = unwrap(result);
    expect(blob.size).toBeGreaterThan(0);
  });
});
