/**
 * Standalone functions for Sketch and CompoundSketch operations.
 * Delegates to existing Sketch/CompoundSketch class methods and operations/ functions.
 */

import type { PointInput } from '../core/types.js';
import type { Face, Shape3D, Wire } from '../core/shapeTypes.js';
import type { ExtrusionProfile, GenericSweepConfig } from '../operations/extrude.js';
import type { LoftConfig } from '../operations/loft.js';
import type Sketch from './Sketch.js';
import type CompoundSketch from './CompoundSketch.js';

// ---------------------------------------------------------------------------
// Sketch operations
// ---------------------------------------------------------------------------

/**
 * Extrude a sketch to a given distance along its default (or overridden) direction.
 *
 * @param sketch - The sketch to extrude. Consumed (deleted) by this call.
 * @param height - Extrusion distance.
 * @param config - Optional direction, profile, twist angle, or origin overrides.
 * @returns The extruded 3D solid.
 *
 * @see {@link Sketch.extrude} for the OOP equivalent.
 */
export function sketchExtrude(
  sketch: Sketch,
  height: number,
  config?: {
    extrusionDirection?: PointInput;
    extrusionProfile?: ExtrusionProfile;
    twistAngle?: number;
    origin?: PointInput;
  }
): Shape3D {
  return sketch.extrude(height, config);
}

/**
 * Revolve a sketch around an axis to produce a solid of revolution.
 *
 * @param sketch - The sketch to revolve. Consumed (deleted) by this call.
 * @param revolutionAxis - Axis direction (defaults to sketch default direction).
 * @param options - Optional origin override.
 * @returns The revolved 3D solid.
 *
 * @see {@link Sketch.revolve} for the OOP equivalent.
 */
export function sketchRevolve(
  sketch: Sketch,
  revolutionAxis?: PointInput,
  options?: { origin?: PointInput }
): Shape3D {
  return sketch.revolve(revolutionAxis, options);
}

/**
 * Loft between this sketch and one or more other sketches.
 *
 * @param sketch - The starting sketch. Consumed by this call.
 * @param otherSketches - Target sketch(es) to loft toward.
 * @param loftConfig - Loft options (ruled surface, start/end points, etc.).
 * @param returnShell - If true, return a shell instead of a solid.
 * @returns The lofted 3D shape.
 *
 * @see {@link Sketch.loftWith} for the OOP equivalent.
 */
export function sketchLoft(
  sketch: Sketch,
  otherSketches: Sketch | Sketch[],
  loftConfig?: LoftConfig,
  returnShell?: boolean
): Shape3D {
  return sketch.loftWith(otherSketches, loftConfig, returnShell);
}

/**
 * Sweep a profile sketch along this sketch's wire path.
 *
 * @param sketch - The path sketch. Consumed by this call.
 * @param sketchOnPlane - Function that builds the profile sketch at the sweep start.
 * @param sweepConfig - Sweep options (auxiliary spine, orthogonality, etc.).
 * @returns The swept 3D shape.
 *
 * @see {@link Sketch.sweepSketch} for the OOP equivalent.
 */
export function sketchSweep(
  sketch: Sketch,
  sketchOnPlane: Parameters<Sketch['sweepSketch']>[0],
  sweepConfig?: GenericSweepConfig
): Shape3D {
  return sketch.sweepSketch(sketchOnPlane, sweepConfig);
}

/**
 * Build a face from a sketch's closed wire.
 *
 * @param sketch - A sketch with a closed wire.
 * @returns The planar face.
 *
 * @see {@link Sketch.face} for the OOP equivalent.
 */
export function sketchFace(sketch: Sketch): Face {
  return sketch.face();
}

/**
 * Get a clone of the wire from a sketch.
 *
 * @param sketch - The source sketch.
 * @returns A cloned wire.
 *
 * @see {@link Sketch.wires} for the OOP equivalent.
 */
export function sketchWires(sketch: Sketch): Wire {
  return sketch.wires();
}

// ---------------------------------------------------------------------------
// CompoundSketch operations
// ---------------------------------------------------------------------------

/**
 * Extrude a compound sketch (outer + holes) to a given distance.
 *
 * @param sketch - The compound sketch to extrude.
 * @param height - Extrusion distance.
 * @param config - Optional direction, profile, twist angle, or origin overrides.
 * @returns The extruded 3D solid.
 *
 * @see {@link CompoundSketch.extrude} for the OOP equivalent.
 */
export function compoundSketchExtrude(
  sketch: CompoundSketch,
  height: number,
  config?: {
    extrusionDirection?: PointInput;
    extrusionProfile?: ExtrusionProfile;
    twistAngle?: number;
    origin?: PointInput;
  }
): Shape3D {
  return sketch.extrude(height, config);
}

/**
 * Revolve a compound sketch around an axis to produce a solid of revolution.
 *
 * @param sketch - The compound sketch to revolve.
 * @param revolutionAxis - Axis direction.
 * @param options - Optional origin override.
 * @returns The revolved 3D solid.
 *
 * @see {@link CompoundSketch.revolve} for the OOP equivalent.
 */
export function compoundSketchRevolve(
  sketch: CompoundSketch,
  revolutionAxis?: PointInput,
  options?: { origin?: PointInput }
): Shape3D {
  return sketch.revolve(revolutionAxis, options);
}

/**
 * Build a face from a compound sketch (outer boundary with holes).
 *
 * @param sketch - The compound sketch.
 * @returns A face with inner wires subtracted as holes.
 *
 * @see {@link CompoundSketch.face} for the OOP equivalent.
 */
export function compoundSketchFace(sketch: CompoundSketch): Face {
  return sketch.face();
}

/**
 * Loft between two compound sketches that have the same number of sub-sketches.
 *
 * @param sketch - Starting compound sketch.
 * @param other - Target compound sketch.
 * @param loftConfig - Loft options (ruled surface, etc.).
 * @returns The lofted 3D solid.
 *
 * @see {@link CompoundSketch.loftWith} for the OOP equivalent.
 */
export function compoundSketchLoft(
  sketch: CompoundSketch,
  other: CompoundSketch,
  loftConfig: LoftConfig
): Shape3D {
  return sketch.loftWith(other, loftConfig);
}
