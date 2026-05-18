/**
 * Measurement operations for OCCT shapes.
 *
 * Provides volume, area, length, center of mass, and bounding box calculations.
 * Used by DefaultAdapter.
 */

import type { BulkMeasurement } from '@/kernel/interfaces/measureOps.js';
import type { KernelInstance, KernelShape } from '@/kernel/types.js';
import type { KernelAdapter } from '@/kernel/interfaces/index.js';

export type { BulkMeasurement };

const HASH_CODE_MAX = 2147483647;

/** Cached flag: does the WASM build include MeasurementExtractor? */
let hasCppMeasurement: boolean | undefined;

/** Reset detection cache (called when kernel is re-initialized). */
export function resetMeasureDetectionCache(): void {
  hasCppMeasurement = undefined;
}

function detectCppMeasurement(oc: KernelInstance): boolean {
  hasCppMeasurement ??= typeof oc.MeasurementExtractor?.extract === 'function';
  return hasCppMeasurement;
}

/**
 * Computes volume, area, length, center-of-mass, and bounding box in a single
 * WASM call (when the C++ MeasurementExtractor is available). Falls back to
 * individual JS calls otherwise.
 */
export function measureBulk(
  oc: KernelInstance,
  shape: KernelShape,
  includeLinear = false
): BulkMeasurement {
  /* v8 ignore start -- C++ extractor not available in test WASM build */
  if (detectCppMeasurement(oc)) {
    const data = oc.MeasurementExtractor.extract(shape, includeLinear);
    try {
      const offset = (data.getDataPtr() as number) / 8; // HEAPF64 is indexed by double (8 bytes)
      const size = data.getDataSize() as number;
      const buf = oc.HEAPF64.slice(offset, offset + size);

      return {
        volume: buf[0] ?? 0,
        area: buf[1] ?? 0,
        length: buf[2] ?? 0,
        centerOfMass: [buf[3] ?? 0, buf[4] ?? 0, buf[5] ?? 0],
        boundingBox: {
          min: [buf[6] ?? 0, buf[7] ?? 0, buf[8] ?? 0],
          max: [buf[9] ?? 0, buf[10] ?? 0, buf[11] ?? 0],
        },
      };
    } finally {
      data.delete();
    }
  }
  /* v8 ignore stop */

  // JS fallback — individual calls
  return {
    volume: volume(oc, shape),
    area: area(oc, shape),
    length: includeLinear ? length(oc, shape) : 0,
    centerOfMass: centerOfMass(oc, shape),
    boundingBox: boundingBox(oc, shape),
  };
}

/**
 * Calculates the volume of a shape.
 */
export function volume(oc: KernelInstance, shape: KernelShape): number {
  const props = new oc.GProp_GProps_1();
  oc.BRepGProp.VolumeProperties_1(shape, props, true, false, false);
  const vol = props.Mass();
  props.delete();
  return vol;
}

/**
 * Calculates the surface area of a shape.
 */
export function area(oc: KernelInstance, shape: KernelShape): number {
  const props = new oc.GProp_GProps_1();
  oc.BRepGProp.SurfaceProperties_2(shape, props, 1e-7, true);
  const a = props.Mass();
  props.delete();
  return a;
}

/**
 * Calculates the length of a 1D shape (edge/wire).
 */
export function length(oc: KernelInstance, shape: KernelShape): number {
  const props = new oc.GProp_GProps_1();
  oc.BRepGProp.LinearProperties(shape, props, true, false);
  const len = props.Mass();
  props.delete();
  return len;
}

/**
 * Calculates the center of mass of a shape using volume properties.
 */
export function centerOfMass(oc: KernelInstance, shape: KernelShape): [number, number, number] {
  const props = new oc.GProp_GProps_1();
  oc.BRepGProp.VolumeProperties_1(shape, props, true, false, false);
  const center = props.CentreOfMass();
  const result: [number, number, number] = [center.X(), center.Y(), center.Z()];
  center.delete();
  props.delete();
  return result;
}

/**
 * Calculates the center of mass of a 1D shape (edge/wire) using linear properties.
 */
export function linearCenterOfMass(
  oc: KernelInstance,
  shape: KernelShape
): [number, number, number] {
  const props = new oc.GProp_GProps_1();
  oc.BRepGProp.LinearProperties(shape, props, true, false);
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
  oc: KernelInstance,
  shape: KernelShape
): {
  min: [number, number, number];
  max: [number, number, number];
} {
  const box = new oc.Bnd_Box();
  oc.BRepBndLib.Add(shape, box, true);
  const result = {
    min: [box.GetXMin(), box.GetYMin(), box.GetZMin()] as [number, number, number],
    max: [box.GetXMax(), box.GetYMax(), box.GetZMax()] as [number, number, number],
  };
  box.delete();
  return result;
}

/**
 * Measures the minimum distance between two shapes, returning value and closest points.
 */
export function distance(
  oc: KernelInstance,
  shape1: KernelShape,
  shape2: KernelShape
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
  oc: KernelInstance,
  face: KernelShape,
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

// ---------------------------------------------------------------------------
// Surface curvature
// ---------------------------------------------------------------------------

export interface CurvatureResult {
  /** Mean curvature: H = (k1 + k2) / 2 */
  mean: number;
  /** Gaussian curvature: K = k1 * k2 */
  gaussian: number;
  /** Maximum principal curvature */
  maxCurvature: number;
  /** Minimum principal curvature */
  minCurvature: number;
  /** Direction of maximum curvature */
  maxDirection: [number, number, number];
  /** Direction of minimum curvature */
  minDirection: [number, number, number];
}

// Re-export HASH_CODE_MAX for use by other modules
export { HASH_CODE_MAX };

/** Co-located factory: returns the measurement slice of {@link KernelAdapter} bound to `oc`. */
export function makeMeasureOps(oc: KernelInstance) {
  return {
    volume: (shape) => volume(oc, shape),
    area: (shape) => area(oc, shape),
    length: (shape) => length(oc, shape),
    centerOfMass: (shape) => centerOfMass(oc, shape),
    linearCenterOfMass: (shape) => linearCenterOfMass(oc, shape),
    boundingBox: (shape) => boundingBox(oc, shape),
    distance: (a, b) => distance(oc, a, b),
    classifyPointOnFace: (face, u, v, tolerance) => classifyPointOnFace(oc, face, u, v, tolerance),
    measureBulk: (shape, includeLinear) => measureBulk(oc, shape, includeLinear),
  } satisfies Pick<
    KernelAdapter,
    | 'volume'
    | 'area'
    | 'length'
    | 'centerOfMass'
    | 'linearCenterOfMass'
    | 'boundingBox'
    | 'distance'
    | 'classifyPointOnFace'
    | 'measureBulk'
  >;
}
