# Custom Kernel Guide

brepjs is kernel-agnostic. All geometry operations go through a `KernelAdapter` interface. Three adapters are provided:

- **OpenCascade WASM** (via `brepjs-opencascade`) — the default, most mature kernel
- **brepkit WASM** (via `brepkit-wasm`) — alternative kernel with growing coverage
- **occt-wasm** (via `occt-wasm`) — arena-based OCCT V8 kernel with handle-based memory model

You can also register your own kernel at runtime.

## Quick Start

```typescript
// Easiest: auto-detect and initialize the best available kernel
import { init, box } from 'brepjs';
await init(); // tries brepjs-opencascade, then brepkit-wasm (occt-wasm requires manual registration)
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

// Register the occt-wasm kernel (external occt-wasm package)
import createOcctWasm from 'occt-wasm';
import { OcctWasmAdapter } from 'brepjs/kernel/occtWasm/occtWasmAdapter';
const Module = await createOcctWasm();
const kernel = new Module.OcctKernel();
registerKernel('occt-wasm', new OcctWasmAdapter(Module, kernel));

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

Auto-detect and initialize the best available kernel. Tries `brepjs-opencascade` first, then falls back to `brepkit-wasm`. Returns a `Promise<string>` with the kernel ID (`'occt'` or `'brepkit'`). Idempotent — calling it again after a kernel is registered returns the current kernel ID immediately. Note: `occt-wasm` is not auto-detected — use `registerKernel()` directly.

### `initFromOC(oc)`

Manual initialization — creates the default OpenCascade adapter from a loaded WASM instance and registers it as `'occt'`.

### `BrepkitAdapter`

Adapter for the external `brepkit-wasm` WASM package. Create with `new BrepkitAdapter(brepkitWasm)` and register via `registerKernel('brepkit', adapter)`. Coverage is growing - some advanced operations may throw "not implemented".

### `OcctWasmAdapter`

Adapter for the external `occt-wasm` WASM package. This is an arena-based OCCT V8 kernel compiled to WASM — all geometry is identified by `u32` handles into the arena. Create with `new OcctWasmAdapter(Module, kernel)` and register via `registerKernel('occt-wasm', adapter)`.

Unlike `brepjs-opencascade`, `occt-wasm` is not auto-detected by `init()` because the WASM binary location cannot be inferred without build-tool configuration. You must register it manually.

Import the adapter from the deep path:

```typescript
import { OcctWasmAdapter } from 'brepjs/kernel/occtWasm/occtWasmAdapter';
```

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

## Multi-Kernel Testing

brepjs tests run against all three kernels (OpenCascade, brepkit, and occt-wasm) in CI. This is configured via vitest projects:

```typescript
// vitest.config.ts (simplified)
export default defineConfig({
  test: {
    projects: [
      { name: 'occt', env: { TEST_KERNEL: 'occt' } },
      { name: 'brepkit', env: { TEST_KERNEL: 'brepkit' } },
      { name: 'occt-wasm', env: { TEST_KERNEL: 'occt-wasm' } },
    ],
  },
});
```

The test setup reads `TEST_KERNEL` and initializes the correct adapter. See `tests/helpers/kernelInit.ts` for the full implementation covering all three kernels.

### Running tests against a specific kernel

```bash
# Run all tests with all kernels (default)
npm run test

# Run a single kernel
npx vitest run --project occt
npx vitest run --project brepkit
npx vitest run --project occt-wasm

# Run a single test file on all kernels
npx vitest run tests/fn-booleanFns.test.ts
```

Some tests are kernel-specific (e.g., tests for OCCT-only or brepkit-only features). These are listed in `vitest.config.ts` under each kernel's `excludeTests`. See the [Kernel Conformance Matrix](./kernel-conformance.md) for a detailed breakdown of feature parity across all three kernels.

### Testing your custom kernel

To test a custom kernel, add a vitest project that sets `TEST_KERNEL` to your kernel ID, then update `tests/setup.ts` to handle the new case.

## Architecture Reference

See [Architecture](./architecture.md) for the full layer diagram and how the kernel fits into the boundary system.
