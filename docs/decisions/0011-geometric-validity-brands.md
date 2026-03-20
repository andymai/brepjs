# ADR-0011: Geometric Validity Brands (PlanarFace / PlanarWire)

**Status**: Implemented
**Date**: 2026-03-20

## Context

ADR-0005 introduced topological validity brands (`ClosedWire`, `OrientedFace`, `ManifoldShell`, `ValidSolid`) — phantom types encoding properties like "wire is closed" or "solid passes BRepCheck". These are _topological_ invariants: they describe connectivity and validity, not geometry.

Several operations have _geometric_ preconditions that aren't captured by topological brands:

- `face(w)` / `makeFace(w)` require a **planar** wire — non-planar wires produce corrupt faces with the error "Your wire might be non planar"
- `extrude(face, vec)` documents "The **planar** face to extrude" but accepts any `OrientedFace`
- `revolve(face, ...)` implicitly requires a planar face
- `roof(w, ...)` projects wire to XY plane, assuming planarity

These failures are silent or produce cryptic WASM errors. The type system should encode planarity so callers prove it before calling planar-only operations.

### Why not other geometric brands?

Three candidates were evaluated:

| Candidate                 | Runtime Check                    | Both Kernels? | Operations Protected                             | Verdict                                                                      |
| ------------------------- | -------------------------------- | ------------- | ------------------------------------------------ | ---------------------------------------------------------------------------- |
| **PlanarFace/PlanarWire** | `surfaceType(face) === 'plane'`  | ✅ Yes        | `face`, `makeFace`, `extrude`, `revolve`, `roof` | ✅ Add                                                                       |
| **ConnectedWire**         | Edge iteration + vertex matching | ⚠️ JS-only    | `sweep`, `loft`                                  | ❌ Skip — wires from API are connected by construction                       |
| **NonSelfIntersecting**   | No detection API exists          | ❌ No         | Booleans, sweeps                                 | ❌ Skip — no cross-kernel detection; `ValidSolid` catches downstream effects |

## Decision

Add `PlanarFace<D>` and `PlanarWire<D>` phantom brands following the same pattern as ADR-0005.

### Brand Symbols

```ts
// src/core/validityTypes.ts
declare const __planar: unique symbol;
```

### Validity Types

```ts
/** A face whose underlying surface is a plane. */
type PlanarFace<D extends Dimension = '3D'> = Face<D> & { readonly [__planar]: true };

/** A wire whose edges all lie in a common plane. */
type PlanarWire<D extends Dimension = '3D'> = Wire<D> & { readonly [__planar]: true };
```

### Composability

Brands stack via intersection types:

```
ClosedPlanarWire<D> = ClosedWire<D> & PlanarWire<D>
                    = Wire<D> & { __closed } & { __planar }

PlanarOrientedFace<D> = PlanarFace<D> & OrientedFace<D>
                      = Face<D> & { __planar } & { __oriented }
```

No new combined types are defined — callers use `ClosedWire<D> & PlanarWire<D>` directly, or we provide a convenience alias `ClosedPlanarWire<D>` if usage warrants it.

### Runtime Checks

```ts
// Face planarity: single kernel call, O(1)
function isPlanarFace<D extends Dimension>(face: Face<D>): face is PlanarFace<D> {
  return getKernel().surfaceType(face.wrapped) === 'plane';
}

// Wire planarity: construct temporary face, check surface type
// Falls back to edge coplanarity check if face construction fails
function isPlanarWire<D extends Dimension>(wire: Wire<D>): wire is PlanarWire<D> {
  const kernel = getKernel();
  try {
    const tempFace = kernel.makeFace(wire.wrapped);
    const result = kernel.surfaceType(tempFace) === 'plane';
    try {
      kernel.dispose(tempFace);
    } catch {
      /* best-effort cleanup */
    }
    return result;
  } catch {
    return false; // Non-planar wires fail makeFace
  }
}
```

**Kernel portability**: `surfaceType()` is implemented in both OCCT (`BRepAdaptor_Surface` + `GeomAbs_SurfaceType` enum) and brepkit (`bk.getSurfaceType()`). Both return `'plane'` for planar surfaces.

### Smart Constructors

```ts
function planarFace<D extends Dimension>(face: Face<D>): Result<PlanarFace<D>, string>;
function planarWire<D extends Dimension>(wire: Wire<D>): Result<PlanarWire<D>, string>;
```

### Consumer Updates (Breaking)

Operations that require planarity will use composed brand types:

| Function          | Current                                        | Proposed                                                                  |
| ----------------- | ---------------------------------------------- | ------------------------------------------------------------------------- |
| `face(w)`         | `ClosedWire → Result<OrientedFace>`            | `ClosedWire & PlanarWire → Result<OrientedFace & PlanarFace>`             |
| `makeFace(w)`     | `ClosedWire<D> → Result<OrientedFace<D>>`      | `ClosedWire<D> & PlanarWire<D> → Result<OrientedFace<D> & PlanarFace<D>>` |
| `extrude(f, v)`   | `OrientedFace<Dimension> → Result<ValidSolid>` | `OrientedFace<Dimension> & PlanarFace<Dimension> → Result<ValidSolid>`    |
| `revolve(f, ...)` | `OrientedFace<Dimension> → Result<Shape3D>`    | `OrientedFace<Dimension> & PlanarFace<Dimension> → Result<Shape3D>`       |
| `roof(w, ...)`    | `ClosedWire<Dimension> → Result<Solid>`        | `ClosedWire<Dimension> & PlanarWire<Dimension> → Result<ValidSolid>`      |

`makeNonPlanarFace(w)` and `filledFace(w)` explicitly handle non-planar wires and do NOT require `PlanarWire`.

### Producer Updates

Functions that produce known-planar shapes return branded types:

- `makeFace(w)` → `Result<OrientedFace<D> & PlanarFace<D>>` (makeFace only succeeds on planar wires)
- `face(w)` → `Result<OrientedFace & PlanarFace>` (delegates to makeFace)
- `polygon(pts)` → `Result<OrientedFace & PlanarFace>` (polygon is always planar)
- Primitives: `box()` faces, `cylinder()` end caps — these are internal, not user-facing

## Consequences

### Positive

- **Compile-time planarity safety**: `face(w)` rejects non-planar wires at the type level
- **Zero runtime overhead**: Brands are phantom — no wrapper objects
- **Composable with existing brands**: `ClosedWire & PlanarWire` stacks naturally
- **Cross-kernel**: `surfaceType()` works on both OCCT and brepkit
- **Self-documenting**: `extrude(face: OrientedFace & PlanarFace)` is clearer than `extrude(face: OrientedFace)` + JSDoc

### Negative / Trade-offs

- **Brand stacking verbosity**: `ClosedWire<'2D'> & PlanarWire<'2D'>` is getting long — may warrant a convenience alias
- **Wire planarity check cost**: `isPlanarWire()` constructs a temporary face (~1 WASM alloc + dispose). Cheap but not free.
- **Ergonomic friction**: Users calling `face()` must now prove planarity. Most wires from sketching are planar by construction, so internal code uses justified casts.
- **Not all planarity is checkable**: A wire may have all-planar edges that don't share a common plane. The `makeFace` fallback catches this but is indirect.

## Alternatives Considered

### A: `PlanarWire` only (no `PlanarFace`)

Check planarity at wire level, don't brand faces. Rejected because `extrude` and `revolve` accept faces, not wires — branding only wires leaves these unprotected.

### B: Overloads instead of brands

Add `facePlanar(w)` / `faceNonPlanar(w)` as separate functions. Rejected because it doesn't prevent misuse of `face()` and doubles the API surface.

### C: Runtime-only validation (no types)

Keep `isPlanarWire()` as a boolean helper without branding. Rejected for the same reason as ADR-0005 Alternative B — callers can forget to check.

## Related

- ADR-0003: Branded types (foundation pattern)
- ADR-0005: Topological validity types (extended here with geometric brands)
- `src/core/validityTypes.ts` — implementation location
- `src/kernel/interfaces/surfaceOps.ts` — `surfaceType()` capability
