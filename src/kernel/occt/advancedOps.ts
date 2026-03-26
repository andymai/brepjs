/**
 * Advanced kernel operations for OCCT.
 *
 * Contains composed transforms, advanced sweep/loft, pattern generation,
 * surface construction, mesh sewing, repair, measurement, projection,
 * draft, and configured STEP export operations.
 *
 * Used by DefaultAdapter.
 */

import type { KernelInstance, KernelShape, KernelType, OperationResult } from '@/kernel/types.js';
import { transformWithEvolution } from './evolutionOps.js';
import { uniqueIOFilename } from '@/utils/ioFilename.js';

// ---------------------------------------------------------------------------
// Non-orthogonal general transform (gp_GTrsf path)
// ---------------------------------------------------------------------------

/**
 * Apply a non-orthogonal general transform using gp_GTrsf + BRepBuilderAPI_GTransform.
 * This path is for shear / non-uniform scale matrices. Requires BRepBuilderAPI_GTransform
 * in the WASM build.
 */
/* v8 ignore start -- untestable until WASM is rebuilt with BRepBuilderAPI_GTransform */
export function generalTransformNonOrthogonal(
  oc: KernelInstance,
  shape: KernelShape,
  linear: readonly [number, number, number, number, number, number, number, number, number],
  translation: readonly [number, number, number]
): KernelShape {
  const gtrsf = new oc.gp_GTrsf_1();
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      gtrsf.SetValue(row + 1, col + 1, linear[row * 3 + col]);
    }
  }
  const xyz = new oc.gp_XYZ_2(translation[0], translation[1], translation[2]);
  gtrsf.SetTranslationPart(xyz);
  xyz.delete();

  const transformer = new oc.BRepBuilderAPI_GTransform_2(shape, gtrsf, true);
  const result = transformer.Shape();
  transformer.delete();
  gtrsf.delete();
  return result;
}
/* v8 ignore stop */

// ---------------------------------------------------------------------------
// Composed transforms
// ---------------------------------------------------------------------------

/** Create a composed gp_Trsf from a sequence of translate/rotate operations. */
export function composeTransform(
  oc: KernelInstance,
  ops: Array<
    | { type: 'translate'; x: number; y: number; z: number }
    | {
        type: 'rotate';
        angle: number;
        axis?: [number, number, number];
        center?: [number, number, number];
      }
  >
): { handle: KernelType; dispose: () => void } {
  const trsf = new oc.gp_Trsf_1();

  for (const op of ops) {
    const step = new oc.gp_Trsf_1();
    if (op.type === 'translate') {
      const vec = new oc.gp_Vec_4(op.x, op.y, op.z);
      step.SetTranslation_1(vec);
      vec.delete();
    } else {
      const axis = op.axis ?? [0, 0, 1];
      const center = op.center ?? [0, 0, 0];
      const origin = new oc.gp_Pnt_3(center[0], center[1], center[2]);
      const dir = new oc.gp_Dir_5(axis[0], axis[1], axis[2]);
      const ax1 = new oc.gp_Ax1_2(origin, dir);
      step.SetRotation_1(ax1, (op.angle * Math.PI) / 180);
      ax1.delete();
      dir.delete();
      origin.delete();
    }
    trsf.PreMultiply(step);
    step.delete();
  }

  return { handle: trsf, dispose: () => trsf.delete() };
}

/** Apply a composed transform to a shape with evolution tracking. */
export function applyComposedTransformWithHistory(
  oc: KernelInstance,
  shape: KernelShape,
  transformHandle: KernelType,
  inputFaceHashes: number[],
  hashUpperBound: number
): OperationResult {
  return transformWithEvolution(oc, shape, transformHandle, inputFaceHashes, hashUpperBound);
}

// ---------------------------------------------------------------------------
// Advanced sweep/loft
// ---------------------------------------------------------------------------

/** Map string transition mode to OCCT enum value. */
function getTransitionMode(oc: KernelInstance, mode?: 'transformed' | 'round' | 'right'): unknown {
  if (!mode) return undefined;
  const modes = oc.BRepBuilderAPI_TransitionMode;
  switch (mode) {
    case 'transformed':
      return modes.BRepBuilderAPI_Transformed;
    case 'round':
      return modes.BRepBuilderAPI_RoundCorner;
    case 'right':
      return modes.BRepBuilderAPI_RightCorner;
  }
}

/** Sweep a profile along a spine with advanced options. */
export function sweepPipeShell(
  oc: KernelInstance,
  profile: KernelShape,
  spine: KernelShape,
  options: {
    transitionMode?: 'transformed' | 'round' | 'right';
    auxiliary?: KernelShape;
    law?: KernelType;
    contact?: boolean;
    correction?: boolean;
    frenet?: boolean;
    support?: KernelType;
    shellMode?: boolean;
    tolerance?: number;
    boundTolerance?: number;
    angularTolerance?: number;
    maxDegree?: number;
    maxSegments?: number;
  } = {}
): KernelShape | { shape: KernelShape; firstShape: KernelShape; lastShape: KernelShape } {
  const builder = new oc.BRepOffsetAPI_MakePipeShell(spine);

  // V8: disable internal history generation — sweepPipeShell is never called
  // with evolution tracking, so skip the overhead of recording Modified/Generated.
  if (typeof builder.SetIsBuildHistory === 'function') {
    builder.SetIsBuildHistory(false);
  }

  // Performance tuning
  if (options.tolerance !== undefined) {
    builder.SetTolerance(
      options.tolerance,
      options.boundTolerance ?? options.tolerance,
      options.angularTolerance ?? 1e-7
    );
  }
  if (options.maxDegree !== undefined) {
    builder.SetMaxDegree(options.maxDegree);
  }
  if (options.maxSegments !== undefined) {
    builder.SetMaxSegments(options.maxSegments);
  }

  const transMode = getTransitionMode(oc, options.transitionMode);
  if (transMode !== undefined) {
    builder.SetTransitionMode(transMode);
  }

  if (options.support) {
    builder.SetMode_4(options.support);
  } else if (options.frenet) {
    builder.SetMode_1(true);
  }

  if (options.auxiliary) {
    builder.SetMode_5(options.auxiliary, false, oc.BRepFill_TypeOfContact.BRepFill_NoContact);
  }

  const withContact = !!options.contact;
  const withCorrection = !!options.correction;

  if (options.law) {
    builder.SetLaw_1(profile, options.law, withContact, withCorrection);
  } else {
    builder.Add_1(profile, withContact, withCorrection);
  }

  const progress = new oc.Message_ProgressRange_1();
  builder.Build(progress);
  progress.delete();

  if (options.shellMode) {
    const shape = builder.Shape();
    const firstShape = builder.FirstShape();
    const lastShape = builder.LastShape();
    builder.delete();
    return { shape, firstShape, lastShape };
  }

  builder.MakeSolid();
  const result = builder.Shape();
  builder.delete();
  return result;
}

/** Loft through wires with advanced options. */
export function loftAdvanced(
  oc: KernelInstance,
  wires: KernelShape[],
  options: {
    solid?: boolean;
    ruled?: boolean;
    tolerance?: number;
    startVertex?: KernelShape;
    endVertex?: KernelShape;
  } = {}
): KernelShape {
  const solid = options.solid ?? true;
  const ruled = options.ruled ?? false;
  const builder = new oc.BRepOffsetAPI_ThruSections(solid, ruled, options.tolerance ?? 1e-6);

  if (options.startVertex) {
    builder.AddVertex(options.startVertex);
  }

  for (const wire of wires) {
    builder.AddWire(wire);
  }

  if (options.endVertex) {
    builder.AddVertex(options.endVertex);
  }

  const progress = new oc.Message_ProgressRange_1();
  builder.Build(progress);
  progress.delete();

  const result = builder.Shape();
  builder.delete();
  return result;
}

/** Build an extrusion scaling law (linear or s-curve). */
export function buildExtrusionLaw(
  oc: KernelInstance,
  profile: 'linear' | 's-curve',
  length: number,
  endFactor: number
): KernelType {
  if (profile === 'linear') {
    const law = new oc.Law_Linear();
    law.Set(0, 1, length, endFactor);
    return law;
  }
  // s-curve
  const law = new oc.Law_S();
  law.Set_1(0, 1, length, endFactor);
  return law;
}

/** Revolve a shape around an axis defined by center + direction vectors. */
export function revolveVec(
  oc: KernelInstance,
  shape: KernelShape,
  center: [number, number, number],
  direction: [number, number, number],
  angle: number
): KernelShape {
  const origin = new oc.gp_Pnt_3(center[0], center[1], center[2]);
  const dir = new oc.gp_Dir_5(direction[0], direction[1], direction[2]);
  const ax1 = new oc.gp_Ax1_2(origin, dir);
  const maker = new oc.BRepPrimAPI_MakeRevol_1(shape, ax1, angle, false);
  const result = maker.Shape();
  maker.delete();
  ax1.delete();
  dir.delete();
  origin.delete();
  return result;
}

// ---------------------------------------------------------------------------
// Pattern generation
// ---------------------------------------------------------------------------

/** Generate a linear pattern of shapes with pooled transforms. */
export function linearPattern(
  oc: KernelInstance,
  shape: KernelShape,
  direction: [number, number, number],
  spacing: number,
  count: number
): KernelShape[] {
  const results: KernelShape[] = [];
  const trsf = new oc.gp_Trsf_1();

  for (let i = 0; i < count; i++) {
    const dx = direction[0] * spacing * i;
    const dy = direction[1] * spacing * i;
    const dz = direction[2] * spacing * i;
    const vec = new oc.gp_Vec_4(dx, dy, dz);
    trsf.SetTranslation_1(vec);
    vec.delete();

    const transformer = new oc.BRepBuilderAPI_Transform_2(shape, trsf, true, false);
    results.push(transformer.Shape());
    transformer.delete();
  }

  trsf.delete();
  return results;
}

/** Generate a circular pattern of shapes. */
export function circularPattern(
  oc: KernelInstance,
  shape: KernelShape,
  center: [number, number, number],
  axis: [number, number, number],
  angleStep: number,
  count: number
): KernelShape[] {
  const results: KernelShape[] = [];
  const origin = new oc.gp_Pnt_3(center[0], center[1], center[2]);
  const dir = new oc.gp_Dir_5(axis[0], axis[1], axis[2]);
  const ax1 = new oc.gp_Ax1_2(origin, dir);
  const trsf = new oc.gp_Trsf_1();

  for (let i = 0; i < count; i++) {
    const angle = (angleStep * i * Math.PI) / 180;
    trsf.SetRotation_1(ax1, angle);

    const transformer = new oc.BRepBuilderAPI_Transform_2(shape, trsf, true, false);
    results.push(transformer.Shape());
    transformer.delete();
  }

  trsf.delete();
  ax1.delete();
  dir.delete();
  origin.delete();
  return results;
}

// ---------------------------------------------------------------------------
// Curve positioning
// ---------------------------------------------------------------------------

/**
 * Position a shape at a parameter along a spine curve.
 *
 * Computes the Frenet frame (point + tangent) at the given parameter on the spine,
 * then transforms the shape from standard coordinates (origin, Z-up) to that frame.
 */
export function positionOnCurve(
  oc: KernelInstance,
  shape: KernelShape,
  spine: KernelShape,
  param: number
): KernelShape {
  // Create adaptor for the spine (wire or edge)
  const isWire = spine.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_WIRE;
  const adaptor = isWire
    ? new oc.BRepAdaptor_CompCurve_2(spine, false)
    : new oc.BRepAdaptor_Curve_2(spine);

  const pnt = new oc.gp_Pnt_1();
  const tangent = new oc.gp_Vec_1();
  adaptor.D1(param, pnt, tangent);

  // Build target coordinate system at the spine point
  const tangentDir = new oc.gp_Dir_2(tangent);
  const toAx3 = new oc.gp_Ax3_5(pnt, tangentDir);

  // SetTransformation_2(ax3) computes transform FROM ax3 TO standard coords.
  // We want FROM standard (origin/Z-up) TO toAx3, so invert.
  const trsf = new oc.gp_Trsf_1();
  trsf.SetTransformation_2(toAx3);
  trsf.Invert();

  // Apply transform to the shape
  const transformer = new oc.BRepBuilderAPI_Transform_2(shape, trsf, true, false);
  const result = transformer.Shape();

  // Clean up
  transformer.delete();
  trsf.delete();
  toAx3.delete();
  tangentDir.delete();
  tangent.delete();
  pnt.delete();
  adaptor.delete();

  return result;
}

// ---------------------------------------------------------------------------
// Surface construction
// ---------------------------------------------------------------------------

/** Build a non-planar face by filling a wire boundary. */
export function makeNonPlanarFace(oc: KernelInstance, wire: KernelShape): KernelShape {
  const filler = new oc.BRepOffsetAPI_MakeFilling(3, 15, 2, false, 1e-5, 1e-4, 1e-2, 0.1, 8, 9);
  // Add edges from the wire as boundary constraints
  const explorer = new oc.TopExp_Explorer_2(
    wire,
    oc.TopAbs_ShapeEnum.TopAbs_EDGE,
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE
  );
  while (explorer.More()) {
    const edge = oc.TopoDS_Cast.Edge(explorer.Current());
    filler.Add_1(edge, oc.GeomAbs_Shape.GeomAbs_C0, true);
    explorer.Next();
  }
  explorer.delete();

  const progress = new oc.Message_ProgressRange_1();
  filler.Build(progress);
  progress.delete();

  const result = filler.Shape();
  filler.delete();
  return result;
}

/** Add hole wires to an existing face. */
export function addHolesInFace(
  oc: KernelInstance,
  face: KernelShape,
  holeWires: KernelShape[]
): KernelShape {
  // Use BRepBuilderAPI_MakeFace_2 which takes an existing face directly,
  // avoiding BRepAdaptor_Surface.Surface() which is unbound in this WASM build.
  const faceMaker = new oc.BRepBuilderAPI_MakeFace_2(face);

  for (const hw of holeWires) {
    faceMaker.Add(hw);
  }

  // Apply shape fix
  const rawFace = faceMaker.Face();
  faceMaker.delete();

  const fixer = new oc.ShapeFix_Face_2(rawFace);
  fixer.FixOrientation_1();
  fixer.Perform();
  const result = fixer.Face();
  fixer.delete();

  return result;
}

/** Remove all inner wires (holes) from a face. Returns a new face with only the outer boundary. */
export function removeHolesFromFace(oc: KernelInstance, face: KernelShape): KernelShape {
  const outerWire = oc.BRepTools_OuterWire(face);
  const surface = oc.BRep_Tool_Surface(face);
  try {
    const maker = new oc.BRepBuilderAPI_MakeFace_21(surface, outerWire, true);
    const result = maker.Face();
    maker.delete();

    const fixer = new oc.ShapeFix_Face_2(result);
    fixer.FixOrientation_1();
    fixer.Perform();
    const fixed = fixer.Face();
    fixer.delete();

    return fixed;
  } finally {
    surface.delete();
    outerWire.delete();
  }
}

/** Build a face on an existing surface bounded by a wire. Accepts a Geom_Surface handle or a TopoDS_Face (surface is extracted automatically). */
export function makeFaceOnSurface(
  oc: KernelInstance,
  surfaceOrFace: KernelType,
  wire: KernelShape
): KernelShape {
  // If the input is a TopoDS_Face, extract the underlying Geom_Surface
  let surface = surfaceOrFace;
  let surfaceOwned = false;
  try {
    if (surfaceOrFace.ShapeType !== undefined) {
      // It's a TopoDS_Shape (face) — extract surface
      surface = oc.BRep_Tool_Surface(surfaceOrFace);
      surfaceOwned = true;
    }
  } catch {
    // Not a shape — assume it's already a surface handle
  }
  const maker = new oc.BRepBuilderAPI_MakeFace_21(surface, wire, true);
  const result = maker.Face();
  maker.delete();
  if (surfaceOwned) surface.delete();
  return result;
}

/** Fit a B-spline surface through a grid of points. */
export function bsplineSurface(
  oc: KernelInstance,
  points: [number, number, number][],
  rows: number,
  cols: number
): KernelShape {
  const arr = new oc.TColgp_Array2OfPnt_2(1, rows, 1, cols);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- bounded by rows*cols
      const pt = points[idx]!;
      const pnt = new oc.gp_Pnt_3(pt[0], pt[1], pt[2]);
      arr.SetValue_1(r + 1, c + 1, pnt);
      pnt.delete();
    }
  }

  const fitter = new oc.GeomAPI_PointsToBSplineSurface_2(
    arr,
    3,
    8,
    oc.GeomAbs_Shape.GeomAbs_C2,
    1e-3
  );
  const surface = fitter.Surface();
  arr.delete();

  const maker = new oc.BRepBuilderAPI_MakeFace_8(surface, 1e-6);
  const result = maker.Face();
  maker.delete();
  fitter.delete();
  return result;
}

/** Build a triangulated surface from a height grid. */
export function triangulatedSurface(
  oc: KernelInstance,
  points: [number, number, number][],
  rows: number,
  cols: number
): KernelShape {
  const sewing = new oc.BRepBuilderAPI_Sewing(1e-6, true, true, true, false);

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      // Two triangles per grid cell
      const i00 = r * cols + c;
      const i10 = (r + 1) * cols + c;
      const i01 = r * cols + (c + 1);
      const i11 = (r + 1) * cols + (c + 1);

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- bounded by grid
      const p00 = points[i00]!;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- bounded by grid
      const p10 = points[i10]!;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- bounded by grid
      const p01 = points[i01]!;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- bounded by grid
      const p11 = points[i11]!;

      // Triangle 1: p00, p10, p01
      const face1 = makeTriFace(oc, p00, p10, p01);
      sewing.Add(face1);

      // Triangle 2: p10, p11, p01
      const face2 = makeTriFace(oc, p10, p11, p01);
      sewing.Add(face2);
    }
  }

  const progress = new oc.Message_ProgressRange_1();
  sewing.Perform(progress);
  progress.delete();

  const result = sewing.SewedShape();
  sewing.delete();
  return result;
}

/** Helper: create a triangular face from three points. */
function makeTriFace(
  oc: KernelInstance,
  p1: [number, number, number],
  p2: [number, number, number],
  p3: [number, number, number]
): KernelShape {
  const gp1 = new oc.gp_Pnt_3(p1[0], p1[1], p1[2]);
  const gp2 = new oc.gp_Pnt_3(p2[0], p2[1], p2[2]);
  const gp3 = new oc.gp_Pnt_3(p3[0], p3[1], p3[2]);

  const e1 = new oc.BRepBuilderAPI_MakeEdge_3(gp1, gp2);
  const e2 = new oc.BRepBuilderAPI_MakeEdge_3(gp2, gp3);
  const e3 = new oc.BRepBuilderAPI_MakeEdge_3(gp3, gp1);

  const wireMaker = new oc.BRepBuilderAPI_MakeWire_4(e1.Edge(), e2.Edge(), e3.Edge());
  const wire = wireMaker.Wire();

  const faceMaker = new oc.BRepBuilderAPI_MakeFace_15(wire, true);
  const face = faceMaker.Face();

  faceMaker.delete();
  wireMaker.delete();
  e3.delete();
  e2.delete();
  e1.delete();
  gp3.delete();
  gp2.delete();
  gp1.delete();

  return face;
}

// ---------------------------------------------------------------------------
// Mesh sewing -> solid
// ---------------------------------------------------------------------------

/** Sew faces into a shell and convert to solid. */
export function sewAndSolidify(
  oc: KernelInstance,
  faces: KernelShape[],
  tolerance: number
): KernelShape {
  const sewing = new oc.BRepBuilderAPI_Sewing(tolerance, true, true, true, false);

  for (const face of faces) {
    sewing.Add(face);
  }

  const progress = new oc.Message_ProgressRange_1();
  sewing.Perform(progress);
  progress.delete();

  const sewn = sewing.SewedShape();
  sewing.delete();

  // Try to convert to solid via ShapeFix_Solid.SolidFromShell
  const fixer = new oc.ShapeFix_Solid_1();
  try {
    const shell = oc.TopoDS_Cast.Shell(sewn);
    const solid = fixer.SolidFromShell(shell);
    return solid;
  } catch {
    // If solid creation fails, return the sewn shape as-is
    return sewn;
  } finally {
    fixer.delete();
  }
}

// ---------------------------------------------------------------------------
// Repair
// ---------------------------------------------------------------------------

/** Run ShapeFix_Shape on a shape (fixes orientation, etc.). */
export function fixShape(oc: KernelInstance, shape: KernelShape): KernelShape {
  const fixer = new oc.ShapeFix_Shape_1(shape);
  const progress = new oc.Message_ProgressRange_1();
  fixer.Perform(progress);
  const result = fixer.Shape();
  progress.delete();
  fixer.delete();
  return result;
}

/** Fix self-intersections in a wire. */
export function fixSelfIntersection(oc: KernelInstance, wire: KernelShape): KernelShape {
  const fixer = new oc.ShapeFix_Wire_1();
  fixer.Load_1(wire);
  fixer.FixSelfIntersection();
  const result = fixer.Wire();
  fixer.delete();
  return result;
}

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

/** Compute surface curvature at a UV point on a face. */
export function surfaceCurvature(
  oc: KernelInstance,
  face: KernelShape,
  u: number,
  v: number
): {
  gaussian: number;
  mean: number;
  max: number;
  min: number;
  maxDirection: [number, number, number];
  minDirection: [number, number, number];
} {
  const adaptor = new oc.BRepAdaptor_Surface_2(face, false);

  const P = new oc.gp_Pnt_1();
  const D1U = new oc.gp_Vec_1();
  const D1V = new oc.gp_Vec_1();
  const D2U = new oc.gp_Vec_1();
  const D2V = new oc.gp_Vec_1();
  const D2UV = new oc.gp_Vec_1();

  adaptor.D2(u, v, P, D1U, D1V, D2U, D2V, D2UV);

  // First fundamental form
  const E = D1U.Dot(D1U);
  const F = D1U.Dot(D1V);
  const G = D1V.Dot(D1V);

  // Surface normal
  const N = D1U.Crossed(D1V);
  const nLen = N.Magnitude();

  let result: {
    gaussian: number;
    mean: number;
    max: number;
    min: number;
    maxDirection: [number, number, number];
    minDirection: [number, number, number];
  };

  if (nLen < 1e-15) {
    result = {
      gaussian: 0,
      mean: 0,
      max: 0,
      min: 0,
      maxDirection: [1, 0, 0],
      minDirection: [0, 1, 0],
    };
  } else {
    N.Divide(nLen);

    const L = D2U.Dot(N);
    const M = D2UV.Dot(N);
    const N2 = D2V.Dot(N);
    const denom = E * G - F * F;

    if (Math.abs(denom) < 1e-15) {
      P.delete();
      D1U.delete();
      D1V.delete();
      D2U.delete();
      D2V.delete();
      D2UV.delete();
      N.delete();
      adaptor.delete();
      return {
        gaussian: 0,
        mean: 0,
        max: 0,
        min: 0,
        maxDirection: [1, 0, 0],
        minDirection: [0, 1, 0],
      };
    }

    const mean = (E * N2 - 2 * F * M + G * L) / (2 * denom);
    const gaussian = (L * N2 - M * M) / denom;
    const disc = Math.max(0, mean * mean - gaussian);
    const sqrtDisc = Math.sqrt(disc);
    const k1 = mean + sqrtDisc;
    const k2 = mean - sqrtDisc;

    // Principal directions via Weingarten map
    const a12 = (G * M - F * N2) / denom;
    const a21 = (E * M - F * L) / denom;
    const a11 = (G * L - F * M) / denom;

    let du1: number, dv1: number;
    if (Math.abs(a12) > 1e-15) {
      du1 = a12;
      dv1 = k1 - a11;
    } else if (Math.abs(a21) > 1e-15) {
      const a22 = (E * N2 - F * M) / denom;
      du1 = k1 - a22;
      dv1 = a21;
    } else {
      du1 = 1;
      dv1 = 0;
    }

    const maxDir = dirFromUV(D1U, D1V, du1, dv1);
    const minDir = dirFromUV(D1U, D1V, -dv1, du1);

    result = {
      gaussian,
      mean,
      max: k1,
      min: k2,
      maxDirection: maxDir,
      minDirection: minDir,
    };
  }

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

function dirFromUV(
  D1U: KernelType,
  D1V: KernelType,
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

/** Surface-based center of mass. */
export function surfaceCenterOfMass(
  oc: KernelInstance,
  face: KernelShape
): [number, number, number] {
  const props = new oc.GProp_GProps_1();
  oc.BRepGProp.SurfaceProperties_2(face, props, 1e-7, true);
  const center = props.CentreOfMass();
  const result: [number, number, number] = [center.X(), center.Y(), center.Z()];
  center.delete();
  props.delete();
  return result;
}

/** Create a persistent distance query tool. */
export function createDistanceQuery(
  oc: KernelInstance,
  referenceShape: KernelShape
): {
  distanceTo(shape: KernelShape): {
    value: number;
    point1: [number, number, number];
    point2: [number, number, number];
  };
  dispose(): void;
} {
  const distTool = new oc.BRepExtrema_DistShapeShape_1();
  distTool.LoadS1(referenceShape);

  return {
    distanceTo(shape: KernelShape) {
      distTool.LoadS2(shape);
      const progress = new oc.Message_ProgressRange_1();
      distTool.Perform(progress);
      progress.delete();

      if (!distTool.IsDone()) {
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
      return result;
    },
    dispose() {
      distTool.delete();
    },
  };
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

/** Project 3D edges onto a 2D plane (hidden line removal). */
export function projectEdges(
  oc: KernelInstance,
  shape: KernelShape,
  cameraOrigin: [number, number, number],
  cameraDirection: [number, number, number],
  cameraXAxis?: [number, number, number]
): {
  visible: { outline: KernelShape; smooth: KernelShape; sharp: KernelShape };
  hidden: { outline: KernelShape; smooth: KernelShape; sharp: KernelShape };
} {
  const hlr = new oc.HLRBRep_Algo_1();
  hlr.Add_2(shape, 0);

  const origin = new oc.gp_Pnt_3(cameraOrigin[0], cameraOrigin[1], cameraOrigin[2]);
  const dir = new oc.gp_Dir_5(cameraDirection[0], cameraDirection[1], cameraDirection[2]);

  let ax2;
  if (cameraXAxis) {
    const xDir = new oc.gp_Dir_5(cameraXAxis[0], cameraXAxis[1], cameraXAxis[2]);
    ax2 = new oc.gp_Ax2_2(origin, dir, xDir);
    xDir.delete();
  } else {
    ax2 = new oc.gp_Ax2_4(origin, dir);
  }

  const projector = new oc.HLRAlgo_Projector_2(ax2);
  hlr.Projector_1(projector);
  hlr.Update();
  hlr.Hide_1();

  const hlrHandle = new oc.Handle_HLRBRep_Algo_2(hlr);
  const hlrShapes = new oc.HLRBRep_HLRToShape(hlrHandle);

  const result = {
    visible: {
      outline: hlrShapes.OutLineVCompound_1(),
      smooth: hlrShapes.Rg1LineVCompound_1(),
      sharp: hlrShapes.VCompound_1(),
    },
    hidden: {
      outline: hlrShapes.OutLineHCompound_1(),
      smooth: hlrShapes.Rg1LineHCompound_1(),
      sharp: hlrShapes.HCompound_1(),
    },
  };

  // Build 3D curves for all projected edges
  for (const group of [result.visible, result.hidden]) {
    for (const s of [group.outline, group.smooth, group.sharp]) {
      if (!s.IsNull()) {
        oc.BRepLib_BuildCurves3d(s);
      }
    }
  }

  hlrShapes.delete();
  hlrHandle.delete();
  projector.delete();
  ax2.delete();
  dir.delete();
  origin.delete();

  return result;
}

// ---------------------------------------------------------------------------
// Draft
// ---------------------------------------------------------------------------

/** Create a draft prism (tapered extrusion with draft angle). */
export function draftPrism(
  oc: KernelInstance,
  shape: KernelShape,
  face: KernelShape,
  baseFace: KernelShape,
  height: number | null,
  angleDeg: number,
  fuse: boolean
): KernelShape {
  const angleRad = (angleDeg * Math.PI) / 180;
  const fusionMode = fuse ? 1 : 0;
  const maker = new oc.BRepFeat_MakeDPrism(shape, face, baseFace, angleRad, fusionMode, true);
  if (height !== null) {
    const progress = new oc.Message_ProgressRange_1();
    maker.Perform_1(height, progress);
    progress.delete();
  } else {
    maker.PerformThruAll();
  }
  const result = maker.Shape();
  maker.delete();
  return result;
}

// ---------------------------------------------------------------------------
// XCAF document creation
// ---------------------------------------------------------------------------

/** Create an XCAF document with named, colored shape nodes. */
export function createXCAFDocument(
  oc: KernelInstance,
  shapes: Array<{ shape: KernelShape; name: string; color?: [number, number, number, number] }>
): KernelType {
  const nameStr = new oc.TCollection_ExtendedString_2('XmlOcaf', true);
  const doc = new oc.TDocStd_Document(nameStr);
  nameStr.delete();

  oc.XCAFDoc_ShapeTool.SetAutoNaming(false);

  const mainLabel = doc.Main();
  const shapeTool = oc.XCAFDoc_DocumentTool_ShapeTool(mainLabel).get();
  const colorTool = oc.XCAFDoc_DocumentTool_ColorTool(mainLabel).get();

  for (const part of shapes) {
    const shapeNode = shapeTool.NewShape();
    shapeTool.SetShape(shapeNode, part.shape);

    const partName = new oc.TCollection_ExtendedString_2(part.name, true);
    oc.TDataStd_Name.Set_1(shapeNode, partName);
    partName.delete();

    if (part.color) {
      const [r, g, b, a] = part.color;
      const rgba = new oc.Quantity_ColorRGBA_5(r / 255, g / 255, b / 255, a / 255);
      colorTool.SetColor_3(shapeNode, rgba, oc.XCAFDoc_ColorType.XCAFDoc_ColorSurf);
      rgba.delete();
    }
  }

  shapeTool.UpdateAssemblies();

  return doc;
}

/** Write an XCAF document to STEP format and return the string. */
export function writeXCAFToSTEP(
  oc: KernelInstance,
  doc: KernelType,
  options: { unit?: string; modelUnit?: string } = {}
): string {
  // Configure units if provided
  if (options.unit || options.modelUnit) {
    const initWriter = new oc.STEPCAFControl_Writer_1();
    initWriter.delete();
    const unit = (options.modelUnit ?? options.unit ?? 'MM').toUpperCase();
    const writeUnit = (options.unit ?? options.modelUnit ?? 'MM').toUpperCase();
    oc.Interface_Static.SetCVal('xstep.cascade.unit', unit);
    oc.Interface_Static.SetCVal('write.step.unit', writeUnit);
  }

  const session = new oc.XSControl_WorkSession();
  const sessionHandle = new oc.Handle_XSControl_WorkSession_2(session);
  const writer = new oc.STEPCAFControl_Writer_2(sessionHandle, false);

  writer.SetColorMode(true);
  writer.SetLayerMode(true);
  writer.SetNameMode(true);
  oc.Interface_Static.SetIVal('write.surfacecurve.mode', true);
  oc.Interface_Static.SetIVal('write.precision.mode', 0);
  oc.Interface_Static.SetIVal('write.step.assembly', 2);
  oc.Interface_Static.SetIVal('write.step.schema', 5);

  const docHandle = new oc.Handle_TDocStd_Document_2(doc);
  const progress = new oc.Message_ProgressRange_1();
  writer.Transfer_1(docHandle, oc.STEPControl_StepModelType.STEPControl_AsIs, null, progress);
  progress.delete();

  const filename = uniqueIOFilename('_xcaf_export', 'step');
  const status = writer.Write(filename);

  let result = '';
  if (status === oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
    const content = oc.FS.readFile('/' + filename);
    result = new TextDecoder().decode(content);
    oc.FS.unlink('/' + filename);
  }

  writer.delete();
  sessionHandle.delete();
  // Don't delete docHandle — caller owns the doc lifetime

  return result;
}

// ---------------------------------------------------------------------------
// Export: STEP configured
// ---------------------------------------------------------------------------

/** Export shapes to STEP with full configuration. */
export function exportSTEPConfigured(
  oc: KernelInstance,
  shapes: Array<{ shape: KernelShape; name?: string; color?: [number, number, number, number] }>,
  options: { unit?: string; modelUnit?: string; schema?: number } = {}
): string {
  const unit = options.unit ?? 'MM';
  const modelUnit = options.modelUnit ?? unit;
  const schema = options.schema ?? 5;

  oc.Interface_Static.SetCVal('xstep.cascade.unit', modelUnit);
  oc.Interface_Static.SetCVal('write.step.unit', unit);
  oc.Interface_Static.SetIVal('write.surfacecurve.mode', true);
  oc.Interface_Static.SetIVal('write.precision.mode', 0);
  oc.Interface_Static.SetIVal('write.step.assembly', 2);
  oc.Interface_Static.SetIVal('write.step.schema', schema);

  const hasMetadata = shapes.some((s) => s.name || s.color);

  if (hasMetadata) {
    // Use XCAF path for named/colored parts
    const initWriter = new oc.STEPCAFControl_Writer_1();
    initWriter.delete();

    const nameStr = new oc.TCollection_ExtendedString_2('XmlOcaf', true);
    const doc = new oc.TDocStd_Document(nameStr);
    nameStr.delete();

    const mainLabel = doc.Main();
    const shapeTool = oc.XCAFDoc_DocumentTool_ShapeTool(mainLabel).get();
    const colorTool = oc.XCAFDoc_DocumentTool_ColorTool(mainLabel).get();
    oc.XCAFDoc_ShapeTool.SetAutoNaming(false);

    for (const part of shapes) {
      const shapeNode = shapeTool.AddShape(part.shape, false, true);

      if (part.name) {
        const partName = new oc.TCollection_ExtendedString_2(part.name, true);
        oc.TDataStd_Name.Set_1(shapeNode, partName);
        partName.delete();
      }

      if (part.color) {
        const [r, g, b, a] = part.color;
        const rgba = new oc.Quantity_ColorRGBA_5(r / 255, g / 255, b / 255, a / 255);
        colorTool.SetColor_3(shapeNode, rgba, oc.XCAFDoc_ColorType.XCAFDoc_ColorSurf);
        rgba.delete();
      }
    }

    const session = new oc.XSControl_WorkSession();
    const sessionHandle = new oc.Handle_XSControl_WorkSession_2(session);
    const writer = new oc.STEPCAFControl_Writer_2(sessionHandle, false);
    const docHandle = new oc.Handle_TDocStd_Document_2(doc);
    const progress = new oc.Message_ProgressRange_1();
    writer.Transfer_1(docHandle, oc.STEPControl_StepModelType.STEPControl_AsIs, null, progress);
    progress.delete();

    const filename = uniqueIOFilename('_step_cfg_export', 'step');
    const status = writer.Write(filename);

    let result = '';
    if (status === oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
      const content = oc.FS.readFile('/' + filename);
      result = new TextDecoder().decode(content);
      oc.FS.unlink('/' + filename);
    }

    writer.delete();
    sessionHandle.delete();
    docHandle.delete();
    doc.delete();

    return result;
  }

  // Simple path: no metadata
  const writer = new oc.STEPControl_Writer_1();
  writer.Model(true).delete();
  const progress = new oc.Message_ProgressRange_1();

  for (const part of shapes) {
    writer.Transfer(part.shape, oc.STEPControl_StepModelType.STEPControl_AsIs, true, progress);
  }

  const filename = uniqueIOFilename('_step_cfg_export', 'step');
  const done = writer.Write(filename);
  writer.delete();
  progress.delete();

  if (done === oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
    const file = oc.FS.readFile('/' + filename);
    oc.FS.unlink('/' + filename);
    return new TextDecoder().decode(file);
  }
  throw new Error('STEP configured export failed: writer did not complete successfully');
}
