import { getKernel } from '../kernel/index.js';
import { gcWithScope } from '../core/memory.js';
import type { OcType } from '../kernel/types.js';
import { applyGlue, buildCompoundOc, type BooleanOperationOptions } from '../topology/shapes.js';
import { type Result, ok, err } from '../core/result.js';
import { validationError } from '../core/errors.js';

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
  if (simplify) {
    fuseOp.SimplifyResult(true, true, 1e-3);
  }

  return ok(fuseOp.Shape());
}

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
  if (simplify) {
    cutOp.SimplifyResult(true, true, 1e-3);
  }

  return ok(cutOp.Shape());
}
