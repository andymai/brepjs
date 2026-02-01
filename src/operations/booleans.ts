/**
 * Standalone boolean operation functions.
 * Shape classes delegate to these for fuse/cut/intersect.
 * Ported from replicad's shapes.ts boolean sections.
 */

import { getKernel } from '../kernel/index.js';
import { GCWithScope } from '../core/memory.js';
import type { OcType } from '../kernel/types.js';

export interface BooleanOperationOptions {
  optimisation?: 'none' | 'commonFace' | 'sameFace';
  simplify?: boolean;
}

function applyGlue(
  op: { SetGlue(glue: OcType): void },
  optimisation: 'none' | 'commonFace' | 'sameFace'
): void {
  const oc = getKernel().oc;
  if (optimisation === 'commonFace') {
    op.SetGlue(oc.BOPAlgo_GlueEnum.BOPAlgo_GlueShift);
  }
  if (optimisation === 'sameFace') {
    op.SetGlue(oc.BOPAlgo_GlueEnum.BOPAlgo_GlueFull);
  }
}

export function fuseShapes(
  shape: OcType,
  tool: OcType,
  { optimisation = 'none', simplify = true }: BooleanOperationOptions = {}
): OcType {
  const r = GCWithScope();
  const oc = getKernel().oc;
  const progress = r(new oc.Message_ProgressRange_1());
  const newBody = r(new oc.BRepAlgoAPI_Fuse_3(shape, tool, progress));
  applyGlue(newBody, optimisation);
  newBody.Build(progress);
  if (simplify) {
    newBody.SimplifyResult(true, true, 1e-3);
  }
  return newBody.Shape();
}

export function cutShapes(
  shape: OcType,
  tool: OcType,
  { optimisation = 'none', simplify = true }: BooleanOperationOptions = {}
): OcType {
  const r = GCWithScope();
  const oc = getKernel().oc;
  const progress = r(new oc.Message_ProgressRange_1());
  const cutter = r(new oc.BRepAlgoAPI_Cut_3(shape, tool, progress));
  applyGlue(cutter, optimisation);
  cutter.Build(progress);
  if (simplify) {
    cutter.SimplifyResult(true, true, 1e-3);
  }
  return cutter.Shape();
}

export function intersectShapes(
  shape: OcType,
  tool: OcType,
  { simplify = true }: { simplify?: boolean } = {}
): OcType {
  const r = GCWithScope();
  const oc = getKernel().oc;
  const progress = r(new oc.Message_ProgressRange_1());
  const intersector = r(new oc.BRepAlgoAPI_Common_3(shape, tool, progress));
  intersector.Build(progress);
  if (simplify) {
    intersector.SimplifyResult(true, true, 1e-3);
  }
  return intersector.Shape();
}
