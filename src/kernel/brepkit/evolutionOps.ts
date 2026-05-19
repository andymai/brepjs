/**
 * Operations with shape evolution tracking for the brepkit adapter.
 *
 * These methods track how face hashes propagate through transforms,
 * booleans, and modifiers, enabling the brepjs propagation system to
 * maintain face identity across operations.
 *
 * @module
 */

import type { BrepkitKernel } from './brepkitWasmTypes.js';
import type {
  KernelShape,
  KernelType,
  OperationResult,
  DiagnosticOperationResult,
  BooleanOptions,
} from '@/kernel/types.js';
import type { KernelAdapter } from '@/kernel/interfaces/index.js';
import {
  type BrepkitHandle,
  solidHandle,
  toArray,
  translationMatrix,
  rotationMatrix,
  multiplyMatrices,
} from './helpers.js';
import { applyMatrix } from './internalOps.js';
import { translate, rotate, mirror, scale, generalTransform } from './transformOps.js';
import { wasmIndex } from '@/utils/vec3.js';
import { fuse, cut, intersect, isEmptyBooleanError } from './booleanOps.js';
import { fillet, chamfer, shell, thicken, offset, draft } from './modifierOps.js';

// ---------------------------------------------------------------------------
// Internal evolution helpers
// ---------------------------------------------------------------------------

/**
 * Parse native brepkit evolution JSON and convert face IDs to hash-based
 * evolution that the brepjs propagation system expects.
 *
 * The native API returns:
 *   `{"solid": u32, "evolution": {"modified": {inputFaceId: [outputFaceIds]}, "generated": {}, "deleted": [faceIds]}}`
 *
 * We convert face IDs -> hashes via `id % hashUpperBound`.
 */
function parseNativeEvolution(json: string, hashUpperBound: number): OperationResult {
  const parsed = JSON.parse(json) as {
    solid: number;
    evolution: {
      modified: Record<string, number[]>;
      generated: Record<string, number[]>;
      deleted: number[];
    };
  };
  const evo = parsed.evolution;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard for external WASM JSON
  if (!evo || typeof evo.modified !== 'object' || typeof evo.generated !== 'object') {
    throw new Error('brepkit: invalid evolution JSON structure');
  }
  const resultShape = solidHandle(parsed.solid);

  const collectHashes = (entries: Record<string, number[]>): Map<number, number[]> => {
    const map = new Map<number, number[]>();
    for (const [inputId, outputIds] of Object.entries(entries)) {
      const inputHash = Number(inputId) % hashUpperBound;
      const outputHashes = outputIds.map((id) => id % hashUpperBound);
      const existing = map.get(inputHash);
      if (existing) {
        existing.push(...outputHashes);
      } else {
        map.set(inputHash, outputHashes);
      }
    }
    return map;
  };

  const modified = collectHashes(evo.modified);
  const generated = collectHashes(evo.generated);
  const deleted = new Set<number>();
  for (const id of evo.deleted) {
    deleted.add(id % hashUpperBound);
  }

  return { shape: resultShape, evolution: { modified, generated, deleted } };
}

/** Squared Euclidean distance between two 3-component centroids. */
function centroidDistSq(a: [number, number, number], b: [number, number, number]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

/** Compute face centroid as the average of tessellation vertices. */
function faceCentroidById(bk: BrepkitKernel, faceId: number): [number, number, number] {
  try {
    const pos = bk.tessellateFace(faceId, 1.0).positions;
    if (pos.length < 3) return [0, 0, 0];
    let cx = 0;
    let cy = 0;
    let cz = 0;
    const nVerts = pos.length / 3;
    for (let i = 0; i < pos.length; i += 3) {
      cx += wasmIndex(pos, i);
      cy += wasmIndex(pos, i + 1);
      cz += wasmIndex(pos, i + 2);
    }
    return [cx / nVerts, cy / nVerts, cz / nVerts];
  } catch {
    return [0, 0, 0];
  }
}

/**
 * Match input->output faces geometrically using normal dot product and centroid distance.
 * Mirrors the algorithm in brepkit's `boolean_with_evolution`.
 */
function matchFacesGeometrically(
  bk: BrepkitKernel,
  originalShape: KernelShape,
  inputFaceHashes: number[],
  outputFaceIds: number[],
  hashUpperBound: number,
  modified: Map<number, number[]>,
  generated: Map<number, number[]>,
  deleted: Set<number>
): void {
  const orig = originalShape as BrepkitHandle;
  if (orig.type !== 'solid') return;

  const inputFaceIds = toArray(bk.getSolidFaces(orig.id));
  const hashCount = Math.min(inputFaceIds.length, inputFaceHashes.length);

  // Snapshot input face signatures (skip faces where normal can't be computed)
  const inputSigs: {
    hash: number;
    normal: ArrayLike<number>;
    centroid: [number, number, number];
  }[] = [];
  for (let i = 0; i < hashCount; i++) {
    const fid = wasmIndex(inputFaceIds, i);
    try {
      const normal = bk.getFaceNormal(fid);
      const centroid = faceCentroidById(bk, fid);
      inputSigs.push({ hash: inputFaceHashes[i] ?? fid % hashUpperBound, normal, centroid });
    } catch {
      // Non-planar faces can't compute normal via getFaceNormal -- skip
      inputSigs.push({
        hash: inputFaceHashes[i] ?? fid % hashUpperBound,
        normal: [0, 0, 0],
        centroid: faceCentroidById(bk, fid),
      });
    }
  }

  // Snapshot output face signatures (skip faces where normal can't be computed)
  const outputSigs: {
    hash: number;
    normal: ArrayLike<number>;
    centroid: [number, number, number];
  }[] = [];
  for (const fid of outputFaceIds) {
    try {
      const normal = bk.getFaceNormal(fid);
      const centroid = faceCentroidById(bk, fid);
      outputSigs.push({ hash: fid % hashUpperBound, normal, centroid });
    } catch {
      outputSigs.push({
        hash: fid % hashUpperBound,
        normal: [0, 0, 0],
        centroid: faceCentroidById(bk, fid),
      });
    }
  }

  const NORMAL_THRESHOLD = 0.707; // cos(45deg)
  const CENTROID_DIST_SQ_MAX = 100.0;
  // Tolerance for "close-enough" matches — when multiple input faces score
  // within this band of the best, record all of them. Mirrors the same
  // relaxation applied in brepkit Rust's `boolean_with_evolution`. Without
  // this, an output face that legitimately inherits metadata from several
  // inputs (e.g., the bottom face of a filleted box — close-tied with the
  // input bottom — that should keep the input's "bottom" tag) only picks
  // up one input's metadata and drops the rest.
  const SCORE_TIE_TOL = 0.05;
  const matchedInputIndices = new Set<number>();

  for (const out of outputSigs) {
    let bestScore = -Infinity;
    const matches: { idx: number; score: number }[] = [];

    for (let i = 0; i < inputSigs.length; i++) {
      const inp = wasmIndex(inputSigs, i);
      const dot =
        (out.normal[0] ?? 0) * (inp.normal[0] ?? 0) +
        (out.normal[1] ?? 0) * (inp.normal[1] ?? 0) +
        (out.normal[2] ?? 0) * (inp.normal[2] ?? 0);
      if (dot < NORMAL_THRESHOLD) continue;

      const distSq = centroidDistSq(out.centroid, inp.centroid);
      if (distSq > CENTROID_DIST_SQ_MAX) continue;

      const score = dot - distSq / CENTROID_DIST_SQ_MAX;
      if (score > bestScore) bestScore = score;
      matches.push({ idx: i, score });
    }

    if (matches.length > 0) {
      for (const m of matches) {
        if (m.score >= bestScore - SCORE_TIE_TOL) {
          const inp = wasmIndex(inputSigs, m.idx);
          const existing = modified.get(inp.hash) ?? [];
          existing.push(out.hash);
          modified.set(inp.hash, existing);
          matchedInputIndices.add(m.idx);
        }
      }
    } else {
      // Unmatched output -> generated from nearest input
      let bestDistSq = Infinity;
      let nearestInput: (typeof inputSigs)[0] | undefined;
      for (const inp of inputSigs) {
        const distSq = centroidDistSq(out.centroid, inp.centroid);
        if (distSq < bestDistSq) {
          bestDistSq = distSq;
          nearestInput = inp;
        }
      }
      if (nearestInput) {
        const existing = generated.get(nearestInput.hash) ?? [];
        existing.push(out.hash);
        generated.set(nearestInput.hash, existing);
      }
    }
  }

  // Input faces not matched -> deleted
  for (let i = 0; i < inputSigs.length; i++) {
    if (!matchedInputIndices.has(i)) {
      deleted.add(wasmIndex(inputSigs, i).hash);
    }
  }
}

/**
 * Apply geometric matching to the unmatched input/output residuals from a
 * hash-overlap evolution, then derive the deleted set as inputs that were
 * never matched and never attributed to a generated output.
 */
function reconcileUnmatchedResiduals(
  bk: BrepkitKernel,
  originalShape: KernelShape,
  unmatchedInputHashes: number[],
  unmatchedOutputFaces: number[],
  hashUpperBound: number,
  modified: Map<number, number[]>,
  generated: Map<number, number[]>,
  deleted: Set<number>
): void {
  const beforeDeleted = new Set(deleted);
  const beforeModified = new Map(modified);
  matchFacesGeometrically(
    bk,
    originalShape,
    unmatchedInputHashes,
    unmatchedOutputFaces,
    hashUpperBound,
    modified,
    generated,
    deleted
  );
  deleted.clear();
  for (const old of beforeDeleted) deleted.add(old);
  for (const h of unmatchedInputHashes) {
    const isModified =
      !beforeModified.has(h) && modified.has(h) && (modified.get(h)?.length ?? 0) > 0;
    const isGenerated = generated.has(h) && (generated.get(h)?.length ?? 0) > 0;
    if (!isModified && !isGenerated) {
      deleted.add(h);
    }
  }
}

/**
 * Hash-only evolution fallback when no original shape is available for
 * geometric matching: every new output hash becomes "generated", every
 * input hash that didn't survive becomes "deleted".
 */
function fallbackHashOnlyEvolution(
  inputFaceHashes: number[],
  outputHashes: number[],
  inputSet: Set<number>,
  outputSet: Set<number>,
  generated: Map<number, number[]>,
  deleted: Set<number>
): void {
  const newFaces = outputHashes.filter((fh) => !inputSet.has(fh));
  if (newFaces.length > 0 && inputFaceHashes.length > 0) {
    generated.set(wasmIndex(inputFaceHashes, 0), newFaces);
  }
  for (const hash of inputFaceHashes) {
    if (!outputSet.has(hash)) {
      deleted.add(hash);
    }
  }
}

/**
 * Boolean/modifier evolution: compare input and output face hashes, fall
 * back to geometric matching for the residuals brepkit re-IDs.
 */
function buildBooleanEvolution(
  bk: BrepkitKernel,
  outputFaces: number[],
  outputHashes: number[],
  inputFaceHashes: number[],
  hashUpperBound: number,
  modified: Map<number, number[]>,
  generated: Map<number, number[]>,
  deleted: Set<number>,
  originalShape?: KernelShape
): void {
  const inputSet = new Set(inputFaceHashes);
  const hasOverlap = outputHashes.some((hash) => inputSet.has(hash));

  if (hasOverlap) {
    const outputSet = new Set(outputHashes);
    for (const hash of outputHashes) {
      if (inputSet.has(hash)) modified.set(hash, [hash]);
    }
    const unmatchedInputHashes = inputFaceHashes.filter((h) => !outputSet.has(h));
    const unmatchedOutputFaces = outputFaces.filter((fid) => !inputSet.has(fid % hashUpperBound));
    const canGeometricMatch =
      originalShape && unmatchedInputHashes.length > 0 && unmatchedOutputFaces.length > 0;
    if (canGeometricMatch) {
      reconcileUnmatchedResiduals(
        bk,
        originalShape,
        unmatchedInputHashes,
        unmatchedOutputFaces,
        hashUpperBound,
        modified,
        generated,
        deleted
      );
    } else {
      fallbackHashOnlyEvolution(
        inputFaceHashes,
        outputHashes,
        inputSet,
        outputSet,
        generated,
        deleted
      );
    }
  } else if (originalShape) {
    matchFacesGeometrically(
      bk,
      originalShape,
      inputFaceHashes,
      outputFaces,
      hashUpperBound,
      modified,
      generated,
      deleted
    );
  } else {
    for (let i = 0; i < inputFaceHashes.length && i < outputHashes.length; i++) {
      modified.set(wasmIndex(inputFaceHashes, i), [wasmIndex(outputHashes, i)]);
    }
    if (outputHashes.length > inputFaceHashes.length && inputFaceHashes.length > 0) {
      generated.set(wasmIndex(inputFaceHashes, 0), outputHashes.slice(inputFaceHashes.length));
    }
  }
}

/**
 * Build a ShapeEvolution by comparing input face hashes to output face hashes.
 *
 * For transforms: 1:1 mapping (modified = identity, no generated/deleted).
 * For booleans/modifiers: compare sets to detect changes, with geometric
 * fallback when hash matching fails (brepkit always creates new face IDs).
 */
function buildEvolution(
  bk: BrepkitKernel,
  resultShape: KernelShape,
  inputFaceHashes: number[],
  hashUpperBound: number,
  isTransform: boolean,
  originalShape?: KernelShape
): OperationResult {
  const h = resultShape as BrepkitHandle;
  const modified = new Map<number, number[]>();
  const generated = new Map<number, number[]>();
  const deleted = new Set<number>();

  if (h.type === 'solid') {
    const outputFaces = toArray(bk.getSolidFaces(h.id));
    const outputHashes = outputFaces.map((fid) => fid % hashUpperBound);

    if (isTransform) {
      for (let i = 0; i < inputFaceHashes.length && i < outputHashes.length; i++) {
        modified.set(wasmIndex(inputFaceHashes, i), [wasmIndex(outputHashes, i)]);
      }
    } else {
      buildBooleanEvolution(
        bk,
        outputFaces,
        outputHashes,
        inputFaceHashes,
        hashUpperBound,
        modified,
        generated,
        deleted,
        originalShape
      );
    }
  }

  return { shape: resultShape, evolution: { modified, generated, deleted } };
}

/**
 * Chain an evolution map (modified or generated) through one step of a multi-step
 * boolean. For each entry, each previous output hash is resolved against this
 * step's evolution: if it was further modified, follow to the new outputs; if
 * deleted, drop it; otherwise keep it unchanged.
 *
 * Mutates `map` in-place and records each resolved prevOut in `intermediateOutputs`.
 * When `deleteOnEmpty` is provided, entries that reduce to no outputs are added to it.
 */
function chainEvolutionMap(
  map: Map<number, number[]>,
  stepModified: ReadonlyMap<number, readonly number[]>,
  stepDeleted: ReadonlySet<number>,
  intermediateOutputs: Set<number>,
  deleteOnEmpty?: Set<number>
): void {
  for (const [origKey, prevOutputs] of map) {
    const chainedOutputs: number[] = [];
    for (const prevOut of prevOutputs) {
      intermediateOutputs.add(prevOut);
      const nextOutputs = stepModified.get(prevOut);
      if (nextOutputs) {
        chainedOutputs.push(...nextOutputs);
      } else if (!stepDeleted.has(prevOut)) {
        chainedOutputs.push(prevOut);
      }
    }
    if (chainedOutputs.length > 0) {
      map.set(origKey, chainedOutputs);
    } else {
      map.delete(origKey);
      deleteOnEmpty?.add(origKey);
    }
  }
}

/**
 * Shared implementation for boolean-with-history operations (fuse, cut, intersect).
 */
// brepjs-patterns-disable: max-function-lines
function booleanWithHistoryImpl(
  bk: BrepkitKernel,
  shape: KernelShape,
  tool: KernelShape,
  inputFaceHashes: number[],
  hashUpperBound: number,
  options: BooleanOptions | undefined,
  nativeFn: (a: number, b: number) => string,
  fallbackFn: (s: KernelShape, t: KernelShape, o?: BooleanOptions) => KernelShape,
  _label: string
): DiagnosticOperationResult {
  const noDiagnostics = { hasErrors: false, hasWarnings: false, messages: [] } as const;
  const sh = shape as BrepkitHandle;
  const th = tool as BrepkitHandle;
  if (inputFaceHashes.length > 0 && sh.type === 'solid') {
    if (th.type === 'solid') {
      try {
        const json = nativeFn(sh.id, th.id);
        return { ...parseNativeEvolution(json, hashUpperBound), diagnostics: noDiagnostics };
      } catch (e) {
        if (!isEmptyBooleanError(e)) throw e;
        // Empty result — drop to fallback path which returns an empty compound.
      }
    }
    if (th.type === 'compound') {
      // Iteratively apply native evolution for each solid in the compound,
      // chaining evolution maps so that original input face hashes map to
      // final output face hashes (not intermediate ones).
      const childSolidIds: number[] = toArray(bk.getCompoundSolids(th.id));
      let currentShape: KernelShape = shape;
      const combinedModified = new Map<number, number[]>();
      const combinedGenerated = new Map<number, number[]>();
      const combinedDeleted = new Set<number>();
      const inputFaceHashSet = new Set(inputFaceHashes);
      for (const childId of childSolidIds) {
        const ch = currentShape as BrepkitHandle;
        if (ch.type !== 'solid') break;
        const json = nativeFn(ch.id, childId);
        const result = parseNativeEvolution(json, hashUpperBound);
        currentShape = result.shape;

        const intermediateOutputs = new Set<number>();

        // Chain combinedModified and combinedGenerated through this step.
        chainEvolutionMap(
          combinedModified,
          result.evolution.modified,
          result.evolution.deleted,
          intermediateOutputs,
          combinedDeleted
        );
        chainEvolutionMap(
          combinedGenerated,
          result.evolution.modified,
          result.evolution.deleted,
          intermediateOutputs
        );

        // Add new entries from this step that aren't already chained
        for (const [k, v] of result.evolution.modified) {
          if (!combinedModified.has(k) && !intermediateOutputs.has(k)) {
            combinedModified.set(k, [...v]);
          }
        }

        for (const [k, v] of result.evolution.generated) {
          if (!intermediateOutputs.has(k)) {
            const existing = combinedGenerated.get(k) ?? [];
            combinedGenerated.set(k, [...existing, ...v]);
          }
        }
        for (const d of result.evolution.deleted) {
          if (inputFaceHashSet.has(d)) {
            combinedDeleted.add(d);
          }
        }
      }
      return {
        shape: currentShape,
        evolution: {
          modified: combinedModified,
          generated: combinedGenerated,
          deleted: combinedDeleted,
        },
        diagnostics: noDiagnostics,
      };
    }
  }
  // Fallback: non-solid shapes or no face hashes
  const fallbackResult = fallbackFn(shape, tool, options);
  return {
    ...buildEvolution(bk, fallbackResult, inputFaceHashes, hashUpperBound, false, shape),
    diagnostics: noDiagnostics,
  };
}

// ---------------------------------------------------------------------------
// Public evolution-tracked operations
// ---------------------------------------------------------------------------

export function translateWithHistory(
  bk: BrepkitKernel,
  shape: KernelShape,
  x: number,
  y: number,
  z: number,
  inputFaceHashes: number[],
  hashUpperBound: number
): OperationResult {
  return buildEvolution(bk, translate(bk, shape, x, y, z), inputFaceHashes, hashUpperBound, true);
}

export function rotateWithHistory(
  bk: BrepkitKernel,
  shape: KernelShape,
  angle: number,
  inputFaceHashes: number[],
  hashUpperBound: number,
  axis?: readonly [number, number, number],
  center?: readonly [number, number, number]
): OperationResult {
  // shapeFns.rotate() passes angle in radians; convert back to degrees
  // since rotate() expects degrees (it calls rotationMatrix which converts internally)
  const angleDeg = (angle * 180) / Math.PI;
  return buildEvolution(
    bk,
    rotate(bk, shape, angleDeg, axis, center),
    inputFaceHashes,
    hashUpperBound,
    true
  );
}

export function mirrorWithHistory(
  bk: BrepkitKernel,
  shape: KernelShape,
  origin: readonly [number, number, number],
  normal: readonly [number, number, number],
  inputFaceHashes: number[],
  hashUpperBound: number
): OperationResult {
  return buildEvolution(
    bk,
    mirror(bk, shape, origin, normal),
    inputFaceHashes,
    hashUpperBound,
    true
  );
}

export function scaleWithHistory(
  bk: BrepkitKernel,
  shape: KernelShape,
  center: readonly [number, number, number],
  factor: number,
  inputFaceHashes: number[],
  hashUpperBound: number
): OperationResult {
  return buildEvolution(
    bk,
    scale(bk, shape, center, factor),
    inputFaceHashes,
    hashUpperBound,
    true
  );
}

export function generalTransformWithHistory(
  bk: BrepkitKernel,
  shape: KernelShape,
  linear: readonly [number, number, number, number, number, number, number, number, number],
  translation: readonly [number, number, number],
  isOrthogonal: boolean,
  inputFaceHashes: number[],
  hashUpperBound: number
): OperationResult {
  return buildEvolution(
    bk,
    generalTransform(bk, shape, linear, translation, isOrthogonal),
    inputFaceHashes,
    hashUpperBound,
    true
  );
}

export function fuseWithHistory(
  bk: BrepkitKernel,
  shape: KernelShape,
  tool: KernelShape,
  inputFaceHashes: number[],
  hashUpperBound: number,
  options?: BooleanOptions
): DiagnosticOperationResult {
  return booleanWithHistoryImpl(
    bk,
    shape,
    tool,
    inputFaceHashes,
    hashUpperBound,
    options,
    (a, b) => bk.fuseWithEvolution(a, b),
    (s, t, o) => fuse(bk, s, t, o),
    'fuseWithHistory'
  );
}

export function cutWithHistory(
  bk: BrepkitKernel,
  shape: KernelShape,
  tool: KernelShape,
  inputFaceHashes: number[],
  hashUpperBound: number,
  options?: BooleanOptions
): DiagnosticOperationResult {
  return booleanWithHistoryImpl(
    bk,
    shape,
    tool,
    inputFaceHashes,
    hashUpperBound,
    options,
    (a, b) => bk.cutWithEvolution(a, b),
    (s, t, o) => cut(bk, s, t, o),
    'cutWithHistory'
  );
}

export function intersectWithHistory(
  bk: BrepkitKernel,
  shape: KernelShape,
  tool: KernelShape,
  inputFaceHashes: number[],
  hashUpperBound: number,
  options?: BooleanOptions
): DiagnosticOperationResult {
  return booleanWithHistoryImpl(
    bk,
    shape,
    tool,
    inputFaceHashes,
    hashUpperBound,
    options,
    (a, b) => bk.intersectWithEvolution(a, b),
    (s, t, o) => intersect(bk, s, t, o),
    'intersectWithHistory'
  );
}

export function filletWithHistory(
  bk: BrepkitKernel,
  shape: KernelShape,
  edges: KernelShape[],
  radius: number | [number, number] | ((edge: KernelShape) => number | [number, number]),
  inputFaceHashes: number[],
  hashUpperBound: number
): OperationResult {
  return buildEvolution(
    bk,
    fillet(bk, shape, edges, radius),
    inputFaceHashes,
    hashUpperBound,
    false,
    shape
  );
}

export function chamferWithHistory(
  bk: BrepkitKernel,
  shape: KernelShape,
  edges: KernelShape[],
  distance: number | [number, number] | ((edge: KernelShape) => number | [number, number]),
  inputFaceHashes: number[],
  hashUpperBound: number
): OperationResult {
  return buildEvolution(
    bk,
    chamfer(bk, shape, edges, distance),
    inputFaceHashes,
    hashUpperBound,
    false,
    shape
  );
}

export function shellWithHistory(
  bk: BrepkitKernel,
  shape: KernelShape,
  faces: KernelShape[],
  thickness: number,
  inputFaceHashes: number[],
  hashUpperBound: number,
  tolerance?: number
): OperationResult {
  return buildEvolution(
    bk,
    shell(bk, shape, faces, thickness, tolerance),
    inputFaceHashes,
    hashUpperBound,
    false,
    shape
  );
}

export function thickenWithHistory(
  bk: BrepkitKernel,
  shape: KernelShape,
  thickness: number,
  inputFaceHashes: number[],
  hashUpperBound: number
): OperationResult {
  return buildEvolution(
    bk,
    thicken(bk, shape, thickness),
    inputFaceHashes,
    hashUpperBound,
    false,
    shape
  );
}

export function offsetWithHistory(
  bk: BrepkitKernel,
  shape: KernelShape,
  distance: number,
  inputFaceHashes: number[],
  hashUpperBound: number,
  tolerance?: number
): OperationResult {
  return buildEvolution(
    bk,
    offset(bk, shape, distance, tolerance),
    inputFaceHashes,
    hashUpperBound,
    false,
    shape
  );
}

export function draftWithHistory(
  bk: BrepkitKernel,
  shape: KernelShape,
  faces: KernelShape[],
  pullDirection: [number, number, number],
  neutralPlane: [number, number, number],
  angleDeg: number,
  inputFaceHashes: number[],
  hashUpperBound: number
): OperationResult {
  return buildEvolution(
    bk,
    draft(bk, shape, faces, pullDirection, neutralPlane, angleDeg),
    inputFaceHashes,
    hashUpperBound,
    false,
    shape
  );
}

export function applyComposedTransformWithHistory(
  bk: BrepkitKernel,
  shape: KernelShape,
  transformHandle: KernelType,
  inputFaceHashes: number[],
  hashUpperBound: number
): OperationResult {
  const result = applyMatrix(bk, shape, transformHandle as number[]);
  return buildEvolution(bk, result, inputFaceHashes, hashUpperBound, true);
}

export function composeTransform(
  _bk: BrepkitKernel,
  ops: Array<
    | { type: 'translate'; x: number; y: number; z: number }
    | {
        type: 'rotate';
        angle: number;
        axis?: readonly [number, number, number] | undefined;
        center?: readonly [number, number, number] | undefined;
      }
  >
): { handle: KernelType; dispose: () => void } {
  // Benchmarked: JS matrix multiply is ~5x faster than bk.composeTransforms()
  // because the WASM boundary crossing cost exceeds the trivial 4x4 computation.
  let matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const op of ops) {
    const m =
      op.type === 'translate'
        ? translationMatrix(op.x, op.y, op.z)
        : rotationMatrix(op.angle, op.axis, op.center);
    matrix = multiplyMatrices(m, matrix);
  }
  return { handle: matrix, dispose: () => {} };
}

import { resolveUniformAngle } from './helpers.js';

/** Co-located factory: returns the history-tracking slice of {@link KernelAdapter} bound to `bk`. */
// brepjs-patterns-disable: max-function-lines
export function makeEvolutionOps(bk: BrepkitKernel) {
  return {
    translateWithHistory: (shape, x, y, z, inputFaceHashes, hashUpperBound) =>
      translateWithHistory(bk, shape, x, y, z, inputFaceHashes, hashUpperBound),
    rotateWithHistory: (shape, angle, inputFaceHashes, hashUpperBound, axis, center) =>
      rotateWithHistory(bk, shape, angle, inputFaceHashes, hashUpperBound, axis, center),
    mirrorWithHistory: (shape, origin, normal, inputFaceHashes, hashUpperBound) =>
      mirrorWithHistory(bk, shape, origin, normal, inputFaceHashes, hashUpperBound),
    scaleWithHistory: (shape, center, factor, inputFaceHashes, hashUpperBound) =>
      scaleWithHistory(bk, shape, center, factor, inputFaceHashes, hashUpperBound),
    generalTransformWithHistory: (
      shape,
      linear,
      translation,
      isOrthogonal,
      inputFaceHashes,
      hashUpperBound
    ) =>
      generalTransformWithHistory(
        bk,
        shape,
        linear,
        translation,
        isOrthogonal,
        inputFaceHashes,
        hashUpperBound
      ),
    fuseWithHistory: (shape, tool, inputFaceHashes, hashUpperBound, options) =>
      fuseWithHistory(bk, shape, tool, inputFaceHashes, hashUpperBound, options),
    cutWithHistory: (shape, tool, inputFaceHashes, hashUpperBound, options) =>
      cutWithHistory(bk, shape, tool, inputFaceHashes, hashUpperBound, options),
    intersectWithHistory: (shape, tool, inputFaceHashes, hashUpperBound, options) =>
      intersectWithHistory(bk, shape, tool, inputFaceHashes, hashUpperBound, options),
    filletWithHistory: (shape, edges, radius, inputFaceHashes, hashUpperBound) =>
      filletWithHistory(bk, shape, edges, radius, inputFaceHashes, hashUpperBound),
    chamferWithHistory: (shape, edges, distance, inputFaceHashes, hashUpperBound) =>
      chamferWithHistory(bk, shape, edges, distance, inputFaceHashes, hashUpperBound),
    shellWithHistory: (shape, faces, thickness, inputFaceHashes, hashUpperBound, tolerance) =>
      shellWithHistory(bk, shape, faces, thickness, inputFaceHashes, hashUpperBound, tolerance),
    thickenWithHistory: (shape, thickness, inputFaceHashes, hashUpperBound) =>
      thickenWithHistory(bk, shape, thickness, inputFaceHashes, hashUpperBound),
    offsetWithHistory: (shape, distance, inputFaceHashes, hashUpperBound, tolerance) =>
      offsetWithHistory(bk, shape, distance, inputFaceHashes, hashUpperBound, tolerance),
    draftWithHistory: (
      shape,
      faces,
      pullDirection,
      neutralPlane,
      angleDeg,
      inputFaceHashes,
      hashUpperBound
    ) =>
      draftWithHistory(
        bk,
        shape,
        faces,
        pullDirection,
        neutralPlane,
        resolveUniformAngle(faces, angleDeg),
        inputFaceHashes,
        hashUpperBound
      ),
    applyComposedTransformWithHistory: (shape, transformHandle, inputFaceHashes, hashUpperBound) =>
      applyComposedTransformWithHistory(
        bk,
        shape,
        transformHandle,
        inputFaceHashes,
        hashUpperBound
      ),
    composeTransform: (ops) => composeTransform(bk, ops),
  } satisfies Pick<
    KernelAdapter,
    | 'translateWithHistory'
    | 'rotateWithHistory'
    | 'mirrorWithHistory'
    | 'scaleWithHistory'
    | 'generalTransformWithHistory'
    | 'fuseWithHistory'
    | 'cutWithHistory'
    | 'intersectWithHistory'
    | 'filletWithHistory'
    | 'chamferWithHistory'
    | 'shellWithHistory'
    | 'thickenWithHistory'
    | 'offsetWithHistory'
    | 'draftWithHistory'
    | 'applyComposedTransformWithHistory'
    | 'composeTransform'
  >;
}
