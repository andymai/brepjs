import { describe, it, beforeAll, expect } from 'vitest';
import { initKernel } from './setup.js';
import {
  box,
  compound,
  cut,
  cutWithEvolution,
  exportSTEP,
  cutAll,
  findFacesByTag,
  fuse,
  fuseAll,
  intersectWithEvolution,
  iterSolids,
  line,
  measureVolume,
  tagFaces,
  translate,
  unwrap,
  type Shape3D,
} from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

const descBk = process.env['TEST_KERNEL'] === 'brepkit' ? describe : describe.skip;

// A compound holding anything but solids lives JS-side only, so its id is not a
// kernel handle; booleans and export have to read its solids from the adapter.
// A tagged base sends the evolution variants down the per-solid history path.
descBk('brepkit booleans with a mixed compound tool', () => {
  const tagged = (shape: Shape3D): Shape3D => {
    tagFaces(shape, () => true, 'base');
    return shape;
  };
  const at = (w: number, d: number, h: number, offset: [number, number, number]): Shape3D => {
    using raw = box(w, d, h);
    return translate(raw, offset);
  };
  const withEdge = (...solids: Shape3D[]): Shape3D =>
    compound([...solids, line([0, 0, 20], [1, 0, 20])]);

  it('cuts by the solids of a compound that also holds an edge', () => {
    using base = box(10, 10, 10);
    using post = at(2, 2, 20, [4, 4, -5]);
    using tool = withEdge(post);
    using result = unwrap(cut(base, tool, { unsafe: true }));
    expect(unwrap(measureVolume(result))).toBeCloseTo(960, 6);
  });

  it('cuts with evolution by the solids of a compound that also holds an edge', () => {
    using base = tagged(box(10, 10, 10));
    using post = at(2, 2, 20, [4, 4, -5]);
    using tool = withEdge(post);
    using result = unwrap(cutWithEvolution(base, tool)).shape;
    expect(unwrap(measureVolume(result))).toBeCloseTo(960, 6);
  });

  it('leaves the base whole when the compound tool holds no solid', () => {
    using base = tagged(box(10, 10, 10));
    using tool = withEdge();
    using result = unwrap(cutWithEvolution(base, tool)).shape;
    expect(unwrap(measureVolume(result))).toBeCloseTo(1000, 6);
  });

  it('fuses the solids of a compound that also holds an edge', () => {
    using base = box(10, 10, 10);
    using post = at(2, 2, 20, [4, 4, -5]);
    using tool = withEdge(post);
    using result = unwrap(fuse(base, tool, { unsafe: true }));
    expect(unwrap(measureVolume(result))).toBeCloseTo(1040, 6);
  });

  it('intersects with the union of a compound tool, not each solid in turn', () => {
    using base = tagged(box(10, 10, 10));
    using low = at(2, 2, 2, [1, 1, 1]);
    using high = at(2, 2, 2, [6, 6, 6]);
    using tool = withEdge(low, high);
    using result = unwrap(intersectWithEvolution(base, tool)).shape;
    expect(unwrap(measureVolume(result))).toBeCloseTo(16, 6);
  });

  it('keeps the tool faces history when the compound tool solids overlap', () => {
    using base = tagged(box(10, 10, 10));
    using left = at(4, 2, 2, [2, 2, 2]);
    using right = at(4, 2, 2, [4, 2, 2]);
    using tool = withEdge(left, right);
    tagFaces(tool, () => true, 'tool');
    using result = unwrap(intersectWithEvolution(base, tool)).shape;
    expect(unwrap(measureVolume(result))).toBeCloseTo(24, 6);
    expect(findFacesByTag(result, 'tool').length).toBeGreaterThan(0);
  });

  it('cuts all by a list holding a compound that also holds an edge', () => {
    using base = box(10, 10, 10);
    using post = at(2, 2, 20, [4, 4, -5]);
    using tool = withEdge(post);
    using result = unwrap(cutAll(base, [tool]));
    expect(unwrap(measureVolume(result))).toBeCloseTo(960, 6);
  });

  it('fuses all with a compound that also holds an edge', () => {
    using base = box(10, 10, 10);
    using post = at(2, 2, 20, [4, 4, -5]);
    using tool = withEdge(post);
    using result = unwrap(fuseAll([base, tool]));
    expect(unwrap(measureVolume(result))).toBeCloseTo(1040, 6);
  });

  it('intersects to nothing when the compound tool holds no solid', () => {
    using base = tagged(box(10, 10, 10));
    using tool = withEdge();
    using result = unwrap(intersectWithEvolution(base, tool)).shape;
    expect(Array.from(iterSolids(result))).toHaveLength(0);
  });

  it('exports the solids of a compound that also holds an edge', () => {
    using solid = box(10, 10, 10);
    using shape = withEdge(solid);
    expect(unwrap(exportSTEP(shape)).size).toBeGreaterThan(0);
  });
});
