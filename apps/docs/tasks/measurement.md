---
title: Measurement
description: 'Volume, area, length, distance, bounding box, centroid, principal axes: every measurement you can ask of a brepjs shape.'
---

# Measurement

Measurement functions return `Result<number>`. Null shapes and other inputs that prevent measurement surface as `BrepError` rather than throwing. For valid inputs, `unwrap()` extracts the number; in production code prefer `isOk()` / `match()`. You ask "what is the volume of this thing?" and you get a `Result`. This chapter is short because the API is small.

## The four core measurements

```typescript
import {
  box,
  cylinder,
  sketchCircle,
  edgeFinder,
  measureVolume,
  measureArea,
  measureLength,
  unwrap,
} from 'brepjs/quick';

const b = box(10, 10, 10);
const cyl = cylinder(5, 20);

console.log('Box volume:', unwrap(measureVolume(b))); // 1000
console.log('Cylinder volume:', unwrap(measureVolume(cyl)).toFixed(3)); // 1570.796
console.log('Box area:', unwrap(measureArea(b))); // 600
console.log('Cylinder area:', unwrap(measureArea(cyl)).toFixed(3)); // 785.398

// Edge length
const cylinder2 = sketchCircle(10).extrude(20);
const circularEdge = edgeFinder().ofCurveType('CIRCLE').findAll(cylinder2)[0];
if (circularEdge) {
  console.log('Edge length:', unwrap(measureLength(circularEdge)).toFixed(3)); // 62.832
}

export default cylinder2;
```

| Function               | Argument            | Returns                                              |
| ---------------------- | ------------------- | ---------------------------------------------------- |
| `measureVolume(shape)` | `Shape3D`           | `Result<number>`: total volume in cubic units        |
| `measureArea(shape)`   | `Shape3D` or `Face` | `Result<number>`: total surface area in square units |
| `measureLength(edge)`  | `Edge` or `Wire`    | `Result<number>`: length along the curve             |

These are the workhorses. The fluent wrapper exposes them as methods: `shape(s).volume()`, `shape(s).area()`.

## Bounding box

The axis-aligned bounding box of a shape:

```typescript
import { box, getBounds } from 'brepjs/quick';

const b = box(30, 20, 10, { at: [5, 5, 5] }); // `at` is the box centre
const bbox = getBounds(b);
console.log('Min:', [bbox.xMin, bbox.yMin, bbox.zMin]); // [-10, -5, 0]
console.log('Max:', [bbox.xMax, bbox.yMax, bbox.zMax]); // [20, 15, 10]
console.log('Size:', [bbox.xMax - bbox.xMin, bbox.yMax - bbox.yMin, bbox.zMax - bbox.zMin]); // [30, 20, 10]

export default b;
```

`getBounds` returns `{ xMin, xMax, yMin, yMax, zMin, zMax }`. The bounding box is in world coordinates and updates after every transform. Useful for layout and packing.

## Centre of mass

```typescript
import { box, cylinder, fuse, measureVolumeProps, unwrap } from 'brepjs/quick';

const compound = unwrap(fuse(box(20, 20, 20), cylinder(5, 30, { at: [10, 10, 0] })));
const com = unwrap(measureVolumeProps(compound)).centerOfMass;
console.log(
  'Centre of mass:',
  com.map((c) => c.toFixed(3))
);

export default compound;
```

Returns `[x, y, z]`. Computed via the kernel's mass-property analysis assuming uniform density.

## Distance and projection

The closest point between two shapes:

```typescript
import { box, sphere, measureDistanceProps, unwrap } from 'brepjs/quick';

const a = box(10, 10, 10);
const b = sphere(3, { at: [50, 0, 0] });

const result = unwrap(measureDistanceProps(a, b));
console.log('Distance:', result.distance.toFixed(3)); // 37
console.log('Closest on A:', result.point1);
console.log('Closest on B:', result.point2);
```

Returns `{ distance, point1, point2 }`. The points are the closest pair. On the default occt-wasm kernel they are sampled from a tessellation, so they are approximate while `distance` stays exact. `measureDistance(a, b)` returns just the number.

The distance is never negative: touching or overlapping shapes report `0`. For overlap detection use `checkInterference(a, b)`, whose `hasInterference` is true when the distance is within a tolerance.

## Projecting a point onto a surface

```typescript
import { sketchCircle, faceFinder, projectPointOnFace, unwrap } from 'brepjs/quick';

const cyl = sketchCircle(10).extrude(20);
const sideFace = faceFinder().ofSurfaceType('CYLINDRE').findAll(cyl)[0];
if (sideFace) {
  const proj = unwrap(projectPointOnFace(sideFace, [15, 0, 5]));
  console.log('Projected to:', proj.point); // [10, 0, 5]
  console.log('Distance:', proj.distance); // 5
}
```

Useful for placing features (logos, fasteners) at a specific position on a curved surface.

## Surface curvature

```typescript
import { sketchCircle, faceFinder, measureCurvatureAtMid, unwrap } from 'brepjs/quick';

const cyl = sketchCircle(10).extrude(20);
const side = faceFinder().ofSurfaceType('CYLINDRE').findAll(cyl)[0];
if (side) {
  const c = unwrap(measureCurvatureAtMid(side)); // centre of the face's UV range
  console.log('Min curvature:', c.minCurvature); // 0 (along axis)
  console.log('Max curvature:', c.maxCurvature); // 0.1 = 1/r (around)
  console.log('Gaussian:', c.gaussian); // 0
  console.log('Mean:', c.mean); // 0.05
}
```

Returns principal curvatures (with their directions), Gaussian, and mean. `measureCurvatureAt(face, u, v)` evaluates at explicit parameters in the face's own UV domain. Useful for detecting flat regions (curvature ~0) or sharp regions (high max).

## Counts

```typescript
import { box, vertexFinder, edgeFinder, faceFinder } from 'brepjs/quick';

const b = box(20, 20, 20);
console.log({
  vertices: vertexFinder().findAll(b).length, // 8
  edges: edgeFinder().findAll(b).length, // 12
  faces: faceFinder().findAll(b).length, // 6
});
```

For a quick "how complex is this shape" check, count entities at each level. A simple part has tens of edges; a heavily-filleted assembly has thousands.

## Performance notes

- Volume and area are cheap (kernel mass-properties query).
- Distance between two shapes can be expensive, proportional to face counts. For repeated distance queries, build a spatial index (`flatbush` is included as a dependency) over your shapes' bounding boxes.
- Curvature queries are constant-time at a single parameter, but evaluating a dense grid of points is naive; there's no built-in batched API.

## Common patterns

### Volume check after a boolean

```typescript
import { box, cylinder, cut, measureVolume, isOk, unwrap } from 'brepjs/quick';

const block = box(20, 20, 20);
const hole = cylinder(5, 25);
const result = cut(block, hole);

if (isOk(result)) {
  const before = unwrap(measureVolume(block));
  const after = unwrap(measureVolume(result.value));
  const removed = before - after;
  console.log(`Cut removed ${removed.toFixed(2)} mm³`);
}

export default isOk(result) ? result.value : block;
```

Sanity-check that booleans actually changed the volume by the expected amount.

### Tightest fit packing

For a layout tool, you need bounding boxes:

```typescript
import { box, getBounds } from 'brepjs/quick';

const parts = [box(10, 20, 5), box(15, 10, 5), box(25, 15, 5)];
const bboxes = parts.map((p) => getBounds(p));
const totalWidth = bboxes.reduce((sum, bb) => sum + (bb.xMax - bb.xMin), 0);
console.log('Total width if linear-packed:', totalWidth);
```

### Mass with non-unit density

The kernel computes everything assuming density 1. Multiply at the end:

```typescript
import { box, measureVolume, unwrap } from 'brepjs/quick';

const part = box(30, 20, 10);
const volumeMm3 = unwrap(measureVolume(part));
const volumeCm3 = volumeMm3 / 1000;
const aluminiumDensity = 2.7; // g/cm³
const massGrams = volumeCm3 * aluminiumDensity;
console.log(`Mass: ${massGrams.toFixed(2)} g`);
```

## Next steps

- [Finders & Queries](./finders): selecting specific entities to measure
- [Import & Export](./import-export): measuring shapes you imported from STEP
- [The Topology Hierarchy](../concepts/topology): what each shape kind contributes to area / volume
