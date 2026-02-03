import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { makeBox, FaceFinder, getSingleFace, unwrap, isErr } from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('getSingleFace', () => {
  it('accepts a Face directly', () => {
    const box = makeBox([0, 0, 0], [10, 20, 30]);
    const face = box.faces[0]!;
    const result = getSingleFace(face, box);
    expect(unwrap(result)).toBe(face);
  });

  it('accepts a FaceFinder instance', () => {
    const box = makeBox([0, 0, 0], [10, 20, 30]);
    const finder = new FaceFinder().inPlane('XY', 30);
    const result = getSingleFace(finder, box);
    const face = unwrap(result);
    expect(face).toBeDefined();
  });

  it('accepts a function returning a FaceFinder', () => {
    const box = makeBox([0, 0, 0], [10, 20, 30]);
    const result = getSingleFace((f) => f.inPlane('XY', 30), box);
    const face = unwrap(result);
    expect(face).toBeDefined();
  });

  it('returns error when finder matches multiple faces', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const finder = new FaceFinder().ofSurfaceType('PLANE');
    const result = getSingleFace(finder, box);
    expect(isErr(result)).toBe(true);
  });

  it('returns error when finder function matches zero faces', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const result = getSingleFace((f) => f.ofSurfaceType('SPHERE'), box);
    expect(isErr(result)).toBe(true);
  });
});
