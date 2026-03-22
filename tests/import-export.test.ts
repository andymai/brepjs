import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { box, deserializeShape, toBREP, mesh, unwrap } from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('Shape serialization', () => {
  it('serializes and deserializes a shape', () => {
    const b = box(10, 10, 10);
    const serialized = unwrap(toBREP(b));
    expect(serialized).toBeDefined();
    expect(typeof serialized).toBe('string');
    expect(serialized.length).toBeGreaterThan(0);

    const deserialized = deserializeShape(serialized);
    expect(deserialized).toBeDefined();
  });
});

describe('Mesh generation', () => {
  it('meshes a box', () => {
    const b = box(10, 10, 10);
    const m = mesh(b);
    expect(m).toBeDefined();
    expect(m.vertices).toBeDefined();
    expect(m.triangles).toBeDefined();
    expect(m.vertices.length).toBeGreaterThan(0);
    expect(m.triangles.length).toBeGreaterThan(0);
  });
});
