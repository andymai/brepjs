import { describe, it, expect, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { box, sphere, getFaces, measureCurvatureAt, measureCurvatureAtMid } from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('measureCurvatureAt', () => {
  it('plane face has zero curvature', () => {
    const b = box(10, 10, 10);
    const faces = getFaces(b);
    expect(faces.length).toBe(6);

     
     
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const f = faces[0]!;
    const result = measureCurvatureAt(f, 0.5, 0.5);

    expect(result.mean).toBeCloseTo(0, 5);
    expect(result.gaussian).toBeCloseTo(0, 5);
    expect(result.maxCurvature).toBeCloseTo(0, 5);
    expect(result.minCurvature).toBeCloseTo(0, 5);
  });

  it('sphere face has constant positive curvature', () => {
    const s = sphere(5);
    const faces = getFaces(s);
    expect(faces.length).toBeGreaterThan(0);

     
     
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const f = faces[0]!;
    const result = measureCurvatureAtMid(f);

    // Sphere of radius R: |k1| = |k2| = 1/R, |mean| = 1/R, gaussian = 1/R²
    // Sign depends on surface normal orientation (inward vs outward)
    const expectedK = 1 / 5;
    expect(Math.abs(result.mean)).toBeCloseTo(expectedK, 3);
    expect(result.gaussian).toBeCloseTo(expectedK * expectedK, 3);
    expect(Math.abs(result.maxCurvature)).toBeCloseTo(expectedK, 3);
    expect(Math.abs(result.minCurvature)).toBeCloseTo(expectedK, 3);
  });

  it('returns direction vectors', () => {
    const s = sphere(5);
    const faces = getFaces(s);
     
     
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const f = faces[0]!;
    const result = measureCurvatureAtMid(f);

    // Direction vectors should be unit vectors
    const maxLen = Math.sqrt(
      result.maxDirection[0] ** 2 + result.maxDirection[1] ** 2 + result.maxDirection[2] ** 2
    );
    const minLen = Math.sqrt(
      result.minDirection[0] ** 2 + result.minDirection[1] ** 2 + result.minDirection[2] ** 2
    );
    expect(maxLen).toBeCloseTo(1, 3);
    expect(minLen).toBeCloseTo(1, 3);
  });
});

describe('measureCurvatureAtMid', () => {
  it('works on box faces', () => {
    const b = box(10, 10, 10);
    const faces = getFaces(b);

    for (const f of faces) {
      const result = measureCurvatureAtMid(f);
      // All box faces are planar — zero curvature
      expect(result.mean).toBeCloseTo(0, 5);
      expect(result.gaussian).toBeCloseTo(0, 5);
    }
  });
});
