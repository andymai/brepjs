import { describe, it, expect, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { box, fuseAll, measureVolume, mesh, unwrap } from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('AbortSignal cancellation', () => {
  it('fuseAll (pairwise) throws when signal is already aborted', () => {
    const boxes = Array.from({ length: 4 }, () => box(10, 10, 10));
    const controller = new AbortController();
    controller.abort();

    expect(() => fuseAll(boxes, { strategy: 'pairwise', signal: controller.signal })).toThrow();
  });

  it('fuseAll (pairwise) succeeds without signal', () => {
    const boxes = Array.from({ length: 3 }, () => box(10, 10, 10));
    const result = unwrap(fuseAll(boxes, { strategy: 'pairwise' }));
    expect(measureVolume(result)).toBeCloseTo(1000, 0);
  });

  it('fuseAll (native) throws when signal is already aborted', () => {
    const boxes = Array.from({ length: 3 }, () => box(10, 10, 10));
    const controller = new AbortController();
    controller.abort();

    expect(() => fuseAll(boxes, { strategy: 'native', signal: controller.signal })).toThrow();
  });

  it('fuseAll passes signal through to pairwise recursion', () => {
    // Create enough shapes to ensure recursion depth > 1
    const boxes = Array.from({ length: 8 }, () => box(10, 10, 10));
    const controller = new AbortController();
    controller.abort();

    expect(() => fuseAll(boxes, { strategy: 'pairwise', signal: controller.signal })).toThrow();
  });

  it('meshShape throws when signal is already aborted', () => {
    const b = box(10, 10, 10);
    const controller = new AbortController();
    controller.abort();

    expect(() => mesh(b, { signal: controller.signal })).toThrow();
  });

  it('meshShape succeeds without signal', () => {
    const b = box(10, 10, 10);
    const m = mesh(b);
    expect(m.vertices.length).toBeGreaterThan(0);
    expect(m.triangles.length).toBeGreaterThan(0);
  });

  it('signal with custom reason preserves the reason', () => {
    const boxes = Array.from({ length: 3 }, () => box(10, 10, 10));
    const reason = new Error('User cancelled');
    const controller = new AbortController();
    controller.abort(reason);

    expect(() => fuseAll(boxes, { strategy: 'pairwise', signal: controller.signal })).toThrow(
      'User cancelled'
    );
  });

  it('non-aborted signal does not interfere', () => {
    const boxes = Array.from({ length: 3 }, () => box(10, 10, 10));
    const controller = new AbortController();
    // Don't abort — operation should succeed
    const result = unwrap(fuseAll(boxes, { strategy: 'pairwise', signal: controller.signal }));
    expect(measureVolume(result)).toBeCloseTo(1000, 0);
  });
});
