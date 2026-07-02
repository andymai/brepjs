# Kernel-divergence reference

## Kernels and how to run each

Registry: `tests/helpers/kernelRegistry.ts` — four kernels, `occt-wasm` is the default (`tests/setup-kernel.ts` reads `TEST_KERNEL`, defaulting via `defaultKernelId()`):

| id          | Notes                                                   |
| ----------- | ------------------------------------------------------- |
| `occt-wasm` | Default. No raw `oc` handle exposed. CI gate.           |
| `occt`      | opencascade.js WASM (`initFromOC`).                     |
| `brepkit`   | External `brepkit-wasm`. Local-only.                    |
| `manifold`  | Mesh/CSG preview kernel. Local-only, several ops gated. |

Commands (root `package.json`): `npm run test` / `test:ci` / `test:full` run the `occt-wasm` project only; `npm run test:occt` and `npm run test:brepkit` run those projects. Each vitest project sets `env: { TEST_KERNEL: k.id }` (`vitest.config.ts`). **CI runs only `occt-wasm`** (`.github/workflows/ci.yml:254-258`, sharded 4-way) — reproduce brepkit/manifold divergences locally.

Kernel capability flags (`kernelRegistry.ts`): `projection`, `constraintSketch`, `kernel2D`, `variableFillet`, `offsetSolidV2`, `gridPattern`. `excludeTests` lists files a kernel can't run (occt-wasm excludes brepkit-only + gltfRoundTrip files).

## The divergence registry — single source of truth

`tests/helpers/kernelDivergences.ts`. Key = `operation.specificCase`. Kinds:

| kind               | Meaning                                       |
| ------------------ | --------------------------------------------- |
| `not-implemented`  | op absent on this kernel                      |
| `skip`             | intentionally not run                         |
| `tolerance`        | numeric result differs beyond default epsilon |
| `topology-differs` | valid but structurally different result       |

Tests gate with `skipIfDiverges(ctx, key)` (`:548-556`). Cross-kernel assertions use `expectClose` / `expectKernelsAgree` (`:566-589`). Register every confirmed divergence here with an upstream issue link, then gate the affected test.

## Localizing a divergence (the in-repo technique)

`tests/kernelDivergenceCoverage.test.ts` — compare against **two independent references** to pin which op diverges:

1. Analytic reference (closed-form volume/area).
2. An alternate representation of the same shape.

Worked example (#968): a torus **primitive** matches its analytic volume exactly, but a **revolve** sweep of the same profile undershoots by ~2% (inscribed-polygon surface). Two references isolate the loss to the _sweep_, not the primitive (`kernelDivergenceCoverage.test.ts`).

## Known brepkit inscribed-polygon family (#965–968)

Status as of brepkit-wasm 2.116.1:

- **#967** (fillet-on-cylinder-rim collapse) — **FIXED** on brepkit; the test now runs green there as a regression tripwire. Only **manifold** stays gated (`kernelDivergenceCoverage.test.ts`; registry `manifold.modifierFns.filletCylindricalEdge`).
- **#968** (`extrudeFns.revolveCircularProfile`) — **still divergent** on brepkit (~2% torus-volume undershoot).
- #965 (sweep) / #966 (extrude) — same inscribed-polygon family. Tests cite upstream andymai/brepkit issues.

## occt-wasm has no raw `oc`

The default kernel exposes no raw OCCT handle (`kernelDivergences.ts`). Raw-API debugging tricks — inspecting `TopoDS_*` null shapes, patching Emscripten `FS.readFile` — do not exist there; use the branded-shape query surface (`describe`, `getBounds`, `measure*`) instead.

## Conformance matrix

`docs/kernel-conformance.md` tabulates capabilities and per-test divergences across all four kernels. It is auto-generated — run `npm run conformance:generate` after registry changes; do not hand-edit.
