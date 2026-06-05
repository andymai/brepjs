# `tests/parity/voxel/` — voxel-domain behavioral spec

The kernel-agnostic spec for the **voxel / SDF domain** (ADR-0013). It is the
voxel analog of [`../README.md`](../README.md), but the voxel domain is a
parallel domain — **not** a `KernelAdapter` — so the kernel-swap harness in
`../*.ts` does not apply, and the rules differ.

## Why a separate suite

Voxel ops take a triangle-soup `VoxelMeshInput` and return a `KernelMeshResult`
mesh; they never touch `getKernel`/`ShapeHandle`. So:

- **References are still closed-form math**, not kernel output (volume of a
  10mm cube is `1000` because `w·d·h = 1000`).
- **But results are resolution-bound and lossy by construction.** Tolerances are
  coarse and resolution-dependent, computed from the output mesh — `compareMetrics`
  (which measures B-rep shapes) cannot be used; `helpers.ts` provides
  `meshVolume`/`meshArea`/`meshBbox`/`meshTopology` instead.
- **Invariants are the real guard** (ADR-0013 §11). A single volume number can
  be right while the mesh is unusable; topology is checked on every op output.

## What it asserts

| File                  | Spec                                                                      |
| --------------------- | ------------------------------------------------------------------------- |
| `measurement.test.ts` | voxelized volume / bbox / area ≈ closed-form, within resolution band      |
| `convergence.test.ts` | error **shrinks as resolution rises** (the voxel analog of exactness)     |
| `booleans.test.ts`    | union/intersection/difference volumes, inclusion–exclusion, commutativity |
| `vsOcct.test.ts`      | voxel boolean ≈ exact OCCT fuse (volume + Hausdorff ≤ c·h); offset extent |
| `invariants.test.ts`  | every op output is **closed** + well-formed (the real guard)              |

## Tolerance policy (calibrated, in `helpers.ts` `VOXEL`)

Measured at the default resolution (40): cube volume err ~0.3–0.9% (bbox exact),
cylinder ~0.4%, box-union ~0.8%; area inflated ~5%.

- **Volume**: relative `< 3%` (`volTol`). Discretization biases enclosed volume by O(h).
- **Area**: relative `< 12%` (`areaTol`). Surface Nets is staircase-ish and inflates area.
- **Bbox**: absolute `< 1.5·h` per corner.
- **Convergence**: high-res error must beat low-res error and clear a tight floor.

## Documented divergences (these are properties of voxel v1, not bugs)

1. **Not strictly 2-manifold.** Surface Nets v1 output is always **closed** (no
   boundary edges — asserted), but emits non-manifold edges + degenerate/sliver
   triangles except on grid-aligned geometry (e.g. a cube at res 32 is clean; at
   res 24/48 it is not). The suite bounds the bad-triangle fraction (`badTriFraction`,
   ~8%) as a regression guard, **not** a 2-manifold guarantee. The manifold
   dual-contouring `Contourer` is the eventual fix (ADR-0013 §6).
2. **Area inflation.** Contoured area exceeds the true surface area, so `areaTol`
   is much looser than `volTol`.
3. **Cost scales with input triangle count, not just resolution.** The FWN sign
   pass is O(grid · inputTriangles), so a finely-tessellated input (e.g.
   `sphere()` floors at ~8000 triangles → ~12s) dominates runtime. Spec inputs
   are low-poly (boxes; cylinders tessellated coarsely) — fidelity comes from the
   grid resolution, not input density. **Avoid high-poly inputs in this suite.**

## Running

Runs only under the exact `occt-wasm` gate (the `RUN_VOXEL_PARITY` guard; primitives
are built on the active kernel, so a mesh kernel would double-approximate):

```bash
npx vitest run --project occt-wasm tests/parity/voxel/
```

Under other kernel projects the whole suite skips and the WASM engine is not loaded.

## Adding a test

Build a primitive, tessellate it cheaply into the voxel input, run the op, measure
the mesh:

```ts
import { box } from '@/index.js';
import { repairMesh } from '@/voxel/index.js';
import { unwrap } from '@/core/result.js';
import { formula } from '../helpers.js';
import {
  RUN_VOXEL_PARITY,
  setupVoxelParity,
  meshInputOf,
  meshVolume,
  relErr,
  VOXEL,
} from './helpers.js';

beforeAll(async () => {
  await setupVoxelParity();
}, 60000);

describe.skipIf(!RUN_VOXEL_PARITY)('SPEC: …', () => {
  it('repair(box).volume ≈ w·d·h', () => {
    const out = unwrap(
      repairMesh(meshInputOf(box(10, 10, 10)), {
        resolution: VOXEL.resolution,
        padding: VOXEL.padding,
      })
    );
    expect(relErr(meshVolume(out), formula.boxVolume(10, 10, 10))).toBeLessThan(VOXEL.volTol);
  });
});
```

Build op outputs in `beforeAll` (never at collection time — the kernel/engine
are not ready yet); keep `describe`/`it` names static.
