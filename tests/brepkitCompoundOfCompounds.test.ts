import { describe, it, beforeAll, expect } from 'vitest';
import { initKernel } from './setup.js';
import { drawRectangle, compound, mesh, iterSolids, translate, getBounds } from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

const descBk = process.env['TEST_KERNEL'] === 'brepkit' ? describe : describe.skip;

descBk('brepkit compound of compounds', () => {
  it('meshes every solid when the children are themselves compounds', () => {
    const piece = () => compound([drawRectangle(2, 3).sketchOnPlane('XY').extrude(1)]);
    const a = piece();
    const b = translate(piece(), [5, 0, 0]);
    const both = compound([a, b]);
    expect(Array.from(iterSolids(both)).length).toBe(2);
    const m = mesh(both);
    expect(m.vertices.length).toBeGreaterThan(0);
    expect(m.triangles.length).toBe(2 * 12 * 3);
    const bounds = getBounds(both);
    expect(bounds.xMax - bounds.xMin).toBeCloseTo(7, 6);
  });
});
