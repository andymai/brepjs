# Design: Make `occt-wasm` the default kernel

**Issue:** Closes [#1136](https://github.com/andymai/brepjs/issues/1136) — _Migrate default `init()` kernel from `brepjs-opencascade` to `occt-wasm`._
**Date:** 2026-06-02
**Branch:** `feat/occt-wasm-default`

> This spec was hardened by a three-agent review (correctness / completeness / architecture). Findings that materially changed scope are folded in below and flagged `[review]`.

## Summary

Flip brepjs's default kernel from `brepjs-opencascade` (id `occt`) to `occt-wasm`
(id `occt-wasm`) across the **library, the test gate, every narrative doc, the
playground runtime, and the agent viewer**. `brepjs-opencascade` stays a fully
supported, installable kernel and a **silent runtime fallback**, but is no longer
the documented default and is dropped from the CI gate (kept as an opt-in local
run).

## Verified premises

1. **occt-wasm conformance suite is green** — `vitest run --project occt-wasm` → 3687 pass / 81 skip / 0 fail.
2. **Browser-safe loader exists** — `occt-wasm@3.2.0` exposes `OcctKernel.init(options?)` (auto-locates `.wasm` via `import.meta.url`); `OcctKernel` exposes `getRawModule`/`getRawKernel`, which `OcctWasmAdapter.fromKernel()` consumes (`occtWasmAdapter.ts:156`). `[review: verified]`
3. **No real capability regression** — `occt`'s `filletVariable` is a throwing brepkit-only stub (`occt/defaultAdapter.ts:61`); occt-wasm implements it (`occtWasm/modifierOps.ts:91`). `constraintSketch` (`sketchNew`/`sketchDof`) exists only in brepkit/manifold. The flip gains variable fillets, loses nothing.
4. **`tests/init.test.ts` is idempotency-based** — survives the flip.
5. **`[review] Correction:`** the registry `constraintSketch`/`variableFillet` flags are read by **`scripts/generateConformance.ts:44,52`** (not only `kernelRegistry.test.ts`). Correcting them therefore requires **regenerating the conformance matrix** (`npm run conformance:generate` → `docs/kernel-conformance.md`).
6. **`[review] Correction:`** the "default kernel" is **not** a single `TEST_KERNEL` value — it is hardcoded in ~5 independent spots, and the real CI/pre-commit gate is a literal `--project occt` flag that never reads `TEST_KERNEL`. See Phase B.
7. **`[review] Correction:`** the playground and agent viewer **load OCCT at runtime** via hardcoded `brepjs_single.*` + `initFromOC` in web workers — a dep/config swap alone would not change the loaded kernel. See Phase D.

## Layering constraint (governs the SSOT refactor)

`tests/helpers/kernelRegistry.ts` is "pure data, no project imports" because
`vitest.config.ts` consumes it at config-load **before TS path aliases resolve**.
And `src/kernel/index.ts` is Layer 0 — it **must not** import a test helper.
Therefore a single source of truth **cannot** span runtime + test. The SSOT field
(decision: add `default`/`priority` to `KernelConfig`) cleans only the **test
side**; runtime `init()` keeps its own explicit try-order. Do **not** make `src/`
import `tests/helpers/`.

---

## Phase A — Library code

| Target                            | Change                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/kernel/index.ts` → `init()`  | Reorder auto-detect: **occt-wasm first** (`OcctKernel.init()` + `OcctWasmAdapter.fromKernel()`) → `brepjs-opencascade` (`occt`) → `brepkit`. Return `'occt-wasm'` when it loads. Update docstring; fix the stale "occt-wasm requires manual registration … `import.meta.resolve`/`node:path`" comment (lines ~202-205) — no longer true. Runtime order stays an explicit local sequence (cannot import the test registry). |
| `src/quick.ts`                    | occt-wasm-first with occt fallback. **`[review]` both kernel imports must be dynamic `import()` inside try/catch** — a static `import opencascade from 'brepjs-opencascade'` (current) or a static occt-wasm import would fail at module load for installs that have only the other package.                                                                                                                               |
| `scripts/build-quick.js`          | Generates `dist/quick.js` (separate published entry, imports from `./brepjs.js`). Update the emitted string to the same dynamic-import fallback logic. `[review]` static import in the generated ESM breaks occt-only installs at load — must be dynamic.                                                                                                                                                                  |
| `tests/helpers/kernelRegistry.ts` | **`[review]` SSOT field:** add `default: true` to the occt-wasm entry (pure data — safe at config-load) and a `defaultKernelId()` helper returning it. Correct capability flags to reality: `occt` `variableFillet: false`; `occt-wasm` `variableFillet: true`; `constraintSketch: false` for both OCCT kernels.                                                                                                           |

## Phase B — Test gate `[review: heavily revised]`

The gate is **not** `TEST_KERNEL`. Every spot below must change:

| #   | File:line                                       | Change                                                                                                                                                                                                                    |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `package.json:220` `test`                       | `--project occt --changed` → `--project occt-wasm --changed`                                                                                                                                                              |
| 2   | `package.json:221` `test:full`                  | `--project occt --coverage` → `--project occt-wasm --coverage` (the coverage gate)                                                                                                                                        |
| 3   | `package.json:222` `test:ci`                    | `--project occt` → `--project occt-wasm`                                                                                                                                                                                  |
| 4   | `package.json:223` `test:watch`                 | `--project occt` → `--project occt-wasm`                                                                                                                                                                                  |
| 5   | `package.json:245` `test:docs`                  | `--project occt` → `--project occt-wasm`                                                                                                                                                                                  |
| 6   | `package.json` (new)                            | add `test:occt` = `vitest run --project occt` — opt-in local run for the fallback path (occt is **dropped from the CI gate** per decision).                                                                               |
| 7   | `tests/setup-kernel.ts:11` (+ docstring 4-5,10) | `?? 'occt'` → `?? defaultKernelId()`                                                                                                                                                                                      |
| 8   | `tests/helpers/kernelInit.ts:27`                | `?? 'occt'` → `?? defaultKernelId()`                                                                                                                                                                                      |
| 9   | `tests/helpers/kernelInit.ts:43-52`             | Modernize occt-wasm branch to `OcctKernel.init()` + `OcctWasmAdapter.fromKernel()` (same loader as `init()`/`quick`; retires `import.meta.resolve`+`locateFile`).                                                         |
| 10  | `vitest.config.ts:67`                           | root coverage `exclude`: `coverageExcludesFor('occt')` → `coverageExcludesFor(defaultKernelId())`.                                                                                                                        |
| 11  | `vitest.config.ts:68-75`                        | **re-measure + re-floor** root thresholds against the occt-wasm denominator. The current `84/74/90/84` are occt-calibrated and invalid after the adapter-dir swap.                                                        |
| 12  | `kernelRegistry.ts` coverage                    | occt-wasm `coverageThresholds`: keep registry value consistent, **but note** per-project thresholds are _latent/dead_ for the gate (only the root block gates) — the registry edit is cosmetic; #10/#11 are what move CI. |
| 13  | `.github/workflows/ci.yml`                      | CI runs `test:ci`/coverage (now occt-wasm). Remove/replace any occt assumption. Coverage job is main-only/non-blocking — note it, don't imply a PR gate moves.                                                            |

**Coverage-denominator note `[review]`:** `coverageExcludesFor` excludes every _other_ kernel's `adapterDir/**`. Swapping default from occt→occt-wasm removes `src/kernel/occt/**` (~8.2k LOC) from the denominator and **adds** `src/kernel/occtWasm/**` (~7.2k LOC, now required-to-cover). Also occt has an extra exclude `src/kernel/geometry2d.ts` that occt-wasm lacks. Action: decide whether occt-wasm needs `geometry2d.ts` in `extraCoverageExcludes` (verify which 2D path it loads), then measure, then floor **per-metric**. State the four numbers in the implementation plan.

**Changed-file feedback gap `[review]`:** occt-wasm carries `excludeTests` (5 brepkit/gltf files) that occt does not (`kernelRegistry.ts:75-81`). After the flip, editing one of those files yields **no** pre-commit `--changed` test feedback. Audit those five for default-project suitability.

## Phase C — Docs / narrative sweep

Principle: `brepjs-opencascade` survives **only** as the literal npm package
(install commands, peer-dep entries, build/release/CI config, `packages/brepjs-opencascade/`,
lockfile). Every "the default kernel is OpenCascade" narrative → occt-wasm.

**Spec-original set:** `README.md` (install → `npm install brepjs occt-wasm`; Status reframe → "occt-wasm (OpenCascade compiled to WebAssembly) is the default; brepkit … faster replacement in development"; manual-init example), `apps/docs/**` (`getting-started/install.md`, `concepts/kernels.md`, `integration/compatibility.md`, `integration/frameworks.md`, `advanced/workers.md`, `introduction/stability.md`, `reference/glossary.md`), legacy `docs/**` (`getting-started.md`, `compatibility.md`, `cheat-sheet.md`, `architecture.md`, `kernel-swap.md`, `threejs-integration.md`), `src/kernel/README.md`, `llms.txt`, `llms-full.txt`, agent skill files (`packages/brepjs-agent/README.md`, `packages/brepjs-agent/skill/references/getting-started.md`, `.claude/skills/brepjs-cad/references/getting-started.md`).

**`[review]` added narrative files the spec missed:**

- `context7.json` — LLM-facing description + canonical install/init strings.
- `apps/docs/index.md` — landing feature card ("OpenCascade WASM ships today…", ~line 31).
- `apps/docs/getting-started/cheat-sheet.md` — manual-init recipe (~line 16) — the **canonical** cheat sheet (spec only had the legacy one).
- `apps/docs/getting-started/first-solid.md` — `KERNEL_NOT_INITIALIZED` init narrative (~line 203).
- `apps/docs/reference/errors.md` — `initFromOC`/"string from OpenCascade" init guidance (lines 38/257).
- `docs/codebase-map.md` — `DefaultAdapter`/`initFromOC` default framing (lines 30/32).
- `docs/decisions/0013-voxel-domain.md` — directly narrates the #1136 default migration.
- `docs/kernel-swap.md` — **actively false after the flip:** line 5 "default, most mature kernel", line 16 "occt-wasm requires manual registration", line 59 "Tries brepjs-opencascade first … occt-wasm is not auto-detected". Must mirror the new `init()` behavior.

**Generated docs (regenerate, don't hand-edit):**

- `docs/kernel-conformance.md` → `npm run conformance:generate` (after the registry capability-flag correction).
- **Compatibility matrices** (`apps/docs/integration/compatibility.md`, `docs/compatibility.md`): rebuild verified-accurate — occt-wasm default; correct the wrong occt variable-fillet row; constraintSketch is brepkit-only. Cross-check each row against the adapters.

**Confirmed out of scope (stay):** `benchmarks/**`, root `vite.config.ts`, `.github/**` package refs, `release-please-*`, `knip.config.ts`, `scripts/ensure-wasm.sh`, `scripts/publish-all.sh`, `package.json` deps, lockfile, the `OpenCascadeInstance`/`OpenCascadeType` exported type names. `apps/docs/migration/replicad.md`, `apps/docs/concepts/tolerance.md`, `docs/decisions/0002`/`0006` — incidental OCCT mentions, not default-kernel narrative.

## Phase D — Playground + agent viewer runtime `[review: new, decision = full migration]`

A dep swap does **not** change the loaded kernel. The runtime path must move:

- `apps/playground/src/workers/cad.worker.ts` — `loadWasmBuild()` fetches `wasm/brepjs_single.{js,wasm}` and calls `brepjs.initFromOC(oc)` (lines 65-66, 160). Rewrite to load occt-wasm and `registerKernel('occt-wasm', OcctWasmAdapter.fromKernel(await OcctKernel.init({ wasm: <provisioned url> })))`.
- `apps/playground/src/lib/wasmConfig.ts` — `WASM_FILES = ['brepjs_single.js','brepjs_single.wasm']` → occt-wasm build files; update `WASM_CACHE_NAME` if cache-busting is keyed on it. (`src/lib/wasmPreloader.ts` consumes this constant and inherits the change.)
- `apps/playground/vite.config.ts` — **`[review]` has its OWN separate `const WASM_FILES` at line 20** (not imported from `wasmConfig.ts`) that drives the copy plugin (`writeBundle`) and the dev-middleware allowlist. Edit **both** this constant and `wasmConfig.ts`, or the build/dev server keeps serving the OCCT binary. The `opencascadeWasm()` plugin copies `brepjs_single.*` from `packages/brepjs-opencascade/src` into `public/wasm/`; rework to provision `occt-wasm/dist/occt-wasm.{js,wasm}` (21MB binary — verify worker bundling + caching handle it). Update `optimizeDeps`/`exclude`. Confirm the plugin's COOP/COEP (`require-corp`) headers don't break occt-wasm's loader (it does not require SharedArrayBuffer, but verify).
- `apps/playground/src/types/brepjs-ambient.d.ts` — **auto-generated**; regenerate via `npm run generate-types` (check `apps/playground/scripts/generate-ambient-types.ts` allowlist incl. `OpenCascadeInstance`/`OpenCascadeType`). Do **not** hand-edit.
- Visible kernel labels/help text → occt-wasm.
- `packages/brepjs-agent/viewer/src/kernelWorker.ts` — same OCCT-hardcoded pattern (lines 51, 64); flip to occt-wasm (decision: flip, not exception). `packages/brepjs-agent/README.md:21` install → occt-wasm.

**Verification:** full playground build + typecheck, a smoke check that the worker actually boots occt-wasm (not just that the build succeeds — a config-only swap would still build green while running OCCT), and an idle-preload smoke against the new 21MB binary (`wasmPreloader.ts` path).

## Phase E — Architecture / SSOT, release, verification

- **SSOT (decision):** add `default`/`priority` to `KernelConfig` + `defaultKernelId()` in `kernelRegistry.ts`; derive test-side defaults (Phase B #7/#8/#10) from it. `package.json --project` flags and runtime `init()` order stay explicit (JSON / layering constraints). Document this split so the scatter isn't silently reintroduced.
- **Release:** minor `feat` (graceful fallback, no API signature change); CHANGELOG via release-please from commits — no manual edits. Logical commits: (A) library + registry, (B) test gate + coverage, (C) docs + regenerated matrices, (D) playground + agent viewer.
- **Verify:** `npm run validate`; full occt-wasm suite; coverage run to set thresholds; `init()` returns `'occt-wasm'`; `brepjs/quick` smoke under occt-only and occt-wasm-only installs (fallback); playground full build + worker smoke.
- **Workflow:** PR Closes #1136; **no automerge**; issue comment with verified findings. Author reviews before merge.

## Open risks

- **21MB occt-wasm.wasm in the playground** — worker fetch/cache/bundle path must handle it; the OCCT `brepjs_single` build had its own size profile. Verify load time + caching.
- **Coverage floor** is only meaningful after re-measuring with the occt-wasm exclude set (Phase B note); carrying over 84/74/90/84 would be wrong.
- **Fallback path loses CI coverage** (occt dropped from the gate) — mitigated by the opt-in `test:occt` and the green occt-wasm suite; accept per decision.
- **Playground "claims occt-wasm but runs OCCT"** if Phase D is partial — the worker rewrite is the load-bearing change, not the dep swap.
