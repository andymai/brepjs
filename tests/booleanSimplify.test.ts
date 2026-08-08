/**
 * BooleanOptions.simplify passthrough (brepkit >= 3.2): the option routes to
 * the kernel's *WithOptions entry points instead of being warn-dropped.
 * Runs on whichever kernel BREPJS_KERNEL selects; on kernels without the
 * entry points the option degrades to a plain boolean, so the volume
 * assertions hold everywhere.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { box, measureVolume, unwrap, translate, fuse, cut } from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('BooleanOptions.simplify', () => {
  it('fuse with simplify produces the correct solid', () => {
    const box1 = box(10, 10, 10);
    const box2 = translate(box1, [5, 0, 0]);
    const fused = unwrap(fuse(box1, box2, { simplify: true }));
    const vol = unwrap(measureVolume(fused));
    expect(vol).toBeCloseTo(1500, 0);
  });

  it('cut with simplify produces the correct solid', () => {
    const box1 = box(10, 10, 10);
    const box2 = translate(box1, [5, 0, 0]);
    const c = unwrap(cut(box1, box2, { simplify: true }));
    const vol = unwrap(measureVolume(c));
    expect(vol).toBeCloseTo(500, 0);
  });
});
