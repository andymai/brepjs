# Custom Kernel Guide

brepjs is kernel-agnostic. All geometry operations go through a `KernelAdapter` interface. Two adapters are provided: OpenCascade WASM (shipped via the `brepjs-opencascade` companion package) and brepkit WASM (via the external `brepkit-wasm` npm package). You can also register your own kernel at runtime.

## Quick Start

```typescript
// Easiest: auto-detect and initialize the best available kernel
import { init, box } from 'brepjs';
await init(); // tries brepjs-opencascade, then brepkit-wasm
const myBox = box(10, 10, 10);
```

### Manual initialization

```typescript
import opencascade from 'brepjs-opencascade';
import { initFromOC, registerKernel, withKernel, BrepkitAdapter } from 'brepjs';

// Initialize the default OpenCascade kernel
const oc = await opencascade();
initFromOC(oc);

// Register the brepkit kernel as an alternative (external brepkit-wasm package)
import bkInit, { BrepKernel } from 'brepkit-wasm';
await bkInit();
registerKernel('brepkit', new BrepkitAdapter(new BrepKernel()));

// Run a specific kernel temporarily
const result = withKernel('brepkit', () => {
  return makeBox(10, 10, 10); // uses brepkit kernel
});

// Or register a fully custom kernel
registerKernel('rust', new RustAdapter(wasm));
```

## API

### `registerKernel(id, adapter)`

Register a `KernelAdapter` under a unique string ID. The first kernel registered becomes the default for all `getKernel()` calls.

### `init()`

Auto-detect and initialize the best available kernel. Tries `brepjs-opencascade` first, then falls back to `brepkit-wasm`. Returns a `Promise<string>` with the kernel ID (`'occt'` or `'brepkit'`). Idempotent — calling it again after a kernel is registered returns the current kernel ID immediately.

### `initFromOC(oc)`

Manual initialization — creates the default OpenCascade adapter from a loaded WASM instance and registers it as `'occt'`.

### `BrepkitAdapter`

Adapter for the external `brepkit-wasm` WASM package. Create with `new BrepkitAdapter(brepkitWasm)` and register via `registerKernel('brepkit', adapter)`. Coverage is growing - some advanced operations may throw "not implemented".

### `withKernel(id, fn)`

Run a **synchronous** function with a different kernel as the default, then restore the previous default. Do not pass async functions - the kernel override is restored in `finally`.

### `getKernel(id?)`

Returns the kernel adapter for the given ID, or the default kernel. Used internally by all brepjs operations. You rarely need to call this directly.

## Writing a KernelAdapter

The `KernelAdapter` interface (`src/kernel/types.ts`) defines ~164 methods across these categories:

| Category           | Methods | Examples                                                      |
| ------------------ | ------- | ------------------------------------------------------------- |
| Shape construction | ~30     | `makeBox`, `makeCylinder`, `makeEdge`, `makeWire`, `makeFace` |
| Boolean operations | ~6      | `fuse`, `cut`, `intersect`, `section`                         |
| Transforms         | ~10     | `translate`, `rotate`, `mirror`, `scale`                      |
| History tracking   | ~12     | `fuseWithHistory`, `translateWithHistory`                     |
| Measurement        | ~8      | `volume`, `area`, `length`, `boundingBox`                     |
| Topology queries   | ~12     | `iterShapes`, `shapeType`, `hashCode`, `isNull`, `isSame`     |
| Geometry queries   | ~15     | `surfaceNormal`, `curvePointAtParam`, `curveIsClosed`         |
| File I/O           | ~10     | `exportSTEP`, `importSTL`, `toBREP`, `fromBREP`               |
| Meshing            | 2       | `mesh`, `meshEdges`                                           |
| Lifecycle          | 1       | `dispose`                                                     |

There is also an optional `Kernel2DCapability` interface (~40 methods) for 2D sketching operations.

### Minimal Skeleton

```typescript
import type { KernelAdapter, KernelShape, ShapeType } from 'brepjs';

class MyKernel implements KernelAdapter {
  readonly oc = null; // raw WASM instance (used internally by some adapters, can be null)
  readonly kernelId = 'my-kernel';

  // --- Shape construction ---
  makeBox(width: number, height: number, depth: number): KernelShape {
    return this.rustWasm.make_box(width, height, depth);
  }

  // --- Topology queries ---
  shapeType(shape: KernelShape): ShapeType {
    return this.rustWasm.shape_type(shape); // return 'solid', 'face', etc.
  }

  hashCode(shape: KernelShape, upperBound: number): number {
    return this.rustWasm.hash_code(shape, upperBound);
  }

  isNull(shape: KernelShape): boolean {
    return this.rustWasm.is_null(shape);
  }

  isSame(a: KernelShape, b: KernelShape): boolean {
    return this.rustWasm.is_same(a, b);
  }

  // --- Measurement ---
  volume(shape: KernelShape): number {
    return this.rustWasm.volume(shape);
  }

  // --- Lifecycle ---
  dispose(handle: { delete(): void }): void {
    handle.delete();
  }

  // ... implement remaining methods from KernelAdapter interface
}
```

### Shape Handle Contract

`KernelShape` is typed as `any` - your kernel decides what a "shape" is internally. It could be:

- A pointer into a WASM linear memory arena
- An integer handle/index into a shape table
- A serialized blob
- A JavaScript object wrapping native data

The only contract: **Layer 2+ code never calls methods on shape handles**. It only passes them back to `getKernel()` methods. This is enforced by an ESLint rule (`no-restricted-syntax`) that bans `x.wrapped.method()` calls outside `src/kernel/`.

### What Must Each Method Return?

All kernel methods return **plain JavaScript values** - never raw kernel objects:

- Points → `[number, number, number]` tuples
- Booleans → `boolean`
- Measurements → `number`
- Shape queries → string unions (`'solid' | 'face' | ...`)
- New shapes → opaque `KernelShape` handles

This ensures Layer 2+ code is completely kernel-agnostic.

## Testing a Custom Kernel

Run the existing test suite against your kernel:

```typescript
import { registerKernel } from 'brepjs';

// Replace the default kernel before tests run
registerKernel('test', myKernelAdapter);

// Run: npx vitest run
// All 2023 tests should pass with your kernel
```

## Dual-Kernel Testing

brepjs tests run against both OpenCascade (OCCT) and brepkit WASM backends in CI. This is configured via vitest projects:

```typescript
// vitest.config.ts (simplified)
export default defineConfig({
  test: {
    projects: [
      { name: 'occt', env: { TEST_KERNEL: 'occt' } },
      { name: 'brepkit', env: { TEST_KERNEL: 'brepkit' } },
    ],
  },
});
```

The test setup (`tests/setup.ts`) reads `TEST_KERNEL` and initializes the correct adapter:

```typescript
export async function initKernel() {
  const kernel = process.env.TEST_KERNEL ?? 'occt';
  if (kernel === 'brepkit') {
    const bk = await import('brepkit-wasm');
    if (typeof bk.default === 'function') await bk.default();
    registerKernel('brepkit', new BrepkitAdapter(new bk.BrepKernel()));
  } else {
    const oc = await import('brepjs-opencascade');
    initFromOC(await oc.default());
  }
}
```

### Running tests against a specific kernel

```bash
# Run all tests with both kernels (default)
npm run test

# Run a single kernel
npx vitest run --project occt
npx vitest run --project brepkit

# Run a single test file on both kernels
npx vitest run tests/fn-booleanFns.test.ts
```

Some tests are OCCT-only (e.g., tests for OCCT-specific features). These are listed in `vitest.config.ts` under `occtOnlyTests`.

### Testing your custom kernel

To test a custom kernel, add a vitest project that sets `TEST_KERNEL` to your kernel ID, then update `tests/setup.ts` to handle the new case.

## Architecture Reference

See [Architecture](./architecture.md) for the full layer diagram and how the kernel fits into the boundary system.
