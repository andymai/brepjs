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
import { validationError, typeCastError, occtError } from '../core/errors.js';
import type { Plane } from '../core/planeTypes.js';
import type { PlaneInput } from '../core/planeTypes.js';
import { resolvePlane } from '../core/planeOps.js';
import { vecAdd, vecScale } from '../core/vecOps.js';
import { applyGlue } from './shapeBooleans.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options shared by all boolean and compound operations. */
export interface BooleanOptions {
  /** Glue algorithm hint for faces shared between operands. */
  optimisation?: 'none' | 'commonFace' | 'sameFace';
  /** Merge same-domain faces/edges after the boolean. */
  simplify?: boolean;
  /** Algorithm selection: 'native' uses N-way BRepAlgoAPI_BuilderAlgo; 'pairwise' uses recursive divide-and-conquer. */
  strategy?: 'native' | 'pairwise';
  /** Abort signal to cancel long-running operations between steps. */
  signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

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
    // Include actual shape type in error for debugging
    const shapeType = shape.ShapeType();
    const typeNames = [
      'COMPOUND',
      'COMPSOLID',
      'SOLID',
      'SHELL',
      'FACE',
      'WIRE',
      'EDGE',
      'VERTEX',
      'SHAPE',
    ];
    const typeName = typeNames[shapeType] ?? `UNKNOWN(${shapeType})`;
    wrapped[Symbol.dispose]();
    return err(typeCastError(errorCode, `${errorMsg}. Got ${typeName} instead.`));
  }
  return ok(wrapped);
}

// ---------------------------------------------------------------------------
// Boolean operations
// ---------------------------------------------------------------------------

/**
 * Fuse two 3D shapes together (boolean union). Returns a new shape.
 *
 * @param a - The first operand.
 * @param b - The second operand.
 * @param options - Boolean operation options.
 * @returns Ok with the fused shape, or Err if the result is not 3D.
 *
 * @example
 * ```ts
 * const result = fuseShapes(box, cylinder);
 * if (isOk(result)) console.log(describeShape(result.value));
 * ```
 */
export function fuseShapes(
  a: Shape3D,
  b: Shape3D,
  { optimisation = 'none', simplify = false, signal }: BooleanOptions = {}
): Result<Shape3D> {
  if (signal?.aborted) throw signal.reason;
  const oc = getKernel().oc;
  const r = gcWithScope();
  const progress = r(new oc.Message_ProgressRange_1());
  const fuseOp = r(new oc.BRepAlgoAPI_Fuse_3(a.wrapped, b.wrapped, progress));
  applyGlue(fuseOp, optimisation);
  fuseOp.Build(progress);
  if (simplify) fuseOp.SimplifyResult(true, true, 1e-3);
  return castToShape3D(fuseOp.Shape(), 'FUSE_NOT_3D', 'Fuse did not produce a 3D shape');
}

/**
 * Cut a tool shape from a base shape (boolean subtraction). Returns a new shape.
 *
 * @param base - The shape to cut from.
 * @param tool - The shape to subtract.
 * @param options - Boolean operation options.
 * @returns Ok with the cut shape, or Err if the result is not 3D.
 *
 * @example
 * ```ts
 * const result = cutShape(box, hole);
 * ```
 */
export function cutShape(
  base: Shape3D,
  tool: Shape3D,
  { optimisation = 'none', simplify = false, signal }: BooleanOptions = {}
): Result<Shape3D> {
  if (signal?.aborted) throw signal.reason;
  const oc = getKernel().oc;
  const r = gcWithScope();
  const progress = r(new oc.Message_ProgressRange_1());
  const cutOp = r(new oc.BRepAlgoAPI_Cut_3(base.wrapped, tool.wrapped, progress));
  applyGlue(cutOp, optimisation);
  cutOp.Build(progress);
  if (simplify) cutOp.SimplifyResult(true, true, 1e-3);
  return castToShape3D(cutOp.Shape(), 'CUT_NOT_3D', 'Cut did not produce a 3D shape');
}

/**
 * Compute the intersection of two shapes (boolean common). Returns a new shape.
 *
 * @param a - The first operand.
 * @param b - The second operand.
 * @param options - Boolean operation options.
 * @returns Ok with the intersection, or Err if the result is not 3D.
 */
export function intersectShapes(
  a: Shape3D,
  b: Shape3D,
  { simplify = false, signal }: BooleanOptions = {}
): Result<Shape3D> {
  if (signal?.aborted) throw signal.reason;
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

/**
 * Internal helper for pairwise fuse using index ranges to avoid array allocations.
 */
function fuseAllPairwise(
  shapes: Shape3D[],
  start: number,
  end: number,
  optimisation: 'none' | 'commonFace' | 'sameFace',
  simplify: boolean,
  isTopLevel: boolean,
  signal?: AbortSignal
): Result<Shape3D> {
  if (signal?.aborted) throw signal.reason;
  const count = end - start;
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- start is valid index
  if (count === 1) return ok(shapes[start]!);
  if (count === 2) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- start and start+1 are valid indices
    return fuseShapes(shapes[start]!, shapes[start + 1]!, {
      optimisation,
      simplify: isTopLevel ? simplify : false,
      ...(signal ? { signal } : {}),
    });
  }

  const mid = start + Math.ceil(count / 2);
  const leftResult = fuseAllPairwise(shapes, start, mid, optimisation, simplify, false, signal);
  if (isErr(leftResult)) return leftResult;
  const rightResult = fuseAllPairwise(shapes, mid, end, optimisation, simplify, false, signal);
  if (isErr(rightResult)) return rightResult;

  return fuseShapes(leftResult.value, rightResult.value, {
    optimisation,
    simplify: isTopLevel ? simplify : false,
    ...(signal ? { signal } : {}),
  });
}

/**
 * Fuse all shapes in a single boolean operation.
 *
 * With `strategy: 'native'` (default), uses N-way BRepAlgoAPI_BuilderAlgo.
 * With `strategy: 'pairwise'`, uses recursive divide-and-conquer.
 *
 * @param shapes - Array of 3D shapes to fuse (at least one required).
 * @param options - Boolean operation options.
 * @returns Ok with the fused shape, or Err if the array is empty or the result is not 3D.
 *
 * @example
 * ```ts
 * const result = fuseAll([box1, box2, box3], { simplify: true });
 * ```
 */
export function fuseAll(
  shapes: Shape3D[],
  { optimisation = 'none', simplify = false, strategy = 'native', signal }: BooleanOptions = {}
): Result<Shape3D> {
  if (signal?.aborted) throw signal.reason;
  if (shapes.length === 0)
    return err(validationError('FUSE_ALL_EMPTY', 'fuseAll requires at least one shape'));
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  if (shapes.length === 1) return ok(shapes[0]!);

  if (strategy === 'native') {
    // Delegate to kernel's native N-way fuse via BRepAlgoAPI_BuilderAlgo
    const result = getKernel().fuseAll(
      shapes.map((s) => s.wrapped),
      { optimisation, simplify, strategy, ...(signal ? { signal } : {}) }
    );
    return castToShape3D(result, 'FUSE_ALL_NOT_3D', 'fuseAll did not produce a 3D shape');
  }

  // Pairwise fallback: recursive divide-and-conquer with index ranges
  // Uses index ranges instead of slice() to avoid array allocations
  return fuseAllPairwise(shapes, 0, shapes.length, optimisation, simplify, true, signal);
}

/**
 * Cut all tool shapes from a base shape in a single boolean operation.
 *
 * Combines all tools into a compound before cutting to avoid accumulated
 * floating-point drift from sequential pair-wise cuts.
 *
 * @param base - The shape to cut from.
 * @param tools - Array of tool shapes to subtract.
 * @param options - Boolean operation options.
 * @returns Ok with the cut shape, or the base shape unchanged if tools is empty.
 */
export function cutAll(
  base: Shape3D,
  tools: Shape3D[],
  { optimisation = 'none', simplify = false, signal }: BooleanOptions = {}
): Result<Shape3D> {
  if (signal?.aborted) throw signal.reason;
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
// Section (cross-section / slicing)
// ---------------------------------------------------------------------------

/**
 * Build a large bounded planar face from a Plane definition.
 * The face extends ±size along xDir and yDir from the origin.
 */
function makeSectionFace(plane: Plane, size: number): OcType {
  const oc = getKernel().oc;

  // Compute 4 corners of a large rectangle on the plane
  const hx = vecScale(plane.xDir, size);
  const hy = vecScale(plane.yDir, size);
  const nhx = vecScale(plane.xDir, -size);
  const nhy = vecScale(plane.yDir, -size);
  const o = plane.origin;
  const corners = [
    vecAdd(vecAdd(o, nhx), nhy),
    vecAdd(vecAdd(o, hx), nhy),
    vecAdd(vecAdd(o, hx), hy),
    vecAdd(vecAdd(o, nhx), hy),
  ];

  // Build 4 OCCT points
  const pts = corners.map((c) => new oc.gp_Pnt_3(c[0], c[1], c[2]));

  // Build 4 edges forming a closed rectangle
  const edges = [
    new oc.BRepBuilderAPI_MakeEdge_3(pts[0], pts[1]),
    new oc.BRepBuilderAPI_MakeEdge_3(pts[1], pts[2]),
    new oc.BRepBuilderAPI_MakeEdge_3(pts[2], pts[3]),
    new oc.BRepBuilderAPI_MakeEdge_3(pts[3], pts[0]),
  ];

  // Build wire from edges
  const wireBuilder = new oc.BRepBuilderAPI_MakeWire_1();
  for (const e of edges) {
    const edge = e.Edge();
    wireBuilder.Add_1(edge);
    edge.delete();
  }
  const progress = new oc.Message_ProgressRange_1();
  wireBuilder.Build(progress);
  const wire = wireBuilder.Wire();

  // Build planar face from wire
  const faceBuilder = new oc.BRepBuilderAPI_MakeFace_15(wire, true);
  const face = faceBuilder.Face();

  // Cleanup temporaries
  faceBuilder.delete();
  wire.delete();
  wireBuilder.delete();
  progress.delete();
  for (const e of edges) e.delete();
  for (const p of pts) p.delete();

  return face;
}

/**
 * Section (cross-section) a shape with a plane, returning the intersection
 * edges and wires. Useful for slicing solids to get 2D cross-section profiles.
 *
 * @param shape The shape to section (typically a solid or shell)
 * @param plane Plane definition — a named plane ("XY", "XZ", etc.) or a Plane object
 * @param options.approximation Whether to approximate the section curves (default true)
 * @param options.planeSize Half-size of the cutting plane (default 1e4)
 * @returns The section result as a shape (typically containing wires/edges)
 */
export function sectionShape(
  shape: AnyShape,
  plane: PlaneInput,
  { approximation = true, planeSize = 1e4 }: { approximation?: boolean; planeSize?: number } = {}
): Result<AnyShape> {
  const resolvedPlane: Plane = typeof plane === 'string' ? resolvePlane(plane) : plane;
  const sectionFace = makeSectionFace(resolvedPlane, planeSize);

  try {
    const kernel = getKernel();
    const resultOc = kernel.section(shape.wrapped, sectionFace, approximation);
    const wrapped = castShape(resultOc);
    return ok(wrapped);
  } catch (e) {
    return err(
      occtError(
        'SECTION_FAILED',
        `Section operation failed: ${e instanceof Error ? e.message : String(e)}`
      )
    );
  } finally {
    sectionFace.delete();
  }
}

// ---------------------------------------------------------------------------
// Splitting
// ---------------------------------------------------------------------------

/**
 * Split a shape with one or more tool shapes using BRepAlgoAPI_Splitter.
 * Returns all pieces from the split as a compound.
 */
export function splitShape(shape: AnyShape, tools: AnyShape[]): Result<AnyShape> {
  if (tools.length === 0) return ok(shape);

  try {
    const result = getKernel().split(
      shape.wrapped,
      tools.map((t) => t.wrapped)
    );
    return ok(castShape(result));
  } catch (e) {
    return err(
      occtError(
        'SPLIT_FAILED',
        `Split operation failed: ${e instanceof Error ? e.message : String(e)}`
      )
    );
  }
}

// ---------------------------------------------------------------------------
// Batch slicing
// ---------------------------------------------------------------------------

/**
 * Slice a shape with multiple planes, returning one cross-section per plane.
 * Each result entry corresponds to the input plane at the same index.
 */
export function sliceShape(
  shape: AnyShape,
  planes: PlaneInput[],
  options: { approximation?: boolean; planeSize?: number } = {}
): Result<AnyShape[]> {
  const results: AnyShape[] = [];
  for (const plane of planes) {
    const section = sectionShape(shape, plane, options);
    if (isErr(section)) return section as Result<AnyShape[]>;
    results.push(section.value);
  }
  return ok(results);
}

// ---------------------------------------------------------------------------
// Compound building
// ---------------------------------------------------------------------------

/**
 * Build a compound from multiple shapes.
 *
 * @param shapes - Shapes to group into a single compound.
 * @returns A new Compound containing all input shapes.
 */
export function buildCompound(shapes: AnyShape[]): Compound {
  const compound = buildCompoundOcInternal(shapes.map((s) => s.wrapped));
  return createCompound(compound);
}
