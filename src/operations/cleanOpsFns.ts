/**
 * Clean 3D operation names — v5 API.
 *
 * extrude(), revolve(), loft() — drop type suffix, accept Shapeable, use options.
 */

import type { Vec3 } from '../core/types.js';
import { vecLength } from '../core/vecOps.js';
import type { Face, Wire, Shape3D, Solid } from '../core/shapeTypes.js';
import type { Result } from '../core/result.js';
import type { Shapeable } from '../topology/apiTypes.js';
import { resolve } from '../topology/apiTypes.js';
import { extrudeFace, revolveFace } from './extrudeFns.js';
import { loftWires, type LoftConfig } from './loftFns.js';

export type { LoftConfig } from './loftFns.js';
export type { SweepConfig } from './extrudeFns.js';

// ---------------------------------------------------------------------------
// extrude — accepts number shorthand for Z-direction
// ---------------------------------------------------------------------------

/**
 * Extrude a face to produce a solid.
 *
 * @param face   - The face to extrude.
 * @param height - A number for Z-direction extrusion, or a Vec3 direction vector.
 */
export function extrude(face: Shapeable<Face>, height: number | Vec3): Solid {
  const f = resolve(face);
  const vec: Vec3 = typeof height === 'number' ? [0, 0, height] : height;
  if (vecLength(vec) === 0) {
    throw new Error('extrude: extrusion height/vector has zero length');
  }
  return extrudeFace(f, vec);
}

// ---------------------------------------------------------------------------
// revolve — options object
// ---------------------------------------------------------------------------

/** Options for {@link revolve}. */
export interface RevolveOptions {
  /** Rotation axis. Default: [0, 0, 1] (Z). */
  axis?: Vec3;
  /** Pivot point. Default: [0, 0, 0]. */
  around?: Vec3;
  /** Rotation angle in degrees. Default: 360 (full revolution). */
  angle?: number;
}

/**
 * Revolve a face around an axis to create a solid of revolution.
 */
export function revolve(face: Shapeable<Face>, options?: RevolveOptions): Result<Shape3D> {
  return revolveFace(
    resolve(face),
    options?.around ?? [0, 0, 0],
    options?.axis ?? [0, 0, 1],
    options?.angle ?? 360
  );
}

// ---------------------------------------------------------------------------
// loft — accept Shapeable<Wire>[]
// ---------------------------------------------------------------------------

/**
 * Loft through a set of wire profiles to create a 3D shape.
 */
export function loft(wires: Shapeable<Wire>[], options?: LoftConfig): Result<Shape3D> {
  const resolvedWires = wires.map((w) => resolve(w));
  return loftWires(resolvedWires, options);
}
