# ADR-0009: Tolerance as Type Parameter

**Status**: Proposed
**Date**: 2026-03-14

## Context

Geometric computations in brepjs implicitly assume a global tolerance (typically 1e-6 for points, 1e-7 for curves). This works for single-kernel usage but creates subtle bugs when:

1. **Cross-kernel operations**: OCCT and brepkit may use different internal precisions
2. **Multi-scale models**: a chip package (microns) and a building (meters) in the same scene
3. **Round-trip degradation**: STEP export/import can shift vertices by kernel tolerance

CGAL addresses this with an _exact arithmetic kernel_ (`Exact_predicates_exact_constructions_kernel`). OpenCASCADE uses `Precision::Confusion()` globally. Neither approach fits a TypeScript CAD library well, but CGAL's kernel-parameterized types offer an interesting model.

## Decision

**Explore** (not commit to) encoding tolerance in the type system:

```typescript
// Conceptual - NOT a shipping API
interface Tolerance {
  readonly point: number;
  readonly curve: number;
  readonly surface: number;
}

type Shape<D extends Dimension, T extends Tolerance = DefaultTolerance> = ...;

function withTolerance<T extends Tolerance>(tol: T, fn: () => void): void;
```

This ADR documents the vision and open questions. Implementation would be a separate ADR if the exploration proves viable.

## Open Questions

1. **Ergonomics**: Does a `T extends Tolerance` parameter on every shape type create too much noise for the 99% case?
2. **Runtime enforcement**: How do we prevent mixing shapes with different tolerances? Phantom brand (like `__dim`) or runtime check?
3. **Kernel mapping**: Can we map brepjs tolerance to OCCT's `Precision::Confusion()` and brepkit's internal tolerance at adapter boundary?
4. **Migration path**: Can we default `T = DefaultTolerance` so existing code is unaffected?
5. **Performance**: Does tolerance-aware comparison (`samePoint(a, b, tol)` vs `samePoint(a, b)`) have measurable overhead in hot paths?

## Risks

- **Type complexity**: Adding a second phantom parameter increases the already-complex branded type system
- **WASM boundary**: Kernel tolerance is set globally in OCCT; per-shape tolerance would require kernel-side changes
- **Diminishing returns**: Most brepjs users work at a single scale with a single kernel

## Related

- CGAL Kernel concept: `Exact_predicates_inexact_constructions_kernel`
- OpenCASCADE `Precision::Confusion()`, `Precision::Parametric()`
- ADR-0004: Phantom dimension types (prior art for phantom parameters on shapes)
- ADR-0008: Layer 1 core audit (this exploration was identified during the audit)
