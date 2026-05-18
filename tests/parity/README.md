# `tests/parity/` — brepjs behavioral spec

These tests are the **kernel-agnostic specification** that brepjs's geometric
operations must satisfy. They exist because brepjs supports two kernels
(OpenCascade and brepkit) and the in-flight brepkit cleanroom rewrite needs
a fixed target to implement against.

## Rules

1. **Reference values come from closed-form math, not from any kernel.**
   `volume(cube(2,3,4)) === 24` is the spec because that's what
   `w·h·d` evaluates to. It is _not_ the spec because OCCT happens to
   return 24. If OCCT returned a quirky value (e.g. `length(solid)`
   summing edge lengths), that quirk does **not** enter this folder.

2. **Algebraic invariants are stronger than reference values.** A test
   that asserts `vol(a ∪ b) + vol(a ∩ b) === vol(a) + vol(b)` (inclusion–
   exclusion) constrains the kernel without needing a reference shape.
   These are written with `fast-check` and run with `NUM_RUNS = 50`.

3. **Round-trip invariants test the boundary, not the kernel.** Tests
   like "STEP export then import preserves volume to 6 decimals" exercise
   the I/O subsystem alongside the operations.

## How parity failure surfaces

| Suite                            | What runs            | Required-to-merge? |
| -------------------------------- | -------------------- | ------------------ |
| `npm test` / `npm run test:full` | OCCT project only    | yes — CI gate      |
| `npm run test:brepkit`           | brepkit project only | no — informational |

Failures in the brepkit project on these files are **expected** during the
cleanroom rewrite and represent the parity gap. They do not block PRs.

## How to debug a parity failure

1. Identify the failing assertion's _mathematical claim_ (e.g.
   `vol(cylinder r=2 h=5) === π·4·5`).
2. Run the same op on OCCT (`npm test`) — should pass.
3. Run on brepkit (`TEST_KERNEL=brepkit npx vitest run tests/parity/...`).
4. The numerical delta is the parity gap. File or fix in `src/kernel/brepkit/`
   or, if the issue is in the brepkit WASM kernel itself, in the brepkit repo.

## Tolerance policy

- **Unit-scale closed-form values**: `toBeCloseTo(expected, 0)` — within 0.5
  absolute units. OCCT and a correct brepkit both clear this comfortably.
- **fast-check invariants**: relative tolerance, default `1e-6` of the
  expected sum. Property tests run with `numRuns: 50`.
- **Round-trip serialization**: `toBeCloseTo(original, 6)` — six decimals.

## Adding a test

Use the helpers in `tests/parity/helpers.ts`:

```ts
import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from '../setup.js';
import { unitCube, NUM_RUNS } from './helpers.js';
import * as fc from 'fast-check';
import { measureVolume, unwrap } from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('SPEC: cube volume', () => {
  it('vol(cube(w,h,d)) = w·h·d', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.5, max: 10 }),
        /* ... */ (w, h, d) => {
          const v = unwrap(measureVolume(unitCube(w, h, d)));
          expect(v).toBeCloseTo(w * h * d, 0);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });
});
```
