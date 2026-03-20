# Core

Layer 1 foundation providing memory management, immutable geometry primitives, Result types, error handling, and kernel boundary conversions.

## Architecture

```mermaid
graph TB
    subgraph "Geometry Primitives"
        types[types.ts<br/>Vec3/Vec2/PointInput]
        vecOps[vecOps.ts<br/>Pure vector math]
        planeTypes[planeTypes.ts<br/>Plane interface]
        planeOps[planeOps.ts<br/>Pure plane operations]
    end

    subgraph "Kernel Boundary"
        kernelBoundary[kernelBoundary.ts<br/>Vec3 ↔ kernel type conversions<br/><i>internal to abstraction layer</i>]
    end

    subgraph "Memory Management"
        disposal[disposal.ts<br/>Symbol.dispose + GC]
        shapeTypes[shapeTypes.ts<br/>Branded shape types]
    end

    subgraph "Error Handling"
        result[result.ts<br/>Result&lt;T,E&gt; monad]
        errors[errors.ts<br/>BrepError types]
    end

    subgraph "Helpers"
        geometryHelpers[geometryHelpers.ts<br/>makePlane + mirror]
    end

    types --> vecOps
    types --> planeOps
    planeTypes --> planeOps
    vecOps --> planeOps
    vecOps --> kernelBoundary
    planeOps --> kernelBoundary
    planeOps --> geometryHelpers
    kernelBoundary --> kernel([kernel/])
    disposal --> shapeTypes
    result --> errors
    errors --> utils([utils/bug.ts])

    style types fill:#e1f5ff
    style vecOps fill:#e1f5ff
    style planeTypes fill:#e1f5ff
    style planeOps fill:#e1f5ff
    style kernelBoundary fill:#fff4e1
    style disposal fill:#e8f5e9
    style shapeTypes fill:#e8f5e9
    style result fill:#fce4ec
    style errors fill:#fce4ec
    style geometryHelpers fill:#f5f5f5
```

## Key Files

| File                 | Purpose                                                        | Dependencies                                                  |
| -------------------- | -------------------------------------------------------------- | ------------------------------------------------------------- |
| `types.ts`           | Core geometry types: `Vec3`, `Vec2`, `PointInput`, `Direction` | None                                                          |
| `vecOps.ts`          | Pure vector math operations (add, cross, normalize, etc.)      | `types.ts`                                                    |
| `planeTypes.ts`      | `Plane` interface, `PlaneName` union, `PlaneInput`             | `types.ts`                                                    |
| `planeOps.ts`        | Pure plane operations (create, transform, coord conversion)    | `types.ts`, `planeTypes.ts`, `vecOps.ts`, `kernelBoundary.ts` |
| `kernelBoundary.ts`  | Bridge between Vec3/Plane and kernel geometry types            | `types.ts`, `kernel/`                                         |
| `disposal.ts`        | TC39 `Symbol.dispose` resource management + GC safety net      | `kernel/types.js`                                             |
| `shapeTypes.ts`      | Branded shape types (`Vertex`, `Edge`, `Solid`, etc.)          | `disposal.ts`, `kernel/`                                      |
| `result.ts`          | Rust-style `Result<T,E>` for error handling                    | None                                                          |
| `errors.ts`          | `BrepError` types and constructor functions                    | `utils/bug.js`                                                |
| `constants.ts`       | `HASH_CODE_MAX`, `DEG2RAD`, `RAD2DEG`                          | None                                                          |
| `definitionMaps.ts`  | `CurveType` union, lazy kernel enum mappings                   | None                                                          |
| `kernelCall.ts`      | `kernelCall`, `kernelCallRaw`, `kernelCallScoped` wrappers     | `kernel/`, `disposal.ts`, `result.ts`                         |
| `memory.ts`          | Re-export hub for disposal utilities                           | `disposal.ts`                                                 |
| `geometryHelpers.ts` | `makePlane` factory + `mirror` kernel helper                   | `planeOps.ts`, `vecOps.ts`                                    |

## Geometry Primitives (Functional, Immutable)

### Type Definitions (`types.ts`)

**Core types:**

- `Vec3 = readonly [number, number, number]` - Immutable 3D vector/point
- `Vec2 = readonly [number, number]` - Immutable 2D point
- `PointInput` - Union accepting `Vec3 | Vec2 | readonly [n,n,n] | readonly [n,n]`
- `Direction` - Either `Vec3` or named axis `'X' | 'Y' | 'Z'`

**Conversion functions:**

- `toVec3(p: PointInput): Vec3` - Normalize any input to Vec3 (2D gets z=0)
- `toVec2(p: PointInput): Vec2` - Extract 2D coordinates (drops z)
- `resolveDirection(d: Direction): Vec3` - Convert named axis or pass through Vec3

### Vector Operations (`vecOps.ts`)

**Arithmetic:**

```typescript
vecAdd(a, b); // a + b
vecSub(a, b); // a - b
vecScale(v, s); // v * s
vecNegate(v); // -v
```

**Products:**

```typescript
vecDot(a, b); // a · b (scalar)
vecCross(a, b); // a × b (vector)
```

**Length/Distance:**

```typescript
vecLength(v); // ||v||
vecLengthSq(v); // ||v||² (faster, no sqrt)
vecDistance(a, b); // ||b - a||
vecNormalize(v); // v / ||v|| (returns [0,0,0] if zero)
```

**Comparison:**

```typescript
vecEquals(a, b, (tolerance = 1e-5)); // Component-wise comparison
vecIsZero(v, (tolerance = 1e-10)); // ||v||² < tolerance²
```

**Geometry:**

```typescript
vecAngle(a, b); // Angle between vectors (radians)
vecProjectToPlane(v, origin, normal); // Project onto plane
vecRotate(v, axis, angleRad); // Rodrigues rotation formula
```

### Plane Types (`planeTypes.ts`)

```typescript
interface Plane {
  readonly origin: Vec3;
  readonly xDir: Vec3; // Normalized X axis of plane coordinate system
  readonly yDir: Vec3; // Normalized Y axis (orthogonal to x and z)
  readonly zDir: Vec3; // Normalized normal vector
}

type PlaneName =
  | 'XY'
  | 'YZ'
  | 'ZX'
  | 'XZ'
  | 'YX'
  | 'ZY'
  | 'front'
  | 'back'
  | 'left'
  | 'right'
  | 'top'
  | 'bottom';

type PlaneInput = Plane | PlaneName;
```

### Plane Operations (`planeOps.ts`)

**Construction:**

```typescript
createPlane(
  origin: Vec3,
  xDirection: Vec3 | null = null,  // Auto-derived from kernel if null
  normal: Vec3 = [0, 0, 1]
): Plane

createNamedPlane(
  name: PlaneName,
  sourceOrigin: PointInput | number = [0, 0, 0]  // Offset along normal if number
): Result<Plane>

resolvePlane(input: PlaneInput, origin?: PointInput | number): Result<Plane>
```

**Coordinate Transforms:**

```typescript
planeToWorld(plane: Plane, local: Vec2): Vec3    // 2D → 3D
planeToLocal(plane: Plane, world: Vec3): Vec2    // 3D → 2D projection
```

**Transformations (all pure, return new Plane):**

```typescript
translatePlane(plane, offset); // Move by vector
pivotPlane(plane, angleDeg, axis); // Rotate plane around axis
```

## Kernel Boundary Layer (`kernelBoundary.ts`)

Bridges brepjs functional geometry with kernel-internal mutable types. **Critical:** All kernel boundary objects are temporary and require manual cleanup.

### Direct Conversions (Caller Must Delete)

```typescript
toOcVec(v: Vec3): gp_Vec          // Caller must call .delete()
toOcPnt(v: Vec3): gp_Pnt          // Caller must call .delete()
toOcDir(v: Vec3): gp_Dir          // Caller must call .delete()
```

### Extraction (No Cleanup Needed)

```typescript
fromOcVec(ocVec): Vec3
fromOcPnt(ocPnt): Vec3
fromOcDir(ocDir): Vec3
```

### Scoped Conversions (Auto-Cleanup)

```typescript
withOcVec<T>(v: Vec3, fn: (ocVec: gp_Vec) => T): T
withOcPnt<T>(v: Vec3, fn: (ocPnt: gp_Pnt) => T): T
withOcDir<T>(v: Vec3, fn: (ocDir: gp_Dir) => T): T
```

**Example:**

```typescript
const result = withOcPnt([1, 2, 3], (pnt) => {
  // Use pnt here
  return someKernelOperation(pnt);
}); // pnt.delete() called automatically
```

### Axis Helpers (Caller Must Delete)

```typescript
makeOcAx1(center: Vec3, dir: Vec3): gp_Ax1
makeOcAx2(origin: Vec3, zDir: Vec3, xDir?: Vec3): gp_Ax2
makeOcAx3(origin: Vec3, zDir: Vec3, xDir?: Vec3): gp_Ax3
```

## Memory Management (`disposal.ts`, `memory.ts`)

Uses **TC39 Explicit Resource Management** (`Symbol.dispose`) with `FinalizationRegistry` as safety net.

### Core Interfaces

```typescript
interface ShapeHandle {
  readonly wrapped: OcShape; // Raw kernel shape
  readonly disposed: boolean;
  [Symbol.dispose](): void;
}

interface OcHandle<T extends Deletable> {
  readonly value: T;
  readonly disposed: boolean;
  [Symbol.dispose](): void;
}
```

### Handle Creation

```typescript
createHandle(ocShape: OcShape): ShapeHandle
createOcHandle<T>(ocObj: T): OcHandle<T>
```

**Usage with `using` declaration (auto-disposal):**

```typescript
using solid = createSolid(ocShape);
// solid.dispose() called automatically at end of scope
```

### Disposal Scope

```typescript
class DisposalScope {
  register<T extends Deletable>(resource: T): T;
  track<T extends Disposable>(disposable: T): T;
  [Symbol.dispose](): void;
}

function withScope<T>(fn: (scope: DisposalScope) => T): T;
function withScopeResult<T, E = BrepError>(
  fn: (scope: DisposalScope) => Result<T, E>
): Result<T, E>;
function withScopeResultAsync<T, E = BrepError>(
  fn: (scope: DisposalScope) => Promise<Result<T, E>>
): Promise<Result<T, E>>;
```

**`using` declaration (preferred — auto-disposes at block end):**

```typescript
using scope = new DisposalScope();
const pnt = scope.register(new oc.gp_Pnt_3(0, 0, 0));
// scope.delete() called automatically, pnt deleted
```

**`withScopeResult` — for Result-returning functions:**

```typescript
return withScopeResult((scope) => {
  const axis = scope.register(makeOcAx1(origin, dir));
  return ok(castShape(getKernel().makeSomething(axis)) as Solid);
  // axis deleted automatically on both ok() and err() paths
});
```

**`withScopeResultAsync` — for async Result-returning functions:**

```typescript
return withScopeResultAsync(async (scope) => {
  const buf = scope.register(allocateBuffer());
  const data = await loadAsync();
  return ok(processBuffer(buf, data));
  // buf deleted after promise settles
});
```

> **Note:** The `await` in `return await fn(scope)` inside `withScopeResultAsync` is intentional — the TC39 `using` block is synchronous; without `await`, the scope would be disposed before the promise resolves.

### Lifecycle Guard

```typescript
function isLive(handle: ShapeHandle | OcHandle<Deletable>): boolean;
```

Named alternative to `!handle.disposed`. Use for validation at function boundaries:

```typescript
if (!isLive(handle)) return err(validationError('DISPOSED_HANDLE', '...'));
```

### Closure Cleanup (FinalizationRegistry)

For objects that must **outlive their creating function** (e.g., objects captured by a returned closure), use `registerForCleanup` instead of `DisposalScope`:

```typescript
const predicate = (shape: AnyShape) => distTool.distance(shape) < threshold;

for (const obj of [pnt, vtxMaker, distTool, progress]) {
  registerForCleanup(predicate, obj);
}
// Each obj is deleted by GC when predicate is collected
return predicate;
```

### Kernel Call Wrappers (`kernelCall.ts`)

Thin wrappers that run kernel operations inside `Result<AnyShape>` and handle errors uniformly:

```typescript
// Wraps a kernel call; catches exceptions and wraps in BrepError.
kernelCall(fn: () => OcShape, code: string, message: string, kind?: BrepErrorKind): Result<AnyShape>

// Like kernelCall but returns the raw OcShape (no branded wrapping).
kernelCallRaw(fn: () => OcShape, code: string, message: string, kind?: BrepErrorKind): Result<OcShape>

// Like kernelCall but provides a DisposalScope — for operations that need intermediate kernel objects.
kernelCallScoped(fn: (scope: DisposalScope) => OcShape, code: string, message: string, kind?: BrepErrorKind): Result<AnyShape>
```

**Example:**

```typescript
return kernelCallScoped(
  (scope) => {
    const axis = scope.register(makeOcAx1(origin, dir));
    return oc.BRepBuilderAPI_MakeRevol_1(shape.wrapped, axis).Shape();
    // axis deleted automatically even if Shape() throws
  },
  'REVOLUTION_FAILED',
  'Revolution failed'
);
```

## Shape Types (`shapeTypes.ts`)

**Branded types** for type-safe shape discrimination without class hierarchies.

### Type Hierarchy

```typescript
type ShapeKind = 'vertex' | 'edge' | 'wire' | 'face' | 'shell' | 'solid' | 'compsolid' | 'compound';
type Dimension = '2D' | '3D';

// Base types carry a phantom D parameter (default '3D') for compile-time 2D/3D safety
type Vertex<D extends Dimension = '3D'> = ShapeHandle & { readonly [__brand]: 'vertex'; readonly [__dim]: D };
type Edge<D extends Dimension = '3D'> = ShapeHandle & { readonly [__brand]: 'edge'; readonly [__dim]: D };
type Wire<D extends Dimension = '3D'> = ShapeHandle & { readonly [__brand]: 'wire'; readonly [__dim]: D };
type Face<D extends Dimension = '3D'> = ShapeHandle & { readonly [__brand]: 'face'; readonly [__dim]: D };
type Shell = ShapeHandle & { readonly [__brand]: 'shell'; readonly [__dim]: '3D' };
type Solid = ShapeHandle & { readonly [__brand]: 'solid'; readonly [__dim]: '3D' };
type CompSolid = ShapeHandle & { readonly [__brand]: 'compsolid'; readonly [__dim]: '3D' };
type Compound<D extends Dimension = '3D'> = ShapeHandle & { readonly [__brand]: 'compound'; readonly [__dim]: D };

type AnyShape<D extends Dimension = '3D'> = Vertex<D> | Edge<D> | Wire<D> | Face<D> | Shell | Solid | ...;
type Shape1D<D extends Dimension = '3D'> = Edge<D> | Wire<D>;
type Shape3D = Shell | Solid | CompSolid | Compound<'3D'>;
```

### Validity Brands

Layered on top of base types to express stronger invariants at compile time:

```typescript
type ClosedWire<D extends Dimension = '3D'> = Wire<D> & { readonly [__closed]: true };
type OrientedFace<D extends Dimension = '3D'> = Face<D> & { readonly [__oriented]: true };
type ManifoldShell = Shell & { readonly [__manifold]: true };
type ValidSolid = Solid & { readonly [__valid]: true };
```

Functions declare exactly what they need:

```typescript
face(wire: ClosedWire): Result<OrientedFace>     // Requires a closed wire
extrude(face: OrientedFace, height: number): ...  // Requires an oriented face
```

Smart constructors and type guards for runtime validation:

```typescript
closedWire(w: Wire): Result<ClosedWire, string>   // Runtime check
isClosedWire(w: Wire): w is ClosedWire             // Type guard
isOrientedFace(f: Face): f is OrientedFace
isManifoldShell(s: Shell): s is ManifoldShell
isValidSolid(s: Solid): s is ValidSolid
```

### Factory Functions

**Use these instead of manual casting:**

```typescript
createVertex(ocShape: OcShape): Vertex
createEdge(ocShape: OcShape): Edge
createWire(ocShape: OcShape): Wire
createFace(ocShape: OcShape): Face
createShell(ocShape: OcShape): Shell
createSolid(ocShape: OcShape): Solid
createCompSolid(ocShape: OcShape): CompSolid
createCompound(ocShape: OcShape): Compound
```

### Type Guards (Runtime Checks)

```typescript
getShapeKind(shape: AnyShape): ShapeKind

isVertex(s: AnyShape): s is Vertex
isEdge(s: AnyShape): s is Edge
isWire(s: AnyShape): s is Wire
isFace(s: AnyShape): s is Face
isShell(s: AnyShape): s is Shell
isSolid(s: AnyShape): s is Solid
isCompound(s: AnyShape): s is Compound
isShape3D(s: AnyShape): s is Shape3D
isShape1D(s: AnyShape): s is Shape1D
```

### Shape Casting

```typescript
castShape(ocShape: OcShape): AnyShape
```

Performs kernel topology downcast and wraps in correct branded type.

## Error Handling (`result.ts`, `errors.ts`)

### Result Type (Rust-inspired)

```typescript
type Result<T, E = BrepError> = Ok<T> | Err<E>;

interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

interface Err<E> {
  readonly ok: false;
  readonly error: E;
}
```

**Constructors:**

```typescript
ok<T>(value: T): Ok<T>
err<E>(error: E): Err<E>
const OK: Ok<undefined>  // Convenience constant
```

**Type Guards:**

```typescript
isOk<T, E>(result: Result<T, E>): result is Ok<T>
isErr<T, E>(result: Result<T, E>): result is Err<E>
```

**Combinators:**

```typescript
map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E>
mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F>
andThen<T, U, E>(result: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E>
flatMap = andThen  // Alias
```

**Extraction:**

```typescript
unwrap<T, E>(result: Result<T, E>): T                // Throws on Err
unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T
unwrapOrElse<T, E>(result: Result<T, E>, fn: (error: E) => T): T
unwrapErr<T, E>(result: Result<T, E>): E            // Throws on Ok
```

**Pattern Matching:**

```typescript
match<T, E, U>(
  result: Result<T, E>,
  handlers: { ok: (value: T) => U; err: (error: E) => U }
): U
```

**Collection:**

```typescript
collect<T, E>(results: Result<T, E>[]): Result<T[], E>  // Short-circuits on first Err
```

**Try-Catch Boundary:**

```typescript
tryCatch<T, E>(fn: () => T, mapError: (error: unknown) => E): Result<T, E>
tryCatchAsync<T, E>(fn: () => Promise<T>, mapError: (error: unknown) => E): Promise<Result<T, E>>
```

### Error Types

```typescript
type BrepErrorKind =
  | 'KERNEL_OPERATION' // Kernel API failures
  | 'VALIDATION' // Invalid input/state
  | 'TYPE_CAST' // Shape type mismatches
  | 'SKETCHER_STATE' // Sketcher workflow errors
  | 'MODULE_INIT' // WASM/kernel initialization
  | 'COMPUTATION' // Mathematical computation failures
  | 'IO' // File I/O errors
  | 'QUERY'; // Query operation failures

interface BrepError {
  readonly kind: BrepErrorKind;
  readonly code: string;
  readonly message: string;
  readonly cause?: unknown;
}
```

**Constructor Functions:**

```typescript
occtError(code, message, cause?): BrepError
validationError(code, message, cause?): BrepError
typeCastError(code, message, cause?): BrepError
sketcherStateError(code, message, cause?): BrepError
moduleInitError(code, message, cause?): BrepError
computationError(code, message, cause?): BrepError
ioError(code, message, cause?): BrepError
queryError(code, message, cause?): BrepError
```

**Bug Reporting (re-exported from `utils/bug.ts`):**

```typescript
bug(message: string): never          // Throws BrepBugError
class BrepBugError extends Error
```

## Constants (`constants.ts`)

```typescript
export const HASH_CODE_MAX = 2147483647; // Max int32 for kernel hash codes
export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;
```

## Definition Maps (`definitionMaps.ts`)

Lazy mappings between brepjs types and kernel enums.

```typescript
type CurveType =
  | 'LINE'
  | 'CIRCLE'
  | 'ELLIPSE'
  | 'HYPERBOLA'
  | 'PARABOLA'
  | 'BEZIER_CURVE'
  | 'BSPLINE_CURVE'
  | 'OFFSET_CURVE'
  | 'OTHER_CURVE';
```

Kernel enum mappings are created lazily on first access.

## Gotchas

1. **Vec3/Vec2 are readonly tuples** - Never mutate. Always create new tuples:

   ```typescript
   // Wrong:
   const v: Vec3 = [1, 2, 3];
   v[0] = 5; // TypeScript error: readonly property

   // Right:
   const v2 = vecAdd(v, [4, 0, 0]);
   ```

2. **Kernel cleanup responsibility** - Direct conversions require manual cleanup:

   ```typescript
   // Wrong (memory leak):
   const pnt = toOcPnt([0, 0, 0]);
   someOperation(pnt);
   // pnt never deleted!

   // Right:
   const pnt = toOcPnt([0, 0, 0]);
   try {
     someOperation(pnt);
   } finally {
     pnt.delete();
   }

   // Better - scoped:
   withOcPnt([0, 0, 0], (pnt) => someOperation(pnt));
   ```

3. **FinalizationRegistry is safety net, not primary cleanup** - Always dispose explicitly:

   ```typescript
   // Risky (relies on GC):
   function makeSolid() {
     return createSolid(ocShape); // GC will eventually clean up
   }

   // Proper:
   using solid = createSolid(ocShape); // Deterministic cleanup
   ```

4. **Branded types use unique symbols** - Don't bypass type system:

   ```typescript
   // Wrong:
   const solid = ocShape as Solid; // Brand not applied

   // Right:
   const solid = createSolid(ocShape); // Factory applies brand
   // Or:
   const shape = castShape(ocShape); // Auto-detects type
   ```

5. **Tolerance defaults differ by use case**:

   ```typescript
   vecEquals(a, b); // Default: 1e-5 (geometric equality)
   vecIsZero(v); // Default: 1e-10 (stricter for zero check)
   ```

6. **Plane normal auto-normalization** - `createPlane` normalizes inputs:

   ```typescript
   const plane = createPlane([0, 0, 0], null, [0, 0, 5]);
   // plane.zDir === [0, 0, 1] (normalized)
   ```

7. **Named plane origin offsets** - Number argument offsets along normal:

   ```typescript
   createNamedPlane('XY', 5); // Plane at z=5
   createNamedPlane('XY', [1, 2, 3]); // Plane at [1,2,3]
   ```

8. **Result type short-circuits** - `collect()` stops at first error:

   ```typescript
   const results = [ok(1), err('fail'), ok(3)];
   const combined = collect(results); // Err('fail'), never evaluates ok(3)
   ```

9. **Disposal order matters** - `DisposalScope` disposes in **reverse order (LIFO)**:
   ```typescript
   withScope((scope) => {
     const a = scope.register(makeA()); // Registered first
     const b = scope.register(makeB()); // Registered second
     // b disposed first, then a
   });
   ```
