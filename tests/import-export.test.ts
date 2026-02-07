import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { makeBox, exportSTEP, deserializeShape, serializeShape } from '../src/index.js';
import { meshShape } from '../src/topology/meshFns.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('Shape serialization', () => {
  it('serializes and deserializes a shape', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const serialized = serializeShape(box);
    expect(serialized).toBeDefined();
    expect(typeof serialized).toBe('string');
    expect(serialized.length).toBeGreaterThan(0);

    const deserialized = deserializeShape(serialized);
    expect(deserialized).toBeDefined();
  });
});

describe('Mesh generation', () => {
  it('meshes a box', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const mesh = meshShape(box as any);
    expect(mesh).toBeDefined();
    expect(mesh.vertices).toBeDefined();
    expect(mesh.triangles).toBeDefined();
    expect(mesh.vertices.length).toBeGreaterThan(0);
    expect(mesh.triangles.length).toBeGreaterThan(0);
  });
});
