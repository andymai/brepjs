# Kernel Testing Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace scattered kernel-specific test skips with a central divergence registry, config-driven test matrix, unified init, and per-kernel coverage.

**Architecture:** A `kernelRegistry.ts` (pure data, no project imports) drives vitest project generation and capability detection. A `kernelDivergences.ts` holds all known kernel differences and provides `skipIfDiverges()` / `getToleranceFor()` helpers. A `kernelInit.ts` unifies the three separate init paths. A `generateConformance.ts` script produces the conformance matrix markdown.

**Tech Stack:** TypeScript, Vitest workspace projects, Node.js scripts

**Spec:** `docs/superpowers/specs/2026-03-27-kernel-testing-architecture-design.md`

---

### Task 1: Create Kernel Registry

**Files:**

- Create: `tests/helpers/kernelRegistry.ts`
- Test: `tests/helpers/kernelRegistry.test.ts`

This file must have **zero imports from project source** (`src/`, `@/` alias). It is a pure data + type file consumed by `vitest.config.ts` at config-load time, before TypeScript path aliases are resolved.

- [ ] **Step 1: Write the test for kernelRegistry**

```ts
// tests/helpers/kernelRegistry.test.ts
import { describe, it, expect } from 'vitest';
import {
  kernelConfigs,
  getKernelConfig,
  getKernelCapabilities,
  type KernelConfig,
} from './kernelRegistry.js';

describe('kernelRegistry', () => {
  it('exports at least occt and brepkit configs', () => {
    const ids = kernelConfigs.map((k) => k.id);
    expect(ids).toContain('occt');
    expect(ids).toContain('brepkit');
  });

  it('each config has required fields', () => {
    for (const cfg of kernelConfigs) {
      expect(cfg.id).toBeTruthy();
      expect(cfg.displayName).toBeTruthy();
      expect(cfg.capabilities).toBeDefined();
    }
  });

  it('getKernelConfig returns config by id', () => {
    const occt = getKernelConfig('occt');
    expect(occt).toBeDefined();
    expect(occt?.id).toBe('occt');
  });

  it('getKernelConfig returns undefined for unknown id', () => {
    expect(getKernelConfig('nonexistent')).toBeUndefined();
  });

  it('getKernelCapabilities returns capabilities', () => {
    const caps = getKernelCapabilities('occt');
    expect(caps.variableFillet).toBe(true);
    expect(caps.offsetSolidV2).toBe(false);
  });

  it('getKernelCapabilities throws for unknown kernel', () => {
    expect(() => getKernelCapabilities('nonexistent')).toThrow();
  });

  it('occt has coverage thresholds, brepkit is informational', () => {
    const occt = getKernelConfig('occt')!;
    const brepkit = getKernelConfig('brepkit')!;
    expect(occt.coverageThresholds).not.toBe('informational');
    expect(brepkit.coverageThresholds).toBe('informational');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/helpers/kernelRegistry.test.ts --project occt`
Expected: FAIL — module not found

- [ ] **Step 3: Implement kernelRegistry.ts**

```ts
// tests/helpers/kernelRegistry.ts
//
// IMPORTANT: This file must have ZERO imports from project source (src/, @/ alias).
// It is loaded by vitest.config.ts before TypeScript path aliases are resolved.

export interface CoverageThresholds {
  statements: number;
  branches: number;
  functions: number;
  lines: number;
}

export interface KernelConfig {
  readonly id: string;
  readonly displayName: string;
  readonly envOverrides?: Record<string, string> | undefined;
  readonly excludeTests?: readonly string[] | undefined;
  readonly coverageThresholds?: CoverageThresholds | 'informational' | undefined;
  readonly capabilities: {
    readonly projection: boolean;
    readonly constraintSketch: boolean;
    readonly kernel2D: boolean;
    readonly variableFillet: boolean;
    readonly offsetSolidV2: boolean;
    readonly gridPattern: boolean;
  };
}

export const kernelConfigs: readonly KernelConfig[] = [
  {
    id: 'occt',
    displayName: 'OpenCascade',
    coverageThresholds: { statements: 84, branches: 74, functions: 90, lines: 84 },
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
  {
    id: 'occt-wasm',
    displayName: 'occt-wasm',
    coverageThresholds: 'informational',
    excludeTests: ['tests/brepkitExtended.test.ts', 'tests/brepkitAdapter.test.ts'],
    capabilities: {
      projection: false,
      constraintSketch: false,
      kernel2D: false,
      variableFillet: false,
      offsetSolidV2: false,
      gridPattern: false,
    },
  },
] as const;

export function getKernelConfig(id: string): KernelConfig | undefined {
  return kernelConfigs.find((k) => k.id === id);
}

export function getKernelCapabilities(id: string): KernelConfig['capabilities'] {
  const cfg = getKernelConfig(id);
  if (!cfg) throw new Error(`Unknown kernel: "${id}"`);
  return cfg.capabilities;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/helpers/kernelRegistry.test.ts --project occt`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/helpers/kernelRegistry.ts tests/helpers/kernelRegistry.test.ts
git commit -m "feat(test-infra): add kernel registry with config-driven kernel definitions"
```

---

### Task 2: Create Divergence Registry

**Files:**

- Create: `tests/helpers/kernelDivergences.ts`
- Test: `tests/helpers/kernelDivergences.test.ts`

This is the largest new file. It catalogues all ~57 inline `isBrepkit` skips plus `describe.skipIf` patterns into a single registry. The divergence keys use `operation.specificCase` format matching the test context.

- [ ] **Step 1: Write the test for kernelDivergences**

```ts
// tests/helpers/kernelDivergences.test.ts
import { describe, it, expect } from 'vitest';
import {
  divergences,
  getDivergence,
  getToleranceFor,
  getAllDivergences,
  currentKernelId,
} from './kernelDivergences.js';

describe('kernelDivergences', () => {
  it('exports a non-empty divergence map', () => {
    const all = getAllDivergences();
    expect(Object.keys(all).length).toBeGreaterThan(0);
  });

  it('brepkit has divergences declared', () => {
    const bk = divergences['brepkit'];
    expect(bk).toBeDefined();
    expect(Object.keys(bk ?? {}).length).toBeGreaterThan(0);
  });

  it('getDivergence returns divergence for known key', () => {
    const div = getDivergence('variableFillet', 'brepkit');
    expect(div).toBeDefined();
    expect(div?.kind).toBe('not-implemented');
  });

  it('getDivergence returns undefined for unknown key', () => {
    expect(getDivergence('nonexistent.key', 'brepkit')).toBeUndefined();
  });

  it('getDivergence defaults to current kernel from env', () => {
    // currentKernelId reads from TEST_KERNEL env
    const div = getDivergence('variableFillet');
    // Result depends on which kernel is running; just verify no crash
    expect(div === undefined || div.kind !== undefined).toBe(true);
  });

  it('getToleranceFor returns tolerance divergence with numeric fields', () => {
    const tol = getToleranceFor('sphereVolume', 'brepkit');
    if (tol) {
      expect(tol.kind).toBe('tolerance');
      expect(typeof tol.relativeTol).toBe('number');
      expect(tol.metric).toBeTruthy();
    }
  });

  it('getToleranceFor returns undefined for non-tolerance divergence', () => {
    const tol = getToleranceFor('variableFillet', 'brepkit');
    expect(tol).toBeUndefined();
  });

  it('every divergence has a non-empty reason', () => {
    for (const [_kernelId, entries] of Object.entries(getAllDivergences())) {
      for (const [key, div] of Object.entries(entries)) {
        expect(div.reason, `${key} missing reason`).toBeTruthy();
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/helpers/kernelDivergences.test.ts --project occt`
Expected: FAIL — module not found

- [ ] **Step 3: Implement kernelDivergences.ts**

Create the file with types, the full divergence map (catalogued from the grep of all skip sites), and the helper functions. The divergence entries should be sourced from these skip sites found in the codebase:

**`if (isBrepkit) ctx.skip()` sites (inline skips):**

| File                       | Line(s)           | Divergence key                     | Kind            |
| -------------------------- | ----------------- | ---------------------------------- | --------------- |
| `booleanFns.test.ts`       | 131               | `booleanFuse.disjointIntersection` | skip            |
| `booleanFns.test.ts`       | 392               | `booleanFns.solidClassify`         | skip            |
| `booleanFns.test.ts`       | 427-486 (9 tests) | `booleanFns.solidClassifyType.*`   | not-implemented |
| `booleanFns.test.ts`       | 505               | `booleanFns.generalFuseGlue`       | skip            |
| `modifierFns.test.ts`      | 73                | `modifierFns.variableFilletRadius` | not-implemented |
| `modifierFns.test.ts`      | 199               | `modifierFns.chamferEdge`          | not-implemented |
| `modifierFns.test.ts`      | 240               | `modifierFns.chamferEdgeDistance`  | not-implemented |
| `modifierFns.test.ts`      | 353-376 (4 tests) | `modifierFns.solidType.*`          | not-implemented |
| `compoundOpsFns.test.ts`   | 97                | `compoundOpsFns.isType`            | skip            |
| `cannedSketches.test.ts`   | 113               | `cannedSketches.faceOffset`        | tolerance       |
| `kernel-ops.test.ts`       | 434               | `kernelOps.operation`              | skip            |
| `nurbsFns.test.ts`         | 42, 86, 97, 123   | `nurbsFns.*` (4 occt-only)         | not-implemented |
| `nurbsFns.test.ts`         | 69, 112           | `nurbsFns.*` (2 brepkit-only)      | skip (inverted) |
| `sketcher3d.test.ts`       | 338-432 (9 tests) | `sketcher3d.*`                     | not-implemented |
| `docs-examples.test.ts`    | 187               | `docsExamples.chamfer`             | not-implemented |
| `operations.test.ts`       | 76                | `operations.chamfer`               | not-implemented |
| `gridfinity-smoke.test.ts` | 84, 101           | `gridfinity.*`                     | not-implemented |
| `kernelCall.test.ts`       | 230               | `kernelCall.operation`             | skip            |

**`describe.skipIf(currentKernel !== 'occt')` sites (whole-suite skips):**

| File                                   | Divergence key                   | Kind            |
| -------------------------------------- | -------------------------------- | --------------- |
| `variableFillet.test.ts`               | `variableFillet`                 | not-implemented |
| `multiSweepFns.test.ts`                | `multiSweepFns`                  | not-implemented |
| `guidedSweepFns.test.ts`               | `guidedSweepFns`                 | not-implemented |
| `interferenceFns.test.ts`              | `interferenceFns`                | not-implemented |
| `hullFns.test.ts`                      | `hullFns`                        | not-implemented |
| `geometry.test.ts`                     | `geometry.findCurveType`         | not-implemented |
| `batchOps.test.ts`                     | `batchOps.cacheReset`            | not-implemented |
| `disposal.test.ts`                     | `disposal`                       | not-implemented |
| `property/booleanFns.property.test.ts` | `booleanFns.propertyTests`       | not-implemented |
| `offsetWire2D.test.ts`                 | `offsetWire2D.chamferJoin`       | not-implemented |
| `occtBoundary.test.ts`                 | `occtBoundary`                   | not-implemented |
| `minkowskiFns.test.ts`                 | `minkowskiFns`                   | not-implemented |
| `measureFns.test.ts`                   | `measureFns.nullShapeValidation` | not-implemented |

**`const descBk = isBrepkit ? describe : describe.skip` sites (brepkit-only suites):**

| File                              | Divergence key                           | Kind                      |
| --------------------------------- | ---------------------------------------- | ------------------------- |
| `brepkitSketchArc.test.ts`        | `brepkitSketchArc` (brepkit-only)        | not-implemented (on occt) |
| `brepkitOffsetV2.test.ts`         | `brepkitOffsetV2` (brepkit-only)         | not-implemented (on occt) |
| `brepkitBooleanEdgeCases.test.ts` | `brepkitBooleanEdgeCases` (brepkit-only) | not-implemented (on occt) |
| `brepkitExtended.test.ts`         | `brepkitExtended` (brepkit-only)         | not-implemented (on occt) |
| `gltfRoundTrip.test.ts`           | `gltfRoundTrip` (brepkit-only)           | not-implemented (on occt) |

Implement the full divergence map and helper functions. The `skipIfDiverges(ctx, key, kernelId?)` function should:

1. Default `kernelId` to `process.env['TEST_KERNEL'] ?? 'occt'`
2. Look up the key in the divergence map for that kernel
3. If found with kind `not-implemented` or `skip`, call `ctx.skip()`
4. If found with kind `tolerance` or `topology-differs`, do nothing (these are informational for tolerance lookups)

Also export `currentKernelId` (replacing `kernelEnv.ts`'s `currentKernel`) and `isBrepkit` for backward compat during migration.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/helpers/kernelDivergences.test.ts --project occt`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/helpers/kernelDivergences.ts tests/helpers/kernelDivergences.test.ts
git commit -m "feat(test-infra): add divergence registry cataloguing all kernel-specific skips"
```

---

### Task 3: Create Unified Kernel Init

**Files:**

- Create: `tests/helpers/kernelInit.ts`
- Modify: `tests/setup-kernel.ts`
- Modify: `tests/setup.ts`

Extract the kernel init logic from `tests/setup-kernel.ts` into a shared `kernelInit.ts` that can be used by tests, benchmarks, and the agreement suite. Then make `setup-kernel.ts` a thin wrapper.

- [ ] **Step 1: Write kernelInit.ts**

The init module must support:

- `initKernel(id?)` — init a single kernel (defaults to `TEST_KERNEL` env)
- `initAllKernels()` — init all available kernels (for agreement/benchmarks)
- `getAvailableKernels()` — list which kernels loaded successfully
- `initOCCT()` — direct OCCT init (for tests needing raw `oc`)

Move the existing init logic from `tests/setup-kernel.ts` lines 26-63 into this file. The OCCT, brepkit, and occt-wasm init branches stay the same — they just move into `kernelInit.ts`.

For `initAllKernels()`, merge the logic from `tests/helpers/kernelTestHarness.ts` lines 33-73, using try/catch to gracefully skip unavailable kernels.

```ts
// tests/helpers/kernelInit.ts
import { initFromOC, registerKernel, getKernel } from '@/kernel/index.js';
import { BrepkitAdapter } from '@/kernel/brepkit/brepkitAdapter.js';
import { OcctWasmAdapter } from '@/kernel/occtWasm/occtWasmAdapter.js';
import type { KernelAdapter } from '@/kernel/types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Emscripten instance
let _oc: any = null;
let _bkInitialized = false;
let _occtWasmInitialized = false;

const _available: string[] = [];

// NOTE: Adding a new kernel requires a branch here in addition to a kernelRegistry entry.
export async function initKernel(id?: string): Promise<void> {
  const kernel = id ?? process.env['TEST_KERNEL'] ?? 'occt';

  if (kernel === 'brepkit') {
    if (_bkInitialized) return;
    _bkInitialized = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic WASM import
    const bk: any = await import('brepkit-wasm');
    if (typeof bk.default === 'function') await bk.default();
    const BrepKernel = bk.BrepKernel ?? bk.default?.BrepKernel;
    if (!BrepKernel) throw new Error('brepkit-wasm: could not resolve BrepKernel constructor');
    registerKernel('brepkit', new BrepkitAdapter(new BrepKernel()));
    if (!_available.includes('brepkit')) _available.push('brepkit');
  } else if (kernel === 'occt-wasm') {
    if (_occtWasmInitialized) return;
    _occtWasmInitialized = true;
    const pathMod = await import('node:path');
    const wasmDir = pathMod.resolve(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (import.meta as any).dirname ?? process.cwd(),
      '../../occt-wasm/dist'
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import(pathMod.join(wasmDir, 'occt-wasm.js'));
    const createOcctWasm = mod.default;
    const Module = await createOcctWasm({
      locateFile: (p: string) =>
        p.endsWith('.wasm') ? pathMod.join(wasmDir, 'occt-wasm.wasm') : p,
    });
    const k = new Module.OcctKernel();
    registerKernel('occt-wasm', new OcctWasmAdapter(Module, k));
    if (!_available.includes('occt-wasm')) _available.push('occt-wasm');
  } else if (kernel === 'occt') {
    await initOCCT();
  } else {
    throw new Error(`Unknown kernel: "${kernel}". Expected "occt", "brepkit", or "occt-wasm".`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Emscripten instance
export async function initOCCT(): Promise<any> {
  if (_oc) return _oc;
  const { default: initOpenCascade } = await import('brepjs-opencascade/src/brepjs_single.js');
  _oc = await initOpenCascade({
    locateFile: (fileName: string) => {
      if (fileName.endsWith('.wasm')) {
        return new URL('../../packages/brepjs-opencascade/src/brepjs_single.wasm', import.meta.url)
          .pathname;
      }
      return fileName;
    },
  });
  initFromOC(_oc);
  if (!_available.includes('occt')) _available.push('occt');
  return _oc;
}

export async function initAllKernels(): Promise<string[]> {
  const results: string[] = [];
  for (const id of ['occt', 'brepkit']) {
    try {
      await initKernel(id);
      results.push(id);
    } catch {
      console.warn(`[kernel-init] ${id} not available — skipping`);
    }
  }
  return results;
}

export function getAvailableKernels(): string[] {
  return [..._available];
}
```

- [ ] **Step 2: Update tests/setup-kernel.ts to delegate**

Replace the contents of `tests/setup-kernel.ts` with a thin wrapper:

```ts
// tests/setup-kernel.ts — delegates to kernelInit.ts
export { initKernel, initOCCT } from './helpers/kernelInit.js';

export const currentKernel: string = process.env['TEST_KERNEL'] ?? 'occt';
```

- [ ] **Step 3: Update tests/setup.ts**

```ts
// tests/setup.ts — backward-compatible re-exports
export { currentKernel, initKernel, initOCCT, initOCCT as initOC } from './setup-kernel.js';
```

(This should remain unchanged — verify it still re-exports correctly.)

- [ ] **Step 4: Run full OCCT test suite to verify no regressions**

Run: `npx vitest run --project occt`
Expected: All existing tests pass

- [ ] **Step 5: Run brepkit test suite**

Run: `npx vitest run --project brepkit`
Expected: All existing tests pass

- [ ] **Step 6: Commit**

```bash
git add tests/helpers/kernelInit.ts tests/setup-kernel.ts tests/setup.ts
git commit -m "refactor(test-infra): unify kernel init into tests/helpers/kernelInit.ts"
```

---

### Task 4: Config-Driven Vitest Projects

**Files:**

- Modify: `vitest.config.ts`

Replace the hardcoded vitest project blocks with dynamic generation from `kernelRegistry.ts`.

- [ ] **Step 1: Rewrite vitest.config.ts**

The key changes:

- Import `kernelConfigs` from `./tests/helpers/kernelRegistry.js`
- Generate `projects` array by mapping over `kernelConfigs`
- Preserve the `alwaysExclude` list
- Merge kernel-specific `excludeTests` into per-project excludes
- Configure per-kernel coverage directories
- Only set `thresholds` when `coverageThresholds` is not `'informational'`

```ts
import { resolve } from 'path';
import { defineConfig } from 'vitest/config';
import { kernelConfigs } from './tests/helpers/kernelRegistry.js';

const alwaysExclude = [
  'tests/brepkitAdapter.test.ts',
  'tests/brepkit-adapter.test.ts',
  'tests/brepkit-validation.test.ts',
  'tests/kernel-agreement.test.ts',
  'tests/io-stress.test.ts',
  'benchmarks/**',
  'node_modules/**',
  'site/**',
  '.worktrees/**',
];

const coverageBase = {
  provider: 'v8' as const,
  include: ['src/**/*.ts'],
  exclude: ['src/**/*.d.ts', 'src/**/index.ts', 'src/kernel/brepkit/**', 'src/kernel/occtWasm/**'],
  reporter: ['text', 'text-summary', 'lcov'] as const,
};

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      'brepkit-wasm': resolve(__dirname, 'node_modules/brepkit-wasm/brepkit_wasm_node.cjs'),
    },
  },
  test: {
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 30000,
    pool: 'forks',
    execArgv: ['--max-old-space-size=6144'],
    maxWorkers: 4,
    coverage: {
      ...coverageBase,
      reportsDirectory: './coverage',
      thresholds: { statements: 84, branches: 74, functions: 90, lines: 84 },
    },
    projects: kernelConfigs.map((k) => ({
      extends: true,
      test: {
        name: k.id,
        env: { TEST_KERNEL: k.id, ...(k.envOverrides ?? {}) },
        exclude: [...alwaysExclude, ...(k.excludeTests ?? [])],
        coverage: {
          reportsDirectory: `./coverage/${k.id}`,
          ...(k.coverageThresholds !== 'informational' && k.coverageThresholds
            ? { thresholds: k.coverageThresholds }
            : {}),
        },
      },
    })),
  },
});
```

- [ ] **Step 2: Run OCCT tests to verify**

Run: `npx vitest run --project occt`
Expected: All existing tests pass

- [ ] **Step 3: Run brepkit tests to verify**

Run: `npx vitest run --project brepkit`
Expected: All existing tests pass

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts
git commit -m "refactor(test-infra): generate vitest projects from kernel registry"
```

---

### Task 5: Migrate Inline Skips — Batch 1 (booleanFns.test.ts)

**Files:**

- Modify: `tests/booleanFns.test.ts`

This is the file with the most skip sites (12). Replace all `if (isBrepkit) ctx.skip()` calls with `skipIfDiverges(ctx, key)`.

- [ ] **Step 1: Update imports**

Replace:

```ts
import { isBrepkit } from './helpers/kernelEnv.js';
```

With:

```ts
import { skipIfDiverges } from './helpers/kernelDivergences.js';
```

- [ ] **Step 2: Replace each skip site**

For each `if (isBrepkit) ctx.skip()` in the file, replace with the corresponding divergence key. Examples:

Line 131: `if (isBrepkit) ctx.skip()` → `skipIfDiverges(ctx, 'booleanFuse.disjointIntersection')`
Line 392: `if (isBrepkit) ctx.skip()` → `skipIfDiverges(ctx, 'booleanFns.solidClassify')`
Lines 427-486 (9 solidClassifyType tests): `if (isBrepkit) ctx.skip()` → `skipIfDiverges(ctx, 'booleanFns.solidClassifyType')`
Line 505: `if (isBrepkit) ctx.skip()` → `skipIfDiverges(ctx, 'booleanFns.generalFuseGlue')`

- [ ] **Step 3: Run tests for this file**

Run: `npx vitest run tests/booleanFns.test.ts --project occt && npx vitest run tests/booleanFns.test.ts --project brepkit`
Expected: Same pass/skip counts as before

- [ ] **Step 4: Commit**

```bash
git add tests/booleanFns.test.ts
git commit -m "refactor(tests): migrate booleanFns skip logic to divergence registry"
```

---

### Task 6: Migrate Inline Skips — Batch 2 (modifierFns, sketcher3d)

**Files:**

- Modify: `tests/modifierFns.test.ts` (7 skip sites)
- Modify: `tests/sketcher3d.test.ts` (9 skip sites)

- [ ] **Step 1: Update imports in both files**

Replace `import { isBrepkit } from './helpers/kernelEnv.js'` with `import { skipIfDiverges } from './helpers/kernelDivergences.js'`.

- [ ] **Step 2: Replace skip sites in modifierFns.test.ts**

Line 73: → `skipIfDiverges(ctx, 'modifierFns.variableFilletRadius')`
Line 199: → `skipIfDiverges(ctx, 'modifierFns.chamferEdge')`
Line 240: → `skipIfDiverges(ctx, 'modifierFns.chamferEdgeDistance')`
Lines 353-376 (4 tests): → `skipIfDiverges(ctx, 'modifierFns.solidType')`

- [ ] **Step 3: Replace skip sites in sketcher3d.test.ts**

Lines 338-432 (9 tests): Each gets an appropriate `skipIfDiverges(ctx, 'sketcher3d.<specificCase>')` key.

- [ ] **Step 4: Run tests for both files**

Run: `npx vitest run tests/modifierFns.test.ts tests/sketcher3d.test.ts --project occt && npx vitest run tests/modifierFns.test.ts tests/sketcher3d.test.ts --project brepkit`
Expected: Same pass/skip counts as before

- [ ] **Step 5: Commit**

```bash
git add tests/modifierFns.test.ts tests/sketcher3d.test.ts
git commit -m "refactor(tests): migrate modifierFns + sketcher3d skips to divergence registry"
```

---

### Task 7: Migrate Inline Skips — Batch 3 (remaining files)

**Files:**

- Modify: `tests/compoundOpsFns.test.ts` (1 skip)
- Modify: `tests/cannedSketches.test.ts` (1 skip)
- Modify: `tests/kernel-ops.test.ts` (1 skip)
- Modify: `tests/nurbsFns.test.ts` (6 skips — mix of occt-only and brepkit-only)
- Modify: `tests/docs-examples.test.ts` (1 skip)
- Modify: `tests/operations.test.ts` (1 skip)
- Modify: `tests/gridfinity-smoke.test.ts` (2 skips)
- Modify: `tests/kernelCall.test.ts` (1 skip)
- Modify: `tests/faceFinder.test.ts` (imports `isBrepkit` from kernelEnv)
- Modify: `tests/draftFns.test.ts` (imports `isBrepkit` from kernelEnv)
- Modify: `tests/validityTypes.test.ts` (imports `currentKernel` from kernelEnv)

- [ ] **Step 1: Update imports in all files**

Replace `import { isBrepkit } from './helpers/kernelEnv.js'` with `import { skipIfDiverges } from './helpers/kernelDivergences.js'` in each.

- [ ] **Step 2: Replace each skip site with its divergence key**

Follow the same pattern as Tasks 5-6. For `nurbsFns.test.ts` which has inverted skips (`if (!isBrepkit) ctx.skip()`), use divergence entries on the `occt` kernel map with `skipIfDiverges(ctx, 'nurbsFns.brepkitSpecific')`.

For `faceFinder.test.ts` and `draftFns.test.ts`, migrate their `isBrepkit` imports and skip calls. For `validityTypes.test.ts`, replace its `currentKernel` import from `kernelEnv.js` with `currentKernelId` from `kernelDivergences.js`.

- [ ] **Step 3: Run tests for all modified files**

Run: `npx vitest run tests/compoundOpsFns.test.ts tests/cannedSketches.test.ts tests/kernel-ops.test.ts tests/nurbsFns.test.ts tests/docs-examples.test.ts tests/operations.test.ts tests/gridfinity-smoke.test.ts tests/kernelCall.test.ts tests/faceFinder.test.ts tests/draftFns.test.ts tests/validityTypes.test.ts --project occt`
Expected: Same pass/skip counts as before

Run same with `--project brepkit`.

- [ ] **Step 4: Commit**

```bash
git add tests/compoundOpsFns.test.ts tests/cannedSketches.test.ts tests/kernel-ops.test.ts tests/nurbsFns.test.ts tests/docs-examples.test.ts tests/operations.test.ts tests/gridfinity-smoke.test.ts tests/kernelCall.test.ts tests/faceFinder.test.ts tests/draftFns.test.ts tests/validityTypes.test.ts
git commit -m "refactor(tests): migrate remaining inline skips to divergence registry"
```

---

### Task 8: Migrate describe.skipIf Patterns

**Files:**

- Modify: `tests/variableFillet.test.ts`
- Modify: `tests/multiSweepFns.test.ts`
- Modify: `tests/guidedSweepFns.test.ts`
- Modify: `tests/interferenceFns.test.ts`
- Modify: `tests/hullFns.test.ts`
- Modify: `tests/geometry.test.ts`
- Modify: `tests/batchOps.test.ts`
- Modify: `tests/disposal.test.ts`
- Modify: `tests/property/booleanFns.property.test.ts`
- Modify: `tests/offsetWire2D.test.ts`
- Modify: `tests/occtBoundary.test.ts`
- Modify: `tests/minkowskiFns.test.ts`
- Modify: `tests/measureFns.test.ts`

These files use `describe.skipIf(currentKernel !== 'occt')`. Replace the import of `currentKernel` from `kernelEnv.js` (or `setup.js`) with a `shouldSkipSuite()` helper from the divergence registry:

Add to `kernelDivergences.ts`:

```ts
export function shouldSkipSuite(key: string, kernelId?: string): boolean {
  const id = kernelId ?? currentKernelId;
  const div = divergences[id]?.[key];
  return div?.kind === 'not-implemented' || div?.kind === 'skip';
}
```

Then in each test file:

```ts
// Before:
describe.skipIf(currentKernel !== 'occt')('OCCT-specific: ...', () => { ... });
// After:
describe.skipIf(shouldSkipSuite('variableFillet'))('OCCT-specific: ...', () => { ... });
```

- [ ] **Step 1: Add shouldSkipSuite to kernelDivergences.ts**
- [ ] **Step 2: Update imports in all 13 files**
- [ ] **Step 3: Replace describe.skipIf patterns**
- [ ] **Step 4: Run full test suite**

Run: `npx vitest run --project occt && npx vitest run --project brepkit`
Expected: Same pass/skip/pass counts as before migration

- [ ] **Step 5: Commit**

```bash
git add tests/helpers/kernelDivergences.ts tests/variableFillet.test.ts tests/multiSweepFns.test.ts tests/guidedSweepFns.test.ts tests/interferenceFns.test.ts tests/hullFns.test.ts tests/geometry.test.ts tests/batchOps.test.ts tests/disposal.test.ts tests/property/booleanFns.property.test.ts tests/offsetWire2D.test.ts tests/occtBoundary.test.ts tests/minkowskiFns.test.ts tests/measureFns.test.ts
git commit -m "refactor(tests): migrate describe.skipIf patterns to divergence registry"
```

---

### Task 9: Migrate brepkit-only Test Patterns

**Files:**

- Modify: `tests/brepkitSketchArc.test.ts`
- Modify: `tests/brepkitOffsetV2.test.ts`
- Modify: `tests/brepkitBooleanEdgeCases.test.ts`
- Modify: `tests/brepkitExtended.test.ts`
- Modify: `tests/gltfRoundTrip.test.ts`

These use `const descBk = isBrepkit ? describe : describe.skip` or `describe.skipIf(currentKernel !== 'brepkit')`. Replace with `shouldSkipSuite()` using divergence keys on the `occt` kernel (since these are things only brepkit supports).

- [ ] **Step 1: Add occt divergence entries for brepkit-only features**

In `kernelDivergences.ts`, add entries under the `occt` key:

```ts
occt: {
  'brepkitSketchArc': { kind: 'not-implemented', reason: 'brepkit-only sketch arc feature' },
  'brepkitOffsetV2': { kind: 'not-implemented', reason: 'brepkit-only offset V2 algorithm' },
  // etc.
},
```

- [ ] **Step 2: Update imports and patterns in all 5 files**
- [ ] **Step 3: Run tests**

Run: `npx vitest run --project occt && npx vitest run --project brepkit`
Expected: Same behavior

- [ ] **Step 4: Commit**

```bash
git add tests/helpers/kernelDivergences.ts tests/brepkitSketchArc.test.ts tests/brepkitOffsetV2.test.ts tests/brepkitBooleanEdgeCases.test.ts tests/brepkitExtended.test.ts tests/gltfRoundTrip.test.ts
git commit -m "refactor(tests): migrate brepkit-only test patterns to divergence registry"
```

---

### Task 10: Delete Legacy Helper Files

**Files:**

- Delete: `tests/helpers/kernelEnv.ts`
- Modify: `tests/helpers/kernelTestHarness.ts` → keep `expectClose` and `expectKernelsAgree`, move them to `kernelDivergences.ts`, then delete

- [ ] **Step 1: Verify no remaining imports of kernelEnv.ts**

Run: `grep -r "kernelEnv" tests/` — should return nothing (all migrated in Tasks 5-9).

- [ ] **Step 2: Move expectClose and expectKernelsAgree to kernelDivergences.ts**

Add these two functions (unchanged) to `kernelDivergences.ts`. They are used by `kernel-agreement.test.ts`.

- [ ] **Step 3: Update kernel-agreement.test.ts imports**

Replace imports from `kernelTestHarness.js` with imports from `kernelDivergences.js` (for `expectClose`, `expectKernelsAgree`) and `kernelInit.js` (for `initAllKernels`, `getAvailableKernels`).

- [ ] **Step 4: Delete kernelEnv.ts and kernelTestHarness.ts**

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run --project occt && npx vitest run --project brepkit`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git rm tests/helpers/kernelEnv.ts tests/helpers/kernelTestHarness.ts
git add tests/helpers/kernelDivergences.ts tests/kernel-agreement.test.ts
git commit -m "refactor(test-infra): remove kernelEnv.ts and kernelTestHarness.ts, consolidate into registry"
```

---

### Task 11: Update Benchmark Infrastructure

**Files:**

- Modify: `benchmarks/setup.ts`
- Modify: `benchmarks/harness.ts`

- [ ] **Step 1: Update benchmarks/setup.ts to use kernelInit.ts**

Replace the duplicated init logic with:

```ts
import { initKernel, initAllKernels, getAvailableKernels } from '../tests/helpers/kernelInit.js';
import { createMultiKernelBench } from './harness.js';

export async function initBenchKernels(): Promise<void> {
  const mode = process.env.BENCH_KERNELS ?? 'occt';
  if (mode === 'both' || mode === 'all') {
    await initAllKernels();
  } else {
    await initKernel(mode);
  }
}

export function hasBrepkit(): boolean {
  return getAvailableKernels().includes('brepkit');
}

export const { benchAll, benchKernel } = createMultiKernelBench(() => getAvailableKernels());
```

Keep `getBrepkitVersion()` as-is.

- [ ] **Step 2: Update benchmarks/harness.ts**

Rename `createDualKernelBench` → `createMultiKernelBench`. Update it to accept `() => string[]` (list of available kernels) instead of `() => boolean`. The `benchAll` function iterates over all available kernels instead of just occt + optional brepkit.

Keep `createDualKernelBench` as a deprecated alias for backward compat during transition.

- [ ] **Step 3: Update benchmark test files to use new imports**

Check `benchmarks/kernel-comparison.bench.test.ts` and other bench files for imports from `benchmarks/setup.ts` — update as needed.

- [ ] **Step 4: Run benchmarks to verify**

Run: `npm run bench` (OCCT-only, should work)
Expected: Benchmarks run without errors

- [ ] **Step 5: Commit**

```bash
git add benchmarks/setup.ts benchmarks/harness.ts benchmarks/kernel-comparison.bench.test.ts
git commit -m "refactor(benchmarks): use unified kernel init and multi-kernel bench helpers"
```

---

### Task 12: Add Conformance Matrix Generator

**Files:**

- Create: `scripts/generateConformance.ts`
- Modify: `package.json` (add script)

- [ ] **Step 1: Write the generator script**

The script reads `kernelConfigs` from the registry and `divergences` from the divergence registry, then outputs a markdown table to `docs/kernel-conformance.md`.

```ts
// scripts/generateConformance.ts
import { kernelConfigs } from '../tests/helpers/kernelRegistry.js';
import { divergences } from '../tests/helpers/kernelDivergences.js';
import fs from 'node:fs';
import path from 'node:path';
```

The script should:

1. Generate a "Capabilities" table from `kernelConfigs[*].capabilities`
2. Generate an "Operation Parity" table from `divergences`
3. Use emoji indicators: ✅ (passing), ❌ (not-implemented), ⏭️ (skip), ⚠️ (tolerance with percentage), 🔀 (topology-differs)
4. Write to `docs/kernel-conformance.md` with a "Generated:" timestamp

- [ ] **Step 2: Add npm script**

In `package.json`, add:

```json
"conformance:generate": "npx tsx scripts/generateConformance.ts"
```

- [ ] **Step 3: Run the generator**

Run: `npm run conformance:generate`
Expected: `docs/kernel-conformance.md` created with valid markdown tables

- [ ] **Step 4: Commit**

```bash
git add scripts/generateConformance.ts package.json docs/kernel-conformance.md
git commit -m "feat(test-infra): add conformance matrix generator"
```

---

### Task 13: Final Validation

- [ ] **Step 1: Run full OCCT test suite with coverage**

Run: `npm run test:full`
Expected: All tests pass, coverage thresholds met

- [ ] **Step 2: Run brepkit test suite**

Run: `npm run test:brepkit`
Expected: All tests pass (same skip count as before migration)

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: No type errors

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: No lint errors

- [ ] **Step 5: Run boundary checker**

Run: `npm run check:boundaries`
Expected: Pass (no layer boundary violations — all new files are in tests/)

- [ ] **Step 6: Verify no remaining references to kernelEnv.ts**

Run: `grep -r "kernelEnv" tests/ src/`
Expected: No results

- [ ] **Step 7: Verify conformance matrix is up-to-date**

Run: `npm run conformance:generate && git diff docs/kernel-conformance.md`
Expected: No diff (already generated in Task 12)

- [ ] **Step 8: Commit any final fixes, then run validate**

Run: `npm run validate`
Expected: Full validation passes
