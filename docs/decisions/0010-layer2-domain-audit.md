# ADR-0010: Layer 2 Domain Audit

**Status**: Accepted
**Date**: 2026-03-14

## Context

Layer 2 (`topology/`, `operations/`, `2d/`, `query/`, `measurement/`, `io/`, `worker/`) had grown to 104 files / ~18,700 LOC with several structural issues identified after the Layer 1 audit (ADR-0008):

1. **shapeFns.ts** (753 LOC) mixed 5 concerns: transforms, topology queries, identity, origin tracking, introspection.
2. **Metadata propagation** (~20 lines of tag/color/origin propagation) duplicated across booleanFns, modifierFns, and shapeFns.
3. **Legacy OO wrappers** (extrude.ts, loft.ts) duplicated their \*Fns.ts functional equivalents.
4. **compoundOpsFns.ts** lived in topology/ but imported from operations/ (architecturally backwards).
5. **Sweep files fragmented**: sweep logic split across extrudeFns, multiSweepFns, guidedSweepFns.
6. **Query finders** (edge, face, wire) near-identical but in 3 separate files, lacking composition operators.
7. **Validity type gaps**: Wire→ClosedWire missing in sweep/supportExtrude/roof, Face→OrientedFace missing in measureCurvatureAt.
8. **topology/index.ts** leaked core types (AnyShape, Shape3D, CurveLike).

## Decision

### Metadata propagation pipeline (PR 1)

New `src/topology/metadataPropagation.ts` centralizes:

- `collectInputFaceHashes()`: unified O(1) fast-path check
- `propagateAllMetadata()`: calls origins + tags + colors propagation
- `propagateMetadataByHash()`: hash-only fallback

Transforms now propagate all three metadata types (previously only origins).

### Split shapeFns.ts (PR 2)

753 LOC → 4 focused files:

- `transformFns.ts`: translate, rotate, scale, mirror, applyMatrix, composeTransforms
- `topologyQueryFns.ts`: getEdges/getFaces/getWires/getVertices, iterators, getBounds, describe
- `originTrackingFns.ts`: setShapeOrigin, getFaceOrigins, propagation functions
- `shapeFns.ts`: identity/introspection (clone, toBREP, getHashCode) + re-exports

### Sweep consolidation + validity types (PR 3)

- **Moved** `compoundOpsFns.ts` from topology/ to operations/
- **Consolidated** sweep/supportExtrude/complexExtrude/twistExtrude/multiSectionSweep/guidedSweep into `sweepFns.ts`
- **Kept** extrude/revolve in `extrudeFns.ts`
- **Tightened** parameter types (breaking):
  - `sweep(wire: Wire)` → `sweep(wire: ClosedWire)`
  - `supportExtrude(wire: Wire)` → `supportExtrude(wire: ClosedWire)`
  - `roof(wire: Wire)` → `roof(wire: ClosedWire)`
  - `measureCurvatureAt(face: Face)` → `measureCurvatureAt(face: OrientedFace)`

### Legacy OO deprecation (PR 4)

- Added `@deprecated` to `basicFaceExtrusion`, `revolution`, `genericSweep` in extrude.ts
- Removed from public API (`src/index.ts`)

### Query finder consolidation (PR 5)

- Merged edgeFinder + faceFinder + wireFinder → `shapeFinders.ts`
- Added `and`/`or`/`negate` combinators to `ShapeFinder<T>` interface

### Barrel cleanup (PR 7)

- Removed leaked core type re-exports from `topology/index.ts`

## Breaking Changes

| Change                                                                     | Migration                                    |
| -------------------------------------------------------------------------- | -------------------------------------------- |
| `sweep()`, `supportExtrude()` require `ClosedWire`                         | Use `closedWire()` or `wireLoop()` first     |
| `roof()` requires `ClosedWire`                                             | Same                                         |
| `measureCurvatureAt()` requires `OrientedFace`                             | Use `orientedFace()` first                   |
| `basicFaceExtrusion`, `revolution`, `genericSweep` removed from public API | Use `extrude()`, `revolve()`, `sweep()`      |
| `AnyShape`, `Shape3D`, `CurveLike` removed from `topology/index.ts`        | Import from `core/shapeTypes.js` or `brepjs` |

## Consequences

- **shapeFns.ts**: 753 → ~90 LOC (+ 3 focused files)
- **Metadata propagation**: 3 duplicated blocks → 1 centralized pipeline
- **Sweep files**: 3 fragmented → 1 consolidated
- **Query finders**: 3 near-identical → 1 merged + combinators
- All changes backward-compatible via re-export shims (except breaking type tightening)
