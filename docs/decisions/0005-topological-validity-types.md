# ADR-0005: Topological Validity Phantom Types

**Status**: Implemented
**Date**: 2026-03-08

## Context

brepjs shape types discriminate by _kind_ (Edge, Wire, Face, etc.) and _dimension_ (2D, 3D) at compile time. However, topological _validity_ properties — whether a wire is closed, a face is oriented, a shell is manifold, or a solid passes geometry checks — are only discoverable at runtime.

This matters because many operations have validity preconditions:

- `face(wire)` requires a **closed** wire
- `extrude(face)` requires an **oriented** face with a closed outer wire
- `sewShells(faces)` produces a shell, but only a **manifold** shell can become a valid solid
- Boolean operations (`fuse`, `cut`) require **valid** solids

Currently, violating these preconditions produces cryptic WASM errors or silently wrong geometry. The type system should encode these properties so that:

1. Operations that require validity can declare it in their signatures
2. The only way to obtain a validity-branded type is through a function that proves the property at runtime (smart constructor pattern)
3. Existing code continues to work — validity types are subtypes of their base types

## Decision

Add phantom validity brands to shape types using the same intersection-type pattern established by ADR-0003 (branded types) and ADR-0004 (phantom dimensions).

### Brand Symbols

```ts
// src/core/shapeTypes.ts
declare const __closed: unique symbol; // Wire forms a closed loop
declare const __oriented: unique symbol; // Face has consistent normal orientation
declare const __manifold: unique symbol; // Shell is manifold (watertight, no dangling faces)
declare const __valid: unique symbol; // Solid passes BRepCheck validation
```

### Validity Types

```ts
// Closed wire — proven to form a loop
type ClosedWire<D extends Dimension = '3D'> = Wire<D> & { readonly [__closed]: true };

// Oriented face — proven to have consistent normal
type OrientedFace<D extends Dimension = '3D'> = Face<D> & { readonly [__oriented]: true };

// Manifold shell — proven to be watertight
type ManifoldShell = Shell & { readonly [__manifold]: true };

// Valid solid — proven to pass BRepCheck
type ValidSolid = Solid & { readonly [__valid]: true };
```

### Subtype Relationships

```
ClosedWire<D>  <:  Wire<D>      — assignable to Wire, not vice versa
OrientedFace<D> <:  Face<D>      — assignable to Face, not vice versa
ManifoldShell   <:  Shell        — assignable to Shell, not vice versa
ValidSolid      <:  Solid        — assignable to Solid, not vice versa
```

### Smart Constructors (Proof Terms)

The **only** way to obtain a validity-branded type is through functions that perform runtime checks:

```ts
// Runtime check → branded type
function closedWire<D extends Dimension>(wire: Wire<D>): Result<ClosedWire<D>, BrepError>;
function orientedFace<D extends Dimension>(face: Face<D>): Result<OrientedFace<D>, BrepError>;
function manifoldShell(shell: Shell): Result<ManifoldShell, BrepError>;
function validSolid(solid: Solid): Result<ValidSolid, BrepError>;
```

### Type Guards (Narrowing)

For shapes from external sources (STEP import, kernel queries), type guards enable narrowing:

```ts
function isClosedWire<D extends Dimension>(wire: Wire<D>): wire is ClosedWire<D>;
function isOrientedFace<D extends Dimension>(face: Face<D>): face is OrientedFace<D>;
function isManifoldShell(shell: Shell): shell is ManifoldShell;
function isValidSolid(solid: Solid): solid is ValidSolid;
```

### Brand Preservation

Operations that preserve validity carry that information in their return types:

```ts
// Transform preserves closure
function transformWire<W extends Wire<Dimension>>(wire: W, trsf: Transform): W;

// Operations that produce known-valid outputs
function rectangleWire(width: number, height: number): ClosedWire<'3D'>;
function circleWire(radius: number): ClosedWire<'3D'>;
```

### Adoption Strategy

Validity types are **subtypes** with two tiers:

- **Non-breaking (Phase 2)**: Producers return branded types — callers get narrower types automatically
- **Breaking (Phase 3)**: Constructive operations _require_ branded inputs — callers must prove validity via smart constructors, type guards, or `as` casts where the invariant holds by construction

## Consequences

### Positive

- **Compile-time safety**: Operations that require validity declare it in types
- **Self-documenting APIs**: `face(wire: ClosedWire)` is clearer than `face(wire: Wire)` + runtime error
- **Zero runtime overhead**: Brands are phantom — no wrapper objects, no memory allocation
- **Composable**: Brands stack with dimension types: `ClosedWire<'2D'>`
- **Gradual**: Existing code is unaffected; validity requirements can be added incrementally
- **Proof-carrying code**: The type system tracks which validations have been performed

### Negative / Trade-offs

- **Ergonomic friction**: Callers must explicitly prove validity before calling strict APIs
- **Internal casts**: Kernel boundary code must cast to branded types after validation
- **Brand stacking complexity**: `ClosedWire<'2D'>` is readable; more brands could become unwieldy
- **Cannot express all invariants**: Some properties (e.g., "wire lies on this face") are relational and don't fit single-shape branding

### Known Limitations

- **`isOrientedFace` checks validity, not orientation direction**: The type guard uses `kernel.isValid()` (BRepCheck_Analyzer), which checks geometric/topological correctness but does not verify that the face normal is consistently oriented w.r.t. an enclosing solid. Faces from kernel operations are oriented by construction; faces from STEP/IGES imports may pass the check despite having inverted normals. This is documented in the type guard's JSDoc.
- **`getFaces()` returns `Face[]`, not `OrientedFace[]`**: To avoid over-branding faces from arbitrary sources (imports, compounds), `getFaces()` returns plain `Face[]`. Callers should use `isOrientedFace()` or `orientedFace()` to narrow when needed.

## Alternatives Considered

### A: Wrapper Classes

Create `ClosedWire` as a separate class wrapping `Wire`. Rejected because:

- Breaks the branded-type-handle pattern (ADR-0003)
- Runtime overhead for wrapper objects
- Doesn't compose with dimension types

### B: Validation-Only (No Type Tracking)

Keep `isClosedWire()` as a boolean function, don't brand types. Rejected because:

- Callers can forget to check; the type system doesn't help
- Identical to the current situation, just with better-named functions

### C: Strict From the Start

Make all constructors return the most specific type, require explicit widening. Rejected because:

- Massive breaking change across all existing code
- Over-constrains simple use cases
- Can migrate to stricter signatures later once brands exist

## Implementation Plan

### Phase 1: Foundation (This PR)

1. Add brand symbols and validity types to `src/core/shapeTypes.ts`
2. Add smart constructors and type guards to `src/core/shapeTypes.ts`
3. Add error codes for validation failures to `src/core/errors.ts`
4. Export new types from `src/index.ts`
5. Add tests for type-level behavior and runtime guards

### Phase 2: Producer Updates

Update functions that produce known-valid shapes to return branded types:

- `rectangleWire()`, `circleWire()`, `polygon()` → `ClosedWire`
- `makeFace()` → `OrientedFace` (faces are always oriented)
- `sewShells()` → conditional `ManifoldShell` or `Shell`

### Phase 3: Consumer Updates (Breaking)

Updated operation signatures to _require_ validity brands at call sites:

**Wire → ClosedWire** (face construction requires closed boundary):

- `face(w: ClosedWire)`, `filledFace(w: ClosedWire)`, `subFace(f, w: ClosedWire)`, `addHoles(f, holes: ClosedWire[])`
- `makeFace(wire: ClosedWire)`, `makeNonPlanarFace(wire: ClosedWire)`, `makeNewFaceWithinFace(f, wire: ClosedWire)`
- `addHolesInFace(f, holes: ClosedWire[])`

**Face → OrientedFace** (extrusion/revolution requires oriented face):

- `extrude(face: OrientedFace)`, `revolve(face: OrientedFace)`
- `basicFaceExtrusion(face: OrientedFace)`, `revolution(face: OrientedFace)` (OOP API)
- Public `api.extrude(face: OrientedFace)`, `api.revolve(face: OrientedFace)`

Internal call sites (Sketch, CompoundSketch, Blueprint, draw, booleanFns, compoundOpsFns) cast with `as ClosedWire`/`as OrientedFace` where the invariant is known to hold by construction.

### Phase 4: Convenience & Propagation

- `wireLoop(edges)` — assemble + closure check in one step, returns `Result<ClosedWire>`
- `solid(facesOrShells)` / `makeSolid()` → `Result<ValidSolid>` (was `Result<Solid>`)
- Transforms (`translate`, `rotate`, `mirror`, `scale`) preserve brands via `<T extends AnyShape<D>>` generics
- `fillet`, `chamfer`, `shell` (api layer) preserve brands via `<T extends Shape3D>` generics
- `Sketch.wire` stays as `Wire` (sketches serve as both closed profiles and open sweep paths)

## Related

- ADR-0003: Branded types (foundation pattern)
- ADR-0004: Phantom dimension types (extends the same pattern)
- `src/core/shapeTypes.ts` — implementation location
- `src/topology/healingFns.ts` — validation infrastructure
