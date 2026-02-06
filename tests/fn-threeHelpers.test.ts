import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  makeBox,
  castShape,
  meshShape,
  meshShapeEdges,
  toBufferGeometryData,
  toLineGeometryData,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('toBufferGeometryData', () => {
  it('converts a box mesh to BufferGeometry-compatible data', () => {
    const box = castShape(makeBox([0, 0, 0], [10, 10, 10]).wrapped);
    const mesh = meshShape(box, { tolerance: 0.1, angularTolerance: 0.5 });
    const data = toBufferGeometryData(mesh);

    // Should have position, normal, and index arrays
    expect(data.position).toBeInstanceOf(Float32Array);
    expect(data.normal).toBeInstanceOf(Float32Array);
    expect(data.index).toBeInstanceOf(Uint32Array);

    // Positions and normals should have same length (3 floats per vertex)
    expect(data.position.length).toBe(data.normal.length);
    expect(data.position.length).toBeGreaterThan(0);

    // Position length must be divisible by 3
    expect(data.position.length % 3).toBe(0);

    // Index length must be divisible by 3 (triangles)
    expect(data.index.length % 3).toBe(0);
    expect(data.index.length).toBeGreaterThan(0);
  });

  it('returns same underlying typed arrays (zero-copy)', () => {
    const box = castShape(makeBox([0, 0, 0], [5, 5, 5]).wrapped);
    const mesh = meshShape(box, { tolerance: 0.1, angularTolerance: 0.5 });
    const data = toBufferGeometryData(mesh);

    // Should reference the same buffers (no copy)
    expect(data.position.buffer).toBe(mesh.vertices.buffer);
    expect(data.normal.buffer).toBe(mesh.normals.buffer);
    expect(data.index.buffer).toBe(mesh.triangles.buffer);
  });

  it('vertex count matches normals count', () => {
    const box = castShape(makeBox([0, 0, 0], [10, 20, 30]).wrapped);
    const mesh = meshShape(box, { tolerance: 0.1, angularTolerance: 0.5 });
    const data = toBufferGeometryData(mesh);

    const vertexCount = data.position.length / 3;
    const normalCount = data.normal.length / 3;
    expect(vertexCount).toBe(normalCount);
  });
});

describe('toLineGeometryData', () => {
  it('converts edge mesh to line geometry data', () => {
    const box = castShape(makeBox([0, 0, 0], [10, 10, 10]).wrapped);
    const edgeMesh = meshShapeEdges(box, { tolerance: 0.1, angularTolerance: 0.5 });
    const data = toLineGeometryData(edgeMesh);

    expect(data.position).toBeInstanceOf(Float32Array);
    expect(data.position.length).toBeGreaterThan(0);
    // 3 floats per point
    expect(data.position.length % 3).toBe(0);
  });
});
