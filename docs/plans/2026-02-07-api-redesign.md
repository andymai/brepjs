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
4. **Two equal API styles** — functional imports for library code, wrapper for modeling
5. **Components are just functions** — no framework, no runtime, just TypeScript

---

## Layer 1: Clean Primitives & Operations

### 1.1 Naming Convention

Drop the `make*` prefix on primitives and the `*Shape` suffix on operations. These exist to avoid namespace collisions but cost readability on every call.

| Current               | New              | Rationale                                         |
| --------------------- | ---------------- | ------------------------------------------------- |
| `makeBox(...)`        | `box(...)`       | Every CAD API says `box`, not `makeBox`           |
| `makeCylinder(...)`   | `cylinder(...)`  | Same                                              |
| `makeSphere(...)`     | `sphere(...)`    | Same                                              |
| `makeCone(...)`       | `cone(...)`      | Same                                              |
| `makeTorus(...)`      | `torus(...)`     | Same                                              |
| `makeEllipsoid(...)`  | `ellipsoid(...)` | Same                                              |
| `makeLine(...)`       | `line(...)`      | Same                                              |
| `makeCircle(...)`     | `circle(...)`    | Same                                              |
| `makeHelix(...)`      | `helix(...)`     | Same                                              |
| `makePolygon(...)`    | `polygon(...)`   | Same                                              |
| `makeVertex(...)`     | `vertex(...)`    | Same                                              |
| `translateShape(...)` | `translate(...)` | CadQuery: `.translate()`. No suffix needed.       |
| `rotateShape(...)`    | `rotate(...)`    | Same                                              |
| `mirrorShape(...)`    | `mirror(...)`    | Same                                              |
| `scaleShape(...)`     | `scale(...)`     | Same                                              |
| `fuseShape(...)`      | `fuse(...)`      | CadQuery: `.union()`. We keep `fuse` (OCCT term). |
| `cutShape(...)`       | `cut(...)`       | Same                                              |
| `intersectShape(...)` | `intersect(...)` | Same                                              |
| `filletShape(...)`    | `fillet(...)`    | Same                                              |
| `chamferShape(...)`   | `chamfer(...)`   | Same                                              |
| `shellShape(...)`     | `shell(...)`     | Same                                              |
| `offsetShape(...)`    | `offset(...)`    | Same                                              |
| `cloneShape(...)`     | `clone(...)`     | Same                                              |
| `healShape(...)`      | `heal(...)`      | Same                                              |
| `simplifyShape(...)`  | `simplify(...)`  | Same                                              |
| `meshShape(...)`      | `mesh(...)`      | Same                                              |
| `describeShape(...)`  | `describe(...)`  | Same                                              |

**Functions that keep their names** (already clean):

- `pipe()`, `fuseAll()`, `cutAll()`, `linearPattern()`, `circularPattern()`
- `getEdges()`, `getFaces()`, `getWires()`, `getVertices()`
- `getBounds()`, `edgeFinder()`, `faceFinder()`
- All `measure*()`, `export*()`, `import*()` functions
- All curve/face introspection: `curveStartPoint()`, `normalAt()`, etc.

**Topology constructors that get clearer names:**

| Current                         | New                   | Rationale                                               |
| ------------------------------- | --------------------- | ------------------------------------------------------- |
| `makeFace(wire)`                | `face(wire)`          | Short, clear                                            |
| `makeNonPlanarFace(wire)`       | `nonPlanarFace(wire)` | Keeps qualifier                                         |
| `makeCompound(shapes)`          | `compound(shapes)`    | Same                                                    |
| `makeSolid(faces)`              | `weld(faces)`         | `solid()` is ambiguous — "weld" describes the operation |
| `makeOffset(face, d)`           | `offsetFace(face, d)` | Distinguish from `offset()` (3D offset)                 |
| `makeBSplineApproximation(...)` | `bspline(...)`        | Concise                                                 |
| `makeBezierCurve(...)`          | `bezier(...)`         | Concise                                                 |
| `makeThreePointArc(...)`        | `threePointArc(...)`  | Clear enough                                            |
| `makeTangentArc(...)`           | `tangentArc(...)`     | Clear enough                                            |
| `makeEllipseArc(...)`           | `ellipseArc(...)`     | Clear enough                                            |
| `assembleWire(edges)`           | `wire(edges)`         | Short, matches `face()` pattern                         |
| `addHolesInFace(...)`           | `faceWithHoles(...)`  | Reads as a constructor                                  |

**Migration:** Old names kept as deprecated aliases for one major version. A codemod script provided.

### 1.2 Primitive Constructor Signatures

All solid primitives follow a consistent pattern: **dimensions first, options object last**.

```typescript
// ── Solids ──────────────────────────────────────────────────

box(width: number, depth: number, height: number, options?: {
  centered?: boolean;     // default false — origin at corner
  at?: Vec3;              // position override
}): Solid

cylinder(radius: number, height: number, options?: {
  at?: Vec3;              // default [0,0,0]
  axis?: Vec3;            // default [0,0,1] (Z-up)
}): Solid

sphere(radius: number, options?: {
  at?: Vec3;              // default [0,0,0]
}): Solid

cone(bottomRadius: number, topRadius: number, height: number, options?: {
  at?: Vec3;
  axis?: Vec3;
}): Solid

torus(majorRadius: number, minorRadius: number, options?: {
  at?: Vec3;
  axis?: Vec3;
}): Solid

ellipsoid(rx: number, ry: number, rz: number, options?: {
  at?: Vec3;
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

**Key changes from current API:**

- `sphere` gains `at` option (was missing, inconsistent with cylinder/cone/torus)
- All use `at` instead of positional `center`/`location` parameters
- All use `axis` instead of positional `direction` parameters
- Options objects replace long positional parameter lists

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

**Consistent parameter ordering across all operations:**

1. The shape(s) being operated on
2. The primary parameter (radius, distance, vector)
3. Options object

```typescript
// Transforms: shape, value, options
translate<T extends AnyShape>(shape: T, v: Vec3): T
rotate<T extends AnyShape>(shape: T, angle: number, options?: {
  around?: Vec3;   // pivot point
  axis?: Vec3;     // rotation axis, default Z
}): T
mirror<T extends AnyShape>(shape: T, options?: {
  normal?: Vec3;   // default [1,0,0]
  origin?: Vec3;   // default [0,0,0]
}): T
scale<T extends AnyShape>(shape: T, factor: number, options?: {
  center?: Vec3;
}): T

// Booleans: target, tool, options
fuse(a: Shape3D, b: Shape3D, options?: BooleanOptions): Result<Shape3D>
cut(base: Shape3D, tool: Shape3D, options?: BooleanOptions): Result<Shape3D>
intersect(a: Shape3D, b: Shape3D, options?: BooleanOptions): Result<Shape3D>

// Modifiers: shape, what-to-modify, how-much, options
fillet(shape: Shape3D, edges: Edge[] | FinderFn<Edge>, radius: number): Result<Shape3D>
chamfer(shape: Shape3D, edges: Edge[] | FinderFn<Edge>, distance: number): Result<Shape3D>
shell(shape: Shape3D, faces: Face[] | FinderFn<Face>, thickness: number): Result<Shape3D>
```

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

---

## Layer 2: Typed Shape Wrapper

### 2.1 Core Design

A lightweight, typed facade created via `shape()`. Delegates to Layer 1 functions. Returns new wrappers (immutable). Auto-unwraps `Result<T>` (throws `BrepError` on failure).

```typescript
import { shape, box, cylinder, exportSTEP } from 'brepjs';

const bracket = shape(box(30, 20, 10))
  .cut(cylinder(5, 15, { at: [15, 10, -1] }))
  .fillet((e) => e.inDirection('Z'), 2)
  .translate([10, 0, 0]);

bracket.volume(); // number (delegates to measureVolume)
bracket.area(); // number
bracket.bounds(); // Bounds3D
bracket.val; // Solid (raw branded type — rarely needed)

// Functional functions accept wrappers directly — no .val needed
exportSTEP(bracket);
```

**Entry:** `shape()` — intuitive, domain-appropriate ("I'm working with a shape").

**Exit:** `.val` property for the rare case you need the raw branded type. But functional functions (`exportSTEP`, `fuse`, `measureVolume`, etc.) accept both raw types and wrappers, so you almost never need it.

### 2.2 Type-Specific Methods

The wrapper is generic but methods are gated by shape type using conditional types.

```typescript
// ── Available on all shapes ─────────────────────────────────
interface Shape<T extends AnyShape> {
  // Extract raw branded type (rarely needed — functional functions accept wrappers)
  val: T;

  // Transforms
  translate(v: Vec3): Shape<T>;
  rotate(angle: number, options?: { around?: Vec3; axis?: Vec3 }): Shape<T>;
  mirror(options?: { normal?: Vec3; origin?: Vec3 }): Shape<T>;
  scale(factor: number, options?: { center?: Vec3 }): Shape<T>;

  // Introspection
  bounds(): Bounds3D;
  describe(): ShapeDescription;
  clone(): Shape<T>;

  // Escape hatch — apply any function
  apply<U extends AnyShape>(fn: (shape: T) => U): Shape<U>;
  applyResult<U extends AnyShape>(fn: (shape: T) => Result<U>): Shape<U>;
}

// ── Additional methods on Shape3D (Solid, Shell, Compound) ──
interface Shape3D<T extends Shape3D> extends Shape<T> {
  // Booleans
  fuse(tool: Shape3D | Shape<Shape3D>, options?: BooleanOptions): Shape3D<Shape3D>;
  cut(tool: Shape3D | Shape<Shape3D>, options?: BooleanOptions): Shape3D<Shape3D>;
  intersect(
    tool: Shape3D | Shape<Shape3D>,
    options?: BooleanOptions
  ): Shape3D<Shape3D>;

  // Modifiers
  fillet(edges: Edge[] | FinderFn<Edge>, radius: number): Shape3D<Shape3D>;
  chamfer(edges: Edge[] | FinderFn<Edge>, distance: number): Shape3D<Shape3D>;
  shell(faces: Face[] | FinderFn<Face>, thickness: number): Shape3D<Shape3D>;
  offset(distance: number): Shape3D<Shape3D>;

  // Measurement
  volume(): number;
  area(): number;

  // Queries
  edges(): Edge[];
  faces(): Face[];
  wires(): Wire[];
  vertices(): Vertex[];

  // Patterns
  linearPattern(direction: Vec3, count: number, spacing: number): Shape3D<Shape3D>;
  circularPattern(axis: Vec3, count: number, angle?: number): Shape3D<Shape3D>;
}

// ── Additional methods on Edge/Wire ─────────────────────────
interface ShapeCurve<T extends Edge | Wire> extends Shape<T> {
  length(): number;
  startPoint(): Vec3;
  endPoint(): Vec3;
  pointAt(t?: number): Vec3;
  tangentAt(t?: number): Vec3;
  isClosed(): boolean;
}

// ── Additional methods on Face ──────────────────────────────
interface ShapeFace extends Shape<Face> {
  area(): number;
  normalAt(u?: number, v?: number): Vec3;
  center(): Vec3;
  surfaceType(): SurfaceType;
  outerWire(): Wire;
  innerWires(): Wire[];

  // 2D → 3D transitions
  extrude(height: number | Vec3): Shape3D<Solid>;
  revolve(options?: { axis?: Vec3; angle?: number }): Shape3D<Shape3D>;
}
```

### 2.3 Seamless Interop — No Unwrapping Needed

Both wrapper methods AND functional functions accept either raw branded types or shape wrappers. Users almost never need `.val`.

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

Internally, functional functions check for a `.val` property and extract the raw type when present. This is implemented once in a shared utility, not per-function.

### 2.4 Error Handling

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
    .cut(cylinder(holeRadius, height + 2, { at: [width / 2, depth / 2, -1] }))
    .fillet((e) => e.inDirection('Z'), filletRadius)
    .val;
}
```

### 3.2 Composition

Assemblies are compositions of components. Again, just functions.

```typescript
function motorMount({ shaftDia, boltCircle, boltCount }: MotorMountParams): Solid {
  const plate = bracket({ width: 60, depth: 40, height: 8, holeRadius: shaftDia / 2 });

  const boltHoles = Array.from({ length: boltCount }, (_, i) => {
    const angle = (i / boltCount) * 360;
    const x = boltCircle * Math.cos((angle * Math.PI) / 180);
    const y = boltCircle * Math.sin((angle * Math.PI) / 180);
    return cylinder(1.5, 10, { at: [30 + x, 20 + y, -1] });
  });

  return shape(plate).cut(fuseAll(boltHoles)).val;
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

## Compound Operations (Future Addition)

These are not part of the initial redesign but form a natural follow-up.
Included here to show the direction.

```typescript
// Drill a hole through a shape at a position
drill(shape: Shape3D, options: {
  at: Vec2 | Vec3;
  radius: number;
  depth?: number;     // default: through
  axis?: Vec3;        // default: Z
}): Result<Shape3D>

// 2D pattern of a feature
rectangularPattern(shape: Shape3D, options: {
  xDir: Vec3; xCount: number; xSpacing: number;
  yDir: Vec3; yCount: number; ySpacing: number;
}): Result<Shape3D>

// Mirror and join in one step
mirrorJoin(shape: Shape3D, options?: {
  normal?: Vec3;
  origin?: Vec3;
}): Result<Shape3D>
```

---

## Migration Strategy

### Approach: Deprecated Aliases

1. **New names** are the canonical API
2. **Old names** (`makeBox`, `cutShape`, etc.) are re-exported as deprecated aliases
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
```

### Versioning

This is a **major version bump** (v5.0.0). The changes are:

- Renamed primitives (non-breaking via aliases)
- Renamed operations (non-breaking via aliases)
- Changed constructor signatures (breaking: `makeBox(corner1, corner2)` → `box(w, d, h)`)
- `makeEllipseArc` angles changed from radians to degrees (breaking)
- `sphere` gains `at` option (non-breaking)
- New `shape()` API (additive)
- Finder callbacks accepted in modifier parameters (additive)

---

## What We're NOT Doing (and Why)

**TSX/JSX runtime** — Explored and rejected. Covers ~70-80% of CAD workflows but adds framework complexity (custom JSX runtime, 2D/3D context boundaries, escape hatches for multi-body work). The same composability is achieved with plain functions, without the constraints of a tree model.

**Namespace objects** (`Shape.fillet()`, `Boolean.fuse()`) — The wrapper provides better discoverability. Namespaces would add a third way to call every function without solving the core problem (what can I do with THIS shape?).

**Operator overloading for booleans** (`box - cylinder`) — TypeScript doesn't support it. Wrapper chaining (`.cut()`) is the closest equivalent and works well.

**Builder pattern for primitives** (`Box().width(30).depth(20).height(10).build()`) — More verbose than `box(30, 20, 10)` with no benefit. Options object handles the uncommon parameters.

**String-based selectors** (CadQuery's `"|Z"`, `">X"`) — Concise but opaque. Finder callbacks provide autocomplete and type safety. Brevity is not worth losing discoverability for our target audience.

---

## Summary

The redesign has three layers:

| Layer                    | What                                      | Breaking?                 |
| ------------------------ | ----------------------------------------- | ------------------------- |
| **1. Naming + Defaults** | Short names, smart defaults, consistency  | Yes (with migration path) |
| **2. Typed Wrapper**     | `shape()` for discoverability and chaining | No (additive)             |
| **3. Conventions**       | Component pattern docs and examples       | No (documentation)        |

The result: an API where experienced CAD programmers can write `box(30, 20, 10)` on day one, discover operations via `shape(s).`, and compose parameterized components using plain TypeScript functions.
