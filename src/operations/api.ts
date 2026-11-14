/**
 * Public 3D operation API.
 *
 * Provides extrude(), revolve(), loft() with short names, Shapeable support, and options objects.
 */

import type { Vec3 } from '@/core/types.js';
import type { Dimension, OrientedFace, Wire, Shape3D, Shell, Solid } from '@/core/shapeTypes.js';
import type { PlanarFace } from '@/core/validityTypes.js';
import type { Result } from '@/core/result.js';
import type { Shapeable } from '@/topology/apiTypes.js';
import { resolve } from '@/topology/apiTypes.js';
import { isWire } from '@/core/shapeTypes.js';
import * as extruding from './extrudeFns.js';
import * as lofting from './loftFns.js';

export type { LoftOptions, LoftEndCondition } from './loftFns.js';
export type { SweepOptions } from './extrudeFns.js';

// ---------------------------------------------------------------------------
// extrude — accepts number shorthand for Z-direction
// ---------------------------------------------------------------------------

/**
 * Extrude a face to produce a solid, or an open wire to produce a shell.
 *
 * @param face   - The face to extrude, or an open wire.
 * @param height - A number for Z-direction extrusion, or a Vec3 direction vector. A number
 *   is not a distance along the face normal: a face whose plane contains Z needs a vector.
 * @returns `Result` containing the extruded solid (a shell for a wire), or an error if
 *   validation or operation fails.
 */
export function extrude(wire: Shapeable<Wire<Dimension>>, height: number | Vec3): Result<Shell>;
export function extrude(
  face: Shapeable<OrientedFace<Dimension> & PlanarFace<Dimension>>,
  height: number | Vec3
): Result<Solid>;
export function extrude(
  face: Shapeable<(OrientedFace<Dimension> & PlanarFace<Dimension>) | Wire<Dimension>>,
  height: number | Vec3
): Result<Solid | Shell> {
  const f = resolve(face);
  const vec: Vec3 = typeof height === 'number' ? [0, 0, height] : height;
  return isWire(f) ? extruding.extrude(f, vec) : extruding.extrude(f, vec);
}

// ---------------------------------------------------------------------------
// revolve — options object
// ---------------------------------------------------------------------------

/** Options for {@link revolve}. */
export interface RevolveOptions {
  /** Rotation axis. Default: [0, 0, 1] (Z). */
  axis?: Vec3;
  /** Pivot point. Default: [0, 0, 0]. */
  at?: Vec3;
  /** Rotation angle in **radians**. Default: 2π (full revolution). */
  angle?: number;
}

/**
 * Revolve a face around an axis to create a solid of revolution, or an open
 * wire to create a shell.
 */
export function revolve(
  face: Shapeable<(OrientedFace<Dimension> & PlanarFace<Dimension>) | Wire<Dimension>>,
  options?: RevolveOptions
): Result<Shape3D> {
  const pivotPoint = options?.at ?? [0, 0, 0];
  return extruding.revolve(
    resolve(face),
    pivotPoint,
    options?.axis ?? [0, 0, 1],
    options?.angle ?? 2 * Math.PI
  );
}

// ---------------------------------------------------------------------------
// loft — accept Shapeable<Wire>[]
// ---------------------------------------------------------------------------

/**
 * Loft through a set of wire profiles to create a 3D shape.
 */
export function loft(
  wires: Shapeable<Wire<Dimension>>[],
  options?: lofting.LoftOptions
): Result<Shape3D> {
  const resolvedWires = wires.map((w) => resolve(w));
  return lofting.loft(resolvedWires, options);
}
