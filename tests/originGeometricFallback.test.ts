import { describe, it, expect, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import {
  box,
  getFaces,
  getHashCode,
  setShapeOrigin,
  getFaceOrigins,
  translate,
  fuseAll,
  fuseAllBisect,
  unwrap,
  faceCenter,
} from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

// Two boxes side by side at the SAME height: their top faces (z=10 plane) are
// coplanar and adjacent, so the boolean regenerates them. On WASM kernels the
// regenerated faces get fresh hashes that match no input, so hash-only
// propagation used to leave them origin-less (→ 0 / body at mesh time). This
// is the minimal analogue of the multi-color export bug where a feature's top
// face printed in the body color.
function sideBySide(): [ReturnType<typeof box>, ReturnType<typeof box>] {
  const a = box(10, 10, 10);
  const b = translate(box(10, 10, 10), [10, 0, 0]);
  setShapeOrigin(a, 1);
  setShapeOrigin(b, 2);
  return [a, b];
}

function assertNoUndefinedTopFace(result: ReturnType<typeof unwrap>): void {
  const origins = getFaceOrigins(result);
  expect(origins).toBeDefined();
  if (!origins) return;
  for (const f of getFaces(result)) {
    const z = faceCenter(f)[2];
    if (Math.abs(z - 10) < 0.01) {
      // Every top-plane face must carry one of the input origins, never undefined.
      expect(origins.get(getHashCode(f))).not.toBeUndefined();
    }
  }
}

describe('coplanar boolean-regenerated faces keep their origin', () => {
  it('fuseAll native: no top face loses its origin', () => {
    const [a, b] = sideBySide();
    assertNoUndefinedTopFace(unwrap(fuseAll([a, b], { strategy: 'native', simplify: true })));
  });

  it('fuseAllBisect (export primitive): no top face loses its origin', () => {
    const [a, b] = sideBySide();
    assertNoUndefinedTopFace(unwrap(fuseAllBisect([a, b], { simplify: true })).shape);
  });
});
