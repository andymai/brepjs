import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  Sketcher,
  Sketch,
  Sketches,
  sketchCircle,
  sketchRectangle,
  makeBaseBox,
  measureVolume,
  measureArea,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('Sketcher 3D', () => {
  it('lineTo draws to an absolute point', () => {
    const sketch = new Sketcher().lineTo([10, 0]).lineTo([10, 10]).lineTo([0, 10]).close();
    expect(sketch).toBeDefined();
    const vol = measureVolume(sketch.extrude(1));
    expect(vol).toBeCloseTo(100, 0);
  });

  it('line draws a relative segment', () => {
    const sketch = new Sketcher().line(10, 0).line(0, 10).line(-10, 0).close();
    expect(sketch).toBeDefined();
  });

  it('vLine and hLine', () => {
    const sketch = new Sketcher().hLine(10).vLine(10).hLine(-10).close();
    const vol = measureVolume(sketch.extrude(5));
    expect(vol).toBeCloseTo(500, 0);
  });

  it('vLineTo and hLineTo', () => {
    const sketch = new Sketcher().movePointerTo([0, 0]).hLineTo(10).vLineTo(10).hLineTo(0).close();
    expect(sketch).toBeDefined();
  });

  it('polarLine', () => {
    const sketch = new Sketcher().polarLine(10, 0).polarLine(10, 90).polarLine(10, 180).close();
    expect(sketch).toBeDefined();
  });

  it('polarLineTo', () => {
    const sketch = new Sketcher()
      .polarLineTo([10, 0])
      .polarLineTo([10, 10])
      .polarLineTo([0, 0])
      .done();
    expect(sketch).toBeDefined();
  });

  it('tangentLine', () => {
    const sketch = new Sketcher().hLine(10).tangentLine(5).lineTo([0, 15]).close();
    expect(sketch).toBeDefined();
  });

  it('threePointsArcTo', () => {
    const sketch = new Sketcher()
      .threePointsArcTo([10, 0], [5, 5])
      .lineTo([10, -5])
      .lineTo([0, -5])
      .close();
    expect(sketch).toBeDefined();
  });

  it('threePointsArc', () => {
    const sketch = new Sketcher().threePointsArc(10, 0, 5, 5).line(0, -5).line(-10, 0).close();
    expect(sketch).toBeDefined();
  });

  it('sagittaArcTo', () => {
    const sketch = new Sketcher().sagittaArcTo([10, 0], 3).lineTo([10, -5]).lineTo([0, -5]).close();
    expect(sketch).toBeDefined();
  });

  it('sagittaArc', () => {
    const sketch = new Sketcher().sagittaArc(10, 0, 3).line(0, -5).line(-10, 0).close();
    expect(sketch).toBeDefined();
  });

  it('vSagittaArc', () => {
    const sketch = new Sketcher().hLine(5).vSagittaArc(10, 2).hLine(-5).close();
    expect(sketch).toBeDefined();
  });

  it('hSagittaArc', () => {
    const sketch = new Sketcher().vLine(5).hSagittaArc(10, 2).vLine(-5).close();
    expect(sketch).toBeDefined();
  });

  it('bulgeArcTo', () => {
    const sketch = new Sketcher().bulgeArcTo([10, 0], 0.5).lineTo([10, -5]).lineTo([0, -5]).close();
    expect(sketch).toBeDefined();
  });

  it('tangentArcTo', () => {
    const sketch = new Sketcher().hLine(5).tangentArcTo([10, 5]).lineTo([0, 10]).close();
    expect(sketch).toBeDefined();
  });

  it('tangentArc', () => {
    const sketch = new Sketcher().hLine(5).tangentArc(5, 5).lineTo([0, 10]).close();
    expect(sketch).toBeDefined();
  });

  it('ellipseTo', () => {
    const sketch = new Sketcher().ellipseTo([10, 0], 3, 5).lineTo([10, -5]).lineTo([0, -5]).close();
    expect(sketch).toBeDefined();
  });

  it('ellipse', () => {
    const sketch = new Sketcher().ellipse(10, 0, 3, 5).line(0, -5).line(-10, 0).close();
    expect(sketch).toBeDefined();
  });

  it('halfEllipseTo', () => {
    const sketch = new Sketcher()
      .halfEllipseTo([10, 0], 5)
      .lineTo([10, -5])
      .lineTo([0, -5])
      .close();
    expect(sketch).toBeDefined();
  });

  it('halfEllipse', () => {
    const sketch = new Sketcher().halfEllipse(10, 0, 5).line(0, -5).line(-10, 0).close();
    expect(sketch).toBeDefined();
  });

  it('bezierCurveTo', () => {
    const sketch = new Sketcher()
      .bezierCurveTo(
        [10, 0],
        [
          [3, 5],
          [7, 5],
        ]
      )
      .lineTo([10, -5])
      .lineTo([0, -5])
      .close();
    expect(sketch).toBeDefined();
  });

  it('quadraticBezierCurveTo', () => {
    const sketch = new Sketcher()
      .quadraticBezierCurveTo([10, 0], [5, 5])
      .lineTo([10, -5])
      .lineTo([0, -5])
      .close();
    expect(sketch).toBeDefined();
  });

  it('cubicBezierCurveTo', () => {
    const sketch = new Sketcher()
      .cubicBezierCurveTo([10, 0], [3, 5], [7, 5])
      .lineTo([10, -5])
      .lineTo([0, -5])
      .close();
    expect(sketch).toBeDefined();
  });

  it('smoothSplineTo', () => {
    const sketch = new Sketcher()
      .smoothSplineTo([10, 0], {})
      .lineTo([10, -5])
      .lineTo([0, -5])
      .close();
    expect(sketch).toBeDefined();
  });

  it('smoothSpline', () => {
    const sketch = new Sketcher().smoothSpline(10, 0).line(0, -5).line(-10, 0).close();
    expect(sketch).toBeDefined();
  });

  it('closeWithMirror', () => {
    const sketch = new Sketcher().hLine(5).vLine(5).hLine(5).closeWithMirror();
    expect(sketch).toBeDefined();
  });

  it('works on XZ plane', () => {
    const sketch = new Sketcher('XZ').hLine(10).vLine(10).hLine(-10).close();
    expect(sketch).toBeDefined();
  });

  it('works on YZ plane', () => {
    const sketch = new Sketcher('YZ').hLine(10).vLine(10).hLine(-10).close();
    expect(sketch).toBeDefined();
  });

  it('works with origin offset', () => {
    const sketch = new Sketcher('XY', 5).hLine(10).vLine(10).hLine(-10).close();
    expect(sketch).toBeDefined();
  });

  it('done returns an open sketch', () => {
    const sketch = new Sketcher().hLine(10).vLine(10).done();
    expect(sketch).toBeDefined();
  });
});

describe('Sketch class', () => {
  it('clone creates an independent copy', () => {
    const sketch = sketchRectangle(10, 20);
    const cloned = sketch.clone();
    expect(cloned).toBeDefined();
  });

  it('wires returns a wire clone', () => {
    const sketch = sketchRectangle(10, 20);
    expect(sketch.wires()).toBeDefined();
  });

  it('faces returns a face', () => {
    const sketch = sketchRectangle(10, 20);
    expect(sketch.faces()).toBeDefined();
  });

  it('face returns a measurable face', () => {
    const sketch = sketchRectangle(10, 20);
    const f = sketch.face();
    expect(measureArea(f)).toBeCloseTo(200, 0);
  });

  it('extrude with custom direction', () => {
    const solid = sketchRectangle(10, 10).extrude(5, { extrusionDirection: [1, 0, 1] });
    expect(solid).toBeDefined();
  });

  it('extrude with twist', () => {
    const solid = sketchRectangle(10, 10).extrude(10, { twistAngle: 45 });
    expect(solid).toBeDefined();
  });

  it('extrude with profile', () => {
    const solid = sketchRectangle(10, 10).extrude(10, {
      extrusionProfile: { profile: 'linear', endFactor: 0.5 },
    });
    expect(solid).toBeDefined();
  });

  it('revolve creates a solid of revolution', () => {
    const sketch = new Sketcher('XZ').movePointerTo([5, 0]).hLine(5).vLine(5).hLine(-5).close();
    const solid = sketch.revolve([0, 0, 1]);
    expect(solid).toBeDefined();
  });

  it('loftWith creates a lofted solid', () => {
    const s1 = sketchRectangle(10, 10);
    const s2 = sketchCircle(5, { plane: 'XY', origin: 10 });
    const solid = s1.loftWith(s2);
    expect(measureVolume(solid)).toBeGreaterThan(0);
  });
});

describe('Sketches collection', () => {
  it('wires returns compound wires', () => {
    const collection = new Sketches([sketchRectangle(10, 10), sketchCircle(5, { origin: 20 })]);
    expect(collection.wires()).toBeDefined();
  });

  it('faces returns compound faces', () => {
    const collection = new Sketches([sketchRectangle(10, 10), sketchCircle(5, { origin: 20 })]);
    expect(collection.faces()).toBeDefined();
  });

  it('extrude extrudes all sketches', () => {
    const collection = new Sketches([sketchRectangle(10, 10), sketchCircle(5, { origin: 20 })]);
    expect(collection.extrude(5)).toBeDefined();
  });

  it('revolve revolves all sketches', () => {
    const s1 = new Sketcher().movePointerTo([5, 0]).hLine(5).vLine(5).hLine(-5).close();
    const s2 = new Sketcher().movePointerTo([15, 0]).hLine(3).vLine(3).hLine(-3).close();
    expect(new Sketches([s1, s2]).revolve()).toBeDefined();
  });
});

describe('makeBaseBox', () => {
  it('creates a box with correct volume', () => {
    expect(measureVolume(makeBaseBox(10, 20, 30))).toBeCloseTo(6000, 0);
  });
});
