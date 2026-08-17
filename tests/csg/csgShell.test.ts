/**
 * Shell node — serializable face refs inside a content-hashed node. Same
 * contract as Fillet/Chamfer: refs are node data (the cache key stays purely
 * structural), resolution runs inside evaluation, and an upstream param edit
 * re-targets the same faces by role.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel, currentKernel } from '../setup.js';
import {
  box,
  compound,
  shell,
  param,
  optimize,
  outputKindOf,
  toJSON,
  fromJSON,
  replaceNode,
  Evaluator,
} from '@/csg/index.js';
import { isOk, unwrap, measureVolume, getFaces } from '@/index.js';
import { assignRoles, captureHint, createRef } from '@/topology/shapeRef/shapeRefFns.js';
import { roleOfFace } from '@/topology/shapeRef/roleLookup.js';
import type { RoleTable, ShapeRef } from '@/topology/shapeRef/shapeRefTypes.js';
import { isShape3D, type AnyShape, type Dimension } from '@/core/shapeTypes.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

function vol(s: AnyShape<Dimension>): number {
  return unwrap(measureVolume(s));
}

const itBrep = it.skipIf(currentKernel === 'manifold');

/** Volume of a w x d x h box hollowed to wall thickness t with the top face
 *  (z = h) removed: inner void = (w-2t)(d-2t)(h-t). */
function openTopVol(w: number, d: number, h: number, t: number): number {
  return w * d * h - (w - 2 * t) * (d - 2 * t) * (h - t);
}

/** Capture a ShapeRef for the top face of a box(w, 40, 30) evaluated at
 *  env {w}, using the semantic 'box' role scheme. */
function topFaceRef(ev: Evaluator, env: Record<string, number>): ShapeRef {
  const r = ev.evaluate(box(param('w'), 40, 30), env);
  const shape = unwrap(r);
  if (!isShape3D(shape)) throw new Error('expected a 3D shape');
  const roles: RoleTable = new Map([['box', assignRoles(shape, 'box')]]);
  for (const f of getFaces(shape)) {
    const hint = captureHint(f);
    if (hint.centroid && Math.abs(hint.centroid[2] - 30) < 1e-6) {
      const role = roleOfFace(f, 'box', roles);
      if (role === undefined) throw new Error('top face has no role');
      return createRef('box', role, f);
    }
  }
  throw new Error('top face not found');
}

describe('Shell node', () => {
  itBrep('hollows the target leaving the referenced face open, exact volume', () => {
    using ev = new Evaluator();
    const ref = topFaceRef(ev, { w: 100 });
    const node = shell(box(param('w'), 40, 30), [ref], 5);
    expect(outputKindOf(node)).toBe('Solid');
    const r = ev.evaluate(node, { w: 100 });
    expect(isOk(r)).toBe(true);
    expect(vol(unwrap(r))).toBeCloseTo(openTopVol(100, 40, 30, 5), -1);
  });

  itBrep('cache is sound: pure hit on same env, re-target on upstream edit', () => {
    using ev = new Evaluator();
    const ref = topFaceRef(ev, { w: 100 });
    const node = shell(box(param('w'), 40, 30), [ref], 5);

    const r1 = ev.evaluate(node, { w: 100 });
    expect(isOk(r1)).toBe(true);
    const s1 = ev.cacheStats();

    const r2 = ev.evaluate(node, { w: 100 });
    expect(unwrap(r2)).toBe(unwrap(r1));
    expect(ev.cacheStats().misses).toBe(s1.misses);

    // Upstream edit: the box stretches; the ref (hint now stale) must
    // re-target the SAME top face by its role.
    const r3 = ev.evaluate(node, { w: 160 });
    expect(isOk(r3)).toBe(true);
    expect(vol(unwrap(r3))).toBeCloseTo(openTopVol(160, 40, 30, 5), -1);
  });

  itBrep('ref data, ref order, and thickness enter the content address', () => {
    using ev = new Evaluator();
    const ref = topFaceRef(ev, { w: 100 });
    const t = box(param('w'), 40, 30);
    expect(shell(t, [ref], 5).structuralHash).not.toBe(shell(t, [ref], 6).structuralHash);
    const other: ShapeRef = { ...ref, role: 'box:bottom' };
    expect(shell(t, [other], 5).structuralHash).not.toBe(shell(t, [ref], 5).structuralHash);
    expect(shell(t, [ref, other], 5).structuralHash).not.toBe(
      shell(t, [other, ref], 5).structuralHash
    );
    expect(shell(t, [ref], 5).structuralHash).toBe(
      shell(box(param('w'), 40, 30), [{ ...ref }], 5).structuralHash
    );
  });

  itBrep('serialize round-trip preserves the structural hash', () => {
    using ev = new Evaluator();
    const ref = topFaceRef(ev, { w: 100 });
    const node = shell(box(param('w'), 40, 30), [ref], param('t'));
    const back = fromJSON(toJSON(node));
    expect(isOk(back)).toBe(true);
    expect(unwrap(back).structuralHash).toBe(node.structuralHash);
  });

  itBrep('optimize() and replaceNode rebuild through Shell', () => {
    using ev = new Evaluator();
    const ref = topFaceRef(ev, { w: 100 });
    const node = shell(box(param('w'), 40, 30), [ref], 5);
    expect(optimize(node).structuralHash).toBe(node.structuralHash);
    const swapped = replaceNode(node, (n) => n.kind === 'Box', box(200, 40, 30));
    expect(swapped.kind).toBe('Shell');
    expect(swapped.structuralHash).not.toBe(node.structuralHash);
  });

  itBrep('is immune to caller mutation of refs after construction', () => {
    using ev = new Evaluator();
    const ref = topFaceRef(ev, { w: 100 });
    const mutableRef = { origin: ref.origin, role: ref.role, hint: { ...ref.hint } };
    const mutableRefs = [mutableRef];
    const node = shell(box(param('w'), 40, 30), mutableRefs, 5);
    mutableRef.role = 'box:bottom';
    mutableRefs.pop();
    expect(node.refs).toHaveLength(1);
    expect(node.refs[0]?.role).toBe(ref.role);
    const r = ev.evaluate(node, { w: 100 });
    expect(isOk(r)).toBe(true);
    expect(vol(unwrap(r))).toBeCloseTo(openTopVol(100, 40, 30, 5), -1);
  });

  it('an empty ref list throws at construction', () => {
    expect(() => shell(box(10, 10, 10), [], 2)).toThrow(/at least one/i);
  });

  itBrep('rejects a non-solid 3D target with a Result error', () => {
    using ev = new Evaluator();
    const ref = topFaceRef(ev, { w: 100 });
    const target = compound([box(10, 10, 10), box(5, 5, 5)]);
    expect(isOk(ev.evaluate(shell(target, [ref], 2)))).toBe(false);
  });

  itBrep('a stale role with a live hint resolves via geometric fallback', () => {
    // Face ShapeRefs differ from EdgeRefs here: the hint is a first-class
    // fallback (MIN_SCORE-gated), not just an ambiguity tiebreak.
    using ev = new Evaluator();
    const ref = topFaceRef(ev, { w: 100 });
    const staleRole: ShapeRef = { ...ref, role: 'box:nope' };
    const r = ev.evaluate(shell(box(param('w'), 40, 30), [staleRole], 5), { w: 100 });
    expect(isOk(r)).toBe(true);
    expect(vol(unwrap(r))).toBeCloseTo(openTopVol(100, 40, 30, 5), -1);
  });

  itBrep('an unresolvable ref surfaces as a Result error', () => {
    using ev = new Evaluator();
    const bogus: ShapeRef = {
      origin: 'box',
      role: 'box:nope',
      hint: { entityType: 'face', normal: [0, 0, 1], centroid: [1e9, 1e9, 1e9], area: 1e-9 },
    };
    const r = ev.evaluate(shell(box(param('w'), 40, 30), [bogus], 5), { w: 100 });
    expect(isOk(r)).toBe(false);
  });

  itBrep('rejects a non-finite or non-positive thickness', () => {
    using ev = new Evaluator();
    const ref = topFaceRef(ev, { w: 100 });
    expect(isOk(ev.evaluate(shell(box(param('w'), 40, 30), [ref], 0), { w: 100 }))).toBe(false);
    expect(
      isOk(ev.evaluate(shell(box(param('w'), 40, 30), [ref], param('t')), { w: 100, t: NaN }))
    ).toBe(false);
  });
});
