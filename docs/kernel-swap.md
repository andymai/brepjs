# Custom Kernel Guide

brepjs is kernel-agnostic. All geometry operations go through a `KernelAdapter` interface. Three adapters are provided:

- **occt-wasm** (via `occt-wasm`) — the default kernel: arena-based OCCT V8 compiled to WASM with a handle-based memory model
- **OpenCascade WASM** (via `brepjs-opencascade`) — the legacy OpenCascade build; mature, still supported as an alternative
- **brepkit WASM** (via `brepkit-wasm`) — alternative kernel with growing coverage

You can also register your own kernel at runtime.

## Quick Start

```typescript
// Easiest: auto-detect and initialize the best available kernel
import { init, box } from 'brepjs';
await init(); // tries occt-wasm (default), then brepjs-opencascade, then brepkit-wasm
const myBox = box(10, 10, 10);
```

### Manual initialization

```typescript
import { OcctKernel } from 'occt-wasm';
import { registerKernel, withKernel, OcctWasmAdapter, BrepkitAdapter } from 'brepjs';

// Initialize the default occt-wasm kernel
const kernel = await OcctKernel.init();
registerKernel('occt-wasm', OcctWasmAdapter.fromKernel(kernel));

// Register the brepkit kernel as an alternative (external brepkit-wasm package)
import bkInit, { BrepKernel } from 'brepkit-wasm';
await bkInit();
registerKernel('brepkit', new BrepkitAdapter(new BrepKernel()));

// Register the legacy brepjs-opencascade kernel as an alternative
import opencascade from 'brepjs-opencascade';
import { initFromOC } from 'brepjs';
const oc = await opencascade();
initFromOC(oc);

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

Auto-detect and initialize the best available kernel. Tries `occt-wasm` (the default kernel) first, then falls back to `brepjs-opencascade`, then `brepkit-wasm`. Returns a `Promise<string>` with the kernel ID (`'occt-wasm'`, `'occt'`, or `'brepkit'`). Idempotent — calling it again after a kernel is registered returns the current kernel ID immediately.

### `initFromOC(oc)`

Manual initialization — creates the OpenCascade adapter from a loaded `brepjs-opencascade` WASM instance and registers it as `'occt'` (the alternative kernel; the default is `occt-wasm`).

### `BrepkitAdapter`

Adapter for the external `brepkit-wasm` WASM package. Create with `new BrepkitAdapter(brepkitWasm)` and register via `registerKernel('brepkit', adapter)`. Coverage is growing - some advanced operations may throw "not implemented".

### `OcctWasmAdapter`

Adapter for the external `occt-wasm` WASM package. This is an arena-based OCCT V8 kernel compiled to WASM — all geometry is identified by `u32` handles into the arena.

When you use occt-wasm's high-level `OcctKernel` wrapper, build the adapter with `OcctWasmAdapter.fromKernel(kernel)`:

```typescript
import { OcctKernel } from 'occt-wasm';
import { OcctWasmAdapter } from 'brepjs/kernel/occtWasm/occtWasmAdapter';

const kernel = await OcctKernel.init();
registerKernel('occt-wasm', OcctWasmAdapter.fromKernel(kernel));
```

> **Lifetime coupling.** `OcctKernel` registers itself with a `FinalizationRegistry` that deletes its raw kernel on garbage collection. An adapter that only borrows the raw kernel (`new OcctWasmAdapter(kernel.getRawModule(), kernel.getRawKernel())`) can be left pointing at freed memory once the wrapper is collected, surfacing as `BindingError: Cannot pass deleted object as a pointer of type OcctKernel*`. `fromKernel` pins the wrapper for the adapter's lifetime, so prefer it over the raw constructor whenever a wrapper exists.

The raw `new OcctWasmAdapter(Module, kernel)` constructor remains for callers that own a raw Embind kernel directly (`new Module.OcctKernel()`), which the adapter already retains.

`occt-wasm` is the default kernel and is auto-detected by `init()` — its `OcctKernel.init()` resolves its own WASM binary, so no build-tool configuration is needed. The manual `registerKernel('occt-wasm', ...)` path above is for callers that want explicit control over init timing or error handling.

`OcctWasmAdapter` is exported from the `brepjs` root:

```typescript
import { OcctWasmAdapter } from 'brepjs';
```

> **Migration note (occt-wasm default flip).** The re-exported `OcctKernelOwner`
> interface now types its `getRawModule()` / `getRawKernel()` accessors as
> `unknown` instead of the concrete `OcctWasmModule` / `OcctKernelWasm`. This
> mirrors occt-wasm's published `.d.ts`, which under-declares the raw Embind
> surface. The runtime objects are unchanged. Callers that only pass an
> `OcctKernel` wrapper into `OcctWasmAdapter.fromKernel(kernel)` need no changes
> (and any existing `kernel as unknown as Parameters<typeof OcctWasmAdapter.fromKernel>[0]`
> workaround can be removed). Callers that read the raw module or kernel through
> the interface directly must add their own cast to the concrete type.

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
