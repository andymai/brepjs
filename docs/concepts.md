# B-Rep Concepts

This guide introduces Boundary Representation (B-Rep) modeling for JavaScript developers. If you've used mesh-based libraries like Three.js, B-Rep is fundamentally different — and that difference is what makes it powerful for CAD.

## Mesh vs. B-Rep

**Mesh** (Three.js, Babylon.js): A shape is a bag of triangles. A cube is 12 triangles. There's no concept of "this is a flat face" or "this edge is where two faces meet." Great for rendering, but lacks geometric precision.

**B-Rep** (brepjs, OpenCascade, SolidWorks): A shape is defined by its _boundaries_ — faces, edges, and vertices — plus the mathematical surfaces and curves that define them exactly. A cube has 6 faces (each an infinite plane, trimmed), 12 edges (each a line segment), and 8 vertices. Booleans, fillets, and measurements work on exact geometry, not approximations.

```
Mesh:   triangles → visual approximation
B-Rep:  faces + edges + vertices → exact mathematical model
```

## The topology hierarchy

B-Rep has a strict containment hierarchy. Each level is a building block for the next:

```
Compound    ← collection of any shapes
  └─ Solid      ← watertight 3D volume (the goal for most CAD)
       └─ Shell     ← closed surface bounding a solid
            └─ Face      ← bounded region of a surface (plane, cylinder, etc.)
                 └─ Wire      ← closed loop of connected edges (face boundary)
                      └─ Edge      ← curve segment between two vertices
                           └─ Vertex    ← point in 3D space
```

### Vertex

A point in 3D space. Vertices mark where edges start and end.

```typescript
import { vertexFinder, vertexPosition } from 'brepjs';

const vertices = vertexFinder().find(box); // all 8 corners of a box
const pos = vertexPosition(vertices[0]); // [x, y, z]
```

### Edge

A curve segment connecting two vertices. Edges can be lines, arcs, splines, or any other curve type.

```typescript
import { edgeFinder, curveLength, getCurveType } from 'brepjs';

const edges = edgeFinder().find(box); // all 12 edges of a box
const len = curveLength(edges[0]); // length in mm
const type = getCurveType(edges[0]); // 'LINE', 'CIRCLE', etc.
```

### Wire

A connected chain of edges forming a loop. Wires define the boundaries of faces — every face has at least one wire (its outer boundary), and may have additional wires for holes.

```typescript
import { wireFinder } from 'brepjs';

const wires = wireFinder().isClosed().find(face); // closed boundary loops
```

### Face

A bounded region of a mathematical surface. A box face is a trimmed plane. A cylinder face is a trimmed cylindrical surface. Faces are what you see and interact with in CAD.

```typescript
import { faceFinder, measureArea, getSurfaceType } from 'brepjs';

const faces = faceFinder().find(box); // all 6 faces of a box
const area = measureArea(faces[0]); // area in mm²
const surfType = getSurfaceType(faces[0]); // 'PLANE', 'CYLINDER', etc.
```

Finders let you select specific faces by direction, surface type, or area:

```typescript
const topFace = faceFinder().inDirection('Z').find(box); // faces pointing up
const flatFaces = faceFinder().ofSurfaceType('PLANE').find(shape);
```

### Shell

A connected set of faces forming a surface. A closed shell (all faces joined, no gaps) bounds a solid.

### Solid

A watertight 3D volume bounded by a closed shell. This is the primary result type in CAD — it represents a real physical part with definite inside and outside.

```typescript
import { box, measureVolume } from 'brepjs';

const myBox = box([0, 0, 0], [10, 10, 10]); // returns Solid
measureVolume(myBox); // 1000
```

### Compound

A collection of shapes that aren't necessarily connected. Useful for grouping parts in an assembly.

```typescript
import { compound } from 'brepjs';

const assembly = compound([partA, partB, partC]);
```

## How brepjs represents shapes

brepjs uses **branded types** — lightweight TypeScript type tags on top of the raw OpenCascade WASM handle:

```typescript
type Edge = OcShape & { readonly [__brand]: 'edge' };
type Face = OcShape & { readonly [__brand]: 'face' };
type Solid = OcShape & { readonly [__brand]: 'solid' };
```

This means:

- **No class hierarchy** — shapes are plain handles, not class instances
- **Compile-time safety** — you can't accidentally pass an `Edge` to a function expecting a `Face`
- **Zero runtime cost** — the brand exists only at the type level

Related types group shapes by dimensionality:

```typescript
type Shape3D = Face | Shell | Solid | CompSolid | Compound;
type AnyShape = Vertex | Edge | Wire | Face | Shell | Solid | CompSolid | Compound;
```

## Common workflows

### Primitives → Booleans → Refinement → Export

The standard CAD workflow:

```typescript
// 1. Create primitives
const block = box([0, 0, 0], [50, 30, 20]);
const hole = translate(cylinder(5, 25), [25, 15, -2]);

// 2. Boolean operations
const drilled = unwrap(cut(block, hole));

// 3. Refine edges
const filleted = unwrap(fillet(drilled, getEdges(drilled), 2));

// 4. Export
const step = unwrap(exportSTEP(filleted));
```

### Sketch → Extrude

Start from a 2D profile, then create a 3D shape:

```typescript
// 2D profile
const profile = drawRectangle(40, 20);

// Project to 3D plane and extrude
const sketch = drawingToSketchOnPlane(profile, 'XY');
const part = sketchExtrude(sketch, 15);
```

### Query → Modify

Find specific features on a shape and modify them:

```typescript
// Find vertical edges and fillet them
const vertEdges = edgeFinder().inDirection('Z').findAll(part);
const rounded = unwrap(fillet(part, vertEdges, 3));

// Find the top face and shell the part (hollow it out)
const topFaces = faceFinder().inDirection('Z').findAll(part);
const shelled = unwrap(shell(part, topFaces, 2));
```

## Key differences from mesh libraries

| Concept               | Mesh (Three.js)        | B-Rep (brepjs)                 |
| --------------------- | ---------------------- | ------------------------------ |
| Shape representation  | Triangles              | Faces, edges, vertices         |
| Precision             | Approximate            | Exact (mathematical curves)    |
| Boolean operations    | Unreliable (CSG hacks) | Exact (OpenCascade kernel)     |
| Fillets/chamfers      | Not available          | Built-in, on exact edges       |
| Measurement           | Approximate            | Exact (volume, area, length)   |
| Export to CAD formats | Not possible           | STEP, IGES (industry standard) |
| Rendering             | Direct (GPU triangles) | Requires meshing first         |
| Memory                | GC-managed             | Needs explicit cleanup (WASM)  |

## Next steps

- **[Getting Started](./getting-started.md)** — Build your first part step by step
- **[Memory Management](./memory-management.md)** — Cleaning up WASM objects
- **[Error Reference](./errors.md)** — Error codes and recovery patterns
