/**
 * Tests that verify code examples from documentation are correct.
 *
 * Each test corresponds to a specific doc file and section.
 * If a test fails, the matching documentation example needs updating.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { isBrepkit } from './helpers/kernelEnv.js';
import {
  box,
  cylinder,
  sphere,
  line,
  wireLoop,
  face,
  extrude,
  cut,
  shape,
  edgeFinder,
  faceFinder,
  measureVolume,
  measureArea,
  getVertices,
  exportSTEP,
  drawRectangle,
  drawCircle,
  drawingCut,
  drawingToSketchOnPlane,
  closedWire,
  isClosedWire,
  isOrientedFace,
  isValidSolid,
  isSolid,
  isShape3D,
  isOk,
  isErr,
  unwrap,
  match,
  type ValidSolid,
} from '../src/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

/** Square wireLoop used by multiple tests. */
function squareWireLoop(): ReturnType<typeof wireLoop> {
  return wireLoop([
    line([0, 0, 0], [10, 0, 0]),
    line([10, 0, 0], [10, 10, 0]),
    line([10, 10, 0], [0, 10, 0]),
    line([0, 10, 0], [0, 0, 0]),
  ]);
}

describe('getting-started.md examples', () => {
  it('Step 3: primitives return ValidSolid', () => {
    const b = box(30, 20, 10);
    const cyl = cylinder(5, 20);
    const sph = sphere(8);

    expect(isValidSolid(b)).toBe(true);
    expect(isValidSolid(cyl)).toBe(true);
    expect(isValidSolid(sph)).toBe(true);
  });

  it('Step 4: fluent wrapper cut', () => {
    const b = box(30, 20, 10);
    const cyl = cylinder(5, 15, { at: [15, 10, -2] });
    const withHole = shape(b).cut(cyl).val;
    expect(isShape3D(withHole)).toBe(true);
    expect(unwrap(measureVolume(withHole))).toBeLessThan(unwrap(measureVolume(b)));
  });

  it('Step 4: functional API cut', () => {
    const b = box(30, 20, 10);
    const cyl = cylinder(5, 15, { at: [15, 10, -2] });
    const result = cut(b, cyl);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(unwrap(measureVolume(result.value))).toBeGreaterThan(0);
    }
  });

  it('Step 5: transforms', () => {
    const b = box(10, 10, 10);
    const moved = shape(b).translate([100, 0, 0]).val;
    expect(isSolid(moved)).toBe(true);

    const rotated = shape(b).rotate(45, { axis: [0, 0, 1] }).val;
    expect(isSolid(rotated)).toBe(true);

    const scaled = shape(b).scale(2).val;
    expect(unwrap(measureVolume(scaled))).toBeCloseTo(unwrap(measureVolume(b)) * 8, 0);
  });

  it('Step 6: measurement', () => {
    const b = box(10, 10, 10);
    expect(unwrap(measureVolume(b))).toBeCloseTo(1000, 0);
    expect(unwrap(measureArea(b))).toBeCloseTo(600, 0);
  });

  it('Step 7: export', () => {
    const b = box(10, 10, 10);
    const result = exportSTEP(b);
    expect(isOk(result)).toBe(true);
  });

  it('wireLoop example', () => {
    const cw = unwrap(squareWireLoop());
    expect(isClosedWire(cw)).toBe(true);

    const f = unwrap(face(cw));
    expect(isOrientedFace(f)).toBe(true);

    const s = unwrap(extrude(f, 10));
    expect(isSolid(s)).toBe(true);
    expect(unwrap(measureVolume(s))).toBeCloseTo(1000, 0);
  });
});

describe('concepts.md examples', () => {
  it('topology hierarchy: box has 6 faces, 12 edges, 8 vertices', () => {
    const b = box(10, 10, 10);
    const faces = faceFinder().findAll(b);
    const edges = edgeFinder().findAll(b);
    const vertices = getVertices(b);
    expect(faces.length).toBe(6);
    expect(edges.length).toBe(12);
    expect(vertices.length).toBe(8);
  });

  it('finders: inDirection selects correct faces', () => {
    const b = box(10, 10, 10);
    const topFaces = faceFinder().inDirection('Z').findAll(b);
    expect(topFaces.length).toBeGreaterThanOrEqual(1);
  });
});

describe('cheat-sheet.md examples', () => {
  it('boolean operations: fuse, cut, intersect', () => {
    const a = box(10, 10, 10);
    const b = cylinder(3, 15, { at: [5, 5, -2] });

    const merged = shape(a).fuse(b).val;
    expect(isShape3D(merged)).toBe(true);
    expect(unwrap(measureVolume(merged))).toBeGreaterThan(unwrap(measureVolume(a)));

    const drilled = shape(a).cut(b).val;
    expect(isShape3D(drilled)).toBe(true);
    expect(unwrap(measureVolume(drilled))).toBeLessThan(unwrap(measureVolume(a)));

    const common = shape(a).intersect(b).val;
    expect(isShape3D(common)).toBe(true);
    expect(unwrap(measureVolume(common))).toBeLessThan(unwrap(measureVolume(a)));
  });

  it('transforms: translate, rotate, scale', () => {
    const b = box(10, 10, 10);
    const moved = shape(b).translate([10, 0, 0]).val;
    const rotated = shape(b).rotate(45, { at: [0, 0, 0], axis: [0, 0, 1] }).val;
    const scaled = shape(b).scale(2).val;

    expect(isSolid(moved)).toBe(true);
    expect(isSolid(rotated)).toBe(true);
    expect(unwrap(measureVolume(scaled))).toBeCloseTo(8000, 0);
  });

  it('fillet and chamfer', () => {
    const b = box(20, 20, 20);
    const rounded = shape(b).fillet(2).val;
    expect(isShape3D(rounded)).toBe(true);
    expect(unwrap(measureVolume(rounded))).toBeLessThan(unwrap(measureVolume(b)));

    const beveled = shape(b).chamfer(2).val;
    expect(isShape3D(beveled)).toBe(true);
    expect(unwrap(measureVolume(beveled))).toBeLessThan(unwrap(measureVolume(b)));
  });

  it('measurement', () => {
    const b = box(10, 10, 10);
    expect(shape(b).volume()).toBeCloseTo(1000, 0);
  });

  it('2D to 3D workflow', (ctx) => {
    if (isBrepkit) ctx.skip();
    const profile = drawingCut(drawRectangle(50, 30), drawCircle(8).translate([25, 15]));
    const sketch = drawingToSketchOnPlane(profile, 'XY');
    const solid = shape(sketch.face()).extrude(20).val;
    expect(isShape3D(solid)).toBe(true);
    // Volume should be positive and less than the full rectangle extruded
    expect(unwrap(measureVolume(solid))).toBeGreaterThan(0);
    expect(unwrap(measureVolume(solid))).toBeLessThan(50 * 30 * 20);
  });
});

describe('validity types (concepts.md + getting-started.md)', () => {
  it('smart constructors validate at runtime', () => {
    const cw = unwrap(squareWireLoop());
    const result = closedWire(cw);
    expect(isOk(result)).toBe(true);
  });

  it('type guards narrow correctly', () => {
    const cw = unwrap(squareWireLoop());
    expect(isClosedWire(cw)).toBe(true);

    const f = unwrap(face(cw));
    expect(isOrientedFace(f)).toBe(true);

    const s = box(10, 10, 10);
    expect(isValidSolid(s)).toBe(true);
  });

  it('ValidSolid is a subtype of Solid', () => {
    const vs: ValidSolid = box(10, 10, 10);
    expect(isSolid(vs)).toBe(true);
    expect(unwrap(measureVolume(vs))).toBeCloseTo(1000, 0);
  });
});

describe('error handling (getting-started.md)', () => {
  it('Result pattern: isOk/isErr', () => {
    const b = box(10, 10, 10);
    const cyl = cylinder(3, 15);
    const result = cut(b, cyl);

    expect(isOk(result)).toBe(true);
    expect(isErr(result)).toBe(false);
  });

  it('match pattern', () => {
    const b = box(10, 10, 10);
    const cyl = cylinder(3, 15);
    const result = cut(b, cyl);

    const volume = match(result, {
      ok: (solid) => unwrap(measureVolume(solid)),
      err: () => -1,
    });
    expect(volume).toBeGreaterThan(0);
  });
});
