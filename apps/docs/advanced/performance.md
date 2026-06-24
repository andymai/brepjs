---
title: Performance
description: "What's cheap and what's expensive in brepjs. Batching booleans, caching meshes, avoiding redundant healing, profiling slow operations."
---

# Performance

brepjs operations are bounded by the kernel: booleans on small primitives are microseconds, booleans on heavily-filleted assemblies are seconds. Most of the time you don't think about performance because the cost of one operation is in the noise. When you do hit a wall, this chapter covers what's typically slow and what's typically cheap, and what to do about it.

## What's cheap

| Operation                                       | Typical cost |
| ----------------------------------------------- | ------------ |
| Primitive construction (`box`, `cylinder`)      | < 1 ms       |
| Translate, rotate, scale                        | < 1 ms       |
| Simple boolean (box-on-box)                     | 1–5 ms       |
| Measure (`measureVolume`, `measureArea`)        | < 1 ms       |
| Bounding box                                    | < 1 ms       |
| Finder (`edgeFinder().findAll`) on simple shape | < 5 ms       |

For most parametric parts these never matter.

## What's expensive

| Operation                                         | Typical cost             |
| ------------------------------------------------- | ------------------------ |
| Boolean on heavily-filleted shapes                | 10–500 ms                |
| Fillet on a complex curved surface                | 10–200 ms                |
| Loft / sweep on a long path                       | 10–500 ms                |
| Healing / sewing imported STEP                    | 100 ms – several seconds |
| Meshing a high-face-count shape at fine tolerance | seconds                  |
| `distanceTo` between two complex shapes           | 10–100 ms                |

These are the costs to optimize around.

## Avoiding repeated meshing

Meshing is by far the largest "I didn't realize this would cost that much" item. If your app re-meshes the same shape on every render, you're paying that tax repeatedly. Cache the mesh:

```typescript
import { shape, box, type Shape3D } from 'brepjs/quick';

const meshCache = new WeakMap<Shape3D, ReturnType<ReturnType<typeof shape<Shape3D>>['mesh']>>();

function meshOnce(s: Shape3D, tolerance = 0.1) {
  const cached = meshCache.get(s);
  if (cached) return cached;
  const m = shape(s).mesh({ tolerance });
  meshCache.set(s, m);
  return m;
}

const part = box(20, 20, 20);
const m1 = meshOnce(part);
const m2 = meshOnce(part); // cache hit
console.log('Same triangle count:', m1.indices.length === m2.indices.length);
```

`WeakMap` keyed by the shape handle works because every brepjs shape is a JS object. The cache evicts when the handle is GC'd.

## Batching booleans

Three sequential booleans cost more than one `cutAll`:

```typescript
import { box, cylinder, cut, cutAll, unwrap } from 'brepjs/quick';

const block = box(40, 40, 10);
const tools = [
  cylinder(2, 12, { at: [10, 10, -1] }),
  cylinder(2, 12, { at: [30, 10, -1] }),
  cylinder(2, 12, { at: [10, 30, -1] }),
];

// Slow: 3 separate kernel invocations + 2 intermediate shapes
let drilled1: import('brepjs').Shape3D = block;
for (const tool of tools) drilled1 = unwrap(cut(drilled1, tool));

// Fast: 1 kernel invocation
const drilled2 = unwrap(cutAll(block, tools));
void drilled2;
```

Same applies to `fuseAll` vs. chained `fuse` and `intersectAll` vs. chained `intersect`.

## Avoiding the kernel altogether

For specific queries you don't always need the kernel. Bounding boxes are cheap and conservative; use them as filters before expensive operations:

```typescript
import { box, getBoundingBox, distanceTo, type Shape3D } from 'brepjs/quick';

declare const candidates: Shape3D[];
declare const target: Shape3D;
const targetBbox = getBoundingBox(target);

// Quick reject: candidates whose bounding boxes don't even overlap.
const close = candidates.filter((c) => {
  const b = getBoundingBox(c);
  return !(
    b.max[0] < targetBbox.min[0] ||
    b.min[0] > targetBbox.max[0] ||
    b.max[1] < targetBbox.min[1] ||
    b.min[1] > targetBbox.max[1] ||
    b.max[2] < targetBbox.min[2] ||
    b.min[2] > targetBbox.max[2]
  );
});

// Then expensive distance check only on survivors
for (const c of close) {
  const d = distanceTo(c, target);
  void d;
}
void box(1, 1, 1); // dummy keep import
```

For more sophisticated spatial queries, brepjs ships `flatbush` (an in-memory R-tree). Build it over your shapes' bounding boxes once, query in O(log n).

## Reusing intermediates

When you build several variants of the same part, share the common base:

```typescript
import { box, cylinder, cut, unwrap } from 'brepjs/quick';

const base = box(40, 40, 10); // expensive to build? Don't rebuild.

const variantA = unwrap(cut(base, cylinder(5, 12, { at: [10, 10, -1] })));
const variantB = unwrap(cut(base, cylinder(5, 12, { at: [30, 30, -1] })));
const variantC = unwrap(cut(base, cylinder(5, 12, { at: [20, 20, -1] })));

console.log('Built three variants from one base');
void variantA;
void variantB;
void variantC;
```

The kernel doesn't share state between cuts (each is a full operation) but you only built the base once.

## Workers

For UI-heavy apps that mustn't drop frames, run brepjs in a worker. The chapter on [Web Workers](./workers) covers the protocol; the short version: `brepjs/worker` ships a typed RPC that posts shape descriptions to a worker, runs the operations, and returns the resulting mesh data. The main thread stays unblocked.

This is how gridfinity-layout-tool runs hundreds of generation operations without freezing the UI.

## Mesh tolerance is a knob

The `tolerance` argument to `mesh()`, `exportSTL`, and `exportGltf` is a direct cost knob:

```typescript
import { shape, box } from 'brepjs/quick';

const b = box(20, 20, 20);

// Fast, low-detail
const coarse = shape(b).mesh({ tolerance: 1 });

// Slow, high-detail
const fine = shape(b).mesh({ tolerance: 0.01 });

console.log('Coarse triangles:', coarse.indices.length / 3);
console.log('Fine triangles:', fine.indices.length / 3);
```

Halving the tolerance roughly quadruples the triangle count. For screen rendering at typical sizes, `tolerance: 0.1` is fine. For 3D printing, set to ~0.05–0.1 mm. For close-up zoom, set lower. Profile the actual render cost before going below 0.01.

## Level of detail (LOD)

Meshing is a pure function of tolerance, so you can mesh one shape at several tolerances and let the renderer pick by camera distance. `meshLODs` builds that ladder for you, with **scale-relative** tolerances derived from the bounding-box diagonal, so the same call gives sensible detail whether the part is millimetres or metres:

```typescript
import { box, meshLODs, toLODGeometryLevels } from 'brepjs/quick';

const part = box(40, 40, 40);

// Three levels, coarse -> fine. Tolerances are a fraction of the bounding-box
// diagonal, so this works at any scale; each level is cached independently.
const lods = meshLODs(part, { levels: 3 });
console.log(lods.map((l) => `${l.tolerance.toFixed(3)} / ${l.mesh.triangles.length / 3} tris`));

// Wire into THREE.LOD: one { geometry, distance } per level, finest at distance 0.
const levels = toLODGeometryLevels(lods);
console.log('LOD levels:', levels.length);
```

Pass `tolerances: [...]` for absolute control, or tune `relativeTolerance` (finest level as a fraction of the diagonal) and `spacing` (ratio between levels). For just two tiers — preview + export — the older `meshMultiLOD` / `toLODGeometryData` pair still works.

### Progressive refinement

`meshLODsProgressive` delivers the levels over time instead of all at once: the coarse mesh lands first (an instant first frame), and finer levels arrive on later ticks via `onLevel`, so the UI stays responsive. An `AbortSignal` stops refinement when the shape changes.

```typescript
import { box, meshLODsProgressive } from 'brepjs/quick';

const part = box(40, 40, 40);
const ac = new AbortController();

await meshLODsProgressive(part, {
  levels: 3,
  signal: ac.signal,
  onLevel: (level) => console.log('LOD ready:', level.mesh.triangles.length / 3, 'tris'),
});
```

By default each level is meshed synchronously on the calling thread. To refine truly off the main thread, pass a `meshLevel` that serializes the shape with `toBREP` and meshes it on a worker (see [Web Workers](./workers)): the library owns the coarse-first scheduling and cancellation, you own where the meshing runs.

## Knobs you do not have

These are optimizations from real-time mesh engines that B-Rep meshing doesn't do for you:

- **Automatic, kernel-side LOD selection**: brepjs gives you `meshLODs` and `meshLODsProgressive` (above), but the kernel meshes one tolerance per call — there's no behind-the-scenes detail switching the renderer didn't ask for.
- **Spatial partitioning of the kernel state**: the kernel sees one shape at a time. There's no octree behind the scenes — build spatial indices on brepjs's bounding boxes (`flatbush`, above) instead.
- **Streaming booleans**: operations are atomic. You can't progressively refine a boolean — you mesh the finished result at whatever tolerance you choose.

## Profiling

In Chrome / Edge, the Performance tab + brepjs's `console.time` markers identifies hot operations. For finer-grained:

```typescript
import { box, cylinder, cut, fillet, edgeFinder, unwrap } from 'brepjs/quick';

console.time('cut');
const drilled = unwrap(cut(box(20, 20, 20), cylinder(5, 25)));
console.timeEnd('cut');

console.time('fillet');
const filleted = unwrap(fillet(drilled, edgeFinder().inDirection('Z').findAll(drilled), 1));
console.timeEnd('fillet');
void filleted;
```

For sub-operation cost (which face is the slow one in a multi-face fillet, say) you'd need to break the operation up; there's no kernel-side per-face profiling exposed.

## Bench results

The brepjs repo runs benchmarks against both kernels (OpenCascade and brepkit) on every release. Latest results: `benchmarks/results/latest.md` in the repo. Use this for "is brepkit ready for my workload yet?". Generally brepkit wins on simple operations, OpenCascade wins on complex healing and STEP IO.

## Next steps

- [Web Workers](./workers): isolating brepjs from the main thread
- [Memory Management](./memory): leaks compound and slow your app down
- [Healing & Sewing](./healing): the often-slowest operation, when imports require it
