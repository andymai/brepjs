/**
 * Boolean operations for OCCT shapes.
 *
 * Provides fuse, cut, intersect, and batch operations (fuseAll, cutAll).
 * Used by DefaultAdapter.
 */

import type {
  BooleanIssue,
  BooleanOpType,
  CheckBooleanResult,
  KernelInstance,
  KernelShape,
  BooleanOptions,
} from '@/kernel/types.js';
import type { KernelAdapter } from '@/kernel/interfaces/index.js';
import { perfTimer } from '../perfStats.js';
import { cppFuseAll, cppCutAll } from './booleanBatchOps.js';
import { isValid } from './topologyOps.js';
import { wasmIndex } from '@/utils/vec3.js';

/** Tolerance passed to OCCT SimplifyResult (ShapeUpgrade_UnifySameDomain). */
const SIMPLIFY_TOLERANCE = 1e-3;

/**
 * Applies glue optimization to a boolean operation builder.
 */
export function applyGlue(
  oc: KernelInstance,
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
 * Applies common OCCT boolean algorithm settings for performance.
 *
 * - SetRunParallel: enables multi-threaded intersection computation.
 * - SetUseOBB: Oriented Bounding Boxes give tighter spatial rejection than AABBs.
 * - SetFuzzyValue: when provided, merges nearly-coincident vertices/edges early,
 *   reducing intersection computation complexity.
 */
export function applyBooleanDefaults(
  // All OCCT boolean algo classes inherit these from BRepAlgoAPI_Algo / BOPAlgo_Options.
  // Optional markers are defensive — the WASM bridge is untyped (KernelInstance = any).
  op: {
    SetRunParallel(flag: boolean): void;
    SetUseOBB?(flag: boolean): void;
    SetFuzzyValue?(fuzz: number): void;
  },
  fuzzyValue?: number
): void {
  op.SetRunParallel(true);
  op.SetUseOBB?.(true);
  if (fuzzyValue !== undefined && fuzzyValue > 0) {
    op.SetFuzzyValue?.(fuzzyValue);
  }
}

/**
 * Compute a sensible fuzzy value based on shape bounding box diagonal.
 * Returns 0 (no fuzzy) for very small shapes; 1e-5 for mm-scale geometry.
 *
 * Only fires for multi-shape operations (≥3 shapes) where vertex merging
 * during intersection is the bottleneck. For 2-shape operations the overhead
 * of computing a bounding box exceeds the benefit.
 */
function autoFuzzyValue(oc: KernelInstance, shapes: KernelShape[]): number {
  if (shapes.length < 3) return 0;

  const firstShape = shapes[0];
  if (!firstShape) return 0;

  const box = new oc.Bnd_Box();
  oc.BRepBndLib.Add(firstShape, box, true);
  if (box.IsVoid()) {
    box.delete();
    return 0;
  }
  const min = box.CornerMin();
  const max = box.CornerMax();
  const dx = (max.X() as number) - (min.X() as number);
  const dy = (max.Y() as number) - (min.Y() as number);
  const dz = (max.Z() as number) - (min.Z() as number);
  min.delete();
  max.delete();
  box.delete();

  const diagonal = Math.sqrt(dx * dx + dy * dy + dz * dz);
  // 1e-5 for shapes > 1mm diagonal, 0 for sub-mm geometry
  return diagonal > 1 ? 1e-5 : 0;
}

/**
 * Builds a compound from multiple shapes.
 */
export function buildCompound(oc: KernelInstance, shapes: KernelShape[]): KernelShape {
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
  oc: KernelInstance,
  shape: KernelShape,
  tool: KernelShape,
  options: BooleanOptions = {}
): KernelShape {
  const end = perfTimer('boolean');
  try {
    const { optimisation, simplify = false, fuzzyValue } = options;
    const progress = new oc.Message_ProgressRange_1();
    const fuseOp = new oc.BRepAlgoAPI_Fuse_3(shape, tool, progress);
    applyGlue(oc, fuseOp, optimisation);
    applyBooleanDefaults(fuseOp, fuzzyValue);
    fuseOp.Build(progress);
    if (simplify) fuseOp.SimplifyResult(true, true, SIMPLIFY_TOLERANCE);
    const result = fuseOp.Shape();
    fuseOp.delete();
    progress.delete();
    return result;
  } finally {
    end();
  }
}

/**
 * Cuts a tool shape from a base shape.
 */
export function cut(
  oc: KernelInstance,
  shape: KernelShape,
  tool: KernelShape,
  options: BooleanOptions = {}
): KernelShape {
  const end = perfTimer('boolean');
  try {
    const { optimisation, simplify = false, fuzzyValue } = options;
    const progress = new oc.Message_ProgressRange_1();
    const cutOp = new oc.BRepAlgoAPI_Cut_3(shape, tool, progress);
    applyGlue(oc, cutOp, optimisation);
    applyBooleanDefaults(cutOp, fuzzyValue);
    cutOp.Build(progress);
    if (simplify) cutOp.SimplifyResult(true, true, SIMPLIFY_TOLERANCE);
    const result = cutOp.Shape();
    cutOp.delete();
    progress.delete();
    return result;
  } finally {
    end();
  }
}

/**
 * Intersects two shapes.
 */
export function intersect(
  oc: KernelInstance,
  shape: KernelShape,
  tool: KernelShape,
  options: BooleanOptions = {}
): KernelShape {
  const end = perfTimer('boolean');
  try {
    const { optimisation, simplify = false, fuzzyValue } = options;
    const progress = new oc.Message_ProgressRange_1();
    const commonOp = new oc.BRepAlgoAPI_Common_3(shape, tool, progress);
    applyGlue(oc, commonOp, optimisation);
    applyBooleanDefaults(commonOp, fuzzyValue);
    commonOp.Build(progress);
    if (simplify) commonOp.SimplifyResult(true, true, SIMPLIFY_TOLERANCE);
    const result = commonOp.Shape();
    commonOp.delete();
    progress.delete();
    return result;
  } finally {
    end();
  }
}

/**
 * Sections a shape with another shape (typically a planar face), returning
 * the intersection edges/wires.
 */
export function section(
  oc: KernelInstance,
  shape: KernelShape,
  tool: KernelShape,
  approximation: boolean = true
): KernelShape {
  const progress = new oc.Message_ProgressRange_1();
  const sectionOp = new oc.BRepAlgoAPI_Section_3(shape, tool, false);
  sectionOp.Approximation(approximation);
  applyBooleanDefaults(sectionOp);
  sectionOp.Build(progress);
  if (!sectionOp.IsDone()) {
    sectionOp.delete();
    progress.delete();
    throw new Error('BRepAlgoAPI_Section build failed');
  }
  const result = sectionOp.Shape();
  sectionOp.delete();
  progress.delete();
  return result;
}

/**
 * Fuses multiple shapes using native OCCT N-way general fuse.
 */
function fuseAllNative(
  oc: KernelInstance,
  shapes: KernelShape[],
  options: BooleanOptions = {}
): KernelShape {
  // Try C++ batch path first (single WASM call with parallel + OBB)
  const cppResult = cppFuseAll(oc, shapes, options);
  if (cppResult !== null) return cppResult;

  // JS fallback — individual OCCT calls via Embind
  const end = perfTimer('boolean');
  try {
    const { optimisation, simplify = false } = options;
    const fuzzyValue = options.fuzzyValue ?? autoFuzzyValue(oc, shapes);

    const argList = new oc.TopTools_ListOfShape_1();
    for (const s of shapes) {
      argList.Append_1(s);
    }

    const builder = new oc.BRepAlgoAPI_BuilderAlgo_1();
    builder.SetArguments(argList);
    applyGlue(oc, builder, optimisation);
    applyBooleanDefaults(builder, fuzzyValue);

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
  } finally {
    end();
  }
}

/**
 * Fuses multiple shapes using recursive pairwise fusion with index ranges.
 * Uses start/end indices to avoid array allocations on each recursive call.
 */
function fuseAllPairwiseRange(
  oc: KernelInstance,
  shapes: KernelShape[],
  start: number,
  end: number,
  options: BooleanOptions
): KernelShape {
  options.signal?.throwIfAborted();
  const count = end - start;
  if (count === 1) return wasmIndex(shapes, start);
  if (count === 2) {
    return fuse(oc, shapes[start], shapes[start + 1], { ...options, simplify: false });
  }

  const mid = start + Math.ceil(count / 2);
  const left = fuseAllPairwiseRange(oc, shapes, start, mid, options);
  const right = fuseAllPairwiseRange(oc, shapes, mid, end, options);
  return fuse(oc, left, right, { ...options, simplify: false });
}

/**
 * Fuses multiple shapes using recursive pairwise fusion.
 */
function fuseAllPairwise(
  oc: KernelInstance,
  shapes: KernelShape[],
  options: BooleanOptions = {}
): KernelShape {
  const result = fuseAllPairwiseRange(oc, shapes, 0, shapes.length, options);
  // Apply simplify only at the end if requested
  if (options.simplify) {
    const upgrader = new oc.ShapeUpgrade_UnifySameDomain_2(result, true, true, false);
    upgrader.Build();
    const simplified = upgrader.Shape();
    upgrader.delete();
    return simplified;
  }
  return result;
}

/**
 * Fuses all given shapes in a single operation.
 */
export function fuseAll(
  oc: KernelInstance,
  shapes: KernelShape[],
  options: BooleanOptions = {}
): KernelShape {
  if (shapes.length === 0) throw new Error('fuseAll requires at least one shape');
  if (shapes.length === 1) return wasmIndex(shapes, 0);

  const { strategy = 'native' } = options;
  if (strategy === 'pairwise') {
    return fuseAllPairwise(oc, shapes, options);
  }

  return fuseAllNative(oc, shapes, options);
}

/**
 * Splits a shape using one or more tool shapes via BRepAlgoAPI_Splitter.
 * The result contains all the pieces from the split.
 */
export function split(oc: KernelInstance, shape: KernelShape, tools: KernelShape[]): KernelShape {
  if (!oc.BRepAlgoAPI_Splitter) {
    throw new Error('BRepAlgoAPI_Splitter not available in this WASM build');
  }

  const argList = new oc.TopTools_ListOfShape_1();
  argList.Append_1(shape);

  const toolList = new oc.TopTools_ListOfShape_1();
  for (const tool of tools) {
    toolList.Append_1(tool);
  }

  const splitter = new oc.BRepAlgoAPI_Splitter();
  splitter.SetArguments(argList);
  splitter.SetTools(toolList);
  applyBooleanDefaults(splitter);

  const progress = new oc.Message_ProgressRange_1();
  splitter.Build(progress);

  const result = splitter.Shape();
  splitter.delete();
  progress.delete();
  argList.delete();
  toolList.delete();
  return result;
}

/**
 * Cuts all tool shapes from a base shape.
 */
export function cutAll(
  oc: KernelInstance,
  shape: KernelShape,
  tools: KernelShape[],
  options: BooleanOptions = {}
): KernelShape {
  if (tools.length === 0) return shape;

  // Try C++ batch path first (single WASM call with parallel + OBB)
  const cppResult = cppCutAll(oc, shape, tools, options);
  if (cppResult !== null) return cppResult;

  // JS fallback — compound tool then single cut
  // Note: cut() already calls perfTimer('boolean') internally
  const toolCompound = buildCompound(oc, tools);
  const result = cut(oc, shape, toolCompound, options);
  toolCompound.delete();
  return result;
}

/**
 * Pre-validate operands before a boolean operation.
 *
 * Checks that both shapes are non-null and topologically valid.
 */
export function checkBoolean(
  _oc: KernelInstance,
  shape: KernelShape,
  tool: KernelShape,
  // op is accepted for future use (e.g., operation-specific validation)
  // but currently all boolean operations share the same pre-validation checks
  _op: BooleanOpType,
  isValid: (s: KernelShape) => boolean
): CheckBooleanResult {
  const issues: BooleanIssue[] = [];
  if (shape.IsNull()) {
    issues.push({ operand: 'base', issue: 'null-shape', message: 'Base shape is null' });
  }
  if (tool.IsNull()) {
    issues.push({ operand: 'tool', issue: 'null-shape', message: 'Tool shape is null' });
  }
  if (issues.length > 0) return { valid: false, issues };
  if (!isValid(shape)) {
    issues.push({
      operand: 'base',
      issue: 'not-valid',
      message: 'Base shape fails BRepCheck validation. Try autoHeal() first.',
    });
  }
  if (!isValid(tool)) {
    issues.push({
      operand: 'tool',
      issue: 'not-valid',
      message: 'Tool shape fails BRepCheck validation. Try autoHeal() first.',
    });
  }
  return { valid: issues.length === 0, issues };
}

/** Co-located factory: returns the boolean-ops slice of {@link KernelAdapter} bound to `oc`. */
export function makeBooleanOps(oc: KernelInstance) {
  return {
    fuse: (shape, tool, options) => fuse(oc, shape, tool, options),
    cut: (shape, tool, options) => cut(oc, shape, tool, options),
    intersect: (shape, tool, options) => intersect(oc, shape, tool, options),
    section: (shape, plane, approximation) => section(oc, shape, plane, approximation),
    fuseAll: (shapes, options) => fuseAll(oc, shapes, options),
    cutAll: (shape, tools, options) => cutAll(oc, shape, tools, options),
    split: (shape, tools) => split(oc, shape, tools),
    checkBoolean: (shape, tool, op) => checkBoolean(oc, shape, tool, op, (s) => isValid(oc, s)),
  } satisfies Pick<
    KernelAdapter,
    'fuse' | 'cut' | 'intersect' | 'section' | 'fuseAll' | 'cutAll' | 'split' | 'checkBoolean'
  >;
}
