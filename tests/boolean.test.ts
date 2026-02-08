import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  box,
  sphere as _sphere,
  measureVolume as _measureVolume,
  unwrap as _unwrap,
  translate,
  clone,
  fuse,
  cut,
  intersect,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('Boolean operations', () => {
  it('fuses two boxes', () => {
    const box1 = box(10, 10, 10);
    const box2 = translate(box1, [5, 0, 0]);
    const fused = unwrap(fuse(box1, box2));
    expect(fused).toBeDefined();
    const vol = measureVolume(fused);
    // Two 10x10x10 boxes overlapping by 5x10x10 = 2000 - 500 = 1500
    expect(vol).toBeCloseTo(1500, 0);
  });

  it('cuts a box from a box', () => {
    const box1 = box(10, 10, 10);
    const box2 = translate(box1, [5, 0, 0]);
    const c = unwrap(cut(box1, box2));
    expect(c).toBeDefined();
    const vol = measureVolume(c);
    // 10x10x10 minus the 5x10x10 overlap = 500
    expect(vol).toBeCloseTo(500, 0);
  });

  it('intersects two boxes', () => {
    const box1 = box(10, 10, 10);
    const box2 = translate(box1, [5, 0, 0]);
    const common = unwrap(intersect(box1, box2));
    expect(common).toBeDefined();
    const vol = measureVolume(common);
    // Overlap region is 5x10x10 = 500
    expect(vol).toBeCloseTo(500, 0);
  });
});

describe('Shape transforms', () => {
  it('translates a box', () => {
    const b = box(10, 10, 10);
    const translated = translate(b, [100, 0, 0]);
    expect(translated).toBeDefined();
    const vol = measureVolume(translated);
    expect(vol).toBeCloseTo(1000, 0);
  });

  it('clones a box', () => {
    const b = box(10, 10, 10);
    const cloned = clone(b);
    expect(cloned).toBeDefined();
    const vol = measureVolume(cloned);
    expect(vol).toBeCloseTo(1000, 0);
  });
});
