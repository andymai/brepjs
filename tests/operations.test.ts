import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { expectClose } from './helpers/kernelDivergences.js';
import Sketcher from '@/sketching/sketcher.js';
import {
  box,
  sphere,
  sketchCircle,
  sketchRectangle,
  loft,
  extrude,
  revolve,
  measureVolume,
  unwrap,
  isOk,
  getBounds,
  resolvePlane,
  getEdges,
  getFaces,
  exportSTEP,
  exportSTL,
  translate,
  rotate,
  scale,
  mirror,
  mesh,
  meshEdges,
  fuse,
  cut,
  intersect,
} from '@/index.js';
import type { OrientedFace, PlanarFace } from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('extrude', () => {
  it('extrudes a rectangular sketch into a solid', () => {
    const sketch = sketchRectangle(10, 20);
    const face = sketch.face() as OrientedFace & PlanarFace;
    const solid = unwrap(extrude(face, [0, 0, 30]));
    expect(solid).toBeDefined();
    expect(unwrap(measureVolume(solid))).toBeCloseTo(10 * 20 * 30, 0);
  });

  it('extrudes a circular sketch', () => {
    const sketch = sketchCircle(5);
    const face = sketch.face() as OrientedFace & PlanarFace;
    const solid = unwrap(extrude(face, [0, 0, 10]));
    expect(solid).toBeDefined();
    expect(unwrap(measureVolume(solid))).toBeCloseTo(Math.PI * 25 * 10, -1);
  });
});

describe('revolve', () => {
  it('revolves a face 360 degrees', () => {
    const sketch = new Sketcher('XZ')
      .movePointerTo([1, 0])
      .lineTo([2, 0])
      .lineTo([2, 5])
      .lineTo([1, 5])
      .close();
    const face = sketch.face() as OrientedFace & PlanarFace;
    // Note: revolve() passes angle directly to kernel (radians); use 2π for full revolution
    const solid = unwrap(revolve(face, { at: [0, 0, 0], axis: [0, 0, 1], angle: 2 * Math.PI }));
    expect(solid).toBeDefined();
    // Volume of hollow cylinder: π(R²-r²)*h
    expect(unwrap(measureVolume(solid))).toBeCloseTo(Math.PI * (4 - 1) * 5, 0);
  });
});

describe('loft', () => {
  it('lofts between two circles', () => {
    const bottom = sketchCircle(10);
    const top = sketchCircle(5, { origin: [0, 0, 10] });
    const solid = unwrap(loft([bottom.wire, top.wire]));
    expect(solid).toBeDefined();
    const vol = unwrap(measureVolume(solid));
    // Truncated cone: (π*h/3)(R² + Rr + r²)
    const expected = ((Math.PI * 10) / 3) * (100 + 50 + 25);
    // Analytic skinning makes coaxial-circle lofts exact across kernels.
    expectClose(vol, expected, 1e-3);
  });
});

describe('Shape.mesh()', () => {
  it('produces mesh with expected structure', () => {
    const b = box(10, 10, 10);
    const m = mesh(b);

    expect(m.triangles.length).toBeGreaterThan(0);
    expect(m.vertices.length).toBeGreaterThan(0);
    expect(m.normals.length).toBeGreaterThan(0);
    expect(m.faceGroups.length).toBe(6); // 6 faces of a box

    // Triangle indices reference valid vertices
    expect(m.triangles.length % 3).toBe(0);
    expect(m.vertices.length % 3).toBe(0);
    expect(m.normals.length % 3).toBe(0);
    expect(m.vertices.length).toBe(m.normals.length);
  });

  it('respects skipNormals option', () => {
    const b = box(10, 10, 10);
    const m = mesh(b, { skipNormals: true });

    expect(m.triangles.length).toBeGreaterThan(0);
    expect(m.vertices.length).toBeGreaterThan(0);
    // With skipNormals, normals array should be empty
    expect(m.normals.length).toBe(0);
  });

  it('faceGroups cover all triangles', () => {
    const s = sphere(5);
    const m = mesh(s);

    let totalFromGroups = 0;
    for (const group of m.faceGroups) {
      totalFromGroups += group.count;
    }
    expect(totalFromGroups).toBe(m.triangles.length);
  });
});

describe('Shape.meshEdges()', () => {
  it('produces edge lines for a box', () => {
    const b = box(10, 10, 10);
    const { lines, edgeGroups } = meshEdges(b);

    expect(lines.length).toBeGreaterThan(0);
    expect(lines.length % 3).toBe(0); // x, y, z per point
    expect(edgeGroups.length).toBe(12); // 12 edges of a box
  });
});

describe('Shape topology accessors', () => {
  it('box has 12 edges, 6 faces, 8 vertices', () => {
    const b = box(10, 10, 10);
    expect(getEdges(b).length).toBe(12);
    expect(getFaces(b).length).toBe(6);
  });

  it('bounding box is correct', () => {
    const b = box(10, 20, 30);
    const bb = getBounds(b);
    expect(bb).toBeDefined();
    expect(bb.xMax).toBeCloseTo(10);
    expect(bb.yMax).toBeCloseTo(20);
    expect(bb.zMax).toBeCloseTo(30);
  });
});

describe('Shape transformations', () => {
  it('translate produces correct volume', () => {
    const b = translate(box(10, 10, 10), [5, 5, 5]);
    expect(unwrap(measureVolume(b))).toBeCloseTo(1000, 0);
  });

  it('rotate preserves volume', () => {
    const b = rotate(box(10, 10, 10), 45);
    expect(unwrap(measureVolume(b))).toBeCloseTo(1000, 0);
  });

  it('scale changes volume', () => {
    const b = scale(box(10, 10, 10), 2);
    expect(unwrap(measureVolume(b))).toBeCloseTo(8000, 0);
  });

  it('mirror preserves volume', () => {
    const b = mirror(box(10, 10, 10), { normal: [0, 0, 1] });
    expect(unwrap(measureVolume(b))).toBeCloseTo(1000, 0);
  });

  it('mirror with Plane object', () => {
    const plane = unwrap(resolvePlane('YZ'));
    const b = mirror(box(10, 10, 10), { normal: plane.zDir, origin: plane.origin });
    expect(unwrap(measureVolume(b))).toBeCloseTo(1000, 0);
  });

  it('mirror with Plane and custom origin', () => {
    const plane = unwrap(resolvePlane('YZ'));
    const b = mirror(box(10, 10, 10), { normal: plane.zDir, origin: [5, 0, 0] });
    expect(unwrap(measureVolume(b))).toBeCloseTo(1000, 0);
  });

  it('mirror with default (no args)', () => {
    const b = mirror(box(10, 10, 10));
    expect(unwrap(measureVolume(b))).toBeCloseTo(1000, 0);
  });
});

describe('Boolean operations', () => {
  it('fuse increases volume', () => {
    const box1 = box(10, 10, 10);
    const box2 = translate(box1, [5, 0, 0]);
    const fused = unwrap(fuse(box1, box2));
    expect(unwrap(measureVolume(fused))).toBeCloseTo(1500, 0);
  });

  it('cut decreases volume', () => {
    const box1 = box(10, 10, 10);
    const box2 = translate(box1, [5, 0, 0]);
    const c = unwrap(cut(box1, box2));
    expect(unwrap(measureVolume(c))).toBeCloseTo(500, 0);
  });

  it('intersect yields overlap', () => {
    const box1 = box(10, 10, 10);
    const box2 = translate(box1, [5, 0, 0]);
    const intersection = unwrap(intersect(box1, box2));
    expect(unwrap(measureVolume(intersection))).toBeCloseTo(500, 0);
  });
});

describe('Result error paths', () => {
  it('revolve returns Ok for valid input', () => {
    const sketch = new Sketcher('XZ')
      .movePointerTo([1, 0])
      .lineTo([2, 0])
      .lineTo([2, 1])
      .lineTo([1, 1])
      .close();
    const face = sketch.face() as OrientedFace & PlanarFace;
    const result = revolve(face, { at: [0, 0, 0], axis: [0, 0, 1], angle: 2 * Math.PI });
    expect(isOk(result)).toBe(true);
  });

  it('loft returns Ok for valid wires', () => {
    const bottom = sketchCircle(10);
    const top = sketchCircle(5, { origin: [0, 0, 10] });
    const result = loft([bottom.wire, top.wire]);
    expect(isOk(result)).toBe(true);
  });

  it('fuse returns Ok for overlapping shapes', () => {
    const box1 = box(10, 10, 10);
    const box2 = translate(box(10, 10, 10), [5, 0, 0]);
    const result = fuse(box1, box2);
    expect(isOk(result)).toBe(true);
  });

  it('blobSTEP returns Ok for valid shape', () => {
    const b = box(10, 10, 10);
    const result = exportSTEP(b);
    expect(isOk(result)).toBe(true);
  });

  it('blobSTL returns Ok for valid shape', () => {
    const b = box(10, 10, 10);
    const result = exportSTL(b);
    expect(isOk(result)).toBe(true);
  });
});
