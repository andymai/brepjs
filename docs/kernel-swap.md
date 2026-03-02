# Custom Kernel Guide

brepjs is kernel-agnostic. All geometry operations go through a `KernelAdapter` interface — the library ships with a default implementation, but you can register your own kernel at runtime.

## Quick Start

```typescript
import { registerKernel, withKernel } from 'brepjs';

// Register your kernel (first registered becomes the default)
registerKernel('my-kernel', myKernelAdapter);

// Or run a specific kernel temporarily
import { initFromOC } from 'brepjs';
initFromOC(oc); // default = 'occt'
registerKernel('rust', rustAdapter);

const result = withKernel('rust', () => {
  return makeBox(10, 10, 10); // uses Rust kernel
});
```

## API

### `registerKernel(id, adapter)`

Register a `KernelAdapter` under a unique string ID. The first kernel registered becomes the default for all `getKernel()` calls.

### `initFromOC(oc)`

Convenience wrapper — creates the default adapter from a loaded WASM instance and registers it.

### `withKernel(id, fn)`

Run a **synchronous** function with a different kernel as the default, then restore the previous default. Do not pass async functions — the kernel override is restored in `finally`.

### `getKernel(id?)`

Returns the kernel adapter for the given ID, or the default kernel. Used internally by all brepjs operations. You rarely need to call this directly.

## Writing a KernelAdapter

The `KernelAdapter` interface (`src/kernel/types.ts`) defines ~120 methods across these categories:

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
  readonly oc = null; // set to your WASM instance or null
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

`KernelShape` is typed as `any` — your kernel decides what a "shape" is internally. It could be:

- A pointer into a WASM linear memory arena
- An integer handle/index into a shape table
- A serialized blob
- A JavaScript object wrapping native data

The only contract: **Layer 2+ code never calls methods on shape handles**. It only passes them back to `getKernel()` methods. This is enforced by an ESLint rule (`no-restricted-syntax`) that bans `x.wrapped.method()` calls outside `src/kernel/`.

### What Must Each Method Return?

All kernel methods return **plain JavaScript values** — never raw kernel objects:

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

## Architecture Reference

See [Architecture](./architecture.md) for the full layer diagram and how the kernel fits into the boundary system.
