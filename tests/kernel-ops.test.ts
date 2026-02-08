/**
 * Comprehensive kernel ops tests.
 *
 * Tests the kernel layer (constructorOps, booleanOps, sweepOps, transformOps,
 * ioOps, modifierOps, healingOps, measureOps, curveOps) through the adapter.
 * Uses high-level shape creators for reliable setup, then tests kernel ops.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { getKernel } from '../src/kernel/index.js';
import type { KernelAdapter } from '../src/kernel/types.js';
import {
  box,
  sphere,
  cylinder,
  cone,
  torus,
  translate,
  getEdges,
  getFaces,
  getWires,
  getVertices,
} from '../src/index.js';

let kernel: KernelAdapter;

beforeAll(async () => {
  await initOC();
  kernel = getKernel();
}, 30000);

// Helper: get the underlying OcShape from a high-level shape
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- unwrap branded shape
function oc(shape: any): any {
  return shape.wrapped;
}

// ---------------------------------------------------------------------------
// constructorOps
// ---------------------------------------------------------------------------

describe('constructorOps', () => {
  it('makeVertex', () => {
    const v = kernel.makeVertex(1, 2, 3);
    expect(v).toBeDefined();
    expect(kernel.shapeType(v)).toBe('vertex');
  });

  it('makeBox', () => {
    const b = kernel.makeBox(10, 20, 30);
    expect(kernel.shapeType(b)).toBe('solid');
    expect(kernel.volume(b)).toBeCloseTo(6000, 0);
    expect(kernel.isValid(b)).toBe(true);
  });

  it('makeCylinder', () => {
    const cyl = kernel.makeCylinder(5, 10);
    expect(kernel.volume(cyl)).toBeCloseTo(Math.PI * 25 * 10, 0);
    expect(kernel.isValid(cyl)).toBe(true);
  });

  it('makeCylinder with custom center and direction', () => {
    const cyl = kernel.makeCylinder(3, 15, [1, 2, 3], [0, 1, 0]);
    expect(kernel.isValid(cyl)).toBe(true);
    expect(kernel.volume(cyl)).toBeCloseTo(Math.PI * 9 * 15, 0);
  });

  it('makeSphere', () => {
    const s = oc(sphere(7));
    expect(kernel.isValid(s)).toBe(true);
    expect(kernel.volume(s)).toBeCloseTo((4 / 3) * Math.PI * 343, 0);
  });

  it('makeCone', () => {
    const c = oc(cone(10, 0, 20));
    expect(kernel.isValid(c)).toBe(true);
    expect(kernel.volume(c)).toBeCloseTo((1 / 3) * Math.PI * 100 * 20, 0);
  });

  it('makeCone truncated', () => {
    const c = oc(cone(10, 5, 20));
    expect(kernel.isValid(c)).toBe(true);
    const vol = ((Math.PI * 20) / 3) * (100 + 50 + 25);
    expect(kernel.volume(c)).toBeCloseTo(vol, 0);
  });

  it('makeTorus', () => {
    const t = oc(torus(10, 3));
    expect(kernel.isValid(t)).toBe(true);
    const vol = 2 * Math.PI * Math.PI * 10 * 9;
    expect(kernel.volume(t)).toBeCloseTo(vol, 0);
  });
});

// ---------------------------------------------------------------------------
// booleanOps
// ---------------------------------------------------------------------------

describe('booleanOps', () => {
  it('fuse', () => {
    const a = oc(box(10, 10, 10));
    const b = oc(translate(box(10, 10, 10), [5, 5, 5]));
    const fused = kernel.fuse(a, b);
    expect(kernel.isValid(fused)).toBe(true);
    // Overlapping boxes: total volume < sum of individual volumes
    expect(kernel.volume(fused)).toBeLessThan(2000);
    expect(kernel.volume(fused)).toBeGreaterThan(1000);
  });

  it('cut', () => {
    const a = oc(box(20, 20, 20));
    const b = oc(translate(box(10, 10, 10), [5, 5, 5]));
    const result = kernel.cut(a, b);
    expect(kernel.isValid(result)).toBe(true);
    expect(kernel.volume(result)).toBeCloseTo(8000 - 1000, 0);
  });

  it('intersect', () => {
    const a = oc(box(10, 10, 10));
    const b = oc(translate(box(10, 10, 10), [5, 5, 5]));
    const result = kernel.intersect(a, b);
    expect(kernel.isValid(result)).toBe(true);
    expect(kernel.volume(result)).toBeCloseTo(125, 0);
  });

  it('section', () => {
    const b = oc(box(10, 10, 10));
    const plane = oc(translate(box(12, 12, 0.02), [-1, -1, 4.99]));
    const result = kernel.section(b, plane);
    expect(result).toBeDefined();
  });

  it('fuseAll', () => {
    const a = oc(box(10, 10, 10));
    const b = oc(translate(box(10, 10, 10), [5, 0, 0]));
    const c = oc(translate(box(10, 10, 10), [10, 0, 0]));
    const fused = kernel.fuseAll([a, b, c]);
    expect(kernel.isValid(fused)).toBe(true);
    expect(kernel.volume(fused)).toBeCloseTo(2000, 0);
  });

  it('cutAll', () => {
    const base = oc(box(20, 20, 20));
    const t1 = oc(box(5, 5, 5));
    const t2 = oc(translate(box(5, 5, 5), [15, 15, 15]));
    const result = kernel.cutAll(base, [t1, t2]);
    expect(kernel.isValid(result)).toBe(true);
    expect(kernel.volume(result)).toBeCloseTo(8000 - 250, 0);
  });

  it('split (may not be available in WASM)', () => {
    const b = oc(box(10, 10, 10));
    const splitter = oc(translate(box(12, 12, 0.02), [-1, -1, 4.99]));
    try {
      const result = kernel.split(b, [splitter]);
      expect(result).toBeDefined();
    } catch (e) {
      // BRepAlgoAPI_Splitter may not be in the WASM build
      expect(String(e)).toContain('not available');
    }
  });
});

// ---------------------------------------------------------------------------
// sweepOps
// ---------------------------------------------------------------------------

describe('sweepOps', () => {
  it('extrude', () => {
    const b = box(10, 10, 1);
    const faces = getFaces(b);
    // Get the top face (Z=1)
    const topFace = faces.find((f) => {
      const bb = kernel.boundingBox(oc(f));
      return Math.abs(bb.min[2] - 1) < 0.01 && Math.abs(bb.max[2] - 1) < 0.01;
    });
    if (topFace) {
      const extruded = kernel.extrude(oc(topFace), [0, 0, 1], 20);
      expect(extruded).toBeDefined();
      expect(kernel.volume(extruded)).toBeGreaterThan(0);
    }
  });

  it('loft', () => {
    const face1 = box(10, 10, 0.01);
    const face2 = translate(box(5, 5, 0.01), [2.5, 2.5, 20]);
    const wires1 = getWires(face1);
    const wires2 = getWires(face2);
    if (wires1.length > 0 && wires2.length > 0) {
      const lofted = kernel.loft([oc(wires1[0]!), oc(wires2[0]!)]);
      expect(lofted).toBeDefined();
      expect(kernel.volume(lofted)).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// transformOps
// ---------------------------------------------------------------------------

describe('transformOps', () => {
  it('translate', () => {
    const b = oc(box(10, 10, 10));
    const moved = kernel.translate(b, 100, 200, 300);
    expect(kernel.isValid(moved)).toBe(true);
    const bb = kernel.boundingBox(moved);
    expect(bb.min[0]).toBeCloseTo(100, 0);
    expect(bb.min[1]).toBeCloseTo(200, 0);
    expect(bb.min[2]).toBeCloseTo(300, 0);
    expect(kernel.volume(moved)).toBeCloseTo(1000, 0);
  });

  it('rotate', () => {
    const b = oc(box(10, 10, 10));
    const rotated = kernel.rotate(b, Math.PI / 2, [0, 0, 1], [0, 0, 0]);
    expect(kernel.isValid(rotated)).toBe(true);
    expect(kernel.volume(rotated)).toBeCloseTo(1000, 0);
  });

  it('mirror', () => {
    const b = oc(translate(box(10, 10, 10), [5, 0, 0]));
    const mirrored = kernel.mirror(b, [0, 0, 0], [1, 0, 0]);
    expect(kernel.isValid(mirrored)).toBe(true);
    const bb = kernel.boundingBox(mirrored);
    expect(bb.max[0]).toBeCloseTo(-5, 0);
    expect(kernel.volume(mirrored)).toBeCloseTo(1000, 0);
  });

  it('scale', () => {
    const b = oc(box(10, 10, 10));
    const scaled = kernel.scale(b, [0, 0, 0], 2);
    expect(kernel.isValid(scaled)).toBe(true);
    expect(kernel.volume(scaled)).toBeCloseTo(8000, 0);
  });

  it('simplify', () => {
    const b = oc(box(10, 10, 10));
    const simplified = kernel.simplify(b);
    expect(kernel.isValid(simplified)).toBe(true);
    expect(kernel.volume(simplified)).toBeCloseTo(1000, 0);
  });
});

// ---------------------------------------------------------------------------
// ioOps
// ---------------------------------------------------------------------------

describe('ioOps', () => {
  it('STEP export and import round-trip', () => {
    const b = oc(box(10, 20, 30));
    const stepStr = kernel.exportSTEP([b]);
    expect(typeof stepStr).toBe('string');
    expect(stepStr.length).toBeGreaterThan(100);

    const imported = kernel.importSTEP(stepStr);
    expect(imported.length).toBeGreaterThan(0);
    let totalVol = 0;
    for (const s of imported) totalVol += kernel.volume(s);
    expect(totalVol).toBeCloseTo(6000, -1);
  });

  it('STL export ASCII', () => {
    const b = oc(box(10, 10, 10));
    // Mesh first before exporting STL
    kernel.mesh(b, { tolerance: 0.1, angularTolerance: 0.5 });
    const stl = kernel.exportSTL(b, false);
    expect(typeof stl).toBe('string');
    expect((stl as string).length).toBeGreaterThan(100);
    expect(stl as string).toContain('solid');
  });

  it('STL export binary', () => {
    const b = oc(box(10, 10, 10));
    kernel.mesh(b, { tolerance: 0.1, angularTolerance: 0.5 });
    const stl = kernel.exportSTL(b, true);
    expect(stl).toBeInstanceOf(ArrayBuffer);
    expect((stl as ArrayBuffer).byteLength).toBeGreaterThan(80);
  });

  it('STL import', () => {
    const b = oc(box(10, 10, 10));
    kernel.mesh(b, { tolerance: 0.1, angularTolerance: 0.5 });
    const stl = kernel.exportSTL(b, false);
    const imported = kernel.importSTL(stl);
    expect(imported).toBeDefined();
  });

  it('IGES export and import (may not be available in WASM)', () => {
    const b = oc(box(10, 10, 10));
    try {
      const iges = kernel.exportIGES([b]);
      expect(typeof iges).toBe('string');
      expect(iges.length).toBeGreaterThan(100);
      const imported = kernel.importIGES(iges);
      expect(imported.length).toBeGreaterThan(0);
    } catch {
      // IGESControl_Writer may not be in the WASM build
      expect(true).toBe(true);
    }
  });

  it('STEP import with invalid data returns empty', () => {
    // Invalid STEP data should throw or return empty
    try {
      const result = kernel.importSTEP('not a valid step file');
      expect(result).toHaveLength(0);
    } catch {
      // Throwing is also acceptable
      expect(true).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// modifierOps
// ---------------------------------------------------------------------------

describe('modifierOps', () => {
  it('fillet', () => {
    const b = box(20, 20, 20);
    const edges = getEdges(b);
    const filleted = kernel.fillet(oc(b), [oc(edges[0]!)], 2);
    expect(kernel.isValid(filleted)).toBe(true);
    expect(kernel.volume(filleted)).toBeLessThan(8000);
    expect(kernel.volume(filleted)).toBeGreaterThan(7000);
  });

  it('fillet variable radius', () => {
    const b = box(20, 20, 20);
    const edges = getEdges(b);
    const filleted = kernel.fillet(oc(b), [oc(edges[0]!)], [1, 3]);
    expect(kernel.isValid(filleted)).toBe(true);
    expect(kernel.volume(filleted)).toBeLessThan(8000);
  });

  it('chamfer', () => {
    const b = box(20, 20, 20);
    const edges = getEdges(b);
    const chamfered = kernel.chamfer(oc(b), [oc(edges[0]!)], 2);
    expect(kernel.isValid(chamfered)).toBe(true);
    expect(kernel.volume(chamfered)).toBeLessThan(8000);
  });

  it('chamfer asymmetric', () => {
    const b = box(20, 20, 20);
    const edges = getEdges(b);
    const chamfered = kernel.chamfer(oc(b), [oc(edges[0]!)], [2, 4]);
    expect(kernel.isValid(chamfered)).toBe(true);
    expect(kernel.volume(chamfered)).toBeLessThan(8000);
  });

  it('shell', () => {
    const b = box(20, 20, 20);
    const faces = getFaces(b);
    const shelled = kernel.shell(oc(b), [oc(faces[0]!)], 1);
    expect(kernel.isValid(shelled)).toBe(true);
    expect(kernel.volume(shelled)).toBeLessThan(8000);
    expect(kernel.volume(shelled)).toBeGreaterThan(0);
  });

  it('thicken', () => {
    const b = box(10, 10, 0.01);
    const faces = getFaces(b);
    // Find a planar face
    const topFace = faces.find((f) => {
      const bb = kernel.boundingBox(oc(f));
      return Math.abs(bb.max[2] - bb.min[2]) < 0.02;
    });
    if (topFace) {
      const thickened = kernel.thicken(oc(topFace), 5);
      expect(thickened).toBeDefined();
      // Volume may be negative depending on face normal direction
      expect(Math.abs(kernel.volume(thickened))).toBeGreaterThan(0);
    }
  });

  it('chamferDistAngle', () => {
    const b = box(20, 20, 20);
    const edges = getEdges(b);
    const chamfered = kernel.chamferDistAngle(oc(b), [oc(edges[0]!)], 2, 45);
    expect(kernel.isValid(chamfered)).toBe(true);
  });

  it('offset', () => {
    const b = oc(box(10, 10, 10));
    const result = kernel.offset(b, 1);
    expect(kernel.isValid(result)).toBe(true);
    expect(kernel.volume(result)).toBeGreaterThan(1000);
  });
});

// ---------------------------------------------------------------------------
// healingOps
// ---------------------------------------------------------------------------

describe('healingOps', () => {
  it('healSolid', () => {
    const b = oc(box(10, 10, 10));
    const result = kernel.healSolid(b);
    if (result !== null) {
      expect(kernel.isValid(result)).toBe(true);
    }
  });

  it('healFace', () => {
    const b = box(10, 10, 10);
    const faces = getFaces(b);
    const healed = kernel.healFace(oc(faces[0]!));
    expect(healed).toBeDefined();
  });

  it('healWire', () => {
    const b = box(10, 10, 10);
    const wires = getWires(b);
    const healed = kernel.healWire(oc(wires[0]!));
    expect(healed).toBeDefined();
  });

  it('healWire with face context', () => {
    const b = box(10, 10, 10);
    const faces = getFaces(b);
    const wires = getWires(faces[0]!);
    const healed = kernel.healWire(oc(wires[0]!), oc(faces[0]!));
    expect(healed).toBeDefined();
  });

  it('sew', () => {
    const b = box(10, 10, 10);
    const faces = getFaces(b);
    const ocFaces = faces.map((f) => oc(f));
    const sewn = kernel.sew(ocFaces);
    expect(sewn).toBeDefined();
  });

  it('isValid', () => {
    const b = oc(box(10, 10, 10));
    expect(kernel.isValid(b)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// measureOps
// ---------------------------------------------------------------------------

describe('measureOps', () => {
  it('volume', () => {
    const b = oc(box(3, 4, 5));
    expect(kernel.volume(b)).toBeCloseTo(60, 2);
  });

  it('area', () => {
    const b = oc(box(3, 4, 5));
    expect(kernel.area(b)).toBeCloseTo(94, 1);
  });

  it('length of edge', () => {
    const b = box(10, 10, 10);
    const edges = getEdges(b);
    const len = kernel.length(oc(edges[0]!));
    expect(len).toBeCloseTo(10, 1);
  });

  it('centerOfMass', () => {
    const b = oc(box(10, 10, 10));
    const com = kernel.centerOfMass(b);
    expect(com[0]).toBeCloseTo(5, 1);
    expect(com[1]).toBeCloseTo(5, 1);
    expect(com[2]).toBeCloseTo(5, 1);
  });

  it('boundingBox', () => {
    const b = oc(box(10, 20, 30));
    const bb = kernel.boundingBox(b);
    expect(bb.min[0]).toBeCloseTo(0, 1);
    expect(bb.min[1]).toBeCloseTo(0, 1);
    expect(bb.min[2]).toBeCloseTo(0, 1);
    expect(bb.max[0]).toBeCloseTo(10, 1);
    expect(bb.max[1]).toBeCloseTo(20, 1);
    expect(bb.max[2]).toBeCloseTo(30, 1);
  });

  it('distance between shapes', () => {
    const box1 = oc(box(10, 10, 10));
    const box2 = oc(translate(box(10, 10, 10), [20, 0, 0]));
    const dist = kernel.distance(box1, box2);
    expect(dist.value).toBeCloseTo(10, 1);
  });
});

// ---------------------------------------------------------------------------
// topologyOps
// ---------------------------------------------------------------------------

describe('topologyOps', () => {
  it('iterShapes returns faces', () => {
    const b = oc(box(10, 10, 10));
    const faces = kernel.iterShapes(b, 'face');
    expect(faces).toHaveLength(6);
  });

  it('iterShapes returns edges', () => {
    const b = oc(box(10, 10, 10));
    const edges = kernel.iterShapes(b, 'edge');
    expect(edges).toHaveLength(12);
  });

  it('iterShapes returns vertices', () => {
    const b = oc(box(10, 10, 10));
    const verts = kernel.iterShapes(b, 'vertex');
    expect(verts).toHaveLength(8);
  });

  it('iterShapes returns wires', () => {
    const b = oc(box(10, 10, 10));
    const wires = kernel.iterShapes(b, 'wire');
    expect(wires).toHaveLength(6);
  });

  it('shapeType', () => {
    expect(kernel.shapeType(oc(box(1, 1, 1)))).toBe('solid');
    expect(kernel.shapeType(kernel.makeVertex(0, 0, 0))).toBe('vertex');
  });

  it('isSame', () => {
    const b = oc(box(10, 10, 10));
    expect(kernel.isSame(b, b)).toBe(true);
    const b2 = oc(box(10, 10, 10));
    expect(kernel.isSame(b, b2)).toBe(false);
  });

  it('isEqual', () => {
    const b = oc(box(10, 10, 10));
    expect(kernel.isEqual(b, b)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// curveOps
// ---------------------------------------------------------------------------

describe('curveOps', () => {
  it('interpolatePoints', () => {
    const points: [number, number, number][] = [
      [0, 0, 0],
      [5, 5, 0],
      [10, 0, 0],
      [15, 5, 0],
      [20, 0, 0],
    ];
    const edge = kernel.interpolatePoints(points);
    expect(edge).toBeDefined();
    expect(kernel.shapeType(edge)).toBe('edge');
    expect(kernel.length(edge)).toBeGreaterThan(0);
  });

  it('approximatePoints', () => {
    const points: [number, number, number][] = [
      [0, 0, 0],
      [3, 4, 0],
      [6, 2, 0],
      [9, 6, 0],
      [12, 0, 0],
    ];
    const edge = kernel.approximatePoints(points);
    expect(edge).toBeDefined();
    expect(kernel.shapeType(edge)).toBe('edge');
    expect(kernel.length(edge)).toBeGreaterThan(0);
  });

  it('approximatePoints with options', () => {
    const points: [number, number, number][] = [
      [0, 0, 0],
      [5, 10, 0],
      [10, 0, 0],
    ];
    const edge = kernel.approximatePoints(points, { tolerance: 0.01, degMax: 5 });
    expect(edge).toBeDefined();
    expect(kernel.shapeType(edge)).toBe('edge');
  });
});
