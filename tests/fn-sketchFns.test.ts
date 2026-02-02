import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { sketchRectangle, sketchCircle, measureVolume, Sketcher } from '../src/index.js';
import {
  sketchExtrude,
  sketchRevolve,
  sketchLoft,
  sketchFace,
  sketchWires,
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
