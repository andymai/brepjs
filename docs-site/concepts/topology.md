---
title: The Topology Hierarchy
---

# The Topology Hierarchy

A B-Rep shape is a recursive structure: a solid contains shells, shells contain faces, faces contain wires, wires contain edges, and edges contain vertices. Every modelling operation operates somewhere on this hierarchy, and every query you write picks an entity at one level. Knowing the levels — and the brand on each — is the bedrock of using brepjs effectively.

## The hierarchy

```
Compound      collection of any shapes
  └─ Solid      watertight 3D volume — the goal of most CAD work
       └─ Shell     closed surface bounding a solid
            └─ Face     bounded region of a mathematical surface
                 └─ Wire     closed loop of edges (face boundary)
                      └─ Edge   curve segment between two vertices
                           └─ Vertex   point in 3D space
```

Each level adds geometric meaning to the level below. An edge is just a curve, but a _closed_ edge loop forms a wire that bounds a face. A face is just a trimmed surface, but a _closed_ set of faces forms a shell that bounds a solid. The brepjs type system encodes these "closed" qualifiers as validity brands — see [Types That Prove Geometry Is Valid](./types).

## The seven shape kinds

### Vertex

A point in 3D space. Vertices mark where edges start and end. There are no operations on vertices besides reading their position.

```typescript
import { box, vertexFinder, vertexPosition } from 'brepjs/quick';

const b = box(20, 20, 20);
const corners = vertexFinder().findAll(b); // 8 corners
const firstCorner = corners[0];
if (firstCorner) {
  const pos = vertexPosition(firstCorner); // [x, y, z]
  console.log('Corner at', pos);
}
```

### Edge

A curve segment connecting two vertices. The curve is one of:

- `LINE` — straight segment
- `CIRCLE` — circular arc (or full circle)
- `ELLIPSE` — elliptical arc
- `BEZIER` — Bézier curve
- `BSPLINE` — B-spline (the catch-all for non-analytic curves)
- `OFFSET` — an offset of another curve

```typescript
import { box, edgeFinder, curveLength, getCurveType } from 'brepjs/quick';

const b = box(20, 20, 20);
const edges = edgeFinder().findAll(b); // 12 edges
const e0 = edges[0];
if (e0) {
  console.log('Length:', curveLength(e0)); // 20
  console.log('Type:', getCurveType(e0)); // 'LINE'
}
```

### Wire

A connected chain of edges. A wire can be open or closed; many face-building operations require a `ClosedWire`. The boundary of a face is a closed wire (its outer loop) plus zero or more inner closed wires (holes).

```typescript
import { box, faceFinder, wireFinder } from 'brepjs/quick';

const b = box(20, 20, 20);
const oneFace = faceFinder().findAll(b)[0];
if (oneFace) {
  const wires = wireFinder().isClosed().findAll(oneFace);
  console.log('Boundary loops:', wires.length); // 1 (no holes)
}
```

### Face

A bounded region of a mathematical surface — a plane trimmed to a polygon, a cylinder trimmed to a band, a sphere trimmed to a cap. The surface kind determines what's possible: a planar face can be sketched on, extruded, mirrored; a curved face can be queried for normal at a point.

Face surface kinds:

- `PLANE`, `CYLINDER`, `CONE`, `SPHERE`, `TORUS` — analytic
- `BSPLINE_SURFACE` — the catch-all
- `OFFSET_SURFACE`, `EXTRUSION`, `REVOLUTION` — derived

```typescript
import { box, faceFinder, measureArea, getSurfaceType } from 'brepjs/quick';

const b = box(30, 20, 10);
const faces = faceFinder().findAll(b); // 6
const top = faceFinder().inDirection('Z').findAll(b)[0];
if (top) {
  console.log('Top area:', measureArea(top)); // 600
  console.log('Surface:', getSurfaceType(top)); // 'PLANE'
}
console.log('All faces:', faces.length);
```

### Shell

A connected set of faces. A **closed shell** has every edge shared by exactly two faces — it bounds a solid. Open shells exist (think a tea-cup before the bottom is sewn on); they are useful as intermediate results during construction.

```typescript
import { box, shellFinder } from 'brepjs/quick';

const b = box(10, 10, 10);
const shells = shellFinder().findAll(b);
console.log('Shells:', shells.length); // 1 — the outer shell of the box
```

### Solid

A 3D volume bounded by one or more shells (one outer, possibly inner shells for cavities). The most common output type. Every primitive (`box`, `cylinder`, `sphere`) returns a `ValidSolid` — a solid that has passed `BRepCheck`.

```typescript
import { box, sphere, measureVolume } from 'brepjs/quick';

const b = box(10, 10, 10);
const s = sphere(5);
console.log('Box volume:', measureVolume(b)); // 1000
console.log('Sphere volume:', measureVolume(s).toFixed(2)); // 523.60
```

### Compound

A collection of shapes that don't have to be connected. Useful for grouping parts in an assembly or returning multiple results from an operation.

```typescript
import { box, sphere, compound, measureVolume } from 'brepjs/quick';

const assembly = compound([box(10, 10, 10), sphere(5)]);
console.log('Compound volume:', measureVolume(assembly).toFixed(2)); // 1523.60
```

A compound containing only solids is a `CompSolid`. Compound is the fallback type when an operation can return multiple disconnected pieces (e.g. a boolean that splits a shape in two).

## Types that group across levels

Some brepjs functions accept any shape regardless of level. Two convenience unions:

- `Shape3D` — `Face | Shell | Solid | CompSolid | Compound<'3D'>`. The argument type for "anything 3D".
- `AnyShape` — `Vertex | Edge | Wire | Face | Shell | Solid | CompSolid | Compound`. Truly anything.

A phantom dimension parameter (`'2D' | '3D'`) prevents mixing 2D drafts with 3D parts at compile time. See [Types That Prove Geometry Is Valid](./types) for the full story.

## Querying levels with finders

A finder picks entities at one level and applies filters:

```typescript
import { box, edgeFinder, faceFinder, vertexFinder } from 'brepjs/quick';

const b = box(30, 20, 10);

vertexFinder().findAll(b); // 8
edgeFinder().findAll(b); // 12
edgeFinder().inDirection('Z').findAll(b); // 4 vertical
faceFinder().ofSurfaceType('PLANE').findAll(b); // 6
```

Finders return arrays — empty if nothing matches. They never throw and never return `undefined`. See [Finders & Queries](../tasks/finders) for the full filter vocabulary.

## How operations move you up the hierarchy

A typical CAD program walks up the hierarchy:

```typescript
import { Sketcher, edgeFinder, fillet, unwrap } from 'brepjs/quick';

// Start at wire (closed loop)
const sketch = new Sketcher('XY')
  .movePointerTo([0, 0])
  .lineTo([20, 0])
  .lineTo([20, 10])
  .lineTo([0, 10])
  .close();

// → face (extrude requires a face)
// → solid (extrude returns a solid)
const part = sketch.extrude(5);

// Find edges to refine
const verticals = edgeFinder().inDirection('Z').findAll(part);
const filleted = unwrap(fillet(part, verticals, 1));
console.log('Type assertion: still a Solid');
```

You start with edges (lines), close them into a wire, the wire becomes a face, the face extrudes into a solid, and the solid is what you ship.

## Next steps

- [Types That Prove Geometry Is Valid](./types) — the brand-and-validity types that prevent topology bugs at compile time
- [Finders & Queries](../tasks/finders) — selecting entities at any level
- [2D Sketching](../tasks/sketching) — building wires and faces fluently
