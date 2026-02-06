import { describe, it, expect, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { meshShape, makeBox, makeSphere } from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('meshShape with UV coordinates', () => {
  it('returns empty uvs by default', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const mesh = meshShape(box);
    expect(mesh.uvs).toBeInstanceOf(Float32Array);
    expect(mesh.uvs.length).toBe(0);
  });

  it('returns uv coordinates for a box when includeUVs is true', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const mesh = meshShape(box, { includeUVs: true, cache: false });

    expect(mesh.uvs).toBeInstanceOf(Float32Array);
    expect(mesh.uvs.length).toBeGreaterThan(0);
    // 2 UV components per vertex
    expect(mesh.uvs.length).toBe((mesh.vertices.length / 3) * 2);
  });

  it('returns uv coordinates for a sphere', () => {
    const sphere = makeSphere(5);
    const mesh = meshShape(sphere, { includeUVs: true, cache: false });

    expect(mesh.uvs).toBeInstanceOf(Float32Array);
    expect(mesh.uvs.length).toBe((mesh.vertices.length / 3) * 2);
  });

  it('uv values are finite numbers', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const mesh = meshShape(box, { includeUVs: true, cache: false });

    for (let i = 0; i < mesh.uvs.length; i++) {
      expect(Number.isFinite(mesh.uvs[i])).toBe(true);
    }
  });

  it('still returns vertices, normals, and triangles alongside uvs', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const mesh = meshShape(box, { includeUVs: true, cache: false });

    expect(mesh.vertices.length).toBeGreaterThan(0);
    expect(mesh.normals.length).toBeGreaterThan(0);
    expect(mesh.triangles.length).toBeGreaterThan(0);
    expect(mesh.faceGroups.length).toBe(6); // box has 6 faces
  });

  it('can skip normals while including uvs', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const mesh = meshShape(box, { includeUVs: true, skipNormals: true, cache: false });

    expect(mesh.normals.length).toBe(0);
    expect(mesh.uvs.length).toBe((mesh.vertices.length / 3) * 2);
  });
});
