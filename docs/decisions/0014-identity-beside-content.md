# ADR-0014: Identity Beside Content Addressing

**Status**: Accepted
**Date**: 2026-08-17
**Authors**: Andy Aragon

## Context

The CSG IR deduplicates aggressively: two identical wall recipes share one structural hash, one cache entry, one materialization. BIM consumers need the opposite guarantee: every element keeps a durable identity (an IFC GlobalId) that survives reordering, rebuilds, and re-exports. Encoding identity into IR nodes would fragment the cache (identical geometry would stop deduplicating); deriving identity from evaluation order would make GlobalIds change when an array reorders.

## Decision

Identity lives on a second tree beside the IR, never inside it. `brepjs-families` resolves an element tree in which each element carries a key path (its ancestor chain of explicit keys), while its geometry projects onto the content-addressed IR. Cache keys contain zero identity fragments; identity contains zero geometry. Downstream identity (IFC GlobalIds via `stableKey` in brepjs-bim) derives from key paths only, and elements without explicit keys are refused at the identity boundary rather than given order-dependent fallbacks.

Openings follow the same rule: a fill-role void synthesizes an `Opening` element whose identity belongs to the host's void slot, so the opening survives host relocation.

## Consequences

### Positive

- Identical recipes share one materialization under any number of identities; deduplication is free at the projection boundary.
- GlobalIds are reorder-stable and rebuild-stable by construction, verified end to end by the sample-building gate (byte-identical IFC across independent rebuilds, validated by IfcOpenShell).
- Identity-side data (psets, materials) structurally cannot perturb geometry hashing.

### Negative / Trade-offs

- Every identity-bearing element requires an explicit key; unkeyed elements hard-fail at `familiesToBim`, which is stricter than tools that silently derive positional identifiers.
- Adapters read elements twice (props for parametric specs, geometry for placement), a duality that must be kept coherent per element type.

## Alternatives Considered

### Identity fields on IR nodes

Rejected: any identity in the hashed structure splits cache entries for identical geometry, defeating the IR's purpose.

### Positional identity (index-derived GlobalIds)

Rejected: works until a sibling is inserted, then every downstream consumer sees a deletion plus an addition instead of a move.

### React-style reconciliation

Rejected: a reconciler solves incremental re-render, not durable cross-export identity, and drags in a runtime the model layer does not need.

## Related

- ADR-0011: geometric validity brands (the same philosophy of encoding invariants structurally)
- `apps/docs/families/identity.md` (the user-facing model)
- `packages/brepjs-bim/tests/familiesSampleBuilding.test.ts` (the end-to-end gate)
