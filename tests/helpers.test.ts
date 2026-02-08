import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { box, getSingleFace, unwrap, isErr, getFaces, faceFinder } from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('getSingleFace', () => {
  it('accepts a Face directly', () => {
    const b = box(10, 20, 30);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const f = getFaces(b)[0]!;
    const result = getSingleFace(f, b);
    expect(unwrap(result)).toBe(f);
  });

  it('accepts a FaceFinderFn instance', () => {
    const b = box(10, 20, 30);
    const finder = faceFinder().parallelTo('Z').atDistance(30, [0, 0, 0]);
    const result = getSingleFace(finder, b);
    const f = unwrap(result);
    expect(f).toBeDefined();
  });

  it('accepts a function returning a FaceFinderFn', () => {
    const b = box(10, 20, 30);
    const result = getSingleFace((f) => f.parallelTo('Z').atDistance(30, [0, 0, 0]), b);
    const f = unwrap(result);
    expect(f).toBeDefined();
  });

  it('returns error when finder matches multiple faces', () => {
    const b = box(10, 10, 10);
    const finder = faceFinder().ofSurfaceType('PLANE');
    const result = getSingleFace(finder, b);
    expect(isErr(result)).toBe(true);
  });

  it('returns error when finder function matches zero faces', () => {
    const b = box(10, 10, 10);
    const result = getSingleFace((f) => f.ofSurfaceType('SPHERE'), b);
    expect(isErr(result)).toBe(true);
  });
});
