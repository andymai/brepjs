import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import Sketcher from '@/sketching/sketcher.js';
import {
  sketchRectangle,
  sketchCircle,
  measureVolume,
  measureArea,
  CompoundSketch,
  isCompound,
  isValid,
  unwrap,
} from '@/index.js';
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
} from '@/sketching/sketchFns.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('sketchExtrude', () => {
  it('extrudes a rectangle sketch into a solid', () => {
    const sketch = sketchRectangle(10, 10);
    const solid = sketchExtrude(sketch, 5);
    expect(solid).toBeDefined();
    expect(unwrap(measureVolume(solid))).toBeCloseTo(500, 0);
  });

  it('extrudes with custom direction', () => {
    const sketch = sketchRectangle(10, 10);
    const solid = sketchExtrude(sketch, 5, { extrusionDirection: [0, 0, 1] });
    expect(solid).toBeDefined();
    expect(unwrap(measureVolume(solid))).toBeCloseTo(500, 0);
  });
});

describe('sketchRevolve', () => {
  it('revolves a sketch into a solid', () => {
    // Create a rectangle on XZ plane offset from origin, revolve around Z
    const sketch = new Sketcher('XZ').movePointerTo([5, 0]).hLine(5).vLine(5).hLine(-5).close();
    const solid = sketchRevolve(sketch, [0, 0, 1]);
    expect(solid).toBeDefined();
    expect(unwrap(measureVolume(solid))).toBeGreaterThan(0);
  });
});

describe('sketchLoft', () => {
  it('lofts between two sketches', () => {
    const s1 = sketchRectangle(10, 10);
    const s2 = sketchCircle(5, { plane: 'XY', origin: 5 });
    const solid = sketchLoft(s1, s2);
    expect(solid).toBeDefined();
    expect(unwrap(measureVolume(solid))).toBeGreaterThan(0);
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
    expect(unwrap(measureVolume(solid))).toBeGreaterThan(0);
  });
});

describe('compoundSketchExtrude', () => {
  it('extrudes a compound sketch with a hole', () => {
    const outer = sketchRectangle(20, 20);
    const inner = sketchCircle(3);
    const compound = new CompoundSketch([outer, inner]);
    const solid = compoundSketchExtrude(compound, 10);
    expect(solid).toBeDefined();
    const vol = unwrap(measureVolume(solid));
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
    const area = unwrap(measureArea(face));
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
    expect(unwrap(measureVolume(solid))).toBeGreaterThan(0);
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
    expect(unwrap(measureVolume(solid))).toBeGreaterThan(0);
  });
});

describe('CompoundSketch getters', () => {
  it('outerSketch returns the first sketch', () => {
    const outer = sketchRectangle(20, 20);
    const inner = sketchCircle(3);
    const compound = new CompoundSketch([outer, inner]);
    expect(compound.outerSketch).toBe(outer);
  });

  it('innerSketches returns all but the first sketch', () => {
    const outer = sketchRectangle(20, 20);
    const inner1 = sketchCircle(3);
    const inner2 = sketchCircle(2, { origin: [5, 5, 0] });
    const compound = new CompoundSketch([outer, inner1, inner2]);
    expect(compound.innerSketches).toHaveLength(2);
    expect(compound.innerSketches[0]).toBe(inner1);
    expect(compound.innerSketches[1]).toBe(inner2);
  });

  it('wires returns a compound of all sketch wires', () => {
    const outer = sketchRectangle(20, 20);
    const inner = sketchCircle(3);
    const compound = new CompoundSketch([outer, inner]);
    const wires = compound.wires;
    expect(isCompound(wires)).toBe(true);
  });
});

describe('CompoundSketch extrude options', () => {
  it('extrudes with custom extrusionDirection', () => {
    const outer = sketchRectangle(20, 20);
    const inner = sketchCircle(3);
    const compound = new CompoundSketch([outer, inner]);
    const solid = compound.extrude(10, { extrusionDirection: [0, 0, 1] });
    expect(solid).toBeDefined();
    expect(unwrap(measureVolume(solid))).toBeGreaterThan(0);
  });

  it('extrudes with twistAngle', () => {
    const outer = sketchRectangle(10, 10);
    const inner = sketchCircle(2);
    const compound = new CompoundSketch([outer, inner]);
    const solid = compound.extrude(10, { twistAngle: 30 });
    expect(solid).toBeDefined();
    // Must be a *valid* solid: the old shell-assembly produced an invalid,
    // inconsistently-oriented solid that a bare `> 0` check let through and whose
    // signed volume flipped negative under occt-wasm 3.3.0. isValid is the guard
    // that catches it on any kernel (volume magnitude is kernel-dependent).
    expect(isValid(solid)).toBe(true);
    expect(unwrap(measureVolume(solid))).toBeGreaterThan(0);
  });

  it('extrudes with extrusionProfile', () => {
    const outer = sketchRectangle(10, 10);
    const inner = sketchCircle(2);
    const compound = new CompoundSketch([outer, inner]);
    const solid = compound.extrude(10, {
      extrusionProfile: { profile: 'linear', endFactor: 0.5 },
    });
    expect(solid).toBeDefined();
    // Same guard: a valid (not inverted/invalid) solid with positive volume.
    expect(isValid(solid)).toBe(true);
    expect(unwrap(measureVolume(solid))).toBeGreaterThan(0);
  });
});

describe('CompoundSketch loftWith mismatch', () => {
  it('throws on mismatched sketch counts', () => {
    const c1 = new CompoundSketch([sketchRectangle(10, 10), sketchCircle(2)]);
    const c2 = new CompoundSketch([sketchRectangle(10, 10, { plane: 'XY', origin: 10 })]);
    expect(() => c1.loftWith(c2, { ruled: true })).toThrow();
  });
});

describe('CompoundSketch instance methods', () => {
  it('face() builds a face with the inner wires as holes', () => {
    const compound = new CompoundSketch([sketchRectangle(20, 20), sketchCircle(3)]);
    const area = unwrap(measureArea(compound.face()));
    expect(area).toBeCloseTo(20 * 20 - Math.PI * 9, -1);
  });

  it('revolve() produces a positive-volume solid', () => {
    const outer = new Sketcher('XZ').movePointerTo([10, 0]).hLine(5).vLine(5).hLine(-5).close();
    const inner = new Sketcher('XZ').movePointerTo([11, 1]).hLine(3).vLine(3).hLine(-3).close();
    const compound = new CompoundSketch([outer, inner]);
    expect(unwrap(measureVolume(compound.revolve([0, 0, 1])))).toBeGreaterThan(0);
  });

  it('delete() releases every sub-sketch without throwing', () => {
    const compound = new CompoundSketch([sketchRectangle(10, 10), sketchCircle(2)]);
    expect(() => {
      compound.delete();
    }).not.toThrow();
  });

  it('constructor rejects an empty sketch array', () => {
    expect(() => new CompoundSketch([])).toThrow();
  });
});
