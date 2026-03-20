/**
 * Compile-time type tests for the phantom dimension type system.
 *
 * These tests verify that the branded shape types correctly prevent
 * dimension mismatches at compile time, that type guards narrow properly,
 * and that the template literal error types produce the expected messages.
 *
 * Uses vitest's `expectTypeOf` for compile-time assertions.
 */
/* eslint-disable @typescript-eslint/no-unnecessary-type-arguments -- explicit type args are the point of these tests */
import { describe, it, expectTypeOf } from 'vitest';
import type {
  Vertex,
  Edge,
  Wire,
  Face,
  Shell,
  Solid,
  CompSolid,
  Compound,
  AnyShape,
  Shape1D,
  Shape3D,
  UnknownDimShape,
} from '@/index.js';
import type { DimensionError, RequireDimension, SameDimension } from '@/core/dimensionTypes.js';

// ---------------------------------------------------------------------------
// Default type parameters — 3D by default, zero noise for existing code
// ---------------------------------------------------------------------------

describe('phantom dimension types', () => {
  describe('default type parameters', () => {
    it('Vertex defaults to 3D', () => {
      expectTypeOf<Vertex>().toEqualTypeOf<Vertex<'3D'>>();
    });

    it('Edge defaults to 3D', () => {
      expectTypeOf<Edge>().toEqualTypeOf<Edge<'3D'>>();
    });

    it('Wire defaults to 3D', () => {
      expectTypeOf<Wire>().toEqualTypeOf<Wire<'3D'>>();
    });

    it('Face defaults to 3D', () => {
      expectTypeOf<Face>().toEqualTypeOf<Face<'3D'>>();
    });

    it('Compound defaults to 3D', () => {
      expectTypeOf<Compound>().toEqualTypeOf<Compound<'3D'>>();
    });

    it('AnyShape defaults to 3D', () => {
      expectTypeOf<AnyShape>().toEqualTypeOf<AnyShape<'3D'>>();
    });
  });

  // ---------------------------------------------------------------------------
  // Dimension discrimination — 2D and 3D are distinct
  // ---------------------------------------------------------------------------

  describe('dimension discrimination', () => {
    it('Edge<2D> is not assignable to Edge<3D>', () => {
      expectTypeOf<Edge<'2D'>>().not.toEqualTypeOf<Edge<'3D'>>();
    });

    it('Face<2D> is not assignable to Face<3D>', () => {
      expectTypeOf<Face<'2D'>>().not.toEqualTypeOf<Face<'3D'>>();
    });

    it('Wire<2D> is not assignable to Wire<3D>', () => {
      expectTypeOf<Wire<'2D'>>().not.toEqualTypeOf<Wire<'3D'>>();
    });

    it('Vertex<2D> is not assignable to Vertex<3D>', () => {
      expectTypeOf<Vertex<'2D'>>().not.toEqualTypeOf<Vertex<'3D'>>();
    });

    it('Compound<2D> is not assignable to Compound<3D>', () => {
      expectTypeOf<Compound<'2D'>>().not.toEqualTypeOf<Compound<'3D'>>();
    });

    it('AnyShape<2D> is not assignable to AnyShape<3D>', () => {
      expectTypeOf<AnyShape<'2D'>>().not.toEqualTypeOf<AnyShape<'3D'>>();
    });
  });

  // ---------------------------------------------------------------------------
  // Fixed-dimension types — Shell, Solid, CompSolid are always 3D
  // ---------------------------------------------------------------------------

  describe('fixed 3D types', () => {
    it('Shell is part of AnyShape<3D>', () => {
      expectTypeOf<Shell>().toExtend<AnyShape<'3D'>>();
    });

    it('Solid is part of AnyShape<3D>', () => {
      expectTypeOf<Solid>().toExtend<AnyShape<'3D'>>();
    });

    it('CompSolid is part of AnyShape<3D>', () => {
      expectTypeOf<CompSolid>().toExtend<AnyShape<'3D'>>();
    });

    it('Shell is not part of AnyShape<2D>', () => {
      expectTypeOf<Shell>().not.toExtend<AnyShape<'2D'>>();
    });

    it('Solid is not part of AnyShape<2D>', () => {
      expectTypeOf<Solid>().not.toExtend<AnyShape<'2D'>>();
    });
  });

  // ---------------------------------------------------------------------------
  // Union types
  // ---------------------------------------------------------------------------

  describe('union types', () => {
    it('Shape1D includes Edge and Wire', () => {
      expectTypeOf<Edge>().toExtend<Shape1D>();
      expectTypeOf<Wire>().toExtend<Shape1D>();
    });

    it('Shape3D includes Shell, Solid, CompSolid', () => {
      expectTypeOf<Shell>().toExtend<Shape3D>();
      expectTypeOf<Solid>().toExtend<Shape3D>();
      expectTypeOf<CompSolid>().toExtend<Shape3D>();
    });

    it('UnknownDimShape includes both 2D and 3D shapes', () => {
      expectTypeOf<Edge<'2D'>>().toExtend<UnknownDimShape>();
      expectTypeOf<Edge<'3D'>>().toExtend<UnknownDimShape>();
      expectTypeOf<Solid>().toExtend<UnknownDimShape>();
    });
  });

  // ---------------------------------------------------------------------------
  // Template literal error types
  // ---------------------------------------------------------------------------

  describe('DimensionError', () => {
    it('produces a readable error string', () => {
      type Err = DimensionError<'fuse', '3D', '2D'>;
      expectTypeOf<Err>().toEqualTypeOf<'❌ fuse: expected 3D, got 2D'>();
    });
  });

  describe('RequireDimension', () => {
    it('resolves to T when dimension matches', () => {
      type Good = RequireDimension<'3D', '3D', Solid, 'extrude'>;
      expectTypeOf<Good>().toEqualTypeOf<Solid>();
    });

    it('resolves to error string when dimension mismatches', () => {
      type Bad = RequireDimension<'2D', '3D', Solid, 'extrude'>;
      expectTypeOf<Bad>().toEqualTypeOf<'❌ extrude: expected 3D, got 2D'>();
    });
  });

  describe('SameDimension', () => {
    it('resolves to the shared dimension when equal', () => {
      type Same = SameDimension<'3D', '3D', 'fuse'>;
      expectTypeOf<Same>().toEqualTypeOf<'3D'>();
    });

    it('resolves to error string when dimensions differ', () => {
      type Diff = SameDimension<'3D', '2D', 'fuse'>;
      expectTypeOf<Diff>().toEqualTypeOf<'❌ fuse: expected 3D, got 2D'>();
    });
  });

  // ---------------------------------------------------------------------------
  // Kind discrimination preserved — shapes of same dimension but different kind
  // ---------------------------------------------------------------------------

  describe('kind discrimination', () => {
    it('Edge<3D> is not assignable to Face<3D>', () => {
      expectTypeOf<Edge<'3D'>>().not.toEqualTypeOf<Face<'3D'>>();
    });

    it('Wire<2D> is not assignable to Face<2D>', () => {
      expectTypeOf<Wire<'2D'>>().not.toEqualTypeOf<Face<'2D'>>();
    });

    it('Solid is not assignable to Shell', () => {
      expectTypeOf<Solid>().not.toEqualTypeOf<Shell>();
    });
  });
});
