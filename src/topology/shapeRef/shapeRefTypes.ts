/**
 * Type definitions for the ShapeRef system — stable, serializable face references
 * that survive parametric replay.
 */

import type { Vec3 } from '@/core/types.js';
import type { SurfaceType } from '@/topology/faceFns.js';
import type { Face } from '@/core/shapeTypes.js';

// ---------------------------------------------------------------------------
// Geometric hint — snapshot of a face's geometric properties
// ---------------------------------------------------------------------------

/** Geometric snapshot of a face, used for fallback matching when hashes change. */
export interface GeometricHint {
  readonly entityType: 'face';
  readonly surfaceType?: SurfaceType;
  readonly normal?: Vec3;
  readonly centroid?: Vec3;
  readonly area?: number | undefined;
}

// ---------------------------------------------------------------------------
// ShapeRef — stable, serializable face reference
// ---------------------------------------------------------------------------

/**
 * A stable reference to a face, combining a role-based name with a geometric hint.
 * Survives parametric replay even when face hashes change.
 */
export interface ShapeRef {
  /** Generic command/step identifier (e.g., 'step_0', 'box_1'). */
  readonly origin: string;
  /** Role name within the origin (e.g., 'box:top', 'fillet:round_0'). */
  readonly role: string;
  /** Geometric snapshot for fallback matching. */
  readonly hint: GeometricHint;
}

// ---------------------------------------------------------------------------
// Role table — maps origin -> role -> face hash
// ---------------------------------------------------------------------------

/**
 * Immutable table mapping `origin -> role -> faceHash`.
 * Updated through evolution records when the model is rebuilt.
 */
export type RoleTable = ReadonlyMap<string, ReadonlyMap<string, number>>;

// ---------------------------------------------------------------------------
// Resolution results
// ---------------------------------------------------------------------------

/** A successfully resolved face reference. */
export interface ResolvedRef {
  readonly face: Face;
  readonly confidence: 'exact' | 'geometric-fallback';
}

/** A face reference that could not be resolved. */
export interface BrokenRef {
  readonly ref: ShapeRef;
  readonly reason: 'deleted' | 'ambiguous' | 'not-found';
  readonly candidates?: readonly Face[];
}
