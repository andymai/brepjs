// Cache key = (structuralHash, kernelId, projectedEnvHash, toleranceHash).
// Only the param keys a subtree depends on enter its env projection, so
// unrelated env changes don't invalidate independent subtrees.
//
// Returned shapes are borrowed — the Evaluator owns disposal; callers must
// NOT dispose them. By default a returned shape is valid for the Evaluator's
// whole lifetime. If `maxCacheEntries` is set, the cache is LRU-bounded and a
// returned shape is only guaranteed valid until the next successful
// evaluate() call (a failed evaluate() never evicts).
import { getActiveKernelId, withKernel } from '@/kernel/index.js';
import { ok, type Result } from '@/core/result.js';
import type { AnyShape, Dimension } from '@/core/shapeTypes.js';
import { projectEnv, type Env, type ExprValue } from './expressions.js';
import { fnvInit, fnvMixString, fnvMixNumber, fnvMixBool, fnvMixInt32, toHex } from './hash.js';
import type { IRNode } from './types.js';
import type { EvalContext } from './evaluators/context.js';
import {
  evalBox,
  evalSphere,
  evalCylinder,
  evalCone,
  evalTorus,
  evalPolygon,
  evalCircle,
  evalLine,
  evalVertex,
} from './evaluators/primitives.js';
import {
  evalFuse,
  evalCut,
  evalIntersect,
  evalFuseAll,
  evalCutAll,
} from './evaluators/booleans.js';
import { evalTranslate, evalRotate, evalScale, evalMirror } from './evaluators/transforms.js';
import { evalCompound, evalEmpty } from './evaluators/compound.js';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface EvaluatorOptions {
  /** Kernel id to materialize against. Defaults to the currently-active kernel. */
  readonly kernel?: string | undefined;
  /** Default boolean tolerance applied when a node doesn't override it. */
  readonly tolerance?: number | undefined;
  /** Optional callback fired after every node visit, including cache hits (`info.cacheHit` discriminates). */
  readonly onStep?: ((info: StepInfo) => void) | undefined;
  /**
   * Upper bound on the number of materialized entries kept in the content
   * cache. When the cache exceeds this after a top-level evaluate(), the
   * least-recently-used entries are evicted and their kernel handles disposed
   * (a handle shared by several entries is freed only when its last entry is
   * evicted). Defaults to unbounded — entries live for the Evaluator's
   * lifetime. With a bound set, a returned shape is only guaranteed valid
   * until the next successful evaluate() call; a failed or thrown evaluate() is
   * transactional (the cache is left unchanged), and evaluate() is non-reentrant
   * (calling it from an onStep callback throws). Must be a positive integer.
   */
  readonly maxCacheEntries?: number | undefined;
}

export interface StepInfo {
  readonly node: IRNode;
  readonly cacheKey: string;
  readonly cacheHit: boolean;
}

export interface CacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly entries: number;
  /** Number of entries evicted by the LRU bound over this Evaluator's life. */
  readonly evictions: number;
}

// Exhaustive dispatch — TS catches any new NodeKind missing an evaluator at
// compile time, so there's no runtime "unknown kind" fallback.
function dispatch(node: IRNode, ctx: EvalContext): Result<AnyShape<Dimension>> {
  switch (node.kind) {
    case 'Box':
      return evalBox(node, ctx);
    case 'Sphere':
      return evalSphere(node, ctx);
    case 'Cylinder':
      return evalCylinder(node, ctx);
    case 'Cone':
      return evalCone(node, ctx);
    case 'Torus':
      return evalTorus(node, ctx);
    case 'Polygon':
      return evalPolygon(node, ctx);
    case 'Circle':
      return evalCircle(node, ctx);
    case 'Line':
      return evalLine(node, ctx);
    case 'Vertex':
      return evalVertex(node, ctx);
    case 'Empty':
      return evalEmpty();
    case 'Fuse':
      return evalFuse(node, ctx);
    case 'Cut':
      return evalCut(node, ctx);
    case 'Intersect':
      return evalIntersect(node, ctx);
    case 'FuseAll':
      return evalFuseAll(node, ctx);
    case 'CutAll':
      return evalCutAll(node, ctx);
    case 'Translate':
      return evalTranslate(node, ctx);
    case 'Rotate':
      return evalRotate(node, ctx);
    case 'Scale':
      return evalScale(node, ctx);
    case 'Mirror':
      return evalMirror(node, ctx);
    case 'Compound':
      return evalCompound(node, ctx);
  }
}

// ---------------------------------------------------------------------------
// Env projection hash
// ---------------------------------------------------------------------------

function hashExprValue(h: bigint, v: ExprValue): bigint {
  if (typeof v === 'number') return fnvMixNumber(fnvMixBool(h, false), v);
  let r = fnvMixBool(h, true);
  r = fnvMixInt32(r, v.length);
  for (const n of v) r = fnvMixNumber(r, n);
  return r;
}

function projectedEnvHash(env: Env, deps: ReadonlySet<string>): bigint {
  if (deps.size === 0) return fnvInit();
  const projected = projectEnv(env, deps);
  // Sort keys for canonical ordering — env may have arbitrary key order.
  const keys = Object.keys(projected).sort();
  let h = fnvInit();
  for (const k of keys) {
    h = fnvMixString(h, k);
    const v = projected[k];
    if (v !== undefined) h = hashExprValue(h, v);
  }
  return h;
}

function cacheKey(node: IRNode, env: Env, kernelId: string, tolerance: number | undefined): string {
  const projHash = projectedEnvHash(env, node.freeParams);
  const tolHash = tolerance === undefined ? 'd' : fnvMixNumber(fnvInit(), tolerance).toString(16);
  return `${toHex(node.structuralHash)}:${kernelId}:${toHex(projHash)}:${tolHash}`;
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

export class Evaluator implements Disposable {
  private readonly cache = new Map<string, AnyShape<Dimension>>();
  // Reference count per materialized handle. A single handle can back several
  // cache keys because boolean/compound identity short-circuits forward a
  // child handle up unchanged (e.g. Fuse(Empty, b) → b, FuseAll([x]) → x).
  // The cache owns disposal directly: a handle is deleted only when its last
  // referencing entry is evicted, or when the Evaluator is disposed. (A
  // DisposalScope can't back this — it can't release one handle on eviction
  // without releasing the rest.)
  private readonly refCounts = new Map<AnyShape<Dimension>, number>();
  // True while a public evaluate() is in progress. When bounded, evaluate() is
  // non-reentrant (an onStep callback must not call it) — that keeps cache
  // reconciliation simple and rules out a class of use-after-free / contract
  // hazards that arise from mutating the cache mid-evaluation.
  private evaluating = false;
  // Keys inserted during the current evaluate(). On a failed or thrown
  // evaluation they are rolled back, so the call is transactional: the cache is
  // left exactly as it was (bound preserved, older results untouched).
  private readonly pendingKeys: string[] = [];
  private readonly kernelId: string;
  private readonly defaultTolerance: number | undefined;
  private readonly maxCacheEntries: number | undefined;
  private readonly onStep?: (info: StepInfo) => void;
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(options: EvaluatorOptions = {}) {
    // Resolve to the concrete kernel id at construction so cache keys are
    // stable across `withKernel`/registry mutations during this evaluator's
    // lifetime. Falls back to a literal sentinel only if no kernel is
    // registered yet (in which case evaluate() will throw via getKernel()).
    this.kernelId = options.kernel ?? getActiveKernelId() ?? 'unregistered';
    this.defaultTolerance = options.tolerance;
    if (options.onStep) this.onStep = options.onStep;
    const max = options.maxCacheEntries;
    if (max !== undefined && (!Number.isInteger(max) || max < 1)) {
      throw new RangeError(
        `Evaluator: maxCacheEntries must be a positive integer, got ${String(max)}`
      );
    }
    this.maxCacheEntries = max;
  }

  /**
   * Materialize a CSG IR tree against the given parameter environment.
   * The returned shape is borrowed — callers must NOT call `.delete()` /
   * `[Symbol.dispose]()` on it; that would invalidate the cache entry for
   * every future call returning the same handle. By default it stays valid
   * until the Evaluator is disposed; if `maxCacheEntries` is set, only until
   * the next successful evaluate() call (LRU eviction may free older entries),
   * and evaluate() is then non-reentrant — calling it from an onStep callback
   * throws.
   */
  evaluate(node: IRNode, env: Env = {}): Result<AnyShape<Dimension>> {
    // A bounded cache mutates during evaluate(); a reentrant call (e.g. from an
    // onStep callback) could evict operands the outer evaluation still holds.
    // Forbidding reentrancy when bounded keeps reconciliation a simple
    // commit-on-success / rollback-otherwise at a single, non-nested level.
    if (this.maxCacheEntries !== undefined && this.evaluating) {
      throw new Error(
        'Evaluator.evaluate() is not reentrant when maxCacheEntries is set — ' +
          'do not call it from an onStep callback.'
      );
    }
    return withKernel(this.kernelId, () => {
      this.evaluating = true;
      let committed = false;
      try {
        const result = this.evaluateInner(node, env);
        if (this.maxCacheEntries !== undefined && result.ok) {
          // Success: the result is the most-recently-cached entry (no reentrant
          // call could have displaced it), so a bound >= 1 never frees it.
          this.trimCache(this.maxCacheEntries);
        }
        committed = result.ok;
        return result;
      } finally {
        // Any non-success exit — an Err result or a thrown onStep/kernel error
        // — rolls back this call's inserts, so the evaluation is transactional
        // and the bound is never left exceeded.
        if (!committed && this.maxCacheEntries !== undefined) this.rollbackPending();
        this.pendingKeys.length = 0;
        this.evaluating = false;
      }
    });
  }

  private evaluateInner(node: IRNode, env: Env): Result<AnyShape<Dimension>> {
    const key = cacheKey(node, env, this.kernelId, this.defaultTolerance);
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      this.hits++;
      // Touch for LRU recency — only when bounded, so the unbounded path stays
      // behaviourally identical (and allocation-free) to before.
      if (this.maxCacheEntries !== undefined) {
        this.cache.delete(key);
        this.cache.set(key, cached);
      }
      this.onStep?.({ node, cacheKey: key, cacheHit: true });
      return ok(cached);
    }
    this.misses++;
    const ctx: EvalContext = {
      env,
      tolerance: this.defaultTolerance,
      evalNode: (child) => this.evaluateInner(child, env),
    };
    const result = dispatch(node, ctx);
    if (!result.ok) return result;
    const shape = result.value;
    this.refCounts.set(shape, (this.refCounts.get(shape) ?? 0) + 1);
    this.cache.set(key, shape);
    if (this.maxCacheEntries !== undefined) this.pendingKeys.push(key);
    this.onStep?.({ node, cacheKey: key, cacheHit: false });
    return result;
  }

  // Decrement a handle's reference count, disposing it once its last cache
  // entry is gone. A handle shared across keys (via identity short-circuits)
  // survives until its final key is removed, so eviction can never produce a
  // use-after-free.
  private releaseShape(shape: AnyShape<Dimension>): void {
    const next = (this.refCounts.get(shape) ?? 1) - 1;
    if (next <= 0) {
      this.refCounts.delete(shape);
      shape[Symbol.dispose]();
    } else {
      this.refCounts.set(shape, next);
    }
  }

  // Evict least-recently-used entries until the cache is within `max`.
  private trimCache(max: number): void {
    while (this.cache.size > max) {
      const oldest = this.cache.keys().next();
      if (oldest.done) break;
      const key = oldest.value;
      const shape = this.cache.get(key);
      this.cache.delete(key);
      this.evictions++;
      if (shape !== undefined) this.releaseShape(shape);
    }
  }

  // Undo the inserts made during a failed or thrown evaluate(). Removal is by
  // key (not position), so entries merely touched (hit) during the call are
  // kept — only the call's own new entries are dropped.
  private rollbackPending(): void {
    for (const key of this.pendingKeys) {
      const shape = this.cache.get(key);
      if (shape === undefined) continue;
      this.cache.delete(key);
      this.releaseShape(shape);
    }
  }

  cacheStats(): CacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      entries: this.cache.size,
      evictions: this.evictions,
    };
  }

  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  [Symbol.dispose](): void {
    // The cache owns every live handle; dispose each unique handle once.
    for (const shape of this.refCounts.keys()) {
      shape[Symbol.dispose]();
    }
    this.refCounts.clear();
    this.cache.clear();
  }
}

/**
 * Run a callback with a fresh Evaluator that is disposed when the callback
 * returns. Sync-only: an async callback would resolve after disposal,
 * leaving borrowed shapes pointing at freed WASM memory. Mirrors the
 * Promise-guard pattern in `withKernel`.
 */
export function withEvaluator<T extends Exclude<unknown, Promise<unknown>>>(
  options: EvaluatorOptions,
  fn: (evaluator: Evaluator) => T
): T {
  using ev = new Evaluator(options);
  const result = fn(ev);
  if (result instanceof Promise) {
    throw new Error(
      'withEvaluator() callback returned a Promise. ' +
        'Async code must construct an Evaluator directly and dispose it manually — ' +
        'borrowed shapes would otherwise be freed before the Promise resolves.'
    );
  }
  return result;
}
