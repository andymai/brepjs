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
import { qualityDeflection } from '@/kernel/quality.js';
import { ok, type Result } from '@/core/result.js';
import type { AnyShape, Dimension } from '@/core/shapeTypes.js';
import type { Vec3 } from '@/utils/vec3.js';
import { quatFromAxisAngle, quatMultiply, quatRotate, type Quat } from '@/utils/quaternion.js';
import { getFaces } from '@/topology/topologyQueryFns.js';
import { getHashCode } from '@/topology/shapeFns.js';
import { mesh, type ShapeMesh, type MeshOptions } from '@/topology/meshFns.js';
import { buildMeshCacheKey } from '@/topology/meshCache.js';
import { evalScalar, evalVec3, projectEnv, type Env, type ExprValue } from './expressions.js';
import { fnvInit, fnvMixString, fnvMixNumber, fnvMixBool, fnvMixInt32, toHex } from './hash.js';
import type { IRNode, RotateNode } from './types.js';
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
import { evalInstance } from './evaluators/instance.js';

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
  /**
   * Upper bound on entries in the {@link Evaluator.evaluateMesh} content cache,
   * which is independent of the shape cache. Defaults to unbounded. Bounding it
   * separately is what lets a mesh outlive its (evicted) kernel shape, so a
   * re-`evaluateMesh` is a pure data hit with no re-materialization. Must be a
   * positive integer.
   */
  readonly maxMeshCacheEntries?: number | undefined;
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
    case 'Instance':
      return evalInstance(node, ctx);
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

const IDENTITY_QUAT: Quat = [1, 0, 0, 0];

/** Resolve a Rotate node's angle/axis/center in `env`, applying the same
 *  defaults as the evaluator (Z axis, origin pivot). Null if any free param
 *  can't be evaluated, so the caller stops peeling there. */
function evalRotateParams(
  node: RotateNode,
  env: Env
): { angle: number; axis: Vec3; center: Vec3 } | null {
  const a = evalScalar(node.angle, env, 'evaluateMesh.peelRigid');
  if (!a.ok) return null;
  const axis = node.axis ? evalVec3(node.axis, env, 'evaluateMesh.peelRigid') : ok<Vec3>([0, 0, 1]);
  if (!axis.ok) return null;
  const center = node.at ? evalVec3(node.at, env, 'evaluateMesh.peelRigid') : ok<Vec3>([0, 0, 0]);
  if (!center.ok) return null;
  return { angle: a.value, axis: axis.value, center: center.value };
}

/**
 * Peel outer rigid-motion nodes (Translate / Rotate) off `node`, composing them
 * into a single rotation + translation. A rigid motion shares its inner
 * geometry's tessellation — the shape path re-tags it via `locate` (#1633) — so
 * the inner meshes once and the cached mesh is moved per placement instead of
 * re-tessellating. Stops at the first non-rigid node (Scale/Mirror/boolean/…) or
 * one whose parameters can't be evaluated in `env`.
 *
 * Composition is outer∘inner: peeling outward, each node's local transform acts
 * on points the inner nodes already placed, so it post-multiplies the
 * accumulator. A pure-translation chain keeps the identity rotation, so the mesh
 * move below degenerates to the exact vertex-shift fast path (normals untouched).
 */
function peelRigid(node: IRNode, env: Env): { inner: IRNode; rot: Quat; trans: Vec3 } {
  let inner = node;
  let rot: Quat = IDENTITY_QUAT;
  let trans: Vec3 = [0, 0, 0];
  for (;;) {
    if (inner.kind === 'Translate') {
      const v = evalVec3(inner.vector, env, 'evaluateMesh.peelRigid');
      if (!v.ok) break;
      // f(p + v) = rot·p + (rot·v + trans): the offset enters the current frame.
      const rv = quatRotate(rot, v.value);
      trans = [trans[0] + rv[0], trans[1] + rv[1], trans[2] + rv[2]];
      inner = inner.target;
    } else if (inner.kind === 'Rotate') {
      const p = evalRotateParams(inner, env);
      if (!p) break;
      // CSG rotate angle is in degrees (the kernel applies ·π/180); match it.
      const r = quatFromAxisAngle(p.axis, (p.angle * Math.PI) / 180);
      const newRot = quatMultiply(rot, r);
      // f(r·(p − c) + c) = (rot·r)·p + [rot·c − (rot·r)·c + trans].
      const rotC = quatRotate(rot, p.center);
      const newRotC = quatRotate(newRot, p.center);
      trans = [
        trans[0] + rotC[0] - newRotC[0],
        trans[1] + rotC[1] - newRotC[1],
        trans[2] + rotC[2] - newRotC[2],
      ];
      rot = newRot;
      inner = inner.target;
    } else {
      break;
    }
  }
  return { inner, rot, trans };
}

function isIdentityQuat(q: Quat): boolean {
  return q[0] === 1 && q[1] === 0 && q[2] === 0 && q[3] === 0;
}

/**
 * Write `src` (flat xyz) rigidly transformed by quaternion (qw,qx,qy,qz) then
 * translation (tx,ty,tz) into `dst`. The quaternion-rotate math is inlined with
 * scalar locals — no per-vertex array allocation — because this runs once per
 * mesh vertex/normal and helper-allocated vector math regressed the gridfinity
 * benchmark 17% (see `utils/vec3.ts`). Pass zero translation for normals.
 */
function rotateXyzBuffer(
  dst: Float32Array,
  src: Float32Array,
  qw: number,
  qx: number,
  qy: number,
  qz: number,
  tx: number,
  ty: number,
  tz: number
): void {
  for (let i = 0; i < src.length; i += 3) {
    const vx = src[i] ?? 0;
    const vy = src[i + 1] ?? 0;
    const vz = src[i + 2] ?? 0;
    const cx = 2 * (qy * vz - qz * vy);
    const cy = 2 * (qz * vx - qx * vz);
    const cz = 2 * (qx * vy - qy * vx);
    dst[i] = vx + qw * cx + (qy * cz - qz * cy) + tx;
    dst[i + 1] = vy + qw * cy + (qz * cx - qx * cz) + ty;
    dst[i + 2] = vz + qw * cz + (qx * cy - qy * cx) + tz;
  }
}

/**
 * Apply a rigid motion to a mesh: vertices get the rotation then translation,
 * normals get the rotation only (a unit rotation preserves length, so no
 * renormalization). UVs and triangles are motion-invariant. A pure translation
 * (identity rotation) keeps the source normals array by reference and only
 * shifts vertices — the exact previous translation-only fast path.
 */
function transformMeshRigid(m: ShapeMesh, rot: Quat, trans: Vec3): ShapeMesh {
  const [tx, ty, tz] = trans;
  const pureTranslation = isIdentityQuat(rot);
  if (pureTranslation && tx === 0 && ty === 0 && tz === 0) return m;

  const src = m.vertices;
  const vertices = new Float32Array(src.length);
  if (pureTranslation) {
    for (let i = 0; i < src.length; i += 3) {
      vertices[i] = (src[i] ?? 0) + tx;
      vertices[i + 1] = (src[i + 1] ?? 0) + ty;
      vertices[i + 2] = (src[i + 2] ?? 0) + tz;
    }
    return { ...m, vertices };
  }

  const [qw, qx, qy, qz] = rot;
  rotateXyzBuffer(vertices, src, qw, qx, qy, qz, tx, ty, tz);
  const sn = m.normals;
  const normals = new Float32Array(sn.length);
  rotateXyzBuffer(normals, sn, qw, qx, qy, qz, 0, 0, 0);
  return { ...m, vertices, normals };
}

/**
 * Re-key a reused inner mesh's face groups onto the PLACED shape. `locate` gives
 * moved faces location-dependent hashes, so the inner mesh's `faceId`s describe
 * the *unplaced* shape; remap them to the placed faces (1:1 by iteration order,
 * since `locate` shares the source TShape) so face picking and metadata lookup
 * resolve against the placed mesh. Origins are boolean-lineage tags, invariant
 * under any rigid motion, so only `faceId` changes.
 *
 * Takes pre-captured hash arrays (not shapes): a bounded shape cache can evict
 * and dispose one shape while the other is being evaluated, so the caller reads
 * each shape's face hashes immediately after evaluating it, never holding a
 * shape handle across the next `evaluate`.
 */
function relocateFaceGroups(
  faceGroups: ShapeMesh['faceGroups'],
  innerHashes: readonly number[],
  placedHashes: readonly number[]
): ShapeMesh['faceGroups'] {
  const remap = new Map<number, number>();
  const n = Math.min(innerHashes.length, placedHashes.length);
  for (let i = 0; i < n; i++) {
    const a = innerHashes[i];
    const b = placedHashes[i];
    if (a !== undefined && b !== undefined) remap.set(a, b);
  }
  return faceGroups.map((g) => ({ ...g, faceId: remap.get(g.faceId) ?? g.faceId }));
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
  private readonly maxMeshCacheEntries: number | undefined;
  // Content-addressed mesh cache, keyed by the shape's cache key + mesh params.
  // A mesh is plain data (not a kernel handle), so this can outlive an evicted
  // shape — a re-evaluateMesh of evicted content is a pure hit, no kernel work.
  private readonly meshCache = new Map<string, ShapeMesh>();
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
    const meshMax = options.maxMeshCacheEntries;
    if (meshMax !== undefined && (!Number.isInteger(meshMax) || meshMax < 1)) {
      throw new RangeError(
        `Evaluator: maxMeshCacheEntries must be a positive integer, got ${String(meshMax)}`
      );
    }
    this.maxMeshCacheEntries = meshMax;
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

  /**
   * Materialize a node and mesh it, caching the mesh by the shape's content key
   * plus the mesh parameters. The mesh cache is independent of the shape cache:
   * a hit returns the cached mesh without evaluating or meshing — even after the
   * shape was LRU-evicted (a mesh is plain data, not a kernel handle). The
   * returned mesh is borrowed (do not mutate it); it stays valid for the
   * Evaluator's lifetime, or until `maxMeshCacheEntries` evicts it.
   */
  evaluateMesh(
    node: IRNode,
    env: Env = {},
    meshOpts: MeshOptions & { skipNormals?: boolean; includeUVs?: boolean; cache?: boolean } = {}
  ): Result<ShapeMesh> {
    // Honor an already-aborted signal up front, matching mesh()'s contract:
    // otherwise a cancelled call could still return a cached mesh, or do a full
    // materialize (and trigger shape-cache eviction) before mesh() finally throws.
    meshOpts.signal?.throwIfAborted();

    const useCache = meshOpts.cache ?? true;
    const quality = qualityDeflection();
    const tolerance = meshOpts.tolerance ?? quality.tolerance;
    const angularTolerance = meshOpts.angularTolerance ?? quality.angularTolerance;
    const shapeKey = cacheKey(node, env, this.kernelId, this.defaultTolerance);
    const meshKey = `${shapeKey}|${buildMeshCacheKey(
      tolerance,
      angularTolerance,
      meshOpts.skipNormals ?? false,
      meshOpts.includeUVs ?? false
    )}`;

    if (useCache) {
      const cached = this.meshCache.get(meshKey);
      if (cached !== undefined) {
        if (this.maxMeshCacheEntries !== undefined) {
          this.meshCache.delete(meshKey);
          this.meshCache.set(meshKey, cached);
        }
        return ok(cached);
      }

      // Placement-stripped reuse: a rigid-motion chain (translate/rotate) meshes
      // its inner geometry once (shared across every placement) and moves the
      // cached mesh per placement, instead of re-tessellating the relocated
      // shape. The placed shape is still materialized (an O(1) locate) so face
      // groups can be re-keyed onto its faces; only the tessellation is skipped.
      const { inner, rot, trans } = peelRigid(node, env);
      if (inner !== node) {
        const innerMesh = this.evaluateMesh(inner, env, meshOpts);
        if (!innerMesh.ok) return innerMesh;
        // Order matters under a bounded cache (face hashes are instance-specific):
        // capture the inner hashes FIRST, from the just-meshed instance (a cache
        // hit), so they match innerMesh's faceGroups even if evaluating the placed
        // shape next evicts the inner. Capture each shape's hashes inline (plain
        // numbers) so no shape handle is held across the next evaluate.
        const innerShape = this.evaluate(inner, env);
        if (!innerShape.ok) return innerShape;
        const innerHashes = getFaces(innerShape.value).map(getHashCode);
        const placedShape = this.evaluate(node, env);
        if (!placedShape.ok) return placedShape;
        const placedHashes = getFaces(placedShape.value).map(getHashCode);
        const moved = transformMeshRigid(innerMesh.value, rot, trans);
        const faceGroups = relocateFaceGroups(moved.faceGroups, innerHashes, placedHashes);
        // Trust the reuse only if every group mapped onto a placed face. If the
        // inner mesh was cached from an earlier, now-evicted inner instance, its
        // faceIds won't match the fresh innerHashes and won't remap — fall
        // through to meshing the placed shape so the IDs stay correct.
        const placedSet = new Set(placedHashes);
        if (faceGroups.every((g) => placedSet.has(g.faceId))) {
          const placed: ShapeMesh = { ...moved, faceGroups };
          this.meshCache.set(meshKey, placed);
          if (this.maxMeshCacheEntries !== undefined) this.trimMeshCache(this.maxMeshCacheEntries);
          return ok(placed);
        }
      }
    }

    const shape = this.evaluate(node, env);
    if (!shape.ok) return shape;
    // Mesh under the evaluator's kernel so getKernel() doesn't pick up an
    // unrelated ambient kernel after evaluate() restores the prior context.
    // `cache: false` flows through to mesh(), bypassing its identity cache too.
    const built = withKernel(this.kernelId, () => mesh(shape.value, meshOpts));
    if (useCache) {
      this.meshCache.set(meshKey, built);
      if (this.maxMeshCacheEntries !== undefined) this.trimMeshCache(this.maxMeshCacheEntries);
    }
    return ok(built);
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

  // Evict least-recently-used mesh entries until within `max`. A mesh is plain
  // data (no kernel handle), so eviction just drops the reference — no disposal.
  private trimMeshCache(max: number): void {
    while (this.meshCache.size > max) {
      const oldest = this.meshCache.keys().next();
      if (oldest.done) break;
      this.meshCache.delete(oldest.value);
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
    this.meshCache.clear();
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
