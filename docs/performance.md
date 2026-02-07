# Performance Guide

Best practices for achieving optimal performance with brepjs.

## Memory Management

### Use gcWithScope for Scoped Cleanup

The `gcWithScope` function provides automatic cleanup of OCCT objects within a scope:

```typescript
import { gcWithScope, makeBox, fuseShapes } from 'brepjs';

function buildComplexShape() {
  const r = gcWithScope();

  // Intermediate shapes are automatically cleaned up
  const box1 = r(makeBox([0, 0, 0], [10, 10, 10]));
  const box2 = r(makeBox([5, 0, 0], [15, 10, 10]));

  // Return the result — it escapes the scope
  return fuseShapes(box1, box2);
}
```

**Key patterns:**

- Wrap intermediate OCCT objects with `r()` to register them for cleanup
- Objects returned from the function escape the scope and remain valid
- Cleanup happens automatically when the scope exits

### Avoid Manual delete() Calls

Modern brepjs uses `Symbol.dispose` and `FinalizationRegistry` for memory management. Prefer scoped cleanup over manual `delete()` calls:

```typescript
// ❌ Old pattern — error-prone
const box = makeBox([10, 10, 10]);
try {
  doSomething(box);
} finally {
  box.delete();
}

// ✅ Modern pattern — automatic cleanup (requires TypeScript 5.9+)
using box = makeBox([10, 10, 10]);
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
  result = fuseShapes(result, shape);
}

// ✅ Fast — single N-way operation
const result = fuseAll(shapes);
```

The native N-way operations use `BRepAlgoAPI_BuilderAlgo` which is significantly faster than pairwise operations.

### Glue Optimization

When fusing shapes that share faces, use the `optimisation` option:

```typescript
// Adjacent boxes sharing a face
const result = fuseShapes(box1, box2, {
  optimisation: 'commonFace', // or 'sameFace' for identical faces
});
```

- `commonFace`: Shapes share overlapping faces
- `sameFace`: Shapes share geometrically identical faces

## Meshing

### Cache Configuration

brepjs caches mesh results for shapes. The cache is keyed by shape hash and mesh options.

```typescript
import { meshShape, clearMeshCache } from 'brepjs';

// First call computes the mesh
const mesh1 = meshShape(shape, { tolerance: 0.1 });

// Second call returns cached result
const mesh2 = meshShape(shape, { tolerance: 0.1 });

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
  const box = makeBox([i, 0, 0], [i + 1, 1, 1]);
  // box is never cleaned up
}

// ✅ Use gcWithScope
for (let i = 0; i < 1000; i++) {
  const r = gcWithScope();
  const box = r(makeBox([i, 0, 0], [i + 1, 1, 1]));
  // Do something with box
  // Automatically cleaned up at loop iteration end
}
```

### 2. Storing Raw OCCT Objects

```typescript
// ❌ Raw objects may be garbage collected
const rawShape = operation.Shape();

// ✅ Wrap in branded handle
const shape = castShape(operation.Shape());
```

### 3. Unnecessary Cloning

```typescript
// ❌ Unnecessary clone
const cloned = cloneShape(shape);
const result = translateShape(cloned, [10, 0, 0]);

// ✅ Transform functions return new shapes
const result = translateShape(shape, [10, 0, 0]);
// Original shape is unchanged, result is new
```
