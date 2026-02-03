# Topology

Layer 2 — Shape hierarchy, casting, constructors, and functional APIs.

```mermaid
graph TD
    A[Shape] -->|inherits| B[Vertex]
    A -->|inherits| C[_1DShape]
    C -->|inherits| D[Edge]
    C -->|inherits| E[Wire]
    A -->|inherits| F[Face]
    A -->|inherits| G[_3DShape]
    G -->|inherits| H[Shell]
    G -->|inherits| I[Solid]
    G -->|inherits| J[CompSolid]
    G -->|inherits| K[Compound]

    L[Curve] -.standalone.-> C
    M[Surface] -.standalone.-> F

    style A fill:#fff3cd
    style G fill:#d4edda
    style C fill:#e1f5ff
```

## Key Files

| File                | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `shapes.ts`         | Full class hierarchy: `Shape<T>` base (clone, serialize, hashCode, transforms, edges/faces/wires, mesh, blobSTEP/STL), `Vertex` (asTuple), `Curve` (curveType, pointAt, tangentAt), `_1DShape` (Edge/Wire base with length, orientation, pointAt), `Edge`, `Wire` (offset2D), `Surface` (surfaceType), `Face` (UV, center, normalAt, outerWire, innerWires), `_3DShape` (fuse/cut/intersect/shell/fillet/chamfer), `Shell`, `Solid`, `CompSolid`, `Compound` |
| `cast.ts`           | `initCast()` for circular dep resolution, `asTopo()`, `iterTopo()` (hash-deduplicated), `shapeType()`, `downcast()`, `cast()` to proper Shape subclass                                                                                                                                                                                                                                                                                                       |
| `shapeFns.ts`       | Functional: `cloneShape`, `serializeShape`, `translateShape`, `rotateShape`, `mirrorShape`, `scaleShape`, `getEdges/Faces/Wires`, `getBounds`, `vertexPosition`                                                                                                                                                                                                                                                                                              |
| `curveFns.ts`       | Functional: `getCurveType`, `curveStartPoint/EndPoint`, `curvePointAt/TangentAt`, `curveLength`, `curveIsClosed/Periodic`, `getOrientation`, `flipOrientation`, `offsetWire2D`                                                                                                                                                                                                                                                                               |
| `faceFns.ts`        | Functional: `getSurfaceType`, `faceOrientation`, `flipFaceOrientation`, `uvBounds`, `pointOnSurface`, `uvCoordinates`, `normalAt`, `faceCenter`, `outerWire`, `innerWires`                                                                                                                                                                                                                                                                                   |
| `meshFns.ts`        | Functional: `meshShape` → ShapeMesh, `meshShapeEdges` → EdgeMesh, `exportSTEP/STL` → Result<Blob>                                                                                                                                                                                                                                                                                                                                                            |
| `booleanFns.ts`     | Functional: `fuseShapes`, `cutShape`, `intersectShapes`, `fuseAll`, `cutAll`, `buildCompound`                                                                                                                                                                                                                                                                                                                                                                |
| `shapeBooleans.ts`  | Standalone boolean operations: `fuseAll`, `cutAll`, `buildCompound`, `buildCompoundOc`, `applyGlue` — extracted from shapes.ts, re-exported for backward compat                                                                                                                                                                                                                                                                                              |
| `shapeModifiers.ts` | Modifier types and query infrastructure: `ChamferRadius`, `FilletRadius`, `RadiusConfig`, type guards, `getQueryModule`, `registerQueryModule` — extracted from shapes.ts, re-exported for backward compat                                                                                                                                                                                                                                                   |
| `shapeHelpers.ts`   | Constructors: curves (makeLine, makeCircle, makeEllipse, makeHelix, makeThreePointArc, makeBSplineApproximation, makeBezierCurve, makeTangentArc), wires (assembleWire), faces (makeFace, makeNonPlanarFace, addHolesInFace), solids (makeCylinder, makeSphere, makeEllipsoid, makeBox), compound (compoundShapes, weldShellsAndFaces, makeSolid), polygon (makePolygon), offset (makeOffset)                                                                |

## Gotchas

1. **Dual API** — Class methods mutate (`shape.translate()`), functional API is immutable (`translateShape(shape, v)`)
2. **Circular dependency** — `initCast()` must be called at module load to break shapes↔cast circular dependency
3. **Hash deduplication** — `iterTopo()` deduplicates via hash codes — same shape won't appear twice
4. **Boolean operations** — On classes return `Result<Shape3D>` — always handle errors
5. **Query dependency** — `fillet`/`chamfer`/`shell` require query module registration via `registerQueryModule()`
6. **Chainable transforms** — Shape transforms in class API return `this` (chainable but mutating)
7. **Flat mesh data** — `meshShape` returns flat typed arrays (Float32Array/Uint32Array) — not nested objects
8. **Consolidated types** — `ShapeMesh`, `FaceTriangulation`, `SurfaceType` are defined in functional files (`meshFns.ts`, `faceFns.ts`) and re-exported from `shapes.ts` for backward compatibility
