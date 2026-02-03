/**
 * Boolean operations for shapes — standalone functions for fuse/cut operations.
 *
 * These functions are re-exported from shapes.ts for backward compatibility.
 */

import type { OcShape, OcType } from '../kernel/types.js';
import { getKernel } from '../kernel/index.js';
import { gcWithScope } from '../core/memory.js';
import { typeCastError, validationError } from '../core/errors.js';
import { type Result, ok, err, isErr, andThen } from '../core/result.js';
import { cast } from './cast.js';
import type { Shape3D, AnyShape, BooleanOperationOptions } from './shapes.js';

// ---------------------------------------------------------------------------
// Internal: isShape3D check (avoids circular import from shapes.ts)
// ---------------------------------------------------------------------------

function isShape3DInternal(shape: AnyShape): shape is Shape3D {
  // Check by constructor name to avoid importing concrete classes
  const name = shape.constructor.name;
  return name === 'Shell' || name === 'Solid' || name === 'CompSolid' || name === 'Compound';
}

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

/**
 * Builds a TopoDS_Compound from Shape3D instances.
 */
export function buildCompound(shapes: Shape3D[]): OcShape {
  return buildCompoundOc(shapes.map((s) => s.wrapped));
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

// ---------------------------------------------------------------------------
// Batch boolean operations
// ---------------------------------------------------------------------------

/**
 * Fuses all given shapes in a single boolean operation.
 *
 * @category Boolean Operations
 */
export function fuseAll(
  shapes: Shape3D[],
  { optimisation = 'none', simplify = false, strategy = 'native' }: BooleanOperationOptions = {}
): Result<Shape3D> {
  if (shapes.length === 0)
    return err(validationError('FUSE_ALL_EMPTY', 'fuseAll requires at least one shape'));
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  if (shapes.length === 1) return ok(shapes[0]!);

  if (strategy === 'native') {
    // Delegate to kernel's native N-way fuse via BRepAlgoAPI_BuilderAlgo
    const result = getKernel().fuseAll(
      shapes.map((s) => s.wrapped),
      { optimisation, simplify, strategy }
    );
    return andThen(cast(result), (newShape) => {
      if (!isShape3DInternal(newShape))
        return err(typeCastError('FUSE_ALL_NOT_3D', 'fuseAll did not produce a 3D shape'));
      return ok(newShape);
    });
  }

  // Pairwise fallback: recursive divide-and-conquer
  // Defer simplification to the final fuse — intermediate simplification is wasted work.
  const mid = Math.ceil(shapes.length / 2);
  const leftResult = fuseAll(shapes.slice(0, mid), { optimisation, simplify: false, strategy });
  if (isErr(leftResult)) return leftResult;
  const rightResult = fuseAll(shapes.slice(mid), { optimisation, simplify: false, strategy });
  if (isErr(rightResult)) return rightResult;

  return leftResult.value.fuse(rightResult.value, { optimisation, simplify });
}

/**
 * Cuts all tool shapes from the base shape in a single boolean operation.
 *
 * @category Boolean Operations
 */
export function cutAll(
  base: Shape3D,
  tools: Shape3D[],
  { optimisation = 'none', simplify = false }: BooleanOperationOptions = {}
): Result<Shape3D> {
  if (tools.length === 0) return ok(base);

  const oc = getKernel().oc;
  const r = gcWithScope();

  const toolCompound = r(buildCompound(tools));

  const progress = r(new oc.Message_ProgressRange_1());
  const cutOp = r(new oc.BRepAlgoAPI_Cut_3(base.wrapped, toolCompound, progress));
  applyGlue(cutOp, optimisation);
  cutOp.Build(progress);
  if (simplify) {
    cutOp.SimplifyResult(true, true, 1e-3);
  }

  return andThen(cast(cutOp.Shape()), (newShape) => {
    if (!isShape3DInternal(newShape))
      return err(typeCastError('CUT_ALL_NOT_3D', 'cutAll did not produce a 3D shape'));
    return ok(newShape);
  });
}
