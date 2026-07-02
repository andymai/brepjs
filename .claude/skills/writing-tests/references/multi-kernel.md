# Multi-kernel testing reference

## The four vitest projects

Projects are generated in `vitest.config.ts` from `kernelConfigs` in `tests/helpers/kernelRegistry.ts`. Each project sets `env: { TEST_KERNEL: <id> }`, which drives `initKernel()` and `currentKernel`.

| Project     | Kernel                                                                     | Gate status                                                      | Coverage thresholds                                          |
| ----------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------ |
| `occt-wasm` | occt-wasm npm package (`OcctKernel.init()` + `OcctWasmAdapter.fromKernel`) | **default; the CI merge gate** (`default: true` in the registry) | `'informational'` at project level; enforced via root config |
| `occt`      | OpenCascade.js WASM (`brepjs-opencascade`, `initFromOC`)                   | opt-in (`npm run test:occt`)                                     | own thresholds: 84/74/90/84                                  |
| `brepkit`   | brepkit-wasm (`BrepkitAdapter`)                                            | opt-in (`npm run test:brepkit`); not run in CI                   | `'informational'`                                            |
| `manifold`  | Manifold mesh kernel (`brepjs-manifold`)                                   | opt-in (`npx vitest run --project manifold ...`); no npm script  | `'informational'`                                            |

`defaultKernelId()` in `kernelRegistry.ts` is the single source of truth for the default. If the default kernel ever changes, re-measure coverage with `npm run test:full` and re-floor the root thresholds (see the comment above `thresholds` in `vitest.config.ts`).

## Capability flags

Per-kernel booleans in `kernelRegistry.ts`, read via `getKernelCapabilities(id)`:

`projection`, `constraintSketch`, `kernel2D`, `variableFillet`, `offsetSolidV2`, `gridPattern`

Use these (or a `currentKernel` comparison) for **feature-existence** gating:

```ts
import { initKernel, currentKernel } from './setup.js';

it.skipIf(currentKernel !== 'occt-wasm')('unwraps a cylindrical face', () => { ... });
```

Capability gaps are structural ("this kernel has no HLR projection"). Behavioral differences on a shared feature belong in the divergence registry instead.

## Divergence registry

`tests/helpers/kernelDivergences.ts` is the single source of truth for kernel-specific test differences. Never write inline `if (isBrepkit) ctx.skip()` — add a registry entry so the difference is documented, keyed, and rendered into `docs/kernel-conformance.md` (`npm run conformance:generate`).

### Entry format

The registry is a `DivergenceMap`: kernel id → divergence key → entry. Keys follow `operation.specificCase` (e.g. `booleans.cutFuseRecombine`, `projection.makeProjectedEdges`).

```ts
export const divergences: DivergenceMap = {
  manifold: {
    'projection.makeProjectedEdges': {
      kind: 'not-implemented',
      reason: 'manifold is a mesh kernel with no hidden-line-removal projection (projectEdges).',
    },
  },
};
```

Fields: `kind`, `reason` (mandatory, explain the _geometric_ why), optional `since` and `tracking` (upstream issue URL). Tolerance entries additionally carry `relativeTol`, optional `absoluteTol`, and `metric` (`'volume' | 'area' | 'distance' | 'angle' | 'count'`).

### Kinds and their runtime effect

| Kind               | Meaning                                                            | Effect via `skipIfDiverges`                                                        |
| ------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `not-implemented`  | Kernel lacks the feature entirely                                  | Test skipped                                                                       |
| `skip`             | Feature exists but this case is invalid/meaningless on this kernel | Test skipped                                                                       |
| `tolerance`        | Same result, looser numeric agreement                              | **No-op** — test still runs; entry is informational + feeds `getToleranceFor(key)` |
| `topology-differs` | Valid result with different topology (e.g. face count)             | **No-op** — informational                                                          |

### Consuming entries in tests

Per-test skip requires the vitest `TestContext`:

```ts
import { skipIfDiverges } from './helpers/kernelDivergences.js';

it('sections a sphere to a face', (ctx) => {
  skipIfDiverges(ctx, 'booleanFns.sectionToFaceSphere');
  // ...
});
```

Whole-suite skip (no ctx available at `describe` level):

```ts
import { shouldSkipSuite } from './helpers/kernelDivergences.js';

describe.skipIf(shouldSkipSuite('booleans.cutFuseRecombine'))('recombine identity', () => { ... });
```

Other helpers: `getDivergence(key, kernelId?)`, `getAllDivergences()`, `expectClose(actual, expected, relTol = 1e-4, absTol = 1e-10)`, `expectKernelsAgree(valA, valB, label, relTol?, absTol?)`.

Note: `currentKernelId` in `kernelDivergences.ts` falls back to `'occt'` when `TEST_KERNEL` is unset, whereas `currentKernel` in `tests/setup-kernel.ts` falls back to the registry default (`occt-wasm`). Inside vitest this never matters (projects always set `TEST_KERNEL`), but be aware when running helpers outside vitest.

## Excluded suites — what actually runs where

### `alwaysExclude` (`vitest.config.ts`) — excluded from ALL kernel projects

| File/pattern                                                        | Why excluded                                        | How it actually runs                                                                                                                 |
| ------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `tests/io-stress.test.ts`                                           | Own config with 60 s timeout                        | `npm run test:stress` (`vitest.stress.config.ts`, `TEST_KERNEL=occt`)                                                                |
| `tests/kernel-agreement.test.ts`                                    | Manages its own dual-kernel init (`initAllKernels`) | Explicit path only: `npx vitest run tests/kernel-agreement.test.ts`. **No npm script, no CI job — rots silently unless run by hand** |
| `tests/brepkit-adapter.test.ts`, `tests/brepkit-validation.test.ts` | Need a real brepkit-wasm install or local link      | Explicit path only; same silent-rot caveat                                                                                           |
| `benchmarks/**`                                                     | Own config                                          | `npm run bench` (`vitest.bench.config.ts`)                                                                                           |
| `packages/brepjs-cad/**`, `packages/brepjs-viewer/**`               | Own `@` alias + own vitest config                   | Dedicated CI jobs via `npm run test --workspace=<pkg>`                                                                               |
| `apps/**`, `.worktrees/**`, `.claude/worktrees/**`                  | Not part of the library suite                       | apps/playground is gated by `tsc -b` only                                                                                            |

Do not confuse `tests/brepkit-adapter.test.ts` (hyphenated, excluded) with `tests/brepkitAdapter.test.ts` (camelCase, NOT excluded) — the latter drives `BrepkitAdapter` with a pure mock kernel and runs as a unit test in every project.

When touching the excluded suites, run them by explicit path locally before merging; nothing else will.

### occt-wasm project `excludeTests` (`kernelRegistry.ts`)

Excluded from the default gate even though it is the default project: `tests/brepkitExtended.test.ts`, `tests/brepkitSketchArc.test.ts`, `tests/brepkitOffsetV2.test.ts`, `tests/gltfRoundTrip.test.ts`. The brepkit ones run under `npm run test:brepkit`.

Companion packages (`brepjs-sheetmetal`, `brepjs-bim`) test through their own workspace CI jobs, but the root suite aliases their bare specifiers to live `src` (`vitest.config.ts` resolve aliases) so root tests that import them exercise current source, not stale dist.

## Parity suite (`tests/parity/`)

The kernel-agnostic behavioral spec. Rules (full text in `tests/parity/README.md`):

1. Reference values come from closed-form math, never from a kernel's output.
2. Algebraic invariants (inclusion–exclusion etc.) via `fast-check`, `numRuns: 50`.
3. Round-trip I/O invariants to precision 6.
4. Positional offsets must use the quantized `fcOffset` generator, not raw `fc.double` — sub-micron offsets put OCCT booleans in unstable near-coincident configurations and fast-check shrinks straight toward them.

The README's "how parity failure surfaces" table predates the occt-wasm default switch: the required gate is now the occt-wasm project; brepkit/manifold parity failures remain informational.
