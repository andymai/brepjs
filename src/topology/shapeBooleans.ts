/**
 * Boolean operation helpers — compound builders and glue optimization.
 */

import type { OcShape, OcType } from '../kernel/types.js';
import { getKernel } from '../kernel/index.js';

/** Options for boolean operations (fuse, cut, intersect). */
export type BooleanOperationOptions = {
  optimisation?: 'none' | 'commonFace' | 'sameFace';
  simplify?: boolean;
  strategy?: 'native' | 'pairwise';
};

// ---------------------------------------------------------------------------
// Compound builders
// ---------------------------------------------------------------------------

/**
 * Builds a TopoDS_Compound from raw OCCT shape handles.
 * Used internally by both high-level (Shape3D[]) and low-level (OcType[]) APIs.
 */
export function buildCompoundOc(shapes: OcType[]): OcShape {
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

// ---------------------------------------------------------------------------
// Glue optimization helper
// ---------------------------------------------------------------------------

/**
 * Applies glue optimization to a boolean operation.
 *
 * @param op - Boolean operation builder with SetGlue method
 * @param optimisation - Optimization level: 'none', 'commonFace', or 'sameFace'
 */
export function applyGlue(
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
