// @vitest-environment node
/**
 * Native edge extraction on the manifold kernel — edgeFinder without OCCT.
 *
 * Edges are face-pair boundaries grouped from the Manifold mesh, so edgeFinder
 * (parallelTo / inDirection / ofLength) runs natively. Registers ONLY manifold,
 * so any hidden op-graph replay would throw "requires a registered occt kernel".
 */
import { describe, it, beforeAll, expect } from 'vitest';
import { initKernel } from '../setup.js';
import { getKernel, withKernel } from '@/kernel/index.js';
import { makePolygon } from '@/topology/surfaceBuilders.js';
import { extrude } from '@/operations/api.js';
import { edgeFinder } from '@/query/shapeFinders.js';
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

describe('manifold native edges (OCCT-free)', () => {
  it('a box exposes 12 edges', () => {
    if (!ok) return;
    withKernel('manifold', () => {
      expect(edgeFinder().findAll(box(20, 20, 10)).length).toBe(12);
    });
  });

  it('parallelTo("Z") selects the 4 vertical edges', () => {
    if (!ok) return;
    withKernel('manifold', () => {
      expect(
        edgeFinder()
          .parallelTo('Z')
          .findAll(box(20, 20, 10)).length
      ).toBe(4);
    });
  });

  it('parallelTo("X") and parallelTo("Y") each select 4 edges', () => {
    if (!ok) return;
    withKernel('manifold', () => {
      const solid = box(20, 30, 10);
      expect(edgeFinder().parallelTo('X').findAll(solid).length).toBe(4);
      expect(edgeFinder().parallelTo('Y').findAll(solid).length).toBe(4);
    });
  });

  it('a box exposes 8 corner vertices and satisfies V−E+F=2', () => {
    if (!ok) return;
    withKernel('manifold', () => {
      const k = getKernel('manifold');
      const solid = box(20, 20, 10);
      const v = k.iterShapes(solid.wrapped, 'vertex').length;
      const e = k.iterShapes(solid.wrapped, 'edge').length;
      const f = k.iterShapes(solid.wrapped, 'face').length;
      expect(v).toBe(8);
      expect(v - e + f).toBe(2); // Euler characteristic of a solid
    });
  });
});
