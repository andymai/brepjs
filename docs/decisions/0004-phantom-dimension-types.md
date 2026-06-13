# ADR-0004: Phantom Dimension Types for 2D/3D Safety

**Status**: Accepted
**Date**: 2026-03-08

## Context

Shape types (Edge, Wire, Face, etc.) can exist in 2D or 3D space. Mixing dimensions (e.g., fusing a 2D wire with a 3D solid) produces cryptic WASM errors. The type system should prevent this at compile time.

## Decision

Add a phantom type parameter `D extends Dimension` to dimension-variable shape types. Types that are inherently 3D (Shell, Solid, CompSolid) have no parameter.

```ts
type Dimension = '2D' | '3D';
type Edge<D extends Dimension = '3D'> = ShapeHandle & { [__brand]: 'edge'; [__dim]: D };
type Solid = ShapeHandle & { [__brand]: 'solid'; [__dim]: '3D' }; // fixed
```

Default is `'3D'` for backward compatibility. Template literal error types produce readable IDE messages on mismatch.

## Consequences

### Positive

- Compile-time rejection of 2D/3D mismatches
- Zero runtime overhead (phantom parameter)
- Backward compatible: existing `Edge` means `Edge<'3D'>`
- Foundation for future validity types (ADR-0005)

### Negative / Trade-offs

- Generic type parameters add complexity to function signatures
- Some internal casts required at kernel boundaries

## Related

- ADR-0003 (branded types, the foundation this builds on)
- ADR-0005 (topological validity types, the next layer of phantom types)
- `docs/plans/phantom-dimension-types.md`: original implementation plan
