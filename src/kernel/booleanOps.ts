/**
 * Boolean operations for OCCT shapes.
 *
 * Provides fuse, cut, intersect, and batch operations (fuseAll, cutAll).
 * Used by OCCTAdapter - re-exported for backward compatibility.
 */

import type { OpenCascadeInstance, OcShape, BooleanOptions } from './types.js';

/**
 * Applies glue optimization to a boolean operation builder.
 */
export function applyGlue(
  oc: OpenCascadeInstance,
  op: { SetGlue(glue: unknown): void },
  optimisation?: string
): void {
  if (optimisation === 'commonFace') {
    op.SetGlue(oc.BOPAlgo_GlueEnum.BOPAlgo_GlueShift);
  }
  if (optimisation === 'sameFace') {
    op.SetGlue(oc.BOPAlgo_GlueEnum.BOPAlgo_GlueFull);
  }
}

/**
 * Builds a compound from multiple shapes.
 */
export function buildCompound(oc: OpenCascadeInstance, shapes: OcShape[]): OcShape {
  const builder = new oc.TopoDS_Builder();
  const compound = new oc.TopoDS_Compound();
  builder.MakeCompound(compound);
  for (const s of shapes) {
    builder.Add(compound, s);
  }
  builder.delete();
  return compound;
}

/**
 * Fuses two shapes together.
 */
export function fuse(
  oc: OpenCascadeInstance,
  shape: OcShape,
  tool: OcShape,
  options: BooleanOptions = {}
): OcShape {
  const { optimisation, simplify = false } = options;
  const progress = new oc.Message_ProgressRange_1();
  const fuseOp = new oc.BRepAlgoAPI_Fuse_3(shape, tool, progress);
  applyGlue(oc, fuseOp, optimisation);
  fuseOp.Build(progress);
  if (simplify) fuseOp.SimplifyResult(true, true, 1e-3);
  const result = fuseOp.Shape();
  fuseOp.delete();
  progress.delete();
  return result;
}

/**
 * Cuts a tool shape from a base shape.
 */
export function cut(
  oc: OpenCascadeInstance,
  shape: OcShape,
  tool: OcShape,
  options: BooleanOptions = {}
): OcShape {
  const { optimisation, simplify = false } = options;
  const progress = new oc.Message_ProgressRange_1();
  const cutOp = new oc.BRepAlgoAPI_Cut_3(shape, tool, progress);
  applyGlue(oc, cutOp, optimisation);
  cutOp.Build(progress);
  if (simplify) cutOp.SimplifyResult(true, true, 1e-3);
  const result = cutOp.Shape();
  cutOp.delete();
  progress.delete();
  return result;
}

/**
 * Intersects two shapes.
 */
export function intersect(
  oc: OpenCascadeInstance,
  shape: OcShape,
  tool: OcShape,
  options: BooleanOptions = {}
): OcShape {
  const { optimisation, simplify = false } = options;
  const progress = new oc.Message_ProgressRange_1();
  const commonOp = new oc.BRepAlgoAPI_Common_3(shape, tool, progress);
  applyGlue(oc, commonOp, optimisation);
  commonOp.Build(progress);
  if (simplify) commonOp.SimplifyResult(true, true, 1e-3);
  const result = commonOp.Shape();
  commonOp.delete();
  progress.delete();
  return result;
}

/**
 * Fuses multiple shapes using C++ batch operation.
 */
function fuseAllBatch(
  oc: OpenCascadeInstance,
  shapes: OcShape[],
  options: BooleanOptions = {}
): OcShape {
  const { optimisation, simplify = false } = options;
  const batch = new oc.BooleanBatch();
  for (const s of shapes) {
    batch.addShape(s);
  }
  const glueMode = optimisation === 'commonFace' ? 1 : optimisation === 'sameFace' ? 2 : 0;
  const result = batch.fuseAll(glueMode, simplify);
  batch.delete();
  return result;
}

/**
 * Fuses multiple shapes using native OCCT N-way general fuse.
 */
function fuseAllNative(
  oc: OpenCascadeInstance,
  shapes: OcShape[],
  options: BooleanOptions = {}
): OcShape {
  const { optimisation, simplify = false } = options;

  const argList = new oc.TopTools_ListOfShape_1();
  for (const s of shapes) {
    argList.Append_1(s);
  }

  const builder = new oc.BRepAlgoAPI_BuilderAlgo_1();
  builder.SetArguments(argList);
  applyGlue(oc, builder, optimisation);

  const progress = new oc.Message_ProgressRange_1();
  builder.Build(progress);
  let result = builder.Shape();

  if (simplify) {
    const upgrader = new oc.ShapeUpgrade_UnifySameDomain_2(result, true, true, false);
    upgrader.Build();
    result = upgrader.Shape();
    upgrader.delete();
  }

  argList.delete();
  builder.delete();
  progress.delete();
  return result;
}

/**
 * Fuses multiple shapes using recursive pairwise fusion.
 */
function fuseAllPairwise(
  oc: OpenCascadeInstance,
  shapes: OcShape[],
  options: BooleanOptions = {}
): OcShape {
  const mid = Math.ceil(shapes.length / 2);
  const left = fuseAll(oc, shapes.slice(0, mid), {
    ...options,
    simplify: false,
    strategy: 'pairwise',
  });
  const right = fuseAll(oc, shapes.slice(mid), {
    ...options,
    simplify: false,
    strategy: 'pairwise',
  });
  return fuse(oc, left, right, options);
}

/**
 * Fuses all given shapes in a single operation.
 */
export function fuseAll(
  oc: OpenCascadeInstance,
  shapes: OcShape[],
  options: BooleanOptions = {}
): OcShape {
  if (shapes.length === 0) throw new Error('fuseAll requires at least one shape');
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  if (shapes.length === 1) return shapes[0]!;

  const { strategy = 'native' } = options;
  if (strategy === 'pairwise') {
    return fuseAllPairwise(oc, shapes, options);
  }

  // Prefer C++ BooleanBatch (single WASM call) when available
  if (oc.BooleanBatch) {
    return fuseAllBatch(oc, shapes, options);
  }

  return fuseAllNative(oc, shapes, options);
}

/**
 * Cuts all tool shapes from a base shape using C++ batch operation.
 */
function cutAllBatch(
  oc: OpenCascadeInstance,
  shape: OcShape,
  tools: OcShape[],
  options: BooleanOptions = {}
): OcShape {
  const { optimisation, simplify = false } = options;
  const batch = new oc.BooleanBatch();
  for (const t of tools) {
    batch.addShape(t);
  }
  const glueMode = optimisation === 'commonFace' ? 1 : optimisation === 'sameFace' ? 2 : 0;
  const result = batch.cutAll(shape, glueMode, simplify);
  batch.delete();
  return result;
}

/**
 * Cuts all tool shapes from a base shape.
 */
export function cutAll(
  oc: OpenCascadeInstance,
  shape: OcShape,
  tools: OcShape[],
  options: BooleanOptions = {}
): OcShape {
  if (tools.length === 0) return shape;

  // Prefer C++ BooleanBatch (single WASM call) when available
  if (oc.BooleanBatch) {
    return cutAllBatch(oc, shape, tools, options);
  }

  const toolCompound = buildCompound(oc, tools);
  const result = cut(oc, shape, toolCompound, options);
  toolCompound.delete();
  return result;
}
