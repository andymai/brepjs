/**
 * Edit-after-reference harness — the validation the ShapeRef suite was missing.
 *
 * Every other shapeRef test either bypasses the role table (`new Map()`, forcing
 * the geometric fallback) or asserts only "didn't crash / area > 0". These drive
 * the EXACT path through a real `ShapeEvolution` and assert face *identity* after
 * an edit: a modified face is tracked, a generated (fillet/seam) face is named,
 * and a split face resolves to the correct fragment.
 *
 * Gated to the OCCT family: faithful B-rep face evolution is an OCCT-family
 * property (brepkit fillets are a geometric heuristic, manifold is a mesh
 * kernel), so the exact-path assertions only apply there.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { currentKernelId } from './helpers/kernelDivergences.js';
import {
  box,
  translate,
  getFaces,
  getHashCode,
  unwrap,
  isOk,
  measureArea,
  type Face,
} from '@/index.js';
import { fuseWithEvolution } from '@/topology/evolutionFns.js';
import { normalAt, faceCenter, faceGeomType } from '@/topology/faceFns.js';
import { assignRoles, createRef, updateRoles, resolveRef } from '@/topology/shapeRef/index.js';

const isOcctFamily = currentKernelId === 'occt' || currentKernelId === 'occt-wasm';

beforeAll(async () => {
  await initKernel();
}, 30000);

/** Outward +Z alignment of a face's normal. */
function upness(face: Face): number {
  const n = normalAt(face);
  return n[2];
}

describe.skipIf(!isOcctFamily)('shapeRef edit-after-reference (exact path)', () => {
  it('tracks a modified face through evolution and resolves it via the role table', () => {
    // box → fuse a block onto the top face → the top is MODIFIED. updateRoles
    // must carry box:top to its successor so resolveRef finds it via the table,
    // not a bare geometric guess against the whole shape.
    const b = box(20, 20, 20);
    const roles0 = assignRoles(b, 'box');
    const topHashes = roles0.get('box:top');
    expect(topHashes).toBeDefined();
    const topFace = getFaces(b).find((f) => topHashes?.includes(getHashCode(f)));
    expect(topFace).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- checked above
    const topRef = createRef('s0', 'box:top', topFace!);

    const fuseResult = fuseWithEvolution(b, translate(box(8, 8, 8), [6, 6, 20]));
    expect(isOk(fuseResult)).toBe(true);
    const { shape: fused, evolution } = unwrap(fuseResult);

    const updated = updateRoles(new Map([['s0', roles0]]), 's0', evolution);
    const resolved = resolveRef(topRef, updated, fused);

    // The top survives the fuse, so it must resolve (not BrokenRef) to an
    // upward-facing planar face — the box:top successor, not a side wall.
    expect('face' in resolved).toBe(true);
    if ('face' in resolved) {
      expect(faceGeomType(resolved.face)).toBe('PLANE');
      expect(upness(resolved.face)).toBeGreaterThan(0.7);
    }
  });

  it('disambiguates a split face to the correct fragment (Gap 3: all successors)', () => {
    // A big top face partially overlapped by a fused block splits into the large
    // remaining region (z≈10) plus the small new cap on the block (z≈20). A ref
    // captured from the original top (centroid z≈10, large area) must resolve to
    // the large low fragment — competing only against the tracked successors.
    const base = box(30, 30, 10);
    const roles0 = assignRoles(base, 'box');
    const topHashes = roles0.get('box:top');
    const topFace = getFaces(base).find((f) => topHashes?.includes(getHashCode(f)));
    expect(topFace).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- checked above
    const topRef = createRef('s0', 'box:top', topFace!);

    const fuseResult = fuseWithEvolution(base, translate(box(10, 10, 10), [10, 10, 10]));
    expect(isOk(fuseResult)).toBe(true);
    const { shape: fused, evolution } = unwrap(fuseResult);

    const updated = updateRoles(new Map([['s0', roles0]]), 's0', evolution);
    const resolved = resolveRef(topRef, updated, fused);

    expect('face' in resolved).toBe(true);
    if ('face' in resolved) {
      // The large low fragment, not the small raised cap.
      expect(faceGeomType(resolved.face)).toBe('PLANE');
      expect(upness(resolved.face)).toBeGreaterThan(0.7);
      expect(faceCenter(resolved.face)[2]).toBeLessThan(15);
      expect(unwrap(measureArea(resolved.face))).toBeGreaterThan(100);
    }
  });
});
