# Design: Make `occt-wasm` the default kernel

**Issue:** Closes [#1136](https://github.com/andymai/brepjs/issues/1136) — _Migrate default `init()` kernel from `brepjs-opencascade` to `occt-wasm`._
**Date:** 2026-06-02
**Branch:** `feat/occt-wasm-default`

## Summary

Flip brepjs's default kernel from `brepjs-opencascade` (kernel id `occt`) to
`occt-wasm` (kernel id `occt-wasm`), update every narrative doc + the playground
to present `occt-wasm` as the default, and make the occt-wasm test project the
gating CI default. `brepjs-opencascade` remains a fully supported, installable
kernel and a **silent code fallback**, but is no longer the documented default.

## Verified premises (this session)

These findings de-risk the migration and **reverse** parts of the issue's gap audit:

1. **occt-wasm conformance suite is green.** `TEST_KERNEL=occt-wasm vitest run --project occt-wasm` → **3687 passed / 81 skipped / 0 failed**, exit 0. The XCAF assembly-STEP blocker and the correctness bugs from the audit are already fixed.
2. **The package now ships a browser-safe loader.** `occt-wasm@3.2.0` exposes `OcctKernel.init(options?)`, which auto-locates the `.wasm` via `import.meta.url`. The adapter consumes it via `OcctWasmAdapter.fromKernel(kernel)` (already implemented, `occtWasmAdapter.ts:156`). No Node-only `import.meta.resolve` path is required anymore.
3. **No real capability regression.** The registry's `constraintSketch`/`variableFillet` flags are read **only** by `kernelRegistry.test.ts`; they gate nothing at runtime.
   - `occt`'s `filletVariable` is a `u('filletVariable')` brepkit-only **stub that throws** (`occt/defaultAdapter.ts:61`). occt-wasm's adapter **actually implements** `filletVariable` (`occtWasm/modifierOps.ts:91`). The flip _gains_ variable fillets, it does not lose them.
   - `constraintSketch` requires `sketchNew`/`sketchDof`, which exist only in the **brepkit** and **manifold** adapters — neither OCCT kernel has it. Nothing is lost.
4. **The init test won't break.** `tests/init.test.ts` is idempotency-based (asserts against `currentKernel`), not hardcoded to `'occt'`.

## Scope

### In scope — code

| Target                                  | Change                                                                                                                                                                                                                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/kernel/index.ts` → `init()`        | Reorder auto-detect: **occt-wasm first** (`OcctKernel.init()` + `OcctWasmAdapter.fromKernel()`) → `brepjs-opencascade` (`occt`) → `brepkit`. Returns `'occt-wasm'` when it loads. Update docstring; remove the trailing "occt-wasm requires manual registration" comment (no longer true). |
| `src/quick.ts`                          | Swap top-level-await init to occt-wasm **with occt fallback** (try/catch): `OcctKernel.init()` + `registerKernel('occt-wasm', OcctWasmAdapter.fromKernel(...))`, falling back to `brepjs-opencascade` + `initFromOC`.                                                                      |
| `scripts/build-quick.js`                | This **generates** `dist/quick.js` (separate from `src/quick.ts`). Update the emitted string to the same occt-wasm-with-fallback logic, importing from `./brepjs.js`.                                                                                                                      |
| `src/worker/`, `packages/brepjs-viewer` | Trace the kernel bootstrap (no direct kernel import found in `src/worker/`); flip any hardcoded `brepjs-opencascade` default to occt-wasm (it ships a `./worker` comlink export) for consistency with the main thread.                                                                     |

### In scope — tests / registry

| Target                        | Change                                                                                                                                                                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default test kernel           | Flip `TEST_KERNEL` unset default from `occt` → `occt-wasm` so CI/pre-commit mirror the shipped default.                                                                                                                                       |
| occt-wasm coverage            | **Measure** occt-wasm coverage, then set enforced thresholds floored at (or 1–2% below) the measured values — lock in current coverage without forcing new tests or flakiness. Replaces its `'informational'` setting in `kernelRegistry.ts`. |
| occt test project             | Keep `occt` running in CI as a **secondary, informational** (non-gating) project so the fallback path keeps coverage.                                                                                                                         |
| Registry flags                | Correct `kernelRegistry.ts` to reality: `occt` `variableFillet: false`, `occt-wasm` `variableFillet: true`, `constraintSketch: false` for both OCCT kernels. Update the assertions in `tests/helpers/kernelRegistry.test.ts`.                 |
| `tests/helpers/kernelInit.ts` | Modernize the `occt-wasm` branch from the low-level `import.meta.resolve` + `locateFile` path to `OcctKernel.init()` + `OcctWasmAdapter.fromKernel()`, matching `init()`/`quick`.                                                             |

### In scope — docs / site

Principle: **`brepjs-opencascade` may appear only where it is literally the npm package** (install commands, peer-dep notes, build/release config, the `packages/brepjs-opencascade/` dir, CI workflows, lockfile). All _narrative_ "the default kernel is …" references switch to `occt-wasm`.

- `README.md`: install → `npm install brepjs occt-wasm`; **Status** reframe → "occt-wasm (OpenCascade compiled to WebAssembly) is the default kernel; brepkit, a Rust-based kernel, is in active development as a faster replacement"; manual-init example → occt-wasm.
- Canonical site `apps/docs/**`: `getting-started/install.md`, `concepts/kernels.md`, `integration/compatibility.md`, `integration/frameworks.md`, `advanced/workers.md`, `introduction/stability.md`, `reference/glossary.md`, and any other default-kernel references.
- Legacy `docs/**` (full sweep): `getting-started.md`, `compatibility.md`, `cheat-sheet.md`, `architecture.md`, `kernel-swap.md`, `threejs-integration.md`, decisions where relevant.
- `src/kernel/README.md`, `llms.txt`, `llms-full.txt`.
- **Compatibility matrix** (`apps/docs/integration/compatibility.md`, `docs/compatibility.md`): rebuild **verified-accurate** — mark occt-wasm default, and cross-check each capability row against the adapters (correct the wrong occt variable-fillet row; constraintSketch is brepkit-only).
- Agent surfaces: `packages/brepjs-agent/README.md`, `packages/brepjs-agent/skill/references/getting-started.md`, `.claude/skills/brepjs-cad/references/getting-started.md`.
- **Playground** (`apps/playground`): `package.json` dep, `vite.config.ts` optimizeDeps/exclude, `src/types/brepjs-ambient.d.ts`, and any visible kernel label/help text so it loads + names occt-wasm.

### Out of scope

- Benchmarks (`benchmarks/**`) — they legitimately compare kernels; `brepjs-opencascade` references stay.
- Build/release/CI infra references to the `brepjs-opencascade` **package** (`vite.config.ts`, `.github/**`, `release-please-*`, `package.json`, lockfile, `scripts/ensure-wasm.sh`, `scripts/publish-all.sh`) — these are package references, not narrative.
- Deprecating or unpublishing `brepjs-opencascade` — it stays supported.

## Architecture / data flow

`init()` becomes a 3-tier graceful auto-detect:

```
init()
  ├─ try occt-wasm   → OcctKernel.init() + OcctWasmAdapter.fromKernel()   → 'occt-wasm'   (NEW default)
  ├─ try opencascade → initFromOC(await opencascade())                    → 'occt'        (fallback)
  └─ try brepkit     → registerKernel('brepkit', …)                       → 'brepkit'     (fallback)
```

`brepjs/quick` (both `src/quick.ts` and the generated `dist/quick.js`) performs
the same occt-wasm-first / occt-fallback resolution under top-level await.

Existing installs that have only `brepjs-opencascade` keep working unchanged via
the fallback. New installs follow the docs (`occt-wasm`) and get `occt-wasm`.

## Error handling

- Each tier of `init()` stays wrapped in try/catch; failure of one tier falls
  through to the next. The final "no kernel package found" error message is
  updated so `occt-wasm` is listed as the recommended install (no longer the
  "requires manual registerKernel" caveat).
- `quick`'s fallback swallows the occt-wasm import/init failure and tries occt;
  if both fail the original error surfaces.

## Testing & verification

- `npm run validate` (typecheck + lint + boundaries + format + changed tests).
- Full occt-wasm suite green (already verified; re-run after changes).
- Coverage run to set + confirm occt-wasm thresholds.
- Targeted: `init()` returns `'occt-wasm'` when occt-wasm present; `brepjs/quick` smoke.
- **Playground: full build + typecheck** to prove the dep/vite-config/ambient-types swap bundles and loads occt-wasm.

## Release & workflow

- Branch `feat/occt-wasm-default`; **logical commits**: (1) `feat(kernel):` flip `init`/`quick`/worker + registry-flag fixes, (2) `test:` occt-wasm default project + coverage + loader modernization, (3) `docs:` doc sweep + playground.
- Semver: **minor `feat`** (graceful fallback, no API signature change), with a clear commit body calling out the default-kernel change + occt-wasm install requirement. CHANGELOG is produced by **release-please** from the commits — no manual CHANGELOG edits.
- Open a PR that **Closes #1136**; **no automerge**; post a short issue comment summarizing the verified findings (suite green, no real capability regression). Author reviews before merge.

## Open risks

- **Coverage floor**: measured occt-wasm coverage may be meaningfully below occt's; we floor at measured (per decision) rather than writing new tests, so the gate reflects reality without scope creep.
- **Worker/viewer bootstrap**: exact init path is unverified; implementation must trace it before flipping, and skip gracefully if no kernel is hardcoded there.
- **CI default flip** touches the pre-commit/pre-push changed-file test path; confirm the occt-wasm project's `excludeTests` still make sense as the default (e.g. brepkit-only files stay excluded).
