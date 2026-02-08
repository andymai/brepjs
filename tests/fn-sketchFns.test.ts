import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  sketchRectangle,
  sketchCircle,
  measureVolume,
  measureArea,
  Sketcher,
  CompoundSketch,
} from '../src/index.js';
import {
  sketchExtrude,
  sketchRevolve,
  sketchLoft,
  sketchFace,
  sketchWires,
  sketchSweep,
  compoundSketchExtrude,
  compoundSketchFace,
  compoundSketchRevolve,
  compoundSketchLoft,
} from '../src/sketching/sketchFns.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('sketchExtrude', () => {
  it('extrudes a rectangle sketch into a solid', () => {
    const sketch = sketchRectangle(10, 10);
    const solid = sketchExtrude(sketch, 5);
    expect(solid).toBeDefined();
    expect(measureVolume(solid)).toBeCloseTo(500, 0);
  });

  it('extrudes with custom direction', () => {
    const sketch = sketchRectangle(10, 10);
    const solid = sketchExtrude(sketch, 5, { extrusionDirection: [0, 0, 1] });
    expect(solid).toBeDefined();
    expect(measureVolume(solid)).toBeCloseTo(500, 0);
  });
});

describe('sketchRevolve', () => {
  it('revolves a sketch into a solid', () => {
    // Create a rectangle on XZ plane offset from origin, revolve around Z
    const sketch = new Sketcher('XZ').movePointerTo([5, 0]).hLine(5).vLine(5).hLine(-5).close();
    const solid = sketchRevolve(sketch, [0, 0, 1]);
    expect(solid).toBeDefined();
    expect(measureVolume(solid)).toBeGreaterThan(0);
  });
});

describe('sketchLoft', () => {
  it('lofts between two sketches', () => {
    const s1 = sketchRectangle(10, 10);
    const s2 = sketchCircle(5, { plane: 'XY', origin: 5 });
    const solid = sketchLoft(s1, s2);
    expect(solid).toBeDefined();
    expect(measureVolume(solid)).toBeGreaterThan(0);
  });
});

describe('sketchFace', () => {
  it('returns a face from a closed sketch', () => {
    const sketch = sketchRectangle(10, 10);
    const face = sketchFace(sketch);
    expect(face).toBeDefined();
  });
});

describe('sketchWires', () => {
  it('returns a wire from a sketch', () => {
    const sketch = sketchRectangle(10, 10);
    const wire = sketchWires(sketch);
    expect(wire).toBeDefined();
  });
});

describe('sketchSweep', () => {
  it('sweeps a profile along a path', () => {
    const path = new Sketcher('XZ').movePointerTo([0, 0]).lineTo([0, 20]).done();
    const solid = sketchSweep(path, (plane, origin) => {
      return new Sketcher(plane, origin)
        .movePointerTo([-2, -2])
        .hLine(4)
        .vLine(4)
        .hLine(-4)
        .close();
    });
    expect(solid).toBeDefined();
    expect(measureVolume(solid)).toBeGreaterThan(0);
  });
});

describe('compoundSketchExtrude', () => {
  it('extrudes a compound sketch with a hole', () => {
    const outer = sketchRectangle(20, 20);
    const inner = sketchCircle(3);
    const compound = new CompoundSketch([outer, inner]);
    const solid = compoundSketchExtrude(compound, 10);
    expect(solid).toBeDefined();
    const vol = measureVolume(solid);
    // Volume should be box minus cylinder: 20*20*10 - pi*9*10
    expect(vol).toBeCloseTo(20 * 20 * 10 - Math.PI * 9 * 10, -1);
  });
});

describe('compoundSketchFace', () => {
  it('returns a face with holes from a compound sketch', () => {
    const outer = sketchRectangle(20, 20);
    const inner = sketchCircle(3);
    const compound = new CompoundSketch([outer, inner]);
    const face = compoundSketchFace(compound);
    expect(face).toBeDefined();
    const area = measureArea(face);
    // Area should be rectangle minus circle: 20*20 - pi*9
    expect(area).toBeCloseTo(20 * 20 - Math.PI * 9, -1);
  });
});

describe('compoundSketchRevolve', () => {
  it('revolves a compound sketch around an axis', () => {
    const outer = new Sketcher('XZ').movePointerTo([10, 0]).hLine(5).vLine(5).hLine(-5).close();
    const inner = new Sketcher('XZ').movePointerTo([11, 1]).hLine(3).vLine(3).hLine(-3).close();
    const compound = new CompoundSketch([outer, inner]);
    const solid = compoundSketchRevolve(compound, [0, 0, 1]);
    expect(solid).toBeDefined();
    expect(measureVolume(solid)).toBeGreaterThan(0);
  });
});

describe('compoundSketchLoft', () => {
  it('lofts between two compound sketches', () => {
    const outer1 = sketchRectangle(10, 10);
    const inner1 = sketchCircle(2);
    const compound1 = new CompoundSketch([outer1, inner1]);

    const outer2 = sketchRectangle(10, 10, { plane: 'XY', origin: 10 });
    const inner2 = sketchCircle(2, { plane: 'XY', origin: 10 });
    const compound2 = new CompoundSketch([outer2, inner2]);

    const solid = compoundSketchLoft(compound1, compound2, { ruled: true });
    expect(solid).toBeDefined();
    expect(measureVolume(solid)).toBeGreaterThan(0);
  });
});
