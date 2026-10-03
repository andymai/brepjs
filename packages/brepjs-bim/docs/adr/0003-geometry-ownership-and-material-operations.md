# ADR-0003: Shared geometry ownership and material operations

**Status**: Proposed
**Date**: 2026-09-10
**Authors**: viktar-b

## Context

At upstream `4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466`, [geometry lifetime][disposal] is repeated across classes. [Body adoption][takeover] retains the caller's Body object and item container. It checks incoming duplicates and reuse of the target's parametric solid, but does not check every handle already owned by other document records. The implementation relies on callers maintaining exclusive ownership and respecting the retained container. These checks do not enforce that contract across the whole document.

Material measurement differs by consumer. [Exact Wall quantities][wall-quantities] use occupied union while [Families comparison][coincidence] and [import][importer] sum item volumes. The existing [exact-wall test][overlap-test] permits overlapping items, and [compound evaluation][compound] does not establish disjointness. An item sum can therefore describe a different quantity from occupied material. Shared terminology alone cannot resolve that discrepancy.

### Overlapping-item coincidence

Consider two solids A and B, each of volume 1, overlapping by 0.5. Their material union has volume 1.5. A parametric candidate P of volume 2 contains both. The comparison at the pinned revision can observe `sum(A,B) = volume(P) = volume(union(A,B,P)) = 2` and accept P, although the material differs.

This is an analytical counterexample derived from the comparison algorithm, assuming successful geometric operations with those values. It requires a native regression before it can be reported as a reproduced failure. ADR-0002's explicit-conversion rule remains required even if the comparison is improved.

## Decision

The Body module implements one cohesive interface for validation, adoption, borrowing, copying, transforms, disposal, bounds, and material measurement. The document owns adopted Bodies and tracks document-wide handle ownership. These operations do not inspect Classification or own Placement storage, recipe parsing, IFC entities, or document traversal.

The contract is:

1. A retained item has one owner and one disposal path. Evaluator results, topology-cache handles, and read indexes are borrowed. Borrowers must not dispose these handles. Retention beyond an owner's lifetime requires an independent copy.
2. Adoption validates the entire nonempty collection before transfer. Items must be live valid solids with distinct handle identities and a compatible representation. Distinct wrappers exposing the exact same `.wrapped` resource object also conflict. No item may already belong to another record or pending adoption in the target document. Capture resource identity while live and retain it through uncertain cleanup, without querying a disposed original. Independent copies and placements remain legal even when a kernel reports equal topology. Exclusive caller ownership is required; `readonly` cannot prove arbitrary external aliasing or cross-document ownership. Cross-document reuse requires independent copies or an explicit transfer protocol.
3. Successful adoption copies and protects the collection while transferring handles. Failure leaves caller handles live and the document unchanged. One explicit commit point determines ownership; later cleanup faults must not make it ambiguous.
4. Replacement preserves physical element identity, existing metadata, type reference, external classification associations, appearance, Placement, and valid relationships. The detailed model in Deferred [ADR-0008](0008-explicit-bim-type-identity.md) waits for step 4. Already-cut authoritative geometry is not cut again because a void relationship exists.
5. Copy and transform operations borrow inputs and return fresh owned outputs. A later-item error or throw releases every new output and intermediate without disposing retained inputs. Document disposal is idempotent; tests count releases to detect duplicate owners hidden by idempotent handles.
6. Bounds include every item in a named coordinate space. Body material volume is occupied union, including disconnected or overlapping items. An explicitly named item-volume sum may be diagnostic only. Overlap between separate physical elements is a different quantity policy.
7. Measurement may create a temporary union and must release it on every exit. It never merges retained or exported items. Rigid Placement does not change volume. Failure returns unavailable/error, never zero or an envelope estimate.

The same measurement implementation serves authoring comparisons, document queries, complete imported Bodies, and quantity adapters. Optional IFC quantities may be omitted with a diagnostic; required measurements fail the operation. Nominal dimensions remain class-specific facts. Gross volume, surface quantities, and weight need supporting facts, not an authoritative Body's bounding box.

Authoring owns recipe-generated items until successful Body adoption and releases them on a failed generation or transfer. Once adopted, recipe-generated and directly authored items use the same Body operations. Assemblies have `NONE`; each geometry-bearing child owns a Body with its own Placement. There is no separate generated/composite ownership branch. Intentional absence is distinct from zero measured material.

Acceptance requires later-item failures and throws during adoption, transforms, authoring generation, and union measurement. Check duplicate and disposed handles, target-document aliases, caller-mutable arrays, unchanged inputs, and exact release counts. Disconnected and overlapping Bodies preserve order and item count through measurement and exchange.

For occt-wasm, read the native arena's `getShapeCount()` through the raw kernel, following [the upstream arena disposal tests][arena-tests]. Those tests explain why JavaScript live-handle statistics alone cannot detect orphaned arena slots. Compare counts before and after completed ownership scopes and test release calls separately. Scope probe-owned intermediates with `using`. Successful adoption may retain the expected items until document disposal; failed operations must return to their pre-operation arena count with caller inputs still live.

## Consequences

### Positive

- Ownership and failure rules have one implementation per representation.
- All consumers agree on material volume.
- New classifications inherit complete lifecycle behavior.

### Costs and risks

- Copies, realization, and temporary unions have costs that require measurement.
- Runtime validation cannot prove arbitrary external ownership or native aliases represented by different resource objects. Rejecting a manufactured owning alias does not disable its disposer or finalizer; manufacturing such aliases still violates exclusive caller ownership. This check introduces no native identity protocol or global registry.
- Cleanup failures require a clear post-commit outcome rather than ambiguous rollback.

## Alternatives considered

### Lifecycle callbacks per class

They repeat shared policy and allow new classifications to omit required behavior.

### Fuse retained items permanently

This loses authored item identity and performs Boolean work even for traversal.

### Sum volumes or use bounds after a failed union

Both can report plausible but incorrect material quantities. An explicit unavailable result preserves the failure.

## Related

- [BIM glossary](../../CONTEXT.md)
- [ADR-0001: Representation dispatch](0001-independent-product-representation-and-placement.md)
- [ADR-0002: Body authority](0002-authored-body-authority.md)
- [ADR-0007: Complete and partial imported Bodies](0007-ifc-import-fidelity-and-item-outcomes.md)
- [Failure and overlap acceptance scenarios](../architecture-migration.md#acceptance-scenarios)

[disposal]: https://github.com/andymai/brepjs/blob/4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466/packages/brepjs-bim/src/model/bimModel.ts#L120
[takeover]: https://github.com/andymai/brepjs/blob/4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466/packages/brepjs-bim/src/model/bimModel.ts#L372
[coincidence]: https://github.com/andymai/brepjs/blob/4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466/packages/brepjs-bim/src/familiesProductBody.ts#L206
[wall-quantities]: https://github.com/andymai/brepjs/blob/4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466/packages/brepjs-bim/src/serialize/exactWallQuantities.ts#L25
[importer]: https://github.com/andymai/brepjs/blob/4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466/packages/brepjs-bim/src/import/fromIfc.ts#L328
[overlap-test]: https://github.com/andymai/brepjs/blob/4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466/packages/brepjs-bim/tests/exactProductBodyTakeover.test.ts#L326
[compound]: https://github.com/andymai/brepjs/blob/4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466/src/csg/evaluators/compound.ts#L10
[arena-tests]: https://github.com/andymai/brepjs/blob/4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466/tests/wasmArenaDisposal.test.ts#L1
