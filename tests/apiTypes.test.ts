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
  box,
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
