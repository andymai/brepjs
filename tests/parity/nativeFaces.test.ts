// @vitest-environment node
/**
 * Native face extraction on the manifold kernel — faceFinder without OCCT.
 *
 * Grouping the Manifold mesh by faceID recovers planar faces with
 * normal/center/area, so faceFinder (parallelTo / atDistance / ofSurfaceType)
 * runs natively — no op-graph replay onto OCCT. These tests register ONLY the
 * manifold kernel, so any hidden replay would throw "requires a registered
 * occt kernel".
 */
import { describe, it, beforeAll, expect } from 'vitest';
import { initKernel } from '../setup.js';
import { getKernel, withKernel } from '@/kernel/index.js';
import { makePolygon } from '@/topology/surfaceBuilders.js';
import { extrude } from '@/operations/api.js';
import { faceFinder } from '@/query/shapeFinders.js';
import { normalAt } from '@/topology/faceFns.js';
import { unwrap } from '@/result.js';

let ok = false;
beforeAll(async () => {
  try {
    await initKernel('manifold');
    getKernel('manifold');
    ok = true;
  } catch {
    ok = false;
  }
}, 60_000);

function box(w: number, d: number, h: number): ReturnType<typeof unwrap> {
  const poly = unwrap(
    makePolygon([
      [0, 0, 0],
      [w, 0, 0],
      [w, d, 0],
      [0, d, 0],
    ])
  );
  return unwrap(extrude(poly, h));
}

describe('manifold native faces (OCCT-free)', () => {
  it('a box exposes 6 planar faces', () => {
    if (!ok) return;
    withKernel('manifold', () => {
      expect(faceFinder().findAll(box(20, 20, 10)).length).toBe(6);
    });
  });

  it('faceFinder selects the top cap by normal + distance', () => {
    if (!ok) return;
    withKernel('manifold', () => {
      const solid = box(20, 20, 10);
      const top = faceFinder().parallelTo('Z').atDistance(10, [0, 0, 0]).findAll(solid);
      const bottom = faceFinder().parallelTo('Z').atDistance(0, [0, 0, 0]).findAll(solid);
      expect(top.length).toBe(1);
      expect(bottom.length).toBe(1);
      const n = normalAt(top[0]!);
      expect(Math.abs(Math.abs(n[2]) - 1)).toBeLessThan(1e-6);
    });
  });

  it('ofSurfaceType("PLANE") matches all six faces of a box', () => {
    if (!ok) return;
    withKernel('manifold', () => {
      const planar = faceFinder()
        .ofSurfaceType('PLANE')
        .findAll(box(15, 25, 8));
      expect(planar.length).toBe(6);
    });
  });

  it('parallelTo("X") selects the two faces whose normal is ±X', () => {
    if (!ok) return;
    withKernel('manifold', () => {
      const xFaces = faceFinder()
        .parallelTo('X')
        .findAll(box(20, 20, 10));
      expect(xFaces.length).toBe(2);
    });
  });
});
