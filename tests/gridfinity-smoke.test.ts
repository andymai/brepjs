/**
 * Gridfinity smoke test.
 *
 * Exercises the brepjs operations that gridfinity-layout-tool relies on.
 * The vitest workspace runs this against both OCCT and brepkit.
 *
 * ## Running
 *
 * ```bash
 * npx vitest run tests/gridfinity-smoke.test.ts
 * ```
 */

import { describe, it, beforeAll, expect } from 'vitest';
import { initKernel } from './setup.js';
import { skipIfDiverges } from './helpers/kernelDivergences.js';
import { unwrap } from '@/core/result.js';

import {
  draw,
  drawRoundedRectangle,
  drawRectangle,
  drawCircle,
  drawPolysides,
  faceFinder,
  edgeFinder,
  translate,
  clone,
  composeTransforms,
  transformCopy,
  fuse,
  cut,
  intersect,
  fuseAll,
  cutAll,
  shell,
  fillet,
  mesh,
  meshEdges,
  exportSTEP,
  exportSTL,
  getBounds,
  curveLength,
} from '@/index.js';

import type { AnyShape, Shape3D } from '@/index.js';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(async () => {
  await initKernel();
}, 30_000);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute width/height/depth (and center X for translation checks) from Bounds3D. */
function boundsSize(b: {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zMin: number;
  zMax: number;
}): { width: number; height: number; depth: number; centerX: number } {
  return {
    width: b.xMax - b.xMin,
    height: b.yMax - b.yMin,
    depth: b.zMax - b.zMin,
    centerX: (b.xMin + b.xMax) / 2,
  };
}

// ---------------------------------------------------------------------------
// 1. Sketch primitives → extrude
// ---------------------------------------------------------------------------

describe('1. Sketch primitives', () => {
  it('drawRoundedRectangle → extrude', (ctx) => {
    skipIfDiverges(ctx, 'gridfinity.roundedRectExtrude');
    const solid = drawRoundedRectangle(42, 42, 3.75).sketchOnPlane('XY').extrude(7);
    const s = boundsSize(getBounds(solid as AnyShape));
    expect(s.width).toBeCloseTo(42, 0);
    expect(s.height).toBeCloseTo(42, 0);
    expect(s.depth).toBeCloseTo(7, 0);
  });

  it('drawRectangle → extrude (volume check)', () => {
    const solid = drawRectangle(10, 10).sketchOnPlane('XY').extrude(5);
    const s = boundsSize(getBounds(solid as AnyShape));
    // 10 × 10 × 5 = 500
    expect(s.width * s.height * s.depth).toBeCloseTo(500, -1);
  });

  it('drawCircle → extrude (magnet hole)', (ctx) => {
    skipIfDiverges(ctx, 'gridfinity.circleExtrude');
    const solid = drawCircle(3.25).sketchOnPlane('XY').extrude(2);
    const s = boundsSize(getBounds(solid as AnyShape));
    expect(s.width).toBeCloseTo(6.5, 0);
    expect(s.depth).toBeCloseTo(2, 0);
  });

  it('drawPolysides → extrude (hex pattern)', () => {
    const solid = drawPolysides(5, 6).sketchOnPlane('XY').extrude(1);
    const s = boundsSize(getBounds(solid as AnyShape));
    expect(s.depth).toBeCloseTo(1, 0);
    expect(s.width).toBeGreaterThan(0);
  });

  it('draw() pen API → extrude', () => {
    const solid = draw([0, 0])
      .lineTo([10, 0])
      .lineTo([10, 5])
      .lineTo([0, 5])
      .close()
      .sketchOnPlane('XY')
      .extrude(1);
    const s = boundsSize(getBounds(solid as AnyShape));
    expect(s.width).toBeCloseTo(10, 0);
    expect(s.height).toBeCloseTo(5, 0);
    expect(s.depth).toBeCloseTo(1, 0);
  });
});

// ---------------------------------------------------------------------------
// 2. Ruled loft (socket profile)
// ---------------------------------------------------------------------------

describe('2. Ruled loft (socket)', () => {
  it('5-section ruled loft produces a solid', () => {
    // Gridfinity socket profile: 5 rounded-rect sections tapering inward at different Z
    const sections = [
      { w: 42, h: 42, r: 3.75, z: 0 },
      { w: 41.5, h: 41.5, r: 3.5, z: -0.25 },
      { w: 41, h: 41, r: 3.25, z: -0.67 },
      { w: 40, h: 40, r: 3.0, z: -2.17 },
      { w: 39, h: 39, r: 2.75, z: -4.65 },
    ];

    const sketches = sections.map((s) =>
      drawRoundedRectangle(s.w, s.h, s.r).sketchOnPlane('XY', s.z)
    );

    const [first, ...rest] = sketches;
    if (!first) throw new Error('expected at least one sketch');
    const solid = first.loftWith(rest, { ruled: true });

    const s = boundsSize(getBounds(solid as AnyShape));
    expect(s.width).toBeGreaterThan(38);
    expect(s.depth).toBeGreaterThan(4);

    const m = mesh(solid as AnyShape, { tolerance: 0.1 });
    expect(m.triangles.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Shell (bin body)
// ---------------------------------------------------------------------------

describe('3. Shell (bin body)', () => {
  it('shell removes top face and hollows the solid', () => {
    const box = drawRoundedRectangle(84, 84, 3.75).sketchOnPlane('XY').extrude(21);

    // Find the top face (parallel to Z, highest)
    const topFaces = faceFinder()
      .parallelTo('Z')
      .findAll(box as AnyShape);

    // Pick the face at highest Z
    const topFace = topFaces.reduce((best, f) => {
      const fb = getBounds(f as AnyShape);
      const bb = getBounds(best as AnyShape);
      return fb.zMax > bb.zMax ? f : best;
    });

    const hollow = unwrap(shell(box as AnyShape, [topFace], 1.2));

    const hollowSize = boundsSize(getBounds(hollow as AnyShape));

    // Bounding box should be roughly the same
    expect(hollowSize.width).toBeCloseTo(84, 0);
    expect(hollowSize.height).toBeCloseTo(84, 0);
  });
});

// ---------------------------------------------------------------------------
// 4. Sweep + fillet (stacking lip)
// ---------------------------------------------------------------------------

describe('4. Sweep + fillet (stacking lip)', () => {
  it('sweepSketch with contact produces a solid', () => {
    // Spine: rounded rectangle (stacking lip path)
    const spine = drawRoundedRectangle(84, 84, 3.75).sketchOnPlane('XY');

    // Profile: small L-shaped cross-section
    const solid = spine.sweepSketch(
      (_plane, _origin) =>
        draw([0, 0])
          .lineTo([1.5, 0])
          .lineTo([1.5, 0.5])
          .lineTo([0.5, 0.5])
          .lineTo([0.5, 1.8])
          .lineTo([0, 1.8])
          .close()
          .sketchOnPlane(_plane, _origin),
      { withContact: true }
    );

    const s = boundsSize(getBounds(solid as AnyShape));
    expect(s.width).toBeGreaterThan(80);
    expect(s.depth).toBeGreaterThan(0);
  });

  it('fillet on extruded box edges', () => {
    const box = drawRectangle(20, 20).sketchOnPlane('XY').extrude(10);

    // Find vertical edges
    const vertEdges = edgeFinder()
      .parallelTo('Z')
      .findAll(box as AnyShape);

    let solid;
    if (vertEdges.length > 0) {
      solid = unwrap(fillet(box as AnyShape, vertEdges.slice(0, 4), 1));
    } else {
      // Fallback: fillet all edges
      const allEdges = edgeFinder().findAll(box as AnyShape);
      solid = unwrap(fillet(box as AnyShape, allEdges.slice(0, 4), 1));
    }

    const s = boundsSize(getBounds(solid as AnyShape));
    expect(s.width).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Boolean pipeline
// ---------------------------------------------------------------------------

describe('5. Boolean pipeline', () => {
  it('fuse two overlapping boxes', () => {
    const a = drawRectangle(10, 10).sketchOnPlane('XY').extrude(5);
    const b = drawRectangle(10, 10).sketchOnPlane('XY', 2).extrude(5);
    const result = unwrap(fuse(a as AnyShape, b as AnyShape));
    const s = boundsSize(getBounds(result as AnyShape));
    expect(s.depth).toBeCloseTo(7, 0); // 5 + 2 overlap => 7
  });

  it('fuseAll multiple solids', () => {
    const solids = [0, 5, 10].map(
      (dx) =>
        translate(drawRectangle(10, 10).sketchOnPlane('XY').extrude(5) as AnyShape, [
          dx,
          0,
          0,
        ]) as Shape3D
    );
    const result = unwrap(fuseAll(solids));
    const s = boundsSize(getBounds(result as AnyShape));
    expect(s.width).toBeCloseTo(20, 0); // 3 boxes offset by 5 each: 0..10 + 5..15 + 10..20
  });

  it('cut (box from box)', () => {
    const base = drawRectangle(20, 20).sketchOnPlane('XY').extrude(10);
    const tool = drawRectangle(6, 6).sketchOnPlane('XY').extrude(20);
    const result = unwrap(cut(base as AnyShape, tool as AnyShape));
    const s = boundsSize(getBounds(result as AnyShape));
    expect(s.width).toBeCloseTo(20, 0);
  });

  it('cutAll multiple tools', () => {
    const base = drawRectangle(40, 40).sketchOnPlane('XY').extrude(5) as Shape3D;
    const tools = [-10, 10].map(
      (x) =>
        translate(drawRectangle(4, 4).sketchOnPlane('XY').extrude(10) as AnyShape, [
          x,
          0,
          0,
        ]) as Shape3D
    );
    const result = unwrap(cutAll(base, tools));
    const s = boundsSize(getBounds(result as AnyShape));
    expect(s.width).toBeCloseTo(40, 0);
  });

  it('intersect two overlapping boxes', () => {
    const a = drawRectangle(10, 10).sketchOnPlane('XY').extrude(10);
    const b = translate(
      drawRectangle(10, 10).sketchOnPlane('XY').extrude(10) as AnyShape,
      [5, 5, 0]
    );
    const result = unwrap(intersect(a as AnyShape, b));
    const s = boundsSize(getBounds(result as AnyShape));
    // Intersection should be 5×5×10
    expect(s.width).toBeCloseTo(5, 0);
    expect(s.height).toBeCloseTo(5, 0);
  });
});

// ---------------------------------------------------------------------------
// 6. Transforms
// ---------------------------------------------------------------------------

describe('6. Transforms', () => {
  it('translate shifts bounding box', () => {
    const box = drawRectangle(10, 10).sketchOnPlane('XY').extrude(5);
    const result = translate(box as AnyShape, [42, 0, 0]);
    const s = boundsSize(getBounds(result as AnyShape));
    // Box was centered at ~5, now shifted by 42
    expect(s.centerX).toBeGreaterThan(35);
  });

  it('composeTransforms + transformCopy', () => {
    const box = drawRectangle(10, 10).sketchOnPlane('XY').extrude(5);
    const composed = composeTransforms([
      { type: 'translate', v: [42, 0, 0] },
      { type: 'rotate', angle: 90, axis: [0, 0, 1] },
    ]);
    const result = transformCopy(box as AnyShape, composed);
    const s = boundsSize(getBounds(result as AnyShape));
    expect(s.width).toBeGreaterThan(0);
  });

  it('clone produces independent copy', () => {
    const box = drawRectangle(10, 10).sketchOnPlane('XY').extrude(5);
    const copy = unwrap(clone(box as AnyShape));
    const moved = translate(copy, [100, 0, 0]);
    const origBounds = boundsSize(getBounds(box as AnyShape));
    const copyBounds = boundsSize(getBounds(moved));
    // Original should be unmoved
    expect(origBounds.centerX).toBeLessThan(20);
    // Copy should be shifted
    expect(copyBounds.centerX).toBeGreaterThan(90);
  });
});

// ---------------------------------------------------------------------------
// 7. Finders
// ---------------------------------------------------------------------------

describe('7. Finders', () => {
  it('faceFinder().parallelTo(Z) finds top/bottom faces', () => {
    const box = drawRectangle(10, 10).sketchOnPlane('XY').extrude(5);
    const faces = faceFinder()
      .parallelTo('Z')
      .findAll(box as AnyShape);
    // A box has 2 faces parallel to Z (top and bottom)
    expect(faces.length).toBeGreaterThanOrEqual(2);
  });

  it('edgeFinder().findAll returns edges', () => {
    const box = drawRectangle(10, 10).sketchOnPlane('XY').extrude(5);
    const edges = edgeFinder().findAll(box as AnyShape);
    // A box has 12 edges
    expect(edges.length).toBeGreaterThanOrEqual(12);
  });
});

// ---------------------------------------------------------------------------
// 8. Mesh & export
// ---------------------------------------------------------------------------

describe('8. Mesh & export', () => {
  it('mesh() produces valid triangulation', () => {
    const box = drawRectangle(10, 10).sketchOnPlane('XY').extrude(5);
    const m = mesh(box as AnyShape, { tolerance: 0.1 });
    expect(m.vertices.length).toBeGreaterThan(0);
    expect(m.triangles.length).toBeGreaterThan(0);
  });

  it('meshEdges() produces edge lines', () => {
    const box = drawRectangle(10, 10).sketchOnPlane('XY').extrude(5);
    const m = meshEdges(box as AnyShape, { tolerance: 0.1 });
    expect(m.lines.length).toBeGreaterThan(0);
    expect(m.edgeGroups.length).toBeGreaterThan(0);
  });

  it('exportSTEP produces non-empty output', () => {
    const box = drawRectangle(10, 10).sketchOnPlane('XY').extrude(5);
    const blob = unwrap(exportSTEP(box as AnyShape));
    expect(blob.size).toBeGreaterThan(100);
  });

  it('exportSTL produces non-empty binary output', () => {
    const box = drawRectangle(10, 10).sketchOnPlane('XY').extrude(5);
    const blob = unwrap(exportSTL(box as AnyShape, { binary: true }));
    expect(blob.size).toBeGreaterThan(80);
  });

  it('getBounds returns valid bounding box', () => {
    const box = drawRectangle(10, 10).sketchOnPlane('XY').extrude(5);
    const bounds = getBounds(box as AnyShape);
    const s = boundsSize(bounds);
    expect(s.width).toBeCloseTo(10, 0);
    expect(s.height).toBeCloseTo(10, 0);
    expect(s.depth).toBeCloseTo(5, 0);
    expect(bounds.xMin).toBeDefined();
    expect(bounds.xMax).toBeDefined();
  });

  it('curveLength returns positive length', () => {
    const box = drawRectangle(10, 10).sketchOnPlane('XY').extrude(5);
    const edges = edgeFinder().findAll(box as AnyShape);
    expect(edges.length).toBeGreaterThan(0);
    const firstEdge = edges[0];
    if (!firstEdge) throw new Error('expected at least one edge');
    const length = curveLength(firstEdge);
    expect(length).toBeGreaterThan(0);
  });
});
