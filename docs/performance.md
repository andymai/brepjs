# Performance Guide

> **This page has moved.** The maintained Performance chapter now lives at **[brepjs.dev/advanced/performance](https://brepjs.dev/advanced/performance)** — it covers instancing, the worker pool, LOD meshing, placement-invariant moves, and the content-addressed mesh cache that this older page predates. This copy is kept for inbound-link compatibility.

For WASM memory cleanup patterns, see [Memory Management](./memory-management.md).

## Boolean Operations

### Batch Operations

Use batch boolean operations instead of sequential pairwise operations:

```typescript
import { fuseAll, cutAll } from 'brepjs';

// ❌ Slow - O(n) operations
let result = shapes[0];
for (const shape of shapes.slice(1)) {
  result = fuse(result, shape);
}

// ✅ Fast - single N-way operation
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
// ✅ Efficient - single iteration with combined filters
const faces = faceFinder()
  .parallelTo('Z')
  .ofSurfaceType('PLANE')
  .find(shape);

// ❌ Less efficient - multiple separate queries
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

## Avoid Unnecessary Cloning

```typescript
// ❌ Unnecessary clone
const cloned = clone(shape);
const result = translate(cloned, [10, 0, 0]);

// ✅ Transform functions return new shapes
const result = translate(shape, [10, 0, 0]);
// Original shape is unchanged, result is new
```
