---
name: writing-tests
description: This skill should be used when writing, running, or fixing tests in the brepjs repository — when a task says "add a test", "write a regression test", "tests are failing", "test timed out", "coverage threshold failed", "run tests against brepkit/manifold/occt", "skip this test on kernel X", or when a new operation needs test coverage before merge. Covers the test skeleton, geometry assertions, multi-kernel projects, divergence skips, and coverage gates.
---

# Writing and running tests

## Test file skeleton

Tests live in `/tests/`, named `<moduleName>.test.ts` (e.g. `tests/shapeFns.test.ts`); `api*.test.ts` for public-API surface tests. Extend an existing file for the module before creating a new one.

Exact boilerplate (from `tests/booleanFns.test.ts`):

```ts
import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { box, fuse, isOk, unwrap, measureVolume } from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);
```

Rules:

- Import `initKernel` from `./setup.js` — **not** `initOC`. `initOC` is a backward-compat alias (`tests/setup.ts`) that force-boots the legacy OpenCascade.js kernel regardless of which vitest project is running. `initKernel()` (`tests/helpers/kernelInit.ts`) reads the `TEST_KERNEL` env var set by the vitest project, so the same test runs correctly under all four kernels. CLAUDE.md's "Writing a test" section still names `initOC`; prefer `initKernel`.
- The `30000` is the `beforeAll` hook timeout (WASM boot can be slow on first run). It is NOT the per-test timeout — that is **90 s** (`testTimeout: 90000` in `vitest.config.ts`; CLAUDE.md's "30s timeout" claim is stale).
- Import the public surface from `@/index.js`. Cross-directory imports use the `@/` alias (→ `src/`), always with `.js` extensions. Vitest globals are enabled, but files still import `describe`/`it`/`expect` explicitly.
- Reach for internals (`@/core/shapeTypes.js`, helpers in `tests/helpers/`) only when the public API cannot express the assertion.

## Assertions

- **Result handling**: assert `expect(isOk(result)).toBe(true)` first, then `unwrap(result)` to get the value. Use `isErr()`/`unwrapErr()` for error-path tests. `unwrap` is fine in tests; production code in layers 2–3 uses `isOk()`/`match()` — see the result-error-handling skill.
- **Floating point**: always `toBeCloseTo(expected, precision)`, never exact equality. Convention for unit-scale geometry: `toBeCloseTo(2000, 0)` (within 0.5 absolute). Round-trip serialization checks use precision 6 (`tests/parity/README.md`).
- **Shape kinds**: `isSolid()`, `isFace()`, `isWire()`, `isCompound()`, `isShape3D()`, or `getShapeKind()`.
- **Geometry validity**: assert real measurements — `unwrap(measureVolume(shape))`, `unwrap(measureArea(shape))` — not just "operation returned Ok".
- **Cross-kernel numeric checks**: `expectClose(actual, expected, relTol?, absTol?)` and `expectKernelsAgree(valA, valB, label)` from `tests/helpers/kernelDivergences.ts` (default relTol `1e-4`).

Worked example:

```ts
describe('fuse', () => {
  it('fuses two boxes', () => {
    const result = fuse(boxA, boxB);
    expect(isOk(result)).toBe(true);
    const shape = unwrap(result);
    expect(isShape3D(shape)).toBe(true);
    expect(unwrap(measureVolume(shape))).toBeCloseTo(2000, 0);
  });
});
```

## Running tests

| Command                                             | What it runs                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------------- |
| `npm run test`                                      | occt-wasm project, changed files only, no coverage (the pre-commit tier-2 gate) |
| `npm run test:full`                                 | occt-wasm project, full suite **with coverage thresholds enforced**             |
| `npm run test:ci`                                   | occt-wasm project, full suite, no coverage (CI shards this 4-way)               |
| `npm run test:watch`                                | occt-wasm project, watch mode                                                   |
| `npm run test:occt` / `npm run test:brepkit`        | legacy OpenCascade.js / brepkit projects                                        |
| `npx vitest run --project manifold tests/x.test.ts` | manifold project (no npm script exists)                                         |
| `npm run test:stress`                               | `tests/io-stress.test.ts` only, via `vitest.stress.config.ts`                   |
| `npm run test:docs`                                 | extracts doc snippets, runs generated `tests/docs/extracted.test.ts`            |

**Single file — always pass `--project`**:

```bash
npx vitest run --project occt-wasm tests/booleanFns.test.ts
```

A bare `npx vitest run tests/x.test.ts` fans out to **all four kernel projects** (manifold, occt, brepkit, occt-wasm) and will fail on kernels the test was never gated for. This corrects the bare-run example in CLAUDE.md.

Runner facts (`vitest.config.ts`): `pool: 'forks'` with `--max-old-space-size=6144`; `maxWorkers` defaults to 4 because OCCT WASM linear memory grows monotonically per fork and more forks swap-thrash — raise locally with `VITEST_MAX_WORKERS=<n>`. Pre-commit runs changed-file tests (or the full coverage run with `FULL_TESTS=1`); pre-push runs no tests. See the quality-gates skill for the full gate stack and ci-triage for CI behavior.

## Multi-kernel testing

Four vitest projects are generated from `tests/helpers/kernelRegistry.ts`: `occt`, `brepkit`, `occt-wasm` (**the default and the merge gate**), and `manifold`. Each project sets `TEST_KERNEL=<id>`; `initKernel()` and `currentKernel` (from `./setup.js`) read it.

Decision table for a test that misbehaves on some kernel:

| Situation                                              | Do this                                                                                                                                                              |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Feature exists only on some kernels (capability gap)   | Check `getKernelCapabilities(id)` flags in `tests/helpers/kernelRegistry.ts`; gate with `it.skipIf(currentKernel !== 'occt-wasm')(...)` (see `tests/curves.test.ts`) |
| Kernel produces a genuinely different-but-valid result | Add an entry to the divergence registry in `tests/helpers/kernelDivergences.ts`, then `it('...', (ctx) => { skipIfDiverges(ctx, 'module.case'); ... })`              |
| A whole describe block diverges                        | `describe.skipIf(shouldSkipSuite('module.case'))(...)`                                                                                                               |
| Test file cannot run at all on one kernel              | Add it to that kernel's `excludeTests` in `kernelRegistry.ts`                                                                                                        |

Never inline `if (isBrepkit) ctx.skip()` — the registry is the single source of truth, and `docs/kernel-conformance.md` is generated from it (`npm run conformance:generate`). Registry entry format, divergence kinds, capability flags, and the excluded-suite inventory are in `references/multi-kernel.md`.

Kernel-agnostic behavioral specs (closed-form reference values, fast-check invariants) live in `tests/parity/` — read `tests/parity/README.md` before adding one. Note its gate table predates the occt-wasm default; the required gate is now the occt-wasm project.

## Coverage

Root thresholds (`vitest.config.ts`): statements 85, branches 71, functions 91, lines 88. These are **measured floors** for the occt-wasm project, not aspirational targets — new code below the floor fails `npm run test:full` locally. Per-kernel: the `occt` project has its own thresholds; `brepkit`, `occt-wasm`, and `manifold` projects are `'informational'` (thresholds enforced at the root config level for the default kernel). Each kernel's coverage excludes the _other_ kernels' adapter dirs (`coverageExcludesFor()` in `kernelRegistry.ts`).

CI nuance: coverage is **not a PR gate** — the `coverage` job runs only on push to main with `continue-on-error: true` (`.github/workflows/ci.yml`). The enforcement point that bites during development is local `npm run test:full` (also pre-commit with `FULL_TESTS=1`). If a function-coverage miss blocks a commit, add tests for the new code rather than lowering thresholds; only re-floor after re-measuring with `npm run test:full` (and say so in the PR).

## Benchmarks / performance regressions

Performance benches live in `benchmarks/*.bench.test.ts` (~20 files), separate from the correctness suite. They share `benchmarks/harness.ts` (the `bench()` timer + `printResults`/`writeResultsJSON`/`compareResults`) and `benchmarks/setup.ts` (`initBenchKernels()`, driven by the `BENCH_KERNELS` env var). They run under their own config, `vitest.bench.config.ts` (`include: ['benchmarks/**/*.bench.test.ts']`, `testTimeout: 120000`, forks pool) — the root `vitest.config.ts` excludes `benchmarks/` entirely.

**Bench tests do not assert.** Each `it()` runs `bench()` and prints a markdown/JSON table; nothing fails on slowness. Read the numbers by eye against a baseline.

Run commands:

| Command                                                                               | What it runs                                                                                         |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `npm run bench`                                                                       | all bench files; `BENCH_KERNELS` defaults to `occt` (legacy OpenCascade.js), single-kernel for speed |
| `npm run bench:compare`                                                               | `BENCH_KERNELS=both` — occt + brepkit + occt-wasm side by side                                       |
| `npm run bench:json`                                                                  | `BENCH_KERNELS=both BENCH_OUTPUT_JSON=1` — emits the JSON block CI parses                            |
| `npx vitest run benchmarks/gridPattern.bench.test.ts --config vitest.bench.config.ts` | one bench file                                                                                       |

Baselines are committed **markdown reports** under `benchmarks/results/`, not JSON fixtures: `v8-baseline.md` is a frozen snapshot; `latest.md` is auto-generated by `kernel-comparison.bench.test.ts` (`generateReport` writes it, header says "Do not edit manually"). The regression-oriented bench files (`regression.bench.test.ts`, `regression-885.bench.test.ts`, `booleanBatch`, `gridPattern`, `optimization-targets`) each pin a set of named scenarios whose medians are the thing you compare across runs.

Interpreting a regression: `compareResults(current, baseline, threshold = 0.1)` (in `harness.ts`) flags any benchmark whose median grew more than `threshold` (10% default) over the baseline. Match by the exact `name` string. Noise on shared machines runs ±9–15%, so treat a single sub-25% delta as noise and re-run before believing it.

Add or update a baseline:

- **New bench**: create `benchmarks/<name>.bench.test.ts`, import init from `./setup.js` and helpers from `./harness.js`, and follow an existing file (e.g. `gridPattern.bench.test.ts`).
- **Refresh the kernel-comparison report**: run `npm run bench:compare`, which rewrites `benchmarks/results/latest.md`. Do not hand-edit it.
- **Freeze a new reference point**: commit a new `<tag>-baseline.md` alongside `v8-baseline.md` rather than overwriting the old frozen snapshot.

**CI blind spot.** Only `regression.bench.test.ts` runs in CI — the dedicated `benchmark` job (`.github/workflows/ci.yml`) runs it PR-only, compares PR-vs-main medians at a 25% threshold, posts a comparison comment, and `core.setFailed`s (it is in the `ci-pass` needs-list, so a >25% regression blocks merge). Every **other** bench file sits in `alwaysExclude` (`vitest.config.ts`) and never runs in CI, so their committed baseline reports rot silently — run the suite locally when touching a hot path. See the `ci-triage` skill's "Blind spots" section.

## Symptom → cause → fix

| Symptom                                                                  | Cause                                                                              | Fix                                                                                                                                          |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Test passes locally, fails in another kernel project in CI-adjacent runs | Ran bare `npx vitest run <file>` or test isn't kernel-portable                     | Pass `--project occt-wasm`; use `initKernel()` not `initOC`; gate via capabilities or the divergence registry                                |
| Test hangs then fails at 90 s                                            | Per-test `testTimeout` (90000 ms), often memory pressure from too many forks       | Lower/raise `VITEST_MAX_WORKERS`; on CI this is why the test job is sharded (see ci-triage)                                                  |
| `beforeAll` timeout at 30 s                                              | First WASM boot slow, or the hook timeout argument was omitted                     | Keep the `, 30000` third argument on `beforeAll`                                                                                             |
| Flaky float comparison                                                   | Exact equality or too-tight precision                                              | `toBeCloseTo(expected, 0)` for unit-scale geometry; `expectClose` with relative tolerance for derived values                                 |
| New test never runs in CI                                                | File matches `alwaysExclude` in `vitest.config.ts` or a kernel `excludeTests` list | Check both lists; excluded suites (`kernel-agreement`, `brepkit-validation`, …) run only by explicit path — see `references/multi-kernel.md` |
| Coverage functions threshold fails on `test:full` but CI is green        | Coverage is main-only + non-blocking in CI; local run enforces                     | Add tests for uncovered functions before pushing                                                                                             |
| fast-check parity test flakes with huge volume error                     | Raw `fc.double` offsets create sub-micron near-coincident solids                   | Use the quantized `fcOffset` generator (`tests/parity/README.md`, "Input generators")                                                        |
| Import errors like "Cannot find module './foo'"                          | Missing `.js` extension on a `.ts` import                                          | All imports use `.js` extensions; `@/` for cross-directory                                                                                   |

## Checklist before committing a test

1. `initKernel()` in `beforeAll(..., 30000)`, imported from `./setup.js`.
2. Public API via `@/index.js`; `.js` extensions everywhere.
3. `isOk` + `unwrap`, `toBeCloseTo`, type guards, `measureVolume`/`measureArea`.
4. Kernel-specific behavior handled via registry/capabilities, not inline skips.
5. `npx vitest run --project occt-wasm tests/<file>.test.ts` green.
6. If the change touches shared geometry code, spot-check one other kernel: `npx vitest run --project brepkit tests/<file>.test.ts`.

## Additional resources

- `references/multi-kernel.md` — divergence registry entry format, capability flags, excluded-suite inventory and how each actually runs, parity-suite pointers.
- `tests/parity/README.md` — parity philosophy, tolerance policy, input generators.
- `docs/kernel-conformance.md` — generated capability/divergence matrix (`npm run conformance:generate`).
- Sibling skills: `adding-operations` (what to test when adding an op), `kernel-abstraction` (adapter/kernel structure), `debugging-geometry` (when an assertion fails for geometric reasons), `result-error-handling` (Result semantics), `quality-gates` (pre-commit/validate stack), `ci-triage` (shard failures, CI-only reds, bench blind spots), `memory-and-disposal` (`using`/handle leaks that surface as test crashes).
