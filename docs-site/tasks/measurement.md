---
title: Measurement
---

# Measurement

Measurement functions return plain numbers. They never throw on valid shapes, never return `Result`, never need to be unwrapped. You ask "what is the volume of this thing?" and you get a number. This chapter is short because the API is small.

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
} from 'brepjs/quick';

const b = box(10, 10, 10);
const cyl = cylinder(5, 20);

console.log('Box volume:', measureVolume(b)); // 1000
console.log('Cylinder volume:', measureVolume(cyl).toFixed(3)); // 1570.796
console.log('Box area:', measureArea(b)); // 600
console.log('Cylinder area:', measureArea(cyl).toFixed(3)); // 785.398

// Edge length
const cylinder2 = sketchCircle(10).extrude(20);
const circularEdge = edgeFinder().ofCurveType('CIRCLE').findAll(cylinder2)[0];
if (circularEdge) {
  console.log('Edge length:', measureLength(circularEdge).toFixed(3)); // 62.832
}

export default cylinder2;
```

| Function               | Argument            | Returns                            |
| ---------------------- | ------------------- | ---------------------------------- |
| `measureVolume(shape)` | `Shape3D`           | total volume in cubic units        |
| `measureArea(shape)`   | `Shape3D` or `Face` | total surface area in square units |
| `measureLength(edge)`  | `Edge` or `Wire`    | length along the curve             |

These are the workhorses. The fluent wrapper exposes them as methods: `shape(s).volume()`, `shape(s).area()`.

## Bounding box

The axis-aligned bounding box of a shape:

```typescript
import { box, getBoundingBox } from 'brepjs/quick';

const b = box(30, 20, 10, { at: [5, 5, 5] });
const bbox = getBoundingBox(b);
console.log('Min:', bbox.min); // [5, 5, 5]
console.log('Max:', bbox.max); // [35, 25, 15]
console.log('Centre:', bbox.center); // [20, 15, 10]
console.log('Size:', bbox.size); // [30, 20, 10]

export default b;
```

The bounding box is in world coordinates and updates after every transform. Useful for layout and packing.

## Centre of mass

```typescript
import { box, cylinder, fuse, getCenterOfMass, unwrap } from 'brepjs/quick';

const compound = unwrap(fuse(box(20, 20, 20), cylinder(5, 30, { at: [10, 10, 0] })));
const com = getCenterOfMass(compound);
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
import { box, sphere, distanceTo } from 'brepjs/quick';

const a = box(10, 10, 10);
const b = sphere(3, { at: [50, 0, 0] });

const result = distanceTo(a, b);
console.log('Distance:', result.distance.toFixed(3)); // ~36
console.log('Closest on A:', result.pointOnA);
console.log('Closest on B:', result.pointOnB);
```

Returns `{ distance, pointOnA, pointOnB }`. The points are the closest pair; the distance is `|pointOnA - pointOnB|`.

A negative distance (or zero) means the shapes overlap. For exact overlap detection use `distanceTo(a, b).distance <= 0`.

## Projecting a point onto a surface

```typescript
import { sketchCircle, faceFinder, projectPointToFace } from 'brepjs/quick';

const cyl = sketchCircle(10).extrude(20);
const sideFace = faceFinder().ofSurfaceType('CYLINDER').findAll(cyl)[0];
if (sideFace) {
  const proj = projectPointToFace(sideFace, [15, 0, 5]);
  console.log('Projected to:', proj.point); // [10, 0, 5]
  console.log('Distance:', proj.distance); // 5
}
```

Useful for placing features (logos, fasteners) at a specific position on a curved surface.

## Curvature

```typescript
import { sketchCircle, edgeFinder, curveCurvatureAt } from 'brepjs/quick';

const cyl = sketchCircle(10).extrude(20);
const circ = edgeFinder().ofCurveType('CIRCLE').findAll(cyl)[0];
if (circ) {
  const k = curveCurvatureAt(circ, 0.5); // mid-point of the edge
  console.log('Curvature:', k.value); // 0.1 = 1/radius
}
```

For circles, curvature is `1/r`. For straight edges, `0`. For B-splines, varies along the edge.

## Surface curvature

```typescript
import { sketchCircle, faceFinder, faceCurvatureAt } from 'brepjs/quick';

const cyl = sketchCircle(10).extrude(20);
const side = faceFinder().ofSurfaceType('CYLINDER').findAll(cyl)[0];
if (side) {
  const c = faceCurvatureAt(side, 0.5, 0.5); // u, v parameters in [0,1]
  console.log('Min curvature:', c.minCurvature); // 0 (along axis)
  console.log('Max curvature:', c.maxCurvature); // 0.1 = 1/r (around)
  console.log('Gaussian:', c.gaussian); // 0
  console.log('Mean:', c.mean); // 0.05
}
```

Returns principal curvatures, Gaussian, and mean. Useful for detecting flat regions (curvature ~0) or sharp regions (high max).

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
- Distance between two shapes can be expensive — proportional to face counts. For repeated distance queries, build a spatial index (`flatbush` is included as a dependency) over your shapes' bounding boxes.
- Curvature queries are constant-time at a single parameter, but evaluating a dense grid of points is naive — there's no built-in batched API.

## Common patterns

### Volume check after a boolean

```typescript
import { box, cylinder, cut, measureVolume, isOk } from 'brepjs/quick';

const block = box(20, 20, 20);
const hole = cylinder(5, 25);
const result = cut(block, hole);

if (isOk(result)) {
  const before = measureVolume(block);
  const after = measureVolume(result.value);
  const removed = before - after;
  console.log(`Cut removed ${removed.toFixed(2)} mm³`);
}

export default isOk(result) ? result.value : block;
```

Sanity-check that booleans actually changed the volume by the expected amount.

### Tightest fit packing

For a layout tool, you need bounding boxes:

```typescript
import { box, getBoundingBox } from 'brepjs/quick';

const parts = [box(10, 20, 5), box(15, 10, 5), box(25, 15, 5)];
const bboxes = parts.map(getBoundingBox);
const totalWidth = bboxes.reduce((sum, bb) => sum + bb.size[0], 0);
console.log('Total width if linear-packed:', totalWidth);
```

### Mass with non-unit density

The kernel computes everything assuming density 1. Multiply at the end:

```typescript
import { box, measureVolume } from 'brepjs/quick';

const part = box(30, 20, 10);
const volumeMm3 = measureVolume(part);
const volumeCm3 = volumeMm3 / 1000;
const aluminiumDensity = 2.7; // g/cm³
const massGrams = volumeCm3 * aluminiumDensity;
console.log(`Mass: ${massGrams.toFixed(2)} g`);
```

## Next steps

- [Finders & Queries](./finders) — selecting specific entities to measure
- [Import & Export](./import-export) — measuring shapes you imported from STEP
- [The Topology Hierarchy](../concepts/topology) — what each shape kind contributes to area / volume
