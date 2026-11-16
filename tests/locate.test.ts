import { describe, expect, it, beforeAll, vi } from 'vitest';
import { initKernel } from './setup.js';
import { currentKernelId } from './helpers/kernelDivergences.js';
import {
  box,
  getKernel,
  locate,
  rotate,
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

// On a kernel where a moved shape shares the geometry of its source,
// translate() and rotate() move by location and do not copy.
describe('translate and rotate by location', () => {
  const sharesGeometry = (): boolean => getKernel().capabilities.placementSharesGeometry === true;

  it('translate takes the copying path only on a kernel that does not share geometry', () => {
    const copy = vi.spyOn(getKernel(), 'translateWithHistory');
    try {
      using source = box(10, 10, 10);
      using moved = translate(source, [5, -3, 2]);
      expect(copy).toHaveBeenCalledTimes(sharesGeometry() ? 0 : 1);
      const b = getBounds(moved);
      expect(b.xMin).toBeCloseTo(5, 6);
      expect(b.yMax).toBeCloseTo(7, 6);
      expect(b.zMax).toBeCloseTo(12, 6);
      expect(unwrap(measureVolume(moved))).toBeCloseTo(1000, 4);
    } finally {
      copy.mockRestore();
    }
  });

  it('rotate takes the copying path only on a kernel that does not share geometry', () => {
    const copy = vi.spyOn(getKernel(), 'rotateWithHistory');
    try {
      using source = box(10, 20, 30);
      // A quarter turn about the vertical line through (10, 0).
      using moved = rotate(source, 90, { at: [10, 0, 0], axis: [0, 0, 1] });
      expect(copy).toHaveBeenCalledTimes(sharesGeometry() ? 0 : 1);
      const b = getBounds(moved);
      expect(b.xMin).toBeCloseTo(-10, 6);
      expect(b.xMax).toBeCloseTo(10, 6);
      expect(b.yMin).toBeCloseTo(-10, 6);
      expect(b.yMax).toBeCloseTo(0, 6);
      expect(b.zMax).toBeCloseTo(30, 6);
      expect(unwrap(measureVolume(moved))).toBeCloseTo(6000, 4);
    } finally {
      copy.mockRestore();
    }
  });

  it('keeps a face tag through translate and rotate', () => {
    using source = box(10, 10, 10);
    const [face] = getFaces(source);
    if (!face) throw new Error('expected a face');
    tagFaces(source, [face], 'marked');
    using moved = translate(source, [25, 0, 0]);
    using turned = rotate(moved, 30, { axis: [0, 0, 1] });
    expect(findFacesByTag(moved, 'marked').length).toBeGreaterThanOrEqual(1);
    expect(findFacesByTag(turned, 'marked').length).toBeGreaterThanOrEqual(1);
  });

  it('leaves the source where it was', () => {
    using source = box(10, 10, 10);
    using moved = translate(source, [100, 0, 0]);
    expect(getBounds(source).xMax).toBeCloseTo(10, 6);
    expect(getBounds(moved).xMin).toBeCloseTo(100, 6);
  });
});
