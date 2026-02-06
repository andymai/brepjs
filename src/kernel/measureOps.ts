/**
 * Measurement operations for OCCT shapes.
 *
 * Provides volume, area, length, center of mass, and bounding box calculations.
 * Used by OCCTAdapter - re-exported for backward compatibility.
 */

import type { OpenCascadeInstance, OcShape } from './types.js';

const HASH_CODE_MAX = 2147483647;

/**
 * Calculates the volume of a shape.
 */
export function volume(oc: OpenCascadeInstance, shape: OcShape): number {
  const props = new oc.GProp_GProps_1();
  oc.BRepGProp.VolumeProperties_1(shape, props, true, false, false);
  const vol = props.Mass();
  props.delete();
  return vol;
}

/**
 * Calculates the surface area of a shape.
 */
export function area(oc: OpenCascadeInstance, shape: OcShape): number {
  const props = new oc.GProp_GProps_1();
  oc.BRepGProp.SurfaceProperties_2(shape, props, 1e-7, true);
  const a = props.Mass();
  props.delete();
  return a;
}

/**
 * Calculates the length of a 1D shape (edge/wire).
 */
export function length(oc: OpenCascadeInstance, shape: OcShape): number {
  const props = new oc.GProp_GProps_1();
  oc.BRepGProp.LinearProperties(shape, props, true, false);
  const len = props.Mass();
  props.delete();
  return len;
}

/**
 * Calculates the center of mass of a shape.
 */
export function centerOfMass(oc: OpenCascadeInstance, shape: OcShape): [number, number, number] {
  const props = new oc.GProp_GProps_1();
  oc.BRepGProp.VolumeProperties_1(shape, props, true, false, false);
  const center = props.CentreOfMass();
  const result: [number, number, number] = [center.X(), center.Y(), center.Z()];
  center.delete();
  props.delete();
  return result;
}

/**
 * Calculates the axis-aligned bounding box of a shape.
 */
export function boundingBox(
  oc: OpenCascadeInstance,
  shape: OcShape
): {
  min: [number, number, number];
  max: [number, number, number];
} {
  const box = new oc.Bnd_Box_1();
  oc.BRepBndLib.Add(shape, box, true);
  const xMin = { current: 0 };
  const yMin = { current: 0 };
  const zMin = { current: 0 };
  const xMax = { current: 0 };
  const yMax = { current: 0 };
  const zMax = { current: 0 };
  box.Get(xMin, yMin, zMin, xMax, yMax, zMax);
  box.delete();
  return {
    min: [xMin.current, yMin.current, zMin.current],
    max: [xMax.current, yMax.current, zMax.current],
  };
}

/**
 * Measures the minimum distance between two shapes, returning value and closest points.
 */
export function distance(
  oc: OpenCascadeInstance,
  shape1: OcShape,
  shape2: OcShape
): { value: number; point1: [number, number, number]; point2: [number, number, number] } {
  const distTool = new oc.BRepExtrema_DistShapeShape_1();
  distTool.LoadS1(shape1);
  distTool.LoadS2(shape2);
  const progress = new oc.Message_ProgressRange_1();
  distTool.Perform(progress);

  if (!distTool.IsDone()) {
    progress.delete();
    distTool.delete();
    throw new Error('BRepExtrema_DistShapeShape failed');
  }

  const value = distTool.Value() as number;
  const p1 = distTool.PointOnShape1(1);
  const p2 = distTool.PointOnShape2(1);

  const result = {
    value,
    point1: [p1.X(), p1.Y(), p1.Z()] as [number, number, number],
    point2: [p2.X(), p2.Y(), p2.Z()] as [number, number, number],
  };

  p1.delete();
  p2.delete();
  progress.delete();
  distTool.delete();
  return result;
}

/**
 * Classifies a point (given in UV space) relative to a face boundary.
 * Returns 'in', 'on', or 'out'.
 */
export function classifyPointOnFace(
  oc: OpenCascadeInstance,
  face: OcShape,
  u: number,
  v: number,
  tolerance = 1e-6
): 'in' | 'on' | 'out' {
  if (!oc.BRepClass_FaceClassifier) {
    throw new Error('BRepClass_FaceClassifier not available in this WASM build');
  }
  const pnt2d = new oc.gp_Pnt2d_3(u, v);
  const classifier = new oc.BRepClass_FaceClassifier_3(face, pnt2d, tolerance);
  const state = classifier.State();
  pnt2d.delete();
  classifier.delete();

  const topAbs = oc.TopAbs_State;
  if (state === topAbs.TopAbs_IN) return 'in';
  if (state === topAbs.TopAbs_ON) return 'on';
  return 'out';
}

// Re-export HASH_CODE_MAX for use by other modules
export { HASH_CODE_MAX };
