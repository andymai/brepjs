/**
 * API types for the v5 redesigned public API.
 *
 * Defines `Shapeable`, `Wrapped`, `FinderFn`, and modifier parameter types
 * that are shared across functional functions and the shape() wrapper.
 */

import type { Vec2, Vec3 } from '../core/types.js';
import type { AnyShape, Edge, Face, Wire, Shape3D } from '../core/shapeTypes.js';
import type { ShapeFinder } from '../query/finderFns.js';

/**
 * Structural type matching a Drawing's wire-producing interface.
 * Used in place of importing the actual Drawing class to avoid
 * Layer 2 → Layer 3 boundary violations.
 */
export interface DrawingLike {
  sketchOnPlane(plane: string): { wire: Wire };
}

// ---------------------------------------------------------------------------
// FinderFn — callback that configures a finder
// ---------------------------------------------------------------------------

/** Callback that configures a shape finder for inline use in modifiers. */
export type FinderFn<T extends AnyShape> = (finder: ShapeFinder<T>) => ShapeFinder<T>;

// ---------------------------------------------------------------------------
// FilletRadius — all radius modes for fillet()
// ---------------------------------------------------------------------------

/**
 * Fillet radius specification.
 *
 * - `number` — constant radius on all selected edges
 * - `[number, number]` — variable radius (start, end)
 * - callback — per-edge radius; return `null` to skip an edge
 */
export type FilletRadius =
  | number
  | [number, number]
  | ((edge: Edge) => number | [number, number] | null);

// ---------------------------------------------------------------------------
// ChamferDistance — all distance modes for chamfer()
// ---------------------------------------------------------------------------

/**
 * Chamfer distance specification.
 *
 * - `number` — equal distance
 * - `[number, number]` — asymmetric distances (dist1, dist2)
 * - `{ distance, angle }` — distance-angle mode (replaces chamferDistAngleShape)
 * - callback — per-edge distance; return `null` to skip an edge
 */
export type ChamferDistance =
  | number
  | [number, number]
  | { distance: number; angle: number }
  | ((edge: Edge) => number | [number, number] | { distance: number; angle: number } | null);

// ---------------------------------------------------------------------------
// Compound operation option types
// ---------------------------------------------------------------------------

/** Options for the drill() compound operation. */
export interface DrillOptions {
  /** Position of the hole (Vec2 projects along axis). */
  at: Vec2 | Vec3;
  /** Hole radius. */
  radius: number;
  /** Hole depth. Omit for through-all (computed from bounds). */
  depth?: number;
  /** Drill axis direction. Default: [0, 0, 1] (Z). */
  axis?: Vec3;
}

/** Options for the pocket() compound operation. */
export interface PocketOptions {
  /** 2D profile shape to cut into the face. */
  profile: DrawingLike | Wire;
  /** Which face to pocket. Default: top face. */
  face?: Face | FinderFn<Face>;
  /** Depth of the pocket cut. */
  depth: number;
}

/** Options for the boss() compound operation. */
export interface BossOptions {
  /** 2D profile shape to extrude onto the face. */
  profile: DrawingLike | Wire;
  /** Which face to add onto. Default: top face. */
  face?: Face | FinderFn<Face>;
  /** Height of the boss extrusion. */
  height: number;
}

/** Options for the mirrorJoin() compound operation. */
export interface MirrorJoinOptions {
  /** Mirror plane normal. Default: [1, 0, 0] (mirror across YZ plane). */
  normal?: Vec3;
  /** Mirror plane origin. Default: [0, 0, 0]. */
  origin?: Vec3;
}

/** Options for the rectangularPattern() compound operation. */
export interface RectangularPatternOptions {
  /** Direction for X repetition. */
  xDir: Vec3;
  /** Number of copies in X direction. */
  xCount: number;
  /** Spacing between copies in X direction. */
  xSpacing: number;
  /** Direction for Y repetition. */
  yDir: Vec3;
  /** Number of copies in Y direction. */
  yCount: number;
  /** Spacing between copies in Y direction. */
  ySpacing: number;
}

// ---------------------------------------------------------------------------
// Shapeable<T> — accept both raw branded types and shape() wrappers
// ---------------------------------------------------------------------------

/**
 * Marker interface for the shape() wrapper.
 *
 * Full definition lives in wrapperFns.ts — this minimal interface is enough
 * for the `resolve()` utility and `Shapeable<T>` type to work without
 * creating circular imports.
 */
export interface WrappedMarker<T extends AnyShape> {
  readonly val: T;
  /** Brand property to distinguish wrappers from branded shape handles. */
  readonly __wrapped: true;
}

/**
 * Accept either a raw branded shape or a shape() wrapper.
 *
 * All functional API functions use this as their shape parameter type,
 * enabling seamless interop between styles.
 */
export type Shapeable<T extends AnyShape> = T | WrappedMarker<T>;

// ---------------------------------------------------------------------------
// resolve() — extract raw shape from Shapeable
// ---------------------------------------------------------------------------

/** Extract the raw branded shape from a Shapeable value. */
export function resolve<T extends AnyShape>(s: Shapeable<T>): T {
  if ('__wrapped' in s) {
    return s.val;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Resolve for Shape3D (common case in booleans/modifiers)
// ---------------------------------------------------------------------------

/** Extract the raw branded 3D shape from a Shapeable<Shape3D>. */
export function resolve3D(s: Shapeable<Shape3D>): Shape3D {
  return resolve(s);
}
