# ADR-0006: Keep IFC exchange behind an adapter

**Status**: Deferred
**Date**: 2026-09-10
**Authors**: viktar-b

Re-review in migration step 4. Keep existing IDS conformance in CI and local IfcOpenShell validation running throughout the migration. The broader qualification requirements in this Deferred draft do not block the initial Body and Placement scope.

## Context

At upstream `4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466`, [serialization][export-scope] combines semantic class loops, representation encoding, and [selective style application][styles]. The posted parametric Railing path does not provide the common style pass with every generated target. New representations therefore require changes in several parts of the serializer to receive consistent encoding and appearance.

Cleanup already exists at that revision. `toIfc` scopes its writer with `using`, and [`save`][writer-lifecycle] closes its model in `finally`. The migration must preserve those scopes and cover failures introduced by new preflight and item traversal. The cited source does not establish a native memory leak.

### Existing validation and its limits

[`checkSchema`][ifc-schema-check] reopens bytes and checks selected structure and GUIDs; [round-trip validation][ifc-roundtrip] compares counts. [`toIfcValidated`][ifc-validated-export] can return bytes alongside post-save errors. These checks cannot by themselves establish semantic preservation or geometry fidelity.

The [Python validator][ifc-independent-script] enables EXPRESS rules and geometry generation. The [BIM CI job][ifc-ci] requires the pinned 334-case IDS checker conformance output, but does not invoke that Python validator or the complete normative-rule runner. Checker conformance and validation of an exported project are different claims.

The [upstream validation record][upstream-validation] documents fixture-level results and receiving-application gaps. Those historical results qualify neither a new implementation nor untested schemas and profiles. [VALIDATION.md](../../VALIDATION.md) retains the existing upstream results and tool instructions. The [proposed qualification procedure](../exchange-qualification.md) holds the future acceptance requirements. This documentation revision runs no IFC or native geometry tests.

The proposed adapter makes exchange policy and failure reporting explicit while retaining existing validation. That separation adds integration work and a larger qualification matrix; it does not provide broader IFC support merely by moving code.

## Decision

The IFC adapter owns schema entities and capabilities, class/type/role mappings, standard property sets, source IDs, file metadata, representation and Placement encoding/decoding, unit conversion, graph scheduling, runtime validation, diagnostics, and foreign resources.

Declare support by exact schema release and exchange profile, including legal entity, type, predefined-value, relationship, property-set, and representation combinations. Record reader recognition, implemented import, implemented export, and independent qualification separately. An entity mapping or accepted schema alias alone establishes none of the other states. This is a bounded exchange contract, not a full IFC-schema mirror.

Semantic handlers validate requested Classification and legal schema combinations. They select entity and predefined intent, including required user-defined labels. Physical element metadata and assigned BIM type values follow the selected schema's rules; do not blindly stamp both. Role tables require focused review. Unsupported capabilities fail explicitly, and a schema alias cannot claim support the runtime lacks.

The adapter encodes the type definitions, property scopes, and external classification associations owned under [ADR-0008](0008-explicit-bim-type-identity.md). Preserve every requested supported association, supplied classification identity and edition, and supplied parent-reference chain. Property data types and physical values survive documented unit conversion. Missing optional source fields stay absent; delivery requirements may require them explicitly. Schema mapping cannot merge distinct definitions or invent classification values.

Representation encoding operates independently of Classification. It borrows retained geometry and preflights every item into plain serializable data before committing its owning representation. One retained Body item becomes one IFC Body representation item. Measurement unions are temporary and are never exported. Unsupported typed intent cannot silently become Proxy.

Schedule contexts, containers, physical elements, relationships, types, appearances, and quantities in dependency order. Encoding returns every styleable target for a physical element's Body, including multi-item recipe Bodies. Assembly children are separate physical elements and use their own Bodies, Placements, and appearance assignments. The common writer applies each physical element's optional appearance to all of its targets and creates no synthetic style for unstyled elements. A `NONE` assembly has no Body style target of its own.

Neutral lengths use millimetres, areas mm², and volumes mm³. Convert geometry, Placement, and quantities exactly once at the IFC boundary. Tessellate in the physical element's local frame and encode its Placement separately. Geographic CRS/map conversion is distinct from the document's World frame. Configurable output units remain separate work.

Export returns no partial artifact as success. A later item or graph failure releases adapter temporaries and owned runtime resources while document geometry stays live. Validate raw backend values at the interface. Cover initialized APIs, vectors, geometry handles, initialization failures, and existing writer/model scopes. Foreign cleanup rules remain backend-specific.

Successful export requires all mandatory runtime checks to pass and all requested supported content to be emitted. Error-level validation or backend diagnostics prevent success; returning bytes alongside an error report is not successful export. Capture lookup/write failures as actionable typed errors; do not globally suppress them. Optional unavailable measurements may omit a quantity with a diagnostic; required measurements fail.

Independent qualification is separate from runtime success. CI must qualify freshly generated files for the claimed schema/profile using independent STEP syntax, EXPRESS, and applicable normative-rule checks. Record industry-practice findings, project IDS requirements, semantic preservation, geometric fidelity, and receiving-application results separately. Required failed, unavailable, or unrun checks block the corresponding qualification claim. This policy does not require a remote service or Python runtime in every export call. [Proposed qualification procedures and receipts](../exchange-qualification.md) hold the operational details.

Preservation acceptance follows authored document → IFC → imported-document read contract for the declared supported subset. Compare physical element and type identities, memberships, Classification, external classification associations, shared and occurrence properties, materials, relationship endpoints, Placement, appearance, and every Body item. Effective values and entity counts alone cannot establish preservation. Arbitrary IFC → authored document → IFC exchange and native Family recovery remain outside scope until their separate contracts exist.

Acceptance also requires failed later-item writes that return no successful artifact. Verify resource release and live document inputs on returned errors and throws. Thin sloping panels with holes must retain qualified geometry after reload. Test explicit facility/schema support states and diagnostic-free success, with the semantic and negative cases in the [migration note](../architecture-migration.md#ifc-semantic-preservation-and-qualification).

## Consequences

### Positive

- Schema support can grow without changing shared geometry lifecycle.
- Export preserves authored items and keeps document ownership intact.
- Runtime failures have a defined result and cleanup owner.

### Costs and risks

- Preflight requires temporary memory and delays representation commit.
- Backend-specific cleanup and diagnostic behavior need native qualification.
- New semantic classes still require schema mappings and focused exchange tests.
- Independent qualification needs pinned tools, fresh fixtures, and explicit results for each claimed exchange profile.

## Alternatives considered

### Keep IFC types and runtime behavior in the document

This makes neutral model operations load exchange dependencies and ties Placement to a writer.

### Let semantic handlers own geometry lifecycle and style application

This repeats all-item behavior per class and permits omissions such as unstyled generated geometry.

### Return valid bytes despite failed items or backend errors

This conceals incomplete exchange as success and prevents callers from assessing the result.

## Related

- [BIM glossary](../../CONTEXT.md)
- [ADR-0001: Dependency direction](0001-independent-product-representation-and-placement.md)
- [ADR-0003: Borrowing and material measurement](0003-geometry-ownership-and-material-operations.md), [ADR-0004: Coordinates](0004-document-resolved-placement-and-datum.md)
- [ADR-0007: Import outcomes](0007-ifc-import-fidelity-and-item-outcomes.md), [ADR-0008: Metadata, type identity, and appearance](0008-explicit-bim-type-identity.md)
- [Exchange acceptance scenarios](../architecture-migration.md#acceptance-scenarios)

[styles]: https://github.com/andymai/brepjs/blob/4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466/packages/brepjs-bim/src/serialize/toIfc.ts#L839
[writer-lifecycle]: https://github.com/andymai/brepjs/blob/4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466/packages/brepjs-bim/src/ifc-writer/ifcWriter.ts#L100
[export-scope]: https://github.com/andymai/brepjs/blob/4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466/packages/brepjs-bim/src/serialize/toIfc.ts#L205
[ifc-schema-check]: https://github.com/andymai/brepjs/blob/4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466/packages/brepjs-bim/src/validation/schemaCheck.ts#L25
[ifc-roundtrip]: https://github.com/andymai/brepjs/blob/4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466/packages/brepjs-bim/src/validation/roundTrip.ts#L12
[ifc-validated-export]: https://github.com/andymai/brepjs/blob/4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466/packages/brepjs-bim/src/serialize/toIfc.ts#L1278
[ifc-independent-script]: https://github.com/andymai/brepjs/blob/4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466/packages/brepjs-bim/scripts/validateIfc.py#L47
[ifc-ci]: https://github.com/andymai/brepjs/blob/4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466/.github/workflows/ci.yml#L286
[upstream-validation]: https://github.com/andymai/brepjs/blob/4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466/packages/brepjs-bim/VALIDATION.md
