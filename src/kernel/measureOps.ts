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

// Re-export HASH_CODE_MAX for use by other modules
export { HASH_CODE_MAX };
