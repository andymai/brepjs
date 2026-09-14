# ADR-0007: Preserve IFC import fidelity and item outcomes

**Status**: Deferred
**Date**: 2026-09-10
**Authors**: viktar-b

Re-review in migration step 4 after the Body foundation exists. This Deferred draft defines complete, partial, and lossy outcomes for that review; it is not a prerequisite for the initial scope.

## Context

At upstream `4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466`, the importer includes the all-item traversal from [#2278](https://github.com/andymai/brepjs/pull/2278) and tessellated reconstruction fixes from [#2273](https://github.com/andymai/brepjs/pull/2273). These regressions remain part of the migration baseline. The [importer at that revision][importer] still uses closed physical-element enumeration, combines public lossy meshes, and computes aggregate volume by summing items. Fatal import already disposes accumulated results; preserve that cleanup.

The same source reads [a type's predefined value][type-read] without retaining the full type identity/membership graph or [inherited properties][property-read]. The separate IDS engine handles type inheritance, so this is a public import limitation. The [classification reader][class-reader] retains only the first direct occurrence association and omits edition, URI, and parent chains. These limits prevent callers from inspecting the complete source semantic graph through the public import result. They motivate separate item and semantic outcomes.

An imported element can be identifiable even when its geometry cannot be reconstructed completely. A successful sibling item does not prove that whole-Body bounds or volume are available.

## Decision

Keep a separate imported-document read contract during this migration. Reconstructed solids remain explicitly World-placed, with source Placement, item identities, fidelity, and diagnostics available. Do not apply source Placement again to those solids. The [BIM glossary](../../CONTEXT.md) still governs the meaning of Body and World coordinates; import does not redefine them.

Account for every source Body item. Each yields an owned solid, a retained lossy mesh, or an explicit diagnostic. Preserve item identity and order and the all-item traversal introduced by #2278. Unsupported physical elements remain identifiable instead of disappearing from enumeration. Assembly children retain their own identities and geometry once; do not also synthesize that geometry on a bodyless parent or duplicate the child record.

Report both completeness and fidelity. Distinguish no source Body, no reconstruction, partial reconstruction, and complete reconstruction. Retained lossy meshes remain marked lossy; their presence does not establish a complete solid Body. Intentional absence in an authored representation is not interchangeable with failed reconstruction.

Semantic retention and geometric reconstruction have independent outcomes. Preserve identifiable source elements, their source IFC classes, supported type definitions and memberships, shared and occurrence metadata, external classification associations, and supported relationship endpoints even when geometry is absent or reconstruction fails. Report unsupported or unresolved semantic content against its source identity. Complete geometry does not establish complete semantic retention, and partial semantics must not be reported as complete.

Only complete reconstruction can expose whole-Body bounds or material volume. Complete Bodies use the shared occupied-material measurement operation, which may still return unavailable/error. Partial results retain successful siblings and item diagnostics without claiming complete aggregates.

The imported document owns retained results. Read indexes borrow and add no disposal path. Item failure releases that item's intermediates. Element failure releases geometry accumulated for that element. A fatal import failure releases all accumulated elements. Partial success remains inspectable only through the explicit partial-result contract.

Preserve source type identity and membership without inventing an authored `definitionKey`. Keep type properties and occurrence overrides separately, retaining their source scope when computing effective values. Recover every supported external classification association on types and occurrences, including supplied system identity, edition, code, URI, and parent references. Missing values remain absent; unsupported associations require explicit outcomes rather than first-reference truncation.

Explicit normalization from imported World geometry into an authored document is separate work. Until defined, no implicit adoption may turn partial or lossy geometry into an authoritative authored Body. The authored → IFC → imported-read acceptance route in [ADR-0006](0006-ifc-exchange-adapter.md) does not authorize arbitrary source IFC re-export or native Family reconstruction.

Acceptance preserves #2273/#2278 regressions and exercises complete, absent, lossy, failed, and partial item outcomes. Inject a later-item failure and inspect retained siblings, diagnostics, and withheld aggregates. Inject a fatal failure and verify all owned results are released exactly once. Check World coordinates and item identity after multi-item import, including overlapping material and unsupported classes.

The same fixtures must preserve source type membership, property scopes, multiple classification associations, and supported graph relationships during geometry failures. Unsupported semantic content stays identifiable and cannot silently count as preserved. Use the [semantic acceptance cases](../architecture-migration.md#ifc-semantic-preservation-and-qualification) alongside the geometry cases.

## Consequences

### Positive

- Callers can distinguish inspectable partial data from complete geometry.
- Source items and unsupported semantic entities remain traceable.
- Import uses the same material definition as authoring and export quantities.

### Costs and risks

- Callers must handle completeness and fidelity explicitly.
- Per-item outcomes retain more structure than a combined fallback mesh.
- Import and authoring temporarily have distinct document contracts.

## Alternatives considered

### Return only reconstructed successes with whole-element aggregates

This hides missing items and overstates geometric completeness.

### Fail every import on any unsupported item

This prevents useful inspection of successful siblings and unsupported semantic records.

### Normalize every import directly into authored local Bodies

This requires unresolved fidelity, identity, and Placement conversion policy. Deferring explicit normalization does not permit silent conversion.

## Related

- [ADR-0003: Ownership and shared measurement](0003-geometry-ownership-and-material-operations.md)
- [ADR-0004: Placement and coordinate spaces](0004-document-resolved-placement-and-datum.md)
- [ADR-0006: IFC runtime boundary](0006-ifc-exchange-adapter.md), [ADR-0008: Source and authored type identity](0008-explicit-bim-type-identity.md)
- Repository [#2273](https://github.com/andymai/brepjs/pull/2273) and [#2278](https://github.com/andymai/brepjs/pull/2278)
- [Partial failure acceptance scenarios](../architecture-migration.md#acceptance-scenarios)

[importer]: https://github.com/andymai/brepjs/blob/4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466/packages/brepjs-bim/src/import/fromIfc.ts#L328
[type-read]: https://github.com/andymai/brepjs/blob/4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466/packages/brepjs-bim/src/import/fromIfc.ts#L519
[property-read]: https://github.com/andymai/brepjs/blob/4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466/packages/brepjs-bim/src/import/dataRead.ts#L193
[class-reader]: https://github.com/andymai/brepjs/blob/4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466/packages/brepjs-bim/src/import/dataRead.ts#L304
