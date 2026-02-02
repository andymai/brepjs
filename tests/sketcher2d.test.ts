import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  BlueprintSketcher,
  Drawing,
  draw,
  drawRoundedRectangle,
  drawRectangle,
  drawSingleCircle,
  drawSingleEllipse,
  drawCircle,
  drawEllipse,
  drawPolysides,
  drawPointsInterpolation,
  drawParametricFunction,
  drawProjection,
  drawFaceOutline,
  deserializeDrawing,
  sketchRectangle,
  makeBaseBox,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('BlueprintSketcher 2D', () => {
  it('lineTo and close', () => {
    expect(new BlueprintSketcher().lineTo([10, 0]).lineTo([10, 10]).lineTo([0, 10]).close()).toBeDefined();
  });

  it('line draws relative', () => {
    expect(new BlueprintSketcher().line(10, 0).line(0, 10).line(-10, 0).close()).toBeDefined();
  });

  it('vLine and hLine', () => {
    expect(new BlueprintSketcher().hLine(10).vLine(10).hLine(-10).close()).toBeDefined();
  });

  it('vLineTo and hLineTo', () => {
    expect(new BlueprintSketcher().hLineTo(10).vLineTo(10).hLineTo(0).close()).toBeDefined();
  });

  it('polarLine', () => {
    expect(new BlueprintSketcher().polarLine(10, 0).polarLine(10, 90).polarLine(10, 180).close()).toBeDefined();
  });

  it('tangentLine', () => {
    expect(new BlueprintSketcher().hLine(10).tangentLine(5).lineTo([0, 15]).close()).toBeDefined();
  });

  it('threePointsArcTo', () => {
    expect(new BlueprintSketcher().threePointsArcTo([10, 0], [5, 5]).lineTo([10, -5]).lineTo([0, -5]).close()).toBeDefined();
  });

  it('sagittaArcTo', () => {
    expect(new BlueprintSketcher().sagittaArcTo([10, 0], 3).lineTo([10, -5]).lineTo([0, -5]).close()).toBeDefined();
  });

  it('sagittaArc', () => {
    expect(new BlueprintSketcher().sagittaArc(10, 0, 3).line(0, -5).line(-10, 0).close()).toBeDefined();
  });

  it('vSagittaArc and hSagittaArc', () => {
    expect(new BlueprintSketcher().hLine(5).vSagittaArc(10, 2).hLine(-5).vLine(-5).hSagittaArc(-5, 1).close()).toBeDefined();
  });

  it('bulgeArcTo', () => {
    expect(new BlueprintSketcher().bulgeArcTo([10, 0], 0.5).lineTo([10, -5]).lineTo([0, -5]).close()).toBeDefined();
  });

  it('tangentArcTo', () => {
    expect(new BlueprintSketcher().hLine(5).tangentArcTo([10, 5]).lineTo([0, 10]).close()).toBeDefined();
  });

  it('tangentArc', () => {
    expect(new BlueprintSketcher().hLine(5).tangentArc(5, 5).lineTo([0, 10]).close()).toBeDefined();
  });

  it('ellipseTo', () => {
    expect(new BlueprintSketcher().ellipseTo([10, 0], 3, 5).lineTo([10, -5]).lineTo([0, -5]).close()).toBeDefined();
  });

  it('halfEllipseTo', () => {
    expect(new BlueprintSketcher().halfEllipseTo([10, 0], 5).lineTo([10, -5]).lineTo([0, -5]).close()).toBeDefined();
  });

  it('bezierCurveTo', () => {
    expect(new BlueprintSketcher().bezierCurveTo([10, 0], [[3, 5], [7, 5]]).lineTo([10, -5]).lineTo([0, -5]).close()).toBeDefined();
  });

  it('quadraticBezierCurveTo', () => {
    expect(new BlueprintSketcher().quadraticBezierCurveTo([10, 0], [5, 5]).lineTo([10, -5]).lineTo([0, -5]).close()).toBeDefined();
  });

  it('cubicBezierCurveTo', () => {
    expect(new BlueprintSketcher().cubicBezierCurveTo([10, 0], [3, 5], [7, 5]).lineTo([10, -5]).lineTo([0, -5]).close()).toBeDefined();
  });

  it('smoothSplineTo', () => {
    expect(new BlueprintSketcher().smoothSplineTo([10, 0], {}).lineTo([10, -5]).lineTo([0, -5]).close()).toBeDefined();
  });

  it('closeWithMirror', () => {
    expect(new BlueprintSketcher().hLine(5).vLine(5).hLine(5).closeWithMirror()).toBeDefined();
  });

  it('customCorner applies fillet', () => {
    expect(new BlueprintSketcher().hLine(10).customCorner(1).vLine(10).hLine(-10).close()).toBeDefined();
  });

  it('customCorner applies chamfer', () => {
    expect(new BlueprintSketcher().hLine(10).customCorner(1, 'chamfer').vLine(10).hLine(-10).close()).toBeDefined();
  });

  it('closeWithCustomCorner fillet', () => {
    expect(new BlueprintSketcher().hLine(10).vLine(10).hLine(-10).closeWithCustomCorner(1, 'fillet')).toBeDefined();
  });

  it('closeWithCustomCorner chamfer', () => {
    expect(new BlueprintSketcher().hLine(10).vLine(10).hLine(-10).closeWithCustomCorner(1, 'chamfer')).toBeDefined();
  });

  it('penPosition returns current pointer', () => {
    const sketcher = new BlueprintSketcher();
    sketcher.movePointerTo([5, 3]);
    const pos = sketcher.penPosition;
    expect(pos[0]).toBeCloseTo(5);
    expect(pos[1]).toBeCloseTo(3);
    sketcher.hLine(10).vLine(10).hLine(-10).close();
  });
});

describe('Drawing factory functions', () => {
  it('drawSingleCircle', () => {
    expect(drawSingleCircle(5)).toBeInstanceOf(Drawing);
  });

  it('drawSingleEllipse', () => {
    expect(drawSingleEllipse(10, 5)).toBeDefined();
  });

  it('drawSingleEllipse with swapped radii', () => {
    expect(drawSingleEllipse(5, 10)).toBeDefined();
  });

  it('drawEllipse', () => {
    expect(drawEllipse(10, 5)).toBeDefined();
  });

  it('drawPolysides hexagon', () => {
    expect(drawPolysides(10, 6)).toBeDefined();
  });

  it('drawPolysides with sagitta', () => {
    expect(drawPolysides(10, 6, 1)).toBeDefined();
  });

  it('drawPointsInterpolation', () => {
    const points: [number, number][] = [[0, 0], [5, 3], [10, 0], [15, -3], [20, 0]];
    expect(drawPointsInterpolation(points)).toBeDefined();
  });

  it('drawPointsInterpolation closed', () => {
    const points: [number, number][] = [[0, 0], [5, 5], [10, 0]];
    expect(drawPointsInterpolation(points, {}, { closeShape: true })).toBeDefined();
  });

  it('drawParametricFunction', () => {
    expect(
      drawParametricFunction(
        (t) => [Math.cos(t * 2 * Math.PI) * 10, Math.sin(t * 2 * Math.PI) * 10],
        { pointsCount: 50, closeShape: true },
      ),
    ).toBeDefined();
  });

  it('draw with initial point', () => {
    expect(draw([5, 5]).lineTo([15, 5]).lineTo([15, 15]).lineTo([5, 15]).close()).toBeDefined();
  });
});

describe('Drawing class', () => {
  const makeRect = () => drawRectangle(10, 20);

  it('clone returns an independent copy', () => {
    expect(makeRect().clone()).toBeInstanceOf(Drawing);
  });

  it('boundingBox', () => {
    const bb = makeRect().boundingBox;
    expect(bb.width).toBeCloseTo(10, 0);
    expect(bb.height).toBeCloseTo(20, 0);
  });

  it('repr returns a string', () => {
    expect(makeRect().repr.length).toBeGreaterThan(0);
  });

  it('rotate', () => {
    expect(makeRect().rotate(45)).toBeDefined();
  });

  it('translate with two numbers', () => {
    expect(makeRect().translate(5, 10)).toBeDefined();
  });

  it('translate with point', () => {
    expect(makeRect().translate([5, 10])).toBeDefined();
  });

  it('scale', () => {
    const bb = makeRect().scale(2).boundingBox;
    expect(bb.width).toBeCloseTo(20, 0);
    expect(bb.height).toBeCloseTo(40, 0);
  });

  it('mirror', () => {
    expect(makeRect().mirror([1, 0])).toBeDefined();
  });

  it('stretch', () => {
    expect(makeRect().stretch(2, [1, 0], [0, 0])).toBeDefined();
  });

  it('cut', () => {
    expect(drawRectangle(20, 20).cut(drawRectangle(5, 5))).toBeDefined();
  });

  it('fuse', () => {
    expect(drawRectangle(10, 10).fuse(drawRectangle(10, 10).translate(5, 0))).toBeDefined();
  });

  it('intersect', () => {
    expect(drawRectangle(10, 10).intersect(drawRectangle(10, 10).translate(3, 0))).toBeDefined();
  });

  it('fillet', () => {
    expect(makeRect().fillet(1)).toBeDefined();
  });

  it('chamfer', () => {
    expect(makeRect().chamfer(1)).toBeDefined();
  });

  it('toSVG returns valid SVG string', () => {
    expect(makeRect().toSVG().length).toBeGreaterThan(0);
  });

  it('toSVGViewBox', () => {
    expect(makeRect().toSVGViewBox().length).toBeGreaterThan(0);
  });

  it('toSVGPaths', () => {
    expect(makeRect().toSVGPaths().length).toBeGreaterThan(0);
  });

  it('offset', () => {
    expect(makeRect().offset(1)).toBeDefined();
  });

  it('serialize and deserialize round-trip', () => {
    const restored = deserializeDrawing(makeRect().serialize());
    expect(restored).toBeInstanceOf(Drawing);
    expect(restored.boundingBox.width).toBeCloseTo(10, 0);
  });

  it('blueprint getter', () => {
    expect(makeRect().blueprint).toBeDefined();
  });

  it('sketchOnPlane', () => {
    expect(makeRect().sketchOnPlane()).toBeDefined();
  });

  it('sketchOnPlane with plane name', () => {
    expect(makeRect().sketchOnPlane('XZ')).toBeDefined();
  });
});

describe('Drawing empty edge cases', () => {
  const empty = () => new Drawing();

  it('boundingBox of empty is valid', () => {
    expect(empty().boundingBox).toBeDefined();
  });

  it('repr of empty', () => {
    expect(empty().repr).toBe('=== empty shape');
  });

  it('rotate empty returns drawing', () => {
    expect(empty().rotate(45)).toBeInstanceOf(Drawing);
  });

  it('translate empty returns drawing', () => {
    expect(empty().translate(5, 10)).toBeInstanceOf(Drawing);
  });

  it('scale empty returns drawing', () => {
    expect(empty().scale(2)).toBeInstanceOf(Drawing);
  });

  it('mirror empty returns drawing', () => {
    expect(empty().mirror([1, 0])).toBeInstanceOf(Drawing);
  });

  it('stretch empty returns drawing', () => {
    expect(empty().stretch(2, [1, 0], [0, 0])).toBeInstanceOf(Drawing);
  });

  it('toSVG of empty returns empty string', () => {
    expect(empty().toSVG()).toBe('');
  });

  it('toSVGViewBox of empty returns empty string', () => {
    expect(empty().toSVGViewBox()).toBe('');
  });

  it('toSVGPaths of empty returns empty array', () => {
    expect(empty().toSVGPaths()).toEqual([]);
  });

  it('clone of empty', () => {
    expect(empty().clone()).toBeInstanceOf(Drawing);
  });
});

describe('DrawingPen', () => {
  it('done returns open drawing', () => {
    expect(draw().hLine(10).vLine(10).done()).toBeInstanceOf(Drawing);
  });

  it('closeWithMirror', () => {
    expect(draw().hLine(5).vLine(5).hLine(5).closeWithMirror()).toBeInstanceOf(Drawing);
  });

  it('closeWithCustomCorner fillet', () => {
    expect(draw().hLine(10).vLine(10).hLine(-10).closeWithCustomCorner(1, 'fillet')).toBeInstanceOf(Drawing);
  });

  it('closeWithCustomCorner chamfer', () => {
    expect(draw().hLine(10).vLine(10).hLine(-10).closeWithCustomCorner(1, 'chamfer')).toBeInstanceOf(Drawing);
  });
});

describe('Projection and face outline', () => {
  it('drawProjection returns visible and hidden drawings', () => {
    const result = drawProjection(makeBaseBox(10, 10, 10), 'front');
    expect(result.visible).toBeInstanceOf(Drawing);
    expect(result.hidden).toBeInstanceOf(Drawing);
  });

  it('drawFaceOutline returns a drawing from a face', () => {
    expect(drawFaceOutline(sketchRectangle(10, 10).face())).toBeInstanceOf(Drawing);
  });
});
