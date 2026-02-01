/**
 * Batch boolean operations: fuseAll, cutAll.
 * Ported from replicad's shapes.ts additions.
 */

import { getKernel } from '../kernel/index.js';
import { GCWithScope } from '../core/memory.js';
import type { OcType } from '../kernel/types.js';
import type { BooleanOperationOptions } from './booleans.js';

function buildCompound(shapes: OcType[]): OcType {
  const oc = getKernel().oc;
  const builder = new oc.TopoDS_Builder();
  const compound = new oc.TopoDS_Compound();
  builder.MakeCompound(compound);
  shapes.forEach((s: OcType) => {
    builder.Add(compound, s);
  });
  return compound;
}

function applyGlue(op: { SetGlue(glue: OcType): void }, optimisation: string): void {
  const oc = getKernel().oc;
  if (optimisation === 'commonFace') {
    op.SetGlue(oc.BOPAlgo_GlueEnum.BOPAlgo_GlueShift);
  }
  if (optimisation === 'sameFace') {
    op.SetGlue(oc.BOPAlgo_GlueEnum.BOPAlgo_GlueFull);
  }
}

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
  const leftCompound = r(buildCompound(shapes.slice(0, mid)));
  const rightCompound = r(buildCompound(shapes.slice(mid)));

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

  const toolCompound = r(buildCompound(tools));

  const progress = r(new oc.Message_ProgressRange_1());
  const cutOp = r(new oc.BRepAlgoAPI_Cut_3(base, toolCompound, progress));
  applyGlue(cutOp, optimisation);
  cutOp.Build(progress);
  if (simplify) {
    cutOp.SimplifyResult(true, true, 1e-3);
  }

  return cutOp.Shape();
}
