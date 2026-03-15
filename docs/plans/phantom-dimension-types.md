# Phantom Dimension Types — Implementation Plan

> **Goal**: Make it a compile-time error to mix 2D and 3D shapes in operations that
> require same-dimension operands. Consumers literally cannot write wrong-dimension code.
>
> **Scope**: Full enforcement across all public APIs. Semver major bump.
> Rich IDE error messages via template literal types.

---

## 1. Design Overview

### Core Idea

Add a phantom type parameter `D extends Dimension` to every branded shape type.
Operations constrain `D` so that the compiler rejects dimension mismatches before
any code runs.

```ts
type Dimension = '2D' | '3D';

// Shapes gain a dimension axis
type Edge<D extends Dimension = '3D'> = ShapeHandle & {
  readonly [__brand]: 'edge';
  readonly [__dim]: D;
};
type Solid = ShapeHandle & { readonly [__brand]: 'solid'; readonly [__dim]: '3D' };

// Operations constrain dimensions
function fuse(a: Shape3D, b: Shape3D): Result<Shape3D>; // unchanged for 3D-only ops
function translate<D extends Dimension, T extends AnyShape<D>>(s: T, v: Vec3): T; // preserves D
function extrude(face: Face<Dimension>, vec: Vec3): Result<Solid>; // any-dim face → 3D solid
```

### Key Principles

1. **Default = '3D'**: All shape types default to `'3D'`. Existing consumer code that
   never touches 2D sees zero type noise — `Edge` means `Edge<'3D'>`.
2. **Inherently-3D types have no parameter**: `Solid`, `CompSolid`, `Shell` are always
   3D by definition. Their dimension is fixed, not parameterized.
3. **Narrowing via type guards**: `is3D(shape)` narrows `AnyShape<Dimension>` to
   `AnyShape<'3D'>`. Same pattern as `isOk()` on `Result<T>`.
4. **Template literal error messages**: Custom error types produce readable IDE
   diagnostics like `"❌ fuse: Cannot combine Shape<2D> with Shape<3D>"`.

---

## 2. Type Architecture

### 2.1 Dimension Phantom Brand

```ts
// src/core/shapeTypes.ts — new declarations

/** The geometric dimension a shape is embedded in. */
export type Dimension = '2D' | '3D';

/** Phantom brand key for dimension tracking (never exists at runtime). */
declare const __dim: unique symbol;
```

### 2.2 Updated Branded Types

```ts
// Dimension-parameterized types (can be 2D or 3D)
type Vertex<D extends Dimension = '3D'> = ShapeHandle & {
  readonly [__brand]: 'vertex';
  readonly [__dim]: D;
};
type Edge<D extends Dimension = '3D'> = ShapeHandle & {
  readonly [__brand]: 'edge';
  readonly [__dim]: D;
};
type Wire<D extends Dimension = '3D'> = ShapeHandle & {
  readonly [__brand]: 'wire';
  readonly [__dim]: D;
};
type Face<D extends Dimension = '3D'> = ShapeHandle & {
  readonly [__brand]: 'face';
  readonly [__dim]: D;
};
type Compound<D extends Dimension = '3D'> = ShapeHandle & {
  readonly [__brand]: 'compound';
  readonly [__dim]: D;
};

// Fixed-dimension types (always 3D — no type parameter)
type Shell = ShapeHandle & { readonly [__brand]: 'shell'; readonly [__dim]: '3D' };
type Solid = ShapeHandle & { readonly [__brand]: 'solid'; readonly [__dim]: '3D' };
type CompSolid = ShapeHandle & { readonly [__brand]: 'compsolid'; readonly [__dim]: '3D' };
```

### 2.3 Union Types

```ts
/** Any shape in a specific dimension. */
export type AnyShape<D extends Dimension = '3D'> =
  | Vertex<D>
  | Edge<D>
  | Wire<D>
  | Face<D>
  | Compound<D>
  | (D extends '3D' ? Shell | Solid | CompSolid : never);

/** Shape that is definitively 3D (solid-like). Unchanged from today's meaning. */
export type Shape3D = Shell | Solid | CompSolid | Compound<'3D'>;

/** Shape that is definitively 1D. */
export type Shape1D<D extends Dimension = '3D'> = Edge<D> | Wire<D>;

/** Any shape whose dimension is unknown (e.g. from file import). */
export type UnknownDimShape = AnyShape<'2D'> | AnyShape<'3D'>;
```

### 2.4 Template Literal Error Types

```ts
// src/core/typeErrors.ts — new file

/**
 * Compile-time error message for dimension mismatches.
 * When a consumer passes the wrong dimension, the IDE shows:
 *   Type '"❌ fuse: both operands must be 3D, got 2D"'
 *   is not assignable to type 'Shape3D'.
 */
export type DimensionError<
  Op extends string,
  Expected extends string,
  Got extends string,
> = `❌ ${Op}: expected ${Expected}, got ${Got}`;

/**
 * Conditional type that resolves to T if D matches Expected,
 * otherwise resolves to a readable error string type.
 */
export type RequireDimension<
  D extends Dimension,
  Expected extends Dimension,
  T,
  Op extends string = 'operation',
> = D extends Expected ? T : DimensionError<Op, Expected, D>;

/**
 * Asserts both dimensions are equal at the type level.
 * Usage: SameDimension<D1, D2, 'fuse'> resolves to D1 if equal,
 * or a readable error if not.
 */
export type SameDimension<
  A extends Dimension,
  B extends Dimension,
  Op extends string = 'operation',
> = A extends B ? A : DimensionError<Op, A, B>;
```

---

## 3. Factory & Guard Updates

### 3.1 Shape Factories

```ts
// Dimension-aware factories
export function createVertex<D extends Dimension = '3D'>(ocShape: KernelShape): Vertex<D> { ... }
export function createEdge<D extends Dimension = '3D'>(ocShape: KernelShape): Edge<D> { ... }
export function createWire<D extends Dimension = '3D'>(ocShape: KernelShape): Wire<D> { ... }
export function createFace<D extends Dimension = '3D'>(ocShape: KernelShape): Face<D> { ... }
export function createCompound<D extends Dimension = '3D'>(ocShape: KernelShape): Compound<D> { ... }

// Fixed-dimension factories (unchanged signatures)
export function createShell(ocShape: KernelShape): Shell { ... }
export function createSolid(ocShape: KernelShape): Solid { ... }
export function createCompSolid(ocShape: KernelShape): CompSolid { ... }

// Dimension-aware castShape
export function castShape<D extends Dimension = '3D'>(ocShape: KernelShape): AnyShape<D> { ... }
```

### 3.2 Dimension Type Guards (New)

```ts
/** Narrow an unknown-dimension shape to 3D. */
export function is3D(s: UnknownDimShape): s is AnyShape<'3D'> {
  // All shapes from the kernel default to 3D embedding.
  // 2D shapes only exist when explicitly created via 2D API.
  return (s as { __is2D?: boolean }).__is2D !== true;
}

/** Narrow an unknown-dimension shape to 2D. */
export function is2D(s: UnknownDimShape): s is AnyShape<'2D'> {
  return (s as { __is2D?: boolean }).__is2D === true;
}

/** Assert a shape is 3D. Throws at runtime if wrong. */
export function as3D<S extends UnknownDimShape>(
  s: S
): Extract<AnyShape<'3D'>, { readonly [__brand]: S[typeof __brand] }> {
  if (!is3D(s)) throw new Error('Expected 3D shape');
  return s as any;
}

/** Assert a shape is 2D. Throws at runtime if wrong. */
export function as2D<S extends UnknownDimShape>(
  s: S
): Extract<AnyShape<'2D'>, { readonly [__brand]: S[typeof __brand] }> {
  if (!is2D(s)) throw new Error('Expected 2D shape');
  return s as any;
}
```

### 3.3 Runtime Dimension Tracking

The phantom type parameter doesn't exist at runtime (it's erased). To support
runtime narrowing (`is3D()`, `is2D()`), we need a lightweight runtime marker:

```ts
// In createHandle — add an optional __is2D boolean for runtime narrowing
// This is a minimal runtime cost (one boolean per shape).
// Only 2D-creation paths set it to true; 3D shapes leave it undefined (falsy).

export interface ShapeHandle {
  readonly wrapped: KernelShape;
  readonly disposed: boolean;
  /** @internal Runtime dimension marker. undefined = 3D (default). */
  readonly __is2D?: boolean;
  [Symbol.dispose](): void;
  delete(): void;
}
```

**Implementation note**: `__is2D` is only set to `true` by 2D creation paths
(`sketchOnPlane2D`, `importSVG`→wire, etc.). The vast majority of shapes never
set it, so memory overhead is negligible.

---

## 4. Operation Signature Updates

### 4.1 Category: 3D-Only Operations (23 functions)

These already require `Shape3D` — signatures remain identical. The phantom type
just makes the constraint stronger since `Shape3D` now explicitly carries `'3D'`.

```ts
// No signature change needed — Shape3D is fixed at '3D'
function fuse(a: Shape3D, b: Shape3D, options?: BooleanOptions): Result<Shape3D>;
function cut(base: Shape3D, tool: Shape3D, options?: BooleanOptions): Result<Shape3D>;
function fillet(shape: Shape3D, ...): Result<Shape3D>;
// ... etc.
```

**Impact**: Zero. These functions already constrain to `Shape3D`.

### 4.2 Category: Dimension-Preserving Transforms (12 functions)

These preserve the input dimension via generics:

```ts
// Before
function translate<T extends AnyShape>(shape: T, v: Vec3): T;

// After — T now carries dimension information
function translate<D extends Dimension, T extends AnyShape<D>>(shape: T, v: Vec3): T;
```

**Affected functions**: `translate`, `rotate`, `scale`, `mirror`, `resize`,
`applyMatrix`, `simplify`, `clone`, `heal`, `colorShape`, `colorFaces`, `composeTransforms`.

**Impact**: Moderate — add `D extends Dimension` type parameter to each.

### 4.3 Category: Dimension-Converting Operations (10 functions)

These convert from any-dimension input to 3D output:

```ts
// Before
function extrude(face: Face, vec: Vec3): Result<Solid>;

// After — accepts any-dimension Face, always produces 3D Solid
function extrude(face: Face<Dimension>, vec: Vec3): Result<Solid>;
```

**Affected functions**: `extrude`, `revolve`, `sweep`, `loft`, `supportExtrude`,
`complexExtrude`, `twistExtrude`, `multiSectionSweep`, `guidedSweep`, `roof`.

**Impact**: Change input types from `Face`/`Wire` to `Face<Dimension>`/`Wire<Dimension>`.

### 4.4 Category: Dimension-Agnostic Operations (40+ functions)

These work on any shape of any dimension:

```ts
// Before
function getEdges(shape: AnyShape): Edge[];

// After — preserves dimension of input
function getEdges<D extends Dimension>(shape: AnyShape<D>): Edge<D>[];

// Or for operations that truly don't care:
function getBounds(shape: AnyShape<Dimension>): Bounds3D;
function describe(shape: AnyShape<Dimension>): ShapeDescription;
```

**Affected functions**: `getEdges`, `getFaces`, `getWires`, `getVertices`,
`iterEdges`, `iterFaces`, `iterWires`, `iterVertices`, `getBounds`, `describe`,
`measureLength`, `measureDistance`, all finders.

**Impact**: Add `D extends Dimension` parameter and propagate.

### 4.5 Category: I/O (15 functions)

```ts
// Imports return unknown-dimension shapes — must be narrowed
function importSTEP(data: Uint8Array): Promise<Result<UnknownDimShape>>;
function importSVG(svg: string): Promise<Result<AnyShape<'2D'>>>; // SVG is always 2D

// Exports accept any dimension
function exportSTEP(shape: AnyShape<Dimension>): Promise<Result<Uint8Array>>;
```

### 4.6 Category: 2D-Specific (12 functions)

These gain `'2D'` typing:

```ts
function createBlueprint(...): Blueprint;  // Blueprint is 2D by definition
function sketchOnPlane2D(bp: Blueprint, plane: PlaneInput): Wire<'3D'>;  // converts to 3D!
```

**Note**: The `Blueprint` type is a separate system (not shape-based), so it's
unaffected by phantom types. The conversion boundary is where `Blueprint` →
`Wire<'3D'>` / `Face<'3D'>` happens.

---

## 5. Migration Strategy

### 5.1 Rollout Order (Bottom-Up, Following Layer Architecture)

| Phase  | Layer | Files                                | Description                                                                      |
| ------ | ----- | ------------------------------------ | -------------------------------------------------------------------------------- |
| **1**  | 0     | `core/shapeTypes.ts`                 | Add `Dimension`, `__dim`, update branded types                                   |
| **2**  | 0     | `core/typeErrors.ts` (new)           | Template literal error types                                                     |
| **3**  | 0     | `core/disposal.ts`                   | Add `__is2D` to `ShapeHandle`                                                    |
| **4**  | 1     | `core/shapeTypes.ts`                 | Update factories, `castShape`, type guards                                       |
| **5**  | 2     | `topology/shapeFns.ts`               | Update topology queries with `D` parameter                                       |
| **6**  | 2     | `topology/booleanFns.ts`             | Already `Shape3D` — minimal changes                                              |
| **7**  | 2     | `topology/modifierFns.ts`            | Already `Shape3D` — minimal changes                                              |
| **8**  | 2     | `topology/transformFns.ts`           | Add `D extends Dimension` to generics                                            |
| **9**  | 2     | `operations/extrudeFns.ts`           | `Face<Dimension>` inputs                                                         |
| **10** | 2     | `operations/sweepFns.ts`             | `Wire<Dimension>` inputs                                                         |
| **11** | 2     | `operations/loftFns.ts`              | `Wire<Dimension>` inputs                                                         |
| **12** | 2     | `io/*Fns.ts`                         | Return `UnknownDimShape` from imports                                            |
| **13** | 2     | `query/*Fns.ts`                      | Propagate `D` through finders                                                    |
| **14** | 2     | `measurement/*Fns.ts`                | Dimension-aware signatures                                                       |
| **15** | 3     | `sketching/`, `text/`, `projection/` | High-level API updates                                                           |
| **16** | —     | `src/index.ts`                       | Export new types: `Dimension`, `UnknownDimShape`, `is3D`, `is2D`, `as3D`, `as2D` |
| **17** | —     | `tests/`                             | Update test type annotations, add dimension-specific tests                       |

### 5.2 Breaking Changes Inventory

| Change                                                 | Consumer Impact | Migration                                        |
| ------------------------------------------------------ | --------------- | ------------------------------------------------ |
| `AnyShape` now requires `<D>` in generic contexts      | Medium          | Add `<D extends Dimension>` to generic functions |
| `importSTEP` returns `UnknownDimShape`                 | High            | Add `is3D()` guard after import                  |
| Type parameters on `Edge`, `Wire`, `Face`, `Compound`  | Low             | Defaults to `'3D'`, invisible for 3D-only code   |
| `Shape3D` now includes `Compound<'3D'>` not `Compound` | Low             | Compound was always treated as 3D                |

### 5.3 Semver Impact

**Major version bump required.** The `importSTEP` return type change and
`AnyShape<D>` generic parameter are breaking changes for consumers who use these
types in their own generic functions.

---

## 6. IDE Experience Design

### 6.1 Error Message Examples

**Dimension mismatch in boolean operation:**

```
error TS2345: Argument of type 'Edge<"2D">' is not assignable to parameter of type 'Shape3D'.
  Type 'Edge<"2D">' is not assignable to type 'Shell | Solid | CompSolid | Compound<"3D">'.
```

**Custom error via conditional type:**

```ts
// For operations that could benefit from custom errors:
type Fuse3DOnly<A, B> = A extends Shape3D
  ? B extends Shape3D
    ? Result<Shape3D>
    : DimensionError<'fuse', '3D', '2D'>
  : DimensionError<'fuse', '3D', '2D'>;
```

**IDE hover on shape types:**

```
(parameter) shape: Solid
// Hover shows: type Solid = ShapeHandle & { readonly [__brand]: 'solid'; readonly [__dim]: '3D' }
```

### 6.2 Autocomplete Benefits

When a consumer types `fuse(myShape, `, the IDE will only suggest shapes that
are `Shape3D`. If they have a `Wire<'2D'>` in scope, it won't appear in
autocomplete for `fuse`, guiding them toward correct usage.

---

## 7. Testing Strategy

### 7.1 New Test Categories

1. **Compile-time tests** (`tests/types/`): Use `// @ts-expect-error` to verify
   that invalid dimension combinations are rejected at compile time.

   ```ts
   // tests/types/dimension-safety.test-d.ts
   import { expectTypeOf } from 'vitest';

   // ❌ Should not compile: mixing dimensions
   // @ts-expect-error — 2D wire cannot be passed to fuse
   fuse(wire2d, solid3d);

   // ✅ Should compile: same dimension
   fuse(solid1, solid2);

   // ✅ Should compile: extrude accepts any dimension
   extrude(face2d, [0, 0, 10]);

   // ✅ Type narrowing
   const imported: UnknownDimShape = importResult.value;
   if (is3D(imported)) {
     fuse(imported as Shape3D, box); // compiles
   }
   ```

2. **Runtime dimension guard tests**: Verify `is3D()`, `is2D()`, `as3D()`, `as2D()`.

3. **Regression tests**: Every existing test should continue to pass with zero
   changes (since defaults are `'3D'`).

### 7.2 Test Count Estimate

- ~20 new compile-time type tests
- ~15 new runtime dimension guard tests
- ~0 existing tests need changes (3D default preserves compatibility)

---

## 8. Risk Analysis

| Risk                                              | Likelihood | Impact | Mitigation                                                             |
| ------------------------------------------------- | ---------- | ------ | ---------------------------------------------------------------------- |
| Generic parameter explosion (too many `D` params) | Medium     | Medium | Use defaults aggressively; only add `D` where it provides value        |
| Type inference failures in complex chains         | Medium     | High   | Extensive type testing; explicit annotations where inference struggles |
| Performance impact of `__is2D` runtime marker     | Very Low   | Low    | One boolean per shape; undefined for 3D (no allocation)                |
| Consumer migration friction                       | Medium     | Medium | Comprehensive migration guide; 3D defaults minimize changes            |
| Template literal errors confusing in some IDEs    | Low        | Low    | Also provide standard TS error messages as fallback                    |

---

## 9. Files Changed (Complete Inventory)

### New Files (2)

- `src/core/typeErrors.ts` — Template literal error types
- `tests/types/dimension-safety.test-d.ts` — Compile-time type tests

### Modified Files (~45)

**Layer 0-1 (Foundation):**

- `src/core/shapeTypes.ts` — Phantom type parameter on branded types
- `src/core/disposal.ts` — `__is2D` on `ShapeHandle`

**Layer 2 (Domain):**

- `src/topology/shapeFns.ts` — `D` parameter on topology queries
- `src/topology/booleanFns.ts` — Minimal (already `Shape3D`)
- `src/topology/modifierFns.ts` — Minimal (already `Shape3D`)
- `src/topology/transformFns.ts` — `D` parameter on transforms
- `src/topology/compoundOpsFns.ts` — Already `Shape3D`
- `src/topology/hullFns.ts` — Already `Shape3D`
- `src/topology/minkowskiFns.ts` — Already `Shape3D`
- `src/topology/primitiveFns.ts` — Return types unchanged (always `Solid`)
- `src/topology/colorFns.ts` — `D` parameter
- `src/topology/faceTagFns.ts` — `D` parameter
- `src/topology/surfaceBuilders.ts` — `D` parameter
- `src/topology/chamferAngleFns.ts` — Already `Shape3D`
- `src/topology/surfaceFns.ts` — Return type
- `src/operations/extrudeFns.ts` — `Face<Dimension>` input
- `src/operations/sweepFns.ts` — `Wire<Dimension>` input
- `src/operations/loftFns.ts` — `Wire<Dimension>` input
- `src/operations/patternFns.ts` — Already `Shape3D`
- `src/operations/assemblyFns.ts` — Already `Shape3D`
- `src/operations/historyFns.ts` — `D` parameter
- `src/2d/blueprints/boolean2D.ts` — Unchanged (Blueprint system)
- `src/io/stepExportFns.ts` — `AnyShape<Dimension>` input
- `src/io/stepImportFns.ts` — `UnknownDimShape` return
- `src/io/stlExportFns.ts` — `AnyShape<Dimension>` input
- `src/io/stlImportFns.ts` — `UnknownDimShape` return
- `src/io/igesExportFns.ts` — `AnyShape<Dimension>` input
- `src/io/igesImportFns.ts` — `UnknownDimShape` return
- `src/io/dxfImportFns.ts` — `UnknownDimShape` return
- `src/io/objImportFns.ts` — `UnknownDimShape` return
- `src/io/threemfImportFns.ts` — `UnknownDimShape` return
- `src/io/svgImportFns.ts` — `AnyShape<'2D'>` return
- `src/io/gltfExportFns.ts` — Mesh-based (no shape type change)
- `src/query/edgeFinderFns.ts` — `D` parameter
- `src/query/faceFinderFns.ts` — `D` parameter
- `src/query/wireFinderFns.ts` — `D` parameter
- `src/query/vertexFinderFns.ts` — `D` parameter
- `src/measurement/measureFns.ts` — Dimension-aware signatures
- `src/projection/projectionFns.ts` — 3D only
- `src/sketching/Sketcher.ts` — Produces `Wire<'3D'>`
- `src/sketching/FaceSketcher.ts` — Produces `Wire<'3D'>`
- `src/text/textFns.ts` — Produces 3D shapes
- `src/worker/protocol.ts` — Shape serialization dimension marker
- `src/index.ts` — Export new types and guards

**Tests:**

- `tests/types/dimension-safety.test-d.ts` (new)
- `tests/fn-dimensionGuards.test.ts` (new)
- Existing tests: **zero changes expected** (3D defaults)

---

## 10. Implementation Sequence

### Step 1: Core Type Foundation (1 PR)

1. Add `Dimension` type and `__dim` symbol to `shapeTypes.ts`
2. Create `typeErrors.ts`
3. Update branded types with phantom dimension parameter
4. Update `ShapeHandle` with `__is2D`
5. Update factories and `castShape`
6. Add `is3D`, `is2D`, `as3D`, `as2D` guards
7. Update `AnyShape<D>`, `Shape1D<D>`, `Shape3D`, add `UnknownDimShape`
8. Run `npm run typecheck` — fix all internal type errors bottom-up

### Step 2: Layer 2 Propagation (1 PR)

1. Update topology query functions with `D` parameter
2. Update transform functions with `D` parameter
3. Update extrusion/sweep/loft inputs to accept `Face<Dimension>`/`Wire<Dimension>`
4. Update I/O functions with appropriate dimension types
5. Update finders with `D` parameter
6. Update measurement with dimension-aware signatures

### Step 3: Layer 3 + Tests (1 PR)

1. Update sketching, text, projection
2. Update `src/index.ts` exports
3. Add compile-time type tests
4. Add runtime dimension guard tests
5. Verify all existing tests pass

### Step 4: Documentation + Migration Guide (1 PR)

1. Update `docs/concepts.md` with dimension safety section
2. Create `docs/migration/v10-dimension-types.md`
3. Update `docs/cheat-sheet.md`
4. Update `docs/which-api.md`
5. Update `CLAUDE.md` with dimension patterns

---

## 11. Example: Consumer Before/After

### Before (v9)

```ts
import { importSTEP, fuse, box, isOk } from 'brepjs';

const imported = await importSTEP(stepData);
if (isOk(imported)) {
  // Compiles, but might fail at runtime if imported shape is 2D
  const result = fuse(imported.value as Shape3D, box(10, 10, 10));
}
```

### After (v10)

```ts
import { importSTEP, fuse, box, isOk, is3D, isShape3D } from 'brepjs';

const imported = await importSTEP(stepData);
if (isOk(imported)) {
  const shape = imported.value; // type: UnknownDimShape

  if (is3D(shape) && isShape3D(shape)) {
    // Compiler knows shape is Shape3D — fuse compiles
    const result = fuse(shape, box(10, 10, 10));
  }

  // Or with assertion if you know it's 3D
  const shape3d = as3D(shape);
  if (isShape3D(shape3d)) {
    const result = fuse(shape3d, box(10, 10, 10));
  }
}
```

### Pure 3D code (zero changes)

```ts
// This code is identical in v9 and v10:
const b = box(10, 10, 10); // Solid (always 3D)
const c = cylinder(5, 20); // Solid (always 3D)
const result = fuse(b, c); // Result<Shape3D>
const filleted = fillet(unwrap(result), 1); // Result<Shape3D>
```
