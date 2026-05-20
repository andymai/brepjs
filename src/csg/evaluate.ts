// Cache key = (structuralHash, kernelId, projectedEnvHash, toleranceHash).
// Only the param keys a subtree depends on enter its env projection, so
// unrelated env changes don't invalidate independent subtrees.
//
// Returned shapes are borrowed — owned by the Evaluator's DisposalScope.
// Callers must NOT dispose them; lifetime is the Evaluator's.
import { getActiveKernelId, withKernel } from '@/kernel/index.js';
import { DisposalScope } from '@/core/disposal.js';
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
  private readonly scope = new DisposalScope();
  private readonly cache = new Map<string, AnyShape<Dimension>>();
  // Track which shape handles have been registered with the scope. Identity
  // short-circuits in boolean/transform evaluators forward a child shape up
  // through dispatch, so without this set the same handle would land in
  // scope.handles multiple times — invariant violation even though
  // ShapeHandle.delete() is itself idempotent.
  private readonly registered = new WeakSet<AnyShape<Dimension>>();
  private readonly kernelId: string;
  private readonly defaultTolerance: number | undefined;
  private readonly onStep?: (info: StepInfo) => void;
  private hits = 0;
  private misses = 0;

  constructor(options: EvaluatorOptions = {}) {
    // Resolve to the concrete kernel id at construction so cache keys are
    // stable across `withKernel`/registry mutations during this evaluator's
    // lifetime. Falls back to a literal sentinel only if no kernel is
    // registered yet (in which case evaluate() will throw via getKernel()).
    this.kernelId = options.kernel ?? getActiveKernelId() ?? 'unregistered';
    this.defaultTolerance = options.tolerance;
    if (options.onStep) this.onStep = options.onStep;
  }

  /**
   * Materialize a CSG IR tree against the given parameter environment.
   * The returned shape is borrowed — valid for as long as this Evaluator is
   * not disposed. Callers must NOT call `.delete()` / `[Symbol.dispose]()`
   * on the returned shape; that would invalidate the cache entry for every
   * future call returning the same handle.
   */
  evaluate(node: IRNode, env: Env = {}): Result<AnyShape<Dimension>> {
    return withKernel(this.kernelId, () => this.evaluateInner(node, env));
  }

  private evaluateInner(node: IRNode, env: Env): Result<AnyShape<Dimension>> {
    const key = cacheKey(node, env, this.kernelId, this.defaultTolerance);
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      this.hits++;
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
    if (!this.registered.has(result.value)) {
      this.scope.register(result.value);
      this.registered.add(result.value);
    }
    this.cache.set(key, result.value);
    this.onStep?.({ node, cacheKey: key, cacheHit: false });
    return result;
  }

  cacheStats(): CacheStats {
    return { hits: this.hits, misses: this.misses, entries: this.cache.size };
  }

  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
  }

  [Symbol.dispose](): void {
    this.scope[Symbol.dispose]();
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
