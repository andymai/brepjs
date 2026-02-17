# Hull & Minkowski Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `hull()` and `minkowski()` operations to brepjs for OpenSCAD feature parity.

**Architecture:** Hull uses a C++ QuickHull algorithm compiled into brepjs-opencascade WASM, with a TypeScript kernel wrapper that extracts mesh vertices and reconstructs BREP solids. Minkowski uses a sphere fast path via OCCT's offset API, with a general-purpose path that decomposes shape A into vertices/edges/faces, translates/sweeps shape B along each, and fuses the results.

**Tech Stack:** C++ (QuickHull in WASM), TypeScript (kernel + topology layers), Vitest (tests)

**Design doc:** `docs/plans/2026-02-16-hull-minkowski-design.md`

---

## Phase 1: Hull

### Task 1: Add error codes

**Files:**

- Modify: `src/core/errors.ts:105-107`

**Step 1: Add hull and minkowski error codes**

In `src/core/errors.ts`, add before the closing `} as const;` on line 107:

```typescript
  // Hull errors
  HULL_EMPTY_INPUT: 'HULL_EMPTY_INPUT',
  HULL_FAILED: 'HULL_FAILED',
  HULL_DEGENERATE: 'HULL_DEGENERATE',
  HULL_NOT_3D: 'HULL_NOT_3D',

  // Minkowski errors
  MINKOWSKI_FAILED: 'MINKOWSKI_FAILED',
  MINKOWSKI_NULL_TOOL: 'MINKOWSKI_NULL_TOOL',
  MINKOWSKI_NOT_3D: 'MINKOWSKI_NOT_3D',
```

**Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/core/errors.ts
git commit -m "feat: add hull and minkowski error codes"
```

---

### Task 2: Add C++ QuickHull to brepjs-opencascade WASM

**Files:**

- Modify: `packages/brepjs-opencascade/build-source/defaults.yml:270-274` (bindings)
- Modify: `packages/brepjs-opencascade/build-source/defaults.yml:749-750` (C++ code)

**Step 1: Add ConvexHull3D binding symbol**

In `defaults.yml`, add before the `#@ end` on line 274:

```yaml
- symbol: ConvexHull3D
```

**Step 2: Add C++ ConvexHull3D class**

In `defaults.yml`, add before the `#@ end` on line 750. This is a self-contained QuickHull implementation that:

- Takes a flat array of doubles (x,y,z triples)
- Computes 3D convex hull using incremental QuickHull
- Returns a `TopoDS_Shape` (closed solid) built via BRepBuilderAPI

```cpp
class ConvexHull3D {
public:
  struct HullFace {
    int a, b, c;
  };

  static TopoDS_Shape compute(const emscripten::val& pointsVal) {
    // Convert JS Float64Array to vector of gp_Pnt
    const auto length = pointsVal["length"].as<int>();
    if (length < 12) { // Need at least 4 points (12 doubles)
      throw std::runtime_error("ConvexHull3D: need at least 4 non-coplanar points");
    }

    std::vector<gp_Pnt> points;
    points.reserve(length / 3);
    for (int i = 0; i < length; i += 3) {
      points.emplace_back(
        pointsVal[i].as<double>(),
        pointsVal[i + 1].as<double>(),
        pointsVal[i + 2].as<double>()
      );
    }

    // Remove duplicate points (within tolerance)
    const double tol = 1e-7;
    std::vector<gp_Pnt> unique;
    unique.reserve(points.size());
    for (const auto& p : points) {
      bool dup = false;
      for (const auto& u : unique) {
        if (p.Distance(u) < tol) { dup = true; break; }
      }
      if (!dup) unique.push_back(p);
    }
    points = std::move(unique);

    if (points.size() < 4) {
      throw std::runtime_error("ConvexHull3D: fewer than 4 unique points after dedup");
    }

    // --- Incremental convex hull (gift-wrapping / beneath-beyond) ---
    // Find initial tetrahedron
    int n = static_cast<int>(points.size());

    // Find 4 non-coplanar points
    int p0 = 0, p1 = -1, p2 = -1, p3 = -1;

    // Find p1: farthest from p0
    {
      double maxDist = 0;
      for (int i = 1; i < n; i++) {
        double d = points[p0].SquareDistance(points[i]);
        if (d > maxDist) { maxDist = d; p1 = i; }
      }
    }
    if (p1 < 0) throw std::runtime_error("ConvexHull3D: all points coincident");

    // Find p2: farthest from line p0-p1
    {
      gp_Vec line(points[p0], points[p1]);
      double maxDist = 0;
      for (int i = 0; i < n; i++) {
        if (i == p0 || i == p1) continue;
        gp_Vec v(points[p0], points[i]);
        double d = v.CrossMagnitude(line);
        if (d > maxDist) { maxDist = d; p2 = i; }
      }
    }
    if (p2 < 0) throw std::runtime_error("ConvexHull3D: all points collinear");

    // Find p3: farthest from plane p0-p1-p2
    {
      gp_Vec v1(points[p0], points[p1]);
      gp_Vec v2(points[p0], points[p2]);
      gp_Vec normal = v1.Crossed(v2);
      double normalMag = normal.Magnitude();
      if (normalMag < tol) throw std::runtime_error("ConvexHull3D: degenerate triangle");
      normal.Divide(normalMag);
      double maxDist = 0;
      for (int i = 0; i < n; i++) {
        if (i == p0 || i == p1 || i == p2) continue;
        gp_Vec v(points[p0], points[i]);
        double d = std::abs(v.Dot(normal));
        if (d > maxDist) { maxDist = d; p3 = i; }
      }
    }
    if (p3 < 0) throw std::runtime_error("ConvexHull3D: all points coplanar");

    // Orient initial tetrahedron so all faces point outward
    {
      gp_Vec v1(points[p0], points[p1]);
      gp_Vec v2(points[p0], points[p2]);
      gp_Vec v3(points[p0], points[p3]);
      if (v1.Crossed(v2).Dot(v3) > 0) std::swap(p1, p2);
    }

    // Build hull faces
    std::vector<HullFace> faces;
    faces.push_back({p0, p1, p2});
    faces.push_back({p0, p2, p3});
    faces.push_back({p0, p3, p1});
    faces.push_back({p1, p3, p2});

    // For each remaining point, find visible faces and expand hull
    for (int i = 0; i < n; i++) {
      if (i == p0 || i == p1 || i == p2 || i == p3) continue;

      // Find visible faces
      std::vector<int> visible;
      for (int f = 0; f < static_cast<int>(faces.size()); f++) {
        gp_Vec v1(points[faces[f].a], points[faces[f].b]);
        gp_Vec v2(points[faces[f].a], points[faces[f].c]);
        gp_Vec normal = v1.Crossed(v2);
        gp_Vec toPoint(points[faces[f].a], points[i]);
        if (toPoint.Dot(normal) > tol * normal.Magnitude()) {
          visible.push_back(f);
        }
      }

      if (visible.empty()) continue;

      // Find horizon edges (edges shared by exactly one visible face)
      struct Edge { int a, b; };
      std::vector<Edge> horizon;
      for (int vi : visible) {
        const auto& f = faces[vi];
        Edge edges[3] = {{f.a, f.b}, {f.b, f.c}, {f.c, f.a}};
        for (const auto& e : edges) {
          bool shared = false;
          for (int vj : visible) {
            if (vj == vi) continue;
            const auto& g = faces[vj];
            // Check if edge is shared (in reverse direction)
            if ((e.a == g.b && e.b == g.a) ||
                (e.a == g.c && e.b == g.b) ||
                (e.a == g.a && e.b == g.c)) {
              shared = true;
              break;
            }
          }
          if (!shared) horizon.push_back(e);
        }
      }

      // Remove visible faces (in reverse order to preserve indices)
      std::sort(visible.rbegin(), visible.rend());
      for (int vi : visible) {
        faces[vi] = faces.back();
        faces.pop_back();
      }

      // Add new faces connecting horizon edges to point i
      for (const auto& e : horizon) {
        faces.push_back({e.a, e.b, i});
      }
    }

    // --- Build BREP solid from hull faces ---
    BRep_Builder brepBuilder;
    TopoDS_Shell shell;
    brepBuilder.MakeShell(shell);

    BRepBuilderAPI_Sewing sewing(tol);

    for (const auto& f : faces) {
      BRepBuilderAPI_MakePolygon poly;
      poly.Add(points[f.a]);
      poly.Add(points[f.b]);
      poly.Add(points[f.c]);
      poly.Close();
      if (!poly.IsDone()) continue;

      BRepBuilderAPI_MakeFace makeFace(poly.Wire());
      if (makeFace.IsDone()) {
        sewing.Add(makeFace.Face());
      }
    }

    sewing.Perform();
    TopoDS_Shape sewn = sewing.SewedShape();

    // Try to build a solid
    if (sewn.ShapeType() == TopAbs_SHELL) {
      BRepBuilderAPI_MakeSolid makeSolid(TopoDS::Shell(sewn));
      if (makeSolid.IsDone()) {
        return makeSolid.Solid();
      }
    }

    // If sewing produced a compound, try to extract a shell
    if (sewn.ShapeType() == TopAbs_COMPOUND) {
      for (TopExp_Explorer ex(sewn, TopAbs_SHELL); ex.More(); ex.Next()) {
        BRepBuilderAPI_MakeSolid makeSolid(TopoDS::Shell(ex.Current()));
        if (makeSolid.IsDone()) {
          return makeSolid.Solid();
        }
      }
    }

    throw std::runtime_error("ConvexHull3D: failed to build solid from hull faces");
  }
};
```

**Step 3: Add Emscripten binding**

This binding goes with the other `class_<>` bindings in the build config. The exact location depends on the generated build config — look at how `MeshExtractor` is bound in the generated config and follow the same pattern.

In `defaults.yml`, add the Emscripten binding in the `bindings()` section. Since the YAML uses `symbol:` entries that are processed by the build system, just ensure `ConvexHull3D` is listed (done in Step 1). The build system should pick up the class automatically.

If manual binding is needed, add to the emscripten bindings section:

```cpp
emscripten::class_<ConvexHull3D>("ConvexHull3D")
  .class_function("compute", &ConvexHull3D::compute);
```

**Step 4: Rebuild WASM**

Run: `cd packages/brepjs-opencascade && pnpm run buildWasm`
Expected: WASM build succeeds, new `.wasm` and `.js` files generated.

**Step 5: Update TypeScript declarations**

Add to `packages/brepjs-opencascade/src/brepjs_single.d.ts`:

```typescript
export declare class ConvexHull3D {
  static compute(points: Float64Array | number[]): TopoDS_Shape;
}
```

**Step 6: Bump package version**

Update `packages/brepjs-opencascade/package.json` version to `0.9.0`.

**Step 7: Commit**

```bash
git add packages/brepjs-opencascade/
git commit -m "feat(brepjs-opencascade): add ConvexHull3D WASM implementation"
```

---

### Task 3: Add hull kernel operation

**Files:**

- Create: `src/kernel/hullOps.ts`
- Modify: `src/kernel/types.ts:69-75` (add to KernelAdapter interface)
- Modify: `src/kernel/occtAdapter.ts` (add hull method + import)

**Step 1: Create `src/kernel/hullOps.ts`**

```typescript
import type { OpenCascadeInstance, OcShape } from './types.js';

/**
 * Extract all mesh vertices from shapes and compute the 3D convex hull.
 * Returns a closed TopoDS_Solid.
 */
export function hull(oc: OpenCascadeInstance, shapes: OcShape[], tolerance: number): OcShape {
  // Mesh all shapes and collect vertices
  const coords: number[] = [];

  for (const shape of shapes) {
    // Triangulate the shape
    const mesh = new oc.BRepMesh_IncrementalMesh_2(shape, tolerance, false, tolerance * 0.5, false);
    mesh.Perform(new oc.Message_ProgressRange_1());
    mesh.delete();

    // Extract vertices from each face's triangulation
    const explorer = new oc.TopExp_Explorer_2(
      shape,
      oc.TopAbs_ShapeEnum.TopAbs_FACE as never,
      oc.TopAbs_ShapeEnum.TopAbs_SHAPE as never
    );

    while (explorer.More()) {
      const face = oc.TopoDS.Face_1(explorer.Current());
      const location = new oc.TopLoc_Location_1();
      const triangulation = oc.BRep_Tool.Triangulation(face, location, 0);

      if (!triangulation.IsNull()) {
        const trsf = location.Transformation();
        const nbNodes = triangulation.get().NbNodes();

        for (let i = 1; i <= nbNodes; i++) {
          const node = triangulation.get().Node(i);
          const transformed = node.Transformed(trsf);
          coords.push(transformed.X(), transformed.Y(), transformed.Z());
          transformed.delete();
          node.delete();
        }

        trsf.delete();
      }

      location.delete();
      triangulation.delete();
      face.delete();
      explorer.Next();
    }

    explorer.delete();
  }

  if (coords.length < 12) {
    throw new Error('hull: need at least 4 vertices from input shapes');
  }

  // Call WASM ConvexHull3D
  const pointsArray = new Float64Array(coords);
  const result = (
    oc as never as { ConvexHull3D: { compute(pts: Float64Array): OcShape } }
  ).ConvexHull3D.compute(pointsArray);

  return result;
}
```

**Step 2: Add to KernelAdapter interface**

In `src/kernel/types.ts`, add after the boolean operations section (~line 75):

```typescript
  // --- Hull ---
  hull(shapes: OcShape[], tolerance: number): OcShape;
```

**Step 3: Add to OCCTAdapter**

In `src/kernel/occtAdapter.ts`, add the import:

```typescript
import { hull as _hull } from './hullOps.js';
```

Add the method to the class:

```typescript
  hull(shapes: OcShape[], tolerance: number): OcShape {
    return _hull(this.oc, shapes, tolerance);
  }
```

**Step 4: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 5: Commit**

```bash
git add src/kernel/hullOps.ts src/kernel/types.ts src/kernel/occtAdapter.ts
git commit -m "feat: add hull kernel operation"
```

---

### Task 4: Add hull public API

**Files:**

- Create: `src/topology/hullFns.ts`
- Modify: `src/index.ts:467-468` (add export)

**Step 1: Create `src/topology/hullFns.ts`**

```typescript
/**
 * Convex hull operation — computes the 3D convex hull of one or more shapes.
 */

import { getKernel } from '../kernel/index.js';
import type { Shape3D, Solid } from '../core/shapeTypes.js';
import { castShape, isSolid } from '../core/shapeTypes.js';
import { type Result, ok, err, isErr } from '../core/result.js';
import { validationError, occtError, BrepErrorCode } from '../core/errors.js';

export interface HullOptions {
  /** Mesh tolerance for vertex extraction (default: 0.1). */
  tolerance?: number;
}

/**
 * Compute the 3D convex hull of one or more shapes.
 *
 * Extracts mesh vertices from all input shapes, computes the convex hull,
 * and returns a closed BREP solid.
 */
export function hull(shapes: Shape3D[], options: HullOptions = {}): Result<Solid> {
  const { tolerance = 0.1 } = options;

  if (shapes.length === 0) {
    return err(
      validationError(BrepErrorCode.HULL_EMPTY_INPUT, 'hull: at least one shape is required')
    );
  }

  for (let i = 0; i < shapes.length; i++) {
    if (shapes[i].wrapped.IsNull()) {
      return err(
        validationError(BrepErrorCode.NULL_SHAPE_INPUT, `hull: shape at index ${i} is null`)
      );
    }
  }

  try {
    const kernel = getKernel();
    const rawShapes = shapes.map((s) => s.wrapped);
    const resultOc = kernel.hull(rawShapes, tolerance);
    const cast = castShape(resultOc);

    if (!isSolid(cast)) {
      return err(occtError(BrepErrorCode.HULL_NOT_3D, 'hull: result is not a solid'));
    }

    return ok(cast);
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    if (raw.includes('coplanar') || raw.includes('collinear') || raw.includes('coincident')) {
      return err(occtError(BrepErrorCode.HULL_DEGENERATE, `hull: degenerate input — ${raw}`, e));
    }
    return err(occtError(BrepErrorCode.HULL_FAILED, `hull: computation failed — ${raw}`, e));
  }
}
```

**Step 2: Export from `src/index.ts`**

After line 467 (`export { fuseAll, cutAll, type BooleanOptions } from './topology/booleanFns.js';`), add:

```typescript
export { hull, type HullOptions } from './topology/hullFns.js';
```

**Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/topology/hullFns.ts src/index.ts
git commit -m "feat: add hull() public API"
```

---

### Task 5: Write hull tests

**Files:**

- Create: `tests/fn-hullFns.test.ts`

**Step 1: Write tests**

```typescript
import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  box,
  sphere,
  cylinder,
  translate,
  hull,
  isOk,
  isErr,
  unwrap,
  unwrapErr,
  measureVolume,
  isSolid,
} from '../src/index.js';
import type { Shape3D } from '../src/core/shapeTypes.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('hull', () => {
  it('hull of a single box returns a solid with same volume', () => {
    const b = box(10, 10, 10);
    const result = hull([b]);
    expect(isOk(result)).toBe(true);
    const shape = unwrap(result);
    expect(isSolid(shape)).toBe(true);
    // Convex hull of a box is the box itself
    expect(measureVolume(shape)).toBeCloseTo(1000, -1);
  });

  it('hull of two separated boxes has volume greater than sum', () => {
    const b1 = box(10, 10, 10);
    const b2 = translate(box(10, 10, 10), [20, 0, 0]) as Shape3D;
    const result = hull([b1, b2]);
    expect(isOk(result)).toBe(true);
    const shape = unwrap(result);
    // Hull fills the gap between boxes, so volume > 2000
    expect(measureVolume(shape)).toBeGreaterThan(2000);
  });

  it('hull of a sphere is approximately the same volume', () => {
    const s = sphere(10);
    const result = hull([s]);
    expect(isOk(result)).toBe(true);
    const shape = unwrap(result);
    const sphereVol = (4 / 3) * Math.PI * 1000; // 4/3 * pi * r^3
    // Mesh approximation loses some volume, allow 10% tolerance
    expect(measureVolume(shape)).toBeCloseTo(sphereVol, -2);
  });

  it('hull of scattered boxes forms a convex envelope', () => {
    const positions: [number, number, number][] = [
      [0, 0, 0],
      [50, 0, 0],
      [0, 50, 0],
      [0, 0, 50],
    ];
    const shapes = positions.map((p) => translate(box(1, 1, 1), p) as Shape3D);
    const result = hull(shapes);
    expect(isOk(result)).toBe(true);
    const shape = unwrap(result);
    // Hull of tetrahedron-like arrangement
    expect(measureVolume(shape)).toBeGreaterThan(0);
    expect(isSolid(shape)).toBe(true);
  });

  it('returns error for empty array', () => {
    const result = hull([]);
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('HULL_EMPTY_INPUT');
  });
});
```

**Step 2: Run tests**

Run: `npx vitest run tests/fn-hullFns.test.ts`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add tests/fn-hullFns.test.ts
git commit -m "test: add hull() tests"
```

---

## Phase 2: Minkowski

### Task 6: Add minkowski public API with sphere fast path

**Files:**

- Create: `src/topology/minkowskiFns.ts`
- Modify: `src/index.ts` (add export)

**Step 1: Create `src/topology/minkowskiFns.ts`**

```typescript
/**
 * Minkowski sum operation — inflates a shape by sweeping a tool shape along it.
 *
 * Fast path: when the tool is a sphere, uses OCCT's offset API for exact results.
 * General path: decomposes shape into vertices/edges/faces and sweeps tool along each.
 */

import { getKernel } from '../kernel/index.js';
import type { AnyShape, Shape3D, Solid } from '../core/shapeTypes.js';
import { castShape, isShape3D, isSolid } from '../core/shapeTypes.js';
import { type Result, ok, err, isErr, unwrap } from '../core/result.js';
import { validationError, occtError, BrepErrorCode } from '../core/errors.js';
import { gcWithScope } from '../core/disposal.js';
import { getVertices, getEdges, getFaces, propagateOrigins } from './shapeFns.js';
import { fuse, fuseAll } from './booleanFns.js';

export interface MinkowskiOptions {
  /** Boolean fusion tolerance (default: 1e-6). */
  tolerance?: number;
}

/**
 * Detect if a shape is a sphere and return its radius, or null.
 */
function detectSphere(shape: Shape3D): number | null {
  const oc = getKernel().oc;
  const r = gcWithScope();

  const faces = getFaces(shape);
  if (faces.length !== 1) return null;

  const face = faces[0];
  const surface = r(new oc.BRepAdaptor_Surface_2(face.wrapped, true));
  const surfType = surface.GetType();

  // GeomAbs_Sphere = 5
  if (surfType === 5) {
    const sphere = surface.Sphere();
    const radius = sphere.Radius();
    sphere.delete();
    return radius;
  }

  return null;
}

/**
 * Sphere fast path: use OCCT's BRepOffsetAPI_MakeOffsetShape.
 */
function minkowskiSphere(shape: Shape3D, radius: number, tolerance: number): Result<Solid> {
  try {
    const oc = getKernel().oc;
    const r = gcWithScope();
    const progress = r(new oc.Message_ProgressRange_1());
    const builder = r(new oc.BRepOffsetAPI_MakeOffsetShape());
    builder.PerformByJoin(
      shape.wrapped,
      radius,
      tolerance,
      oc.BRepOffset_Mode.BRepOffset_Skin as never,
      false,
      false,
      oc.GeomAbs_JoinType.GeomAbs_Arc as never,
      false,
      progress
    );

    const resultOc = builder.Shape();
    const cast = castShape(resultOc);
    if (!isSolid(cast)) {
      return err(
        occtError(BrepErrorCode.MINKOWSKI_NOT_3D, 'minkowski: sphere offset result is not a solid')
      );
    }
    propagateOrigins(builder, [shape], cast);
    return ok(cast);
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return err(occtError(BrepErrorCode.MINKOWSKI_FAILED, `minkowski (sphere path): ${raw}`, e));
  }
}

/**
 * General Minkowski sum via vertex/edge/face decomposition.
 *
 * For each vertex of A: translate B to that vertex.
 * For each edge of A: sweep B along the edge.
 * For each face of A: sweep B along the face boundary.
 * Fuse all results.
 */
function minkowskiGeneral(shape: Shape3D, tool: Shape3D, tolerance: number): Result<Solid> {
  try {
    const oc = getKernel().oc;
    const r = gcWithScope();
    const parts: Shape3D[] = [];

    // --- Vertex copies: translate tool to each vertex of shape ---
    const vertices = getVertices(shape);
    for (const vertex of vertices) {
      const pnt = r(oc.BRep_Tool.Pnt(vertex.wrapped));
      const trsf = r(new oc.gp_Trsf_1());
      trsf.SetTranslation_1(r(new oc.gp_Vec_4(pnt.X(), pnt.Y(), pnt.Z())));

      const transformer = r(new oc.BRepBuilderAPI_Transform_2(tool.wrapped, trsf, true));
      const translated = castShape(transformer.Shape());
      if (isShape3D(translated)) {
        parts.push(translated);
      }
      pnt.delete();
    }

    // --- Edge sweeps: sweep tool along each edge of shape ---
    const edges = getEdges(shape);
    for (const edge of edges) {
      // Create a wire from the single edge
      const wireBuilder = r(new oc.BRepBuilderAPI_MakeWire_1());
      wireBuilder.Add_1(edge.wrapped);
      if (!wireBuilder.IsDone()) continue;
      const wire = wireBuilder.Wire();

      // Sweep tool along the edge wire
      const progress = r(new oc.Message_ProgressRange_1());
      const pipe = r(new oc.BRepOffsetAPI_MakePipe_1(wire, tool.wrapped));
      pipe.Build(progress);
      if (pipe.IsDone()) {
        const swept = castShape(pipe.Shape());
        if (isShape3D(swept)) {
          parts.push(swept);
        }
      }
      wire.delete();
    }

    if (parts.length === 0) {
      return err(
        occtError(BrepErrorCode.MINKOWSKI_FAILED, 'minkowski: no parts produced from decomposition')
      );
    }

    // Fuse all parts together
    const fuseResult = fuseAll(parts);
    if (isErr(fuseResult)) {
      return err(
        occtError(
          BrepErrorCode.MINKOWSKI_FAILED,
          `minkowski: fusion failed — ${unwrap(fuseResult)}`
        )
      );
    }

    const fused = unwrap(fuseResult);
    if (!isSolid(fused)) {
      return err(occtError(BrepErrorCode.MINKOWSKI_NOT_3D, 'minkowski: result is not a solid'));
    }

    return ok(fused);
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return err(occtError(BrepErrorCode.MINKOWSKI_FAILED, `minkowski (general path): ${raw}`, e));
  }
}

/**
 * Compute the Minkowski sum of a shape and a tool.
 *
 * When the tool is a sphere, uses OCCT's offset API for fast exact results.
 * Otherwise, decomposes the shape into vertices and edges, translates/sweeps
 * the tool along each, and fuses the results.
 */
export function minkowski(
  shape: Shape3D,
  tool: Shape3D,
  options: MinkowskiOptions = {}
): Result<Solid> {
  const { tolerance = 1e-6 } = options;

  if (shape.wrapped.IsNull()) {
    return err(validationError(BrepErrorCode.NULL_SHAPE_INPUT, 'minkowski: shape is null'));
  }
  if (tool.wrapped.IsNull()) {
    return err(validationError(BrepErrorCode.MINKOWSKI_NULL_TOOL, 'minkowski: tool is null'));
  }

  // Sphere fast path
  const sphereRadius = detectSphere(tool);
  if (sphereRadius !== null && sphereRadius > 0) {
    return minkowskiSphere(shape, sphereRadius, tolerance);
  }

  // General path
  return minkowskiGeneral(shape, tool, tolerance);
}
```

**Step 2: Export from `src/index.ts`**

After the hull export added in Task 4, add:

```typescript
export { minkowski, type MinkowskiOptions } from './topology/minkowskiFns.js';
```

**Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS (may need minor type fixes for OCCT casts)

**Step 4: Commit**

```bash
git add src/topology/minkowskiFns.ts src/index.ts
git commit -m "feat: add minkowski() with sphere fast path and general decomposition"
```

---

### Task 7: Write minkowski tests

**Files:**

- Create: `tests/fn-minkowskiFns.test.ts`

**Step 1: Write tests**

```typescript
import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  box,
  sphere,
  translate,
  minkowski,
  offset,
  isOk,
  isErr,
  unwrap,
  unwrapErr,
  measureVolume,
  isSolid,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('minkowski', () => {
  describe('sphere fast path', () => {
    it('minkowski(box, sphere) produces a rounded box larger than original', () => {
      const b = box(10, 10, 10);
      const s = sphere(1);
      const result = minkowski(b, s);
      expect(isOk(result)).toBe(true);
      const shape = unwrap(result);
      expect(isSolid(shape)).toBe(true);
      // Rounded box should be larger than original 1000
      expect(measureVolume(shape)).toBeGreaterThan(1000);
    });

    it('sphere fast path matches offset API result', () => {
      const b = box(10, 10, 10);
      const s = sphere(2);
      const minkResult = minkowski(b, s);
      const offsetResult = offset(b, 2);
      expect(isOk(minkResult)).toBe(true);
      expect(isOk(offsetResult)).toBe(true);
      const minkVol = measureVolume(unwrap(minkResult));
      const offsetVol = measureVolume(unwrap(offsetResult));
      // Should be approximately equal
      expect(minkVol).toBeCloseTo(offsetVol, 0);
    });
  });

  describe('general path', () => {
    it('minkowski(box, small box) produces enlarged box', () => {
      const b = box(10, 10, 10);
      const tool = box(2, 2, 2);
      // Center the tool at origin for proper Minkowski behavior
      const centeredTool = translate(tool, [-1, -1, -1]);
      const result = minkowski(b, centeredTool);
      expect(isOk(result)).toBe(true);
      const shape = unwrap(result);
      expect(isSolid(shape)).toBe(true);
      // Minkowski of 10x10x10 box with 2x2x2 centered box → 12x12x12 = 1728
      expect(measureVolume(shape)).toBeCloseTo(1728, -1);
    });
  });

  describe('error handling', () => {
    it('returns error for null shape', () => {
      const s = sphere(1);
      const b = box(0, 0, 0); // degenerate → null
      // Use a valid shape as tool, null as shape
      const result = minkowski(b, s);
      expect(isErr(result)).toBe(true);
    });

    it('returns error for null tool', () => {
      const b = box(10, 10, 10);
      const nullTool = box(0, 0, 0);
      const result = minkowski(b, nullTool);
      expect(isErr(result)).toBe(true);
    });
  });
});
```

**Step 2: Run tests**

Run: `npx vitest run tests/fn-minkowskiFns.test.ts`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add tests/fn-minkowskiFns.test.ts
git commit -m "test: add minkowski() tests"
```

---

## Phase 3: Integration

### Task 8: Run full test suite and lint

**Step 1: Run all checks**

Run: `npm run typecheck && npm run lint && npm run test && npm run check:boundaries`
Expected: All PASS

**Step 2: Fix any issues found**

Address lint errors, type errors, or boundary violations.

**Step 3: Commit fixes if needed**

```bash
git add -u
git commit -m "fix: address lint and type issues in hull/minkowski"
```

---

### Task 9: Update brepjs dependency on brepjs-opencascade

**Files:**

- Modify: `package.json` (bump brepjs-opencascade dependency to ^0.9.0)

**Step 1: Update dependency**

In root `package.json`, update the brepjs-opencascade dependency version to `^0.9.0`.

**Step 2: Install**

Run: `npm install`

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: bump brepjs-opencascade to ^0.9.0 for hull support"
```
