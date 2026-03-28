# Kernel Testing Architecture — Design Spec

**Date:** 2026-03-27
**Status:** Approved

## Problem

The kernel testing infrastructure has grown organically with three kernels (occt, brepkit, occt-wasm) and suffers from:

1. **~57 scattered kernel-specific skips** across ~17 test files (plus additional `describe.skipIf` and `excludeTests` patterns) — inline `if (isBrepkit) ctx.skip()` checks that are hard to audit, go stale, and obscure what each kernel actually supports.
2. **Adding a new kernel requires editing 3+ config files** — vitest.config.ts, setup files, package.json scripts, benchmark setup — with no single guide for what's needed.
3. **Coverage blind spots** — thresholds only apply to OCCT runs. No visibility into brepkit or occt-wasm code path coverage.
4. **Duplicated init logic** — three slightly-different kernel initialization paths in tests, benchmarks, and the agreement suite.
5. **Scattered feature detection** — `supportsProjection()`, `supportsConstraintSketch()`, etc. live on individual adapters with no unified view.

## Solution

A **registry-centric architecture** where a central divergence registry is the single source of truth for all kernel differences. Everything derives from it: test skipping, conformance matrix, tolerance specs, and new kernel onboarding.

## Architecture

```
kernelRegistry.ts ────→ vitest project generation (config-driven)
       │                 npm script validation
       │                 unified kernel init
       │                 capability flags (runtime feature detection)
       │
kernelDivergences.ts ─→ test skip logic (skipIfDiverges)
       │                 tolerance specs (getToleranceFor)
       │                 conformance matrix generation
       │                 benchmark skip logic
       │
scripts/generateConformance.ts → docs/kernel-conformance.md
```

### Files to Create

| File                                 | Layer      | Purpose                                                         |
| ------------------------------------ | ---------- | --------------------------------------------------------------- |
| `tests/helpers/kernelRegistry.ts`    | Test infra | Kernel configs driving vitest projects, init, capabilities      |
| `tests/helpers/kernelDivergences.ts` | Test infra | All kernel divergences: skips, tolerances, topology differences |
| `tests/helpers/kernelInit.ts`        | Test infra | Unified init module for tests, benchmarks, agreement suite      |
| `scripts/generateConformance.ts`     | Tooling    | Reads registry + interfaces → generates conformance markdown    |

### Files to Modify

| File                                 | Change                                                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `vitest.config.ts`                   | Read kernel list from registry, generate projects dynamically                                              |
| `tests/setup-kernel.ts`              | Delegate to `kernelInit.ts`                                                                                |
| `tests/setup.ts`                     | Re-export from `kernelInit.ts` for backward compat                                                         |
| `benchmarks/setup.ts`                | Use `kernelInit.ts` instead of own init logic                                                              |
| `benchmarks/harness.ts`              | `createDualKernelBench` → `createMultiKernelBench` using registry                                          |
| `package.json`                       | Add `conformance:generate` script; ensure per-kernel test scripts match registry                           |
| `tests/helpers/kernelEnv.ts`         | Delete — replaced by `kernelRegistry.ts` (current kernel ID derived from registry)                         |
| `tests/helpers/kernelTestHarness.ts` | Merge useful utilities (`expectKernelsAgree`, `expectClose`) into `kernelDivergences.ts`; delete remainder |
| ~17 test files                       | Replace inline `if (isBrepkit) ctx.skip()` with `skipIfDiverges(ctx, key)`                                 |

## Component Designs

### 1. Kernel Registry

Central config for all known kernels. Drives vitest project generation, init, and capability detection.

```ts
// tests/helpers/kernelRegistry.ts

interface KernelConfig {
  id: string; // 'occt' | 'brepkit' | 'occt-wasm'
  displayName: string;
  setupModule: string; // path to adapter init function
  envOverrides?: Record<string, string> | undefined;
  excludeTests?: string[] | undefined; // test files to exclude for this kernel
  coverageThresholds?: CoverageThresholds | 'informational' | undefined;
  capabilities: {
    projection: boolean;
    constraintSketch: boolean;
    kernel2D: boolean;
    variableFillet: boolean;
    offsetSolidV2: boolean;
    gridPattern: boolean;
  };
}

export const kernelConfigs: KernelConfig[] = [
  {
    id: 'occt',
    displayName: 'OpenCascade',
    setupModule: './tests/helpers/kernelInit.js',
    coverageThresholds: { statements: 84, branches: 74, functions: 90 },
    capabilities: {
      projection: true,
      constraintSketch: true,
      kernel2D: true,
      variableFillet: true,
      offsetSolidV2: false,
      gridPattern: false,
    },
  },
  {
    id: 'brepkit',
    displayName: 'brepkit',
    setupModule: './tests/helpers/kernelInit.js',
    coverageThresholds: 'informational',
    capabilities: {
      projection: false,
      constraintSketch: true,
      kernel2D: true,
      variableFillet: false,
      offsetSolidV2: true,
      gridPattern: true,
    },
  },
  // Adding a new kernel = adding an entry here
];

export function getKernelConfig(id: string): KernelConfig | undefined;
export function getKernelCapabilities(id: string): KernelConfig['capabilities'];
```

### 2. Divergence Registry

Source of truth for all known kernel differences. Granular keys at the `operation.specificCase` level.

```ts
// tests/helpers/kernelDivergences.ts

type DivergenceKind =
  | 'not-implemented' // kernel doesn't support this
  | 'skip' // test must skip (different behavior, not a bug)
  | 'tolerance' // works but results differ within tolerance
  | 'topology-differs'; // geometric result correct, topology structure differs

interface BaseDivergence {
  kind: DivergenceKind;
  reason: string;
  since?: string | undefined; // kernel version when noted
  tracking?: string | undefined; // issue/PR link
}

interface ToleranceDivergence extends BaseDivergence {
  kind: 'tolerance';
  relativeTol: number; // e.g. 0.05 = 5%
  absoluteTol?: number | undefined;
  metric: 'volume' | 'area' | 'distance' | 'angle' | 'count';
}

type Divergence = BaseDivergence | ToleranceDivergence;

// Keyed by kernel id → divergence key (operation.specificCase)
type DivergenceMap = Record<string, Record<string, Divergence>>;

export const divergences: DivergenceMap = {
  brepkit: {
    variableFillet: {
      kind: 'not-implemented',
      reason: 'brepkit has no variable-radius fillet callback API',
    },
    'booleanFuse.disjointInputs': {
      kind: 'skip',
      reason: 'brepkit throws on disjoint boolean; OCCT returns empty compound',
    },
    sphereVolume: {
      kind: 'tolerance',
      reason: 'Tessellation-based approximation vs analytic OCCT surface',
      relativeTol: 0.05,
      metric: 'volume',
    },
    'faceFinder.compoundFaces': {
      kind: 'topology-differs',
      reason: 'brepkit returns 2 split faces vs OCCT 1 merged face',
    },
    // ... all ~108 entries migrated here
  },
  'occt-wasm': {
    // ... divergences for the emerging kernel
  },
};

// Test helper API
// kernelId defaults to process.env.TEST_KERNEL; multi-kernel consumers (agreement suite,
// benchmarks) must pass it explicitly.
export function skipIfDiverges(ctx: TaskContext, key: string, kernelId?: string): void;
export function getDivergence(key: string, kernelId?: string): Divergence | undefined;
export function getToleranceFor(key: string, kernelId?: string): ToleranceDivergence | undefined;
export function getAllDivergences(): DivergenceMap;
```

### 3. Unified Kernel Init

Single init module replacing three separate paths.

```ts
// tests/helpers/kernelInit.ts

export async function initKernel(id?: string): Promise<void>;
// Defaults to process.env.TEST_KERNEL ?? 'occt'
// Uses kernelRegistry to find setup module
// Idempotent — safe to call multiple times

export async function initAllKernels(): Promise<string[]>;
// Loads all available kernels (for agreement suite, benchmarks)
// Returns list of successfully loaded kernel ids

export function getAvailableKernels(): string[];
// Returns kernel ids that are loadable in this environment
```

Consumers:

- `tests/setup-kernel.ts` → `initKernel()` (reads TEST_KERNEL)
- `tests/setup.ts` → re-exports `initKernel as initOC` for backward compat
- `benchmarks/setup.ts` → `initKernel()` or `initAllKernels()` based on BENCH_KERNELS
- `tests/kernel-agreement.test.ts` → `initAllKernels()`

### 4. Config-Driven Vitest Projects

vitest.config.ts reads from kernel registry instead of hardcoding projects.

**Important constraint**: `kernelRegistry.ts` must have **zero imports from project source** (`src/`, `@/` alias). It is a pure data file with type definitions only. This is because vitest.config.ts is evaluated before the project's TypeScript/path-alias resolution is available.

```ts
// vitest.config.ts (simplified)
import { kernelConfigs } from './tests/helpers/kernelRegistry.js';

export default defineConfig({
  test: {
    workspace: kernelConfigs.map((k) => ({
      test: {
        name: k.id,
        env: { TEST_KERNEL: k.id, ...k.envOverrides },
        exclude: [...sharedExcludes, ...(k.excludeTests ?? [])],
        setupFiles: ['./tests/setup-kernel.ts'],
        coverage:
          k.coverageThresholds === 'informational'
            ? { enabled: true, reportsDirectory: `coverage/${k.id}` }
            : {
                enabled: true,
                reportsDirectory: `coverage/${k.id}`,
                thresholds: k.coverageThresholds,
              },
      },
    })),
  },
});
```

### 5. Per-Kernel Coverage

Each kernel writes to its own coverage directory:

```
coverage/
  occt/          → enforced thresholds (84% statements, 74% branches, 90% functions)
  brepkit/       → informational (no threshold enforcement)
  occt-wasm/     → informational
```

- `npm run test:full` → OCCT with enforced coverage (existing behavior preserved)
- `npm run test:full:brepkit` → brepkit with coverage (informational)
- Per-kernel numbers visible in CI artifacts

### 6. Conformance Matrix Generator

Script that reads the divergence registry + KernelAdapter interface and produces a markdown conformance table.

```
npm run conformance:generate → docs/kernel-conformance.md
```

Output format:

```markdown
# Kernel Conformance Matrix

Generated: 2026-03-27

## Capabilities

| Capability       | occt | brepkit | occt-wasm |
| ---------------- | ---- | ------- | --------- |
| projection       | ✅   | ❌      | ❌        |
| constraintSketch | ✅   | ✅      | ❌        |
| variableFillet   | ✅   | ❌      | ⏭️        |

## Operation Parity

| Operation                  | occt | brepkit      | occt-wasm |
| -------------------------- | ---- | ------------ | --------- |
| makeBox                    | ✅   | ✅           | ✅        |
| booleanFuse                | ✅   | ✅           | ✅        |
| booleanFuse.disjointInputs | ✅   | ⏭️ skip      | ⏭️ skip   |
| sphereVolume               | ✅   | ⚠️ 5% vol    | ✅        |
| faceFinder.compoundFaces   | ✅   | 🔀 topo diff | ✅        |
```

### 7. Benchmark Integration

Benchmarks use the shared kernel infrastructure:

- `benchmarks/setup.ts` calls `initKernel()` / `initAllKernels()` from `kernelInit.ts`
- `createDualKernelBench()` → `createMultiKernelBench()` iterating all available kernels from registry
- Benchmarks skip operations where divergence registry shows `not-implemented`
- `BENCH_KERNELS=all` loads every registered kernel; `BENCH_KERNELS=occt` loads just occt

## Migration Strategy

The ~57 inline skip sites (plus `describe.skipIf` patterns) are migrated incrementally:

1. Create registry with all divergences catalogued
2. Add `skipIfDiverges()` helper
3. Migrate test files one at a time, replacing inline checks
4. Each migration is a small, reviewable diff
5. CI validates: if a test previously skipped now runs (because divergence was removed), it must pass

## Test Plan

- All existing tests continue to pass with no behavior change
- `skipIfDiverges()` produces identical skip behavior to current inline checks
- New kernel added to registry → vitest project auto-generated, tests run
- `npm run conformance:generate` produces valid markdown matching current known state
- Coverage dirs created per kernel, OCCT thresholds unchanged
- Benchmark harness loads all kernels via shared init, skips not-implemented operations

## Decisions

- **Divergence registry over capability flags for test skipping**: Capabilities are binary (supported/not); divergences are nuanced (tolerance, topology, behavior). Tests need the nuance.
- **Capabilities on KernelConfig for runtime detection**: Production code (`supportsProjection()`) uses capability flags, not the divergence registry. Clear separation of test vs runtime concerns.
- **OCCT coverage enforced, others informational**: brepkit is catching up; enforcing thresholds would block PRs unnecessarily. Track progress via informational reports.
- **Agreement suite stays manual**: Cross-kernel parity tests are expensive and investigative. The divergence registry + conformance matrix provide CI-level visibility without the cost.
- **Granular divergence keys**: `operation.specificCase` level (e.g. `booleanFuse.disjointInputs`) mirrors actual test skip granularity. Whole-operation keys (e.g. `variableFillet`) used when the entire operation is unsupported.
