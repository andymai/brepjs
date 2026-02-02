/**
 * Standalone functions for Sketch and CompoundSketch operations.
 * Delegates to existing Sketch/CompoundSketch class methods and operations/ functions.
 */

import type { Point } from '../core/geometry.js';
import type { Face, Shape3D, Wire } from '../topology/shapes.js';
import type { ExtrusionProfile, GenericSweepConfig } from '../operations/extrude.js';
import type { LoftConfig } from '../operations/loft.js';
import type Sketch from './Sketch.js';
import type CompoundSketch from './CompoundSketch.js';

// ---------------------------------------------------------------------------
// Sketch operations
// ---------------------------------------------------------------------------

/** Extrude a sketch to a given distance. Consumes the sketch. */
export function sketchExtrude(
  sketch: Sketch,
  height: number,
  config?: {
    extrusionDirection?: Point;
    extrusionProfile?: ExtrusionProfile;
    twistAngle?: number;
    origin?: Point;
  }
): Shape3D {
  return sketch.extrude(height, config);
}

/** Revolve a sketch around an axis. Consumes the sketch. */
export function sketchRevolve(
  sketch: Sketch,
  revolutionAxis?: Point,
  options?: { origin?: Point }
): Shape3D {
  return sketch.revolve(revolutionAxis, options);
}

/** Loft between sketches. Consumes the sketches. */
export function sketchLoft(
  sketch: Sketch,
  otherSketches: Sketch | Sketch[],
  loftConfig?: LoftConfig,
  returnShell?: boolean
): Shape3D {
  return sketch.loftWith(otherSketches, loftConfig, returnShell);
}

/** Sweep another sketch along this sketch's wire. Consumes the sketch. */
export function sketchSweep(
  sketch: Sketch,
  sketchOnPlane: Parameters<Sketch['sweepSketch']>[0],
  sweepConfig?: GenericSweepConfig
): Shape3D {
  return sketch.sweepSketch(sketchOnPlane, sweepConfig);
}

/** Get the face from a sketch (wire must be closed). */
export function sketchFace(sketch: Sketch): Face {
  return sketch.face();
}

/** Get the wire from a sketch. */
export function sketchWires(sketch: Sketch): Wire {
  return sketch.wires();
}

// ---------------------------------------------------------------------------
// CompoundSketch operations
// ---------------------------------------------------------------------------

/** Extrude a compound sketch to a given distance. */
export function compoundSketchExtrude(
  sketch: CompoundSketch,
  height: number,
  config?: {
    extrusionDirection?: Point;
    extrusionProfile?: ExtrusionProfile;
    twistAngle?: number;
    origin?: Point;
  }
): Shape3D {
  return sketch.extrude(height, config);
}

/** Revolve a compound sketch around an axis. */
export function compoundSketchRevolve(
  sketch: CompoundSketch,
  revolutionAxis?: Point,
  options?: { origin?: Point }
): Shape3D {
  return sketch.revolve(revolutionAxis, options);
}

/** Get the face from a compound sketch. */
export function compoundSketchFace(sketch: CompoundSketch): Face {
  return sketch.face();
}

/** Loft between compound sketches. */
export function compoundSketchLoft(
  sketch: CompoundSketch,
  other: CompoundSketch,
  loftConfig: LoftConfig
): Shape3D {
  return sketch.loftWith(other, loftConfig);
}
