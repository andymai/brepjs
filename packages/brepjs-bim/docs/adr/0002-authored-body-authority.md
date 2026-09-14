# ADR-0002: Preserve authored Body authority

**Status**: Proposed
**Date**: 2026-09-10
**Authors**: viktar-b

## Context

At upstream `4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466`, [authored Body adoption][takeover] is restricted to Wall and Railing and requires an existing element. The [Body type][body-type] is `PARAMETRIC { solid } | EXACT { solids: NonEmpty }`. [#2286](https://github.com/andymai/brepjs/pull/2286) and [#2295](https://github.com/andymai/brepjs/pull/2295) addressed [#2272](https://github.com/andymai/brepjs/issues/2272). Their implementation and regression tests are the starting point for this migration.

The remaining limitation is broader than the naming of `EXACT`. An authored Roof cannot use that adoption path: the category check rejects it, and [civil routing][routes] has no Roof route. The existing path couples geometry retention to supported class-specific construction. A caller with valid final geometry still needs a supported candidate before takeover. This adds recipe requirements and allocation paths unrelated to the supplied Body.

A Family invocation may produce geometry that a simpler BIM recipe cannot reproduce. The [BIM glossary](../../CONTEXT.md) therefore separates authority, provenance, and item count. An authored singleton can be authoritative; a recipe can generate several disconnected solids. Parametric Family authoring does not authorize another recipe to replace its result.

This proposal requires explicit caller-requested conversion and direct authored-Body creation. A repository-owned shaped-Roof fixture must verify preservation.

## Decision

Explicitly authored Body items govern material shape. Retain those items and their authority even when a recipe could produce coincident material. Conversion to recipe authority requires an explicit caller request through an authoring command. The command must preserve required shape and item semantics and record the change. Automatic substitution after a stronger coincidence check is excluded.

Authority determines which shape governs; provenance describes how geometry was obtained. Neither determines item count, IFC encoding, validity, or reconstruction fidelity. Proposed state labels `PARAMETRIC` and `AUTHORITATIVE` describe the Body's relationship to the BIM authoring recipe, not the method used to construct its solids.

Start from the existing `ProductBody`, `bodySolids()`, `disposeProductBody()`, and the #2286/#2295 tests. Step 1 renames the `EXACT` state to `AUTHORITATIVE` and gives `PARAMETRIC` a nonempty item collection. Step 2 renames `ProductBody` to `Body` as all stored-solid classes adopt the common representation. Move the implementation and tests together; do not introduce a second competing Body type or keep compatibility aliases after the cutover.

Stored geometry governs current queries and export. A recipe belongs to authoring data and can produce a replacement Body through an explicit command. Descriptive dimensions do not authorize regeneration when they disagree with retained geometry.

Body replacement retains existing BIM type membership and external classification associations. Geometry authority does not authorize reclassification or changes to shared semantic identity. The detailed type model in Deferred [ADR-0008](0008-explicit-bim-type-identity.md) is reviewed in step 4 and does not block the Body foundation.

Any supported Classification using `BODY` can be created directly from validated authored items, physical element identity, and Placement. It does not require a valid generator specification or a disposable parametric candidate first. Optional class-specific descriptive data cannot become a geometry-generation prerequisite.

For a shaped Roof with an opening, authoring adopts the final local Body and its valid relationships together. IFC maps Roof semantics and encodes the retained items. An opening already cut into the Body is not subtracted again. Recipe-based opening commands must reject incompatible authoritative state before mutation. Missing typed support produces a capability error; Proxy requires a deliberate caller choice.

Acceptance requires direct shaped-Roof creation without a rectangular recipe, preservation of the opening, and unchanged material and identity after IFC reload. Singleton authoritative Bodies and multi-item recipe Bodies must both work. A coincident recipe must leave authored items and authority intact unless the caller requests conversion. Implementing conversion itself is not required for the initial migration.

## Consequences

### Positive

- Authored geometry survives projection without needing an approximate recipe.
- Classification can remain Roof, Sign, or Member when geometry is arbitrary.
- Authority changes are visible authoring actions.

### Costs and risks

- Some Bodies cannot support existing parametric editing commands.
- Retained geometry can cost more to encode than a compact recipe.
- Conversion needs validation of both material and item semantics if implemented.

## Alternatives considered

### Automatically substitute a coincident recipe

This can retain convenient editing and compact encoding, but changes authored authority and potentially item semantics. The explicit-conversion rule in this proposal rejects it.

### Build a disposable candidate before adoption

This couples direct Body creation to recipe availability and adds allocation and failure paths unrelated to authored geometry.

### Use Proxy for every arbitrary Body

This preserves shape at the cost of requested Classification and does not solve authority.

## Related

- [ADR-0001: Independent axes](0001-independent-product-representation-and-placement.md)
- [ADR-0003: Adoption and replacement ownership](0003-geometry-ownership-and-material-operations.md)
- [ADR-0005: Families projection](0005-families-projection-into-bim.md)
- [Analytical overlap counterexample](0003-geometry-ownership-and-material-operations.md#overlapping-item-coincidence)
- Repository [#2272](https://github.com/andymai/brepjs/issues/2272), [#2286](https://github.com/andymai/brepjs/pull/2286), and [#2295](https://github.com/andymai/brepjs/pull/2295)

[body-type]: https://github.com/andymai/brepjs/blob/4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466/packages/brepjs-bim/src/types/productBody.ts#L5
[takeover]: https://github.com/andymai/brepjs/blob/4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466/packages/brepjs-bim/src/model/bimModel.ts#L372
[routes]: https://github.com/andymai/brepjs/blob/4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466/packages/brepjs-bim/src/familiesAdapter.ts#L216
