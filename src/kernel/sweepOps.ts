/**
 * Sweep operations for OCCT shapes.
 *
 * Provides extrusion, revolution, loft, and pipe sweep operations
 * for creating 3D solids from 2D profiles.
 *
 * Used by OCCTAdapter - re-exported for backward compatibility.
 */

import type { OpenCascadeInstance, OcShape, OcType } from './types.js';

/**
 * Extrudes a face along a direction.
 */
export function extrude(
  oc: OpenCascadeInstance,
  face: OcShape,
  direction: [number, number, number],
  length: number
): OcShape {
  const vec = new oc.gp_Vec_4(direction[0] * length, direction[1] * length, direction[2] * length);
  const maker = new oc.BRepPrimAPI_MakePrism_1(face, vec, false, true);
  const result = maker.Shape();
  maker.delete();
  vec.delete();
  return result;
}

/**
 * Revolves a shape around an axis.
 */
export function revolve(
  oc: OpenCascadeInstance,
  shape: OcShape,
  axis: OcType,
  angle: number
): OcShape {
  const maker = new oc.BRepPrimAPI_MakeRevol_1(shape, axis, angle, false);
  const result = maker.Shape();
  maker.delete();
  return result;
}

/**
 * Creates a loft through multiple wires.
 */
export function loft(
  oc: OpenCascadeInstance,
  wires: OcShape[],
  ruled = false,
  startShape?: OcShape,
  endShape?: OcShape
): OcShape {
  const loftBuilder = new oc.BRepOffsetAPI_ThruSections(true, ruled, 1e-6);
  if (startShape) loftBuilder.AddVertex(startShape);
  for (const wire of wires) {
    loftBuilder.AddWire(wire);
  }
  if (endShape) loftBuilder.AddVertex(endShape);
  const progress = new oc.Message_ProgressRange_1();
  loftBuilder.Build(progress);
  const result = loftBuilder.Shape();
  loftBuilder.delete();
  progress.delete();
  return result;
}

/**
 * Sweeps a wire along a spine.
 */
export function sweep(
  oc: OpenCascadeInstance,
  wire: OcShape,
  spine: OcShape,
  options: { transitionMode?: number } = {}
): OcShape {
  const { transitionMode } = options;
  const sweepBuilder = new oc.BRepOffsetAPI_MakePipeShell(spine);
  if (transitionMode !== undefined) {
    sweepBuilder.SetTransitionMode(transitionMode);
  }
  sweepBuilder.Add_1(wire, false, false);
  const progress = new oc.Message_ProgressRange_1();
  sweepBuilder.Build(progress);
  progress.delete();
  sweepBuilder.MakeSolid();
  const result = sweepBuilder.Shape();
  sweepBuilder.delete();
  return result;
}
