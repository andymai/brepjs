import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { box, mesh, exportOBJ } from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('exportOBJ', () => {
  it('exports a box mesh to OBJ format', () => {
    const b = box(10, 10, 10);
    const m = mesh(b);
    const obj = exportOBJ(m);

    expect(obj).toContain('# brepjs OBJ export');

    const lines = obj.split('\n');
    const vLines = lines.filter((l) => l.startsWith('v '));
    expect(vLines.length).toBe(m.vertices.length / 3);

    const vnLines = lines.filter((l) => l.startsWith('vn '));
    expect(vnLines.length).toBe(m.normals.length / 3);

    const fLines = lines.filter((l) => l.startsWith('f '));
    expect(fLines.length).toBe(m.triangles.length / 3);

    const gLines = lines.filter((l) => l.startsWith('g '));
    expect(gLines.length).toBeGreaterThan(0);
  });

  it('uses 1-based indices', () => {
    const b = box(1, 1, 1);
    const m = mesh(b);
    const obj = exportOBJ(m);

    const fLines = obj.split('\n').filter((l) => l.startsWith('f '));
    for (const line of fLines) {
      const indices = line.match(/\d+/g)?.map(Number) ?? [];
      for (const idx of indices) {
        expect(idx).toBeGreaterThan(0);
      }
    }
  });

  it('ends with a newline', () => {
    const b = box(5, 5, 5);
    const m = mesh(b);
    const obj = exportOBJ(m);
    expect(obj.endsWith('\n')).toBe(true);
  });
});
