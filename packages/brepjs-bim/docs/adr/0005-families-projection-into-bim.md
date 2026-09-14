# ADR-0005: Project explicit Families meaning into BIM

**Status**: Deferred
**Date**: 2026-09-10
**Authors**: viktar-b

Re-review in migration step 5 after ADR-0001 through ADR-0004 land. Coordinate the Families adapter, create-brepjs template, and playground examples at that step. This Deferred draft is not a prerequisite for the initial scope.

## Context

Families describe parameterized geometry, composition, and optional domain meaning. They also serve geometry authoring and preview independently of IFC. A BIM adapter projects supported authored elements into a model; IFC export serializes that model.

At upstream `4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466`, [projection routes][routes] use free-form civil routes, display-name fallback, and a whole-tree civil mode. The same invocation can therefore be interpreted through different conventions depending on the surrounding tree. The [hierarchy guard][hierarchy] also needs an explicit nested-Site policy. [#2295](https://github.com/andymai/brepjs/pull/2295) preserves evaluated Bodies for Wall and Railing, but the adapter still relies on class-specific candidates and [geometry-wrapper recovery][datum-recovery]. ADR-0002 describes the resulting limitation on direct authored-Body creation.

The [BIM glossary](../../CONTEXT.md) distinguishes Family definition, Family invocation, and Physical element. The proposed projection must preserve Families as an independent authoring system while replacing implicit naming and wrapper conventions with declared meaning.

Removing `NAME_ARCHETYPES` and whole-tree civil switching requires a coordinated migration of producers and consumers. Until step 5, the temporary internal adapter must preserve the existing #2270 regressions and fail on unexpected structures. It must disappear at cutover and must not preserve retired public APIs.

## Decision

Families exposes explicit authored meaning independently of BIM and IFC. A Family definition is reusable geometry, composition, and optional meaning. A Family invocation supplies parameters and authoring context. It may describe a physical element, a container, or supporting geometry. Helper nesting alone creates no additional physical elements.

For example, the registry [Column](https://github.com/andymai/brepjs/blob/4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466/packages/brepjs-families/registry/families/column.ts) is a Family definition. One invocation may describe column C-01, a physical element. A [Storey](https://github.com/andymai/brepjs/blob/4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466/packages/brepjs-families/registry/families/storey.ts) invocation describes a spatial container. Reusing Column, its name, or its geometry does not establish a shared BIM type.

The Families adapter translates explicit resolved Classification, Placement, relationships, metadata, and tagged geometry into document/authoring commands. It maps supported authored intent per invocation. It does not infer Classification from display names, guess IFC enums, or switch the whole tree into a separate civil interpretation.

Resolved meaning includes optional authored BIM type definitions and references, shared and occurrence-specific properties, and external classification associations. Projection preserves their declared scope under [ADR-0008](0008-explicit-bim-type-identity.md), using target-independent data rather than IFC runtime types. Unsupported required semantic data produces a capability error instead of being silently stripped.

Physical assembly meaning distinguishes aggregation from ordered nesting. Assemblies have no synthetic Body, and their decomposition does not imply child Placement. Nested-Site legality requires a separate hierarchy decision before implementation.

Geometry and Placement cross the adapter independently. Local input identifies its frame; tagged World input can be copied and inverse-localized once. Evaluator results are borrowed and must be independently copied before retention. The document's adoption operation decides ownership transfer, including failure.

The adapter preserves explicitly authored Body items and authority. It can create a typed physical element directly without first creating a disposable parametric candidate. Parametric authoring never authorizes automatic conversion to a BIM recipe. Unsupported typed intent returns an explicit capability error rather than silently selecting Proxy.

Delete display-name routing, whole-tree civil switching, and wrapper recovery at the coordinated cutover. Families remains independent of BIM/IFC runtime types. A viewer mesh is not a mandatory intermediate in IFC export.

Preservation covers evaluated physical elements and their declared semantics. IFC exchange does not promise recovery of editable Family generators, parameter constraints, or render functions. Retaining and packaging native Family definitions remains separate work.

Acceptance requires a direct shaped Roof with an opening, a Bodyless assembly, and an explicit unsupported-intent result. Preserve #2259/#2270 Placement regressions and #2286/#2295 Body regressions. Demonstrate that helper nesting does not duplicate physical elements and Family reuse does not invent BIM type identity. Project multiple explicit types and external classifications from one Family definition without merging their identities or losing property scope.

## Consequences

### Positive

- Reusable Families retain meaning across BIM and non-IFC consumers.
- Classification and Placement no longer depend on naming or wrapper conventions.
- Authored geometry uses the same adoption rules as direct authoring.

### Costs and risks

- Families and BIM consumers need a coordinated breaking cutover.
- Definitions relying on implicit conventions need explicit authored meaning.
- Unsupported semantics become visible errors.

## Alternatives considered

### Continue extending name and civil-route tables

This preserves implicit conventions and makes new classes repeat adapter behavior.

### Put IFC enums and writer concerns in Families

This makes general authoring depend on one exchange target.

### Treat every invocation as a physical element

Containers and geometry helpers have different meanings; promoting them all duplicates identities and geometry.

## Related

- [Family registry](../../../brepjs-families/registry/families/)
- [ADR-0001: Document and adapter boundaries](0001-independent-product-representation-and-placement.md)
- [ADR-0002: Authored authority](0002-authored-body-authority.md), [ADR-0004: Placement](0004-document-resolved-placement-and-datum.md), [ADR-0008: Type identity](0008-explicit-bim-type-identity.md)
- Repository [#2295](https://github.com/andymai/brepjs/pull/2295)

[routes]: https://github.com/andymai/brepjs/blob/4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466/packages/brepjs-bim/src/familiesAdapter.ts#L216
[hierarchy]: https://github.com/andymai/brepjs/blob/4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466/packages/brepjs-bim/src/familiesAdapter.ts#L1142
[datum-recovery]: https://github.com/andymai/brepjs/blob/4602096ebc3c9ea0263d5b2a1b7d3b6dee24c466/packages/brepjs-bim/src/familiesAdapter.ts#L967
