/**
 * Fillet node — a serializable EdgeRef inside a content-hashed node. The
 * cache key stays purely structural (the ref is node data); resolution runs
 * inside evaluation and re-targets the same edge under upstream param edits.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel, currentKernel } from '../setup.js';
import {
  box,
  compound,
  fillet,
  param,
  optimize,
  outputKindOf,
  toJSON,
  fromJSON,
  replaceNode,
  Evaluator,
  CSG_VERSION,
} from '@/csg/index.js';
import { isOk, unwrap, measureVolume, getEdges } from '@/index.js';
import { assignRoles } from '@/topology/shapeRef/shapeRefFns.js';
import { createEdgeRef } from '@/topology/shapeRef/edgeRefFns.js';
import type { EdgeRef, RoleTable } from '@/topology/shapeRef/shapeRefTypes.js';
import { isShape3D, type AnyShape, type Dimension } from '@/core/shapeTypes.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

function vol(s: AnyShape<Dimension>): number {
  return unwrap(measureVolume(s));
}

const itBrep = it.skipIf(currentKernel === 'manifold');

/** Volume of a w x d x h box with one edge (length w) filleted at radius r. */
function filletedVol(w: number, d: number, h: number, r: number): number {
  return w * d * h - (1 - Math.PI / 4) * r * r * w;
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
function topFrontEdgeRef(ev: Evaluator, w: number, h: number, env = {}): EdgeRef {
  const r = ev.evaluate(box(param('w'), 40, 30), env);
  const shape = unwrap(r);
  if (!isShape3D(shape)) throw new Error('expected a 3D shape');
  const roles: RoleTable = new Map([['box', assignRoles(shape, 'box')]]);
  for (const e of getEdges(shape)) {
    const ref = createEdgeRef('box', e, shape, roles);
    if (ref?.hint.midpoint && near3(ref.hint.midpoint, [w / 2, 0, h])) return ref;
  }
  throw new Error('top-front edge not found');
}

describe('Fillet node', () => {
  itBrep('fillets the referenced edge with exact volume', () => {
    using ev = new Evaluator();
    const ref = topFrontEdgeRef(ev, 100, 30, { w: 100 });
    const node = fillet(box(param('w'), 40, 30), ref, 5);
    expect(outputKindOf(node)).toBe('Solid');
    const r = ev.evaluate(node, { w: 100 });
    expect(isOk(r)).toBe(true);
    expect(vol(unwrap(r))).toBeCloseTo(filletedVol(100, 40, 30, 5), -1);
  });

  itBrep('cache is sound: pure hit on same env, re-target on upstream edit', () => {
    using ev = new Evaluator();
    const ref = topFrontEdgeRef(ev, 100, 30, { w: 100 });
    const node = fillet(box(param('w'), 40, 30), ref, 5);

    const r1 = ev.evaluate(node, { w: 100 });
    expect(isOk(r1)).toBe(true);
    const s1 = ev.cacheStats();

    // Same env: the Fillet node itself is a cache hit — no re-resolution,
    // no kernel fillet, same handle.
    const r2 = ev.evaluate(node, { w: 100 });
    expect(unwrap(r2)).toBe(unwrap(r1));
    const s2 = ev.cacheStats();
    expect(s2.misses).toBe(s1.misses);

    // Upstream edit: the box stretches; the ref (authored at w=100, hint now
    // stale) must re-target the SAME top-front edge, now 160 long.
    const r3 = ev.evaluate(node, { w: 160 });
    expect(isOk(r3)).toBe(true);
    expect(vol(unwrap(r3))).toBeCloseTo(filletedVol(160, 40, 30, 5), -1);
  });

  itBrep('ref data and radius enter the content address', () => {
    using ev = new Evaluator();
    const ref = topFrontEdgeRef(ev, 100, 30, { w: 100 });
    const t = box(param('w'), 40, 30);
    expect(fillet(t, ref, 5).structuralHash).not.toBe(fillet(t, ref, 6).structuralHash);
    const other: EdgeRef = { ...ref, faceRoles: [ref.faceRoles[0], 'box:back'] };
    expect(fillet(t, other, 5).structuralHash).not.toBe(fillet(t, ref, 5).structuralHash);
    expect(fillet(t, ref, 5).structuralHash).toBe(
      fillet(box(param('w'), 40, 30), { ...ref }, 5).structuralHash
    );
  });

  itBrep('serialize round-trip preserves the structural hash', () => {
    using ev = new Evaluator();
    const ref = topFrontEdgeRef(ev, 100, 30, { w: 100 });
    const node = fillet(box(param('w'), 40, 30), ref, param('r'));
    const back = fromJSON(toJSON(node));
    expect(isOk(back)).toBe(true);
    expect(unwrap(back).structuralHash).toBe(node.structuralHash);
  });

  it('envelope version is 5', () => {
    expect(CSG_VERSION).toBe(5);
  });

  itBrep('optimize() and replaceNode rebuild through Fillet', () => {
    using ev = new Evaluator();
    const ref = topFrontEdgeRef(ev, 100, 30, { w: 100 });
    const node = fillet(box(param('w'), 40, 30), ref, 5);
    expect(optimize(node).structuralHash).toBe(node.structuralHash);
    const swapped = replaceNode(node, (n) => n.kind === 'Box', box(200, 40, 30));
    expect(swapped.kind).toBe('Fillet');
    expect(swapped.structuralHash).not.toBe(node.structuralHash);
  });

  itBrep('is immune to caller mutation of the ref after construction', () => {
    using ev = new Evaluator();
    const ref = topFrontEdgeRef(ev, 100, 30, { w: 100 });
    const mutable = {
      origin: ref.origin,
      faceRoles: [ref.faceRoles[0], ref.faceRoles[1]] as [string, string],
      hint: { ...ref.hint },
    };
    const node = fillet(box(param('w'), 40, 30), mutable, 5);
    mutable.faceRoles[1] = 'box:back';
    mutable.origin = 'mutated';
    expect(node.ref.faceRoles[1]).toBe(ref.faceRoles[1]);
    const r = ev.evaluate(node, { w: 100 });
    expect(isOk(r)).toBe(true);
    expect(vol(unwrap(r))).toBeCloseTo(filletedVol(100, 40, 30, 5), -1);
  });

  itBrep('rejects a non-solid 3D target with a Result error', () => {
    using ev = new Evaluator();
    const ref = topFrontEdgeRef(ev, 100, 30, { w: 100 });
    const compoundTarget = compound([box(10, 10, 10), box(5, 5, 5)]);
    expect(isOk(ev.evaluate(fillet(compoundTarget, ref, 2)))).toBe(false);
  });

  itBrep('an unresolvable ref surfaces as a Result error', () => {
    using ev = new Evaluator();
    const ref = topFrontEdgeRef(ev, 100, 30, { w: 100 });
    const bogus: EdgeRef = { ...ref, faceRoles: ['box:nope', 'box:missing'] };
    const r = ev.evaluate(fillet(box(param('w'), 40, 30), bogus, 5), { w: 100 });
    expect(isOk(r)).toBe(false);
  });
});
