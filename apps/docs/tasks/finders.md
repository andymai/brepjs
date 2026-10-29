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

`findAll` returns an array. `findUnique` returns a `Result` holding the single match, or an error when zero or several elements match. Filters chain; every call narrows the result.

## Filter vocabulary

The full filter set, abbreviated. See the [API Reference](https://andymai.github.io/brepjs/) for exhaustive signatures.

### Direction filters

```typescript
import { box, edgeFinder, faceFinder, normalAt } from 'brepjs/quick';

const b = box(30, 20, 10);

edgeFinder().inDirection('Z').findAll(b); // edges parallel to Z
edgeFinder().inDirection([1, 1, 0]).findAll(b); // edges along (1,1,0), none in a box
faceFinder().inDirection('Z').findAll(b); // top + bottom faces
faceFinder()
  .when((f) => normalAt(f)[2] < 0)
  .findAll(b); // bottom face only (negative Z normal)
```

For edges, "direction" means the edge's tangent at its midpoint (lines have a constant tangent; curves don't). For faces, it's the normal at the face's centre.

`inDirection` ignores sign: `'Z'` and `[0, 0, -1]` both match `[0, 0, 1]` and `[0, 0, -1]`. For a specific orientation, test the normal in a `.when()` predicate as above.

### Position filters

```typescript
import { box, edgeFinder, faceFinder, faceCenter, getBounds } from 'brepjs/quick';

const b = box(30, 20, 10);

faceFinder()
  .when((f) => faceCenter(f)[2] > 9.9)
  .findAll(b); // top face
edgeFinder()
  .when((e) => getBounds(e).xMin < 15 && getBounds(e).xMax > 15)
  .findAll(b); // edges crossing x=15
```

There are no dedicated position filters for edges and faces: pass a predicate to `.when()` that reads `faceCenter(face)` or `getBounds(edge)`.

`atDistance(distance, point)` keeps elements at an exact distance from a point.

### Length / area filters

```typescript
import { box, sketchCircle, edgeFinder, faceFinder } from 'brepjs/quick';

const b = box(30, 20, 10);

edgeFinder().ofLength(30).findAll(b); // the four 30mm edges
faceFinder().ofArea(600).findAll(b); // the two 30x20 faces

const cyl = sketchCircle(10).extrude(20);
edgeFinder().ofCurveType('CIRCLE').findAll(cyl); // the circular edges
```

`ofLength(length, tolerance?)` and `ofArea(area, tolerance?)` match a value within a tolerance (default `1e-3`). For a range, use `.when()` with `curveLength` or `measureArea`.

### Type filters

```typescript
import { sketchCircle, faceFinder, edgeFinder } from 'brepjs/quick';

const cyl = sketchCircle(10).extrude(20);

faceFinder().ofSurfaceType('PLANE').findAll(cyl); // 2 (top, bottom)
faceFinder().ofSurfaceType('CYLINDRE').findAll(cyl); // 1 (side)

edgeFinder().ofCurveType('LINE').findAll(cyl); // 1, the seam edge on the side
edgeFinder().ofCurveType('CIRCLE').findAll(cyl); // 2
```

Surface types: `PLANE`, `CYLINDRE` (OCCT's spelling), `CONE`, `SPHERE`, `TORUS`, `BEZIER_SURFACE`, `BSPLINE_SURFACE`, `REVOLUTION_SURFACE`, `EXTRUSION_SURFACE`, `OFFSET_SURFACE`, `OTHER_SURFACE`.

Curve types: `LINE`, `CIRCLE`, `ELLIPSE`, `HYPERBOLA`, `PARABOLA`, `BEZIER_CURVE`, `BSPLINE_CURVE`, `OFFSET_CURVE`, `OTHER_CURVE`.

### Wire filters

```typescript
import { box, faceFinder, wireFinder, outerWire } from 'brepjs/quick';

const b = box(30, 20, 10);
const oneFace = faceFinder().findAll(b)[0];

if (oneFace) {
  wireFinder().isClosed().findAll(oneFace); // outer + inner closed loops
  outerWire(oneFace); // just the outer boundary
}
```

### Vertex filters

```typescript
import { box, vertexFinder } from 'brepjs/quick';

const b = box(30, 20, 10);

vertexFinder().withinBox([0, 0, 9.9], [30, 20, 10.1]).findAll(b); // top 4 corners
vertexFinder().atPosition([30, 20, 10]).findAll(b); // one corner
```

## Composing filters

Every filter call narrows. Chain freely:

```typescript
import { box, edgeFinder, getBounds } from 'brepjs/quick';

const b = box(30, 20, 10);

const topVerticals = edgeFinder()
  .inDirection('Z')
  .ofLength(10)
  .when((e) => getBounds(e).zMax > 5) // edges that reach the upper half
  .findAll(b);

console.log('Found', topVerticals.length, 'edges'); // 4 vertical edges
```

Order doesn't matter for correctness (filters are additive) but for performance, put the most-selective filter first if you have many candidates.

## With the fluent wrapper

The wrapper takes a finder callback, so you don't have to materialize the array yourself:

```typescript
import { shape, box } from 'brepjs/quick';

const filleted = shape(box(30, 20, 10)).fillet((e) => e.inDirection('Z').ofLength(10), 1.5).val;

export default filleted;
```

The callback receives an `EdgeFinderFn` (for `.fillet`, `.chamfer`) or `FaceFinderFn` (for `.shell`). You chain filters; the wrapper calls `findAll` internally.

## Common patterns

### "All edges except the inner hole"

When you want everything _but_ the holes you just cut:

```typescript
import { box, cylinder, cut, edgeFinder, fillet, getBounds, unwrap } from 'brepjs/quick';

const drilled = unwrap(cut(box(30, 20, 10), cylinder(5, 12, { at: [15, 10, -1] })));

// Vertical edges include the hole's 10mm seam edge, the same length as the box edges.
// Filter by position to exclude it: the box's vertical edges sit at x=0 and x=30.
const externalVerticals = edgeFinder()
  .inDirection('Z')
  .when((e) => getBounds(e).xMin < 1 || getBounds(e).xMin > 29)
  .findAll(drilled);
const filleted = unwrap(fillet(drilled, externalVerticals, 1));

export default filleted;
```

In practice, hole edges and exterior edges have different positions, lengths, or curve types. Find a filter that distinguishes them.

### "Just the rim of this part"

The top _circular_ edge of a cylindrical shell:

```typescript
import { sketchCircle, edgeFinder, fillet, getBounds, unwrap } from 'brepjs/quick';

const cup = sketchCircle(20).extrude(40);
const rim = edgeFinder()
  .ofCurveType('CIRCLE')
  .when((e) => getBounds(e).zMin > 39)
  .findAll(cup);

const rounded = unwrap(fillet(cup, rim, 2));

export default rounded;
```

Two filters: circular curves only, in the upper millimetre. One match.

### "The face that came from this sketch"

When you've fused parts together, finding "the face I just added" is harder. Heuristics:

```typescript
import { box, sketchCircle, fuse, faceFinder, translate, unwrap } from 'brepjs/quick';

const base = box(40, 40, 5);
const boss = translate(sketchCircle(8).extrude(10), [20, 20, 5]);
const part = unwrap(fuse(base, boss));

// "The cylindrical face": easy
const bossSide = faceFinder().ofSurfaceType('CYLINDRE').findAll(part)[0];
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

`inDirection('Z')` matches edges parallel to Z, in either direction, and so does an explicit vector. If you need edges going specifically `[0, 0, +1]` (e.g. for face-orientation logic), check the tangent yourself in a `.when()` predicate.

## Next steps

- [Fillets & Chamfers](./fillets): the operation finders are most often used for
- [Measurement](./measurement): measuring the entities you found
- [The Topology Hierarchy](../concepts/topology): what each finder operates on
