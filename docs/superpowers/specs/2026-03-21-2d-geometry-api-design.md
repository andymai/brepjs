# Full 2D Geometry API — Design Spec

**Date:** 2026-03-21
**Phase:** 5 of "Expose Unexposed OCCT Functionality"
**Branch:** `feat/2d-geometry-api`
**Status:** Approved

## Problem

The `Kernel2DCapability` has 70+ methods powering the Blueprint/Sketch system internally. Users want direct access for custom sketch solvers, 2D CAD features, and fine-grained 2D geometry manipulation. No public functional API exists for 2D curve operations — users must go through the class-based `Curve2D` wrapper or access kernel methods directly.

## Solution

A public functional API layer (`curve2dFns.ts`) wrapping `Kernel2DCapability` methods with branded types, `Result<T>` error handling, and `Disposable` support. Covers 5 groups: constructors, transforms, queries, intersection, and a 2D-3D bridge.

## Architecture

```
Layer 0: kernel/kernel2dTypes.ts      (Curve2dHandle — exists)
         kernel/occt/kernel2dOps.ts    (OCCT impl — exists)
         kernel/brepkit/brepkit2d.ts   (brepkit impl — exists)

Layer 1: core/curve2dHandle.ts         (NEW — branded Curve2DHandle + Disposable)

Layer 2: 2d/curve2dFns.ts             (NEW — all public functions)
         2d/curves.ts                  (existing — unchanged, backward compat)
```

### Files to Create

| File                            | Layer | Purpose                                                        |
| ------------------------------- | ----- | -------------------------------------------------------------- |
| `src/core/curve2dHandle.ts`     | 1     | Branded `Curve2DHandle` type + `createCurve2DHandle()` factory |
| `src/2d/curve2dFns.ts`          | 2     | All public 2D curve functions                                  |
| `tests/curve2dGeometry.test.ts` | —     | Tests for all 5 groups                                         |

### Files to Modify

| File                | Change                                                |
| ------------------- | ----------------------------------------------------- |
| `src/core/index.ts` | Export `Curve2DHandle` type and `createCurve2DHandle` |
| `src/2d.ts`         | Export all new functions from `curve2dFns.ts`         |
| `src/index.ts`      | Re-export `Curve2DHandle` type                        |

## Branded Handle Type

The branded type wraps the kernel's raw `Curve2dHandle` (lowercase d, from `kernel2dTypes.ts`) with a phantom brand and `Disposable` support. The public type uses `Curve2DHandle` (capital D) to match the casing convention of other public types (`Point2D`, `BoundingBox2d`).

The factory function `createCurve2DHandle(raw)` uses `createKernelHandle()` from `src/core/disposal.ts` internally. This integrates with the existing disposal infrastructure:

- Tracks live handle counts via `DisposalStats`
- Registers with `FinalizationRegistry` as a GC safety net
- Guards against double-dispose
- Throws on access after disposal

This enables `using curve = unwrap(line2d([0,0], [10,5]))`.

## Public API

All functions live in `src/2d/curve2dFns.ts`. All return `Result<T, BrepError>`.

### Constructors

| Function       | Signature                                                                                                                           | Kernel Method          |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `line2d`       | `(from: Point2D, to: Point2D) => Result<Curve2DHandle>`                                                                             | `makeLine2d`           |
| `circle2d`     | `(center: Point2D, radius: number, sense?: boolean) => Result<Curve2DHandle>`                                                       | `makeCircle2d`         |
| `arc2d`        | `(p1: Point2D, mid: Point2D, p2: Point2D) => Result<Curve2DHandle>`                                                                 | `makeArc2dThreePoints` |
| `arc2dTangent` | `(start: Point2D, tangent: Point2D, end: Point2D) => Result<Curve2DHandle>`                                                         | `makeArc2dTangent`     |
| `ellipse2d`    | `(center: Point2D, majorRadius: number, minorRadius: number, opts?) => Result<Curve2DHandle>`                                       | `makeEllipse2d`        |
| `ellipseArc2d` | `(center: Point2D, majorRadius: number, minorRadius: number, startAngle: number, endAngle: number, opts?) => Result<Curve2DHandle>` | `makeEllipseArc2d`     |
| `bezier2d`     | `(points: Point2D[]) => Result<Curve2DHandle>`                                                                                      | `makeBezier2d`         |
| `bspline2d`    | `(points: Point2D[], opts?) => Result<Curve2DHandle>`                                                                               | `makeBSpline2d`        |

### Transforms

| Function                  | Signature                                                                              | Kernel Method             |
| ------------------------- | -------------------------------------------------------------------------------------- | ------------------------- |
| `translateCurve2d`        | `(curve: Curve2DHandle, dx: number, dy: number) => Result<Curve2DHandle>`              | `translateCurve2d`        |
| `rotateCurve2d`           | `(curve: Curve2DHandle, angle: number, center?: Point2D) => Result<Curve2DHandle>`     | `rotateCurve2d`           |
| `scaleCurve2d`            | `(curve: Curve2DHandle, factor: number, center?: Point2D) => Result<Curve2DHandle>`    | `scaleCurve2d`            |
| `mirrorCurve2d`           | `(curve: Curve2DHandle, point: Point2D) => Result<Curve2DHandle>`                      | `mirrorCurve2dAtPoint`    |
| `mirrorCurve2dAcrossAxis` | `(curve: Curve2DHandle, origin: Point2D, direction: Point2D) => Result<Curve2DHandle>` | `mirrorCurve2dAcrossAxis` |
| `offsetCurve2d`           | `(curve: Curve2DHandle, distance: number) => Result<Curve2DHandle>`                    | `offsetCurve2d`           |

### Queries

| Function          | Signature                                                                               | Kernel Method       |
| ----------------- | --------------------------------------------------------------------------------------- | ------------------- |
| `evaluateCurve2d` | `(curve: Curve2DHandle, param: number) => Result<Point2D>`                              | `evaluateCurve2d`   |
| `tangentCurve2d`  | `(curve: Curve2DHandle, param: number) => Result<{ point: Point2D; tangent: Point2D }>` | `evaluateCurve2dD1` |
| `boundsCurve2d`   | `(curve: Curve2DHandle) => Result<{ first: number; last: number }>`                     | `getCurve2dBounds`  |
| `typeCurve2d`     | `(curve: Curve2DHandle) => Result<string>`                                              | `getCurve2dType`    |

### Intersection

| Function                  | Signature                                                                                                                | Kernel Method             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------- | ----------------------- |
| `intersectCurves2d`       | `(c1: Curve2DHandle, c2: Curve2DHandle, tolerance?: number) => Result<{ points: Point2D[]; segments: Curve2DHandle[] }>` | `intersectCurves2d`       |
| `projectPointOnCurve2d`   | `(curve: Curve2DHandle, point: Point2D) => Result<{ param: number; distance: number }                                    | null>`                    | `projectPointOnCurve2d` |
| `distanceBetweenCurves2d` | `(c1: Curve2DHandle, c2: Curve2DHandle) => Result<number>`                                                               | `distanceBetweenCurves2d` |

**Implementation notes:**

- `intersectCurves2d`: default tolerance is `1e-7` when omitted. Returned `segments` are individually disposable — callers must dispose each element. Consider wrapping all segments in a `DisposalScope` if only `points` are needed.
- `projectPointOnCurve2d`: returns `Result<... | null>`. A `null` inside `ok(null)` means no projection exists (valid geometric outcome, not an error). Only kernel failures produce `err()`.
- `distanceBetweenCurves2d`: internally calls `getCurve2dBounds` on both curves to derive the full parameter ranges, then delegates to the kernel method which requires explicit bounds.

### 2D-3D Bridge

| Function                 | Signature                                                    | Kernel Method            |
| ------------------------ | ------------------------------------------------------------ | ------------------------ |
| `liftCurve2dToPlane`     | `(curve: Curve2DHandle, plane: Plane) => Result<Edge<'3D'>>` | `liftCurve2dToPlane`     |
| `extractCurve2dFromEdge` | `(edge: Edge, face: Face) => Result<Curve2DHandle>`          | `extractCurve2dFromEdge` |

**Implementation note:** `liftCurve2dToPlane` decomposes the `Plane` type into kernel arguments: `plane.origin` → `planeOrigin`, `plane.zDir` → `planeZ`, `plane.xDir` → `planeX`.

## Error Handling

All functions use `kernelCall()` wrapping from `src/core/errors.ts` and return `Result<T, BrepError>`. New error codes use a `CURVE2D_` prefix:

- `CURVE2D_CONSTRUCTION_FAILED` — curve constructor failed (e.g., degenerate input)
- `CURVE2D_INVALID_RADIUS` — non-positive radius for circle/ellipse
- `CURVE2D_TRANSFORM_FAILED` — transform operation failed
- `CURVE2D_QUERY_FAILED` — query operation failed
- `CURVE2D_INTERSECTION_FAILED` — intersection computation failed
- `CURVE2D_BRIDGE_FAILED` — 2D-3D conversion failed

Input validation (e.g., `radius <= 0`) returns `err()` immediately without calling the kernel.

## Testing

Single file `tests/curve2dGeometry.test.ts` with `describe` blocks per group:

```
describe('2D curve constructors')
describe('2D curve transforms')
describe('2D curve queries')
describe('2D curve intersection')
describe('2D-3D bridge')
```

Tests run against both kernels (no `skipIf` guards). Uses `toBeCloseTo` for geometric assertions. Standard `beforeAll(async () => { await initOC(); }, 30000)` setup.

## Scope Exclusions

The following `Kernel2DCapability` methods are NOT exposed in this phase:

- Serialization (`serializeCurve2d`, `deserializeCurve2d`)
- Splitting (`splitCurve2d`)
- Approximation (`approximateCurve2dAsBSpline`, `decomposeBSpline2dToBeziers`)
- Bounding box operations (`createBoundingBox2d`, `addCurveToBBox2d`, etc.)
- Type extraction (`getCurve2dCircleData`, `getCurve2dEllipseData`, etc.)
- General transforms (`createIdentityGTrsf2d`, etc.)
- Affinity transform (`affinityTransform2d`)
- Low-level adaptor creation (`createCurve2dAdaptor`)
- Curve modification (`trimCurve2d`, `reverseCurve2d`, `copyCurve2d`)
- Surface operations (`fillSurface`, `buildEdgeOnSurface`, etc.)

These remain internal, used by Blueprint/Sketcher.

## Backward Compatibility

- No breaking changes. Existing `Curve2D` class and `src/2d/curves.ts` unchanged.
- New exports are additive only.
- The `brepjs/2d` entry point gains new exports but all existing exports remain.
