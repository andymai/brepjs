# manifold kernel adapter

`manifold` is a fast mesh/CSG **preview** kernel built on
[`manifold-3d`](https://github.com/elalish/manifold). It excels at watertight
boolean CSG, transforms, measurement, and tessellation, all computed natively on
triangle meshes. It is not a B-rep kernel: it has no exact curves, surfaces, or
topological sub-shapes of its own. Exact answers (STEP/IGES/BREP export, NURBS
curve/surface queries, topological introspection) come from **replaying the
recorded op-graph onto OCCT**. Every constructive operation records an
`OpNode` (see [`opGraph.ts`](./opGraph.ts)) capturing its exact parameters, and
the replay engine ([`replay.ts`](./replay.ts)) rebuilds a true B-rep on the
registered `occt` kernel on demand. Shapes whose history is tainted by a raw
mesh (imported geometry or a mesh-level boolean) cannot be replayed; for those,
B-rep export degrades to a **faceted approximation with a `console.warn`**.

## Op-support matrix

| Category                                                                                                                   | Strategy                                               | Notes                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Primitives (box, cylinder, sphere, cone, torus, ellipsoid)                                                                 | NATIVE                                                 | Built directly on `manifold-3d`.                                                                                                           |
| Booleans (fuse, cut, common)                                                                                               | NATIVE                                                 | Exact mesh CSG; recorded as replayable ops.                                                                                                |
| Transforms (translate, rotate, scale, mirror, general, grid)                                                               | NATIVE                                                 | Matrix transforms applied to the mesh.                                                                                                     |
| Measure (volume, area, center of mass, bbox, inertia)                                                                      | NATIVE                                                 | Derived from the manifold solid.                                                                                                           |
| Mesh tessellation                                                                                                          | NATIVE                                                 | The kernel's native representation.                                                                                                        |
| Fillet, chamfer, shell, thicken, loft, sweep, offset, draft, defeature, simplify                                           | MESH APPROX (preview) / EXACT via OCCT replay (export) | Mesh-level approximation for fast preview; the recorded op-graph replays onto OCCT for exact results on B-rep export.                      |
| STEP / IGES / BREP / XCAF export                                                                                           | REPLAY → OCCT                                          | Replays the op-graph to a true B-rep, then delegates to OCCT. Non-replayable origins export a faceted approximation with a `console.warn`. |
| NURBS curve queries (type, params, tangent, knot/degree ops, adaptor, NURBS data)                                          | REPLAY → OCCT                                          | Lazily replays the shape and answers from the real B-rep (memoized per op-node).                                                           |
| NURBS surface queries (type, UV bounds, normal, classification, untrim, cylinder data, NURBS data, features, projectEdges) | REPLAY → OCCT                                          | As above.                                                                                                                                  |
| Curve/surface constructors (interpolatePoints, approximatePoints, approximateSurfaceLspia, reverseSurfaceU)                | DELEGATED → OCCT                                       | No mesh-solid input to replay; delegated straight to OCCT (result is an OCCT shape).                                                       |
| Topology introspection (shapeType, hashCode, edgeToFaceMap, adjacentFaces, sharedEdges, iterShapeList)                     | REPLAY → OCCT                                          | `hashCode` and `shapeType` cache their replayed B-rep / result on the op-node.                                                             |
| STL / OBJ / PLY export & import                                                                                            | NATIVE                                                 | Encoded/decoded directly from the mesh. Imports are raw-mesh origins.                                                                      |
| GLB export & import                                                                                                        | NATIVE                                                 | Minimal glTF 2.0 binary (one mesh, one primitive: POSITION + indices). Imports are raw-mesh origins.                                       |
| 3MF export & import                                                                                                        | UNSUPPORTED (throws)                                   | 3MF is an OPC (ZIP) container; no zip dependency is available. Export GLB/STL/OBJ or use a B-rep kernel.                                   |
| 2D ops                                                                                                                     | DELEGATED → OCCT                                       | Replays onto OCCT; throws when no OCCT kernel is registered.                                                                               |
| Constraint sketch                                                                                                          | UNSUPPORTED (throws)                                   | No mesh semantics.                                                                                                                         |
| Projection                                                                                                                 | UNSUPPORTED (throws)                                   | No mesh semantics.                                                                                                                         |
| B-rep builders (makeEdge, makeWire, makeFace, makeVertex)                                                                  | UNSUPPORTED (throws)                                   | No mesh equivalent for sub-solid topology.                                                                                                 |
| `sew`                                                                                                                      | UNSUPPORTED (throws)                                   | Builds B-rep topology from faces; no mesh semantics.                                                                                       |
| Arena checkpoint / executeBatch                                                                                            | NO-OP / UNSUPPORTED                                    | manifold has no arena; nothing to checkpoint or batch.                                                                                     |

## Replayability

A shape's op-node is **replayable** only when every op in its history is a
constructive op (primitive, boolean, transform, sweep, modifier, or builder, see
`REPLAYABLE_OPS` in [`helpers.ts`](./helpers.ts)) and all of its inputs are
themselves replayable.

- **Replayable shapes** → exact STEP/IGES/BREP via OCCT replay, and exact NURBS /
  topology queries.
- **Non-replayable shapes** (tainted by `importGLB`, `importOBJ`, `importSTL`,
  `importMesh`, or a mesh-level boolean) → B-rep export falls back to a **faceted
  approximation with a `console.warn`**, and exact geometry/topology queries
  throw a clear unsupported error.
