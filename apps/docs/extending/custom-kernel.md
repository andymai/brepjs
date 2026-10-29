---
title: Writing a Custom Kernel
description: 'Implement KernelAdapter to back brepjs with another geometry library. What the interface requires and how to verify your adapter.'
---

# Writing a Custom Kernel

brepjs is built so the kernel is replaceable. The shipped kernels (occt-wasm, the default; OpenCascade via `brepjs-opencascade`; brepkit; Manifold) implement the same interface; you can write another for any geometry library that exposes a workable API. This chapter walks through what `KernelAdapter` requires, how to register your adapter, and how the conformance suite verifies your implementation.

## Why you might write a custom kernel

- **Wrap a Rust geometry library** you already maintain.
- **Adapt a different OpenCascade build** (different version, different feature flags).
- **Mock the kernel for tests**: return synthetic shapes for unit testing without loading WASM.
- **Implement a constrained subset**: e.g. a "mesh-only" kernel that doesn't support exact booleans.

For most apps this chapter is reference, not requirement. You only need it if one of the above applies.

## What `KernelAdapter` looks like

The kernel interface, `KernelAdapter`, is composed in `src/kernel/interfaces/index.ts` (and re-exported from `src/kernel/types.ts`). It's segregated into smaller fragments (`KernelBooleanOps`, `KernelMeshOps`, `KernelMeasureOps`, `KernelIOOps`, etc.) intersected into the full `KernelAdapter`. `registerKernel` takes a full `KernelAdapter`, so a custom kernel provides every method and throws from the ones its backend can't do.

A simplified excerpt:

<!-- @no-test -->

```typescript
export interface KernelBooleanOps {
  fuse(shape: KernelShape, tool: KernelShape, options?: BooleanOptions): KernelShape;
  cut(shape: KernelShape, tool: KernelShape, options?: BooleanOptions): KernelShape;
  intersect(shape: KernelShape, tool: KernelShape, options?: BooleanOptions): KernelShape;
  // …fuseAll, cutAll, split, section, …
}

export interface KernelMeasureOps {
  volume(shape: KernelShape): number;
  area(shape: KernelShape): number;
  length(shape: KernelShape): number;
  // …centerOfMass, boundingBox, distance, …
}

export interface KernelCore {
  readonly kernelId: string; // 'occt-wasm' | 'occt' | 'brepkit' | 'manifold' | your-id
  dispose(handle: { delete(): void }): void;
  // …capabilities, checkpoints, …
}

export type KernelAdapter = KernelCore &
  KernelBooleanOps &
  KernelMeasureOps &
  KernelMeshOps &
  KernelIOOps &
  KernelTransformOps &
  KernelTopologyOps & // shapeType(): 'vertex' | 'edge' | … | 'compound'
  /* …other fragments… */ Kernel2DCapability;
```

`KernelShape` is your kernel's native shape type: whatever your library calls a shape. brepjs treats it as an opaque value; only your adapter ever calls methods on it.

## A skeleton adapter

Suppose you have a geometry library `mygeom` with its own `Shape` type:

<!-- @no-test -->

```typescript
import { type KernelAdapter, type ShapeType, registerKernel } from 'brepjs';
import * as mygeom from 'mygeom';

export class MyGeomAdapter implements KernelAdapter {
  readonly kernelId = 'mygeom';

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
  volume(s: mygeom.Shape): number {
    return mygeom.volume(s);
  }
  // ... area, length, ...

  // Mesh
  mesh(s: mygeom.Shape, opts: { tolerance: number; angularTolerance: number }) {
    const tris = mygeom.triangulate(s, opts.tolerance);
    return {
      vertices: tris.positions,
      normals: tris.normals,
      triangles: tris.indices,
      uvs: new Float32Array(0),
      faceGroups: [],
    };
  }
  // ... rest of the interface ...

  dispose(s: mygeom.Shape): void {
    mygeom.release(s);
  }

  shapeType(s: mygeom.Shape): ShapeType {
    return mygeom.kindOf(s);
  }

  // ...
}

registerKernel('mygeom', new MyGeomAdapter());
```

After `registerKernel`, brepjs operations executed inside `withKernel('mygeom', () => ...)` (or everywhere, if `'mygeom'` is the first kernel registered) call your adapter's methods.

## The full interface fragments

The core of a working kernel:

- **`KernelCore`**: `kernelId`, `capabilities`, `dispose`, checkpoints
- **`KernelPrimitiveOps`**: primitives (`makeBox`, `makeCylinder`, …)
- **`KernelTopologyOps`**: `shapeType`, sub-shape iteration (`iterShapes`), `isSame`, `copyShape`
- **`KernelBooleanOps`**: `fuse`, `cut`, `intersect`, multi-shape variants
- **`KernelMeasureOps`**: `volume`, `area`, `length`, `boundingBox`, `centerOfMass`
- **`KernelMeshOps`**: triangulation
- **`KernelTransformOps`**: `translate`, `rotate`, `scale`, `mirror`

The rest (`KernelBuilderOps`, `KernelSweepOps`, `KernelModifierOps`, `KernelEvolutionOps`, `KernelIOOps`, `KernelCurveOps`, `KernelSurfaceOps`, `KernelRepairOps`, `Kernel2DCapability`) must exist on the object too, but a method your backend can't do may simply throw; brepjs callers get an explicit error.

The conformance suite records per-kernel gaps in a divergence registry. You can ship a partial kernel that supports only what your backend can do.

## What's hard

Writing a kernel that reaches conformance is non-trivial. Common challenges:

### Shape kind classification

brepjs has eight shape kinds. Your library may have a different ontology. The mapping isn't always one-to-one; e.g. some kernels don't distinguish `Shell` from `Solid`. Your adapter has to make these decisions consistently.

### Tolerance propagation

Each shape has a tolerance. Operations propagate tolerances to results. If your library doesn't track tolerance per shape, you'll need to add a side table mapping shape → tolerance.

### Validity invariants

`ValidSolid`, `ClosedWire`, `OrientedFace`, `ManifoldShell` are runtime-checked invariants. Your adapter must implement check functions that brepjs uses behind the smart constructors and type guards. Returning false negatives (saying a valid shape is invalid) breaks programs; false positives (saying invalid is valid) corrupts state downstream.

### Disposal semantics

Every shape your adapter returns has to be disposable. brepjs tracks shapes and calls your `dispose(handle)` when they go out of scope. If your library is GC-managed, `dispose` can be a no-op. If it's manually managed, `dispose` has to actually free the underlying memory.

## The `BrepkitAdapter` reference

`src/kernel/brepkit/brepkitAdapter.ts` in the brepjs source is the reference implementation for a Rust-WASM kernel. It's instructive as a complete, working example of the interface: the class is assembled from per-domain `make*Ops(bk)` factories, and a compile-time guard asserts the instance satisfies the full `KernelAdapter`.

The brepkit adapter shows the typical structure:

- A class implementing `KernelAdapter`
- A constructor that takes the kernel handle (your library's main object)
- Private helpers for shape-kind translation and tolerance bookkeeping
- Methods that delegate to the library, wrapping inputs/outputs

## Selecting your kernel at init

Once `registerKernel('mygeom', adapter)` has run, your kernel is available. The first kernel registered becomes the default; to run code against yours explicitly:

<!-- @no-test -->

```typescript
import { withKernel, registerKernel } from 'brepjs';
import { MyGeomAdapter } from './MyGeomAdapter';

registerKernel('mygeom', new MyGeomAdapter());

// brepjs calls inside this (synchronous) callback use mygeom
withKernel('mygeom', () => {
  // ...
});
```

For a single dominant kernel, register it in your app's startup code. For dual-kernel apps (e.g. running tests against two kernels), use `withKernel` to switch.

## Testing your adapter

Use the conformance suite ([Kernel Conformance Suite](./conformance)). It's the same test suite brepjs runs against its occt-wasm, OpenCascade, brepkit, and Manifold kernels. Pointing it at your adapter tells you which fragments work, which don't, and which fail subtly.

The minimal CI, after adding a `mygeom` entry to `tests/helpers/kernelRegistry.ts` and an init branch to `tests/helpers/kernelInit.ts`:

<!-- @no-test -->

```bash
npx vitest run --project mygeom
```

The conformance suite is parametrized on kernel ID. A passing run means your adapter implements every fragment brepjs uses correctly.

## When to _not_ write a kernel

- If you're targeting a different geometry library to get a particular operation, prefer adding that operation in Layer 2 of brepjs (call into the existing kernel for the boilerplate, your own code for the operation). Most "I want feature X" cases are not kernel-shaped.
- If you're trying to fake the kernel for tests, prefer a stub that throws on unimplemented methods rather than a full adapter; keeps the test boundary explicit.

## Next steps

- [Kernel Conformance Suite](./conformance): testing your adapter
- [Architecture & Layers](./architecture): where the kernel sits relative to the rest of brepjs
- [Kernels & withKernel](../concepts/kernels): the user-facing view of the kernel system
