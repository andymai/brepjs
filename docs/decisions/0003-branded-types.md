# ADR-0003: Branded Types for Shape Discrimination

**Status**: Accepted
**Date**: 2024-09-01 (retroactive)

## Context

CAD shapes (Vertex, Edge, Wire, Face, Shell, Solid) are all opaque handles wrapping kernel pointers. Without type-level discrimination, it's easy to pass a Wire where a Face is expected — the error only surfaces at runtime inside WASM.

## Decision

Use TypeScript branded types (intersection with a unique symbol) to create nominally-typed shape handles. Each shape type carries a `[__brand]` phantom field that prevents assignment between types.

```ts
type Edge = ShapeHandle & { readonly [__brand]: 'edge' };
type Wire = ShapeHandle & { readonly [__brand]: 'wire' };
```

Runtime type guards (`isEdge()`, `isWire()`, etc.) query the kernel and narrow the type.

## Consequences

### Positive

- Compile-time shape discrimination — wrong-shape bugs caught before runtime
- Zero runtime overhead — brands exist only in the type system
- Type guards integrate with TypeScript's control flow analysis
- Factory functions (`createEdge()`, `createWire()`) are the only way to brand a handle

### Negative / Trade-offs

- Internal code requires explicit casts at kernel boundaries
- `castShape()` is an inherently unsafe operation (trusts kernel type reporting)

## Related

- ADR-0004 (phantom dimension types extend this pattern)
- `src/core/shapeTypes.ts` — type definitions and factories
