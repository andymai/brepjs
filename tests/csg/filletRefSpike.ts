/**
 * Spike C prototype — a Fillet "node" carrying a serializable EdgeRef, evaluated
 * against the existing Evaluator with a content-addressed side cache.
 * Test-local on purpose: evidence for Phase 4, not shipping code.
 *
 * The spec's hash covers the ref (origin, faceRoles, hint) so the cache key
 * stays purely structural; resolveRefIn runs inside evaluation, deterministic
 * given the materialized target, so (hash, projected env) determines the result.
 */

import { fillet, getEdges } from '@/index.js';
import { assignRoles } from '@/topology/shapeRef/shapeRefFns.js';
import { createEdgeRef } from '@/topology/shapeRef/edgeRefFns.js';
import { resolveRefIn } from '@/topology/shapeRef/refResolveFns.js';
import type { EdgeRef, RoleTable } from '@/topology/shapeRef/shapeRefTypes.js';
import {
  isShape3D,
  isEdge,
  type AnyShape,
  type Dimension,
  type Shape3D,
  type Solid,
} from '@/core/shapeTypes.js';
import { validSolid } from '@/core/validityTypes.js';
import { ok, err, type Result } from '@/core/result.js';
import { validationError } from '@/core/errors.js';
import type { Evaluator, Env, IRNode } from '@/csg/index.js';
import { fnvInit, fnvMixString, fnvMixNumber, fnvMixBool, fnvMixHash, toHex } from '@/csg/hash.js';

// ---------------------------------------------------------------------------
// Spec (the would-be FilletNode)
// ---------------------------------------------------------------------------

export interface FilletSpec {
  readonly target: IRNode;
  readonly ref: EdgeRef;
  readonly radius: number;
}

export function filletSpec(target: IRNode, ref: EdgeRef, radius: number): FilletSpec {
  return { target, ref, radius };
}

export function hashFilletSpec(spec: FilletSpec): bigint {
  let h = fnvMixString(fnvInit(), 'Fillet');
  h = fnvMixHash(h, spec.target.structuralHash);
  h = fnvMixString(h, spec.ref.origin);
  h = fnvMixString(h, spec.ref.faceRoles[0]);
  h = fnvMixString(h, spec.ref.faceRoles[1]);
  const hint = spec.ref.hint;
  h = fnvMixBool(h, hint.length !== undefined);
  if (hint.length !== undefined) h = fnvMixNumber(h, hint.length);
  h = fnvMixBool(h, hint.midpoint !== undefined);
  if (hint.midpoint) {
    for (const c of hint.midpoint) h = fnvMixNumber(h, c);
  }
  return fnvMixNumber(h, spec.radius);
}

// ---------------------------------------------------------------------------
// Test scaffolding
// ---------------------------------------------------------------------------

/** Evaluate a node and narrow to Shape3D (throws on failure — test helper). */
export function materializeShape3D(ev: Evaluator, node: IRNode, env: Env = {}): Shape3D {
  const r = ev.evaluate(node, env);
  if (!r.ok) throw new Error('materializeShape3D: evaluation failed');
  if (!isShape3D(r.value)) throw new Error('materializeShape3D: not a 3D shape');
  return r.value;
}

function near3(a: readonly number[], b: readonly [number, number, number]): boolean {
  return (
    Math.abs((a[0] ?? NaN) - b[0]) < 1e-6 &&
    Math.abs((a[1] ?? NaN) - b[1]) < 1e-6 &&
    Math.abs((a[2] ?? NaN) - b[2]) < 1e-6
  );
}

/** Capture an EdgeRef for the top-front edge of a w x d x h box at the origin
 *  (midpoint [w/2, 0, h]), using semantic 'box' roles. */
export function topFrontEdgeRef(shape: Shape3D, w: number, h: number): EdgeRef {
  const roles: RoleTable = new Map([['box', assignRoles(shape, 'box')]]);
  for (const e of getEdges(shape)) {
    const ref = createEdgeRef('box', e, shape, roles);
    if (ref?.hint.midpoint && near3(ref.hint.midpoint, [w / 2, 0, h])) return ref;
  }
  throw new Error('topFrontEdgeRef: edge not found');
}

// ---------------------------------------------------------------------------
// Evaluator with a content-addressed fillet cache
// ---------------------------------------------------------------------------

export class FilletEvaluator implements Disposable {
  kernelCalls = 0;
  resolutions = 0;
  filletMs = 0;
  private readonly cache = new Map<string, AnyShape<Dimension>>();

  constructor(private readonly ev: Evaluator) {}

  private key(spec: FilletSpec, env: Env): string {
    const projected: Record<string, unknown> = {};
    for (const k of [...spec.target.freeParams].sort()) projected[k] = env[k];
    return `${toHex(hashFilletSpec(spec))}|${JSON.stringify(projected)}`;
  }

  evaluate(spec: FilletSpec, env: Env = {}): Result<AnyShape<Dimension>> {
    const key = this.key(spec, env);
    const cached = this.cache.get(key);
    if (cached !== undefined) return ok(cached);

    const t = this.ev.evaluate(spec.target, env);
    if (!t.ok) return t;
    if (!isShape3D(t.value)) {
      return err(validationError('SPIKE_FILLET', 'Fillet.target did not produce a 3D shape'));
    }
    this.resolutions++;
    const res = resolveRefIn(spec.ref, t.value);
    if (!res.ok) {
      return err(validationError('SPIKE_FILLET', `ref did not resolve: ${res.reason}`));
    }
    if (!isEdge(res.entity)) {
      return err(validationError('SPIKE_FILLET', 'ref resolved to a non-edge'));
    }
    const vs = validSolid(t.value as Solid);
    if (!vs.ok) return err(validationError('SPIKE_FILLET', vs.error));
    const t0 = performance.now();
    const fr = fillet(vs.value, [res.entity], spec.radius);
    this.filletMs += performance.now() - t0;
    this.kernelCalls++;
    if (!fr.ok) return fr;
    this.cache.set(key, fr.value);
    return ok(fr.value);
  }

  /** Mean resolveRefIn wall time over `runs` (fresh role derivation each run,
   *  matching the per-evaluation cost). */
  timeResolutions(shape: Shape3D, ref: EdgeRef, runs: number): number {
    const t0 = performance.now();
    for (let i = 0; i < runs; i++) {
      const r = resolveRefIn(ref, shape);
      if (!r.ok) throw new Error('timeResolutions: ref did not resolve');
    }
    return (performance.now() - t0) / runs;
  }

  [Symbol.dispose](): void {
    for (const s of this.cache.values()) s[Symbol.dispose]();
    this.cache.clear();
  }
}
