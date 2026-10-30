/**
 * Compile-time checks for public API types, run by `npm run typecheck:tests`.
 *
 * The closures are never called: expectTypeOf only reads their types.
 */
import { describe, it, expectTypeOf } from 'vitest';
import {
  edgeFinder,
  faceFinder,
  wireFinder,
  vertexFinder,
  getSurfaceType,
  faceGeomType,
  pocket,
  boss,
  drawRectangle,
  drawCircle,
  drawingToSketchOnPlane,
  box,
  extrude,
  revolve,
  sketchRectangle,
  shape,
  ok,
} from '@/index.js';
import type {
  Drawing,
  DrawingLike,
  EdgeFinderFn,
  FaceFinderFn,
  WireFinderFn,
  VertexFinderFn,
  PocketOptions,
  BossOptions,
  SurfaceType,
  Result,
  Shape3D,
  Solid,
  OrientedFace,
  PlanarFace,
  Sketch,
  CompoundSketch,
  Sketches,
  SketchInterface,
  Face,
  WrappedFace,
} from '@/index.js';

describe('finder callbacks get the concrete finder', () => {
  it('not and either hand edge callbacks an EdgeFinderFn', () => {
    const notLine = () => edgeFinder().not((f) => f.ofCurveType('LINE'));
    const tenOrVertical = () =>
      edgeFinder().either([(f) => f.ofLength(10), (f) => f.inDirection('Z')]);
    expectTypeOf(notLine).returns.toEqualTypeOf<EdgeFinderFn>();
    expectTypeOf(tenOrVertical).returns.toEqualTypeOf<EdgeFinderFn>();
  });

  it('not and either hand face callbacks a FaceFinderFn', () => {
    const notPlane = () => faceFinder().not((f) => f.ofSurfaceType('PLANE'));
    const upOrDown = () =>
      faceFinder().either([(f) => f.inDirection('Z'), (f) => f.inDirection([0, 0, -1])]);
    expectTypeOf(notPlane).returns.toEqualTypeOf<FaceFinderFn>();
    expectTypeOf(upOrDown).returns.toEqualTypeOf<FaceFinderFn>();
  });

  it('keeps the concrete finder through the shared builders', () => {
    const chained = () =>
      edgeFinder()
        .when(() => true)
        .not((f) => f.ofLength(1))
        .inDirection('X');
    expectTypeOf(chained).returns.toEqualTypeOf<EdgeFinderFn>();
    expectTypeOf(() => wireFinder().negate()).returns.toEqualTypeOf<WireFinderFn>();
    expectTypeOf(() =>
      vertexFinder().not((f) => f.atPosition([0, 0, 0]))
    ).returns.toEqualTypeOf<VertexFinderFn>();
  });
});

describe('pocket and boss take a Drawing profile', () => {
  it('a Drawing is a DrawingLike', () => {
    expectTypeOf<Drawing>().toExtend<DrawingLike>();
    expectTypeOf<Drawing>().toExtend<PocketOptions['profile']>();
    expectTypeOf<Drawing>().toExtend<BossOptions['profile']>();
  });

  it('accepts the documented call forms', () => {
    const pocketed = () => pocket(box(50, 50, 20), { profile: drawRectangle(20, 10), depth: 5 });
    const bossed = () => boss(box(50, 50, 20), { profile: drawCircle(8), height: 10 });
    expectTypeOf(pocketed).returns.toExtend<Result<Shape3D>>();
    expectTypeOf(bossed).returns.toExtend<Result<Shape3D>>();
  });
});

describe('SurfaceType matches getSurfaceType', () => {
  it('is the uppercase union faces report', () => {
    expectTypeOf(faceGeomType).returns.toEqualTypeOf<SurfaceType>();
    expectTypeOf(getSurfaceType).returns.toEqualTypeOf<Result<SurfaceType>>();
    expectTypeOf<'CYLINDRE'>().toExtend<SurfaceType>();
    expectTypeOf<'cylinder'>().not.toExtend<SurfaceType>();
  });
});

describe('sketch faces feed extrude and revolve', () => {
  it('types every sketch face accessor as an oriented planar face', () => {
    expectTypeOf<ReturnType<SketchInterface['face']>>().toEqualTypeOf<OrientedFace & PlanarFace>();
    expectTypeOf<ReturnType<Sketch['face']>>().toEqualTypeOf<OrientedFace & PlanarFace>();
    expectTypeOf<ReturnType<Sketch['faces']>>().toEqualTypeOf<OrientedFace & PlanarFace>();
    expectTypeOf<ReturnType<CompoundSketch['face']>>().toEqualTypeOf<OrientedFace & PlanarFace>();
    expectTypeOf<ReturnType<Sketches['face']>>().toEqualTypeOf<OrientedFace & PlanarFace>();
  });

  it('extrudes and revolves a sketch face without a cast', () => {
    const fromDrawing = () =>
      extrude(drawingToSketchOnPlane(drawRectangle(10, 10), 'XY').face(), 5);
    const fromCanned = () => revolve(sketchRectangle(2, 5, { origin: [6, 0] }).face());
    expectTypeOf(fromDrawing).returns.toEqualTypeOf<Result<Solid>>();
    expectTypeOf(fromCanned).returns.toEqualTypeOf<Result<Shape3D>>();
  });
});

describe('apply() keeps the face type its callback returns', () => {
  it('passes an oriented planar face from apply() and applyResult() to extrude', () => {
    const viaApply = () =>
      extrude(
        shape(box(10, 10, 10))
          .apply(() => sketchRectangle(2, 2).face())
          .done(),
        5
      );
    const viaApplyResult = () =>
      extrude(
        shape(box(10, 10, 10))
          .applyResult(() => ok(sketchRectangle(2, 2).face()))
          .done(),
        5
      );
    expectTypeOf(viaApply).returns.toEqualTypeOf<Result<Solid>>();
    expectTypeOf(viaApplyResult).returns.toEqualTypeOf<Result<Solid>>();
  });

  it('defaults the wrapped face to Face', () => {
    expectTypeOf<ReturnType<WrappedFace['done']>>().toEqualTypeOf<Face>();
    expectTypeOf<WrappedFace<OrientedFace & PlanarFace>>().toExtend<WrappedFace>();
  });
});
