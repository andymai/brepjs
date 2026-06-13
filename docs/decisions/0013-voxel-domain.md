# ADR-0013: Voxel Geometry Domain (PicoGK-inspired)

**Status**: Proposed
**Date**: 2026-06-01
**Authors**: Andy Aragon

## Context

brepjs is an exact B-rep library. B-rep is precise and parametric but fragile on a class of
problems that fail across _all_ exact kernels (OCCT, brepkit), not as a tuning issue:

- booleans on non-watertight / self-intersecting **imported** meshes,
- robust uniform offset / shell on concave geometry,
- lattices / TPMS (gyroid, Schwarz, diamond) and graded infill,
- organic / generative geometry, defeaturing, large-N CSG.

A voxel / signed-distance-field (SDF) domain, the approach taken by PicoGK (C# → PicoGKRuntime
C++ → OpenVDB), solves these at the cost of exactness (resolution-bound, mesh output). This ADR
records the architecture so implementation (starting with a P0 spike) can proceed without open
forks. **No code exists yet.** The broader plan lives in the project owner's design vault; this ADR
is the in-repo decision record.

Note: this is explicitly **not** a fix for the #1126 STEP-export crash; that is a build-specific
`BOPAlgo` bug resolved by the #1136 migration that made `occt-wasm` the default kernel. A voxel engine cannot pass #1126's
exact-STEP acceptance (exact faces, exact volume, valid STEP, Hausdorff≈0) by construction; #1126 is
a _counter-example_ to "exact booleans are unreliable," not motivation for this work.

## Decision

Add a **voxel / SDF geometry domain** as a first-class peer to B-rep, organized around four stable
seams so a minimal v1 grows to the full vision without restructuring.

### 1. Four-seam architecture

```
Grid  ──►  Ops  ──►  Contour  ──►  Bridge
(data)    (pure fns) (mesh         (brep ↔ voxel ↔ mesh)
                      extraction)
```

Every long-term capability is additive behind exactly one seam:

| Seam    | v1 fill                                                       | Long-term (same seam, no rework)                  | Non-rework guarantee                                             |
| ------- | ------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------- |
| Grid    | dense array + active mask, behind an **accessor abstraction** | hashed sparse blocks                              | Ops/Contour read via the accessor, never raw layout              |
| Ops     | boolean + repair                                              | offset, shell, lattice/TPMS, scalar/vector fields | each is a pure `*Fns.ts` over the grid                           |
| Contour | surface nets                                                  | manifold dual contouring                          | a `Contourer` seam; grid stores edge-crossing normals from day 1 |
| Bridge  | voxel→mesh (`KernelMeshResult`)                               | brep→voxel, mesh→brep replay                      | shared mesh type + extracted replay helper                       |

### 2. Paradigm & placement: parallel domain, NOT a `KernelAdapter`

Voxel/SDF vocabulary does not fit `KernelAdapter`'s 14 B-rep sub-interfaces
(`src/kernel/interfaces/index.ts`); the manifold adapter already `notImplemented()`-stubs much of
that surface. The voxel domain is a **new top-level parallel domain** that does **not** register via
`registerKernel`/`getKernel`/`withKernel`. (Note: `brepjs-manifold` _is_ a `KernelAdapter`,
`registerKernel('manifold', adapter)`, `src/kernel/index.ts`, so a true parallel domain is a new
pattern here, see ADR-0002, ADR-0007.)

### 3. Context API: `getVoxel(id?)` mirroring `getKernel(id?)`

A parallel singleton registry: `registerVoxel(id, adapter)` / `getVoxel(id?)`. The optional `id`
selector is the multi-module escape hatch (multiple grids / worker instances later), exactly as
`getKernel(id?)` already scales to multiple kernels. No per-call handle threading (no repo
precedent; would churn every Layer-2 signature). `withKernel`'s sync-only async pitfall applies;
async code uses `getVoxel(id)` directly.

### 4. Representation: voxel-grid-first; dense+mask for v1

Materialized narrow-band SDF grid (PicoGK-faithful robustness). **v1: dense 3D array + active-voxel
mask** (simplest correct structure; O(1/h³) memory, the mask buys traversal speed, not memory, so
a hard voxel-count/memory cap returns `Result.Err` rather than OOM). Hashed sparse blocks
(O(area/h²)) are a later Grid-seam swap; v1 must expose an **accessor abstraction**, never raw
indexing, so sparse drops in. The grid stores **edge-crossing Hermite normals** from day 1 (cheap)
so manifold dual contouring can be added without regridding. Do not brand the structure "VDB-lite"
(implies OpenVDB cached-accessor + B+tree pooling we will not build).

### 5. Native Rust → WASM, shipped as a separate published artifact

The core is **native Rust → WASM** (no OpenVDB / PicoGKRuntime port). It ships as its own published
package **`brepjs-voxel-wasm`** that root brepjs depends on, mirroring `occt-wasm` /
`brepjs-opencascade`. Consequences: the `brepjs-voxel-wasm` package owns the Rust toolchain and a
rebuild-and-verify (reproducibility) workflow (precedent: `publish-opencascade.yml`); **root brepjs
CI, the 4-shard test matrix, and the pre-push hook stay Rust-free** and consume the committed/published
wasm. An unpublished loader package `packages/brepjs-voxel` (mirroring `initManifold`) exposes
`initVoxel()` and stays unpublished. `release-please-config.json` gains a third entry for
`brepjs-voxel-wasm`.

### 6. Contour: surface nets for v1, manifold dual contouring as the target

Meshing is pluggable behind a `Contourer` seam. **v1 uses surface nets** (reuse the maintained
`fast-surface-nets` crate, MIT/Apache, wasm32-clean): fast, robust, watertight, and correct for the
organic repair fixture where sharp features do not apply. Naive surface nets does **not** recover
sharp features and is **not** strictly 2-manifold at thin/pinch regions; strict 2-manifoldness and
sharp edges wait for the manifold-DC `Contourer` (v2 upgrade target: the `tessellation` crate, the
only maintained Rust crate that guarantees both). **Manifold dual contouring remains the target** and
is added later as a second `Contourer` impl over the same grid (which already carries edge normals).
Honest claims when DC lands: manifoldness via cell-splitting; self-intersection mitigated (AABB
vertex clamp) not eliminated; a runtime invariant test is the real guard; sharp-feature loss
unbounded in split cells; QEF via truncated SVD with a _relative_ singular-value cutoff + mass-point
bias, never an absolute threshold.

### 7. Bridges & mesh contract

`voxelsToMesh` emits the existing `KernelMeshResult` (`src/kernel/types.ts`):
`vertices`/`normals`/`triangles`(Uint32 index buffer)/`uvs`(mandatory: zero-fill or planar)/
`faceGroups`(mandatory: one synthetic group; documented, never silently `[]`). Separate wasm linear
memories mean **no zero-copy** with Emscripten kernels: serialize flat `Float32Array`/`Uint32Array`,
copied once per direction; apply the `Uint32Array`→`Array` gotcha to `triangles` at kernel-call sites
only. `meshToBrep` replay reuse (later phase): **extract** the kernel-neutral replay/cache out of
`src/kernel/manifold/meshHandle.ts` into a shared helper, re-point manifold (no behavior change), and
consume it from the voxel bridge: legal because the bridge lives in root `src/`.

### 8. Relationship to brepjs-manifold: independent sibling

The voxel domain is **independent** (not a `KernelAdapter`, not under manifold). Hard scope line:
**manifold = exact mesh boolean/CSG on watertight meshes (mesh-BSP); voxel = SDF/field CSG +
defeature + lattice/TPMS + non-watertight repair.** They share only the mesh type and the extracted
replay helper. No duplicated CSG.

### 9. Layer assignment & boundary enforcement

- Voxel domain + bridges = **Layer 2** (`src/voxel/`, `src/voxel/bridge/`). High-level TPMS/lattice
  API = **Layer 3** (`src/lattice/`). They cannot co-locate (`get_src_dir()` returns the first path
  component only).
- `scripts/check-layer-boundaries.sh` `get_layer()` currently has **no `voxel`/`lattice` case** →
  returns -1 → silently escapes enforcement. P0 must add `voxel` (Layer 2) and `lattice` (Layer 3) in
  **three places**, writing the _complete_ token set each time. Note the script already has
  pre-existing legend/header drift, so do **not** copy the current legend/header verbatim; restore the
  missing tokens while adding the new ones:
  - `get_layer()` arms (the source of truth, currently correct): L2:
    `topology|2d|operations|query|measurement|io|worker|csg|voxel`; L3:
    `sketching|text|projection|gear|ns|lattice`.
  - The printed legend (≈lines 130-131): L2: `topology/, 2d/, operations/, query/, measurement/, io/,
worker/, csg/, voxel/` (currently **omits `csg/`**); L3: `sketching/, text/, projection/, gear/,
ns/, lattice/`.
  - The header comment (≈lines 9, 11): the same two sets (currently L2 **omits `worker` and `csg`**;
    L3 **omits `ns`**).

  Then add negative tests proving enforcement is live (an L2→L3 import and a `lattice` upward import the
  script must reject). Precedent: `csg` (L2), `gear`/`ns` (L3) already exist in `get_layer()`.

- Accessor rule: B-rep inputs are `ShapeHandle` → `.wrapped` only at `getKernel().method(...)` sites
  (ESLint bans `.wrapped.method()` in Layer 2+). Voxel handles are `KernelHandle<VoxelGrid>` →
  `.value`.

### 10. Handles & disposal

`Voxels` / `Field` / `Lattice` are **not** `ShapeHandle` and carry no `[__dim]` phantom (volumetric).
Use `createKernelHandle<T extends Deletable>` (`src/core/disposal.ts`) exposing `.value` +
`[Symbol.dispose]`. The wasm object satisfies `Deletable` via a `free()`→`delete()` shim
(wasm-bindgen emits `free()`). **Explicit disposal is mandatory**: a grid can be hundreds of MB and
`FinalizationRegistry` is a no-op where unavailable; all lifetimes use `using` / `withScopeResult`.
All fallible ops return `Result<T, BrepError>` (no thrown errors in Layers 2-3).

### 11. v1 scope & motivating fixture

**v1 = the repair slice only**, with the Ops seam built extensible from day 1. Motivating fixture: a
**non-watertight imported mesh** (holey/self-intersecting STL/OBJ): the cleanest "an exact kernel
demonstrably errs" gating leg, since OCCT cannot boolean non-watertight input. Pipeline:
`import → voxelize (sign via hierarchical Fast Winding Number, Barill 2018, + 6-connected flood-fill
for open inputs) → repair → surface-nets mesh → GLB`. This front-loads the single hardest algorithm
(mesh→SDF sign). Per-fixture acceptance: (i) the exact kernel errs (gating); (ii) output watertight,
with 2-manifoldness enforced by a runtime invariant test (naive surface nets does not strictly
guarantee it; the manifold-DC `Contourer` does); (iii) Hausdorff ≤ c·h; (iv) volume within tolerance;
(v) thinnest feature ≥ 4h or `Result.Err`. Offset/shell, lattices/TPMS, and scalar/vector fields are subsequent Ops-seam additions.

### 12. Licensing

Clean-room: no OpenVDB/PicoGK source or structure copied. OpenVDB and PicoGK are both Apache-2.0
(OpenVDB relicensed from MPL-2.0 in 2020) → the obligation is Apache-2.0 NOTICE attribution if any
Apache-2.0 idea is used (create a `NOTICE` file; mind the publish `validate-pack` MAX_FILES cap).
TPMS formulas are textbook trigonometric implicits with no copyright; cite primary literature.

## Consequences

### Positive

- v1 is the minimal fill of an already-future-proof design; every fill is swappable behind a seam,
  so risk concentrates only in the four seam boundaries.
- Root brepjs CI / test matrix / pre-push hook stay Rust-free regardless of how large the Rust core
  grows; the fast feedback loop is preserved.
- Context API, layering, handles, disposal, and `Result` usage all reuse existing brepjs conventions
  (ADR-0001/0002/0003/0007), minimizing new surface.
- Fixes a class of B-rep weaknesses (non-watertight repair, robust offset/shell, lattices) with a
  crisp, demoable first deliverable.

### Negative / Trade-offs

- Output is an approximate mesh, never exact B-rep; voxel results do not round-trip through STEP as
  exact geometry (tessellated at best). Positioned as a preview/repair/lattice kernel.
- Dense v1 grid is O(1/h³) memory → resolution is capped until the sparse Grid-seam swap.
- Surface-nets v1 rounds sharp edges; machined-feature fidelity waits for the DC `Contourer`.
- Two cheap-but-mandatory v1 taxes that cannot be retrofitted cleanly: the grid accessor abstraction
  and storing edge-crossing normals.
- `meshToBrep` reuse requires refactoring shipping manifold code (extracting the replay helper),
  with a small risk of changing manifold dispose behavior.

## Alternatives Considered

- **F-Rep (gridless SDF expression tree).** Lighter, resolution-free, GPU-friendly, but offset/shell
  only approximate and cannot ingest arbitrary meshes as true fields. Rejected: voxel-grid-first was
  chosen for PicoGK-faithful robustness and the mesh-repair use case.
- **Compile PicoGKRuntime/OpenVDB to WASM.** Maximum fidelity but OpenVDB+TBB is a heavy, unproven
  Emscripten port with a multi-MB bundle. Rejected for a native Rust core.
- **Behind the `KernelAdapter` interface (like manifold).** Reuses plumbing but forces SDF/field/
  lattice ops to masquerade as B-rep verbs; most of the 14 sub-interfaces do not map. Rejected.
- **Sub-engine of brepjs-manifold.** Conflates two very different representations under one adapter.
  Rejected for an independent sibling with a hard scope line.
- **Per-call `initVoxel()` handle threading.** Solves multi-module concurrency that `getVoxel(id?)`
  already covers, at the cost of churning every signature. Rejected.
- **Manifold dual contouring from scratch in v1.** Hardest meshing path, overkill for the organic
  repair fixture; slows P0. Deferred behind the `Contourer` seam (remains the target).
- **Whole domain in `packages/`.** Forfeits layer-boundary enforcement (the script has no `packages/`
  handling) and makes meshHandle replay reuse impossible. Rejected; only the wasm artifact + loader
  live in `packages/`.

## Related

- ADR-0001 (layered architecture), ADR-0002 (kernel abstraction), ADR-0007 (kernel interface
  segregation), ADR-0010 (Layer 2 audit), ADR-0012 (Layer 3 audit).
- `packages/brepjs-manifold` (preview-kernel precedent); `brepjs-opencascade` / `occt-wasm`
  (published-wasm-artifact precedent).
- Issues #1126 (counter-example), #1136 (migration that made `occt-wasm` the default kernel).
- PicoGK (https://github.com/leap71/PicoGK), OpenVDB (https://www.openvdb.org/).
- Open items deferred to measurement: sparse-vs-dense crossover, wasm size caps + total
  co-instantiated footprint, QEF relative-cutoff value, Hausdorff constant c, voxel-count cap.
