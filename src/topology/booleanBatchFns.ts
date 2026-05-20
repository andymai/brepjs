// Recursive halving wrappers around fuseAll / cutAll.
//
// The kernel's native N-way booleans (BRepAlgoAPI_BuilderAlgo) are
// dramatically faster than sequential pairwise ops — when they succeed.
// When they fail (one bad tool, tangent face, fuzzy tolerance mismatch),
// the only recovery used to be N pairwise calls, which is O(N) WASM
// crossings and frequently the dominant cost in BREP-heavy consumers.
//
// fuseAllBisect / cutAllBisect catch the batch failure and bisect the
// input recursively — O(log N) batch attempts + at most 1 pairwise
// singleton, instead of N pairwise. Telemetry surfaces which path the
// recovery actually took.

import { isErr, ok, err, type Result } from '@/core/result.js';
import { validationError, BrepErrorCode } from '@/core/errors.js';
import type { Shape3D } from '@/core/shapeTypes.js';
import type { ValidSolid } from '@/core/validityTypes.js';
import type { BooleanOptions } from '@/kernel/types.js';
import { fuse, cut, fuseAll, cutAll } from './booleanFns.js';
import { firstOrThrow } from '@/utils/arrayAccess.js';

// ---------------------------------------------------------------------------
// Dependency-injection seam for tests and benchmarks
// ---------------------------------------------------------------------------

/**
 * Injectable kernel ops, used by the bisect internals. The public
 * `cutAllBisect` / `fuseAllBisect` wire in the real implementations; tests
 * and benchmarks can substitute synthetic ones that throw on specified
 * inputs to drive the bisect-recovery path without module mocking.
 */
export interface BisectKernelOps {
  readonly cut: typeof cut;
  readonly cutAll: typeof cutAll;
  readonly fuse: typeof fuse;
  readonly fuseAll: typeof fuseAll;
}

const REAL_OPS: BisectKernelOps = { cut, cutAll, fuse, fuseAll };

// ---------------------------------------------------------------------------
// Public result + telemetry types
// ---------------------------------------------------------------------------

export interface BatchBisectResult<T extends Shape3D = Shape3D> {
  readonly shape: T;
  readonly telemetry: BatchBisectTelemetry;
}

export interface BatchBisectTelemetry {
  /** Number of inputs the caller passed (tools for cut, shapes for fuse). */
  readonly totalInputs: number;
  /** Kernel batch attempts including failures. */
  readonly batchAttempts: number;
  /** Kernel batch attempts that succeeded. */
  readonly batchSucceeded: number;
  /** Inputs applied via a singleton (pairwise) op after bisection bottomed out. */
  readonly singletonFallbacks: number;
  /** Indices of inputs that failed even as singletons and were skipped. */
  readonly failedInputs: readonly number[];
}

interface MutableTelemetry {
  totalInputs: number;
  batchAttempts: number;
  batchSucceeded: number;
  singletonFallbacks: number;
  failedInputs: number[];
}

function freezeTelemetry(t: MutableTelemetry): BatchBisectTelemetry {
  return {
    totalInputs: t.totalInputs,
    batchAttempts: t.batchAttempts,
    batchSucceeded: t.batchSucceeded,
    singletonFallbacks: t.singletonFallbacks,
    failedInputs: [...t.failedInputs],
  };
}

// ---------------------------------------------------------------------------
// cutAllBisect
// ---------------------------------------------------------------------------

export function cutAllBisect(
  base: ValidSolid,
  tools: ValidSolid[],
  options?: BooleanOptions
): Result<BatchBisectResult<ValidSolid>>;
export function cutAllBisect(
  base: Shape3D,
  tools: Shape3D[],
  options: BooleanOptions & { unsafe: true }
): Result<BatchBisectResult>;
export function cutAllBisect(
  base: Shape3D,
  tools: Shape3D[],
  options: BooleanOptions = {}
): Result<BatchBisectResult> {
  return cutAllBisectWith(REAL_OPS, base, tools, options);
}

/** @internal — testable variant accepting injected kernel ops. */
export function cutAllBisectWith(
  ops: BisectKernelOps,
  base: Shape3D,
  tools: Shape3D[],
  options: BooleanOptions = {}
): Result<BatchBisectResult> {
  if (options.signal?.aborted) throw options.signal.reason;
  const telemetry: MutableTelemetry = {
    totalInputs: tools.length,
    batchAttempts: 0,
    batchSucceeded: 0,
    singletonFallbacks: 0,
    failedInputs: [],
  };
  const result = bisectCut(ops, base, tools, 0, options, telemetry);
  if (isErr(result)) return result;
  return ok({ shape: result.value, telemetry: freezeTelemetry(telemetry) });
}

function bisectCut(
  ops: BisectKernelOps,
  base: Shape3D,
  tools: readonly Shape3D[],
  startIdx: number,
  options: BooleanOptions,
  telemetry: MutableTelemetry
): Result<Shape3D> {
  if (tools.length === 0) return ok(base);
  if (tools.length === 1) return applySingletonCut(ops, base, tools, startIdx, options, telemetry);

  telemetry.batchAttempts++;
  const batchResult = tryBatch(() =>
    ops.cutAll(base as ValidSolid, tools as ValidSolid[], options)
  );
  if (batchResult && batchResult.ok) {
    telemetry.batchSucceeded++;
    return batchResult;
  }
  if (options.signal?.aborted) throw options.signal.reason;

  const mid = Math.floor(tools.length / 2);
  const left = bisectCut(ops, base, tools.slice(0, mid), startIdx, options, telemetry);
  if (!left.ok) return left;
  return bisectCut(ops, left.value, tools.slice(mid), startIdx + mid, options, telemetry);
}

function applySingletonCut(
  ops: BisectKernelOps,
  base: Shape3D,
  tools: readonly Shape3D[],
  startIdx: number,
  options: BooleanOptions,
  telemetry: MutableTelemetry
): Result<Shape3D> {
  telemetry.singletonFallbacks++;
  const tool = firstOrThrow(tools);
  const pairResult = tryBatch(() => ops.cut(base as ValidSolid, tool as ValidSolid, options));
  if (pairResult && pairResult.ok) return pairResult;
  if (options.signal?.aborted) throw options.signal.reason;
  // Pairwise also failed: skip this tool, return base unchanged so the
  // surrounding bisect can continue with the next slice.
  telemetry.failedInputs.push(startIdx);
  return ok(base);
}

// ---------------------------------------------------------------------------
// fuseAllBisect
// ---------------------------------------------------------------------------

export function fuseAllBisect(
  shapes: ValidSolid[],
  options?: BooleanOptions
): Result<BatchBisectResult<ValidSolid>>;
export function fuseAllBisect(
  shapes: Shape3D[],
  options: BooleanOptions & { unsafe: true }
): Result<BatchBisectResult>;
export function fuseAllBisect(
  shapes: Shape3D[],
  options: BooleanOptions = {}
): Result<BatchBisectResult> {
  return fuseAllBisectWith(REAL_OPS, shapes, options);
}

/** @internal — testable variant accepting injected kernel ops. */
export function fuseAllBisectWith(
  ops: BisectKernelOps,
  shapes: Shape3D[],
  options: BooleanOptions = {}
): Result<BatchBisectResult> {
  if (options.signal?.aborted) throw options.signal.reason;
  if (shapes.length === 0) {
    return err(
      validationError(BrepErrorCode.FUSE_ALL_EMPTY, 'fuseAllBisect requires at least one shape')
    );
  }
  const telemetry: MutableTelemetry = {
    totalInputs: shapes.length,
    batchAttempts: 0,
    batchSucceeded: 0,
    singletonFallbacks: 0,
    failedInputs: [],
  };
  const result = bisectFuse(ops, shapes, 0, options, telemetry);
  if (isErr(result)) return result;
  return ok({ shape: result.value, telemetry: freezeTelemetry(telemetry) });
}

function bisectFuse(
  ops: BisectKernelOps,
  shapes: readonly Shape3D[],
  startIdx: number,
  options: BooleanOptions,
  telemetry: MutableTelemetry
): Result<Shape3D> {
  if (shapes.length === 1) {
    telemetry.singletonFallbacks++;
    return ok(firstOrThrow(shapes));
  }

  telemetry.batchAttempts++;
  const batchResult = tryBatch(() => ops.fuseAll(shapes as ValidSolid[], options));
  if (batchResult && batchResult.ok) {
    telemetry.batchSucceeded++;
    return batchResult;
  }
  if (options.signal?.aborted) throw options.signal.reason;

  const mid = Math.floor(shapes.length / 2);
  const left = bisectFuse(ops, shapes.slice(0, mid), startIdx, options, telemetry);
  const right = bisectFuse(ops, shapes.slice(mid), startIdx + mid, options, telemetry);
  return combineFuseHalves(ops, left, right, shapes, startIdx, mid, options, telemetry);
}

function combineFuseHalves(
  ops: BisectKernelOps,
  left: Result<Shape3D>,
  right: Result<Shape3D>,
  shapes: readonly Shape3D[],
  startIdx: number,
  mid: number,
  options: BooleanOptions,
  telemetry: MutableTelemetry
): Result<Shape3D> {
  if (left.ok && right.ok) {
    telemetry.batchAttempts++;
    const merged = tryBatch(() =>
      ops.fuse(left.value as ValidSolid, right.value as ValidSolid, options)
    );
    if (merged && merged.ok) {
      telemetry.batchSucceeded++;
      return merged;
    }
    // Final pairwise fuse failed: drop the right side's indices and return left.
    for (let i = mid; i < shapes.length; i++) telemetry.failedInputs.push(startIdx + i);
    return left;
  }
  if (left.ok) {
    for (let i = mid; i < shapes.length; i++) telemetry.failedInputs.push(startIdx + i);
    return left;
  }
  if (right.ok) {
    for (let i = 0; i < mid; i++) telemetry.failedInputs.push(startIdx + i);
    return right;
  }
  return left;
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

/**
 * Run a batch boolean op, returning null on kernel throw (signal-aborts
 * propagate). The caller checks for null and bisects.
 */
function tryBatch<T>(fn: () => Result<T>): Result<T> | null {
  try {
    return fn();
  } catch {
    // Caller re-checks signal.aborted before bisecting, so we don't need
    // to distinguish abort from other throws here.
    return null;
  }
}
