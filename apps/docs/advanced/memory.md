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

### 1. The fluent wrapper: auto-cleanup on chains

```typescript
import { shape, box, cylinder, measureVolume, unwrap } from 'brepjs/quick';

const part = shape(box(20, 20, 20)).cut(cylinder(5, 25)).val;

// `part` is the only handle that survives. Intermediate
// handles (the original box, the cylinder, the result of cut)
// were tracked by the wrapper and released at .val.
console.log(unwrap(measureVolume(part)));
```

The `shape().chain()` form tracks every intermediate result and disposes them when you call `.val`. The only object that escapes the chain is the final shape. **Use this for any chain of operations**; it's the simplest way to avoid leaks in code that builds a part once.

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
  scope.dispose(); // releases a, b, fused - in LIFO order
}
```

`scope.track(shape)` registers the shape for cleanup; `scope.dispose()` releases everything in reverse order of registration. The reverse order matters because shape A may depend on shape B (e.g. an edge handle from a face).

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

### 4. Manual `dispose()`: escape hatch

```typescript
import { box, dispose } from 'brepjs/quick';

const temp = box(10, 10, 10);
// ... use temp ...
dispose(temp); // explicit cleanup
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
console.log('Allocated:', stats.allocated); // 2
console.log('Disposed:', stats.disposed); // 0
console.log('Live:', stats.live); // 2 - should be 0 at the end of a run
```

`getDisposalStats` reports the count of allocated, disposed, and currently-live handles. In a long-running app, periodically log `live` and watch for growth; that's a leak. (gridfinity-layout-tool's regression tests use this.)

## What does _not_ need disposal

- **Primitive numbers, strings, arrays returned from measurements**: `measureVolume(s)` returns a `Result<number>`; once unwrapped to the underlying number, no disposal is needed.
- **Buffer geometry data from `mesh()`**: `toBufferGeometryData` returns plain TypedArrays. The mesh handle (the brepjs side) does need disposal; the TypedArrays don't.
- **Imported plain JS objects**: `getBoundingBox`, `getCenterOfMass` return plain objects.
- **Result wrappers**: `Result<T,E>` is a plain JS object; only the `.value` shape inside needs disposal if it's a shape.

## Common gotchas

### Disposing too early

Edge / face handles point into the parent shape. Dispose the parent and the children are invalid:

<!-- @no-test -->

```typescript
import { box, edgeFinder, dispose, measureLength, unwrap } from 'brepjs/quick';

const b = box(10, 10, 10);
const edges = edgeFinder().findAll(b);
dispose(b);
// edges[0] now points to freed memory - undefined behaviour
console.log(unwrap(measureLength(edges[0]!))); // crash or garbage
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

`DisposalScope` disposes in LIFO order automatically, which handles dependencies correctly _if you register dependees after their dependees_. If you register out of order:

<!-- @no-test -->

```typescript
import { DisposalScope, box, edgeFinder } from 'brepjs/quick';

const scope = new DisposalScope();
const edges = edgeFinder().findAll(box(10, 10, 10)); // edges + parent leaked
scope.track(edges); // tracks edges only
// scope.dispose() will free edges' memory but the parent leaks
```

Always register parents before queries on them. Practically, this means: track every shape allocation in the order you make them.

### Async + scopes

Async breaks `using` (it captures the scope at function entry, not across await):

<!-- @no-test -->

```typescript
import { box } from 'brepjs/quick';

async function buggy() {
  using temp = box(10, 10, 10);
  await fetch('/api');
  // temp may have been disposed during the await
}
```

For async workflows, prefer `DisposalScope` and dispose explicitly after the async work completes, or pass shape handles through promises by reference rather than relying on lexical scoping.

## The bottom line

- **One-off scripts**: don't worry about it.
- **Building a part as a chain**: use the fluent `shape()` wrapper.
- **Functions that construct temporary shapes**: use `using`.
- **Long-running apps with many shapes**: use `DisposalScope` / `withScope`.
- **Tests**: `getDisposalStats` to assert `live === 0` at the end.

## Next steps

- [Performance](./performance): caching meshes, reusing handles, batching
- [Web Workers](./workers): isolating brepjs in a worker so a leak only kills the worker
- [Healing & Sewing](./healing): operations that may allocate intermediate handles
