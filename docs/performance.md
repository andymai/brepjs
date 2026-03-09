# Performance Guide

Best practices for achieving optimal performance with brepjs.

## Memory Management

### Use DisposalScope for Scoped Cleanup

`DisposalScope` provides deterministic cleanup of kernel objects:

```typescript
import { DisposalScope, box, fuse } from 'brepjs';

function buildComplexShape() {
  using scope = new DisposalScope();

  // Intermediate shapes are automatically cleaned up
  const box1 = scope.register(box(10, 10, 10));
  const box2 = scope.register(box(10, 10, 10, { at: [5, 0, 0] }));

  // Return the result — it escapes the scope
  return fuse(box1, box2);
}
```

**Key patterns:**

- Register intermediate kernel objects with `scope.register()` for cleanup
- Objects returned from the function escape the scope and remain valid
- Cleanup happens deterministically when the scope exits

### Avoid Manual delete() Calls

Modern brepjs uses `Symbol.dispose` and `FinalizationRegistry` for memory management. Prefer scoped cleanup over manual `delete()` calls:

```typescript
// ❌ Old pattern — error-prone
const myBox = box(10, 10, 10);
try {
  doSomething(myBox);
} finally {
  myBox.delete();
}

// ✅ Modern pattern — automatic cleanup (requires TypeScript 5.9+)
using myBox = box(10, 10, 10);
doSomething(box);
```

## Boolean Operations

### Batch Operations

Use batch boolean operations instead of sequential pairwise operations:

```typescript
import { fuseAll, cutAll } from 'brepjs';

// ❌ Slow — O(n) operations
let result = shapes[0];
for (const shape of shapes.slice(1)) {
  result = fuse(result, shape);
}

// ✅ Fast — single N-way operation
const result = fuseAll(shapes);
```

The native N-way operations use `BRepAlgoAPI_BuilderAlgo` which is significantly faster than pairwise operations.

### Glue Optimization

When fusing shapes that share faces, use the `optimisation` option:

```typescript
// Adjacent boxes sharing a face
const result = fuse(box1, box2, {
  optimisation: 'commonFace', // or 'sameFace' for identical faces
});
```

- `commonFace`: Shapes share overlapping faces
- `sameFace`: Shapes share geometrically identical faces

## Meshing

### Cache Configuration

brepjs caches mesh results for shapes. The cache is keyed by shape hash and mesh options.

```typescript
import { mesh, clearMeshCache } from 'brepjs';

// First call computes the mesh
const mesh1 = mesh(shape, { tolerance: 0.1 });

// Second call returns cached result
const mesh2 = mesh(shape, { tolerance: 0.1 });

// Clear cache if memory is constrained
clearMeshCache();
```

**Mesh options affecting cache:**

- `tolerance`: Maximum chord height / linear deflection (smaller = finer mesh)
- `angularTolerance`: Maximum angle between adjacent normals

### Mesh Quality vs. Performance

| tolerance | Use Case             | Relative Speed |
| --------- | -------------------- | -------------- |
| 0.5       | Preview/bounding box | ~1x            |
| 0.1       | Interactive display  | ~5x            |
| 0.01      | High-quality render  | ~50x           |
| 0.001     | CAM/precision        | ~500x          |

## Query Operations

### Use Finders Efficiently

Finders iterate over topology once per filter application. Chain filters to minimize iterations:

```typescript
// ✅ Efficient — single iteration with combined filters
const faces = faceFinder()
  .parallelTo('Z')
  .ofSurfaceType('PLANE')
  .find(shape);

// ❌ Less efficient — multiple separate queries
const zFaces = faceFinder().parallelTo('Z').find(shape);
const planeFaces = zFaces.filter(f => /* manual check */);
```

### Create Finders for Reuse

When applying different filters from a common base, create new finder instances:

```typescript
// Each finder call creates a new immutable chain
const topFaces = faceFinder().ofSurfaceType('PLANE').inDirection('Z').find(shape);
const sideFaces = faceFinder().ofSurfaceType('PLANE').inDirection('X').find(shape);
```

## Benchmarking

Run benchmarks to measure performance:

```bash
npm run bench
```

Benchmark files are in `benchmarks/` and use a custom harness that reports min/median/mean/max times.

### Writing Benchmarks

```typescript
import { bench, printResults, type BenchResult } from './harness.js';

const results: BenchResult[] = [];

results.push(
  await bench(
    'operation name',
    () => {
      // Operation to benchmark
    },
    { warmup: 3, iterations: 10 }
  )
);

printResults(results);
```

## Common Pitfalls

### 1. Creating Shapes in Loops

```typescript
// ❌ Leaks memory
for (let i = 0; i < 1000; i++) {
  const b = box(1, 1, 1, { at: [i, 0, 0] });
  // b is never cleaned up
}

// ✅ Use DisposalScope
for (let i = 0; i < 1000; i++) {
  using scope = new DisposalScope();
  const b = scope.register(box(1, 1, 1, { at: [i, 0, 0] }));
  // Do something with b
  // Automatically cleaned up at loop iteration end
}
```

### 2. Storing Raw Kernel Objects

```typescript
// ❌ Raw objects may be garbage collected
const rawShape = operation.Shape();

// ✅ Wrap in branded handle
const shape = castShape(operation.Shape());
```

### 3. Unnecessary Cloning

```typescript
// ❌ Unnecessary clone
const cloned = clone(shape);
const result = translate(cloned, [10, 0, 0]);

// ✅ Transform functions return new shapes
const result = translate(shape, [10, 0, 0]);
// Original shape is unchanged, result is new
```
