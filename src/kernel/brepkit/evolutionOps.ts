/* eslint-disable @typescript-eslint/no-non-null-assertion -- WASM arrays have known-valid indices */
/**
 * Operations with shape evolution tracking for the brepkit adapter.
 *
 * These methods track how face hashes propagate through transforms,
 * booleans, and modifiers, enabling the brepjs propagation system to
 * maintain face identity across operations.
 *
 * @module
 */

import type { BrepkitKernel } from '../brepkitWasmTypes.js';
import type { KernelShape, KernelType, OperationResult, BooleanOptions } from '../types.js';
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
import { fuse, cut, intersect } from './booleanOps.js';
import { fillet, chamfer, shell, thicken, offset } from './modifierOps.js';

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
    const pos: number[] = bk.tessellateFace(faceId, 1.0).positions;
    if (pos.length < 3) return [0, 0, 0];
    let cx = 0;
    let cy = 0;
    let cz = 0;
    const nVerts = pos.length / 3;
    for (let i = 0; i < pos.length; i += 3) {
      cx += pos[i]!;
      cy += pos[i + 1]!;
      cz += pos[i + 2]!;
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
  const inputSigs: { hash: number; normal: number[]; centroid: [number, number, number] }[] = [];
  for (let i = 0; i < hashCount; i++) {
    const fid = inputFaceIds[i]!;
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
  const outputSigs: { hash: number; normal: number[]; centroid: [number, number, number] }[] = [];
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
  const matchedInputIndices = new Set<number>();

  for (const out of outputSigs) {
    let bestScore = -Infinity;
    let bestIdx = -1;

    for (let i = 0; i < inputSigs.length; i++) {
      const inp = inputSigs[i]!;
      const dot =
        (out.normal[0] ?? 0) * (inp.normal[0] ?? 0) +
        (out.normal[1] ?? 0) * (inp.normal[1] ?? 0) +
        (out.normal[2] ?? 0) * (inp.normal[2] ?? 0);
      if (dot < NORMAL_THRESHOLD) continue;

      const distSq = centroidDistSq(out.centroid, inp.centroid);
      if (distSq > CENTROID_DIST_SQ_MAX) continue;

      const score = dot - distSq / CENTROID_DIST_SQ_MAX;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0) {
      const bestInput = inputSigs[bestIdx]!;
      const existing = modified.get(bestInput.hash) ?? [];
      existing.push(out.hash);
      modified.set(bestInput.hash, existing);
      matchedInputIndices.add(bestIdx);
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
      deleted.add(inputSigs[i]!.hash);
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
      // Transforms: 1:1 mapping -- each input face maps to the corresponding output face
      for (let i = 0; i < inputFaceHashes.length && i < outputHashes.length; i++) {
        modified.set(inputFaceHashes[i]!, [outputHashes[i]!]);
      }
    } else {
      // Boolean/modifier: compare face hash sets
      const inputSet = new Set(inputFaceHashes);

      // Check if any output hash matches an input hash
      let hasOverlap = false;
      for (const hash of outputHashes) {
        if (inputSet.has(hash)) {
          hasOverlap = true;
          break;
        }
      }

      if (hasOverlap) {
        // Hash-based matching (OCCT-like behavior)
        const outputSet = new Set(outputHashes);
        for (const hash of outputHashes) {
          if (inputSet.has(hash)) {
            modified.set(hash, [hash]);
          }
        }
        const newFaces = outputHashes.filter((fh) => !inputSet.has(fh));
        if (newFaces.length > 0 && inputFaceHashes.length > 0) {
          generated.set(inputFaceHashes[0]!, newFaces);
        }
        for (const hash of inputFaceHashes) {
          if (!outputSet.has(hash)) {
            deleted.add(hash);
          }
        }
      } else if (originalShape) {
        // No hash overlap -- use geometric matching (normal + centroid)
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
        // No original shape available -- positional fallback
        for (let i = 0; i < inputFaceHashes.length && i < outputHashes.length; i++) {
          modified.set(inputFaceHashes[i]!, [outputHashes[i]!]);
        }
        if (outputHashes.length > inputFaceHashes.length && inputFaceHashes.length > 0) {
          generated.set(inputFaceHashes[0]!, outputHashes.slice(inputFaceHashes.length));
        }
      }
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
): OperationResult {
  const sh = shape as BrepkitHandle;
  const th = tool as BrepkitHandle;
  if (inputFaceHashes.length > 0 && sh.type === 'solid') {
    if (th.type === 'solid') {
      const json = nativeFn(sh.id, th.id);
      return parseNativeEvolution(json, hashUpperBound);
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
      };
    }
  }
  // Fallback: non-solid shapes or no face hashes
  const fallbackResult = fallbackFn(shape, tool, options);
  return buildEvolution(bk, fallbackResult, inputFaceHashes, hashUpperBound, false, shape);
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
): OperationResult {
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
): OperationResult {
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
): OperationResult {
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
        axis?: readonly [number, number, number];
        center?: readonly [number, number, number];
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
