import { describe, it, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import { currentKernel, initKernel } from '../setup.js';
import {
  box,
  translate,
  fuse,
  cut,
  intersect,
  measureVolume,
  unwrap,
  isOk,
  isShape3D,
} from '@/index.js';
import type { Shape3D } from '@/index.js';
import { arbBox } from './arbitraries.js';

// WASM boolean ops are slow — limit runs
fc.configureGlobal({ numRuns: 25 });

/** Helper: create a positioned box solid. */
function makeBox(params: {
  width: number;
  height: number;
  depth: number;
  position: [number, number, number];
}): Shape3D {
  // box(width, depth, height) — note parameter order
  return translate(box(params.width, params.depth, params.height), params.position);
}

/** Helper: get volume, returning 0 on error. */
function volume(s: Shape3D): number {
  const result = measureVolume(s);
  if (isOk(result)) return result.value;
  return 0;
}

/** Relative tolerance for floating-point volume comparisons. */
const VOL_REL_TOL = 1e-3;

// Property tests require reliable boolean ops — skip on brepkit (known issues)
describe.skipIf(currentKernel !== 'occt')('Boolean operation properties', () => {
  beforeAll(async () => {
    await initKernel();
  }, 30000);

  // ── Union properties ──

  it('union commutativity: volume(fuse(A,B)) = volume(fuse(B,A))', () => {
    fc.assert(
      fc.property(arbBox, arbBox, (a, b) => {
        const sa = makeBox(a);
        const sb = makeBox(b);
        const ab = unwrap(fuse(sa, sb));
        const ba = unwrap(fuse(sb, sa));
        const vAB = volume(ab);
        const vBA = volume(ba);
        return Math.abs(vAB - vBA) < VOL_REL_TOL * Math.max(vAB, vBA, 1);
      })
    );
  });

  it('intersection commutativity: volume(intersect(A,B)) = volume(intersect(B,A))', () => {
    fc.assert(
      fc.property(arbBox, arbBox, (a, b) => {
        const sa = makeBox(a);
        const sb = makeBox(b);
        const resultAB = intersect(sa, sb);
        const resultBA = intersect(sb, sa);
        // Non-overlapping shapes may fail — skip
        if (!isOk(resultAB) || !isOk(resultBA)) return true;
        const vAB = volume(unwrap(resultAB));
        const vBA = volume(unwrap(resultBA));
        return Math.abs(vAB - vBA) < VOL_REL_TOL * Math.max(vAB, vBA, 1);
      })
    );
  });

  // ── Volume bounds ──

  it('union volume <= sum of volumes', () => {
    fc.assert(
      fc.property(arbBox, arbBox, (a, b) => {
        const sa = makeBox(a);
        const sb = makeBox(b);
        const vA = volume(sa);
        const vB = volume(sb);
        const vUnion = volume(unwrap(fuse(sa, sb)));
        return vUnion <= vA + vB + VOL_REL_TOL;
      })
    );
  });

  it('intersection volume <= min(volume(A), volume(B))', () => {
    fc.assert(
      fc.property(arbBox, arbBox, (a, b) => {
        const sa = makeBox(a);
        const sb = makeBox(b);
        const result = intersect(sa, sb);
        if (!isOk(result)) return true; // non-overlapping
        const vIntersect = volume(unwrap(result));
        const vMin = Math.min(volume(sa), volume(sb));
        return vIntersect <= vMin + VOL_REL_TOL;
      })
    );
  });

  it('difference volume <= volume(A)', () => {
    fc.assert(
      fc.property(arbBox, arbBox, (a, b) => {
        const sa = makeBox(a);
        const sb = makeBox(b);
        const result = cut(sa, sb);
        if (!isOk(result)) return true; // non-overlapping or degenerate
        const vDiff = volume(unwrap(result));
        const vA = volume(sa);
        return vDiff <= vA + VOL_REL_TOL;
      })
    );
  });

  // ── Identity ──

  it('union with self: volume(fuse(A,A)) = volume(A)', () => {
    fc.assert(
      fc.property(arbBox, (a) => {
        const sa = makeBox(a);
        const vA = volume(sa);
        const vFused = volume(unwrap(fuse(sa, sa)));
        return Math.abs(vFused - vA) < VOL_REL_TOL * Math.max(vA, 1);
      })
    );
  });

  // ── Non-negative volume ──

  it('all boolean results have non-negative volume', () => {
    fc.assert(
      fc.property(arbBox, arbBox, (a, b) => {
        const sa = makeBox(a);
        const sb = makeBox(b);
        const fuseResult = fuse(sa, sb);
        if (isOk(fuseResult) && volume(unwrap(fuseResult)) < -VOL_REL_TOL) return false;

        const cutResult = cut(sa, sb);
        if (isOk(cutResult) && volume(unwrap(cutResult)) < -VOL_REL_TOL) return false;

        const intResult = intersect(sa, sb);
        if (isOk(intResult) && volume(unwrap(intResult)) < -VOL_REL_TOL) return false;

        return true;
      })
    );
  });

  // ── Shape type ──

  it('boolean results are 3D shapes', () => {
    fc.assert(
      fc.property(arbBox, arbBox, (a, b) => {
        const sa = makeBox(a);
        const sb = makeBox(b);
        const result = unwrap(fuse(sa, sb));
        return isShape3D(result);
      })
    );
  });
});
