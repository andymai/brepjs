# ADR-0008: Layer 1 Core Audit

**Status**: Accepted
**Date**: 2026-03-14

## Context

Layer 1 (`src/core/`) had grown to 15 files / 2,316 LOC with several structural concerns:

1. **shapeTypes.ts** (479 LOC) mixed three concerns from ADR-0003 (branded types), ADR-0004 (phantom dimensions), and ADR-0005 (validity brands).
2. **ValidityResult<T>** used `{ valid, shape }` / `{ valid, reason }`, incompatible with the project-standard `Result<T, E>` pattern.
3. **geometryHelpers.ts** mixed pure functions with kernel calls (layer boundary smell).
4. **memory.ts** was a pure re-export hub adding indirection over disposal.ts.
5. **errors.ts** bundled type definitions with OCCT-specific regex translation logic.
6. **definitionMaps.ts** was under-scoped: only handled CurveType while getShapeKind lived elsewhere.
7. **is2D()/is3D()** type guards checked a `__is2D` runtime marker that was never set.
8. No resource tracking capability for debugging WASM memory leaks.
9. `Result<T,E>` missing `flatten()` and `mapBoth()` combinators.
10. `vec2d.ts` missing `normalize2d` (existed only as a Layer 2 override).
11. Kernel sub-interfaces from ADR-0007 not exported from the public API.

## Decision

Address all findings via nine incremental PRs, each independently verifiable:

### PR 1: Split shapeTypes.ts into 3 files

- `dimensionTypes.ts`: ADR-0004 dimension types + absorbed `typeErrors.ts`
- `validityTypes.ts`: ADR-0005 validity brands, type guards, smart constructors
- `shapeTypes.ts`: slimmed to branded types + re-exports for backward compat

### PR 2: Unify ValidityResult with Result<T, string>

- Smart constructors now return `Result<T, string>` instead of `ValidityResult<T>`
- `ValidityResult` type removed from public API

### PR 3: Split errors.ts + delete geometryHelpers.ts + delete memory.ts

- `kernelErrorTranslation.ts` extracted (OCCT regex patterns)
- `makePlane()` moved to `planeOps.ts`; `mirror()` inlined at its single callsite
- `memory.ts` deleted; 5 consumers updated to import from `disposal.ts` directly

### PR 4: Expand definitionMaps → typeDiscriminants.ts

- Renamed and expanded with `getShapeKind()` (moved from shapeTypes.ts)
- `definitionMaps.ts` kept as a re-export stub for backward compat

### PR 5: Add DisposalStats for WASM memory debugging

- `DisposalStats` interface with live/peak/gc/scope counters
- `getDisposalStats()` / `resetDisposalStats()`: zero overhead when not called

### PR 6: Implement \_\_is2D runtime markers

- Shape factories accept optional `dim` parameter
- `brandHandle()` sets `__is2D = true` when `dim === '2D'`
- `castShape()` passes dimension through

### PR 7: Add Result.flatten + Result.mapBoth + normalize2d

- `flatten()`: unwraps `Result<Result<T,E>,E>`
- `mapBoth()`: maps both Ok and Err in one pass
- `normalize2d()` in `vec2d.ts`: fills the Layer 0 gap

### PR 8: Export kernel sub-interfaces from public API

- 13 sub-interface types from ADR-0007 now importable from `'brepjs'`

### PR 9: ADR documentation (this document)

## Consequences

### Positive

- shapeTypes.ts drops from 479 LOC to ~200 LOC + focused sub-files
- Single discriminated union pattern (`Result<T,E>`) throughout the codebase
- WASM memory leaks can now be diagnosed at runtime via `getDisposalStats()`
- `is2D()/is3D()` will actually work once callers pass `'2D'` dimension
- 3 dead/redundant files eliminated (`typeErrors.ts`, `geometryHelpers.ts`, `memory.ts`)

### Negative / Trade-offs

- Re-export stubs add a minor indirection for backward compatibility
- `dim` parameter in shape factories adds a rarely-used optional argument
- DisposalStats counters add minimal overhead to every handle create/dispose

## Alternatives Considered

### Keep shapeTypes.ts as a monolith

Rejected: 479 LOC mixing three ADR concerns makes each concern harder to reason about independently.

### Use a separate `ValidityResult` pattern alongside `Result`

Rejected: two incompatible discriminated union patterns for the same purpose creates unnecessary cognitive load and prevents using `Result` combinators on validity proofs.

## Related

- ADR-0003: Branded types
- ADR-0004: Phantom dimension types
- ADR-0005: Topological validity types
- ADR-0006: Domain boundaries
- ADR-0007: Kernel interface segregation
