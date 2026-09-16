import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { initKernel } from './setup.js';
import {
  box,
  colorFaces,
  composeTransforms,
  findFacesByTag,
  getBounds,
  getFaceColor,
  getFaces,
  getKernel,
  GeometryCleanupError,
  locate,
  measureVolume,
  tagFaces,
  unwrap,
} from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);
afterEach(() => vi.restoreAllMocks());

it('borrows a reusable composed placement, preserving metadata and independent output lifetimes', () => {
  using source = box(1, 2, 3);
  const face = getFaces(source)[0];
  if (!face) throw new Error('Expected box face');
  tagFaces(source, [face], 'kept');
  colorFaces(source, [face], '#00ff00');
  const composed = composeTransforms([{ type: 'translate', v: [10, 0, 0] }]);
  const cleanup = vi.spyOn(composed, 'cleanup');
  try {
    using first = locate(source, composed);
    using second = locate(source, composed);
    expect(first).not.toBe(second);
    expect(first).not.toBe(source);
    expect(getBounds(first).xMin).toBeCloseTo(10, 6);
    expect(unwrap(measureVolume(second))).toBeCloseTo(6, 8);
    const tagged = findFacesByTag(first, 'kept');
    expect(tagged).toHaveLength(1);
    const movedFace = tagged[0];
    if (!movedFace) throw new Error('Expected moved tagged face');
    expect(getFaceColor(first, movedFace)).toEqual(getFaceColor(source, face));
    expect(cleanup).not.toHaveBeenCalled();
  } finally {
    composed.cleanup();
  }
  expect(cleanup).toHaveBeenCalledTimes(1);
  expect(unwrap(measureVolume(source))).toBeCloseTo(6, 8);
});

it('leaves a borrowed composed transform to its owner after a native placement failure', () => {
  using source = box(1, 1, 1);
  const composed = composeTransforms([{ type: 'translate', v: [1, 0, 0] }]);
  const cleanup = vi.spyOn(composed, 'cleanup');
  const failure = vi.spyOn(getKernel(), 'locate').mockImplementation(() => {
    throw new Error('native failure');
  });
  try {
    expect(() => locate(source, composed)).toThrow('native failure');
    expect(cleanup).not.toHaveBeenCalled();
    failure.mockRestore();
    using retry = locate(source, composed);
    expect(unwrap(measureVolume(retry))).toBeCloseTo(1, 8);
  } finally {
    composed.cleanup();
  }
  expect(cleanup).toHaveBeenCalledTimes(1);
});

it('preserves a cast failure when retiring its owned transform also fails', () => {
  using source = box(1, 1, 1);
  const primary = new Error('Result cast failed');
  const cleanupCause = new Error('Transform cleanup failed after release');
  const compose = getKernel().composeTransform.bind(getKernel());
  const cleanup = vi.fn();
  vi.spyOn(getKernel(), 'composeTransform').mockImplementation((ops) => {
    const transform = compose(ops);
    return {
      handle: transform.handle,
      dispose() {
        cleanup();
        transform.dispose();
        throw cleanupCause;
      },
    };
  });
  vi.spyOn(getKernel(), 'downcast').mockImplementation(() => {
    throw primary;
  });
  expect(() => locate(source, { type: 'translate', v: [1, 0, 0] })).toThrow(
    expect.objectContaining({
      suppressed: primary,
      error: expect.any(GeometryCleanupError),
    })
  );
  expect(cleanup).toHaveBeenCalledTimes(1);
  expect(source.disposed).toBe(false);
  expect(unwrap(measureVolume(source))).toBeCloseTo(1, 8);
});
