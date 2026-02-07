import { getKernel } from '../kernel/index.js';
import { gcWithScope } from '../core/memory.js';
import type { OcType } from '../kernel/types.js';
import {
  applyGlue,
  buildCompoundOc,
  type BooleanOperationOptions,
} from '../topology/shapeBooleans.js';
import { type Result, ok, err } from '../core/result.js';
import { validationError, occtError } from '../core/errors.js';

/**
 * Fuse an array of shapes into a single united shape.
 *
 * Uses divide-and-conquer when strategy is `'pairwise'`, or delegates to the
 * kernel's N-way `BRepAlgoAPI_BuilderAlgo` when strategy is `'native'`.
 *
 * @deprecated Use `fuseAll` from `booleanFns` instead, which operates on branded Shape3D types.
 * @param shapes - Shapes to fuse together (must contain at least one).
 * @returns `Result` containing the fused shape, or an error if the array is empty or the operation fails.
 *
 * @see {@link cutAllShapes} for the subtraction counterpart.
 */
export function fuseAllShapes(
  shapes: OcType[],
  { optimisation = 'none', simplify = false, strategy = 'native' }: BooleanOperationOptions = {}
): Result<OcType> {
  if (shapes.length === 0)
    return err(validationError('FUSE_ALL_EMPTY', 'fuseAll requires at least one shape'));

  if (shapes.length === 1) return ok(shapes[0]);

  if (strategy === 'native') {
    // Delegate to kernel's native N-way fuse via BRepAlgoAPI_BuilderAlgo
    const result = getKernel().fuseAll(shapes, { optimisation, simplify, strategy });
    return ok(result);
  }

  // Pairwise fallback: recursive divide-and-conquer
  // Defer simplification to the final fuse — intermediate simplification is wasted work
  const oc = getKernel().oc;
  const r = gcWithScope();

  const mid = Math.ceil(shapes.length / 2);
  const leftResult = fuseAllShapes(shapes.slice(0, mid), {
    optimisation,
    simplify: false,
    strategy,
  });
  if (!leftResult.ok) return leftResult;
  const rightResult = fuseAllShapes(shapes.slice(mid), { optimisation, simplify: false, strategy });
  if (!rightResult.ok) return rightResult;

  const progress = r(new oc.Message_ProgressRange_1());
  const fuseOp = r(new oc.BRepAlgoAPI_Fuse_3(leftResult.value, rightResult.value, progress));
  applyGlue(fuseOp, optimisation);
  fuseOp.Build(progress);

  if (!fuseOp.IsDone()) {
    return err(occtError('FUSE_FAILED', 'Boolean fuse operation failed'));
  }

  if (simplify) {
    fuseOp.SimplifyResult(true, true, 1e-3);
  }

  return ok(fuseOp.Shape());
}

/**
 * Subtract an array of tool shapes from a base shape.
 *
 * Builds a compound from all tools and performs a single boolean cut against the base.
 * Returns the base unchanged when the tools array is empty.
 *
 * @deprecated Use `cutAll` from `booleanFns` instead, which operates on branded Shape3D types.
 * @param base - The shape to cut from.
 * @param tools - Shapes to subtract from the base.
 * @returns `Result` containing the cut shape, or an error if the operation fails.
 *
 * @see {@link fuseAllShapes} for the union counterpart.
 */
export function cutAllShapes(
  base: OcType,
  tools: OcType[],
  { optimisation = 'none', simplify = false }: BooleanOperationOptions = {}
): Result<OcType> {
  if (tools.length === 0) return ok(base);

  const oc = getKernel().oc;
  const r = gcWithScope();

  const toolCompound = r(buildCompoundOc(tools));

  const progress = r(new oc.Message_ProgressRange_1());
  const cutOp = r(new oc.BRepAlgoAPI_Cut_3(base, toolCompound, progress));
  applyGlue(cutOp, optimisation);
  cutOp.Build(progress);

  if (!cutOp.IsDone()) {
    return err(occtError('CUT_FAILED', 'Boolean cut operation failed'));
  }

  if (simplify) {
    cutOp.SimplifyResult(true, true, 1e-3);
  }

  return ok(cutOp.Shape());
}
