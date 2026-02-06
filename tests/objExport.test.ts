import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { makeBox, meshShape, exportOBJ } from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('exportOBJ', () => {
  it('exports a box mesh to OBJ format', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const mesh = meshShape(box);
    const obj = exportOBJ(mesh);

    expect(obj).toContain('# brepjs OBJ export');

    const lines = obj.split('\n');
    const vLines = lines.filter((l) => l.startsWith('v '));
    expect(vLines.length).toBe(mesh.vertices.length / 3);

    const vnLines = lines.filter((l) => l.startsWith('vn '));
    expect(vnLines.length).toBe(mesh.normals.length / 3);

    const fLines = lines.filter((l) => l.startsWith('f '));
    expect(fLines.length).toBe(mesh.triangles.length / 3);

    const gLines = lines.filter((l) => l.startsWith('g '));
    expect(gLines.length).toBeGreaterThan(0);
  });

  it('uses 1-based indices', () => {
    const box = makeBox([0, 0, 0], [1, 1, 1]);
    const mesh = meshShape(box);
    const obj = exportOBJ(mesh);

    const fLines = obj.split('\n').filter((l) => l.startsWith('f '));
    for (const line of fLines) {
      const indices = line.match(/\d+/g)?.map(Number) ?? [];
      for (const idx of indices) {
        expect(idx).toBeGreaterThan(0);
      }
    }
  });

  it('ends with a newline', () => {
    const box = makeBox([0, 0, 0], [5, 5, 5]);
    const mesh = meshShape(box);
    const obj = exportOBJ(mesh);
    expect(obj.endsWith('\n')).toBe(true);
  });
});
