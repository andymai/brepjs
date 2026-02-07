import { describe, it, expect, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  makeBox,
  makeCylinder,
  makeSphere,
  filletShape,
  chamferShape,
  cutShape,
  fuseShapes,
  translateShape,
  rotateShape,
  getEdges,
  unwrap,
  isSolid,
  isShape3D,
  Sketcher,
  basicFaceExtrusion,
  revolveFace,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('Example 1: Simple Box', () => {
  it('produces a valid solid', () => {
    // A simple 40×30×20 box
    const box = makeBox([0, 0, 0], [40, 30, 20]);

    expect(box).toBeDefined();
    expect(isSolid(box)).toBe(true);
  });
});

describe('Example 2: Filleted Box', () => {
  it('produces a valid 3D shape', () => {
    // Create a box and fillet all edges
    const box = makeBox([0, 0, 0], [40, 30, 20]);
    const filleted = unwrap(filletShape(box, undefined, 3));

    expect(filleted).toBeDefined();
    expect(isShape3D(filleted)).toBe(true);
  });
});

describe('Example 3: Boolean Subtraction', () => {
  it('produces a valid 3D shape', () => {
    // Box with a cylindrical hole
    const box = makeBox([0, 0, 0], [40, 40, 20]);
    const cyl = translateShape(makeCylinder(10, 30), [20, 20, -5]);
    const result = unwrap(cutShape(box, cyl));

    expect(result).toBeDefined();
    expect(isShape3D(result)).toBe(true);
  });
});

describe('Example 4: Chamfered Cylinder', () => {
  it('produces a valid 3D shape', () => {
    // Cylinder with chamfered edges
    const cyl = makeCylinder(20, 40);
    // Chamfer all edges with a small radius
    const chamfered = unwrap(chamferShape(cyl, undefined, 2));

    expect(chamfered).toBeDefined();
    expect(isShape3D(chamfered)).toBe(true);
  });
});

describe('Example 5: Extruded L-Shape', () => {
  it('produces a valid solid', () => {
    // Draw an L-shaped profile and extrude
    const sketch = new Sketcher()
      .lineTo([40, 0])
      .lineTo([40, 10])
      .lineTo([15, 10])
      .lineTo([15, 40])
      .lineTo([0, 40])
      .close();

    const face = sketch.face();
    const solid = basicFaceExtrusion(face, [0, 0, 15]);

    expect(solid).toBeDefined();
    expect(isSolid(solid)).toBe(true);
  });
});

describe('Example 6: Revolved Profile', () => {
  it('produces a valid solid', () => {
    // Revolve a profile to create a vase shape
    const sketch = new Sketcher()
      .lineTo([15, 0])
      .lineTo([20, 20])
      .lineTo([15, 35])
      .lineTo([23, 60])
      .lineTo([0, 60])
      .close();

    const face = sketch.face();
    const vase = unwrap(revolveFace(face));

    expect(vase).toBeDefined();
    expect(isSolid(vase)).toBe(true);
  });
});

describe('Example 7: Sphere with Holes', () => {
  it('produces a valid 3D shape', () => {
    // Sphere with holes along X, Y, and Z axes
    let shape = makeSphere(25);
    const hole = makeCylinder(8, 60);

    // Z-axis hole
    const holeZ = translateShape(hole, [0, 0, -30]);
    shape = unwrap(cutShape(shape, holeZ));

    // X-axis hole
    const holeX = rotateShape(translateShape(hole, [0, 0, -30]), 90, [0, 0, 0], [0, 1, 0]);
    shape = unwrap(cutShape(shape, holeX));

    // Y-axis hole
    const holeY = rotateShape(translateShape(hole, [0, 0, -30]), 90, [0, 0, 0], [1, 0, 0]);
    shape = unwrap(cutShape(shape, holeY));

    expect(shape).toBeDefined();
    expect(isShape3D(shape)).toBe(true);
  });
});

describe('Example 8: Spiral Staircase', () => {
  it('produces a valid 3D shape', () => {
    // Parametric spiral staircase (cm) - using reduced step count for faster test
    const steps = 3;
    const rise = 18; // height per step
    const twist = 22.5; // degrees per step
    const width = 70; // tread width
    const depth = 25; // tread depth
    const colR = 12; // column radius
    const thick = 4; // tread thickness

    // Central column + landing pad
    const column = makeCylinder(colR, steps * rise + thick);
    const landing = makeCylinder(colR + width, thick);
    let shape = unwrap(fuseShapes(column, landing));

    // Spiral treads with railing posts
    for (let i = 0; i < steps; i++) {
      const tread = makeBox([0, -depth / 2, 0], [colR + width, depth / 2, thick]);
      const post = translateShape(makeCylinder(1.5, 90), [colR + width - 4, 0, thick]);
      const step = unwrap(fuseShapes(tread, post));
      const placed = translateShape(step, [0, 0, rise * (i + 1)]);
      const rotated = rotateShape(placed, twist * i);
      shape = unwrap(fuseShapes(shape, rotated));
    }

    expect(shape).toBeDefined();
    expect(isShape3D(shape)).toBe(true);
  });
});
