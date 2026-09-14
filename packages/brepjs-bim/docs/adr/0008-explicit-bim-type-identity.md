# ADR-0008: Explicit BIM type identity, metadata, and appearance

**Status**: Deferred
**Date**: 2026-09-10
**Authors**: viktar-b

Re-review in migration step 4. The initial scope preserves existing identity and metadata without requiring this Deferred type model to land first. A Family definition does not establish a shared BIM type.

## Context

A reusable Family definition and repeated geometry do not establish a shared BIM type. The [BIM glossary](../../CONTEXT.md) makes that distinction explicit. Root ADR-0014 already separates durable authored identity from content-addressed geometry.

At upstream `4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466`, [IFC types group by category and predefined value][type-grouping]; Walls share a generic `IfcWallType`, and the [type writer][type-metadata] omits shared property sets. [Style application][styles] is selective. The current grouping cannot express distinct authored type identities that share the same category and predefined value. That limitation is separate from occurrence property support, appearance, and role-to-IFC mapping.

At that same revision, export [groups classification references][class-grouping] by system name and code without edition, and the [writer][class-writer] deduplicates systems by name. The public import limitations are recorded in ADR-0007. These pinned source observations support explicit definition and classification identity; they do not establish failure for every metadata path.

This record preserves the accepted root identity decision and proposes ownership of shared type definitions, physical element metadata, and appearance assignments.

## Decision

The neutral document owns document-local record identity, stable authored keys, optional physical element metadata, reusable BIM type definitions, external classification references and associations, and appearance assignments. These are distinct from Classification, Geometry representation, and Placement.

Preserve root ADR-0014. Identity never enters CSG hashes. Durable exported identity derives from explicit authored keys, not names, shape, Placement, or evaluation order. Unkeyed authored elements fail at the identity boundary. Opening identity belongs to the host's void slot.

Sharing a BIM type requires an explicit stable `definitionKey`. Compatible equal keys refer to the same definition; conflicting reuse is invalid. A Family definition, display name, authored path, geometry, role, or Placement cannot implicitly create that association. Reusing registry Column therefore establishes neither shared physical identity nor shared BIM type identity.

Compatibility compares explicitly declared type data, including class/role intent, shared properties, and external classification associations. It is not inferred from geometric equality. BIM type definitions own shared properties; physical elements retain occurrence-specific properties separately. An effective property view may resolve occurrence overrides under the exchange contract, but must preserve both the underlying records and the origin of each value.

Physical elements may omit a BIM type definition where the selected exchange contract permits. Export leaves these elements untyped by default. Synthesizing a shared IFC type requires an explicit, documented export policy and a reported synthetic identity. That policy must never merge distinct authored definitions or imported source type identities, and cannot substantiate preservation of an authored type. Implementing synthetic grouping is not required for this migration; a profile requiring a type must otherwise reject missing type information. Imported source type identity remains separate from authored `definitionKey`.

External classification references retain supplied system identity, source, edition, edition date, code, labels, system and reference URIs, and parent references. Physical elements and BIM type definitions may each have multiple associations. Preserve association scope and source records when exposing inherited classifications. Equal system names and codes alone do not justify merging different editions or reference chains. Missing source values remain absent. A flat reference is valid when no hierarchy is supplied; this contract requires no online taxonomy lookup or invented ancestor chain.

Keep optional `name`, `description`, `objectType`, and `tag` separate from neutral class/role intent. IFC maps supported roles and required labels according to the selected schema. Detailed role-to-schema tables need their own review.

Retain one optional appearance assignment per physical element in this rework. The IFC representation encoder returns every styleable target for that element's Body, including a multi-item recipe Body, and common writing applies the assignment to all of them. Each geometry-bearing assembly child uses its own assignment. A `NONE` parent has no Body target, and unstyled elements receive no synthetic style. Per-item appearance overrides are separate work.

Body replacement preserves physical element identity, metadata, definition reference, external classification associations, appearance, Placement, and valid relationships. Neither geometry replacement nor parameter changes silently redefine shared type identity.

Acceptance requires compatible type reuse, conflicting-key rejection, distinct identities for repeated Family invocations, and no inferred shared type from Family reuse. Distinct types with identical geometry remain distinct; untyped elements follow the explicit export policy. Preserve shared properties and occurrence overrides without flattening their origins. Multiple classification associations and references using the same code in different editions must survive the supported exchange path. Replace a Body and verify preserved metadata, type membership, external classification associations, and appearance. Read back styled and unstyled multi-item Bodies, recipe Bodies, and assembly children without missing or synthetic styles under [ADR-0006](0006-ifc-exchange-adapter.md).

## Consequences

### Positive

- Reuse of geometry cannot silently merge physical or type identities.
- Metadata and appearance survive Body replacement.
- Every representation follows one appearance-assignment policy.

### Costs and risks

- Authors must choose explicit shared type identity when they need it.
- Conflicting definitions require resolution instead of silent merging.
- Preserving property scope and classification references requires more records than flattened instance metadata.
- One appearance per physical element cannot express item-specific overrides.

## Alternatives considered

### Infer BIM type identity from Family names or geometry

Names are mutable, and identical geometry can represent different authored meanings.

### Reuse authored physical identity as type identity

A physical element and its shared definition have different lifetimes and relationships.

### Assign appearance independently in each class writer

This repeats representation traversal and allows new classes to omit style targets.

## Related

- Root [ADR-0014: Identity beside content addressing](../../../../docs/decisions/0014-identity-beside-content.md)
- [ADR-0001: Neutral document ownership](0001-independent-product-representation-and-placement.md)
- [ADR-0002: Body replacement and authority](0002-authored-body-authority.md)
- [ADR-0005: Family definitions and invocations](0005-families-projection-into-bim.md)
- [ADR-0006: Schema and style encoding](0006-ifc-exchange-adapter.md), [ADR-0007: Imported source identity](0007-ifc-import-fidelity-and-item-outcomes.md)

[type-grouping]: https://github.com/andymai/brepjs/blob/4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466/packages/brepjs-bim/src/serialize/toIfc.ts#L1215
[type-metadata]: https://github.com/andymai/brepjs/blob/4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466/packages/brepjs-bim/src/ifc-writer/typeWriter.ts#L37
[styles]: https://github.com/andymai/brepjs/blob/4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466/packages/brepjs-bim/src/serialize/toIfc.ts#L839
[class-grouping]: https://github.com/andymai/brepjs/blob/4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466/packages/brepjs-bim/src/serialize/toIfc.ts#L1151
[class-writer]: https://github.com/andymai/brepjs/blob/4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466/packages/brepjs-bim/src/ifc-writer/classificationWriter.ts#L32
