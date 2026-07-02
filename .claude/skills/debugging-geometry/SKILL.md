---
name: debugging-geometry
description: This skill should be used when debugging a geometry failure in brepjs — when a task says "boolean returned an invalid shape", "fuse/cut/intersect returned Err", "the result is empty", "measureVolume returns 0", "autoHeal didn't fix it", "shape is invalid", "STEP export crashed" or "WebAssembly.RuntimeError during export", "the part looks wrong, render it", "works on occt-wasm but fails on brepkit", or "is this a kernel divergence". Covers triage, numeric sanity checks, the healing pipeline, boolean failure modes (including the #1126 disjoint-fuse corruption), visual debugging with the brep CLI, and kernel-divergence isolation.
---

# Debugging geometry failures

A symptom-ordered playbook for the five failure classes: an `Err` result, wrong-but-`Ok` geometry, an empty/degenerate result, a crash/trap, or a kernel divergence. Verify every hypothesis with numbers and a render before changing code.

## Step 1 — Triage by failure class

| Symptom                                                | Class            | First move                                                             |
| ------------------------------------------------------ | ---------------- | ---------------------------------------------------------------------- |
| Op returned `Result.Err`                               | error result     | Read `error.code` + `error.suggestion` + `error.metadata?.diagnostics` |
| Result is `Ok` but geometry is wrong                   | bad geometry     | Numeric sanity (Step 2), then render (Step 5)                          |
| Result is empty / `measureVolume`==0                   | degenerate/empty | `isEmpty`, `getBounds`, volume-normalization rule (Step 2)             |
| Session crashed / `WebAssembly.RuntimeError` on export | kernel trap      | The #1126 export-crash class (Step 4 + references/boolean-failures.md) |
| Passes on one kernel, fails on another                 | divergence       | Isolate under `TEST_KERNEL` (Step 6)                                   |

Every fallible op returns `Result<T, BrepError>` with `kind/code/message/suggestion?/cause?/metadata?`. The full code catalog with per-code recovery advice lives in `docs/errors.md` — look codes up there, don't guess. `error.suggestion` is a first-class field; read it first (`src/core/errors.ts`).

## Step 2 — Numeric sanity before trusting any render

Confirm the defect with numbers before opening an image; a render can hide a zero-thickness sliver or an open shell.

- `measureVolume` / `measureArea` / `measureLength` / `measureDistance` in `src/measurement/measureFns.ts` — all return `Result<T>` and pre-check null → `NULL_SHAPE_INPUT`.
- **`volume === 0` is itself a diagnostic.** Volume is normalized to `0` for anything that is not a solid/compsolid/compound (`measureVolumeProps`, `measureFns.ts`, kernel divergence #1361). A "solid" reporting 0 volume is almost always an **open shell** that never got sewn/closed. Check `describe(shape)` and the shape type before assuming the volume math is wrong.
- `isEmpty(shape)` (`src/topology/shapeFns.ts`) is only a **kernel null check** — it does not detect degenerate-but-non-null geometry.
- `getBounds(shape)` (`src/topology/topologyQueryFns.ts`) returns the AABB and **can throw on degenerate shapes** — that throw is the basis of the pre-export probe (Step 4).
- `describe(shape)` (`src/topology/topologyQueryFns.ts`) gives a structural fingerprint (type + sub-shape counts) — use it to confirm "is this actually a solid, or a compound of two solids?".
- **Measurements and validity are cached per shape.** After healing or any in-place kernel repair, a stale `isValid`/measurement can lie — call `invalidateShapeCache` (exported from the index) if a value looks stale.

## Step 3 — Invalid shapes and the healing pipeline

Full tables in `references/healing.md`. Core loop:

1. Check `isValid(shape)` (`src/topology/healingFns.ts`).
2. `autoHeal(shape, options?)` → `Result<{ shape, report: HealingReport }>`.
3. Escalate only if `report.isValid` is still false.

**Critical caveat — the short-circuit.** `autoHeal` returns immediately when the input is already valid: `report.alreadyValid === true`, `steps === ['Shape already valid']`, and `diagnostics` contains ONLY `{ name:'validation', attempted:true, succeeded:true }` (`healingFns.ts`). The absence of `sew`/`fixSelfIntersection`/`healSolid` diagnostics does **not** mean those passes found nothing — **they never ran**. Never conclude "healing found no problems" from an `alreadyValid` report.

Two more traps:

- `wiresHealed`/`facesHealed` are `Math.abs(after - before)` **count deltas**, a heuristic change-detector — not a count of repaired defects.
- Sewing only runs when `sewTolerance` is passed; `fixSelfIntersection` defaults to `false`.

Escalation ladder when `autoHeal` leaves it invalid: pass a `sewTolerance` → `fixShape` (general `ShapeFix_Shape`) → `solidFromShell` for a shell that should be a solid → give up with `HEAL_SOLID_INCOMPLETE` / `HEAL_NO_EFFECT`. All in `healingFns.ts`; details in `references/healing.md`.

## Step 4 — Failed booleans

Full recipes in `references/boolean-failures.md`. Two distinct diagnostic surfaces — do not conflate them:

- **`checkBoolean(base, tool, op)`** (`src/topology/booleanDiagnosticFns.ts`) is a **pre-flight predictor**: it returns `{ valid, issues }` where issues are only `'null-shape' | 'not-valid'` per operand. It predicts failure; it does not explain a failure after the fact.
- **`BooleanDiagnostics`** (`{ hasErrors, hasWarnings, messages }`) rides on results/errors when `trackEvolution` is on (default). **`messages` is currently always empty** — OCCT's `Standard_OStream` reporting is not reachable in WASM builds (`src/kernel/types.ts`). Rely on `hasErrors`/`hasWarnings`, not on message text. On `hasErrors` + null result the op retries without evolution tracking; on `hasErrors` + non-null it warns and continues (`booleanFns.ts`).

Boolean ops pre-validate null operands → `NULL_SHAPE_INPUT` before touching the kernel (`booleanFns.ts`). When the result cannot cast to 3D the error names the actual type ("Got COMPOUND instead.", `booleanFns.ts`) — a strong signal the boolean degenerated.

Symptom → cause → fix:

| Symptom                                      | Likely cause                       | Fix                                                                  |
| -------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------- |
| `FUSE_*` Err, "Got COMPOUND"                 | operands don't actually overlap    | give a real overlap; for a weld, `fuseAll(shapes, { unsafe: true })` |
| `BOOLEAN_HAS_ERRORS`                         | coincident/near-tangent faces      | perturb one operand slightly, or set `fuzzyValue`                    |
| overlapping coplanar / zero-thickness input  | non-manifold input                 | `autoHeal()` operands first (the baked-in FUSE suggestion)           |
| in-memory checks all pass, STEP writer traps | **#1126 disjoint-fuse corruption** | `fuseAll(shapes, { strategy: 'pairwise' })`                          |

**The #1126 export-crash class** is the nastiest: `fuseAll` with the default `strategy: 'native'` (N-way `BRepAlgoAPI_BuilderAlgo`) can silently corrupt certain disjoint inputs so the result passes `isValid`, `validSolid`, `mesh`, `measureArea`, and `getBounds` — yet traps the STEP writer with a `WebAssembly.RuntimeError` that **corrupts the Emscripten heap and poisons the kernel for the rest of the session** (`meshFns.ts`). No known non-trapping check detects it; the only safety nets are the pre-export bounding-box probe (`probeSerializable`, catches _some_ degenerates → `STEP_EXPORT_UNSERIALIZABLE`/`STL_EXPORT_UNSERIALIZABLE` with the offending sub-solid localized) and `exportError` classifying the trap as `*_EXPORT_CRASHED`. The **fix** is `strategy: 'pairwise'` (divide-and-conquer over `BRepAlgoAPI_Fuse`, a different algorithm that is unaffected; `booleanFns.ts`). Tracked upstream at andymai/opencascade.js#3.

**Where export lives (structural gotcha).** Import functions live in `src/io/` (`importFns.ts`), but the STEP/STL/IGES _export_ functions live in `src/topology/meshFns.ts` (`exportSTEP`/`exportSTL`/`exportIGES`) and assembly STEP in `src/operations/exporterFns.ts` — not in `io/`. `importSTL` auto-runs `ShapeUpgrade_UnifySameDomain` on the read shape (`src/kernel/occt/ioOps.ts`); IGES round-trips both ways.

## Finder mis-selection (fillet/chamfer hit the wrong edges)

When a modifier lands on the wrong entities, the defect is the _selection_, not the op. Finder USAGE (predicates, `when`/`inList`/`not`, sorting) lives in the docs finders page (`apps/docs/tasks/finders.md`) and `src/query/README.md`; this skill owns the debugging angle. Core surface: `findAll(shape)` returns every match, `findUnique(shape)` returns `Result<T>` and errors when 0 or >1 match (`src/query/finderCore.ts`, `findUniqueIn`).

| Symptom                                                          | Likely cause                                                                                                     | Fix                                                                                                                            |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Fillet/chamfer landed on extra/other edges                       | predicate too loose — more entities matched than intended                                                        | `findAll` to count what actually matched, render with `brep snapshot --label` to see them, then tighten the predicate          |
| `findUnique` returned `Err` (0 or >1 match)                      | predicate too strict (0) or ambiguous (>1)                                                                       | Inspect `findAll` length; add a discriminating clause or switch to `findAll` if many are intended                              |
| `normalAt(face)` / a normal comes back null on the picked entity | the selected face/edge is degenerate, so the surface normal is undefined (`normalAt`, `src/topology/faceFns.ts`) | Confirm with `describe`/`getBounds` (Step 2); the finder selected a degenerate sub-shape — re-find geometrically or heal first |

## Step 5 — Visual debugging with the `brep` CLI

The `brep` CLI (bin in `packages/brepjs-cad`) renders and validates `.brep.ts` modules. For interpreting the verify **report** (checks, hints, body relations, the multi-body fragmentation advisory), defer to the sibling skill `brepjs:verify` (`packages/brepjs-cad/skills/verify/SKILL.md`) — this skill covers the debugging loop, not the report anatomy.

- `brep verify <file>.brep.ts [--check] [--json] [--metrics]` is the primary loop. `--check` typechecks first; `--metrics` adds deterministic manufacturability metrics + the interference matrix (off by default, slow). `--expect-code <CODE>` / `--expect-invalid` assert a known-bad part fails the _right_ way.
- `brep snapshot <file>.brep.ts [--out dir] [--label tag]` renders all views in one pass: `iso`, `front`, `top`, `right`, `iso-xray` (reveals bores/internal walls an opaque render is blind to), plus a conditional aimed `section` shot and a `marks` (Set-of-Marks B#/H# label) shot when the report detects bores/bodies (`snapshot/shoot.ts`). Each PNG has its bbox size (W×D×H) burned in, so scale is readable from the image. `--label` writes to a subfolder for pre/post A/B pairing.
- Snapshots use a private ephemeral render server (`fresh: true`), so parallel snapshots don't contend on the shared `:7373` server.
- Puppeteer is lazily/optionally imported: without it, the JSON report still emits and the CLI prints `snapshots need puppeteer/Chrome — run: npm i puppeteer`.
- **Prefer one `brep snapshot` over rendering each angle separately** — one pass gives every standard view. Judge fine surface finish (fine threads, small chamfers) from a real playground render rather than the snapshot, which can exaggerate thin features.

Compare geometry with `brep diff <a> <b>` (volumeDelta/areaDelta/bboxDelta/symmetricDifferenceVolume) and `brep measure <a> [b]`.

## Step 6 — Kernel-divergence isolation

Full mechanics in `references/kernel-divergence.md`. When a part passes on the default kernel but fails elsewhere (or vice-versa):

1. **Re-run under the other kernel.** `npm run test:occt` and `npm run test:brepkit` set `TEST_KERNEL` and run that vitest project (`vitest.config.ts`; `tests/setup-kernel.ts`). **CI runs only `occt-wasm`** (`.github/workflows/ci.yml`), so brepkit/manifold divergences must be reproduced locally.
2. **Localize the diverging op.** The in-repo technique (`tests/kernelDivergenceCoverage.test.ts`): compare against an **analytic reference** AND against an **alternate representation** of the same shape — e.g. a torus _primitive_ is exact while a _revolve_ sweep undershoots its volume by ~2%, which pins the loss to the sweep, not the primitive (#968).
3. **When confirmed, register it** in `tests/helpers/kernelDivergences.ts` (single source of truth; key = `operation.specificCase`, kinds `not-implemented | skip | tolerance | topology-differs`) and gate tests with `skipIfDiverges(ctx, key)`. Always cite the upstream issue. The conformance matrix `docs/kernel-conformance.md` is auto-generated (`npm run conformance:generate`).

Note: the default **occt-wasm kernel exposes no raw `oc` handle** (`kernelDivergences.ts`) — raw-OCCT debugging tricks (poking `TopoDS_*`, patching `FS`) are unavailable there.

## Step 7 — Writing the repro test

1. `import { initKernel } from './setup.js'` (`initOC` is a legacy alias) and `beforeAll(async () => { await initKernel(); }, 30000)`.
2. Use `unwrap(result)` in tests; assert geometry with `toBeCloseTo(expected, precision)` — never exact float equality.
3. To force the **invalid-shape** healing path deterministically, spy `kernel.isValid` to return `false` on the first call then delegate — the `mockKernelIsValid` pattern in `tests/autoHeal.test.ts`. See the sibling skill `writing-tests`.

## Additional resources

- `references/healing.md` — `HealingReport`/diagnostic-name tables, `AutoHealOptions`, escalation ladder, short-circuit semantics.
- `references/boolean-failures.md` — `checkBoolean` vs `BooleanDiagnostics`, error codes + baked-in suggestions, `fuzzyValue`, the #1126 case study.
- `references/kernel-divergence.md` — registry mechanics, divergence kinds, kernel capability table, occt-wasm no-raw-`oc` limits, brepkit #965–968 family status.
- `docs/errors.md` — full error-code catalog. `docs/getting-started.md` §Troubleshooting — the 4-step boolean recovery recipe. `docs/kernel-conformance.md` — capability matrix.
- Sibling skills: `result-error-handling` (Result/BrepError construction), `writing-tests` (test skeleton + divergence skips), `kernel-abstraction` (adding kernel methods), `brepjs:verify` (CLI report interpretation).
