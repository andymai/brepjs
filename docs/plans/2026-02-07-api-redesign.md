# brepjs API Redesign: Clean, Discoverable, Composable

**Date:** 2026-02-07
**Status:** Draft
**Breaking:** Yes (major version bump)

---

## Vision

Make brepjs the most developer-friendly programmatic CAD API for experienced users coming from CadQuery, Build123d, or OpenSCAD. The API should feel like TypeScript, not like a wrapper around OCCT.

**Target audience:** Developers who already think in B-rep/CSG and want power, conciseness, type safety, and discoverability.

**Core principles:**

1. **Short names, smart defaults** — the 90% case is the shortest call
2. **Consistency eliminates surprises** — same patterns everywhere
3. **Discoverability through types** — autocomplete is your documentation
4. **Two equal API styles** — functional imports for library code, `shape()` for modeling
5. **Components are just functions** — no framework, no runtime, just TypeScript
6. **Errors that teach** — diagnostics with geometric context, not OCCT stack traces

---

## Scope

This spec covers the **user-facing modeling API**: primitives, transforms, booleans, modifiers, 3D operations, meshing, and utilities. It introduces the `shape()` wrapper and compound operations.

The following categories **retain their current names and signatures unchanged** unless listed in a rename table below:

- **Assembly graph:** `createAssemblyNode`, `addChild`, `removeChild`, `updateNode`, `findNode`, `walkAssembly`, `countNodes`, `collectShapes`
- **History/parametric:** `createHistory`, `addStep`, `undoLast`, `findStep`, `getHistoryShape`, `stepCount`, `stepsFrom`, `registerShape`, `createRegistry`, `registerOperation`, `replayHistory`, `replayFrom`, `modifyStep`
- **Projection/camera:** `createCamera`, `cameraLookAt`, `cameraFromPlane`, `projectEdges`
- **Interference/collision:** `checkInterference`, `checkAllInterferences`
- **Sketch functional API:** `sketchExtrude`, `sketchRevolve`, `sketchLoft`, `sketchSweep`, `sketchFace`, `sketchWires`, `compoundSketchExtrude`, `compoundSketchRevolve`, `compoundSketchFace`, `compoundSketchLoft`
- **Canned sketches:** `sketchCircle`, `sketchRectangle`, `sketchRoundedRectangle`, `sketchPolysides`, `sketchEllipse`, `sketchFaceOffset`, `sketchParametricFunction`, `sketchHelix`, `polysideInnerRadius`
- **Text:** `loadFont`, `getFont`, `textBlueprints`, `sketchText`
- **Face introspection:** `getSurfaceType`, `faceGeomType`, `faceOrientation`, `flipFaceOrientation`, `uvBounds`, `pointOnSurface`, `uvCoordinates`, `normalAt`, `faceCenter`, `classifyPointOnFace`, `outerWire`, `innerWires`, `projectPointOnFace`
- **Adjacency queries:** `facesOfEdge`, `edgesOfFace`, `wiresOfFace`, `verticesOfEdge`, `adjacentFaces`, `sharedEdges`
- **Curve functions:** `getCurveType`, `curveStartPoint`, `curveEndPoint`, `curvePointAt`, `curveTangentAt`, `curveLength`, `curveIsClosed`, `curveIsPeriodic`, `curvePeriod`, `getOrientation`, `flipOrientation`, `offsetWire2D`, `interpolateCurve`, `approximateCurve`
- **2D blueprint operations:** `createBlueprint`, `blueprintBoundingBox`, `blueprintOrientation`, `translateBlueprint`, `rotateBlueprint`, `scaleBlueprint`, `mirrorBlueprint`, `stretchBlueprint`, `blueprintToSVGPathD`, `blueprintIsInside`, `sketchBlueprintOnPlane`, `sketchBlueprintOnFace`, `fuseBlueprint2D`, `cutBlueprint2D`, `intersectBlueprint2D`
- **2D curve functions:** `reverseCurve`, `curve2dBoundingBox`, `curve2dFirstPoint`, `curve2dLastPoint`, `curve2dSplitAt`, `curve2dParameter`, `curve2dTangentAt`, `curve2dIsOnCurve`, `curve2dDistanceFrom`
- **Drawing functions:** `draw`, `drawRectangle`, `drawRoundedRectangle`, `drawCircle`, `drawSingleCircle`, `drawEllipse`, `drawSingleEllipse`, `drawPolysides`, `drawText`, `drawPointsInterpolation`, `drawParametricFunction`, `drawProjection`, `drawFaceOutline`, `deserializeDrawing`, `drawingToSketchOnPlane`, `drawingFuse`, `drawingCut`, `drawingIntersect`, `drawingFillet`, `drawingChamfer`, `translateDrawing`, `rotateDrawing`, `scaleDrawing`, `mirrorDrawing`
- **Export formats:** `exportOBJ`, `exportGltf`, `exportGlb`, `exportThreeMF`, `exportDXF`, `blueprintToDXF`, `exportAssemblySTEP`
- **Import formats:** `importSTEP`, `importSTL`, `importIGES`, `importSVGPathD`, `importSVG`
- **Measurement:** `measureVolume`, `measureArea`, `measureLength`, `measureDistance`, `createDistanceQuery`, `measureVolumeProps`, `measureSurfaceProps`, `measureLinearProps`, `measureCurvatureAt`, `measureCurvatureAtMid`
- **Three.js integration:** `toBufferGeometryData`, `toLineGeometryData`, `toGroupedBufferGeometryData`
- **Mesh caching:** `clearMeshCache`, `createMeshCache`
- **Query helpers:** `combineFinderFilters`, `getSingleFace`
- **Plane operations:** `createPlane`, `createNamedPlane`, `resolvePlane`, `translatePlane`, `pivotPlane`
- **Boolean helpers:** `fuseAll`, `cutAll`, `applyGlue`
- **Disposal/resource management:** `createHandle`, `createOcHandle`, `withScope`, `gcWithScope`, `gcWithObject`, `localGC`
- **Worker protocol:** All worker types and functions (infrastructure, not modeling API)
- **Vec operations:** All `vec*` and `vec2*` functions, `toOcVec`, `fromOcVec`, etc.
- **Result type:** All Result combinators (`ok`, `err`, `isOk`, `isErr`, `map`, `andThen`, `unwrap`, etc.)
- **Error constructors:** All error factory functions
- **Type guards:** `isVertex`, `isEdge`, `isWire`, `isFace`, `isShell`, `isSolid`, `isCompound`, `isShape3D`, `isShape1D`, `castShape`, `getShapeKind`
- **Shape creators:** `createVertex`, `createEdge`, `createWire`, `createFace`, `createShell`, `createSolid`, `createCompound`

---

## Layer 1: Clean Primitives & Operations

### 1.1 Naming Convention

Drop the `make*` prefix on primitives, the `*Shape` suffix on operations, and the `*Face`/`*Wires` suffix on 3D operations. These exist to avoid namespace collisions but cost readability on every call.

**Primitives:**

| Current               | New              | Rationale                                          |
| --------------------- | ---------------- | -------------------------------------------------- |
| `makeBox(...)`        | `box(...)`       | Every CAD API says `box`, not `makeBox`            |
| `makeCylinder(...)`   | `cylinder(...)`  | Same                                               |
| `makeSphere(...)`     | `sphere(...)`    | Same                                               |
| `makeCone(...)`       | `cone(...)`      | Same                                               |
| `makeTorus(...)`      | `torus(...)`     | Same                                               |
| `makeEllipsoid(...)`  | `ellipsoid(...)` | Same                                               |
| `makeLine(...)`       | `line(...)`      | Same                                               |
| `makeCircle(...)`     | `circle(...)`    | Same                                               |
| `makeEllipse(...)`    | `ellipse(...)`   | Same                                               |
| `makeHelix(...)`      | `helix(...)`     | Same                                               |
| `makePolygon(...)`    | `polygon(...)`   | Same                                               |
| `makeVertex(...)`     | `vertex(...)`    | Same                                               |

**Transforms:**

| Current               | New              | Rationale                                          |
| --------------------- | ---------------- | -------------------------------------------------- |
| `translateShape(...)` | `translate(...)` | CadQuery: `.translate()`. No suffix needed.        |
| `rotateShape(...)`    | `rotate(...)`    | Same                                               |
| `mirrorShape(...)`    | `mirror(...)`    | Same                                               |
| `scaleShape(...)`     | `scale(...)`     | Same                                               |
| `cloneShape(...)`     | `clone(...)`     | Same                                               |

> **Breaking note:** The current public API also exports low-level `rotate()`, `translate()`, `mirror()`, `scale()` from `src/core/geometryHelpers.ts`. These operate on raw `OcType` (untyped OCCT shapes) and were never intended as the primary user API. In v5, these low-level versions are **removed from the public API** (internalized). The branded-type versions from `shapeFns.ts` take the clean names. Users who were calling the low-level versions directly should switch to the branded-type equivalents (same behavior, better type safety).

**Booleans:**

| Current               | New              | Rationale                                          |
| --------------------- | ---------------- | -------------------------------------------------- |
| `fuseShape(...)`      | `fuse(...)`      | CadQuery: `.union()`. We keep `fuse` (OCCT term).  |
| `cutShape(...)`       | `cut(...)`       | Same                                               |
| `intersectShape(...)` | `intersect(...)` | Same                                               |
| `sectionShape(...)`   | `section(...)`   | Same                                               |
| `splitShape(...)`     | `split(...)`     | Same                                               |
| `sliceShape(...)`     | `slice(...)`     | Same                                               |

**Modifiers:**

| Current                      | New               | Rationale                                          |
| ---------------------------- | ----------------- | -------------------------------------------------- |
| `filletShape(...)`           | `fillet(...)`     | Same                                               |
| `chamferShape(...)`          | `chamfer(...)`    | Same                                               |
| `chamferDistAngleShape(...)` | `chamfer(...)`    | Merged — distance-angle mode via `ChamferDistance` type union (see [Section 1.3](#13-consistency-fixes)) |
| `shellShape(...)`            | `shell(...)`      | Same                                               |
| `offsetShape(...)`           | `offset(...)`     | Same                                               |
| `thickenSurface(...)`        | `thicken(...)`    | Drop suffix, clear intent                          |

**3D operations (drop type suffix):**

| Current               | New              | Rationale                                          |
| --------------------- | ---------------- | -------------------------------------------------- |
| `extrudeFace(...)`    | `extrude(...)`   | The input type makes the operation clear            |
| `revolveFace(...)`    | `revolve(...)`   | Same                                               |
| `loftWires(...)`      | `loft(...)`      | Same                                               |
| `sweep(...)`          | `sweep(...)`     | Already clean                                      |
| `twistExtrude(...)`   | `twistExtrude(...)` | Already clean                                   |
| `supportExtrude(...)` | `supportExtrude(...)` | Already clean                                 |
| `complexExtrude(...)` | `complexExtrude(...)` | Already clean                                 |

**Utilities:**

| Current               | New              | Rationale                                          |
| --------------------- | ---------------- | -------------------------------------------------- |
| `healShape(...)`      | `heal(...)`      | Same                                               |
| `simplifyShape(...)`  | `simplify(...)`  | Same                                               |
| `meshShape(...)`      | `mesh(...)`      | Same                                               |
| `meshShapeEdges(...)` | `meshEdges(...)` | Same                                               |
| `describeShape(...)`  | `describe(...)`  | Same                                               |
| `serializeShape(...)` | `toBREP(...)`    | Format-specific — avoids collision with generic `serialize` |
| `deserializeShape(...)` | `fromBREP(...)` | Same                                              |
| `isShapeValid(...)`   | `isValid(...)`   | Same                                               |
| `isShapeNull(...)`    | `isEmpty(...)`   | "Empty" is the right concept — avoids confusion with JS `null` |

**Healing variants** (keep their names — they're type-specific overrides):

- `healSolid()`, `healFace()`, `healWire()` — unchanged
- `autoHeal()` — unchanged (different behavior from `heal()`)

**Functions that keep their names** (already clean):

- `fuseAll()`, `cutAll()`, `linearPattern()`, `circularPattern()`
- `getEdges()`, `getFaces()`, `getWires()`, `getVertices()`
- `getBounds()`, `edgeFinder()`, `faceFinder()`, `wireFinder()`, `vertexFinder()`, `cornerFinder()`
- `isSameShape()`, `isEqualShape()` — these describe a comparison, not a property
- All `measure*()`, `export*()`, `import*()` functions
- All curve/face introspection: `curveStartPoint()`, `normalAt()`, etc.
- All `draw*()` 2D functions (see [Section: 2D Drawing Integration](#24-2d-drawing--sketcher-integration))
- All adjacency queries: `facesOfEdge()`, `edgesOfFace()`, `adjacentFaces()`, etc.
- All interference: `checkInterference()`, `checkAllInterferences()`
- See [Scope](#scope) for the complete list

**Deprecated:**

| Current        | Replacement | Rationale                                        |
| -------------- | ----------- | ------------------------------------------------ |
| `pipe()`       | `shape()`   | `shape()` is a superset with better naming       |
| `makeBaseBox()` | `box()`    | Redundant once `box()` takes dimensions directly |
| `chamferDistAngleShape()` | `chamfer()` | Distance-angle mode folded into `ChamferDistance` union |

**Topology constructors that get clearer names:**

| Current                         | New                      | Rationale                                               |
| ------------------------------- | ------------------------ | ------------------------------------------------------- |
| `makeFace(wire)`                | `face(wire)`             | Short, clear                                            |
| `makeNonPlanarFace(wire)`       | `filledFace(wire)`       | Matches OCCT `BRepFill` — "fill the wire boundary with a surface" |
| `makeCompound(shapes)`          | `compound(shapes)`       | Same                                                    |
| `makeSolid(faces)`              | `solid(faces)`           | Matches `face(wire)`, `wire(edges)` constructor pattern |
| `makeOffset(face, d)`           | `offsetFace(face, d)`    | Distinguish from `offset()` (3D offset)                 |
| `makeBSplineApproximation(...)` | `bsplineApprox(...)`     | Concise, preserves "approximation" to distinguish from `interpolateCurve()` |
| `makeBezierCurve(...)`          | `bezier(...)`            | Concise                                                 |
| `makeThreePointArc(...)`        | `threePointArc(...)`     | Clear enough                                            |
| `makeTangentArc(...)`           | `tangentArc(...)`        | Clear enough                                            |
| `makeEllipseArc(...)`           | `ellipseArc(...)`        | Clear enough                                            |
| `assembleWire(edges)`           | `wire(edges)`            | Short, matches `face()` pattern                         |
| `addHolesInFace(...)`           | `addHoles(...)`          | Shorter, clear: "add these holes to this face"          |
| `makeNewFaceWithinFace(...)`    | `subFace(...)`           | A face bounded within another face                      |
| `makeProjectedEdges(...)`       | `projectedEdges(...)`    | Drop `make*` prefix                                     |
| `weldShellsAndFaces(...)`       | `sewShells(...)`         | Matches OCCT `BRepBuilderAPI_Sewing`, distinct from `solid()` |

**Internalized (removed from public API):**

| Current (from `geometryHelpers.ts`) | Rationale                                                 |
| ------------------------------------ | --------------------------------------------------------- |
| `rotate(shape: OcType, ...)`        | Low-level OCCT utility. Replaced by branded `rotate()` from `shapeFns.ts` |
| `translate(shape: OcType, ...)`     | Same                                                      |
| `mirror(shape: OcType, ...)`        | Same                                                      |
| `scale(shape: OcType, ...)`         | Same                                                      |
| `makePlaneFromFace(...)`             | Internal helper. Users use `resolvePlane()` or `Sketcher` |

> `makePlane()` stays exported — it creates planes, not shapes.

**Migration:** Old names kept as deprecated aliases for one major version. A codemod script provided.

### 1.2 Primitive Constructor Signatures

All solid primitives follow a consistent pattern: **dimensions first, options object last**.

```typescript
// ── Solids ──────────────────────────────────────────────────

box(width: number, depth: number, height: number, options?: {
  center?: true | Vec3;   // true = centered at origin, Vec3 = centered at point
                          // omit = corner at origin (default)
}): Solid

cylinder(radius: number, height: number, options?: {
  at?: Vec3;              // base position, default [0,0,0]
  axis?: Vec3;            // default [0,0,1] (Z-up)
  centered?: boolean;     // center vertically instead of base at origin
}): Solid

sphere(radius: number, options?: {
  at?: Vec3;              // center, default [0,0,0]
}): Solid

cone(bottomRadius: number, topRadius: number, height: number, options?: {
  at?: Vec3;              // base position
  axis?: Vec3;
  centered?: boolean;     // center vertically instead of base at origin
}): Solid

torus(majorRadius: number, minorRadius: number, options?: {
  at?: Vec3;              // center
  axis?: Vec3;
}): Solid

ellipsoid(rx: number, ry: number, rz: number, options?: {
  at?: Vec3;              // center
}): Solid

// ── Curves ──────────────────────────────────────────────────

line(from: Vec3, to: Vec3): Edge

circle(radius: number, options?: {
  at?: Vec3;
  normal?: Vec3;
}): Edge

ellipse(majorRadius: number, minorRadius: number, options?: {
  at?: Vec3;
  normal?: Vec3;
}): Result<Edge>

threePointArc(p1: Vec3, p2: Vec3, p3: Vec3): Edge

helix(pitch: number, height: number, radius: number, options?: {
  at?: Vec3;
  axis?: Vec3;
  lefthand?: boolean;
}): Wire
```

**Positioning semantics by primitive:**

| Primitive   | `at` means         | `centered` option? | Rationale                                      |
| ----------- | ------------------ | ------------------ | ---------------------------------------------- |
| `box`       | N/A — use `center` | Yes (via `center`) | Box has ambiguous reference point; be explicit  |
| `cylinder`  | Base position      | Yes (vertical)     | Base is the natural reference for cylinders     |
| `cone`      | Base position      | Yes (vertical)     | Same geometry as cylinder — same options        |
| `sphere`    | Center             | No                 | Sphere is inherently centered                   |
| `torus`     | Center             | No                 | Torus is inherently centered                    |
| `ellipsoid` | Center             | No                 | Ellipsoid is inherently centered                |

**Key changes from current API:**

- `sphere` gains `at` option (was missing, inconsistent with cylinder/cone/torus)
- `cone` gains `centered` option (same geometry class as cylinder — same options)
- `box` uses `center` not `at` to avoid corner-vs-center ambiguity
- All use `axis` instead of positional `direction` parameters
- Options objects replace long positional parameter lists
- `extrude()` accepts `number` as shorthand for Z-direction extrusion (`10` = `[0, 0, 10]`). This is a new convenience not present in current `extrudeFace()`.

### 1.3 Consistency Fixes

**All angles in degrees. No exceptions.**

Current `makeEllipseArc` takes radians while everything else takes degrees. Fix:

```typescript
ellipseArc(
  majorRadius: number,
  minorRadius: number,
  startAngle: number,   // degrees (was radians!)
  endAngle: number,     // degrees (was radians!)
  options?: { at?: Vec3; normal?: Vec3; xDir?: Vec3 }
): Result<Edge>
```

No `DEG2RAD` / `RAD2DEG` constants needed in user code. If a user has radians, they multiply by `180/Math.PI` — the standard JS pattern.

**Default rotation axis is Z ([0, 0, 1]).** This matches the convention used by `cylinder`, `cone`, `circularPattern`, and the `Sketcher`. Documented explicitly on all rotation functions.

**Consistent parameter ordering across all operations:**

1. The shape(s) being operated on
2. The primary parameter (radius, distance, vector)
3. Options object

```typescript
// Transforms: shape, value, options — preserve input type T
translate<T extends AnyShape>(shape: Shapeable<T>, v: Vec3): T
rotate<T extends AnyShape>(shape: Shapeable<T>, angle: number, options?: {
  around?: Vec3;   // pivot point, default [0,0,0]
  axis?: Vec3;     // rotation axis, default [0,0,1] (Z)
}): T
mirror<T extends AnyShape>(shape: Shapeable<T>, options?: {
  normal?: Vec3;   // default [1,0,0]
  origin?: Vec3;   // default [0,0,0]
}): T
scale<T extends AnyShape>(shape: Shapeable<T>, factor: number, options?: {
  center?: Vec3;
}): T

// Booleans: target, tool, options — preserve first operand type T
fuse<T extends Shape3D>(a: Shapeable<T>, b: Shapeable<Shape3D>, options?: BooleanOptions): Result<T>
cut<T extends Shape3D>(base: Shapeable<T>, tool: Shapeable<Shape3D>, options?: BooleanOptions): Result<T>
intersect<T extends Shape3D>(a: Shapeable<T>, b: Shapeable<Shape3D>, options?: BooleanOptions): Result<T>

// Modifiers: shape, [optional-selection], how-much — preserve input type T
// Fillet: 2-arg form fillets ALL edges; 3-arg form fillets selected edges
fillet<T extends Shape3D>(shape: Shapeable<T>, radius: FilletRadius): Result<T>
fillet<T extends Shape3D>(shape: Shapeable<T>, edges: Edge[] | FinderFn<Edge>, radius: FilletRadius): Result<T>

// Chamfer: same overload pattern. ChamferDistance now includes distance-angle mode.
chamfer<T extends Shape3D>(shape: Shapeable<T>, distance: ChamferDistance): Result<T>
chamfer<T extends Shape3D>(shape: Shapeable<T>, edges: Edge[] | FinderFn<Edge>, distance: ChamferDistance): Result<T>

shell<T extends Shape3D>(shape: Shapeable<T>, faces: Face[] | FinderFn<Face>, thickness: number, options?: {
  tolerance?: number;  // default 1e-3
}): Result<T>
offset<T extends Shape3D>(shape: Shapeable<T>, distance: number, options?: {
  tolerance?: number;  // default 1e-6
}): Result<T>
thicken(shape: Shapeable<Face | Shell>, thickness: number): Result<Solid>

// 3D operations
extrude(face: Shapeable<Face>, height: number | Vec3): Solid
revolve(face: Shapeable<Face>, options?: {
  axis?: Vec3;       // default [0,0,1] (Z)
  around?: Vec3;     // pivot point, default [0,0,0]
  angle?: number;    // degrees, default 360
}): Result<Shape3D>
loft(wires: Shapeable<Wire>[], options?: LoftConfig): Result<Shape3D>
sweep(profile: Shapeable<Wire>, spine: Shapeable<Wire>, options?: SweepConfig): Result<Shape3D>
sweep(profile: Shapeable<Wire>, spine: Shapeable<Wire>, options: SweepConfig & { shellMode: true }): Result<[Shape3D, Wire, Wire]>
```

> **`sweep` shell mode:** The current `sweep()` accepts a `shellMode` boolean that changes the return type to `[Shape3D, Wire, Wire]` (solid + start/end wires). This is preserved via TypeScript overloads — the return type narrows based on `options.shellMode`. The `shellMode` parameter moves from a positional arg to the options object.

**`Shapeable<T>` utility type** — all functional functions accept both raw branded types and `shape()` wrappers:

```typescript
type Shapeable<T extends AnyShape> = T | Wrapped<T>;

// Internal resolver (used once, shared)
function resolve<T extends AnyShape>(s: Shapeable<T>): T {
  return (s && 'val' in s) ? s.val : s;
}
```

This keeps the type widening contained to a single utility type rather than spreading `T | Wrapped<T>` through every signature.

**Finder functions accepted directly in modifier parameters:**

```typescript
type FinderFn<T> = (finder: FinderOf<T>) => FinderOf<T>;

// Instead of two-step find-then-modify:
const edges = edgeFinder().inDirection('Z').findAll(shape);
const result = filletShape(shape, edges, 2);

// One step:
const result = fillet(shape, (e) => e.inDirection('Z'), 2);
```

The modifier internally calls `edgeFinder()`, applies the callback, and executes `findAll(shape)`. No ceremony.

**Full fillet/chamfer radius support** — variable radius is preserved, not simplified:

```typescript
// Fillet radius types (same power as current API)
type FilletRadius =
  | number                                           // constant radius
  | [number, number]                                 // variable radius (start, end)
  | ((edge: Edge) => number | [number, number] | null);  // per-edge callback

// Chamfer distance types — includes distance-angle mode (replaces chamferDistAngleShape)
type ChamferDistance =
  | number                                           // equal distance
  | [number, number]                                 // asymmetric distances (dist1, dist2)
  | { distance: number; angle: number }              // distance-angle mode (degrees)
  | ((edge: Edge) => number | [number, number] | { distance: number; angle: number } | null);

// Usage:
fillet(shape, e => e.inDirection('Z'), 2);                    // constant
fillet(shape, e => e.inDirection('Z'), [2, 5]);               // variable
fillet(shape, e => e.inDirection('Z'), (edge) => {            // per-edge
  return measureLength(edge) > 10 ? 3 : 1;
});
fillet(shape, 2);                                             // all edges, constant radius

chamfer(shape, e => e.inDirection('Z'), { distance: 2, angle: 45 }); // distance-angle
```

---

## Layer 2: Typed Shape Wrapper

### 2.1 Core Design

A lightweight, typed facade created via `shape()`. Delegates to Layer 1 functions. Returns new wrappers (immutable). Auto-unwraps `Result<T>` (throws `BrepError` on failure).

```typescript
import { shape, box, cylinder, exportSTEP } from 'brepjs';

const bracket = shape(box(30, 20, 10))
  .cut(cylinder(5, 15, { at: [15, 10, -1] }))
  .fillet((e) => e.inDirection('Z'), 2)
  .moveZ(5);

bracket.volume(); // number (delegates to measureVolume)
bracket.area();   // number
bracket.bounds(); // Bounds3D
bracket.val;      // Solid (raw branded type — rarely needed)

// Functional functions accept wrappers directly — no .val needed
exportSTEP(bracket);
```

**Entry:** `shape()` — intuitive, domain-appropriate ("I'm working with a shape").

**Exit:** `.val` property for the rare case you need the raw branded type. But functional functions (`exportSTEP`, `fuse`, `measureVolume`, etc.) accept both raw types and wrappers via `Shapeable<T>`, so you almost never need it.

**Replaces `pipe()`:** `shape()` is a strict superset of the current `pipe()` API. `pipe()` is deprecated.

### 2.2 Wrapper Type Naming — Avoiding Collision

The wrapper type is `Wrapped<T>`, not `Shape<T>`. This avoids collision with the existing `AnyShape`, `Shape3D`, `Shape1D` domain types that permeate the codebase.

```typescript
// Clear, no ambiguity:
const bracket: Wrapped<Solid> = shape(box(30, 20, 10)).cut(...);

// Never confused with the branded type:
function accepts(s: Solid) { ... }        // raw branded type
function accepts(s: Wrapped<Solid>) { ... } // chainable wrapper
function accepts(s: Shapeable<Solid>) { ... } // either
```

Users rarely write these types — inference handles most cases. But when they do, the names are distinct and self-descriptive.

### 2.3 Type-Specific Methods

The wrapper preserves type information through the chain. Methods are gated by shape type.

**Type preservation rule:** Boolean and modifier operations preserve the input type. `Wrapped3D<Solid>.cut()` returns `Wrapped3D<Solid>`, not `Wrapped3D<Shape3D>`. This is correct — OCCT booleans and modifiers return the same topological type as the first operand.

```typescript
// ── Available on all shapes ─────────────────────────────────
interface Wrapped<T extends AnyShape> {
  // Extract raw branded type (rarely needed — functional functions accept wrappers)
  val: T;

  // Transforms
  translate(v: Vec3): Wrapped<T>;
  rotate(angle: number, options?: { around?: Vec3; axis?: Vec3 }): Wrapped<T>;
  mirror(options?: { normal?: Vec3; origin?: Vec3 }): Wrapped<T>;
  scale(factor: number, options?: { center?: Vec3 }): Wrapped<T>;

  // Axis shortcuts (most common transforms in CAD)
  moveX(distance: number): Wrapped<T>;
  moveY(distance: number): Wrapped<T>;
  moveZ(distance: number): Wrapped<T>;
  rotateX(angle: number): Wrapped<T>;  // angle in degrees
  rotateY(angle: number): Wrapped<T>;  // angle in degrees
  rotateZ(angle: number): Wrapped<T>;  // angle in degrees

  // Introspection
  bounds(): Bounds3D;
  describe(): ShapeDescription;
  clone(): Wrapped<T>;

  // Escape hatch — apply any function
  apply<U extends AnyShape>(fn: (shape: T) => U): Wrapped<U>;
  applyResult<U extends AnyShape>(fn: (shape: T) => Result<U>): Wrapped<U>;
}

// ── Additional methods on 3D shapes (Solid, Shell, Compound) ──
interface Wrapped3D<T extends Shape3D> extends Wrapped<T> {
  // Booleans — preserve type T through the chain
  fuse(tool: Shapeable<Shape3D>, options?: BooleanOptions): Wrapped3D<T>;
  cut(tool: Shapeable<Shape3D>, options?: BooleanOptions): Wrapped3D<T>;
  intersect(tool: Shapeable<Shape3D>, options?: BooleanOptions): Wrapped3D<T>;

  // Modifiers (full radius/distance support — not simplified)
  // Overloads: omit edges to modify all, or pass edges/finder for specific
  fillet(radius: FilletRadius): Wrapped3D<T>;
  fillet(edges: Edge[] | FinderFn<Edge>, radius: FilletRadius): Wrapped3D<T>;
  chamfer(distance: ChamferDistance): Wrapped3D<T>;
  chamfer(edges: Edge[] | FinderFn<Edge>, distance: ChamferDistance): Wrapped3D<T>;
  shell(faces: Face[] | FinderFn<Face>, thickness: number, options?: { tolerance?: number }): Wrapped3D<T>;
  offset(distance: number, options?: { tolerance?: number }): Wrapped3D<T>;

  // Compound operations (see Section: Compound Operations)
  drill(options: DrillOptions): Wrapped3D<T>;
  pocket(options: PocketOptions): Wrapped3D<T>;
  boss(options: BossOptions): Wrapped3D<T>;
  mirrorJoin(options?: MirrorJoinOptions): Wrapped3D<T>;
  rectangularPattern(options: RectangularPatternOptions): Wrapped3D<T>;

  // Measurement
  volume(): number;
  area(): number;

  // Queries
  edges(): Edge[];
  faces(): Face[];
  wires(): Wire[];
  vertices(): Vertex[];

  // Patterns (existing)
  linearPattern(direction: Vec3, count: number, spacing: number): Wrapped3D<T>;
  circularPattern(axis: Vec3, count: number, angle?: number): Wrapped3D<T>;
}

// ── Additional methods on Edge/Wire ─────────────────────────
interface WrappedCurve<T extends Edge | Wire> extends Wrapped<T> {
  length(): number;
  startPoint(): Vec3;
  endPoint(): Vec3;
  pointAt(t?: number): Vec3;
  tangentAt(t?: number): Vec3;
  isClosed(): boolean;

  // Wire → 3D transitions
  sweep(profile: Shapeable<Wire>, options?: SweepConfig): Wrapped3D<Shape3D>;
}

// ── Additional methods on Face ──────────────────────────────
interface WrappedFace extends Wrapped<Face> {
  area(): number;
  normalAt(u?: number, v?: number): Vec3;
  center(): Vec3;
  surfaceType(): SurfaceType;
  outerWire(): Wire;
  innerWires(): Wire[];

  // 2D → 3D transitions
  extrude(height: number | Vec3): Wrapped3D<Solid>;
  revolve(options?: { axis?: Vec3; around?: Vec3; angle?: number }): Wrapped3D<Shape3D>;
}
```

### 2.4 2D Drawing & Sketcher Integration

The 2D APIs (`draw*` functions and `Sketcher`) keep their current naming. The `draw*` prefix naturally distinguishes 2D from 3D — `circle()` makes a 3D Edge, `drawCircle()` makes a 2D Drawing.

**Sketcher → shape() transition:**

The `Sketcher` already has a fluent API that returns a `Sketch`. The `shape()` wrapper picks up where the Sketcher leaves off:

```typescript
// Sketcher → extrude → 3D features
const part = shape(
  new Sketcher('XY')
    .hLine(20).vLine(10).hLine(-20)
    .close()
).extrude(5)
 .fillet(e => e.parallel('Z'), 1);

// Drawing → sketch → extrude → 3D features
const plate = shape(
  drawRectangle(50, 30)
    .fillet(3)
    .cut(drawCircle(8).translate([25, 15]))
    .sketchOnPlane('XY')
).extrude(10)
 .chamfer(e => e.inPlane('XY', 10), 1);
```

**`shape()` overloads for 2D inputs:**

```typescript
// shape() accepts Sketch, Face, and Solid/Shell — returns typed wrapper
function shape(sketch: Sketch): WrappedFace;      // Sketch → WrappedFace (can .extrude())
function shape(face: Face): WrappedFace;
function shape(solid: Solid): Wrapped3D<Solid>;
function shape(shell: Shell): Wrapped3D<Shell>;
function shape(edge: Edge): WrappedCurve<Edge>;
function shape(wire: Wire): WrappedCurve<Wire>;
function shape<T extends AnyShape>(s: T): Wrapped<T>;
```

**What stays unchanged:**
- `Sketcher` class — already fluent, no wrapping needed
- `drawRectangle`, `drawCircle`, `drawingCut`, etc. — `draw*` prefix is distinct and useful
- `cornerFinder()` — 2D equivalent of `edgeFinder()`, already clean
- `FaceSketcher` — already fluent

### 2.5 Seamless Interop — No Unwrapping Needed

Both wrapper methods AND functional functions accept either raw branded types or shape wrappers via `Shapeable<T>`. Users almost never need `.val`.

```typescript
const base = shape(box(30, 20, 10));
const tool = shape(cylinder(5, 15));

// Wrapper methods accept both:
base.cut(tool);               // wrapper
base.cut(cylinder(5, 15));    // raw

// Functional functions accept both:
fuse(base, tool);             // two wrappers
fuse(base, cylinder(5, 15));  // mixed
exportSTEP(base);             // wrapper passed directly
measureVolume(base);          // wrapper passed directly
```

Internally, functional functions call `resolve()` on each shape parameter. This is implemented once in a shared utility, not per-function.

### 2.6 Error Handling

The wrapper auto-unwraps `Result<T>`. On failure, it throws `BrepError` with full context.

```typescript
// shape(): throws on error (CadQuery-style)
try {
  const bracket = shape(box(30, 20, 10))
    .fillet((e) => e.inDirection('Z'), 100); // radius too large → throws
} catch (e) {
  if (e instanceof BrepError) {
    console.error(e.code, e.message);
  }
}

// Functional: explicit Result handling (for library code)
const result = fillet(myBox, (e) => e.inDirection('Z'), 100);
if (isErr(result)) {
  // handle gracefully
}
```

Two styles, two error strategies. User picks per-context.

---

## Compound Operations (First-Class)

These are part of the initial redesign, not deferred. They represent how CAD users *think* — in features, not in geometric primitives + boolean sequences. All compound operations are available as both functional functions and wrapper methods.

**Named option types** (referenced in both functional signatures and wrapper interface):

```typescript
interface DrillOptions {
  at: Vec2 | Vec3;          // position (Vec2 projects along axis)
  radius: number;
  depth?: number;            // default: through (computed from bounds)
  axis?: Vec3;               // default: [0,0,1] (Z)
}

interface PocketOptions {
  profile: Drawing | Wire;   // 2D shape to cut
  face?: Face | FinderFn<Face>;  // which face to pocket (default: top)
  depth: number;
}

interface BossOptions {
  profile: Drawing | Wire;
  face?: Face | FinderFn<Face>;  // which face to add onto (default: top)
  height: number;
}

interface MirrorJoinOptions {
  normal?: Vec3;    // default [1,0,0] (mirror across YZ plane)
  origin?: Vec3;
}

interface RectangularPatternOptions {
  xDir: Vec3; xCount: number; xSpacing: number;
  yDir: Vec3; yCount: number; ySpacing: number;
}
```

### drill — Hole creation

```typescript
drill<T extends Shape3D>(shape: Shapeable<T>, options: DrillOptions): Result<T>

// Functional usage (returns Result — must handle):
const plate = unwrap(drill(box(50, 30, 10), { at: [25, 15], radius: 5 }));

// Wrapper usage (auto-throws on error):
shape(box(50, 30, 10))
  .drill({ at: [25, 15], radius: 5 })
  .drill({ at: [10, 10], radius: 3, depth: 5 });
```

### pocket — 2D profile cut into a face

```typescript
pocket<T extends Shape3D>(shape: Shapeable<T>, options: PocketOptions): Result<T>

// Usage:
shape(box(50, 30, 10))
  .pocket({ profile: drawRectangle(20, 10), depth: 3 });
```

### boss — 2D profile extruded onto a face

```typescript
boss<T extends Shape3D>(shape: Shapeable<T>, options: BossOptions): Result<T>
```

### mirrorJoin — Mirror and fuse in one step

```typescript
mirrorJoin<T extends Shape3D>(shape: Shapeable<T>, options?: MirrorJoinOptions): Result<T>

// The most common use: make half a part, mirror to get the whole thing
shape(halfBracket).mirrorJoin();
```

### rectangularPattern — 2D array of a shape

```typescript
rectangularPattern<T extends Shape3D>(shape: Shapeable<T>, options: RectangularPatternOptions): Result<T>
```

---

## Diagnostic Error Messages

Current error messages are clear but don't help fix the problem:

```
"Boolean fuse operation failed"
```

The redesign adds geometric context and actionable suggestions:

```
Boolean fuse failed: shapes do not intersect or touch.
  Shape A bounds: [0, 0, 0] → [30, 20, 10]
  Shape B bounds: [50, 50, 50] → [55, 55, 65]
  Minimum distance: 34.6mm
  Suggestion: the shapes are far apart — did you forget to position one?
```

### Implementation pattern

Error enrichment happens at the public API boundary, not deep in OCCT adapter code. The public `fuse()` delegates to the kernel adapter's boolean operation, then enriches any error before returning:

```typescript
function fuseImpl<T extends Shape3D>(a: Shapeable<T>, b: Shapeable<Shape3D>): Result<T> {
  const rawA = resolve(a);
  const rawB = resolve(b);
  const result = getKernel().fuse(rawA, rawB);  // kernel adapter call
  if (isErr(result)) {
    return err(enrichBooleanError(result.error, rawA, rawB));
  }
  return result;
}

function enrichBooleanError(error: BrepError, a: Shape3D, b: Shape3D): BrepError {
  const boundsA = getBounds(a);
  const boundsB = getBounds(b);
  const distance = measureDistance(a, b);
  // Attach geometric context to the error's metadata
  return { ...error, metadata: { ...error.metadata, boundsA, boundsB, distance } };
}
```

### Priority diagnostics:

| Operation        | Common failure               | Diagnostic to add                         |
| ---------------- | ---------------------------- | ----------------------------------------- |
| Boolean fuse/cut | Shapes don't intersect       | Bounds + distance + suggestion            |
| Fillet           | Radius too large             | Max feasible radius for that edge         |
| Shell            | Thickness exceeds wall       | Wall thickness at failure point           |
| Extrude          | Zero-length vector           | Which component is zero                   |
| Loft             | Incompatible profiles        | Wire edge counts + orientation            |

---

## Layer 3: Conventions (Documentation, Not Code)

### 3.1 The Component Pattern

A CAD "component" is a typed function that takes parameters and returns a shape.
No framework required — this is just good TypeScript.

```typescript
interface BracketParams {
  width: number;
  depth: number;
  height: number;
  holeRadius: number;
  filletRadius?: number;
}

function bracket({ width, depth, height, holeRadius, filletRadius = 2 }: BracketParams): Solid {
  return shape(box(width, depth, height))
    .drill({ at: [width / 2, depth / 2], radius: holeRadius })
    .fillet((e) => e.inDirection('Z'), filletRadius)
    .val;
}
```

### 3.2 Composition

Assemblies are compositions of components. Again, just functions.

```typescript
function motorMount({ shaftDia, boltCircle, boltCount }: MotorMountParams): Solid {
  const plate = bracket({ width: 60, depth: 40, height: 8, holeRadius: shaftDia / 2 });

  const boltPositions = Array.from({ length: boltCount }, (_, i) => {
    const angle = (i / boltCount) * 360;
    return [
      30 + boltCircle * Math.cos(angle * Math.PI / 180),
      20 + boltCircle * Math.sin(angle * Math.PI / 180),
    ] as Vec2;
  });

  let result = shape(plate);
  for (const pos of boltPositions) {
    result = result.drill({ at: pos, radius: 1.5 });
  }
  return result.val;
}
```

### 3.3 Interop Between Styles

The functional and wrapper APIs interop cleanly:

```typescript
// Start functional, switch to shape()
const base = box(30, 20, 10);
const bracket = shape(base)
  .cut(cylinder(5, 15, { at: [15, 10, -1] }))
  .fillet((e) => e.inDirection('Z'), 2);

// Pass wrapper directly to functional API — no .val needed
exportSTEP(bracket);

// Use .apply() mid-chain for operations not on the wrapper
shape(box(30, 20, 10))
  .apply((s) => translate(s, [10, 0, 0]))
  .applyResult((s) => fillet(s, (e) => e.inDirection('Z'), 2));
```

---

## Migration Strategy

### Approach: Deprecated Aliases

1. **New names** are the canonical API
2. **Old names** (`makeBox`, `cutShape`, `pipe`, etc.) are re-exported as deprecated aliases
3. **Codemod** script rewrites imports: `npx brepjs-codemod migrate-v5`
4. **One major version** with both old and new names, deprecation warnings
5. **Next major version** removes old names

### Example alias:

```typescript
// src/compat.ts
/** @deprecated Use box() instead */
export const makeBox = box;

/** @deprecated Use cut() instead */
export const cutShape = cut;

/** @deprecated Use shape() instead */
export const pipe = shape;

/** @deprecated Use chamfer() with { distance, angle } instead */
export const chamferDistAngleShape = chamfer;

/** @deprecated Use toBREP() instead */
export const serializeShape = toBREP;

/** @deprecated Use fromBREP() instead */
export const deserializeShape = fromBREP;
```

### Versioning

This is a **major version bump** (v5.0.0). The changes are:

- Renamed primitives (non-breaking via aliases)
- Renamed operations (non-breaking via aliases)
- `pipe()` deprecated in favor of `shape()` (non-breaking via alias)
- `chamferDistAngleShape()` merged into `chamfer()` via `ChamferDistance` type (non-breaking via alias)
- Low-level `rotate`/`translate`/`mirror`/`scale` (OcType versions) removed from public API (breaking)
- `makePlaneFromFace()` removed from public API (breaking — use `resolvePlane()` or `Sketcher`)
- Changed constructor signatures (breaking: positional params → options object)
- `makeEllipseArc` angles changed from radians to degrees (breaking)
- `sphere` gains `at` option (non-breaking)
- `cone` gains `centered` option (non-breaking)
- `extrude()` accepts `number` shorthand for Z-direction (new feature)
- `sweep()` `shellMode` moved from positional arg to options object (breaking signature change)
- New `shape()` wrapper API (additive)
- New `Shapeable<T>` utility type (additive)
- New compound operations: `drill`, `pocket`, `boss`, `mirrorJoin`, `rectangularPattern` (additive)
- Finder callbacks accepted in modifier parameters (additive)
- Diagnostic error messages with geometric context (non-breaking improvement)

---

## What We're NOT Doing (and Why)

**TSX/JSX runtime** — Explored and rejected. Covers ~70-80% of CAD workflows but adds framework complexity (custom JSX runtime, 2D/3D context boundaries, escape hatches for multi-body work). The same composability is achieved with plain functions, without the constraints of a tree model.

**Namespace objects** (`Shape.fillet()`, `Boolean.fuse()`) — The wrapper provides better discoverability. Namespaces would add a third way to call every function without solving the core problem (what can I do with THIS shape?).

**Operator overloading for booleans** (`box - cylinder`) — TypeScript doesn't support it. Wrapper chaining (`.cut()`) is the closest equivalent and works well.

**Builder pattern for primitives** (`Box().width(30).depth(20).height(10).build()`) — More verbose than `box(30, 20, 10)` with no benefit. Options object handles the uncommon parameters.

**String-based selectors** (CadQuery's `"|Z"`, `">X"`) — Concise but opaque. Finder callbacks provide autocomplete and type safety. Brevity is not worth losing discoverability for our target audience.

**Primitives returning rich objects directly** — Considered having `box()` return a `Wrapped<Solid>` instead of a `Solid`. Rejected because it couples the wrapper to every function, hurts tree-shaking, and makes the functional API depend on the wrapper layer. The explicit `shape()` entry keeps the layers independent.

**Renaming assembly/history/projection/worker APIs** — These are stable, self-contained subsystems with clean names already. They don't suffer from the `make*`/`*Shape` prefix/suffix problem. Future redesign may address them separately if needed.

---

## Summary

The redesign has three layers plus cross-cutting improvements:

| Layer                    | What                                              | Breaking?                 |
| ------------------------ | ------------------------------------------------- | ------------------------- |
| **1. Naming + Defaults** | Short names, smart defaults, consistency          | Yes (with migration path) |
| **2. Typed Wrapper**     | `shape()` / `Wrapped<T>` for discoverability      | No (additive)             |
| **3. Conventions**       | Component pattern docs and examples               | No (documentation)        |
| **Compound Operations**  | `drill`, `pocket`, `boss`, `mirrorJoin`, patterns | No (additive)             |
| **Diagnostic Errors**    | Geometric context + suggestions in error messages | No (improvement)          |

The result: an API where experienced CAD programmers can write `box(30, 20, 10)` on day one, discover operations via `shape(s).`, compose parameterized components using plain TypeScript functions, and get helpful diagnostics when things go wrong.
