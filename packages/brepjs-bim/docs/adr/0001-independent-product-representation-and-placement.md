# ADR-0001: Independent Classification, Geometry representation, and Placement

**Status**: Proposed
**Date**: 2026-09-10
**Authors**: viktar-b

## Context

The implementation at upstream commit [`4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466`](https://github.com/andymai/brepjs/tree/4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466/packages/brepjs-bim) makes shared geometry behavior depend on element category. [Geometry types][geometry-types], [model disposal][disposal], and [Placement dispatch][placement] repeat category lists. `BimModel` also combines record ownership, recipe generation, and IFC concerns. Wall and Railing share `ProductBody`; other stored-solid classes retain separate paths. The [package exports][package-json] and [root barrel][barrel] expose model and exchange concerns together.

This structure increases the cost of extending BIM classifications. A contributor must identify which class-specific paths need the same ownership, transform, and measurement behavior. Missing one registration can leave a partially supported element. The source establishes this maintenance burden; it does not establish that every extension causes a runtime defect.

An external experiment adding IfcSign motivated the extension scenario. It provides a candidate use case; acceptance requires a repository-owned implementation and tests against the proposed interfaces.

The package-local series uses the [BIM glossary](../../CONTEXT.md) and keeps one monorepo and one BIM npm package. Classification, Geometry representation, and Placement are independent. The prototype migration permits breaking changes without compatibility aliases or a permanent facade. [Discussion #2303](https://github.com/andymai/brepjs/discussions/2303#discussioncomment-18406826) records the upstream request for one PR per migration step.

ADR-0001 through ADR-0004 are Proposed and define the initial scope. ADR-0005 through ADR-0008 are Deferred and require review at their scheduled steps. These records describe a target architecture. Their source observations apply to the pinned revision; implementation must first check them against its chosen upstream base. The [migration note](../architecture-migration.md#evidence-and-maintenance) defines how to maintain this distinction.

## Decision

A physical element records Classification, Geometry representation, and Placement independently. A closed semantic map validates legal class, payload, role, representation, and relationship combinations. It contains no geometry lifecycle callbacks.

The document validates the neutral domain graph before committing changes: endpoints exist, belong to the document, and satisfy the supported relationship's category, cardinality, and cycle rules. Invalid relationships cannot disappear during export as a substitute for rejection. IFC inheritance, inherited attributes, and schema-specific constraints belong to [ADR-0006](0006-ifc-exchange-adapter.md); the neutral document does not mirror the IFC inheritance tree.

The neutral document owns records, identity, relationships, metadata, appearance assignments, Placement references, and adopted geometry. It provides atomic insertion/replacement, queries, Placement changes and record deletion under [ADR-0004](0004-document-resolved-placement-and-datum.md), and final disposal. It does not parse recipes, generate class-specific geometry, or import Families or IFC runtime types.

Authoring validates recipes and class-specific rules, generates local geometry, and changes the document through commands. Families projects authored meaning through that interface. IFC handles exchange through the same neutral model. Neither adapter owns a parallel authored record store. Dependencies flow into neutral document, representation, and Placement modules, then existing brepjs geometry operations. Kernel algorithms remain behind the existing kernel abstraction.

Geometry operations dispatch exhaustively over `BODY | NONE`. `BODY` retains one or more solid items and uses common validation, transforms, bounds, material measurement, and cleanup. `NONE` records intentional absence with a reason; it cannot stand for failed reconstruction or zero measured material. Missing support returns an explicit error.

Stair and ramp flights are realized by authoring into one multi-item Body, with the recipe retained as authoring data under ADR-0002. A curtain wall is an assembly with `NONE` and decomposition edges to Plate/Member children with `BODY` and their own Placement. Former component-local offsets become child Placements. Decomposition and Placement parenting remain independent. The existing [curtain-wall writer][curtain-wall] already emits a bodyless assembly with separately placed Plate and Member children. The proposal carries that structure into the document. No generated or composite representation needs a separate lifecycle branch.

The document distinguishes spatial containment, placement parents, assembly decomposition, BIM type membership, and external classification associations. These relationships do not imply one another. Physical assemblies have no synthetic Body. Aggregation and ordered nesting are explicit relationships. Building, Bridge, Road, and Railway enter the facility abstraction with explicit support states; Bridge is the first complete authoring/exchange path. Detailed nested-Site legality remains separate.

Acceptance requires that adding a class of physical element using an existing representation changes no shared geometry ownership, disposal, Placement, or aggregate measurement. Run IfcSign and direct IfcMember extensions against the step-2 interfaces and inspect their diffs before step 3 begins. The [migration acceptance split](../architecture-migration.md#step-2-extension-check) distinguishes this early check from full document Placement acceptance in step 3 and exchange qualification in step 4.

The first three implementation steps preserve existing identity, metadata, appearance, and relationships through geometry changes. References to ADR-0005 through ADR-0008 describe later integration responsibilities; their proposed type-identity, Families, and exchange models are not prerequisites for the initial scope.

Legitimate class-specific changes include semantic and payload validation, legal combinations, convenience authoring commands, geometry recipes, opening/filling restrictions, IFC class/schema/type/role mappings, applicable quantities/property sets, standards projections, documentation, and focused tests.

After those probes pass, publish focused document, authoring, IFC, Families, and standards entrypoints. Model imports must not transitively load IFC or Families. Exact names and peer dependencies await packed-consumer evidence.

## Consequences

### Positive

- New classifications reuse complete geometry behavior.
- Contributors can locate record ownership, authoring rules, and exchange policy independently.
- Breaking changes allow one coherent contract during the prototype.

### Costs and risks

- Model consumers and Families require a coordinated breaking migration. Moving ownership while adapters still use class-specific paths creates an intermediate regression risk.
- A shared representation type alone does not prove consistent behavior. Every stored-solid class must migrate its operations and failure handling.
- Copies, recipe realization, and union measurement may increase memory and runtime costs; this proposal contains no performance measurements.
- A new representation still needs shared operations and tests.
- Explicit support states expose missing capabilities that conventions previously obscured.

## Alternatives considered

### Extend existing class lists or register lifecycle callbacks

Both keep generic geometry behavior dependent on Classification and fail the extension criterion.

### Keep generated and composite representation variants

Separate variants repeat lifecycle branches for geometry that already consists of solid items or child physical elements. `BODY | NONE` retains recipes in authoring and assembly intent in decomposition relationships. Recipe realization timing belongs to explicit authoring commands.

### Split packages or preserve a permanent facade

Both conflict with the package and prototype constraints in this proposal and add competing contracts.

## Related

- [ADR-0002: Authored Body authority](0002-authored-body-authority.md)
- [ADR-0003: Geometry ownership and material operations](0003-geometry-ownership-and-material-operations.md)
- [ADR-0004: Document-resolved Placement and Datum](0004-document-resolved-placement-and-datum.md)
- [ADR-0005: Families projection into BIM](0005-families-projection-into-bim.md)
- [ADR-0006: IFC exchange adapter](0006-ifc-exchange-adapter.md)
- [ADR-0007: IFC import fidelity and item outcomes](0007-ifc-import-fidelity-and-item-outcomes.md)
- [ADR-0008: Explicit BIM type identity](0008-explicit-bim-type-identity.md)
- [Migration steps and acceptance scenarios](../architecture-migration.md)
- Root decisions on [layering](../../../../docs/decisions/0001-layered-architecture.md), [kernel/domain boundaries](../../../../docs/decisions/0006-domain-boundaries.md), and [identity beside content](../../../../docs/decisions/0014-identity-beside-content.md)

[geometry-types]: https://github.com/andymai/brepjs/blob/4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466/packages/brepjs-bim/src/types/bimTypes.ts#L140
[disposal]: https://github.com/andymai/brepjs/blob/4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466/packages/brepjs-bim/src/model/bimModel.ts#L120
[placement]: https://github.com/andymai/brepjs/blob/4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466/packages/brepjs-bim/src/elementFns/placedGeometry.ts#L48
[package-json]: https://github.com/andymai/brepjs/blob/4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466/packages/brepjs-bim/package.json
[barrel]: https://github.com/andymai/brepjs/blob/4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466/packages/brepjs-bim/src/index.ts#L1
[curtain-wall]: https://github.com/andymai/brepjs/blob/4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466/packages/brepjs-bim/src/ifc-writer/curtainWallWriter.ts#L165
