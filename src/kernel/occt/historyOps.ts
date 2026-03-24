/**
 * Operations with shape evolution history tracking.
 *
 * Each function performs an OCCT operation and returns an OperationResult
 * containing both the result shape and a ShapeEvolution record mapping
 * input face hashes to output face hashes.
 */

import type {
  KernelInstance,
  KernelShape,
  BooleanOptions,
  OperationResult,
  BooleanDiagnostics,
  DiagnosticOperationResult,
} from '@/kernel/types.js';
import type { OcctSimplifyBuilder } from './wasmTypes/index.js';
import {
  transformWithEvolution,
  modifierWithEvolution,
  booleanWithEvolution,
} from './evolutionOps.js';
import { applyGlue, applyBooleanDefaults } from './booleanOps.js';

// ---------------------------------------------------------------------------
// Transform with history
// ---------------------------------------------------------------------------

export function translateWithHistory(
  oc: KernelInstance,
  shape: KernelShape,
  x: number,
  y: number,
  z: number,
  inputFaceHashes: number[],
  hashUpperBound: number
): OperationResult {
  const trsf = new oc.gp_Trsf_1();
  const vec = new oc.gp_Vec_4(x, y, z);
  trsf.SetTranslation_1(vec);
  vec.delete();
  const result = transformWithEvolution(oc, shape, trsf, inputFaceHashes, hashUpperBound);
  trsf.delete();
  return result;
}

export function rotateWithHistory(
  oc: KernelInstance,
  shape: KernelShape,
  angle: number,
  inputFaceHashes: number[],
  hashUpperBound: number,
  axis: readonly [number, number, number] = [0, 0, 1],
  center: readonly [number, number, number] = [0, 0, 0]
): OperationResult {
  const trsf = new oc.gp_Trsf_1();
  const pnt = new oc.gp_Pnt_3(center[0], center[1], center[2]);
  const dir = new oc.gp_Dir_5(axis[0], axis[1], axis[2]);
  const ax1 = new oc.gp_Ax1_2(pnt, dir);
  trsf.SetRotation_1(ax1, angle);
  pnt.delete();
  dir.delete();
  ax1.delete();
  const result = transformWithEvolution(oc, shape, trsf, inputFaceHashes, hashUpperBound);
  trsf.delete();
  return result;
}

export function mirrorWithHistory(
  oc: KernelInstance,
  shape: KernelShape,
  origin: readonly [number, number, number],
  normal: readonly [number, number, number],
  inputFaceHashes: number[],
  hashUpperBound: number
): OperationResult {
  const trsf = new oc.gp_Trsf_1();
  const pnt = new oc.gp_Pnt_3(origin[0], origin[1], origin[2]);
  const dir = new oc.gp_Dir_5(normal[0], normal[1], normal[2]);
  const ax2 = new oc.gp_Ax2_4(pnt, dir);
  trsf.SetMirror_3(ax2);
  pnt.delete();
  dir.delete();
  ax2.delete();
  const result = transformWithEvolution(oc, shape, trsf, inputFaceHashes, hashUpperBound);
  trsf.delete();
  return result;
}

export function scaleWithHistory(
  oc: KernelInstance,
  shape: KernelShape,
  center: readonly [number, number, number],
  factor: number,
  inputFaceHashes: number[],
  hashUpperBound: number
): OperationResult {
  const trsf = new oc.gp_Trsf_1();
  const pnt = new oc.gp_Pnt_3(center[0], center[1], center[2]);
  trsf.SetScale(pnt, factor);
  pnt.delete();
  const result = transformWithEvolution(oc, shape, trsf, inputFaceHashes, hashUpperBound);
  trsf.delete();
  return result;
}

export function generalTransformWithHistory(
  oc: KernelInstance,
  shape: KernelShape,
  linear: readonly [number, number, number, number, number, number, number, number, number],
  translation: readonly [number, number, number],
  _isOrthogonal: boolean,
  inputFaceHashes: number[],
  hashUpperBound: number
): OperationResult {
  const trsf = new oc.gp_Trsf_1();
  trsf.SetValues(
    linear[0],
    linear[1],
    linear[2],
    translation[0],
    linear[3],
    linear[4],
    linear[5],
    translation[1],
    linear[6],
    linear[7],
    linear[8],
    translation[2]
  );
  const result = transformWithEvolution(oc, shape, trsf, inputFaceHashes, hashUpperBound);
  trsf.delete();
  return result;
}

// ---------------------------------------------------------------------------
// Diagnostics extraction
// ---------------------------------------------------------------------------

function extractDiagnostics(op: OcctSimplifyBuilder): BooleanDiagnostics {
  const hasErrors = op.HasErrors();
  const hasWarnings = op.HasWarnings();
  const messages: string[] = [];
  return { hasErrors, hasWarnings, messages };
}

// ---------------------------------------------------------------------------
// Boolean with history
// ---------------------------------------------------------------------------

export function fuseWithHistory(
  oc: KernelInstance,
  shape: KernelShape,
  tool: KernelShape,
  inputFaceHashes: number[],
  hashUpperBound: number,
  options: BooleanOptions = {}
): DiagnosticOperationResult {
  const progress = new oc.Message_ProgressRange_1();
  const fuseOp = new oc.BRepAlgoAPI_Fuse_3(shape, tool, progress);
  applyGlue(oc, fuseOp, options.optimisation);
  applyBooleanDefaults(fuseOp, options.fuzzyValue);
  fuseOp.Build(progress);
  const diagnostics = extractDiagnostics(fuseOp as OcctSimplifyBuilder);
  const result = booleanWithEvolution(
    oc,
    fuseOp,
    [shape, tool],
    inputFaceHashes,
    hashUpperBound,
    options.simplify ?? false,
    diagnostics
  );
  fuseOp.delete();
  progress.delete();
  return result;
}

export function cutWithHistory(
  oc: KernelInstance,
  shape: KernelShape,
  tool: KernelShape,
  inputFaceHashes: number[],
  hashUpperBound: number,
  options: BooleanOptions = {}
): DiagnosticOperationResult {
  const progress = new oc.Message_ProgressRange_1();
  const cutOp = new oc.BRepAlgoAPI_Cut_3(shape, tool, progress);
  applyGlue(oc, cutOp, options.optimisation);
  applyBooleanDefaults(cutOp, options.fuzzyValue);
  cutOp.Build(progress);
  const diagnostics = extractDiagnostics(cutOp as OcctSimplifyBuilder);
  const result = booleanWithEvolution(
    oc,
    cutOp,
    [shape, tool],
    inputFaceHashes,
    hashUpperBound,
    options.simplify ?? false,
    diagnostics
  );
  cutOp.delete();
  progress.delete();
  return result;
}

export function intersectWithHistory(
  oc: KernelInstance,
  shape: KernelShape,
  tool: KernelShape,
  inputFaceHashes: number[],
  hashUpperBound: number,
  options: BooleanOptions = {}
): DiagnosticOperationResult {
  const progress = new oc.Message_ProgressRange_1();
  const intOp = new oc.BRepAlgoAPI_Common_3(shape, tool, progress);
  applyGlue(oc, intOp, options.optimisation);
  applyBooleanDefaults(intOp, options.fuzzyValue);
  intOp.Build(progress);
  const diagnostics = extractDiagnostics(intOp as OcctSimplifyBuilder);
  const result = booleanWithEvolution(
    oc,
    intOp,
    [shape, tool],
    inputFaceHashes,
    hashUpperBound,
    options.simplify ?? false,
    diagnostics
  );
  intOp.delete();
  progress.delete();
  return result;
}

// ---------------------------------------------------------------------------
// Modifier with history
// ---------------------------------------------------------------------------

export function filletWithHistory(
  oc: KernelInstance,
  shape: KernelShape,
  edges: KernelShape[],
  radius: number | [number, number] | ((edge: KernelShape) => number | [number, number]),
  inputFaceHashes: number[],
  hashUpperBound: number
): OperationResult {
  const builder = new oc.BRepFilletAPI_MakeFillet(shape, oc.ChFi3d_FilletShape.ChFi3d_Rational);
  for (const edge of edges) {
    const r = typeof radius === 'function' ? radius(edge) : radius;
    if (Array.isArray(r)) {
      builder.Add_3(r[0], r[1], oc.TopoDS_Cast.Edge(edge));
    } else {
      builder.Add_2(r, oc.TopoDS_Cast.Edge(edge));
    }
  }
  const progress = new oc.Message_ProgressRange_1();
  builder.Build(progress);
  progress.delete();
  const result = modifierWithEvolution(oc, builder, shape, inputFaceHashes, hashUpperBound);
  builder.delete();
  return result;
}

export function chamferWithHistory(
  oc: KernelInstance,
  shape: KernelShape,
  edges: KernelShape[],
  distance: number | [number, number] | ((edge: KernelShape) => number | [number, number]),
  inputFaceHashes: number[],
  hashUpperBound: number
): OperationResult {
  const builder = new oc.BRepFilletAPI_MakeChamfer(shape);

  // Build edge→face map for chamfer Add_3
  const faceExplorer = new oc.TopExp_Explorer_2(
    shape,
    oc.TopAbs_ShapeEnum.TopAbs_FACE,
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE
  );
  const edgeFaceMap = new Map<number, KernelShape>();
  while (faceExplorer.More()) {
    const face = oc.TopoDS_Cast.Face(faceExplorer.Current());
    const edgeExplorer = new oc.TopExp_Explorer_2(
      face,
      oc.TopAbs_ShapeEnum.TopAbs_EDGE,
      oc.TopAbs_ShapeEnum.TopAbs_SHAPE
    );
    while (edgeExplorer.More()) {
      edgeFaceMap.set(oc.shapeHashCode(edgeExplorer.Current(), hashUpperBound), face);
      edgeExplorer.Next();
    }
    edgeExplorer.delete();
    faceExplorer.Next();
  }
  faceExplorer.delete();

  for (const edge of edges) {
    const d = typeof distance === 'function' ? distance(edge) : distance;
    const adjacentFace = edgeFaceMap.get(oc.shapeHashCode(edge, hashUpperBound));
    if (Array.isArray(d) && adjacentFace) {
      builder.Add_3(d[0], d[1], oc.TopoDS_Cast.Edge(edge), adjacentFace);
    } else {
      const dist = Array.isArray(d) ? d[0] : d;
      builder.Add_2(dist, oc.TopoDS_Cast.Edge(edge));
    }
  }

  const progress = new oc.Message_ProgressRange_1();
  builder.Build(progress);
  progress.delete();
  const result = modifierWithEvolution(oc, builder, shape, inputFaceHashes, hashUpperBound);
  builder.delete();
  return result;
}

export function shellWithHistory(
  oc: KernelInstance,
  shape: KernelShape,
  faces: KernelShape[],
  thickness: number,
  inputFaceHashes: number[],
  hashUpperBound: number,
  tolerance = 1e-3
): OperationResult {
  const builder = new oc.BRepOffsetAPI_MakeThickSolid();
  const faceList = new oc.TopTools_ListOfShape_1();
  for (const face of faces) faceList.Append_1(face);
  const progress = new oc.Message_ProgressRange_1();
  builder.MakeThickSolidByJoin(
    shape,
    faceList,
    -thickness,
    tolerance,
    oc.BRepOffset_Mode.BRepOffset_Skin,
    false,
    false,
    oc.GeomAbs_JoinType.GeomAbs_Arc,
    false,
    progress
  );
  progress.delete();
  faceList.delete();
  const result = modifierWithEvolution(oc, builder, shape, inputFaceHashes, hashUpperBound);
  builder.delete();
  return result;
}

export function thickenWithHistory(
  oc: KernelInstance,
  shape: KernelShape,
  thickness: number,
  inputFaceHashes: number[],
  hashUpperBound: number
): OperationResult {
  const builder = new oc.BRepOffsetAPI_MakeThickSolid();
  builder.MakeThickSolidBySimple(shape, thickness);
  const progress = new oc.Message_ProgressRange_1();
  builder.Build(progress);
  progress.delete();
  const result = modifierWithEvolution(oc, builder, shape, inputFaceHashes, hashUpperBound);
  builder.delete();
  return result;
}

export function offsetWithHistory(
  oc: KernelInstance,
  shape: KernelShape,
  distance: number,
  inputFaceHashes: number[],
  hashUpperBound: number,
  tolerance = 1e-6
): OperationResult {
  const builder = new oc.BRepOffsetAPI_MakeOffsetShape();
  const progress = new oc.Message_ProgressRange_1();
  builder.PerformByJoin(
    shape,
    distance,
    tolerance,
    oc.BRepOffset_Mode.BRepOffset_Skin,
    false,
    false,
    oc.GeomAbs_JoinType.GeomAbs_Arc,
    false,
    progress
  );
  progress.delete();
  const result = modifierWithEvolution(oc, builder, shape, inputFaceHashes, hashUpperBound);
  builder.delete();
  return result;
}

// ---------------------------------------------------------------------------
// Draft with history
// ---------------------------------------------------------------------------

export function draftWithHistory(
  oc: KernelInstance,
  shape: KernelShape,
  faces: KernelShape[],
  pullDirection: [number, number, number],
  neutralPlane: [number, number, number],
  angleDeg: number | ((face: KernelShape) => number),
  inputFaceHashes: number[],
  hashUpperBound: number
): OperationResult {
  if (!oc.BRepOffsetAPI_DraftAngle) {
    throw new Error(
      'BRepOffsetAPI_DraftAngle not available in this WASM build. ' +
        'Rebuild brepjs-opencascade with the updated build config.'
    );
  }

  const [px, py, pz] = pullDirection;
  const [ox, oy, oz] = neutralPlane;

  const dir = new oc.gp_Dir_5(px, py, pz);
  const origin = new oc.gp_Pnt_3(ox, oy, oz);
  const pln = new oc.gp_Pln_3(origin, dir);
  const builder = new oc.BRepOffsetAPI_DraftAngle_2(shape);
  try {
    for (const face of faces) {
      const angle = typeof angleDeg === 'function' ? angleDeg(face) : angleDeg;
      const angleRad = (angle * Math.PI) / 180;
      builder.Add(oc.TopoDS_Cast.Face(face), dir, angleRad, pln, true);
    }
    const progress = new oc.Message_ProgressRange_1();
    builder.Build(progress);
    progress.delete();
    return modifierWithEvolution(oc, builder, shape, inputFaceHashes, hashUpperBound);
  } finally {
    builder.delete();
    pln.delete();
    origin.delete();
    dir.delete();
  }
}
