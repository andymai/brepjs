---
title: Writing Custom Operations
description: 'Add a new modelling operation to brepjs: where the file goes, what types to declare, what tests to write, how it routes to the kernel.'
---

# Writing Custom Operations

brepjs ships hundreds of operations, and you might still want one more. This chapter walks through adding a new operation — what files to touch, what tests to write, what types to declare. The examples assume you're contributing to brepjs upstream, but the same structure works for a fork or a local extension.

## Where operations live

| Operation kind             | File pattern                   | Layer |
| -------------------------- | ------------------------------ | ----- |
| New primitive              | `src/topology/<name>Fns.ts`    | 2     |
| Composition (extrude-like) | `src/operations/<name>Fns.ts`  | 2     |
| 2D drawing op              | `src/2d/<name>Fns.ts`          | 2     |
| New finder filter          | `src/query/<finder>.ts`        | 2     |
| New measurement            | `src/measurement/<name>Fns.ts` | 2     |
| New importer/exporter      | `src/io/<format>.ts`           | 2     |
| Sketcher method            | `src/sketching/Sketcher.ts`    | 3     |
| Fluent wrapper helper      | `src/topology/wrapper.ts`      | 3     |

The convention: one operation per `*Fns.ts` file or one closely-related family per file.

## A worked example: `octahedron(r)`

A new primitive. Goal: add `octahedron(radius)` returning a `ValidSolid` whose 6 vertices lie at distance `radius` from the origin.

### Step 1: kernel method (Layer 0)

The kernel doesn't have a direct `octahedron` primitive. We compose it from existing kernel calls — make 8 triangular faces, sew them, close into a solid. So Layer 0 doesn't need new methods.

If we _did_ need a new kernel primitive, we'd extend `src/kernel/types.ts` (`KernelTopology` interface) and implement in both adapters (`src/kernel/occt/...`, `src/kernel/brepkit/...`).

### Step 2: the `*Fns` file (Layer 2)

`src/topology/octahedronFns.ts`:

<!-- @no-test -->

```typescript
import { getKernel } from '@/kernel/index.js';
import { type ValidSolid, validSolid } from '@/core/shapeTypes.js';
import { type Result, ok, err } from '@/core/result.js';

/**
 * Build a regular octahedron centered at the origin.
 * Vertices lie at distance `radius` along ±X, ±Y, ±Z.
 */
export function octahedron(radius: number): ValidSolid {
  if (radius <= 0) {
    throw new Error('octahedron: radius must be positive');
  }
  const k = getKernel();
  // 6 vertices
  const vertices = [
    k.makeVertex([radius, 0, 0]),
    k.makeVertex([-radius, 0, 0]),
    k.makeVertex([0, radius, 0]),
    k.makeVertex([0, -radius, 0]),
    k.makeVertex([0, 0, radius]),
    k.makeVertex([0, 0, -radius]),
  ];
  // 8 triangular faces
  const faces = [
    k.makeTriangleFace(vertices[0], vertices[2], vertices[4]),
    k.makeTriangleFace(vertices[2], vertices[1], vertices[4]),
    // ... etc
  ];
  const shell = k.sewFaces(faces);
  const solid = k.makeSolidFromShell(shell);
  return validSolid(solid).shape; // smart constructor wraps in ValidSolid brand
}

/**
 * Result-returning variant for callers who prefer it.
 */
export function octahedronR(radius: number): Result<ValidSolid> {
  if (radius <= 0) return err({ code: 'INVALID_PARAM', message: 'radius must be positive' });
  return ok(octahedron(radius));
}
```

The throwing variant (`octahedron`) is fine because the only failure mode is a programmer error (negative radius). The Result variant (`octahedronR`) is for callers who want explicit error handling.

### Step 3: export from the module index

`src/topology/index.ts`:

<!-- @no-test -->

```typescript
// ... existing exports ...
export { octahedron, octahedronR } from './octahedronFns.js';
```

This makes `octahedron` available at both `brepjs/topology` and the main `brepjs` entry.

### Step 4: tests

`tests/octahedronFns.test.ts`:

<!-- @no-test -->

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { octahedron, measureVolume, measureArea, faceFinder, vertexFinder } from '@/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('octahedron', () => {
  it('has 6 vertices, 8 faces', () => {
    const o = octahedron(1);
    expect(vertexFinder().findAll(o).length).toBe(6);
    expect(faceFinder().findAll(o).length).toBe(8);
  });

  it('volume is 4r³/3 for regular octahedron', () => {
    expect(measureVolume(octahedron(1))).toBeCloseTo(4 / 3, 4);
    expect(measureVolume(octahedron(2))).toBeCloseTo(32 / 3, 4);
  });

  it('throws on negative radius', () => {
    expect(() => octahedron(-1)).toThrow();
  });
});
```

For a brepjs upstream contribution, the conformance suite picks this up automatically — same test runs against OCCT and brepkit.

### Step 5: fluent wrapper exposure (Layer 3)

If you want `shape(otherShape).addOctahedron(radius, position)` syntax, add a method to `src/topology/wrapper.ts`. For most operations, the functional API is enough — wrappers are for operations that compose with other shapes.

### Step 6: update the function lookup

```bash
npm run docs:generate-lookup
```

This regenerates `docs/function-lookup.md` to include the new symbol. The pre-commit hook reminds you when `*Fns.ts` files change but the lookup wasn't regenerated.

### Step 7: update llms.txt

`llms.txt` and `llms-full.txt` are the AI-friendly summaries. They are regenerated periodically; for a contribution, add the new function to the appropriate section in both files manually (or in a follow-up if the maintainer prefers).

## What the operation must guarantee

For an operation to be a good citizen:

1. **Type signature is precise.** Use validity brands. If your op only works on closed wires, take `ClosedWire`. If it produces a valid solid, return `ValidSolid`.
2. **Failure modes use named codes.** No `throw new Error('something went wrong')` — `err({ code: 'OP_DESCRIPTIVE_CODE', message: '...', suggestion: '...' })`.
3. **Memory is tracked.** Use `getKernel()` to acquire shapes; the kernel adapter tracks them. If you build many intermediate handles, dispose them inside the function.
4. **Result is the unique answer.** No randomness, no environment-dependent behaviour. Same input → same output.
5. **Tests cover counts and measurements.** Vertex / edge / face counts are integer-exact; volumes / areas use `toBeCloseTo`.

## Common pitfalls

### Forgetting `.js` import extensions

ESM strict mode requires `.js` extensions on TypeScript imports. `import { foo } from './foo'` fails at runtime; `import { foo } from './foo.js'` works.

### Calling `.wrapped` directly

Layer 2+ code never calls methods on `.wrapped`. Always go through `getKernel()`. ESLint enforces this. The reason: direct `.wrapped.method()` bypasses the kernel abstraction and breaks dual-kernel testing.

### Async `withKernel`

If your operation needs the active kernel, use `getKernel()` inside the synchronous body. Don't wrap an async function in `withKernel` — see [Kernels & withKernel](../concepts/kernels) for the details.

### Returning unbranded shapes

`Result<Shape3D>` is a fine return type for a generic operation. For specific guarantees (the result is a solid, the result is a closed wire), return the branded type — the type system is doing useful work, don't throw it away.

### Ignoring tolerance

If your operation builds shapes from scratch (like the octahedron above), inherit the kernel's default tolerance. If it operates on existing shapes, use the input shapes' tolerance to set the result tolerance — `Math.max(tolA, tolB)` is the typical rule.

## Adding to the wrapper

Adding a method to the fluent wrapper:

`src/topology/wrapper.ts`:

<!-- @no-test -->

```typescript
class Wrapped3D<T extends Shape3D> {
  // ... existing methods ...

  /**
   * Add an octahedron at the given position to this shape.
   */
  addOctahedron(radius: number, at: [number, number, number]): Wrapped3D<Shape3D> {
    const o = translate(octahedron(radius), at);
    const fused = unwrap(fuse(this.val, o));
    return new Wrapped3D(fused);
  }
}
```

Wrapper methods always:

- Take primitive parameters (numbers, vectors)
- Return a new `Wrapped*` instance
- Auto-unwrap `Result` and throw on error (as `BrepWrapperError`)

## Documentation

Operations that ship in brepjs have:

- A TSDoc block on the function with `@param`, `@returns`, an `@example`
- An entry in the relevant `tasks/` chapter (or a new section)
- A line in `llms.txt`

The TSDoc renders into the TypeDoc API site automatically.

## Next steps

- [Architecture & Layers](./architecture) — where to place your code
- [Pattern Checker Rules](./pattern-checker) — automated checks your contribution passes
- [Kernel Conformance Suite](./conformance) — verifying behaviour across kernels
