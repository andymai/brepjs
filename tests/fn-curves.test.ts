/**
 * Tests for src/2d/curves.ts — 2D-to-3D curve projection and transformation.
 *
 * Covers curvesAsEdgesOnFace (bounds/native scale modes), edgeToCurve
 * backward orientation, and 2D transformation factories.
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion -- test array indexing */

import { describe, it, expect, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { box, cylinder, getFaces, getEdges, isOk, isErr, unwrap, castShape } from '../src/index.js';
import {
  curvesAsEdgesOnFace,
  curvesAsEdgesOnPlane,
  edgeToCurve,
  curvesBoundingBox,
  stretchTransform2d,
  translationTransform2d,
  mirrorTransform2d,
  rotateTransform2d,
  scaleTransform2d,
  transformCurves,
} from '../src/2d/curves.js';
import { Curve2D } from '../src/2d/lib/index.js';
import { getKernel } from '../src/kernel/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('curvesAsEdgesOnFace', () => {
  it('projects curves onto a planar face with default (original) scale', () => {
    const b = box(10, 10, 10);
    const face = getFaces(b)[0]!;
    // Create a simple 2D line curve
    const kernel = getKernel();
    const curve = new Curve2D(kernel.makeLine2d(0, 0, 5, 5));

    const result = curvesAsEdgesOnFace([curve], face, 'original');
    expect(isOk(result)).toBe(true);
    const edges = unwrap(result);
    expect(edges.length).toBe(1);
  });

  it('projects curves onto a planar face with bounds scale mode', () => {
    const b = box(10, 10, 10);
    const face = getFaces(b)[0]!;
    const kernel = getKernel();
    const curve = new Curve2D(kernel.makeLine2d(0, 0, 0.5, 0.5));

    const result = curvesAsEdgesOnFace([curve], face, 'bounds');
    expect(isOk(result)).toBe(true);
    const edges = unwrap(result);
    expect(edges.length).toBe(1);
  });

  it('projects curves onto a planar face with native scale mode', () => {
    const b = box(10, 10, 10);
    const face = getFaces(b)[0]!;
    const kernel = getKernel();
    const curve = new Curve2D(kernel.makeLine2d(0, 0, 5, 5));

    const result = curvesAsEdgesOnFace([curve], face, 'native');
    expect(isOk(result)).toBe(true);
    const edges = unwrap(result);
    expect(edges.length).toBe(1);
  });

  it('projects curves onto a cylindrical face with original scale', () => {
    const cyl = cylinder(5, 10);
    const faces = getFaces(cyl);
    // Find the curved (cylindrical) face
    const cylFace = faces.find((f) => {
      try {
        const kernel = getKernel();
        const surf = kernel.extractSurfaceFromFace(f.wrapped);
        kernel.getSurfaceCylinderData(surf);
        return true; // didn't throw → it's a cylinder face
      } catch {
        return false;
      }
    });

    if (cylFace) {
      const kernel = getKernel();
      const curve = new Curve2D(kernel.makeLine2d(0, 0, 1, 1));
      const result = curvesAsEdgesOnFace([curve], cylFace, 'original');
      expect(isOk(result)).toBe(true);
    }
  });

  it('returns error for unsupported face type with original scale', () => {
    // A torus face is neither planar nor cylindrical — should fail with original scale
    const kernel = getKernel();
    const torus = kernel.makeTorus(10, 3);
    const torusFaces = kernel.iterShapes(torus, 'face');
    expect(torusFaces.length).toBeGreaterThan(0);
    const face = castShape(torusFaces[0]);

    const curve = new Curve2D(kernel.makeLine2d(0, 0, 1, 1));
    const result = curvesAsEdgesOnFace([curve], face, 'original');
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe('UNSUPPORTED_FACE_TYPE');
    }
  });
});

describe('edgeToCurve', () => {
  it('extracts 2D parametric curve from an edge on a face', () => {
    const b = box(10, 10, 10);
    const face = getFaces(b)[0]!;
    const edges = getEdges(face);
    expect(edges.length).toBeGreaterThan(0);

    const curve = edgeToCurve(edges[0]!, face);
    expect(curve).toBeInstanceOf(Curve2D);
  });

  it('handles edges with different orientations', () => {
    const b = box(10, 10, 10);
    const faces = getFaces(b);
    // Test multiple edges to increase chance of hitting backward orientation
    for (const face of faces.slice(0, 2)) {
      const edges = getEdges(face);
      for (const edge of edges) {
        const curve = edgeToCurve(edge, face);
        expect(curve).toBeInstanceOf(Curve2D);
      }
    }
  });
});

describe('curvesBoundingBox', () => {
  it('computes bounding box for a set of curves', () => {
    const kernel = getKernel();
    const c1 = new Curve2D(kernel.makeLine2d(0, 0, 10, 10));
    const c2 = new Curve2D(kernel.makeLine2d(-5, -5, 5, 5));

    const bbox = curvesBoundingBox([c1, c2]);
    expect(bbox).toBeDefined();
  });
});

describe('curvesAsEdgesOnPlane', () => {
  it('projects 2D curves to 3D edges on a plane', () => {
    const kernel = getKernel();
    const curve = new Curve2D(kernel.makeLine2d(0, 0, 5, 5));
    const plane = {
      origin: [0, 0, 0] as [number, number, number],
      xDir: [1, 0, 0] as [number, number, number],
      yDir: [0, 1, 0] as [number, number, number],
      zDir: [0, 0, 1] as [number, number, number],
    };

    const edges = curvesAsEdgesOnPlane([curve], plane);
    expect(edges.length).toBe(1);
  });
});

describe('2D transformation factories', () => {
  it('stretchTransform2d creates an affinity transformation', () => {
    const t = stretchTransform2d(2, [1, 0]);
    expect(t).toBeDefined();
  });

  it('stretchTransform2d with custom origin', () => {
    const t = stretchTransform2d(0.5, [0, 1], [5, 5]);
    expect(t).toBeDefined();
  });

  it('translationTransform2d creates a translation', () => {
    const t = translationTransform2d([10, 20]);
    expect(t).toBeDefined();
  });

  it('mirrorTransform2d with center mode', () => {
    const t = mirrorTransform2d([5, 5]);
    expect(t).toBeDefined();
  });

  it('mirrorTransform2d with axis mode', () => {
    const t = mirrorTransform2d([1, 0], [0, 0], 'axis');
    expect(t).toBeDefined();
  });

  it('rotateTransform2d creates a rotation', () => {
    const t = rotateTransform2d(Math.PI / 4);
    expect(t).toBeDefined();
  });

  it('rotateTransform2d with custom center', () => {
    const t = rotateTransform2d(Math.PI / 2, [5, 5]);
    expect(t).toBeDefined();
  });

  it('scaleTransform2d creates a uniform scale', () => {
    const t = scaleTransform2d(2);
    expect(t).toBeDefined();
  });

  it('scaleTransform2d with custom center', () => {
    const t = scaleTransform2d(0.5, [10, 10]);
    expect(t).toBeDefined();
  });
});

describe('transformCurves', () => {
  it('applies a transformation to curves', () => {
    const kernel = getKernel();
    const curve = new Curve2D(kernel.makeLine2d(0, 0, 10, 10));
    const t = translationTransform2d([5, 5]);
    const transformed = transformCurves([curve], t);
    expect(transformed.length).toBe(1);
    expect(transformed[0]).toBeInstanceOf(Curve2D);
  });

  it('clones curves when transformation is null', () => {
    const kernel = getKernel();
    const curve = new Curve2D(kernel.makeLine2d(0, 0, 10, 10));
    const result = transformCurves([curve], null);
    expect(result.length).toBe(1);
    expect(result[0]).toBeInstanceOf(Curve2D);
  });
});
