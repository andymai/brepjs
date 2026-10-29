---
title: Memory Management
description: 'WASM objects are not GC-managed. The four cleanup patterns (using, DisposalScope, manual delete, ownership transfer) and when to use each.'
---

# Memory Management

WASM objects are not garbage-collected. Every shape brepjs creates is a handle to memory inside the OpenCascade WASM heap, and that memory lives until you explicitly release it. For a one-shot script the runtime cleans up at exit and you can ignore this. For a long-running app (a webapp, a worker, a server) leaks compound and crash the page. This chapter covers the four cleanup patterns and when to use each.

## The problem

```typescript
import { box } from 'brepjs/quick';

// Each call allocates kernel memory
for (let i = 0; i < 10000; i++) {
  const b = box(10, 10, 10);
  void b;
  // Nothing cleans b up. Memory keeps growing.
}
```

Eventually you OOM. The garbage collector cannot reach into the WASM heap. You have to dispose explicitly, or use one of the patterns that does it for you.

## The four patterns, ranked by simplicity

### 1. The fluent wrapper: no cleanup on chains

```typescript
import { shape, box, cylinder, measureVolume, unwrap } from 'brepjs/quick';

const part = shape(box(20, 20, 20)).cut(cylinder(5, 25)).val;

// `part` is the final shape. The intermediate handles (the
// original box, the cylinder) are NOT tracked by the wrapper;
// they stay live until disposed or reclaimed by the GC finalizer.
console.log(unwrap(measureVolume(part)));
```

The `shape()` wrapper is a fluent facade over the functional API: `.val` returns the final shape, and it does not dispose intermediates. That is fine in code that builds a part once. In a loop or a long-running app, own each input with `using` (pattern 2).

### 2. `using`: automatic block-scoped cleanup

```typescript
import { box, measureVolume, unwrap } from 'brepjs/quick';

{
  using temp = box(10, 10, 10);
  console.log('Temp volume:', unwrap(measureVolume(temp)));
} // temp is automatically disposed here
```

The TypeScript 5.2+ `using` keyword runs `Symbol.dispose` when the variable goes out of scope. brepjs shape handles all implement `Symbol.dispose` to call the kernel's release function.

This is the cleanest pattern for a temporary shape inside a function or block:

```typescript
import { box, sphere, fuse, measureVolume, unwrap } from 'brepjs/quick';

function unionWithTemp(a: import('brepjs').Shape3D, b: import('brepjs').Shape3D) {
  using fused = unwrap(fuse(a, b));
  return unwrap(measureVolume(fused));
} // fused disposed at function return

console.log(unionWithTemp(box(10, 10, 10), sphere(5)).toFixed(2));
```

### 3. `DisposalScope`: manual scoping

When you can't use `using` (older TS, environments where the keyword isn't supported, or you need to dispose multiple shapes together):

```typescript
import { DisposalScope, box, sphere, fuse, unwrap } from 'brepjs/quick';

const scope = new DisposalScope();
try {
  const a = scope.track(box(10, 10, 10));
  const b = scope.track(sphere(5));
  const fused = scope.track(unwrap(fuse(a, b)));
  // ... work with fused ...
  void fused;
} finally {
  scope[Symbol.dispose](); // releases a, b, fused - in LIFO order
}
```

`scope.track(shape)` registers the shape for cleanup; `scope[Symbol.dispose]()` releases everything in reverse order of registration. The reverse order matters because shape A may depend on shape B (e.g. an edge handle from a face).

The shorthand `withScope`:

```typescript
import { withScope, box, sphere, fuse, measureVolume, unwrap } from 'brepjs/quick';

const result = withScope((scope) => {
  const a = scope.track(box(10, 10, 10));
  const b = scope.track(sphere(5));
  const fused = scope.track(unwrap(fuse(a, b)));
  return unwrap(measureVolume(fused)); // return what you want to keep - primitives are safe
});

console.log(result.toFixed(2));
```

`withScope` constructs the scope, runs the callback, and disposes, even on exception.

### 4. Manual `delete()`: escape hatch

```typescript
import { box } from 'brepjs/quick';

const temp = box(10, 10, 10);
// ... use temp ...
temp.delete(); // explicit cleanup, same as temp[Symbol.dispose]()
```

Necessary when none of the above patterns fit, for instance when you build a shape on one tick and dispose on a later tick, or when the lifetime crosses an async boundary `using` cannot capture.

## Stats and leak detection

To check for leaks during development:

```typescript
import { getDisposalStats, resetDisposalStats, box, sphere } from 'brepjs/quick';

resetDisposalStats();

const a = box(10, 10, 10);
const b = sphere(5);
void a;
void b;

const stats = getDisposalStats();
console.log('Live:', stats.liveHandles); // 2 - should be 0 at the end of a run
console.log('Peak:', stats.peakHandles); // 2
console.log('GC-collected:', stats.gcCollected); // 0
```

`getDisposalStats` reports the count of currently-live handles, the peak live count, and how many handles the GC finalizer reclaimed. In a long-running app, periodically log `liveHandles` and watch for growth; that's a leak. (gridfinity-layout-tool's regression tests use this.)

## What does _not_ need disposal

- **Primitive numbers, strings, arrays returned from measurements**: `measureVolume(s)` returns a `Result<number>`; once unwrapped to the underlying number, no disposal is needed.
- **Buffer geometry data from `mesh()`**: `mesh()` and `toBufferGeometryData` return plain TypedArrays. Neither needs disposal.
- **Imported plain JS objects**: `getBounds`, `measureVolumeProps` return plain objects.
- **Result wrappers**: `Result<T,E>` is a plain JS object; only the `.value` shape inside needs disposal if it's a shape.

## Common gotchas

### Disposing too early

Edge / face handles point into the parent shape. Dispose the parent and the children are invalid:

<!-- @no-test -->

```typescript
import { box, edgeFinder, measureLength, unwrap } from 'brepjs/quick';

const b = box(10, 10, 10);
const edges = edgeFinder().findAll(b);
b.delete();
// edges[0] was released with its parent
console.log(unwrap(measureLength(edges[0]!))); // throws: Shape handle has been disposed
```

If you need both, dispose the parent only after you're done with the children, or copy the data you need (lengths, positions, types) before disposing.

### Forgetting to track in a scope

```typescript
import { withScope, box, fuse, measureVolume, unwrap } from 'brepjs/quick';

withScope((scope) => {
  const a = box(10, 10, 10); // NOT tracked - will leak
  const b = scope.track(box(5, 5, 5));
  const f = scope.track(unwrap(fuse(a, b)));
  console.log(unwrap(measureVolume(f)));
});
```

`scope.track` only tracks the explicit argument. Wrap every shape allocation with `scope.track` or use the wrapper.

### Disposal in the wrong order

`DisposalScope` disposes in LIFO order automatically, which handles dependencies correctly _if you register dependencies after their dependees_. If you register out of order:

<!-- @no-test -->

```typescript
import { DisposalScope, box, edgeFinder } from 'brepjs/quick';

const scope = new DisposalScope();
const edges = edgeFinder().findAll(box(10, 10, 10)); // edges + parent leaked
edges.forEach((e) => scope.track(e)); // tracks edges only
// scope[Symbol.dispose]() will free edges' memory but the parent leaks
```

Always register parents before queries on them. Practically, this means: track every shape allocation in the order you make them.

### Async + scopes

Async breaks `withScope`: it disposes as soon as the callback returns, and an async callback returns its promise at the first `await`:

<!-- @no-test -->

```typescript
import { withScope, box } from 'brepjs/quick';

async function buggy() {
  await withScope(async (scope) => {
    const temp = scope.track(box(10, 10, 10));
    await fetch('/api');
    // temp was disposed before the await resumed
    void temp;
  });
}
```

For async workflows, use `using` inside the async function (it disposes at block exit, after the awaits), or `withScopeResultAsync`, which disposes after the returned promise settles.

## The bottom line

- **One-off scripts**: don't worry about it.
- **Building a part once as a chain**: use the fluent `shape()` wrapper.
- **Functions that construct temporary shapes**: use `using`.
- **Long-running apps with many shapes**: use `DisposalScope` / `withScope`.
- **Tests**: `getDisposalStats` to assert `liveHandles === 0` at the end.

## Next steps

- [Performance](./performance): caching meshes, reusing handles, batching
- [Web Workers](./workers): isolating brepjs in a worker so a leak only kills the worker
- [Healing & Sewing](./healing): operations that may allocate intermediate handles
