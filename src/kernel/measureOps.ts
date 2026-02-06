/**
 * Measurement operations for OCCT shapes.
 *
 * Provides volume, area, length, center of mass, and bounding box calculations.
 * Used by OCCTAdapter - re-exported for backward compatibility.
 */

import type { OpenCascadeInstance, OcShape, OcType } from './types.js';

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

/**
 * Compute surface curvature at a (u, v) point on a face.
 *
 * Uses BRepAdaptor_Surface to get first and second derivatives,
 * then computes principal curvatures from the shape operator
 * (first and second fundamental forms).
 */
export function surfaceCurvature(
  oc: OpenCascadeInstance,
  face: OcShape,
  u: number,
  v: number
): CurvatureResult {
  const adaptor = new oc.BRepAdaptor_Surface_2(face, false);

  // D2 outputs: point, first derivatives (D1U, D1V), second derivatives (D2U, D2V, D2UV)
  const P = new oc.gp_Pnt_1();
  const D1U = new oc.gp_Vec_1();
  const D1V = new oc.gp_Vec_1();
  const D2U = new oc.gp_Vec_1();
  const D2V = new oc.gp_Vec_1();
  const D2UV = new oc.gp_Vec_1();

  adaptor.D2(u, v, P, D1U, D1V, D2U, D2V, D2UV);

  // First fundamental form coefficients
  const E = D1U.Dot(D1U);
  const F = D1U.Dot(D1V);
  const G = D1V.Dot(D1V);

  // Surface normal
  const N = D1U.Crossed(D1V);
  const nLen = N.Magnitude();

  let result: CurvatureResult;

  if (nLen < 1e-15) {
    // Degenerate point — curvature is undefined
    result = {
      mean: 0,
      gaussian: 0,
      maxCurvature: 0,
      minCurvature: 0,
      maxDirection: [1, 0, 0],
      minDirection: [0, 1, 0],
    };
  } else {
    N.Divide(nLen);

    // Second fundamental form coefficients
    const L = D2U.Dot(N);
    const M = D2UV.Dot(N);
    const N2 = D2V.Dot(N);

    const denom = E * G - F * F;

    if (Math.abs(denom) < 1e-15) {
      // Singular first fundamental form — curvature undefined
      P.delete();
      D1U.delete();
      D1V.delete();
      D2U.delete();
      D2V.delete();
      D2UV.delete();
      N.delete();
      adaptor.delete();
      return {
        mean: 0,
        gaussian: 0,
        maxCurvature: 0,
        minCurvature: 0,
        maxDirection: [1, 0, 0],
        minDirection: [0, 1, 0],
      };
    }

    // Mean curvature: H = (EN2 - 2FM + GL) / (2 * denom)
    const mean = (E * N2 - 2 * F * M + G * L) / (2 * denom);

    // Gaussian curvature: K = (LN2 - M²) / denom
    const gaussian = (L * N2 - M * M) / denom;

    // Principal curvatures from H and K: k1,k2 = H ± sqrt(H² - K)
    const disc = Math.max(0, mean * mean - gaussian);
    const sqrtDisc = Math.sqrt(disc);
    const k1 = mean + sqrtDisc;
    const k2 = mean - sqrtDisc;

    // Principal directions from the Weingarten map (shape operator)
    // S = [[E,F],[F,G]]^-1 * [[L,M],[M,N2]]
    // Eigenvectors in (u,v) parameter space → map to 3D via D1U, D1V
    const a11 = (G * L - F * M) / denom;
    const a12 = (G * M - F * N2) / denom;
    const a21 = (E * M - F * L) / denom;
    const a22 = (E * N2 - F * M) / denom;

    // Eigenvectors for k1: (a11-k1)*du + a12*dv = 0
    let du1: number, dv1: number;
    if (Math.abs(a12) > 1e-15) {
      du1 = a12;
      dv1 = k1 - a11;
    } else if (Math.abs(a21) > 1e-15) {
      du1 = k1 - a22;
      dv1 = a21;
    } else {
      du1 = 1;
      dv1 = 0;
    }

    // Map to 3D: direction = du * D1U + dv * D1V, then normalize
    const maxDir = computeDirection(D1U, D1V, du1, dv1);
    const minDir = computeDirection(D1U, D1V, -dv1, du1); // Perpendicular in parameter space

    result = {
      mean,
      gaussian,
      maxCurvature: k1,
      minCurvature: k2,
      maxDirection: maxDir,
      minDirection: minDir,
    };
  }

  // Clean up OCCT objects
  P.delete();
  D1U.delete();
  D1V.delete();
  D2U.delete();
  D2V.delete();
  D2UV.delete();
  N.delete();
  adaptor.delete();

  return result;
}

function computeDirection(
  D1U: OcType,
  D1V: OcType,
  du: number,
  dv: number
): [number, number, number] {
  const x = du * D1U.X() + dv * D1V.X();
  const y = du * D1U.Y() + dv * D1V.Y();
  const z = du * D1U.Z() + dv * D1V.Z();
  const len = Math.sqrt(x * x + y * y + z * z);
  if (len < 1e-15) return [1, 0, 0];
  return [x / len, y / len, z / len];
}

// Re-export HASH_CODE_MAX for use by other modules
export { HASH_CODE_MAX };
