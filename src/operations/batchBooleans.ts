/**
 * Batch boolean operations: fuseAll, cutAll.
 * Ported from replicad's shapes.ts additions.
 */

import { getKernel } from '../kernel/index.js';
import { GCWithScope } from '../core/memory.js';
import type { OcType } from '../kernel/types.js';
import { applyGlue, buildCompoundOc, type BooleanOperationOptions } from '../topology/shapes.js';

export function fuseAllShapes(
  shapes: OcType[],
  { optimisation = 'none', simplify = true }: BooleanOperationOptions = {}
): OcType {
  if (shapes.length === 0) throw new Error('fuseAll requires at least one shape');
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  if (shapes.length === 1) return shapes[0]!;

  const oc = getKernel().oc;
  const r = GCWithScope();

  const mid = Math.ceil(shapes.length / 2);
  const leftCompound = r(buildCompoundOc(shapes.slice(0, mid)));
  const rightCompound = r(buildCompoundOc(shapes.slice(mid)));

  const progress = r(new oc.Message_ProgressRange_1());
  const fuseOp = r(new oc.BRepAlgoAPI_Fuse_3(leftCompound, rightCompound, progress));
  applyGlue(fuseOp, optimisation);
  fuseOp.Build(progress);
  if (simplify) {
    fuseOp.SimplifyResult(true, true, 1e-3);
  }

  return fuseOp.Shape();
}

export function cutAllShapes(
  base: OcType,
  tools: OcType[],
  { optimisation = 'none', simplify = true }: BooleanOperationOptions = {}
): OcType {
  if (tools.length === 0) return base;

  const oc = getKernel().oc;
  const r = GCWithScope();

  const toolCompound = r(buildCompoundOc(tools));

  const progress = r(new oc.Message_ProgressRange_1());
  const cutOp = r(new oc.BRepAlgoAPI_Cut_3(base, toolCompound, progress));
  applyGlue(cutOp, optimisation);
  cutOp.Build(progress);
  if (simplify) {
    cutOp.SimplifyResult(true, true, 1e-3);
  }

  return cutOp.Shape();
}
