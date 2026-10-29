---
title: Kernel Conformance Suite
description: 'The kernel conformance test suite. Run the same tests against every backend; any divergence is a kernel bug or a missing semantic.'
---

# Kernel Conformance Suite

The conformance suite is the test suite brepjs runs against every supported kernel. Same tests, every backend (occt-wasm, OpenCascade, brepkit, Manifold): anywhere a test passes on one kernel and fails on another, you've found either a kernel bug or a divergence in semantics. If you're [writing a custom kernel](./custom-kernel), the conformance suite is how you verify your adapter.

## Running the suite

```bash
npm run test:ci                      # occt-wasm (the default kernel)
npm run test:occt                    # OpenCascade
npm run test:brepkit                 # brepkit
npx vitest run --project mykernel    # your custom adapter
```

Each kernel is a Vitest project defined in `tests/helpers/kernelRegistry.ts`. The project sets the `TEST_KERNEL` environment variable, and `initKernel()` (`tests/helpers/kernelInit.ts`) reads it and invokes the right `init` path. A custom kernel needs an entry in both files.

brepjs's CI gate runs the suite against the default kernel (occt-wasm), sharded four ways; the other kernels run on demand with the commands above. `npm run conformance:generate` turns the registry's capability flags and recorded divergences into the matrix at `docs/kernel-conformance.md`.

## What the suite tests

The suite is organized by domain:

- **Primitives**: `box`, `cylinder`, `sphere`, …; each shape's volume, area, vertex count, edge count are asserted exactly.
- **Booleans**: `fuse`, `cut`, `intersect` over canonical pairs (box-on-box, cylinder-through-box, sphere-cut, etc.); result volumes within tolerance, expected face counts.
- **Transforms**: translate, rotate, scale invariance properties (volume preserved by translate/rotate, scaled by `s³` for uniform scale).
- **Refinement**: fillet / chamfer over canonical edge sets; result topology invariants (face count delta).
- **Sketching → 3D**: `sketchCircle().extrude()`, `Sketcher` chains, lofts, sweeps.
- **Finders**: every filter, every shape kind.
- **Measurement**: exact-value tests for primitives, tolerance-bounded tests for derived shapes.
- **IO**: round-trip STEP / BREP / IGES; STL conversion.
- **Healing**: known-broken inputs and the expected fixed outputs.
- **Validity types**: smart-constructor and type-guard runtime checks.

Each domain has both **happy-path tests** (the operation succeeds with expected output) and **failure-mode tests** (the operation should fail with a specific error code).

## Test naming conventions

Conformance tests live in `tests/` alongside the regular brepjs unit tests. They share infrastructure:

- `tests/<moduleName>.test.ts`: tests for one module's functions
- `tests/api*.test.ts`: public-API integration tests
- `tests/kernel-*.test.ts`: kernel-specific behaviours that should diverge gracefully

The `kernel-*` family contains tests for things like "OpenCascade returns enum objects with `.value` but brepkit returns numbers": divergences that are _expected_ and that the adapter normalizes.

## Writing a conformance-style test

A typical conformance test looks like:

<!-- @no-test -->

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { box, measureVolume, measureArea, unwrap } from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('box primitive', () => {
  it('produces correct volume', () => {
    expect(unwrap(measureVolume(box(10, 10, 10)))).toBeCloseTo(1000, 4);
  });

  it('produces correct surface area', () => {
    expect(unwrap(measureArea(box(10, 10, 10)))).toBeCloseTo(600, 4);
  });

  it('produces 6 faces, 12 edges, 8 vertices', () => {
    // ...
  });
});
```

Key conventions:

- `toBeCloseTo(expected, precision)` for floating-point; never `toBe` for geometry
- `unwrap(result)` is fine in tests; failures throw, the test name pinpoints the issue
- 30-second timeout on the kernel init; the per-test timeout is 90 seconds (`vitest.config.ts`)
- Each test is independent; no shared state across tests

For the full conventions see the brepjs `CONTRIBUTING.md`.

## What "passing" means for a custom kernel

A custom kernel should produce:

- **Identical** integer counts (face counts, edge counts, vertex counts).
- **Tolerance-equal** measurements (volumes, areas, distances within `toBeCloseTo(expected, 4)` for normalized inputs).
- **Identical** error codes for failure modes: `FILLET_NO_EDGES`, `INVALID_FILLET_RADIUS`, etc.
- **Round-trip identity** for serialization: a STEP file written by your kernel and re-read produces the same shape (with kernel-tolerance epsilon).

A kernel that produces a slightly different volume (1000.0001 vs 1000.0000) and otherwise matches is conformant. A kernel that produces 1000 sometimes and 1001 sometimes is not.

## Documenting divergences

If your kernel deliberately diverges from the OCCT reference (e.g. rejects an operation OpenCascade allows, returns a different validity classification), record it in the divergence registry (`tests/helpers/kernelDivergences.ts`) and call `skipIfDiverges(ctx, key)` from the test, or branch on the kernel inside the test:

<!-- @no-test -->

```typescript
import { describe, it, expect } from 'vitest';
import { currentKernel } from './setup.js';

describe('boolean on near-coincident geometry', () => {
  it('OCCT produces slivers; brepkit produces clean result', () => {
    // ...
    if (currentKernel === 'brepkit') {
      expect(faceCount).toBe(6); // clean
    } else {
      expect(faceCount).toBe(8); // OCCT adds 2 sliver faces
    }
  });
});
```

The override is honest: the test still runs on both kernels and records the divergence.

## Performance: don't run conformance on every commit

The full conformance suite takes minutes. brepjs's CI runs it (against occt-wasm) on `main` and on PRs that touch `src/`, `tests/`, `packages/`, `scripts/`, or build config. The pre-commit hook runs only the changed-file tests; the pre-push hook runs only `knip`.

For a custom kernel, the trade-off depends on your workflow. The author of `MyGeomAdapter` running the suite locally on every kernel change is the typical baseline.

## Adding new conformance tests

When brepjs adds a new operation, it adds conformance tests in the same PR. The tests double as:

- Verification the operation produces correct output on every kernel
- Living documentation of what the operation should do
- Reference for custom-kernel implementers

The pattern: write the simplest happy-path test first, then the failure-mode tests, then edge cases. Aim for the test file to read like an executable specification.

## Next steps

- [Writing a Custom Kernel](./custom-kernel): building the adapter the suite verifies
- [Writing Custom Operations](./custom-ops): operations that need new conformance tests
- [Architecture & Layers](./architecture): where the test infrastructure sits
