---
title: Writing a Custom Kernel
description: 'Implement KernelInterface to back brepjs with a third geometry library. What the interface requires and how to verify your adapter.'
---

# Writing a Custom Kernel

brepjs is built so the kernel is replaceable. The two shipped kernels (OpenCascade, brepkit) implement the same interface; you can write a third for any geometry library that exposes a workable API. This chapter walks through what `KernelInterface` requires, how to register your adapter, and how the conformance suite verifies your implementation.

## Why you might write a custom kernel

- **Wrap a Rust geometry library** you already maintain.
- **Adapt a different OpenCascade build** (different version, different feature flags).
- **Mock the kernel for tests** — return synthetic shapes for unit testing without loading WASM.
- **Implement a constrained subset** — e.g. a "mesh-only" kernel that doesn't support exact booleans.

For most apps this chapter is reference, not requirement. You only need it if one of the above applies.

## What `KernelInterface` looks like

The kernel interface lives at `src/kernel/types.ts`. It's segregated into smaller fragments — `KernelBooleans`, `KernelMesh`, `KernelMeasurement`, `KernelIO`, etc. — composed into the full `KernelInterface`. A custom kernel can implement only the fragments it supports.

A simplified excerpt:

<!-- @no-test -->

```typescript
export interface KernelBooleans {
  fuse(a: KernelHandle, b: KernelHandle): KernelHandle;
  cut(a: KernelHandle, b: KernelHandle): KernelHandle;
  intersect(a: KernelHandle, b: KernelHandle): KernelHandle;
}

export interface KernelMeasurement {
  measureVolume(s: KernelHandle): number;
  measureArea(s: KernelHandle): number;
  measureLength(e: KernelHandle): number;
}

export interface KernelInterface
  extends KernelBooleans,
    KernelMeasurement,
    KernelMesh,
    KernelIO,
    KernelTransforms,
    KernelTopology,
    /* …other fragments… */ {
  readonly id: string; // 'occt' | 'brepkit' | your-id
  dispose(s: KernelHandle): void;
  shapeKind(s: KernelHandle): 'vertex' | 'edge' | 'wire' | 'face' | 'shell' | 'solid' | 'compound';
}
```

`KernelHandle` is your kernel's native shape type — whatever your library calls a shape. brepjs treats it as an opaque value; only your adapter ever calls methods on it.

## A skeleton adapter

Suppose you have a geometry library `mygeom` with its own `Shape` type:

<!-- @no-test -->

```typescript
import { type KernelInterface, type KernelHandle, registerKernel } from 'brepjs';
import * as mygeom from 'mygeom';

export class MyGeomAdapter implements KernelInterface {
  readonly id = 'mygeom';

  // Booleans
  fuse(a: mygeom.Shape, b: mygeom.Shape): mygeom.Shape {
    return mygeom.boolean(a, b, 'union');
  }
  cut(a: mygeom.Shape, b: mygeom.Shape): mygeom.Shape {
    return mygeom.boolean(a, b, 'difference');
  }
  intersect(a: mygeom.Shape, b: mygeom.Shape): mygeom.Shape {
    return mygeom.boolean(a, b, 'intersection');
  }

  // Measurement
  measureVolume(s: mygeom.Shape): number {
    return mygeom.volume(s);
  }
  // ... measureArea, measureLength, ...

  // Mesh
  mesh(s: mygeom.Shape, opts: { tolerance: number }): KernelMesh {
    const tris = mygeom.triangulate(s, opts.tolerance);
    return {
      position: tris.positions,
      normal: tris.normals,
      index: tris.indices,
    };
  }
  // ... rest of the interface ...

  dispose(s: mygeom.Shape): void {
    mygeom.release(s);
  }

  shapeKind(
    s: mygeom.Shape
  ): KernelInterface['shapeKind'] extends (...args: any) => infer R ? R : never {
    return mygeom.kindOf(s);
  }

  // ...
}

registerKernel('mygeom', new MyGeomAdapter());
```

After `registerKernel`, brepjs operations executed inside `withKernel('mygeom', () => ...)` (or after `init()` resolved to `'mygeom'`) call your adapter's methods.

## The full interface fragments

Implement at minimum:

- **`KernelTopology`** — primitives (`makeBox`, `makeCylinder`, …), `shapeKind`, sub-shape iteration
- **`KernelBooleans`** — `fuse`, `cut`, `intersect`, multi-shape variants
- **`KernelMeasurement`** — `measureVolume`, `measureArea`, `measureLength`, `boundingBox`, `centerOfMass`
- **`KernelMesh`** — triangulation
- **`KernelTransforms`** — `translate`, `rotate`, `scale`, `mirror`
- **`KernelDispose`** — `dispose` (single), batch dispose

Optional:

- **`KernelIO`** — STEP, IGES, BREP, STL — if you don't implement, those operations throw `KERNEL_NOT_SUPPORTED`
- **`KernelHealing`** — `autoHeal`, `sew`, etc. If absent, brepjs callers get an explicit error.
- **`KernelFinders`** — kernel-side query helpers; if absent, brepjs falls back to topology iteration

The conformance suite tests each fragment independently. You can ship a partial kernel that supports only what your backend can do.

## What's hard

Writing a kernel that reaches conformance is non-trivial. Common challenges:

### Shape kind classification

brepjs has seven shape kinds. Your library may have a different ontology. The mapping isn't always one-to-one — e.g. some kernels don't distinguish `Shell` from `Solid`. Your adapter has to make these decisions consistently.

### Tolerance propagation

Each shape has a tolerance. Operations propagate tolerances to results. If your library doesn't track tolerance per shape, you'll need to add a side table mapping shape → tolerance.

### Validity invariants

`ValidSolid`, `ClosedWire`, `OrientedFace`, `ManifoldShell` are runtime-checked invariants. Your adapter must implement check functions that brepjs uses behind the smart constructors and type guards. Returning false negatives (saying a valid shape is invalid) breaks programs; false positives (saying invalid is valid) corrupts state downstream.

### Disposal semantics

Every shape your adapter returns has to be disposable. brepjs tracks shapes and calls your `dispose(handle)` when they go out of scope. If your library is GC-managed, `dispose` can be a no-op. If it's manually managed, `dispose` has to actually free the underlying memory.

## The `BrepkitAdapter` reference

`src/kernel/brepkit/BrepkitAdapter.ts` in the brepjs source is the reference implementation for a Rust-WASM kernel. It's instructive as a complete, working example of the interface — every method is implemented or stubbed with a clear `KERNEL_NOT_SUPPORTED` placeholder.

The brepkit adapter shows the typical structure:

- A class implementing `KernelInterface`
- A constructor that takes the kernel handle (your library's main object)
- Private helpers for shape-kind translation and tolerance bookkeeping
- Methods that delegate to the library, wrapping inputs/outputs

## Selecting your kernel at init

Once `registerKernel('mygeom', adapter)` has run, your kernel is available. To make it the default:

<!-- @no-test -->

```typescript
import { withKernel, registerKernel } from 'brepjs';
import { MyGeomAdapter } from './MyGeomAdapter';

registerKernel('mygeom', new MyGeomAdapter());

// All subsequent brepjs calls use mygeom by default
withKernel('mygeom', () => {
  // ...
});
```

For a single dominant kernel, register it in your app's startup code. For dual-kernel apps (e.g. running tests against two kernels), use `withKernel` to switch.

## Testing your adapter

Use the conformance suite ([Kernel Conformance Suite](./conformance)) — it's the same test suite brepjs runs against the OpenCascade and brepkit kernels. Pointing it at your adapter tells you which fragments work, which don't, and which fail subtly.

The minimal CI:

<!-- @no-test -->

```bash
TEST_KERNEL=mygeom npm test
```

The conformance suite is parametrized on kernel ID. A passing run means your adapter implements every fragment brepjs uses correctly.

## When to _not_ write a kernel

- If you're targeting a different geometry library to get a particular operation, prefer adding that operation in Layer 2 of brepjs (call into the existing kernel for the boilerplate, your own code for the operation). Most "I want feature X" cases are not kernel-shaped.
- If you're trying to fake the kernel for tests, prefer a stub that throws on unimplemented methods rather than a full adapter — keeps the test boundary explicit.

## Next steps

- [Kernel Conformance Suite](./conformance) — testing your adapter
- [Architecture & Layers](./architecture) — where the kernel sits relative to the rest of brepjs
- [Kernels & withKernel](../concepts/kernels) — the user-facing view of the kernel system
