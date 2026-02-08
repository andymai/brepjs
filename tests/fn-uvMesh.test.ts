import { describe, it, expect, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { mesh, box, sphere } from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('meshShape with UV coordinates', () => {
  it('returns empty uvs by default', () => {
    const b = box(10, 10, 10);
    const m = mesh(b);
    expect(m.uvs).toBeInstanceOf(Float32Array);
    expect(m.uvs.length).toBe(0);
  });

  it('returns uv coordinates for a box when includeUVs is true', () => {
    const b = box(10, 10, 10);
    const m = mesh(b, { includeUVs: true, cache: false });

    expect(m.uvs).toBeInstanceOf(Float32Array);
    expect(m.uvs.length).toBeGreaterThan(0);
    // 2 UV components per vertex
    expect(m.uvs.length).toBe((m.vertices.length / 3) * 2);
  });

  it('returns uv coordinates for a sphere', () => {
    const s = sphere(5);
    const m = mesh(s, { includeUVs: true, cache: false });

    expect(m.uvs).toBeInstanceOf(Float32Array);
    expect(m.uvs.length).toBe((m.vertices.length / 3) * 2);
  });

  it('uv values are finite numbers', () => {
    const b = box(10, 10, 10);
    const m = mesh(b, { includeUVs: true, cache: false });

    for (let i = 0; i < m.uvs.length; i++) {
      expect(Number.isFinite(m.uvs[i])).toBe(true);
    }
  });

  it('still returns vertices, normals, and triangles alongside uvs', () => {
    const b = box(10, 10, 10);
    const m = mesh(b, { includeUVs: true, cache: false });

    expect(m.vertices.length).toBeGreaterThan(0);
    expect(m.normals.length).toBeGreaterThan(0);
    expect(m.triangles.length).toBeGreaterThan(0);
    expect(m.faceGroups.length).toBe(6); // box has 6 faces
  });

  it('can skip normals while including uvs', () => {
    const b = box(10, 10, 10);
    const m = mesh(b, { includeUVs: true, skipNormals: true, cache: false });

    expect(m.normals.length).toBe(0);
    expect(m.uvs.length).toBe((m.vertices.length / 3) * 2);
  });
});
