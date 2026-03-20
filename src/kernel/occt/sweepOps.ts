/**
 * Sweep operations for OCCT shapes.
 *
 * Provides extrusion, revolution, loft, and pipe sweep operations
 * for creating 3D solids from 2D profiles.
 *
 * Used by DefaultAdapter.
 */

import type { KernelInstance, KernelShape, KernelType } from '@/kernel/types.js';

/**
 * Extrudes a face along a direction.
 */
export function extrude(
  oc: KernelInstance,
  face: KernelShape,
  direction: [number, number, number],
  length: number
): KernelShape {
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
  oc: KernelInstance,
  shape: KernelShape,
  axis: KernelType,
  angle: number
): KernelShape {
  const maker = new oc.BRepPrimAPI_MakeRevol_1(shape, axis, angle, false);
  const result = maker.Shape();
  maker.delete();
  return result;
}

/**
 * Creates a loft through multiple wires.
 */
export function loft(
  oc: KernelInstance,
  wires: KernelShape[],
  ruled = false,
  startShape?: KernelShape,
  endShape?: KernelShape
): KernelShape {
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
  oc: KernelInstance,
  wire: KernelShape,
  spine: KernelShape,
  options: { transitionMode?: number } = {}
): KernelShape {
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

/**
 * Simple pipe sweep using BRepOffsetAPI_MakePipe.
 *
 * Faster than MakePipeShell for constant cross-section profiles (especially
 * rotationally symmetric ones like circles) because it skips Frenet frame
 * computation and profile orientation interpolation.
 */
export function simplePipe(
  oc: KernelInstance,
  profile: KernelShape,
  spine: KernelShape
): KernelShape {
  const maker = new oc.BRepOffsetAPI_MakePipe_1(spine, profile);
  const progress = new oc.Message_ProgressRange_1();
  maker.Build(progress);
  progress.delete();

  // MakePipe produces a shell by default — solidify it
  const shellShape = maker.Shape();
  const solidMaker = new oc.BRepBuilderAPI_MakeSolid_1();
  const shellDowncast = oc.TopoDS.Shell_1(shellShape);
  solidMaker.Add(shellDowncast);
  const solidProgress = new oc.Message_ProgressRange_1();
  solidMaker.Build(solidProgress);
  solidProgress.delete();

  const result = solidMaker.IsDone() ? solidMaker.Solid() : shellShape;

  shellDowncast.delete();
  solidMaker.delete();
  maker.delete();
  return result;
}
