/**
 * Boolean and compound operations — functional replacements for _3DShape boolean methods.
 * All functions are immutable: they return new shapes without disposing inputs.
 */

import { getKernel } from '../kernel/index.js';
import type { AnyShape, Dimension, Face, Shape3D, Wire } from '../core/shapeTypes.js';
import { castShape, isShape3D } from '../core/shapeTypes.js';
import { type Result, ok, err, isErr } from '../core/result.js';
import { validationError, typeCastError, kernelError, BrepErrorCode } from '../core/errors.js';
import type { Plane } from '../core/planeTypes.js';
import type { PlaneInput } from '../core/planeTypes.js';
import { resolvePlane } from '../core/planeOps.js';
import { vecAdd, vecScale } from '../core/vecOps.js';
import { HASH_CODE_MAX } from '../core/constants.js';
import {
  propagateOriginsFromEvolution,
  propagateOriginsByHash,
  getFaceOrigins,
  getWires,
  getEdges,
  getVertices,
} from './shapeFns.js';
import { propagateFaceTagsFromEvolution, hasFaceTags } from './faceTagFns.js';
import { propagateColorsFromEvolution, hasColorMetadata } from './colorFns.js';
import { makeFace } from './surfaceBuilders.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- kernel types are dynamic
type KernelType = any;

// ---------------------------------------------------------------------------
// Pre-validation
// ---------------------------------------------------------------------------

function validateShape3D(shape: Shape3D, label: string): Result<undefined> {
  if (getKernel().isNull(shape.wrapped)) {
    return err(validationError(BrepErrorCode.NULL_SHAPE_INPUT, `${label} is a null shape`));
  }
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

import type { BooleanOptions } from '../kernel/types.js';
export type { BooleanOptions };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildCompoundInternal(shapes: KernelType[]): KernelType {
  return getKernel().makeCompound(shapes);
}

function castToShape3D(shape: KernelType, errorCode: string, errorMsg: string): Result<Shape3D> {
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

/** Collect ALL face hashes from input shapes for WithHistory kernel methods.
 *  Fast-path: returns empty array when no inputs have metadata to propagate,
 *  avoiding expensive WASM topology exploration. */
function collectInputFaceHashes(inputs: AnyShape[]): number[] {
  // O(1) check: skip expensive face iteration when no metadata exists
  const hasMetadata = inputs.some(
    (s) => getFaceOrigins(s) !== undefined || hasFaceTags(s) || hasColorMetadata(s)
  );
  if (!hasMetadata) return [];

  const hashes: number[] = [];
  for (const input of inputs) {
    const faces = getKernel().iterShapes(input.wrapped, 'face');
    for (const face of faces) {
      hashes.push(face.HashCode(HASH_CODE_MAX));
    }
  }
  return hashes;
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
 * const result = fuse(box, cylinder);
 * if (isOk(result)) console.log(describe(result.value));
 * ```
 */
export function fuse(
  a: Shape3D,
  b: Shape3D,
  { optimisation = 'none', simplify = false, signal, fuzzyValue }: BooleanOptions = {}
): Result<Shape3D> {
  if (signal?.aborted) throw signal.reason;
  const checkA = validateShape3D(a, 'fuse: first operand');
  if (isErr(checkA)) return checkA;
  const checkB = validateShape3D(b, 'fuse: second operand');
  if (isErr(checkB)) return checkB;
  const inputFaceHashes = collectInputFaceHashes([a, b]);
  const { shape: resultShape, evolution } = getKernel().fuseWithHistory(
    a.wrapped,
    b.wrapped,
    inputFaceHashes,
    HASH_CODE_MAX,
    { optimisation, simplify, fuzzyValue }
  );
  const fuseResult = castToShape3D(resultShape, 'FUSE_NOT_3D', 'Fuse did not produce a 3D shape');
  if (fuseResult.ok) {
    propagateOriginsFromEvolution(evolution, [a, b], fuseResult.value);
    propagateFaceTagsFromEvolution(evolution, [a, b], fuseResult.value);
    propagateColorsFromEvolution(evolution, [a, b], fuseResult.value);
  }
  return fuseResult;
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
 * const result = cut(box, hole);
 * ```
 */
export function cut(
  base: Shape3D,
  tool: Shape3D,
  { optimisation = 'none', simplify = false, signal, fuzzyValue }: BooleanOptions = {}
): Result<Shape3D> {
  if (signal?.aborted) throw signal.reason;
  const checkBase = validateShape3D(base, 'cut: base');
  if (isErr(checkBase)) return checkBase;
  const checkTool = validateShape3D(tool, 'cut: tool');
  if (isErr(checkTool)) return checkTool;
  const inputFaceHashes = collectInputFaceHashes([base, tool]);
  const { shape: resultShape, evolution } = getKernel().cutWithHistory(
    base.wrapped,
    tool.wrapped,
    inputFaceHashes,
    HASH_CODE_MAX,
    { optimisation, simplify, fuzzyValue }
  );
  const cutResult = castToShape3D(resultShape, 'CUT_NOT_3D', 'Cut did not produce a 3D shape');
  if (cutResult.ok) {
    propagateOriginsFromEvolution(evolution, [base, tool], cutResult.value);
    propagateFaceTagsFromEvolution(evolution, [base, tool], cutResult.value);
    propagateColorsFromEvolution(evolution, [base, tool], cutResult.value);
  }
  return cutResult;
}

/**
 * Compute the intersection of two shapes (boolean common). Returns a new shape.
 *
 * @param a - The first operand.
 * @param b - The second operand.
 * @param options - Boolean operation options.
 * @returns Ok with the intersection, or Err if the result is not 3D.
 */
export function intersect(
  a: Shape3D,
  b: Shape3D,
  { simplify = false, signal, fuzzyValue }: BooleanOptions = {}
): Result<Shape3D> {
  if (signal?.aborted) throw signal.reason;
  const checkA = validateShape3D(a, 'intersect: first operand');
  if (isErr(checkA)) return checkA;
  const checkB = validateShape3D(b, 'intersect: second operand');
  if (isErr(checkB)) return checkB;
  const inputFaceHashes = collectInputFaceHashes([a, b]);
  const { shape: resultShape, evolution } = getKernel().intersectWithHistory(
    a.wrapped,
    b.wrapped,
    inputFaceHashes,
    HASH_CODE_MAX,
    { simplify, fuzzyValue }
  );
  const intResult = castToShape3D(
    resultShape,
    'INTERSECT_NOT_3D',
    'Intersect did not produce a 3D shape'
  );
  if (intResult.ok) {
    propagateOriginsFromEvolution(evolution, [a, b], intResult.value);
    propagateFaceTagsFromEvolution(evolution, [a, b], intResult.value);
    propagateColorsFromEvolution(evolution, [a, b], intResult.value);
  }
  return intResult;
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
  signal?: AbortSignal,
  fuzzyValue?: number
): Result<Shape3D> {
  if (signal?.aborted) throw signal.reason;
  const count = end - start;
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- start is valid index
  if (count === 1) return ok(shapes[start]!);
  if (count === 2) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- start and start+1 are valid indices
    return fuse(shapes[start]!, shapes[start + 1]!, {
      optimisation,
      simplify: isTopLevel ? simplify : false,
      fuzzyValue,
      ...(signal ? { signal } : {}),
    });
  }

  const mid = start + Math.ceil(count / 2);
  const leftResult = fuseAllPairwise(
    shapes,
    start,
    mid,
    optimisation,
    simplify,
    false,
    signal,
    fuzzyValue
  );
  if (isErr(leftResult)) return leftResult;
  const rightResult = fuseAllPairwise(
    shapes,
    mid,
    end,
    optimisation,
    simplify,
    false,
    signal,
    fuzzyValue
  );
  if (isErr(rightResult)) return rightResult;

  return fuse(leftResult.value, rightResult.value, {
    optimisation,
    simplify: isTopLevel ? simplify : false,
    fuzzyValue,
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
  {
    optimisation = 'none',
    simplify = false,
    strategy = 'native',
    signal,
    fuzzyValue,
  }: BooleanOptions = {}
): Result<Shape3D> {
  if (signal?.aborted) throw signal.reason;
  if (shapes.length === 0)
    return err(validationError('FUSE_ALL_EMPTY', 'fuseAll requires at least one shape'));
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length checked above
  if (shapes.length === 1) return ok(shapes[0]!);

  for (let i = 0; i < shapes.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- loop index is valid
    const check = validateShape3D(shapes[i]!, `fuseAll: shape at index ${i}`);
    if (isErr(check)) return check;
  }

  if (strategy === 'native') {
    // Delegate to kernel's native N-way fuse via BRepAlgoAPI_BuilderAlgo
    const result = getKernel().fuseAll(
      shapes.map((s) => s.wrapped),
      { optimisation, simplify, strategy, fuzzyValue, ...(signal ? { signal } : {}) }
    );
    const fuseAllResult = castToShape3D(
      result,
      'FUSE_ALL_NOT_3D',
      'fuseAll did not produce a 3D shape'
    );
    if (fuseAllResult.ok) {
      propagateOriginsByHash(shapes, fuseAllResult.value);
    }
    return fuseAllResult;
  }

  // Pairwise fallback: recursive divide-and-conquer with index ranges
  // Uses index ranges instead of slice() to avoid array allocations
  return fuseAllPairwise(
    shapes,
    0,
    shapes.length,
    optimisation,
    simplify,
    true,
    signal,
    fuzzyValue
  );
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
  { optimisation = 'none', simplify = false, signal, fuzzyValue }: BooleanOptions = {}
): Result<Shape3D> {
  if (signal?.aborted) throw signal.reason;
  if (tools.length === 0) return ok(base);

  const checkBase = validateShape3D(base, 'cutAll: base');
  if (isErr(checkBase)) return checkBase;
  for (let i = 0; i < tools.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- loop index is valid
    const check = validateShape3D(tools[i]!, `cutAll: tool at index ${i}`);
    if (isErr(check)) return check;
  }

  const toolCompound = buildCompoundInternal(tools.map((s) => s.wrapped));
  const allInputs = [base, ...tools];
  const inputFaceHashes = collectInputFaceHashes(allInputs);
  const { shape: resultShape, evolution } = getKernel().cutWithHistory(
    base.wrapped,
    toolCompound,
    inputFaceHashes,
    HASH_CODE_MAX,
    { optimisation, simplify, fuzzyValue }
  );
  // Dispose the temporary compound
  toolCompound.delete();
  const cutAllResult = castToShape3D(
    resultShape,
    'CUT_ALL_NOT_3D',
    'cutAll did not produce a 3D shape'
  );
  if (cutAllResult.ok) {
    propagateOriginsFromEvolution(evolution, allInputs, cutAllResult.value);
    propagateFaceTagsFromEvolution(evolution, allInputs, cutAllResult.value);
    propagateColorsFromEvolution(evolution, allInputs, cutAllResult.value);
  }
  return cutAllResult;
}

// ---------------------------------------------------------------------------
// Section (cross-section / slicing)
// ---------------------------------------------------------------------------

/**
 * Build a large bounded planar face from a Plane definition.
 * The face extends +/-size along xDir and yDir from the origin.
 */
function makeSectionFace(plane: Plane, size: number): KernelType {
  const kernel = getKernel();

  // Compute 4 corners of a large rectangle on the plane
  const hx = vecScale(plane.xDir, size);
  const hy = vecScale(plane.yDir, size);
  const nhx = vecScale(plane.xDir, -size);
  const nhy = vecScale(plane.yDir, -size);
  const o = plane.origin;
  const c0: [number, number, number] = [...vecAdd(vecAdd(o, nhx), nhy)];
  const c1: [number, number, number] = [...vecAdd(vecAdd(o, hx), nhy)];
  const c2: [number, number, number] = [...vecAdd(vecAdd(o, hx), hy)];
  const c3: [number, number, number] = [...vecAdd(vecAdd(o, nhx), hy)];

  // Build 4 edges forming a closed rectangle
  const edges = [
    kernel.makeLineEdge(c0, c1),
    kernel.makeLineEdge(c1, c2),
    kernel.makeLineEdge(c2, c3),
    kernel.makeLineEdge(c3, c0),
  ];

  // Build wire from edges, then face
  const wire = kernel.makeWire(edges);
  const face = kernel.makeFace(wire, true);

  // Cleanup temporaries
  for (const e of edges) e.delete();
  wire.delete();

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
export function section(
  shape: AnyShape<Dimension>,
  plane: PlaneInput,
  { approximation = true, planeSize = 1e4 }: { approximation?: boolean; planeSize?: number } = {}
): Result<AnyShape<Dimension>> {
  if (getKernel().isNull(shape.wrapped)) {
    return err(validationError(BrepErrorCode.NULL_SHAPE_INPUT, 'section: shape is a null shape'));
  }

  const resolvedPlane: Plane = typeof plane === 'string' ? resolvePlane(plane) : plane;
  const sectionFace = makeSectionFace(resolvedPlane, planeSize);

  try {
    const kernel = getKernel();
    const resultOc = kernel.section(shape.wrapped, sectionFace, approximation);
    const wrapped = castShape(resultOc);
    return ok(wrapped);
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    const planeName = typeof plane === 'string' ? plane : 'custom';
    return err(
      kernelError('SECTION_FAILED', `Section with ${planeName} plane failed: ${raw}`, e, {
        operation: 'section',
        plane: planeName,
      })
    );
  } finally {
    sectionFace.delete();
  }
}

/**
 * Section a shape with a plane and return a filled Face.
 * The outermost wire (largest bounding-box area) becomes the outer boundary;
 * any remaining wires are treated as holes.
 */
export function sectionToFace(
  shape: AnyShape<Dimension>,
  plane: PlaneInput,
  options: { approximation?: boolean; planeSize?: number } = {}
): Result<Face> {
  const sectionResult = section(shape, plane, options);
  if (!sectionResult.ok) return sectionResult;

  const wires = getWires(sectionResult.value);
  if (wires.length === 0) {
    // Section may return loose edges — assemble them into wires
    const edges = getEdges(sectionResult.value);
    if (edges.length === 0) {
      return err(kernelError('SECTION_FAILED', 'sectionToFace: section produced no geometry'));
    }
    const kernel = getKernel();

    // Build vertex-hash -> edge adjacency map for O(n) wire assembly
    // (replaces the previous O(n^3) probe-builder approach)
    const vertexToEdges = new Map<number, typeof edges>();
    const edgeVertexHashes = new Map<(typeof edges)[number], [number, number]>();
    for (const edge of edges) {
      const verts = getVertices(edge);
      const h0 = verts[0] ? getKernel().hashCode(verts[0].wrapped, HASH_CODE_MAX) : -1;
      const h1 =
        verts.length > 1 && verts[1] ? getKernel().hashCode(verts[1].wrapped, HASH_CODE_MAX) : h0;
      edgeVertexHashes.set(edge, [h0, h1]);
      for (const h of [h0, h1]) {
        const bucket = vertexToEdges.get(h) ?? [];
        bucket.push(edge);
        vertexToEdges.set(h, bucket);
      }
    }

    // Walk connected components via adjacency map
    const visited = new Set<(typeof edges)[number]>();
    for (const startEdge of edges) {
      if (visited.has(startEdge)) continue;
      const wireEdges = [startEdge];
      visited.add(startEdge);

      // Walk from both endpoints of the growing chain
      const hashes = edgeVertexHashes.get(startEdge);
      if (!hashes) continue;
      const endpoints = [hashes[1], hashes[0]]; // [forward tip, backward tip]
      for (let dir = 0; dir < 2; dir++) {
        let tip = endpoints[dir];
        if (tip === undefined) continue;
        let found = true;
        while (found) {
          found = false;
          const bucket = vertexToEdges.get(tip);
          if (!bucket) break;
          for (const candidate of bucket) {
            if (visited.has(candidate)) continue;
            const ch = edgeVertexHashes.get(candidate);
            if (!ch) continue;
            visited.add(candidate);
            if (dir === 0) wireEdges.push(candidate);
            else wireEdges.unshift(candidate);
            // Advance tip to the other endpoint of the candidate
            tip = ch[0] === tip ? ch[1] : ch[0];
            found = true;
            break;
          }
        }
      }

      // Build wire from collected edges via kernel
      try {
        const wireOc = kernel.makeWire(wireEdges.map((e) => e.wrapped));
        wires.push(castShape(wireOc) as Wire);
      } catch {
        // Skip malformed wire components
      }
    }
  }
  if (wires.length === 0) {
    return err(kernelError('SECTION_FAILED', 'sectionToFace: section produced no usable geometry'));
  }

  // Find outermost wire (largest bounding box diagonal — works for any plane orientation)
  let outerIdx = 0;
  let maxDiag = -1;
  for (let i = 0; i < wires.length; i++) {
    const w = wires[i];
    if (!w) continue;
    const bb = getKernel().boundingBox(w.wrapped);
    const dx = bb.max[0] - bb.min[0];
    const dy = bb.max[1] - bb.min[1];
    const dz = bb.max[2] - bb.min[2];
    const diag = dx * dx + dy * dy + dz * dz;
    if (diag > maxDiag) {
      maxDiag = diag;
      outerIdx = i;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- outerIdx set from valid wires index
  const outer = wires[outerIdx]!;
  const holes = wires.filter((_, i) => i !== outerIdx);
  // Section results are always 3D — safe to narrow from Face<Dimension> to Face
  return makeFace(outer, holes.length > 0 ? holes : undefined) as Result<Face>;
}

// ---------------------------------------------------------------------------
// Splitting
// ---------------------------------------------------------------------------

/**
 * Split a shape with one or more tool shapes using BRepAlgoAPI_Splitter.
 * Returns all pieces from the split as a compound.
 */
export function split(
  shape: AnyShape<Dimension>,
  tools: AnyShape<Dimension>[]
): Result<AnyShape<Dimension>> {
  if (tools.length === 0) return ok(shape);

  if (getKernel().isNull(shape.wrapped)) {
    return err(validationError(BrepErrorCode.NULL_SHAPE_INPUT, 'split: shape is a null shape'));
  }
  for (let i = 0; i < tools.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- loop index is valid
    if (getKernel().isNull(tools[i]!.wrapped)) {
      return err(
        validationError(
          BrepErrorCode.NULL_SHAPE_INPUT,
          `splitShape: tool at index ${i} is a null shape`
        )
      );
    }
  }

  try {
    const result = getKernel().split(
      shape.wrapped,
      tools.map((t) => t.wrapped)
    );
    return ok(castShape(result));
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return err(
      kernelError('SPLIT_FAILED', `Split operation failed on ${tools.length} tool(s): ${raw}`, e, {
        operation: 'split',
        toolCount: tools.length,
      })
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
export function slice(
  shape: AnyShape<Dimension>,
  planes: PlaneInput[],
  options: { approximation?: boolean; planeSize?: number } = {}
): Result<AnyShape<Dimension>[]> {
  const results: AnyShape<Dimension>[] = [];
  for (const plane of planes) {
    const result = section(shape, plane, options);
    if (isErr(result)) return result as Result<AnyShape<Dimension>[]>;
    results.push(result.value);
  }
  return ok(results);
}
