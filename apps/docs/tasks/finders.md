---
title: Finders & Queries
description: 'edgeFinder, faceFinder, wireFinder, vertexFinder: composable filters that pick exactly the topology your next operation needs.'
---

# Finders & Queries

You build a part, then you need to do something to a specific feature: round the vertical edges, shell the top face, find the corner where two boolean operations met. Finders are how you select features. They are filters that compose: you start with "all edges of this shape" and narrow down by direction, length, curve type, position, or any combination.

## The four finders

```typescript
import { box, vertexFinder, edgeFinder, wireFinder, faceFinder } from 'brepjs/quick';

const b = box(20, 20, 20);

const vertices = vertexFinder().findAll(b); // 8
const edges = edgeFinder().findAll(b); // 12
const wires = wireFinder().findAll(b); // 6 (one outer wire per face)
const faces = faceFinder().findAll(b); // 6

console.log({
  vertices: vertices.length,
  edges: edges.length,
  wires: wires.length,
  faces: faces.length,
});
```

`findAll` returns an array. `find` returns the first match (or `undefined`). Filters chain; every call narrows the result.

## Filter vocabulary

The full filter set, abbreviated. See the [API Reference](https://andymai.github.io/brepjs/) for exhaustive signatures.

### Direction filters

```typescript
import { box, edgeFinder, faceFinder } from 'brepjs/quick';

const b = box(30, 20, 10);

edgeFinder().inDirection('Z').findAll(b); // edges parallel to Z
edgeFinder().inDirection([1, 1, 0]).findAll(b); // edges along (1,1,0), none in a box
faceFinder().inDirection('Z').findAll(b); // top + bottom faces
faceFinder().inDirection([0, 0, -1]).findAll(b); // bottom face only (negative Z normal)
```

For edges, "direction" means the edge's tangent at any point (lines have a constant tangent; curves don't). For faces, it's the normal at the face's centre.

`'Z'` matches both `[0, 0, 1]` and `[0, 0, -1]` (axis ignoring sign). For a specific orientation, pass the explicit vector.

### Position filters

```typescript
import { box, edgeFinder, faceFinder } from 'brepjs/quick';

const b = box(30, 20, 10);

faceFinder().withZ({ min: 9.9 }).findAll(b); // top face
faceFinder().withZ({ min: 9.9, max: 10.1 }).findAll(b); // top face only
edgeFinder().withCenterX({ min: 14, max: 16 }).findAll(b); // edges crossing x=15
```

Position filters apply to the centre of an edge or face. `withX` / `withY` / `withZ` take `{ min, max }` ranges (either bound is optional).

For more precise queries, `withCenterAt({ x, y, z, tolerance })` matches a specific point.

### Length / area filters

```typescript
import { box, sketchCircle, edgeFinder, faceFinder } from 'brepjs/quick';

const b = box(30, 20, 10);

edgeFinder().withLength({ min: 25 }).findAll(b); // edges >= 25mm
faceFinder().withArea({ min: 100, max: 700 }).findAll(b); // mid-sized faces

const cyl = sketchCircle(10).extrude(20);
edgeFinder().ofCurveType('CIRCLE').findAll(cyl); // the circular edges
```

`withLength` and `withArea` each take `{ min, max }`.

### Type filters

```typescript
import { sketchCircle, faceFinder, edgeFinder } from 'brepjs/quick';

const cyl = sketchCircle(10).extrude(20);

faceFinder().ofSurfaceType('PLANE').findAll(cyl); // 2 (top, bottom)
faceFinder().ofSurfaceType('CYLINDER').findAll(cyl); // 1 (side)

edgeFinder().ofCurveType('LINE').findAll(cyl); // 0, sketchCircle has no straight edges
edgeFinder().ofCurveType('CIRCLE').findAll(cyl); // 2
```

Surface types: `PLANE`, `CYLINDER`, `CONE`, `SPHERE`, `TORUS`, `BSPLINE_SURFACE`, `OFFSET_SURFACE`, `EXTRUSION`, `REVOLUTION`.

Curve types: `LINE`, `CIRCLE`, `ELLIPSE`, `BEZIER`, `BSPLINE`, `OFFSET`.

### Wire filters

```typescript
import { box, faceFinder, wireFinder } from 'brepjs/quick';

const b = box(30, 20, 10);
const oneFace = faceFinder().findAll(b)[0];

if (oneFace) {
  wireFinder().isClosed().findAll(oneFace); // outer + inner closed loops
  wireFinder().isOuter().findAll(oneFace); // just the outer boundary
}
```

### Vertex filters

```typescript
import { box, vertexFinder } from 'brepjs/quick';

const b = box(30, 20, 10);

vertexFinder().withZ({ min: 9.9 }).findAll(b); // top 4 corners
vertexFinder().withCenterAt({ x: 30, y: 20, z: 10 }).findAll(b); // one corner
```

## Composing filters

Every filter call narrows. Chain freely:

```typescript
import { box, edgeFinder } from 'brepjs/quick';

const b = box(30, 20, 10);

const topVerticals = edgeFinder()
  .inDirection('Z')
  .withZ({ min: 5 }) // edges whose centre is in the upper half
  .withLength({ min: 9 })
  .findAll(b);

console.log('Found', topVerticals.length, 'edges'); // 4 vertical edges
```

Order doesn't matter for correctness (filters are additive) but for performance, put the most-selective filter first if you have many candidates.

## With the fluent wrapper

The wrapper takes a finder callback, so you don't have to materialize the array yourself:

```typescript
import { shape, box } from 'brepjs/quick';

const filleted = shape(box(30, 20, 10)).fillet(
  (e) => e.inDirection('Z').withLength({ min: 9 }),
  1.5
).val;

export default filleted;
```

The callback receives an `EdgeFinder` (for `.fillet`, `.chamfer`) or `FaceFinder` (for `.shell`). You chain filters; the wrapper calls `findAll` internally.

## Common patterns

### "All edges except the inner hole"

When you want everything _but_ the holes you just cut:

```typescript
import { box, cylinder, cut, edgeFinder, fillet, unwrap } from 'brepjs/quick';

const drilled = unwrap(cut(box(30, 20, 10), cylinder(5, 12, { at: [15, 10, -1] })));

// Vertical edges include the hole's edges. Filter by length to exclude them.
const externalVerticals = edgeFinder()
  .inDirection('Z')
  .withLength({ min: 9.5 }) // hole edges are 12mm but the box edges are 10mm, adjust filter
  .findAll(drilled);
const filleted = unwrap(fillet(drilled, externalVerticals, 1));

export default filleted;
```

In practice, hole edges and exterior edges have different positions, lengths, or curve types. Find a filter that distinguishes them.

### "Just the rim of this part"

The top _circular_ edge of a cylindrical shell:

```typescript
import { sketchCircle, edgeFinder, fillet, unwrap } from 'brepjs/quick';

const cup = sketchCircle(20).extrude(40);
const rim = edgeFinder().ofCurveType('CIRCLE').withZ({ min: 39 }).findAll(cup);

const rounded = unwrap(fillet(cup, rim, 2));

export default rounded;
```

Two filters: circular curves only, in the upper millimetre. One match.

### "The face that came from this sketch"

When you've fused parts together, finding "the face I just added" is harder. Heuristics:

```typescript
import { box, sketchCircle, fuse, faceFinder, unwrap } from 'brepjs/quick';

const base = box(40, 40, 5);
const boss = sketchCircle(8).extrude(10).translate([20, 20, 5]);
const part = unwrap(fuse(base, boss));

// "The cylindrical face": easy
const bossSide = faceFinder().ofSurfaceType('CYLINDER').findAll(part)[0];
console.log('Found boss cylindrical face');
void bossSide;

export default part;
```

Surface type, area range, and direction together usually pin down a specific face. When they aren't enough, project face centres back to your input geometry to identify them.

## What finders don't do

- They don't index by any kind of stable ID. Edge handles are bound to the shape they were found on; after an operation transforms the shape, the handles are stale.
- They don't traverse compounds across kernel boundaries; finders look at one shape at a time.
- They are not topology-aware in the sense of "edges connected to face X"; for that, use `edgesOfFace(face)` from `brepjs/topology`.

## Edges have direction; finders sometimes don't care

`inDirection('Z')` matches edges parallel to Z, in either direction. If you need edges going specifically `[0, 0, +1]` (e.g. for face-orientation logic), pass the explicit vector.

## Next steps

- [Fillets & Chamfers](./fillets): the operation finders are most often used for
- [Measurement](./measurement): measuring the entities you found
- [The Topology Hierarchy](../concepts/topology): what each finder operates on
