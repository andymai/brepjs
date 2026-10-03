---
title: Element Catalog
description: 'Every parametric element brepjs-bim authors: structural, spatial, openings, and the profile vocabulary they extrude.'
---

# Element Catalog

Every element has a typed, validated spec in millimeters. Parametric physical elements build analytical brepjs solids in local coordinates; civil spatial elements are body-less, and Earthworks Fill accepts an arbitrary validated body. Placement is applied downstream via `IfcLocalPlacement`.

| Element         | Method                   | Notes                                                                                |
| --------------- | ------------------------ | ------------------------------------------------------------------------------------ |
| Wall            | `addWall`                | Length along `axisX`, openings cut via `addDoor` / `addWindow`                       |
| Slab            | `addSlab`                | `FLOOR` / `ROOF` / `LANDING` / `BASESLAB`; slab openings via `parseSlabOpeningInput` |
| Beam            | `addBeam`                | Profile extruded along `axisX` by length                                             |
| Column          | `addColumn`              | Profile extruded along `axisZ` by height                                             |
| Roof            | `addRoof`                | Flat slab, or shaped (shed / gable / hip / dome) when `pitch` is present             |
| Curtain wall    | `addCurtainWall`         | Panel and mullion grid                                                               |
| Space           | `addSpace`               | Room volumes for zoning and COBie                                                    |
| Footing / pile  | `addFooting` / `addPile` | Foundations                                                                          |
| Stair           | `addStair`               | One or more flights, each a stepped sawtooth solid with its own placement            |
| Ramp            | `addRamp`                | Flights like stairs, inclined slabs                                                  |
| Railing         | `addRailing`             | Posts + rails with `infill: 'POSTED'`, or a single swept panel                       |
| Covering        | `addCovering`            | Finishes: flooring, cladding, ceilings                                               |
| Bridge          | `addBridge`              | IFC4X3 spatial facility; no independent Body                                         |
| Bridge part     | `addBridgePart`          | IFC4X3 recursive spatial part with mandatory usage type                              |
| Earthworks fill | `addEarthworksFill`      | IFC4X3 typed arbitrary Product Body, material, and spatial containment               |
| Proxy           | `addProxy`               | Anything else, carrying arbitrary brepjs geometry                                    |

Doors and windows are not free-standing: `addDoor` / `addWindow` take a host wall, cut the opening as a boolean void, and wire `IfcRelVoidsElement` + `IfcRelFillsElement`.

## Profiles

Beams and columns extrude a **profile**, one vocabulary shared by both:

- Core: `RECTANGULAR`, `CIRCULAR`, `I_BEAM` (with optional root `filletRadius`)
- Extended: L / T / U / Z / C shapes, asymmetric I, ellipse, trapezium, hollow rectangular and circular sections, and arbitrary polygons with voids

Every **named** profile emits its own parametric IFC profile def, extended kinds included: `IfcRectangleProfileDef` / `IfcCircleProfileDef` / `IfcIShapeProfileDef` for the core three, and `IfcLShapeProfileDef`, `IfcTShapeProfileDef`, `IfcUShapeProfileDef`, `IfcZShapeProfileDef`, `IfcCShapeProfileDef`, `IfcAsymmetricIShapeProfileDef`, `IfcEllipseProfileDef`, `IfcTrapeziumProfileDef`, `IfcRectangleHollowProfileDef` and `IfcCircleHollowProfileDef` for the rest. The section stays editable parametric data in the exported file rather than a baked outline.

Only the two point-list kinds serialize as outlines, which is inherent to what they are: `ARBITRARY_CLOSED` becomes `IfcArbitraryClosedProfileDef` and `ARBITRARY_WITH_VOIDS` becomes `IfcArbitraryProfileDefWithVoids`.

On the brepjs side, `extendedProfileToFace` builds the section face for the solid and `extendedProfileArea` gives closed-form areas for takeoff.

## Shaped roofs

`pitch` opts a roof into shaped geometry for its `predefinedType`: a right-trapezoid prism (shed), a house-pentagon prism (gable), a convex-hull hip with the ridge along the longer side, or a faceted dome. Without `pitch` the roof is a flat slab whatever the type says. Shaped roofs serialize as tessellated bodies; flat roofs retain `IfcExtrudedAreaSolid`. Every retained Wall/Railing Body item also serializes independently as a tessellated representation, regardless of authority or item count.

## Placement and display

Element geometry is **unplaced template geometry**. `origin` / `axisX` / `axisZ` live in the spec and become `IfcLocalPlacement`. Wall and railing `.geometry` is a `ProductBody` whose `kind` is `PARAMETRIC` or `AUTHORITATIVE`. Both authorities hold a nonempty, ordered `solids` collection. `bodySolids()` borrows Product-local handles; do not dispose them.

Use `model.replaceProductBody({ localId, body: { kind: 'AUTHORITATIVE', solids } })` to install the complete Body atomically. An error transfers nothing and leaves model state unchanged. Success returns a `COMMITTED` receipt and transfers all supplied solids to the model. Inspect its `cleanup` report separately: a failed release of the old Body does not undo the commit or return ownership of the new Body. Do not retry uncertain releases. An authoritative Body cannot revert to parametric authority.

Register wall openings before installing an authoritative Body. Later `addDoor()` and `addWindow()` calls return `AUTHORITATIVE_WALL_BODY_IMMUTABLE`. Existing opening relationships survive replacement, and the retained Body must already contain their geometry.

`familiesToBim()` performs that sequence for civil-semantic walls and railings using `bodyEvaluator` (or `proxyEvaluator`). Those routes require an evaluator: missing it returns `FAMILIES_PRODUCT_BODY_EVALUATOR_REQUIRED`. The adapter copies every authored item into Product-local coordinates and always retains `AUTHORITATIVE` authority, even when the authored Body coincides with a recipe. Conventional archetype routes retain their existing recipe authoring behavior.

`placedSolids(element)` returns fresh, caller-owned solids transformed by the element's own placement. For an element beneath a placed spatial structure, pass its cumulative frame as `placedSolids(element, { parentFrame })` to obtain world coordinates. Both Product Body authorities return one placed copy per item. Stairs and ramps return one per flight, and curtain walls return their panels and mullions. Elements without stored geometry return an empty list. Dispose every returned solid.

Wall net volume measures the occupied union of all Body items. Recipe-derived quantities require current model recipe eligibility; replacing a Body clears that eligibility even if the replacement is tagged `PARAMETRIC`. Measurement failures omit the affected quantities and produce `WALL_QUANTITY_OMITTED` issues from `toIfcValidated()`.

Other categories retain class-specific storage in step 1. Converging that storage and removing the transitional model ownership enumerator are step-2 work.

## Data layers

Beyond geometry, elements carry: property sets from IFC pset templates with typed measures, quantity sets for takeoff, materials (simple, layer sets, profile sets), classification references (Uniclass, OmniClass, and friends), surface styles, and zone / system membership. Stable identity comes from deterministic GUIDs: `deriveIfcGuid` for content-derived ids, `newIfcGuid` for random ones.
