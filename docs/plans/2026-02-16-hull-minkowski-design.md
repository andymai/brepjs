# Hull & Minkowski Design

## Goal

Add `hull()` and `minkowski()` operations to brepjs to reach feature parity with OpenSCAD's two most-used operations that brepjs currently lacks.

## Decisions

- **Hull scope:** 3D only (no 2D hull for now)
- **Hull algorithm:** Lightweight C++ QuickHull compiled into brepjs-opencascade WASM
- **Minkowski scope:** General purpose with sphere fast path
- **Minkowski approach:** Exact BREP via face-sweep + fuse; sphere case uses OCCT offset API
- **No GPU acceleration** — OCCT is CPU-only; BREP booleans are inherently sequential

## Hull — Architecture

### Pipeline

```
Input shapes → BRepMesh triangulation → extract vertices →
C++ QuickHull (WASM) → hull facets → BRepBuilderAPI reconstruct BREP solid
```

### WASM layer (brepjs-opencascade)

New C++ function exposed via Emscripten:

```cpp
TopoDS_Shape BrepJS_ConvexHull3D(const std::vector<double>& points);
```

Internally:

1. Run QuickHull on the point cloud (~500 lines C++, no external deps)
2. Build `TopoDS_Face` for each hull facet via `BRepBuilderAPI_MakePolygon` + `BRepBuilderAPI_MakeFace`
3. Sew faces into a shell with `BRepBuilderAPI_Sewing`
4. Build solid with `BRepBuilderAPI_MakeSolid`

Handles degeneracies: coplanar points, collinear points, duplicates.

Bumps brepjs-opencascade to **0.9.0**.

### Kernel layer (src/kernel/hullOps.ts)

Thin wrapper:

1. Mesh input shapes via `BRepMesh_IncrementalMesh`
2. Extract vertices from `Poly_Triangulation`
3. Flatten into `Float64Array`
4. Call `BrepJS_ConvexHull3D`
5. Return `TopoDS_Shape`

### Public API (src/topology/hullFns.ts)

```typescript
export interface HullOptions {
  tolerance?: number; // mesh tolerance for vertex extraction (default: 0.1)
}

export function hull(shapes: Shape3D[], options?: HullOptions): Result<Solid>;
```

## Minkowski — Architecture

### Two code paths

**Fast path — sphere detection:**

```
minkowski(shape, sphere(r)) → detect sphere → BRepOffsetAPI_MakeOffsetShape(shape, r)
```

Detection: check if tool is a single-face solid where surface type is `GeomAbs_Sphere` via `BRepAdaptor_Surface`. Extract radius, use OCCT offset.

**General path — vertex/edge/face decomposition:**

1. Extract all vertices, edges, and faces from shape A
2. For each **vertex** of A: translate a copy of B to that vertex position
3. For each **edge** of A: sweep B's cross-section along the edge
4. For each **face** of A: offset B along the face normal / sweep along face boundary
5. `fuseAll` all resulting shapes

### Public API (src/topology/minkowskiFns.ts)

```typescript
export interface MinkowskiOptions {
  tolerance?: number; // boolean fusion tolerance (default: 1e-6)
}

export function minkowski(shape: Shape3D, tool: Shape3D, options?: MinkowskiOptions): Result<Solid>;
```

## Error Codes

Added to `src/core/errors.ts`:

- `HULL_EMPTY_INPUT` — no shapes provided
- `HULL_FAILED` — QuickHull computation failed
- `HULL_DEGENERATE` — all points coplanar/collinear
- `MINKOWSKI_FAILED` — sweep/fuse failed
- `MINKOWSKI_NULL_TOOL` — null tool shape

## Files Changed

| Component                       | Change                                                   |
| ------------------------------- | -------------------------------------------------------- |
| `packages/brepjs-opencascade/`  | Add C++ QuickHull, new WASM binding, bump to 0.9.0       |
| `src/kernel/hullOps.ts`         | New — vertex extraction + WASM hull call                 |
| `src/topology/hullFns.ts`       | New — `hull()` public API                                |
| `src/topology/minkowskiFns.ts`  | New — `minkowski()` with sphere fast path + general case |
| `src/core/errors.ts`            | Add hull/minkowski error codes                           |
| `src/index.ts`                  | Export hull, minkowski                                   |
| `tests/fn-hullFns.test.ts`      | New                                                      |
| `tests/fn-minkowskiFns.test.ts` | New                                                      |

## Tests

### Hull

- Hull of single box → same bounding box
- Hull of two separated boxes → volume > sum of inputs
- Hull of sphere → approximately same volume
- Hull of scattered translated small boxes → correct convex envelope
- Error: empty array
- Error: null shape
- Edge case: coplanar shapes

### Minkowski

- minkowski(box, sphere) → rounded box, volume > original
- minkowski(box, small box) → enlarged box with exact dimensions
- minkowski(box(10,10,10), sphere(1)) matches offset(box, 1)
- Sphere fast path produces same result as offset API
- Error: null inputs
- Edge case: zero-radius sphere (identity)
