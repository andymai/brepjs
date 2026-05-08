/* v8 ignore file -- occt-wasm kernel not available in brepkit test suite */
/**
 * Simple measurement operations for the occt-wasm adapter.
 *
 * Complex methods (`distance`, `surfaceCurvature`) remain in the adapter
 * for now because they depend on private helpers (`collectDistanceSamples`,
 * `computePrincipalDirections`, `surfaceDerivatives`) that are themselves
 * 100+ lines and would bloat this PR.
 *
 * @module
 */

import type { KernelShape } from '@/kernel/types.js';
import type { BulkMeasurement } from '@/kernel/interfaces/measureOps.js';
import type { OcctKernelWasm } from './occtWasmTypes.js';
import { noop, unwrap } from './helpers.js';

export function volume(k: OcctKernelWasm, shape: KernelShape): number {
  return k.getVolume(unwrap(shape));
}

export function area(k: OcctKernelWasm, shape: KernelShape): number {
  return k.getSurfaceArea(unwrap(shape));
}

export function length(k: OcctKernelWasm, shape: KernelShape): number {
  return k.getLength(unwrap(shape));
}

export function centerOfMass(k: OcctKernelWasm, shape: KernelShape): [number, number, number] {
  const vec = k.getCenterOfMass(unwrap(shape));
  try {
    return [vec.get(0), vec.get(1), vec.get(2)];
  } finally {
    vec.delete();
  }
}

export function linearCenterOfMass(
  k: OcctKernelWasm,
  shape: KernelShape
): [number, number, number] {
  const vec = k.getLinearCenterOfMass(unwrap(shape));
  try {
    return [vec.get(0), vec.get(1), vec.get(2)];
  } finally {
    vec.delete();
  }
}

export function boundingBox(
  k: OcctKernelWasm,
  shape: KernelShape
): { min: [number, number, number]; max: [number, number, number] } {
  const bb = k.getBoundingBox(unwrap(shape), true);
  return {
    min: [bb.xmin, bb.ymin, bb.zmin],
    max: [bb.xmax, bb.ymax, bb.zmax],
  };
}

export function surfaceCenterOfMass(
  k: OcctKernelWasm,
  face: KernelShape
): [number, number, number] {
  // Delegates to occt-wasm's exact `BRepGProp::SurfaceProperties.CentreOfMass()`
  // (added in occt-wasm 2.0). The previous tessellation-triangle centroid
  // diverged from brepjs-occt for non-planar faces.
  try {
    const v = k.getSurfaceCenterOfMass(unwrap(face));
    try {
      return [v.get(0), v.get(1), v.get(2)];
    } finally {
      v.delete();
    }
  } catch {
    // Degenerate or unmeshable face — preserve previous behavior of
    // returning origin rather than propagating the WASM exception.
    return [0, 0, 0];
  }
}

export function measureBulk(
  k: OcctKernelWasm,
  shape: KernelShape,
  includeLinear?: boolean
): BulkMeasurement {
  return {
    volume: volume(k, shape),
    area: area(k, shape),
    length: includeLinear ? length(k, shape) : 0,
    centerOfMass: centerOfMass(k, shape),
    boundingBox: boundingBox(k, shape),
  };
}

export function createDistanceQuery(
  k: OcctKernelWasm,
  referenceShape: KernelShape
): {
  distanceTo(shape: KernelShape): {
    value: number;
    point1: [number, number, number];
    point2: [number, number, number];
  };
  dispose(): void;
} {
  const refId = unwrap(referenceShape);
  return {
    distanceTo(shape: KernelShape) {
      const d = k.distanceBetween(refId, unwrap(shape));
      return { value: d, point1: [0, 0, 0], point2: [0, 0, 0] };
    },
    dispose: noop,
  };
}
