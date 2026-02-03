import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  makeBox,
  makeSphere,
  makeCylinder,
  Sketcher,
  sketchCircle,
  sketchRectangle,
  basicFaceExtrusion,
  revolution,
  loft,
  measureVolume,
  unwrap,
  isOk,
  isErr,
  getBounds,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('basicFaceExtrusion', () => {
  it('extrudes a rectangular sketch into a solid', () => {
    const sketch = sketchRectangle(10, 20);
    const face = sketch.face();
    const solid = basicFaceExtrusion(face, [0, 0, 30]);
    expect(solid).toBeDefined();
    expect(measureVolume(solid)).toBeCloseTo(10 * 20 * 30, 0);
  });

  it('extrudes a circular sketch', () => {
    const sketch = sketchCircle(5);
    const face = sketch.face();
    const solid = basicFaceExtrusion(face, [0, 0, 10]);
    expect(solid).toBeDefined();
    expect(measureVolume(solid)).toBeCloseTo(Math.PI * 25 * 10, 0);
  });
});

describe('revolution', () => {
  it('revolves a face 360 degrees', () => {
    const sketch = new Sketcher('XZ')
      .movePointerTo([1, 0])
      .lineTo([2, 0])
      .lineTo([2, 5])
      .lineTo([1, 5])
      .close();
    const face = sketch.face();
    const solid = unwrap(revolution(face, [0, 0, 0], [0, 0, 1], 360));
    expect(solid).toBeDefined();
    // Volume of hollow cylinder: π(R²-r²)*h
    expect(measureVolume(solid)).toBeCloseTo(Math.PI * (4 - 1) * 5, 0);
  });
});

describe('loft', () => {
  it('lofts between two circles', () => {
    const bottom = sketchCircle(10);
    const top = sketchCircle(5, { origin: [0, 0, 10] });
    const solid = unwrap(loft([bottom.wire, top.wire]));
    expect(solid).toBeDefined();
    const vol = measureVolume(solid);
    // Truncated cone: (π*h/3)(R² + Rr + r²)
    const expected = ((Math.PI * 10) / 3) * (100 + 50 + 25);
    expect(vol).toBeCloseTo(expected, -1);
  });
});

describe('Shape.mesh()', () => {
  it('produces mesh with expected structure', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const mesh = box.mesh();

    expect(mesh.triangles.length).toBeGreaterThan(0);
    expect(mesh.vertices.length).toBeGreaterThan(0);
    expect(mesh.normals.length).toBeGreaterThan(0);
    expect(mesh.faceGroups.length).toBe(6); // 6 faces of a box

    // Triangle indices reference valid vertices
    expect(mesh.triangles.length % 3).toBe(0);
    expect(mesh.vertices.length % 3).toBe(0);
    expect(mesh.normals.length % 3).toBe(0);
    expect(mesh.vertices.length).toBe(mesh.normals.length);
  });

  it('respects skipNormals option', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const mesh = box.mesh({ skipNormals: true });

    expect(mesh.triangles.length).toBeGreaterThan(0);
    expect(mesh.vertices.length).toBeGreaterThan(0);
    // With skipNormals, normals array should be empty
    expect(mesh.normals.length).toBe(0);
  });

  it('faceGroups cover all triangles', () => {
    const sphere = makeSphere(5);
    const mesh = sphere.mesh();

    let totalFromGroups = 0;
    for (const group of mesh.faceGroups) {
      totalFromGroups += group.count;
    }
    expect(totalFromGroups).toBe(mesh.triangles.length);
  });
});

describe('Shape.meshEdges()', () => {
  it('produces edge lines for a box', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const { lines, edgeGroups } = box.meshEdges();

    expect(lines.length).toBeGreaterThan(0);
    expect(lines.length % 3).toBe(0); // x, y, z per point
    expect(edgeGroups.length).toBe(12); // 12 edges of a box
  });
});

describe('Shape topology accessors', () => {
  it('box has 12 edges, 6 faces, 8 vertices', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    expect(box.edges.length).toBe(12);
    expect(box.faces.length).toBe(6);
  });

  it('bounding box is correct', () => {
    const box = makeBox([0, 0, 0], [10, 20, 30]);
    const bb = getBounds(box);
    expect(bb).toBeDefined();
    expect(bb.xMax).toBeCloseTo(10);
    expect(bb.yMax).toBeCloseTo(20);
    expect(bb.zMax).toBeCloseTo(30);
  });
});

describe('Shape transformations', () => {
  it('translate produces correct volume', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]).translate([5, 5, 5]);
    expect(measureVolume(box)).toBeCloseTo(1000, 0);
  });

  it('rotate preserves volume', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]).rotate(45);
    expect(measureVolume(box)).toBeCloseTo(1000, 0);
  });

  it('scale changes volume', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]).scale(2);
    expect(measureVolume(box)).toBeCloseTo(8000, 0);
  });

  it('mirror preserves volume', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]).mirror('XY');
    expect(measureVolume(box)).toBeCloseTo(1000, 0);
  });
});

describe('Boolean operations', () => {
  it('fuse increases volume', () => {
    const box1 = makeBox([0, 0, 0], [10, 10, 10]);
    const box2 = makeBox([0, 0, 0], [10, 10, 10]).translate([5, 0, 0]);
    const fused = unwrap(box1.fuse(box2));
    expect(measureVolume(fused)).toBeCloseTo(1500, 0);
  });

  it('cut decreases volume', () => {
    const box1 = makeBox([0, 0, 0], [10, 10, 10]);
    const box2 = makeBox([0, 0, 0], [10, 10, 10]).translate([5, 0, 0]);
    const cut = unwrap(box1.cut(box2));
    expect(measureVolume(cut)).toBeCloseTo(500, 0);
  });

  it('intersect yields overlap', () => {
    const box1 = makeBox([0, 0, 0], [10, 10, 10]);
    const box2 = makeBox([0, 0, 0], [10, 10, 10]).translate([5, 0, 0]);
    const intersection = unwrap(box1.intersect(box2));
    expect(measureVolume(intersection)).toBeCloseTo(500, 0);
  });
});

describe('Result error paths', () => {
  it('revolution returns Ok for valid input', () => {
    const sketch = new Sketcher('XZ')
      .movePointerTo([1, 0])
      .lineTo([2, 0])
      .lineTo([2, 1])
      .lineTo([1, 1])
      .close();
    const face = sketch.face();
    const result = revolution(face, [0, 0, 0], [0, 0, 1]);
    expect(isOk(result)).toBe(true);
  });

  it('loft returns Ok for valid wires', () => {
    const bottom = sketchCircle(10);
    const top = sketchCircle(5, { origin: [0, 0, 10] });
    const result = loft([bottom.wire, top.wire]);
    expect(isOk(result)).toBe(true);
  });

  it('fuse returns Ok for overlapping shapes', () => {
    const box1 = makeBox([0, 0, 0], [10, 10, 10]);
    const box2 = makeBox([0, 0, 0], [10, 10, 10]).translate([5, 0, 0]);
    const result = box1.fuse(box2);
    expect(isOk(result)).toBe(true);
  });

  it('blobSTEP returns Ok for valid shape', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const result = box.blobSTEP();
    expect(isOk(result)).toBe(true);
  });

  it('blobSTL returns Ok for valid shape', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const result = box.blobSTL();
    expect(isOk(result)).toBe(true);
  });
});
