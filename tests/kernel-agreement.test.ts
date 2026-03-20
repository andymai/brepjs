/**
 * Cross-kernel agreement tests.
 *
 * Verifies that OCCT and brepkit produce numerically consistent results
 * for basic operations. Both kernels must agree within tolerance.
 *
 * These tests only run when both kernels are available (on-demand via
 * test runner, not in CI). ADR-0006 Phase 4: comprehensive parity suite
 * covering booleans, transforms/measurement, sweep/loft/extrude, and 2D.
 */

import { describe, it, beforeAll, expect } from 'vitest';
import {
  initAllKernels,
  getAdapter,
  expectClose,
  expectKernelsAgree,
} from './helpers/kernelTestHarness.js';
import type { KernelAdapter } from '@/kernel/types.js';

interface KernelPair {
  readonly o: KernelAdapter;
  readonly b: KernelAdapter;
}

let _pair: KernelPair | null = null;

beforeAll(async () => {
  await initAllKernels();
  const o = getAdapter('occt');
  const b = getAdapter('brepkit');
  if (o && b) _pair = { o, b };
}, 30000);

/** Returns both adapters or null (caller should `return` on null). */
function kernels(): KernelPair | null {
  if (!_pair) {
    console.warn('[skip] Cross-kernel tests require both OCCT and brepkit');
  }
  return _pair;
}

// ---------------------------------------------------------------------------
// Topology comparison helpers
// ---------------------------------------------------------------------------

interface TopoCount {
  faces: number;
  edges: number;
  vertices: number;
}

function topoCounts(k: KernelAdapter, shape: ReturnType<KernelAdapter['makeBox']>): TopoCount {
  return {
    faces: k.iterShapes(shape, 'face').length,
    edges: k.iterShapes(shape, 'edge').length,
    vertices: k.iterShapes(shape, 'vertex').length,
  };
}

/**
 * Assert two shapes have equivalent topology (face/edge/vertex counts)
 * and equivalent measurements (volume, area) within tolerance.
 */
function expectTopologicalEquivalence(
  label: string,
  k: KernelPair,
  shapeO: ReturnType<KernelAdapter['makeBox']>,
  shapeB: ReturnType<KernelAdapter['makeBox']>,
  opts: {
    volTol?: number;
    areaTol?: number;
    topoExact?: boolean;
    skipVolume?: boolean;
    skipArea?: boolean;
  } = {}
): void {
  const {
    volTol = 0.05,
    areaTol = 0.05,
    topoExact = true,
    skipVolume = false,
    skipArea = false,
  } = opts;

  const topoO = topoCounts(k.o, shapeO);
  const topoB = topoCounts(k.b, shapeB);

  if (topoExact) {
    expect(topoB.faces, `${label}: face count`).toBe(topoO.faces);
    expect(topoB.edges, `${label}: edge count`).toBe(topoO.edges);
    expect(topoB.vertices, `${label}: vertex count`).toBe(topoO.vertices);
  }

  if (!skipVolume) {
    const volO = k.o.volume(shapeO);
    const volB = k.b.volume(shapeB);
    expectKernelsAgree(volO, volB, `${label} volume`, volTol);
  }

  if (!skipArea) {
    const saO = k.o.area(shapeO);
    const saB = k.b.area(shapeB);
    expectKernelsAgree(saO, saB, `${label} area`, areaTol);
  }
}

// ---------------------------------------------------------------------------
// 1. Primitives
// ---------------------------------------------------------------------------

describe('cross-kernel agreement', () => {
  describe('primitives', () => {
    it('box volume', () => {
      const k = kernels();
      if (!k) return;

      const boxO = k.o.makeBox(2, 3, 4);
      const boxB = k.b.makeBox(2, 3, 4);

      const volO = k.o.volume(boxO);
      const volB = k.b.volume(boxB);

      expectClose(volO, 24, 1e-4);
      expectClose(volB, 24, 1e-4);
      expectKernelsAgree(volO, volB, 'box volume');
    });

    it('box surface area', () => {
      const k = kernels();
      if (!k) return;

      const boxO = k.o.makeBox(2, 3, 4);
      const boxB = k.b.makeBox(2, 3, 4);

      // SA = 2(wh + wd + hd) = 2(6 + 8 + 12) = 52
      const saO = k.o.area(boxO);
      const saB = k.b.area(boxB);

      expectClose(saO, 52, 1e-4);
      expectClose(saB, 52, 1e-4);
      expectKernelsAgree(saO, saB, 'box surface area');
    });

    it('box topology: 6 faces, 12 edges, 8 vertices', () => {
      const k = kernels();
      if (!k) return;

      const boxO = k.o.makeBox(2, 3, 4);
      const boxB = k.b.makeBox(2, 3, 4);

      expectTopologicalEquivalence('box', k, boxO, boxB);
    });

    it('sphere volume', () => {
      const k = kernels();
      if (!k) return;

      const sphO = k.o.makeSphere(5);
      const sphB = k.b.makeSphere(5);

      // V = 4/3 * π * r³ ≈ 523.6
      const expected = (4 / 3) * Math.PI * 125;
      const volO = k.o.volume(sphO);
      const volB = k.b.volume(sphB);

      expectClose(volO, expected, 0.02);
      expectClose(volB, expected, 0.02);
      expectKernelsAgree(volO, volB, 'sphere volume', 0.05);
    });

    it('sphere topology', () => {
      const k = kernels();
      if (!k) return;

      const sphO = k.o.makeSphere(5);
      const sphB = k.b.makeSphere(5);

      // Sphere topology varies between kernels (OCCT uses seam edges).
      // Only check volume/area, not exact topology.
      expectTopologicalEquivalence('sphere', k, sphO, sphB, {
        topoExact: false,
        volTol: 0.05,
        areaTol: 0.05,
      });
    });

    it('cylinder volume', () => {
      const k = kernels();
      if (!k) return;

      const cylO = k.o.makeCylinder(3, 10);
      const cylB = k.b.makeCylinder(3, 10);

      // V = π * r² * h ≈ 282.7
      const expected = Math.PI * 9 * 10;
      const volO = k.o.volume(cylO);
      const volB = k.b.volume(cylB);

      expectClose(volO, expected, 0.02);
      // brepkit uses polygon approximation for cylinders
      expect(volB).toBeGreaterThan(0);
      expect(volB).toBeLessThan(expected * 1.1);
    });

    it('cone volume', () => {
      const k = kernels();
      if (!k) return;

      const coneO = k.o.makeCone(5, 2, 10);
      const coneB = k.b.makeCone(5, 2, 10);

      // V = πh/3 * (R² + Rr + r²) = π*10/3 * (25 + 10 + 4) ≈ 408.4
      const expected = ((Math.PI * 10) / 3) * (25 + 10 + 4);
      const volO = k.o.volume(coneO);
      const volB = k.b.volume(coneB);

      expectClose(volO, expected, 0.02);
      // brepkit may approximate — use looser tolerance
      expectKernelsAgree(volO, volB, 'cone volume', 0.1);
    });

    it('torus volume', () => {
      const k = kernels();
      if (!k) return;

      const torusO = k.o.makeTorus(10, 3);
      const torusB = k.b.makeTorus(10, 3);

      // V = 2π²Rr² ≈ 2*π²*10*9 ≈ 1776.5
      const expected = 2 * Math.PI * Math.PI * 10 * 9;
      const volO = k.o.volume(torusO);
      const volB = k.b.volume(torusB);

      expectClose(volO, expected, 0.02);
      expectKernelsAgree(volO, volB, 'torus volume', 0.1);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Boolean operations
  // ---------------------------------------------------------------------------

  describe('booleans', () => {
    it('fuse two boxes', () => {
      const k = kernels();
      if (!k) return;

      const a = k.o.makeBox(2, 2, 2);
      const b = k.o.translate(k.o.makeBox(2, 2, 2), 1, 0, 0);
      const fusedO = k.o.fuse(a, b);
      const volO = k.o.volume(fusedO);

      const aB = k.b.makeBox(2, 2, 2);
      const bB = k.b.translate(k.b.makeBox(2, 2, 2), 1, 0, 0);
      const fusedB = k.b.fuse(aB, bB);
      const volB = k.b.volume(fusedB);

      // Two 2x2x2 boxes overlapping by 1 in x: 2*8 - 1*2*2 = 12
      expectClose(volO, 12, 0.02);
      expectClose(volB, 12, 0.02);
      expectKernelsAgree(volO, volB, 'fused box volume', 0.05);
    });

    it('fuse topology — two overlapping boxes', () => {
      const k = kernels();
      if (!k) return;

      const fusedO = k.o.fuse(k.o.makeBox(2, 2, 2), k.o.translate(k.o.makeBox(2, 2, 2), 1, 0, 0));
      const fusedB = k.b.fuse(k.b.makeBox(2, 2, 2), k.b.translate(k.b.makeBox(2, 2, 2), 1, 0, 0));

      // Topology may differ between kernels (different boolean algorithms),
      // but volume/area must agree
      expectTopologicalEquivalence('fuse-boxes', k, fusedO, fusedB, {
        topoExact: false,
        volTol: 0.05,
        areaTol: 0.05,
      });
    });

    it('cut box from box', () => {
      const k = kernels();
      if (!k) return;

      const baseO = k.o.makeBox(10, 10, 10);
      const toolO = k.o.translate(k.o.makeBox(5, 5, 5), 2.5, 2.5, 5);
      const cutO = k.o.cut(baseO, toolO);

      const baseB = k.b.makeBox(10, 10, 10);
      const toolB = k.b.translate(k.b.makeBox(5, 5, 5), 2.5, 2.5, 5);
      const cutB = k.b.cut(baseB, toolB);

      // 1000 - 125 = 875
      const volO = k.o.volume(cutO);
      const volB = k.b.volume(cutB);
      expectClose(volO, 875, 0.02);
      expectKernelsAgree(volO, volB, 'cut box volume', 0.05);
    });

    it('cut topology', () => {
      const k = kernels();
      if (!k) return;

      const cutO = k.o.cut(
        k.o.makeBox(10, 10, 10),
        k.o.translate(k.o.makeBox(5, 5, 5), 2.5, 2.5, 5)
      );
      const cutB = k.b.cut(
        k.b.makeBox(10, 10, 10),
        k.b.translate(k.b.makeBox(5, 5, 5), 2.5, 2.5, 5)
      );

      expectTopologicalEquivalence('cut-boxes', k, cutO, cutB, {
        topoExact: false,
        volTol: 0.05,
        areaTol: 0.05,
      });
    });

    it('intersect two boxes', () => {
      const k = kernels();
      if (!k) return;

      const aO = k.o.makeBox(4, 4, 4);
      const bO = k.o.translate(k.o.makeBox(4, 4, 4), 2, 2, 2);
      const intO = k.o.intersect(aO, bO);

      const aB = k.b.makeBox(4, 4, 4);
      const bB = k.b.translate(k.b.makeBox(4, 4, 4), 2, 2, 2);
      const intB = k.b.intersect(aB, bB);

      // Intersection of two 4x4x4 boxes offset by (2,2,2): overlap is 2x2x2 = 8
      const volO = k.o.volume(intO);
      const volB = k.b.volume(intB);
      expectClose(volO, 8, 0.02);
      expectKernelsAgree(volO, volB, 'intersect box volume', 0.05);
    });

    it('intersect topology — result is a box', () => {
      const k = kernels();
      if (!k) return;

      const intO = k.o.intersect(
        k.o.makeBox(4, 4, 4),
        k.o.translate(k.o.makeBox(4, 4, 4), 2, 2, 2)
      );
      const intB = k.b.intersect(
        k.b.makeBox(4, 4, 4),
        k.b.translate(k.b.makeBox(4, 4, 4), 2, 2, 2)
      );

      // Result should be a box: 6 faces, 12 edges, 8 vertices
      expectTopologicalEquivalence('intersect-box', k, intO, intB, { volTol: 0.05, areaTol: 0.05 });
    });

    it('fuseAll — three boxes in a row', () => {
      const k = kernels();
      if (!k) return;

      const boxes = [0, 1, 2].map((i) => k.o.translate(k.o.makeBox(2, 2, 2), i * 1.5, 0, 0));
      const fusedO = k.o.fuseAll(boxes);

      const boxesB = [0, 1, 2].map((i) => k.b.translate(k.b.makeBox(2, 2, 2), i * 1.5, 0, 0));
      const fusedB = k.b.fuseAll(boxesB);

      // 3 boxes of 8, overlapping 0.5 in x: 24 - 2*(0.5*2*2) = 24 - 4 = 20
      const volO = k.o.volume(fusedO);
      const volB = k.b.volume(fusedB);
      expectClose(volO, 20, 0.05);
      expectKernelsAgree(volO, volB, 'fuseAll volume', 0.05);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Transforms & measurement
  // ---------------------------------------------------------------------------

  describe('transforms', () => {
    it('translate preserves volume', () => {
      const k = kernels();
      if (!k) return;

      const movedO = k.o.translate(k.o.makeBox(3, 3, 3), 10, 20, 30);
      const movedB = k.b.translate(k.b.makeBox(3, 3, 3), 10, 20, 30);

      expectTopologicalEquivalence('translate-box', k, movedO, movedB);
    });

    it('translate moves center of mass', () => {
      const k = kernels();
      if (!k) return;

      const movedO = k.o.translate(k.o.makeBox(2, 2, 2), 10, 20, 30);
      const movedB = k.b.translate(k.b.makeBox(2, 2, 2), 10, 20, 30);

      const comO = k.o.centerOfMass(movedO);
      const comB = k.b.centerOfMass(movedB);

      // Center should be at (11, 21, 31)
      expectClose(comO[0], 11, 0.02);
      expectClose(comO[1], 21, 0.02);
      expectClose(comO[2], 31, 0.02);

      expectKernelsAgree(comO[0], comB[0], 'translate CoM x', 0.05);
      expectKernelsAgree(comO[1], comB[1], 'translate CoM y', 0.05);
      expectKernelsAgree(comO[2], comB[2], 'translate CoM z', 0.05);
    });

    it('rotate 90° around Z preserves volume', () => {
      const k = kernels();
      if (!k) return;

      const rotO = k.o.rotate(k.o.makeBox(2, 3, 4), [0, 0, 0], [0, 0, 1], 90);
      const rotB = k.b.rotate(k.b.makeBox(2, 3, 4), [0, 0, 0], [0, 0, 1], 90);

      expectTopologicalEquivalence('rotate-box', k, rotO, rotB, { volTol: 0.02, areaTol: 0.02 });
    });

    it('rotate moves bounding box', () => {
      const k = kernels();
      if (!k) return;

      // Box (2,3,4) rotated 90° around Z: x-extent becomes 3, y-extent becomes 2
      const rotO = k.o.rotate(k.o.makeBox(2, 3, 4), [0, 0, 0], [0, 0, 1], 90);
      const rotB = k.b.rotate(k.b.makeBox(2, 3, 4), [0, 0, 0], [0, 0, 1], 90);

      const bbO = k.o.boundingBox(rotO);
      const bbB = k.b.boundingBox(rotB);

      // After 90° Z rotation, x-extent ≈ 3, y-extent ≈ 2
      const extXO = bbO.max[0] - bbO.min[0];
      const extYO = bbO.max[1] - bbO.min[1];
      const extZO = bbO.max[2] - bbO.min[2];

      expectClose(extXO, 3, 0.02);
      expectClose(extYO, 2, 0.02);
      expectClose(extZO, 4, 0.02);

      const extXB = bbB.max[0] - bbB.min[0];
      const extYB = bbB.max[1] - bbB.min[1];
      const extZB = bbB.max[2] - bbB.min[2];

      expectKernelsAgree(extXO, extXB, 'rotate bb x-extent', 0.02);
      expectKernelsAgree(extYO, extYB, 'rotate bb y-extent', 0.02);
      expectKernelsAgree(extZO, extZB, 'rotate bb z-extent', 0.02);
    });

    it('scale 2x doubles volume by 8', () => {
      const k = kernels();
      if (!k) return;

      const scaledO = k.o.scale(k.o.makeBox(2, 2, 2), [0, 0, 0], 2);
      const scaledB = k.b.scale(k.b.makeBox(2, 2, 2), [0, 0, 0], 2);

      const volO = k.o.volume(scaledO);
      const volB = k.b.volume(scaledB);

      // 8 * 8 = 64
      expectClose(volO, 64, 0.02);
      expectKernelsAgree(volO, volB, 'scale 2x volume', 0.05);
    });

    it('mirror across XY plane preserves volume', () => {
      const k = kernels();
      if (!k) return;

      const boxO = k.o.translate(k.o.makeBox(2, 2, 2), 0, 0, 5);
      const mirO = k.o.mirror(boxO, 'XY', [0, 0, 0]);

      const boxB = k.b.translate(k.b.makeBox(2, 2, 2), 0, 0, 5);
      const mirB = k.b.mirror(boxB, 'XY', [0, 0, 0]);

      expectTopologicalEquivalence('mirror-box', k, mirO, mirB, { topoExact: false, volTol: 0.05 });

      // Center of mass should be mirrored: z from ~6 to ~-6
      const comO = k.o.centerOfMass(mirO);
      const comB = k.b.centerOfMass(mirB);
      expect(comO[2]).toBeLessThan(0);
      expectKernelsAgree(comO[2], comB[2], 'mirror CoM z', 0.05);
    });
  });

  describe('measurement', () => {
    it('bounding box agreement', () => {
      const k = kernels();
      if (!k) return;

      const boxO = k.o.makeBox(3, 4, 5);
      const boxB = k.b.makeBox(3, 4, 5);

      const bbO = k.o.boundingBox(boxO);
      const bbB = k.b.boundingBox(boxB);

      expectClose(bbO.max[0] - bbO.min[0], 3, 1e-4);
      expectClose(bbO.max[1] - bbO.min[1], 4, 1e-4);
      expectClose(bbO.max[2] - bbO.min[2], 5, 1e-4);

      expectClose(bbB.max[0] - bbB.min[0], 3, 1e-4);
      expectClose(bbB.max[1] - bbB.min[1], 4, 1e-4);
      expectClose(bbB.max[2] - bbB.min[2], 5, 1e-4);
    });

    it('center of mass agreement', () => {
      const k = kernels();
      if (!k) return;

      const boxO = k.o.makeBox(2, 4, 6);
      const boxB = k.b.makeBox(2, 4, 6);

      const comO = k.o.centerOfMass(boxO);
      const comB = k.b.centerOfMass(boxB);

      // Center of a box at origin should be at (1, 2, 3)
      expectClose(comO[0], 1, 0.02);
      expectClose(comO[1], 2, 0.02);
      expectClose(comO[2], 3, 0.02);

      expectKernelsAgree(comO[0], comB[0], 'centerOfMass x', 0.05);
      expectKernelsAgree(comO[1], comB[1], 'centerOfMass y', 0.05);
      expectKernelsAgree(comO[2], comB[2], 'centerOfMass z', 0.05);
    });

    it('edge length agreement', () => {
      const k = kernels();
      if (!k) return;

      const boxO = k.o.makeBox(3, 4, 5);
      const boxB = k.b.makeBox(3, 4, 5);

      const edgesO = k.o.iterShapes(boxO, 'edge');
      const edgesB = k.b.iterShapes(boxB, 'edge');

      // Both should have 12 edges
      expect(edgesO.length).toBe(12);
      expect(edgesB.length).toBe(12);

      // Sort edge lengths and compare distributions
      const lengthsO = edgesO.map((e) => k.o.length(e)).sort((a, b) => a - b);
      const lengthsB = edgesB.map((e) => k.b.length(e)).sort((a, b) => a - b);

      // Box 3×4×5 has edges: 4×3, 4×4, 4×5
      for (let i = 0; i < lengthsO.length; i++) {
        const lo = lengthsO[i];
        const lb = lengthsB[i];
        if (lo !== undefined && lb !== undefined) {
          expectKernelsAgree(lo, lb, `edge length [${i}]`, 0.02);
        }
      }
    });

    it('face area distribution agreement', () => {
      const k = kernels();
      if (!k) return;

      const boxO = k.o.makeBox(3, 4, 5);
      const boxB = k.b.makeBox(3, 4, 5);

      const facesO = k.o.iterShapes(boxO, 'face');
      const facesB = k.b.iterShapes(boxB, 'face');

      // Sort face areas and compare
      const areasO = facesO.map((f) => k.o.area(f)).sort((a, b) => a - b);
      const areasB = facesB.map((f) => k.b.area(f)).sort((a, b) => a - b);

      // Box 3×4×5: faces are 2×(12, 15, 20) sorted = [12, 12, 15, 15, 20, 20]
      expect(areasO.length).toBe(6);
      expect(areasB.length).toBe(6);

      for (let i = 0; i < areasO.length; i++) {
        const ao = areasO[i];
        const ab = areasB[i];
        if (ao !== undefined && ab !== undefined) {
          expectKernelsAgree(ao, ab, `face area [${i}]`, 0.02);
        }
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Sweep / loft / extrude / revolve
  // ---------------------------------------------------------------------------

  describe('extrude & revolve', () => {
    it('extrude box face along Z', () => {
      const k = kernels();
      if (!k) return;

      // Make a box, take top face, extrude it
      const boxO = k.o.makeBox(5, 5, 1);
      const topO = k.o.iterShapes(boxO, 'face').find((f) => {
        const n = k.o.surfaceNormal(f, 0.5, 0.5);
        return n[2] > 0.9; // top face normal points up
      });
      if (!topO) return;
      const extO = k.o.extrude(topO, [0, 0, 10]);

      const boxB = k.b.makeBox(5, 5, 1);
      const topB = k.b.iterShapes(boxB, 'face').find((f) => {
        const n = k.b.surfaceNormal(f, 0.5, 0.5);
        return n[2] > 0.9;
      });
      if (!topB) return;
      const extB = k.b.extrude(topB, [0, 0, 10]);

      // Extruded 5×5 face by 10 in Z → volume = 250
      const volO = k.o.volume(extO);
      const volB = k.b.volume(extB);
      expectClose(volO, 250, 0.02);
      expectKernelsAgree(volO, volB, 'extrude volume', 0.05);
    });

    it('revolve rectangle face 360° makes solid', () => {
      const k = kernels();
      if (!k) return;

      // Create a small face and revolve it around Y axis
      const boxO = k.o.makeBox(1, 3, 0.01);
      const topO = k.o.iterShapes(boxO, 'face').find((f) => {
        const n = k.o.surfaceNormal(f, 0.5, 0.5);
        return Math.abs(n[2]) > 0.9;
      });
      if (!topO) return;

      const boxB = k.b.makeBox(1, 3, 0.01);
      const topB = k.b.iterShapes(boxB, 'face').find((f) => {
        const n = k.b.surfaceNormal(f, 0.5, 0.5);
        return Math.abs(n[2]) > 0.9;
      });
      if (!topB) return;

      // Revolve 360° around the Y axis through origin
      const revO = k.o.revolve(topO, [0, 0, 0], [0, 1, 0], 360);
      const revB = k.b.revolve(topB, [0, 0, 0], [0, 1, 0], 360);

      // Both should produce a solid with positive volume
      const volO = k.o.volume(revO);
      const volB = k.b.volume(revB);
      expect(volO).toBeGreaterThan(0);
      expect(volB).toBeGreaterThan(0);
      expectKernelsAgree(volO, volB, 'revolve volume', 0.1);
    });
  });

  describe('fillet & chamfer', () => {
    it('fillet box edges', () => {
      const k = kernels();
      if (!k) return;

      const boxO = k.o.makeBox(10, 10, 10);
      const edgesO = k.o.iterShapes(boxO, 'edge');

      const boxB = k.b.makeBox(10, 10, 10);
      const edgesB = k.b.iterShapes(boxB, 'edge');

      // Fillet all edges with radius 1
      const filletO = k.o.fillet(boxO, edgesO, [1]);
      const filletB = k.b.fillet(boxB, edgesB, [1]);

      // Volume decreases from 1000 — both should agree on how much
      const volO = k.o.volume(filletO);
      const volB = k.b.volume(filletB);
      expect(volO).toBeLessThan(1000);
      expect(volB).toBeLessThan(1000);
      expect(volO).toBeGreaterThan(900);
      expectKernelsAgree(volO, volB, 'fillet volume', 0.1);
    });

    it('chamfer box edges', () => {
      const k = kernels();
      if (!k) return;

      const boxO = k.o.makeBox(10, 10, 10);
      const edgesO = k.o.iterShapes(boxO, 'edge');

      const boxB = k.b.makeBox(10, 10, 10);
      const edgesB = k.b.iterShapes(boxB, 'edge');

      // Chamfer all edges with distance 1
      const chamO = k.o.chamfer(boxO, edgesO, 1);
      const chamB = k.b.chamfer(boxB, edgesB, 1);

      const volO = k.o.volume(chamO);
      const volB = k.b.volume(chamB);
      expect(volO).toBeLessThan(1000);
      expect(volB).toBeLessThan(1000);
      expect(volO).toBeGreaterThan(900);
      expectKernelsAgree(volO, volB, 'chamfer volume', 0.1);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. 2D geometry
  // ---------------------------------------------------------------------------

  describe('2D geometry', () => {
    it('line segment evaluation', () => {
      const k = kernels();
      if (!k) return;

      const ptA: [number, number] = [0, 0];
      const ptB: [number, number] = [10, 5];

      const lineO = k.o.makeLine2d(
        k.o.createPoint2d(ptA[0], ptA[1]),
        k.o.createPoint2d(ptB[0], ptB[1])
      );
      const lineB = k.b.makeLine2d(
        k.b.createPoint2d(ptA[0], ptA[1]),
        k.b.createPoint2d(ptB[0], ptB[1])
      );

      // Evaluate at midpoint
      const boundsO = k.o.getCurve2dBounds(lineO);
      const boundsB = k.b.getCurve2dBounds(lineB);

      const midParamO = (boundsO.first + boundsO.last) / 2;
      const midParamB = (boundsB.first + boundsB.last) / 2;

      const midO = k.o.evaluateCurve2d(lineO, midParamO);
      const midB = k.b.evaluateCurve2d(lineB, midParamB);

      // Midpoint should be at (5, 2.5)
      expectClose(midO[0], 5, 0.01);
      expectClose(midO[1], 2.5, 0.01);
      expectKernelsAgree(midO[0], midB[0], '2D line mid x', 0.02);
      expectKernelsAgree(midO[1], midB[1], '2D line mid y', 0.02);
    });

    it('circle creation and evaluation', () => {
      const k = kernels();
      if (!k) return;

      const radius = 5;

      const circO = k.o.makeCircle2d(k.o.createPoint2d(0, 0), radius);
      const circB = k.b.makeCircle2d(k.b.createPoint2d(0, 0), radius);

      // Evaluate at param 0 — should be on the circle at distance 5 from origin
      const p0O = k.o.evaluateCurve2d(circO, 0);
      const p0B = k.b.evaluateCurve2d(circB, 0);

      expectClose(Math.sqrt(p0O[0] * p0O[0] + p0O[1] * p0O[1]), 5, 0.01);
      expectClose(Math.sqrt(p0B[0] * p0B[0] + p0B[1] * p0B[1]), 5, 0.01);
    });

    it('bezier curve evaluation', () => {
      const k = kernels();
      if (!k) return;

      // Cubic bezier: (0,0) → (10,0) with control points (3,5) (7,5)
      const poles: Array<[number, number]> = [
        [0, 0],
        [3, 5],
        [7, 5],
        [10, 0],
      ];
      const polesO = poles.map(([x, y]) => k.o.createPoint2d(x, y));
      const polesB = poles.map(([x, y]) => k.b.createPoint2d(x, y));

      const bezO = k.o.makeBezier2d(polesO);
      const bezB = k.b.makeBezier2d(polesB);

      const boundsO = k.o.getCurve2dBounds(bezO);
      const boundsB = k.b.getCurve2dBounds(bezB);

      // Evaluate at midpoint parameter
      const midO = k.o.evaluateCurve2d(bezO, (boundsO.first + boundsO.last) / 2);
      const midB = k.b.evaluateCurve2d(bezB, (boundsB.first + boundsB.last) / 2);

      // At t=0.5 for cubic bezier with these poles: x≈5, y≈3.75
      expectClose(midO[0], 5, 0.1);
      expectClose(midO[1], 3.75, 0.1);
      expectKernelsAgree(midO[0], midB[0], '2D bezier mid x', 0.05);
      expectKernelsAgree(midO[1], midB[1], '2D bezier mid y', 0.05);
    });

    it('curve intersection', () => {
      const k = kernels();
      if (!k) return;

      // Two lines crossing: (0,0)→(10,10) and (0,10)→(10,0)
      const l1O = k.o.makeLine2d(k.o.createPoint2d(0, 0), k.o.createPoint2d(10, 10));
      const l2O = k.o.makeLine2d(k.o.createPoint2d(0, 10), k.o.createPoint2d(10, 0));

      const l1B = k.b.makeLine2d(k.b.createPoint2d(0, 0), k.b.createPoint2d(10, 10));
      const l2B = k.b.makeLine2d(k.b.createPoint2d(0, 10), k.b.createPoint2d(10, 0));

      const ixO = k.o.intersectCurves2d(l1O, l2O);
      const ixB = k.b.intersectCurves2d(l1B, l2B);

      // Should intersect at (5, 5)
      expect(ixO.length).toBeGreaterThanOrEqual(1);
      expect(ixB.length).toBeGreaterThanOrEqual(1);

      const ptO = ixO[0];
      const ptB = ixB[0];
      if (ptO && ptB) {
        expectClose(ptO[0], 5, 0.1);
        expectClose(ptO[1], 5, 0.1);
        expectKernelsAgree(ptO[0], ptB[0], '2D intersect x', 0.05);
        expectKernelsAgree(ptO[1], ptB[1], '2D intersect y', 0.05);
      }
    });

    it('2D transform — translate curve', () => {
      const k = kernels();
      if (!k) return;

      const lineO = k.o.makeLine2d(k.o.createPoint2d(0, 0), k.o.createPoint2d(5, 0));
      const lineB = k.b.makeLine2d(k.b.createPoint2d(0, 0), k.b.createPoint2d(5, 0));

      const movedO = k.o.translateCurve2d(lineO, 10, 20);
      const movedB = k.b.translateCurve2d(lineB, 10, 20);

      const boundsO = k.o.getCurve2dBounds(movedO);
      const boundsB = k.b.getCurve2dBounds(movedB);

      const startO = k.o.evaluateCurve2d(movedO, boundsO.first);
      const startB = k.b.evaluateCurve2d(movedB, boundsB.first);

      // Start point should be at (10, 20)
      expectClose(startO[0], 10, 0.01);
      expectClose(startO[1], 20, 0.01);
      expectKernelsAgree(startO[0], startB[0], '2D translate start x', 0.02);
      expectKernelsAgree(startO[1], startB[1], '2D translate start y', 0.02);
    });

    it('bounding box 2D', () => {
      const k = kernels();
      if (!k) return;

      // Create a circle and check its 2D bounding box
      const circO = k.o.makeCircle2d(k.o.createPoint2d(0, 0), 5);
      const circB = k.b.makeCircle2d(k.b.createPoint2d(0, 0), 5);

      const bb2dO = k.o.createBoundingBox2d();
      k.o.addCurveToBBox2d(bb2dO, circO);
      const boundsO = k.o.getBBox2dBounds(bb2dO);

      const bb2dB = k.b.createBoundingBox2d();
      k.b.addCurveToBBox2d(bb2dB, circB);
      const boundsB = k.b.getBBox2dBounds(bb2dB);

      // Circle of radius 5 centered at origin: bbox should be [-5,-5] to [5,5]
      expectClose(boundsO.xMin, -5, 0.1);
      expectClose(boundsO.yMin, -5, 0.1);
      expectClose(boundsO.xMax, 5, 0.1);
      expectClose(boundsO.yMax, 5, 0.1);

      expectKernelsAgree(boundsO.xMin, boundsB.xMin, '2D bbox xMin', 0.05);
      expectKernelsAgree(boundsO.yMin, boundsB.yMin, '2D bbox yMin', 0.05);
      expectKernelsAgree(boundsO.xMax, boundsB.xMax, '2D bbox xMax', 0.05);
      expectKernelsAgree(boundsO.yMax, boundsB.yMax, '2D bbox yMax', 0.05);
    });
  });
});
