---
title: Element Catalog
description: 'Every parametric element brepjs-bim authors: structural, spatial, openings, and the profile vocabulary they extrude.'
---

# Element Catalog

Every element follows the same contract: a typed spec in millimeters, an analytically built brepjs solid in local coordinates, and placement applied downstream via `IfcLocalPlacement`. The `parse*Spec` functions validate specs standalone; the `add*` methods validate, build, and store.

| Element        | Method                   | Notes                                                                                |
| -------------- | ------------------------ | ------------------------------------------------------------------------------------ |
| Wall           | `addWall`                | Length along `axisX`, openings cut via `addDoor` / `addWindow`                       |
| Slab           | `addSlab`                | `FLOOR` / `ROOF` / `LANDING` / `BASESLAB`; slab openings via `parseSlabOpeningInput` |
| Beam           | `addBeam`                | Profile extruded along `axisX` by length                                             |
| Column         | `addColumn`              | Profile extruded along `axisZ` by height                                             |
| Roof           | `addRoof`                | Flat slab, or shaped (shed / gable / hip / dome) when `pitch` is present             |
| Curtain wall   | `addCurtainWall`         | Panel and mullion grid                                                               |
| Space          | `addSpace`               | Room volumes for zoning and COBie                                                    |
| Footing / pile | `addFooting` / `addPile` | Foundations                                                                          |
| Stair          | `addStair`               | One or more flights, each a stepped sawtooth solid with its own placement            |
| Ramp           | `addRamp`                | Flights like stairs, inclined slabs                                                  |
| Railing        | `addRailing`             | Posts + rails with `infill: 'POSTED'`, or a single swept panel                       |
| Covering       | `addCovering`            | Finishes: flooring, cladding, ceilings                                               |
| Proxy          | `addProxy`               | Anything else, carrying arbitrary brepjs geometry                                    |

Doors and windows are not free-standing: `addDoor` / `addWindow` take a host wall, cut the opening as a boolean void, and wire `IfcRelVoidsElement` + `IfcRelFillsElement`.

## Profiles

Beams and columns extrude a **profile**, one vocabulary shared by both:

- Core: `RECTANGULAR`, `CIRCULAR`, `I_BEAM` (with optional root `filletRadius`)
- Extended: L / T / U / Z / C shapes, asymmetric I, ellipse, trapezium, hollow rectangular and circular sections, and arbitrary polygons with voids

Every **named** profile emits its own parametric IFC profile def, extended kinds included: `IfcRectangleProfileDef` / `IfcCircleProfileDef` / `IfcIShapeProfileDef` for the core three, and `IfcLShapeProfileDef`, `IfcTShapeProfileDef`, `IfcUShapeProfileDef`, `IfcZShapeProfileDef`, `IfcCShapeProfileDef`, `IfcAsymmetricIShapeProfileDef`, `IfcEllipseProfileDef`, `IfcTrapeziumProfileDef`, `IfcRectangleHollowProfileDef` and `IfcCircleHollowProfileDef` for the rest. The section stays editable parametric data in the exported file rather than a baked outline.

Only the two point-list kinds serialize as outlines, which is inherent to what they are: `ARBITRARY_CLOSED` becomes `IfcArbitraryClosedProfileDef` and `ARBITRARY_WITH_VOIDS` becomes `IfcArbitraryProfileDefWithVoids`.

On the brepjs side, `extendedProfileToFace` builds the section face for the solid and `extendedProfileArea` gives closed-form areas for takeoff.

## Shaped roofs

`pitch` opts a roof into shaped geometry for its `predefinedType`: a right-trapezoid prism (shed), a house-pentagon prism (gable), a convex-hull hip with the ridge along the longer side, or a faceted dome. Without `pitch` the roof is a flat slab whatever the type says. Shaped roofs and posted railings serialize as tessellated bodies; everything else stays parametric `IfcExtrudedAreaSolid`.

## Placement and display

Element geometry is **unplaced template geometry**. A wall's solid starts at the local origin and runs along local +X regardless of where the wall stands; `origin` / `axisX` / `axisZ` live in the spec and become `IfcLocalPlacement`. `placedSolids(element)` returns fresh, caller-owned solids transformed by the element's own placement. For an element beneath a placed spatial structure, pass its cumulative frame as `placedSolids(element, { parentFrame })` to obtain world coordinates for display or clash checks. Most elements return one solid; stairs and ramps return one per flight, and curtain walls return their panels and mullions. Elements that are purely relational (doors, windows, groups, spatial containers) return an empty list rather than an error.

## Data layers

Beyond geometry, elements carry: property sets from IFC pset templates with typed measures, quantity sets for takeoff, materials (simple, layer sets, profile sets), classification references (Uniclass, OmniClass, and friends), surface styles, and zone / system membership. Stable identity comes from deterministic GUIDs: `deriveIfcGuid` for content-derived ids, `newIfcGuid` for random ones.
