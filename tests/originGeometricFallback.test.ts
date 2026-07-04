import { describe, it, expect, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { skipIfDiverges } from './helpers/kernelDivergences.js';
import {
  box,
  getFaces,
  getHashCode,
  setShapeOrigin,
  getFaceOrigins,
  translate,
  fuseAll,
  fuseAllBisect,
  cutAllBisect,
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
/** Tag a shape's faces with an origin and return it (setShapeOrigin is void). */
function setOrigin<T extends ReturnType<typeof box>>(shape: T, origin: number): T {
  setShapeOrigin(shape, origin);
  return shape;
}

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

  // A long tagged top face split through its middle by a taller divider yields
  // two pieces whose centroids sit ~16mm from the original face centroid — past
  // the near-match cutoff — yet still coplanar with it. Both must keep the base
  // origin instead of falling back to body color. This is the minimal analogue
  // of gridfinity-layout-tool GH #2443, where a wide cutout floor sliced by an
  // overlapping deeper cutout printed part of its floor in the body color.
  it('a long face split far from its centroid keeps its origin via coplanar match', (ctx) => {
    skipIfDiverges(ctx, 'origins.coplanarSplitMatch');
    // Base top face: 20 x 60 at z=10, centroid (10, 30, 10).
    const base = setOrigin(box(20, 60, 10), 1);
    // Divider rises to z=20 through the base's middle (y 27..33), splitting the
    // top face into y<27 and y>33 pieces (centroids ~y13 and ~y46 → ~16mm off).
    const divider = setOrigin(translate(box(20, 6, 20), [0, 27, 0]), 2);

    const result = unwrap(fuseAllBisect([base, divider], { simplify: true })).shape;

    const origins = getFaceOrigins(result);
    expect(origins).toBeDefined();
    if (!origins) return;
    let splitFloorFaces = 0;
    for (const f of getFaces(result)) {
      const c = faceCenter(f);
      // Base top-face pieces: z≈10, off to either side of the divider band.
      if (Math.abs(c[2] - 10) < 0.1 && (c[1] < 27 || c[1] > 33)) {
        splitFloorFaces++;
        expect(origins.get(getHashCode(f))).toBe(1);
      }
    }
    // Two disconnected pieces prove the face actually split (not passed through).
    expect(splitFloorFaces).toBeGreaterThanOrEqual(2);
  });

  // The direct #2443 shape: subtract a wide, shallow cavity and an overlapping
  // deeper cavity from a block. The deep cut slices the shallow cavity's long
  // floor into two pieces far from its centroid — AND a cut flips that floor's
  // normal versus the tool face it came from. Both pieces must keep the shallow
  // cavity's origin (not body). Exercises cutAll's hash+geometric fallback.
  it('cutAllBisect: a wide cavity floor sliced by an overlapping deeper cut keeps its origin', (ctx) => {
    skipIfDiverges(ctx, 'origins.coplanarSplitMatch');
    const body = box(30, 80, 30);
    // Shallow, long cavity — floor plane at z=18, footprint x[5,25] y[5,75].
    const shallow = setOrigin(box(20, 70, 12, { at: [15, 40, 24] }), 1);
    // Deeper cavity crossing the shallow one's middle at full width (y 35..45),
    // splitting its floor into y[5,35] and y[45,75] pieces (~20mm off-centre).
    const deep = setOrigin(box(30, 10, 20, { at: [15, 40, 20] }), 2);

    const result = unwrap(cutAllBisect(body, [shallow, deep], { simplify: true })).shape;

    const origins = getFaceOrigins(result);
    expect(origins).toBeDefined();
    if (!origins) return;
    let floorPieces = 0;
    for (const f of getFaces(result)) {
      const c = faceCenter(f);
      // Shallow cavity floor pieces: z≈18, inside its footprint, off the deep band.
      if (
        Math.abs(c[2] - 18) < 0.1 &&
        c[0] > 6 &&
        c[0] < 24 &&
        (c[1] < 35 || c[1] > 45) &&
        c[1] > 6 &&
        c[1] < 74
      ) {
        floorPieces++;
        expect(origins.get(getHashCode(f))).toBe(1);
      }
    }
    expect(floorPieces).toBeGreaterThanOrEqual(2);
  });
});
