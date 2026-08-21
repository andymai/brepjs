---
title: 'For BIM Professionals'
description: 'What brepjs-families offers a BIM workflow: buildings as reviewable source, IFC GlobalIds that survive edits and reorders, independently validated exports, and firm standards as a diffable library.'
---

# For BIM Professionals

This page assumes you know IFC and BIM workflows, not TypeScript. It explains what this toolchain produces, what guarantees the output carries, and where it fits next to the tools you already run. The code examples elsewhere in this section are for your developers; the contracts described here are for you.

## Buildings as reviewable source

A families model is a building described as a tree of components, in plain text files, under version control. The name is a deliberate nod to Revit families: parametrized, reusable building components. The differences are the point:

| Familiar concept                    | Here                                                                                                              |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| A family (`.rfa`, binary)           | A source file in your project, readable and diffable                                                              |
| Type catalogs, office templates     | A **registry**: your wall types, psets, and classification codes, hosted by your firm, installed with one command |
| Element GUID                        | A GlobalId **derived from the element's place in the model**, stable across edits, rebuilds, and reordering       |
| Shared parameters and property sets | Props and psets declared on the component, validated before geometry is ever built                                |
| Export to IFC                       | The primary output, checked by an independent implementation on every change                                      |

Because the model is text, the workflows that never worked for binary formats work here: two people can review a wall-type change line by line, a proposed standards update is a diff anyone can read, and the history of _why_ a component changed is the version-control log.

## The identity guarantee, operationally

Every element carries an explicit name (a key), and its IFC GlobalId derives from the chain of names above it: storey, then wall, then opening. Consequences you can rely on:

- **Reordering is not demolition.** Tools that number elements by position emit a deleted wall plus a new wall when someone inserts an element mid-list. Here, the same wall keeps the same GlobalId no matter where it sits among its siblings.
- **Rebuilds are reproducible.** Regenerating the model from the same source produces a byte-identical IFC file (the timestamped header aside). Model servers and delta-tracking tools see real changes only.
- **Unnamed elements are refused.** If a developer forgets to name a wall, the export fails with an explicit error rather than minting an identifier that would silently change later. The strictness is the feature.

## Validation posture

Exported files are checked three ways, by implementations that share no code:

1. The writer's own validation: referential integrity (everything contained, nothing dangling) and a schema check on the produced bytes.
2. **The buildingSMART Validation Service's own rule engine**, run locally. The complete normative catalog (the same ALB / GEM / GRF / IFC / OJT / PJS / PSE / QTY / SPS rules the online service applies) executes against a file in about a second. The committed fixtures pass all 950 scenarios.
3. **IfcOpenShell** (the engine behind BlenderBIM/Bonsai): EXPRESS schema and where-rule validation, spatial structure, GlobalId uniqueness and syntax, and geometry generation for every product.

The repository's sample building runs this gauntlet in automation; a model that stops passing cannot ship unnoticed. Round-tripping through desktop authoring tools (Revit, ArchiCAD, Solibri) is the part still done by hand.

## Openings are first-class

A door in a wall is not a boolean subtraction that happens to look right. The model synthesizes a real opening element between wall and door, and the export emits `IfcOpeningElement` wired with `IfcRelVoidsElement` and `IfcRelFillsElement`, each with its own stable GlobalId. Downstream tools that reason about openings (energy, egress, quantity takeoff) see the relationships the schema intends.

## Current scope, stated plainly

The IFC projection today maps **storeys, walls, slabs, doors, windows, columns, beams, roofs, and stairs** (columns and beams in rectangular, circular, and I-shape profiles; roofs flat or pitched as shed / gable / hip / dome; stairs as multi-flight assemblies; openings, property sets, and materials throughout). The remaining `brepjs-bim` catalog (curtain walls, ramps, railings, spaces, foundations, coverings) exists in the underlying library and is reachable through the direct `BimModel` API. If your models are mostly walls-slabs-openings (residential, fit-out, early massing for data), the pipeline is complete; if you need the full structural catalog through this declarative surface, that mapping work is visible on the project roadmap.

This is also not a Revit or ArchiCAD replacement. There is no drawing sheet, no annotation, no GUI authoring. It is a **programmatic model pipeline**: configurators, generative studies, firm-standard component libraries, and automated IFC production feeding the tools you already use.

## Working with your developers

The rest of this section is written for the people who will build with this. If you hand it to a developer, the ask that captures what this page promises is short: _components from our standards registry, every element keyed, exported with `toIfcValidated`, IfcOpenShell in CI._ Start them at [Why a Family Layer](/families/overview); the identity rules they must not weaken are in [Elements, Key Paths & Identity](/families/identity), and the export contract is in [IFC Export](/families/ifc-export).

For your side of the collaboration, [Copy-In Distribution](/families/copy-in) shows how a firm-standards registry is hosted and consumed: the closest analogy is a shared template library, except updates arrive as reviewable diffs instead of file replacements.
