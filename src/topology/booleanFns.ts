/**
 * Boolean and compound operations — functional replacements for _3DShape boolean methods.
 * All functions are immutable: they return new shapes without disposing inputs.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT types are dynamic
type OcType = any;

import { getKernel } from '../kernel/index.js';
import type { AnyShape, Shape3D, Compound } from '../core/shapeTypes.js';
import { castShape, isShape3D, createCompound } from '../core/shapeTypes.js';
import { gcWithScope } from '../core/disposal.js';
import { type Result, ok, err, isErr } from '../core/result.js';
import { validationError, typeCastError } from '../core/errors.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BooleanOptions {
  optimisation?: 'none' | 'commonFace' | 'sameFace';
  simplify?: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function applyGlue(op: { SetGlue(glue: OcType): void }, optimisation: string): void {
  const oc = getKernel().oc;
  if (optimisation === 'commonFace') {
    op.SetGlue(oc.BOPAlgo_GlueEnum.BOPAlgo_GlueShift);
  }
  if (optimisation === 'sameFace') {
    op.SetGlue(oc.BOPAlgo_GlueEnum.BOPAlgo_GlueFull);
  }
}

function buildCompoundOcInternal(shapes: OcType[]): OcType {
  const oc = getKernel().oc;
  const builder = new oc.TopoDS_Builder();
  const compound = new oc.TopoDS_Compound();
  builder.MakeCompound(compound);
  for (const s of shapes) {
    builder.Add(compound, s);
  }
  builder.delete();
  return compound;
}

function castToShape3D(shape: OcType, errorCode: string, errorMsg: string): Result<Shape3D> {
  const wrapped = castShape(shape);
  if (!isShape3D(wrapped)) {
    return err(typeCastError(errorCode, errorMsg));
  }
  return ok(wrapped);
}

// ---------------------------------------------------------------------------
// Boolean operations
// ---------------------------------------------------------------------------

/** Fuse two shapes together. Returns a new shape. */
export function fuseShapes(
  a: Shape3D,
  b: Shape3D,
  { optimisation = 'none', simplify = true }: BooleanOptions = {}
): Result<Shape3D> {
  const oc = getKernel().oc;
  const r = gcWithScope();
  const progress = r(new oc.Message_ProgressRange_1());
  const fuseOp = r(new oc.BRepAlgoAPI_Fuse_3(a.wrapped, b.wrapped, progress));
  applyGlue(fuseOp, optimisation);
  fuseOp.Build(progress);
  if (simplify) fuseOp.SimplifyResult(true, true, 1e-3);
  return castToShape3D(fuseOp.Shape(), 'FUSE_NOT_3D', 'Fuse did not produce a 3D shape');
}

/** Cut a tool shape from a base shape. Returns a new shape. */
export function cutShape(
  base: Shape3D,
  tool: Shape3D,
  { optimisation = 'none', simplify = true }: BooleanOptions = {}
): Result<Shape3D> {
  const oc = getKernel().oc;
  const r = gcWithScope();
  const progress = r(new oc.Message_ProgressRange_1());
  const cutOp = r(new oc.BRepAlgoAPI_Cut_3(base.wrapped, tool.wrapped, progress));
  applyGlue(cutOp, optimisation);
  cutOp.Build(progress);
  if (simplify) cutOp.SimplifyResult(true, true, 1e-3);
  return castToShape3D(cutOp.Shape(), 'CUT_NOT_3D', 'Cut did not produce a 3D shape');
}

/** Intersect two shapes. Returns a new shape. */
export function intersectShapes(
  a: Shape3D,
  b: AnyShape,
  { simplify = true }: { simplify?: boolean } = {}
): Result<Shape3D> {
  const oc = getKernel().oc;
  const r = gcWithScope();
  const progress = r(new oc.Message_ProgressRange_1());
  const intOp = r(new oc.BRepAlgoAPI_Common_3(a.wrapped, b.wrapped, progress));
  intOp.Build(progress);
  if (simplify) intOp.SimplifyResult(true, true, 1e-3);
  return castToShape3D(intOp.Shape(), 'INTERSECT_NOT_3D', 'Intersect did not produce a 3D shape');
}

// ---------------------------------------------------------------------------
// Batch boolean operations
// ---------------------------------------------------------------------------

/** Fuse all shapes in a single boolean operation. */
export function fuseAll(
  shapes: Shape3D[],
  { optimisation = 'none', simplify = true }: BooleanOptions = {}
): Result<Shape3D> {
  if (shapes.length === 0)
    return err(validationError('FUSE_ALL_EMPTY', 'fuseAll requires at least one shape'));
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  if (shapes.length === 1) return ok(shapes[0]!);

  // Recursive pairwise fuse to avoid compounding mutually-intersecting shapes
  const mid = Math.ceil(shapes.length / 2);
  const leftResult = fuseAll(shapes.slice(0, mid), { optimisation, simplify });
  if (isErr(leftResult)) return leftResult;
  const rightResult = fuseAll(shapes.slice(mid), { optimisation, simplify });
  if (isErr(rightResult)) return rightResult;

  return fuseShapes(leftResult.value, rightResult.value, { optimisation, simplify });
}

/** Cut all tool shapes from a base shape in a single boolean operation. */
export function cutAll(
  base: Shape3D,
  tools: Shape3D[],
  { optimisation = 'none', simplify = true }: BooleanOptions = {}
): Result<Shape3D> {
  if (tools.length === 0) return ok(base);

  const oc = getKernel().oc;
  const r = gcWithScope();

  const toolCompound = r(buildCompoundOcInternal(tools.map((s) => s.wrapped)));
  const progress = r(new oc.Message_ProgressRange_1());
  const cutOp = r(new oc.BRepAlgoAPI_Cut_3(base.wrapped, toolCompound, progress));
  applyGlue(cutOp, optimisation);
  cutOp.Build(progress);
  if (simplify) cutOp.SimplifyResult(true, true, 1e-3);
  return castToShape3D(cutOp.Shape(), 'CUT_ALL_NOT_3D', 'cutAll did not produce a 3D shape');
}

// ---------------------------------------------------------------------------
// Compound building
// ---------------------------------------------------------------------------

/** Build a compound from multiple shapes. */
export function buildCompound(shapes: AnyShape[]): Compound {
  const compound = buildCompoundOcInternal(shapes.map((s) => s.wrapped));
  return createCompound(compound);
}
