/**
 * Evaluator — materializes a CSG IR tree into a kernel-backed shape, with
 * content-addressed memoization scoped to the evaluator's lifetime.
 *
 * Cache key = (structuralHash, kernelId, projectedEnvHash, toleranceHash).
 * Projected-env hash means a subtree only invalidates when an actual
 * parameter it depends on changes — a different `height` doesn't invalidate
 * a subtree whose `freeParams` is `{radius}`.
 *
 * Lifetime: the cached shape handles are owned by the Evaluator. The
 * returned shape from `evaluate()` is **borrowed** — valid only until the
 * Evaluator is disposed. Use `using ev = new Evaluator(...)` or `withEvaluator`.
 */

import { withKernel } from '@/kernel/index.js';
import { DisposalScope } from '@/core/disposal.js';
import { ok, err, type Result } from '@/core/result.js';
import { computationError, BrepErrorCode } from '@/core/errors.js';
import type { AnyShape, Dimension } from '@/core/shapeTypes.js';
import { projectEnv, type Env, type ExprValue } from './expressions.js';
import { fnvInit, fnvMixString, fnvMixNumber, fnvMixBool, fnvMixInt32, toHex } from './hash.js';
import type { IRNode, NodeKind } from './types.js';
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
  /** Optional callback fired after each node is materialized (cache hits not reported). */
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

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

type EvalFn = (node: IRNode, ctx: EvalContext) => Result<AnyShape<Dimension>>;

// Cast helpers — each registered fn accepts the union node and narrows internally.
const REGISTRY: ReadonlyMap<NodeKind, EvalFn> = new Map<NodeKind, EvalFn>([
  ['Box', evalBox as EvalFn],
  ['Sphere', evalSphere as EvalFn],
  ['Cylinder', evalCylinder as EvalFn],
  ['Cone', evalCone as EvalFn],
  ['Torus', evalTorus as EvalFn],
  ['Polygon', evalPolygon as EvalFn],
  ['Circle', evalCircle as EvalFn],
  ['Line', evalLine as EvalFn],
  ['Vertex', evalVertex as EvalFn],
  ['Empty', (_node, _ctx) => evalEmpty()],
  ['Fuse', evalFuse as EvalFn],
  ['Cut', evalCut as EvalFn],
  ['Intersect', evalIntersect as EvalFn],
  ['FuseAll', evalFuseAll as EvalFn],
  ['CutAll', evalCutAll as EvalFn],
  ['Translate', evalTranslate as EvalFn],
  ['Rotate', evalRotate as EvalFn],
  ['Scale', evalScale as EvalFn],
  ['Mirror', evalMirror as EvalFn],
  ['Compound', evalCompound as EvalFn],
]);

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
  private readonly kernelId: string;
  private readonly defaultTolerance: number | undefined;
  private readonly onStep?: (info: StepInfo) => void;
  private hits = 0;
  private misses = 0;

  constructor(options: EvaluatorOptions = {}) {
    this.kernelId = options.kernel ?? 'default';
    this.defaultTolerance = options.tolerance;
    if (options.onStep) this.onStep = options.onStep;
  }

  /**
   * Materialize a CSG IR tree against the given parameter environment.
   * The returned shape is borrowed — valid until this Evaluator is disposed.
   */
  evaluate(node: IRNode, env: Env = {}): Result<AnyShape<Dimension>> {
    if (this.kernelId !== 'default') {
      return withKernel(this.kernelId, () => this.evaluateInner(node, env));
    }
    return this.evaluateInner(node, env);
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
    const fn = REGISTRY.get(node.kind);
    if (!fn) {
      return err(
        computationError(
          BrepErrorCode.NULL_SHAPE_INPUT,
          `Evaluator: no evaluator registered for node kind ${node.kind}`
        )
      );
    }
    const result = fn(node, ctx);
    if (!result.ok) return result;
    this.scope.register(result.value);
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
 * Convenience: run a callback with a freshly-created Evaluator that is
 * disposed automatically when the callback returns. Mirrors `withScope`.
 */
export function withEvaluator<T>(options: EvaluatorOptions, fn: (evaluator: Evaluator) => T): T {
  using ev = new Evaluator(options);
  return fn(ev);
}
