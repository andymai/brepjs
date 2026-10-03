import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel, currentKernel } from './setup.js';
import {
  box,
  cylinder,
  translate,
  fuse,
  cut,
  fuseAll,
  cutAll,
  compound,
  unwrap,
  getFaces,
  getSolids,
  measureVolume,
  tagFaces,
  findFacesByTag,
  colorShape,
  getShapeColor,
  getKernel,
} from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe.skipIf(currentKernel !== 'occt-wasm')('occt-wasm boolean options and history', () => {
  it('honours simplify', () => {
    using a = box(10, 10, 10);
    using b0 = box(10, 10, 10);
    using b = translate(b0, [10, 0, 0]);
    using plain = unwrap(fuse(a, b));
    using simple = unwrap(fuse(a, b, { simplify: true }));
    expect(getFaces(plain).length).toBe(10);
    expect(getFaces(simple).length).toBe(6);
    expect(unwrap(measureVolume(simple))).toBeCloseTo(2000, 6);
  });

  it('honours fuzzyValue', () => {
    using a = box(10, 10, 10);
    using b0 = box(10, 10, 10);
    using b = translate(b0, [10 + 1e-6, 0, 0]);
    using apart = unwrap(fuse(a, b));
    using merged = unwrap(fuse(a, b, { fuzzyValue: 1e-5 }));
    expect(getSolids(apart).length).toBe(2);
    expect(getSolids(merged).length).toBe(1);
  });

  it('keeps the result exact with commonFace glue', () => {
    using a = box(10, 10, 10);
    using b0 = box(10, 10, 10);
    using b = translate(b0, [10, 0, 0]);
    using glued = unwrap(fuse(a, b, { optimisation: 'commonFace' }));
    expect(unwrap(measureVolume(glued))).toBeCloseTo(2000, 6);
    expect(getSolids(glued).length).toBe(1);
  });

  it('cuts with a compound of overlapping solids as one tool', () => {
    using base = box(40, 20, 10);
    using c10 = cylinder(5, 20);
    using c1 = translate(c10, [15, 10, -5]);
    using c20 = cylinder(5, 20);
    using c2 = translate(c20, [20, 10, -5]);
    using tool = compound([c1, c2]);
    using viaCompound = unwrap(cut(base, tool));
    using viaList = unwrap(cutAll(base, [c1, c2]));
    using viaListWithOptions = unwrap(cutAll(base, [tool], { simplify: true }));
    const expected = unwrap(measureVolume(viaList));
    expect(unwrap(measureVolume(viaCompound))).toBeCloseTo(expected, 6);
    expect(unwrap(measureVolume(viaListWithOptions))).toBeCloseTo(expected, 6);
    expect(expected).toBeLessThan(8000);
  });

  it('carries face tags through cutAll', () => {
    using base = box(30, 10, 10);
    tagFaces(base, [getFaces(base)[0] ?? base], 'kept');
    using t10 = box(4, 20, 20);
    using t1 = translate(t10, [4, -5, -5]);
    using t20 = box(4, 20, 20);
    using t2 = translate(t20, [20, -5, -5]);
    using result = unwrap(cutAll(base, [t1, t2]));
    expect(findFacesByTag(result, 'kept').length).toBeGreaterThan(0);
  });

  it('carries shape colours through fuseAll', () => {
    using a = box(10, 10, 10);
    colorShape(a, '#ff0000');
    using b0 = box(10, 10, 10);
    using b = translate(b0, [5, 0, 0]);
    using c0 = box(10, 10, 10);
    using c = translate(c0, [10, 0, 0]);
    using fused = unwrap(fuseAll([a, b, c]));
    expect(getShapeColor(fused)?.[0]).toBeCloseTo(1, 1);
    expect(unwrap(measureVolume(fused))).toBeCloseTo(2000, 6);
  });

  it('passes one shape, or a cut with no tools, through the n-way history methods', () => {
    const kernel = getKernel();
    if (!kernel.fuseAllWithHistory || !kernel.cutAllWithHistory) {
      throw new Error('expected n-way history on occt-wasm');
    }
    using a = box(10, 10, 10);
    const hashes = getFaces(a).map((f) => kernel.hashCode(f.wrapped, 2147483647));
    const fused = kernel.fuseAllWithHistory([a.wrapped], hashes, 2147483647);
    const cutResult = kernel.cutAllWithHistory(a.wrapped, [], hashes, 2147483647);
    try {
      for (const r of [fused, cutResult]) {
        expect(kernel.volume(r.shape)).toBeCloseTo(1000, 6);
        expect([...r.evolution.modified.keys()].sort()).toEqual([...hashes].sort());
      }
    } finally {
      kernel.dispose(fused.shape);
      kernel.dispose(cutResult.shape);
    }
  });
});
