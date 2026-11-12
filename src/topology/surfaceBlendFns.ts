/**
 * Surfaces with continuity control: a blend between two edge chains, one
 * surface's edge matched to another's, and a surface faired.
 */

import { getKernel } from '@/kernel/index.js';
import type { KernelShape } from '@/kernel/types.js';
import { isUnsupportedKernelOperationError } from '@/kernel/unsupported.js';
import { type Result, ok, err } from '@/core/result.js';
import {
  validationError,
  kernelError,
  unsupportedError,
  BrepErrorCode,
  type BrepError,
} from '@/core/errors.js';
import type { Edge, Face } from '@/core/shapeTypes.js';
import { createFace } from '@/core/shapeTypes.js';

/** Options for {@link blendSurface}. */
export interface BlendSurfaceOptions {
  /** Continuity to the face beside each chain. Defaults to `'g1'`. */
  readonly continuity?: 'g1' | 'g2' | undefined;
  /**
   * How far the surface runs along each face's tangent before it turns, for
   * chain A then chain B, as a multiple of the natural size. Both positive.
   */
  readonly weights?: readonly [number, number] | undefined;
}

/** Options for {@link matchSurface}. */
export interface MatchSurfaceOptions {
  /** Continuity to the target at the matched edge. Defaults to `'g1'`. */
  readonly continuity?: 'g0' | 'g1' | 'g2' | undefined;
  /** The face to match, for a target edge that bounds two faces of a solid. */
  readonly targetFace?: Face | undefined;
}

/** Options for {@link fairSurface}. */
export interface FairSurfaceOptions {
  /** The farthest the faired surface may lie from the original. Positive. */
  readonly tolerance: number;
}

function surfaceOpUnsupported(op: string, cause?: unknown): BrepError {
  const kernelId = getKernel().kernelId;
  const raw = cause instanceof Error ? ` (${cause.message})` : '';
  return unsupportedError(
    BrepErrorCode.UNSUPPORTED_CAPABILITY,
    `${op}: the ${kernelId} kernel has no such operation${raw}`,
    cause,
    { kernel: kernelId, operation: op },
    'Use the brepkit kernel (brepkit-wasm 4.10.0 or later)'
  );
}

/** Run a kernel surface operation that only some kernels have, and wrap its face. */
function surfaceOp(
  op: string,
  failure: string,
  suggestion: string,
  run: (() => KernelShape) | undefined
): Result<Face> {
  if (!run) return err(surfaceOpUnsupported(op));
  try {
    return ok(createFace(run()));
  } catch (e) {
    if (isUnsupportedKernelOperationError(e)) return err(surfaceOpUnsupported(op, e));
    const raw = e instanceof Error ? e.message : String(e);
    return err(kernelError(failure, `${op} failed: ${raw}`, e, { operation: op }, suggestion));
  }
}

const asChain = (chain: Edge | readonly Edge[]): readonly Edge[] =>
  Array.isArray(chain) ? (chain as readonly Edge[]) : [chain as Edge];

/**
 * Bridge two edge chains with a face that is G1 or G2 continuous to the face
 * beside each. A chain is one edge of its face, or several in running order.
 * The new face has its own edges, which lie on the chains: sew it to its
 * neighbours to join them. Needs the brepkit kernel.
 *
 * @param chainA - Edges of `faceA` the blend starts on.
 * @param faceA - The face the blend leaves.
 * @param chainB - Edges of `faceB` the blend ends on.
 * @param faceB - The face the blend arrives at.
 */
export function blendSurface(
  chainA: Edge | readonly Edge[],
  faceA: Face,
  chainB: Edge | readonly Edge[],
  faceB: Face,
  options: BlendSurfaceOptions = {}
): Result<Face> {
  const [a, b] = [asChain(chainA), asChain(chainB)];
  if (a.length === 0 || b.length === 0) {
    return err(
      validationError('BLEND_SURFACE_EMPTY_CHAIN', 'blendSurface: each chain needs an edge')
    );
  }
  const weights = options.weights;
  if (weights && !weights.every((w) => Number.isFinite(w) && w > 0)) {
    return err(
      validationError('BLEND_SURFACE_BAD_WEIGHT', 'blendSurface: each weight must be positive')
    );
  }
  const kernel = getKernel();
  const run = kernel.blendSurface?.bind(kernel);
  return surfaceOp(
    'blendSurface',
    'BLEND_SURFACE_FAILED',
    'Each chain must run unbroken along the boundary of its face, and both chains must be open or both closed.',
    run &&
      (() =>
        run(
          a.map((e) => e.wrapped),
          faceA.wrapped,
          b.map((e) => e.wrapped),
          faceB.wrapped,
          {
            continuity: options.continuity ?? 'g1',
            weights: weights ? [weights[0], weights[1]] : undefined,
          }
        ))
  );
}

/**
 * Move one boundary edge of a face on to an edge of another surface, at G0, G1
 * or G2, and leave the face alone past a band beside the edge. Returns a new
 * face. Needs the brepkit kernel.
 *
 * @param face - The face to change.
 * @param edge - The edge of `face`'s outer boundary to move.
 * @param targetEdge - The edge to move it on to.
 */
export function matchSurface(
  face: Face,
  edge: Edge,
  targetEdge: Edge,
  options: MatchSurfaceOptions = {}
): Result<Face> {
  const kernel = getKernel();
  const run = kernel.matchSurface?.bind(kernel);
  return surfaceOp(
    'matchSurface',
    'MATCH_SURFACE_FAILED',
    "The edge must be on the face's outer boundary, and a target edge that bounds two faces needs targetFace.",
    run &&
      (() =>
        run(face.wrapped, edge.wrapped, targetEdge.wrapped, {
          continuity: options.continuity ?? 'g1',
          targetFace: options.targetFace?.wrapped,
        }))
  );
}

/**
 * Smooth a face's surface, within `tolerance` of it, with its boundary held.
 * Returns a new face; an analytic face (plane, cylinder, ...) comes back as a
 * copy. Needs the brepkit kernel.
 */
export function fairSurface(face: Face, options: FairSurfaceOptions): Result<Face> {
  if (!(Number.isFinite(options.tolerance) && options.tolerance > 0)) {
    return err(
      validationError('FAIR_SURFACE_BAD_TOLERANCE', 'fairSurface: tolerance must be positive')
    );
  }
  const kernel = getKernel();
  const run = kernel.fairSurface?.bind(kernel);
  return surfaceOp(
    'fairSurface',
    'FAIR_SURFACE_FAILED',
    'Pass a face with a valid surface.',
    run && (() => run(face.wrapped, options.tolerance))
  );
}
