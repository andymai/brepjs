/**
 * API types for the public API.
 *
 * Defines `Shapeable`, `Wrapped`, `FinderFn`, and modifier parameter types
 * that are shared across functional functions and the shape() wrapper.
 */

import type { Vec2, Vec3 } from '@/core/types.js';
import type { AnyShape, Dimension, Edge, Face, Wire, Shape3D } from '@/core/shapeTypes.js';
import type { EdgeFinderFn, FaceFinderFn, ShapeFinder } from '@/query/finderFns.js';

/**
 * Structural type matching a Drawing: it sketches onto a plane as something
 * that builds a face (holes included). Used in place of importing the actual
 * Drawing class to avoid Layer 2 → Layer 3 boundary violations.
 */
export interface DrawingLike {
  sketchOnPlane(plane: 'XY'): { face(): Face; delete?(): void };
}

// ---------------------------------------------------------------------------
// FinderFn — callback that configures a finder
// ---------------------------------------------------------------------------

// Edge callbacks are handed edgeFinder() and face callbacks faceFinder() at runtime, so the
// parameter carries their filters (inDirection, ofLength, parallelTo, ...), not just the base set.
type FinderFor<T extends AnyShape<Dimension>> = T extends Edge
  ? EdgeFinderFn
  : T extends Face
    ? FaceFinderFn
    : ShapeFinder<T>;

/** Callback that configures a shape finder for inline use in modifiers. */
export type FinderFn<T extends AnyShape<Dimension>> = (finder: FinderFor<T>) => ShapeFinder<T>;

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
  number | [number, number] | ((edge: Edge) => number | [number, number] | null);

// ---------------------------------------------------------------------------
// ChamferDistance — all distance modes for chamfer()
// ---------------------------------------------------------------------------

/**
 * Chamfer distance specification.
 *
 * - `number` — equal distance
 * - `[number, number]` — asymmetric distances (dist1, dist2). brepkit has no asymmetric
 *   chamfer and returns an `UNSUPPORTED_CAPABILITY` error for two different distances.
 * - `{ distance, angle }` — distance-angle mode (replaces chamferDistAngleShape); angle in degrees.
 *   brepkit has no distance-angle chamfer and returns an `UNSUPPORTED_CAPABILITY` error.
 * - callback — per-edge value of any of the above; return `null` (or a non-positive
 *   distance) to skip an edge. The edges it keeps must all get plain distances or all
 *   get `{ distance, angle }`: mixing the two is an `INVALID_CHAMFER_DISTANCE` error.
 *   Different `{ distance, angle }` values per edge need a kernel that chamfers each
 *   edge by its own (occt-wasm 5.9.0+); elsewhere they are an `UNSUPPORTED_CAPABILITY` error.
 *   A callback's `{ distance, angle, face }` measures that edge's chamfer from `face`,
 *   which must be one of the two faces the edge joins (else `CHAMFER_ANGLE_FACE_NOT_ADJACENT`):
 *   the distance is set back on it and the angle taken from it. Without `face` the
 *   kernel picks it (the edge's first adjacent face on occt-wasm). A `face` needs the
 *   same per-edge kernel support. Edges of one tangent-continuous chain are chamfered
 *   as one, so they must state the same chamfer; occt-wasm 5.11.0+ also matches one
 *   stated from the face on the other side (e.g. `{ distance: d, angle: 45 }` from
 *   either face of a square edge).
 */
export type ChamferDistance =
  | number
  | [number, number]
  | { distance: number; angle: number }
  | ((
      edge: Edge
    ) =>
      | number
      | [number, number]
      | { distance: number; angle: number; face?: Face | undefined }
      | null);

// ---------------------------------------------------------------------------
// DraftAngle — angle specification for draft()
// ---------------------------------------------------------------------------

/**
 * Draft angle specification.
 *
 * - `number` — constant angle in degrees for all selected faces
 * - callback — per-face angle; return `null` to skip a face
 */
export type DraftAngle = number | ((face: Face) => number | null);

/** Options for the draft() modifier. */
export interface DraftOptions {
  /** Pull direction (mold opening direction). */
  pullDirection: Vec3;
  /** A point on the neutral plane (where no material is added or removed). */
  neutralPlane: Vec3;
  /** Draft angle in degrees. Constant or per-face callback. */
  angle: DraftAngle;
}

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
  /**
   * 2D profile to cut into the face, drawn in XY with its origin at the face
   * centre. On faces parallel to XY it keeps the world X and Y axes; on any
   * other face its Y axis runs up the face and its X axis points right as seen
   * from outside.
   */
  profile: DrawingLike | Wire;
  /** Which face to pocket. Default: top face. */
  face?: Face | FinderFn<Face>;
  /** Depth of the pocket cut. */
  depth: number;
}

/** Options for the boss() compound operation. */
export interface BossOptions {
  /** 2D profile to extrude from the face, placed as for {@link PocketOptions.profile}. */
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
  at?: Vec3;
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
export interface WrappedMarker<T extends AnyShape<Dimension>> {
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
export type Shapeable<T extends AnyShape<Dimension>> = T | WrappedMarker<T>;

// ---------------------------------------------------------------------------
// resolve() — extract raw shape from Shapeable
// ---------------------------------------------------------------------------

/** Extract the raw branded shape from a Shapeable value. */
export function resolve<T extends AnyShape<Dimension>>(s: Shapeable<T>): T {
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
