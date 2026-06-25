import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { currentKernelId } from './helpers/kernelDivergences.js';
import {
  box,
  locate,
  translate,
  getBounds,
  getFaces,
  tagFaces,
  findFacesByTag,
  colorFaces,
  getFaceColor,
  measureVolume,
  unwrap,
} from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('locate', () => {
  it('moves geometry identically to translate', () => {
    const moved = locate(box(10, 10, 10), { type: 'translate', v: [5, -3, 2] });
    const ref = translate(box(10, 10, 10), [5, -3, 2]);
    const a = getBounds(moved);
    const e = getBounds(ref);
    expect(a.xMin).toBeCloseTo(e.xMin, 6);
    expect(a.xMax).toBeCloseTo(e.xMax, 6);
    expect(a.yMin).toBeCloseTo(e.yMin, 6);
    expect(a.zMax).toBeCloseTo(e.zMax, 6);
  });

  it('preserves volume (a rigid move)', () => {
    const v0 = unwrap(measureVolume(box(10, 20, 30)));
    const moved = locate(box(10, 20, 30), { type: 'translate', v: [100, -50, 7] });
    expect(unwrap(measureVolume(moved))).toBeCloseTo(v0, 4);
  });

  it('re-keys face tags through the move', () => {
    const b = box(10, 10, 10);
    const faces = getFaces(b);
    expect(faces.length).toBe(6);
    const [f0] = faces;
    if (!f0) throw new Error('expected a face');
    tagFaces(b, [f0], 'marked');
    const moved = locate(b, { type: 'translate', v: [25, 0, 0] });
    const tagged = findFacesByTag(moved, 'marked');
    // The tag survives the move on every kernel (the #1660 guarantee).
    expect(tagged.length).toBeGreaterThanOrEqual(1);
    // occt-family preserves face identity 1:1; manifold's mesh metadata spreads.
    if (currentKernelId !== 'manifold') expect(tagged.length).toBe(1);
  });

  it('re-keys per-face colors through the move', () => {
    const b = box(10, 10, 10);
    const faces = getFaces(b);
    const [f0] = faces;
    if (!f0) throw new Error('expected a face');
    colorFaces(b, [f0], '#00ff00');
    const moved = locate(b, { type: 'translate', v: [25, 0, 0] });
    const colored = getFaces(moved).filter((f) => getFaceColor(moved, f) !== undefined);
    expect(colored.length).toBeGreaterThanOrEqual(1);
  });

  it('composes an ordered list (rotate then translate), preserving volume', () => {
    const placed = locate(box(10, 10, 10), [
      { type: 'rotate', angle: 90, axis: [0, 0, 1] },
      { type: 'translate', v: [20, 0, 0] },
    ]);
    expect(unwrap(measureVolume(placed))).toBeCloseTo(1000, 3);
  });

  it('accepts a single op or a one-element array equivalently', () => {
    const one = locate(box(5, 5, 5), { type: 'translate', v: [3, 0, 0] });
    const arr = locate(box(5, 5, 5), [{ type: 'translate', v: [3, 0, 0] }]);
    expect(getBounds(one).xMax).toBeCloseTo(getBounds(arr).xMax, 6);
  });
});
