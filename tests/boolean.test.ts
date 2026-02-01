import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { makeBox, makeSphere, measureVolume } from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('Boolean operations', () => {
  it('fuses two boxes', () => {
    const box1 = makeBox([10, 10, 10]);
    const box2 = makeBox([10, 10, 10]).translate([5, 0, 0]);
    const fused = box1.fuse(box2);
    expect(fused).toBeDefined();
    const vol = measureVolume(fused);
    // Two 10x10x10 boxes overlapping by 5x10x10 = 2000 - 500 = 1500
    expect(vol).toBeCloseTo(1500, 0);
  });

  it('cuts a box from a box', () => {
    const box1 = makeBox([10, 10, 10]);
    const box2 = makeBox([10, 10, 10]).translate([5, 0, 0]);
    const cut = box1.cut(box2);
    expect(cut).toBeDefined();
    const vol = measureVolume(cut);
    // 10x10x10 minus the 5x10x10 overlap = 500
    expect(vol).toBeCloseTo(500, 0);
  });

  it('intersects two boxes', () => {
    const box1 = makeBox([10, 10, 10]);
    const box2 = makeBox([10, 10, 10]).translate([5, 0, 0]);
    const common = box1.intersect(box2);
    expect(common).toBeDefined();
    const vol = measureVolume(common);
    // Overlap region is 5x10x10 = 500
    expect(vol).toBeCloseTo(500, 0);
  });
});

describe('Shape transforms', () => {
  it('translates a box', () => {
    const box = makeBox([10, 10, 10]);
    const translated = box.translate([100, 0, 0]);
    expect(translated).toBeDefined();
    const vol = measureVolume(translated);
    expect(vol).toBeCloseTo(1000, 0);
  });

  it('clones a box', () => {
    const box = makeBox([10, 10, 10]);
    const cloned = box.clone();
    expect(cloned).toBeDefined();
    const vol = measureVolume(cloned);
    expect(vol).toBeCloseTo(1000, 0);
  });
});
