# brepjs-bim

> Experimental satellite package, published to npm. Early-stage — the API may change.

```bash
npm install brepjs-bim
```

A BIM (Building Information Modeling) layer for [brepjs](https://github.com/andymai/brepjs). It
authors IFC4-aligned parametric building elements and a focused IFC4X3 civil bridge profile,
assembles them into a spatial structure, and serializes the result to a valid **IFC-SPF** file —
with a matching importer to read IFC back in.

Pipeline: **author spec → `BimDocument` (typed element + brepjs geometry) → spatial structure +
property sets + classification → export IFC / COBie, validate, round-trip.**

The declarative entry point is
[`brepjs-families`](https://www.npmjs.com/package/brepjs-families): author the building as a tree of
prop-driven components, then `familiesToBim(tree, { project })` projects it onto a `BimDocument` with
stable GlobalIds derived from component key paths. Passing recipe specs to `authoring(document)` remains
the low-level path (and covers elements the declarative route doesn't yet). See the
[Declarative Models guide](https://brepjs.dev/families/overview).

The [BIM examples](https://brepjs.dev/examples/#bim) are complete programs that you can read and run in
the browser.

## Scope

Parametric authoring of the common IFC4 building elements plus the data layers that make a model
useful downstream (psets, classification, materials, quantities), with import, export, and
validation. Geometry is produced by brepjs (OCCT). Records with their own material carry a `Body`:
`PARAMETRIC` or `AUTHORITATIVE`, both with a nonempty, ordered `solids` collection. Authority and
item count are independent. `bodySolids()` borrows Product-local model handles; do not dispose
those handles. Use `addAuthoredBody({ category, solids, placement })` to transfer fresh solids without invoking a recipe.

`model.replaceBody({ localId, body: { kind: 'AUTHORITATIVE', solids } })` validates and
installs the complete collection atomically. `Err` leaves the model and caller ownership
unchanged. `Ok` returns a `COMMITTED` receipt and transfers every supplied handle, even when
`receipt.cleanup.kind === 'FAILED'` reports a failed release of the superseded Body. Do not
retry an uncertain release or dispose transferred handles. Parametric Bodies may be replaced by
either authority; authoritative Bodies may only be replaced by authoritative Bodies. Cut recipe openings before replacing the host Body. Replacing even a singleton with another
`PARAMETRIC` Body invalidates the wall dimensions used by the cut. The command rejects the edit
and preserves the replacement and existing relationships.

Civil-semantic Families Wall/Railing routes require an evaluator and retain the authored Body as
`AUTHORITATIVE`, including when it coincides with the nominal recipe. The adapter copies borrowed
evaluator items, localizes every item, and respects the replacement receipt's ownership outcome.
Conventional archetype routes retain their existing recipe authoring behavior.

A `BimDocument` owns each element’s local geometry. Create recipe elements with
`authoring(document)` and pass the returned `RecordRef` to document queries and edits.
`document.placedSolids(ref, 'WORLD')` returns caller-owned copies after resolving each
placement ancestor. Use `'LOCAL'` or another record’s reference to select a different
coordinate space. `document.bounds(ref, target)` and `document.materialVolume(ref)`
operate on the element’s own material. For a bodyless curtain wall, traverse
`document.getChildren(ref)` and query each child's reference.

A spatial container and a placement parent have independent meanings. Use
`document.placeIn(element, storey)` for containment and
`document.reparent(element, storey, 'KEEP_LOCAL')` for geometry authored in that storey.
Choose `'KEEP_WORLD'` when changing parents should preserve the current World pose.

IFC import reconstructs every supported Body item independently. `ImportedGeometry.solids` owns
the resulting World-placed handles and `completeness` reports `COMPLETE`, `PARTIAL`, or `NONE`.
`fidelity` reports the least faithful retained item. Raw mesh siblings are combined in
`meshVertices` and `meshIndices`. The legacy `.solid` property is a borrowed alias only for a
complete one-solid Body. Dispose import geometry through `disposeImportedModel()` rather than
through either property. Complete Bodies also expose aggregate `bounds` and `volumeMm3`; both are
`null` when aggregate measurement fails or when the Body is partial or missing.

- Units default to mm; IFC export emits SI metres.
- Stable identity: deterministic IFC GUIDs (`deriveIfcGuid`) and local id counters.
- Shaped geometry: roofs build real shed/gable/hip/dome solids when `pitch` is set (flat slab
  otherwise); railings build posts + top/bottom rails with `infill: 'POSTED'` (a single swept panel
  otherwise). Every retained Wall/Railing Body item serializes independently as a tessellated
  representation, with one conversion from mm to metres. Shaped roofs also use tessellation;
  flat roofs keep their parametric `IfcExtrudedAreaSolid`.

Wall net volume measures occupied material across all retained items, so overlaps count once.
Nominal recipe quantities require current model recipe eligibility; public Body replacement
clears that eligibility even if the new tag is `PARAMETRIC`. Failed measurements omit the affected
quantity and appear in `toIfcValidated()` as `WALL_QUANTITY_OMITTED` issues.

Wall openings export as IFC `Reference` geometry because the retained Wall Body already
contains its cuts. Void/fill relationships and opening placements remain intact. IFC4 defines
Reference openings as non-subtractive; gross recipe exports such as Slab openings still use
subtractive `Body` geometry. The importer keeps Reference opening records and relationships
without treating their reference shape as a display Body or cutting tool.

IfcOpenShell 0.8.5 still subtracts Reference openings in its default geometry engine, even with
a separate Reference context. If a replacement Body adds material inside a retained opening's
region, that engine can remove the added material. Schema validation and shape generation alone
do not detect this difference; check the representation semantics and retained item geometry.

A Door or Window can adopt authored solids or use the rectangular `addFillerPanel` recipe.
Attaching it to an existing Opening preserves the host. Use `addDoorAndCutWall` or
`addWindowAndCutWall` for an atomic cut and fill. Replacing a retained Body invalidates
its recipe encoding. A generated Stair or Ramp needs its original flight associations
for typed IFC export. See the [migration acceptance criteria](docs/architecture-migration.md).

## Status

| Area              | State                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Elements          | wall, slab, beam, column, roof, curtain wall, space, footing/pile, stair, ramp, railing, covering, Earthworks Fill, proxy |
| Profiles          | rectangular / circular / I-shape cores + extended L/T/U/Z/C, hollow, ellipse, arbitrary-with-voids                        |
| Openings          | door / window / slab openings cut as boolean voids; `FillsOpening` / `Voids*` relationships                               |
| Spatial structure | building: project → site → building → storey; civil: project → site → bridge → recursive bridge part                      |
| Property sets     | IFC pset templates + measure types; quantity sets for takeoff                                                             |
| Data layers       | materials (layer/profile/simple sets), classification refs, surface styles, zones/systems                                 |
| IFC export        | `toIfc` → IFC-SPF (`Uint8Array`); IFC4 / IFC4X3 schema selection; owner history                                           |
| IFC import        | `fromIfc` / `SpfReader` → `ImportedModel` (elements, geometry, psets, materials, spatial tree)                            |
| Validation        | referential integrity, schema check, geometry validity, IFC round-trip report, buildingSMART gherkin rules                |
| Interop           | COBie 2.4 export (CSV/JSON), IDS 1.0 checking, BCF 3.0 read/write                                                         |

### Focused IFC4X3 civil bridge profile

The declarative `civilSemantics` → `resolve` → `familiesToBim` path supports authored Site,
Bridge, recursively nested Bridge Part, and exact tessellated Earthworks Fill bodies. Products are
contained by their nearest Bridge Part; stable IFC identity derives from Families key paths.

The migrated civil Product vocabulary additionally routes these existing typed product families:

- `beam`: beam, cross-girder, girder
- `column`: pier-stem
- `footing`: pad
- `railing`: guardrail
- `slab`: deck
- `wall`: wall

Their semantic material becomes the normal typed element material when `materialName` is not
otherwise supplied. Existing non-semantic Families archetypes continue to use the ordinary route
registry beneath Bridge Parts. Bridge, Bridge Part, and Earthworks Fill require IFC4X3; `fromIfc`
reconstructs their civil spatial hierarchy, direct containment, and typed Earthworks inventory.

Civil-semantic wall and railing routes require `bodyEvaluator` or the `proxyEvaluator` fallback
to retain the authored Product Body. Missing the evaluator is
`FAMILIES_PRODUCT_BODY_EVALUATOR_REQUIRED`, with the element path and mapped category.
Conventional archetype walls and railings retain their existing recipe authoring behavior and do
not need an evaluator. The adapter registers wall openings before installing the authored Body,
copies every borrowed evaluator item into Product-local coordinates, and retains `AUTHORITATIVE`
authority even when the geometry coincides with the nominal recipe. These products keep their
typed Wall or Railing classification and export every Body item as tessellation. The evaluator's
source handles remain borrowed. Other typed civil routes continue to use their semantic envelope
dimensions.

This is deliberately not a claim of complete IFC infrastructure coverage or unchanged parity with
the full scratch prototype. Member and Sign remain outside the profile: without `proxyEvaluator`
they are hard errors; with it they are reported `IfcBuildingElementProxy` occurrences.

### Independent validation

The exported IFC is validated by **IfcOpenShell** (a separate implementation from the
web-ifc parser used internally), not just self-checked. The committed sample
(`examples/sample-building.ifc`) passes IfcOpenShell's EXPRESS schema + where-rule
validator and generates geometry for every product. See [VALIDATION.md](./VALIDATION.md)
to reproduce, and `examples/sampleBuilding.mjs` for the model it validates.

The buildingSMART Validation Service's complete normative rule catalog also runs
locally (`scripts/setupGherkinRunner.sh` builds the service's own engine; all three
committed fixtures pass 950 scenarios with zero failures), so service findings are
reproducible before upload.

> **Not yet:** desktop-tool interop (Revit / Solibri) is unverified. The fixtures
> and per-tool checklists are ready in [VALIDATION.md](./VALIDATION.md). This is an
> experimental pre-1.0 package and the API may change.

## Usage

Author a small model and export IFC:

```ts
import { BimDocument, toIfc, authoring } from 'brepjs-bim';
import { unwrap } from 'brepjs';

using model = new BimDocument();
const create = authoring(model);
model.init({ name: 'Example' });

// Spatial structure: project → site → building → storey.
const project = model.getProject();
const siteId = unwrap(create.addSite({ name: 'Site' }));
const buildingId = unwrap(create.addBuilding({ name: 'Building' }, { placementParent: siteId }));
const storeyId = unwrap(
  create.addStorey({ name: 'Level 1', elevation: 0 }, { placementParent: buildingId })
);
if (project) model.aggregate(project.localId, siteId);
model.aggregate(siteId, buildingId);
model.aggregate(buildingId, storeyId);

// A parametric wall, placed on the storey. Dimensions in mm; axisX is the wall's
// length direction and axisZ its up direction.
const wall = create.addWall({
  length: 4000,
  height: 3000,
  thickness: 200,
  origin: [0, 0, 0],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  materialName: 'Concrete',
});
if (wall.ok) {
  unwrap(model.placeIn(wall.value, storeyId));
  unwrap(model.reparent(wall.value, storeyId, 'KEEP_LOCAL'));
}

// Read the World bounds without taking ownership of the retained Body.
if (wall.ok) unwrap(model.bounds(wall.value, 'WORLD'));

// Serialize to an IFC-SPF byte buffer.
const ifc = await toIfc(model, { applicationName: 'brepjs-bim', applicationVersion: '1.0' });
// ifc.ok && ifc.value instanceof Uint8Array
```

Reading element geometry requires only the core brepjs kernel; `toIfc` / `fromIfc` additionally load
the `web-ifc` peer dependency.

Use `document.record(ref)` for a fallible lookup. Direct accessors such as `getElement(ref)` require a live reference and throw an error with a BIM diagnostic as its cause for an invalid reference.

## Document edits and delivery

A stable key identifies the corresponding occurrence across rebuilds. Look it up in each document
to obtain a live reference. A move changes the local pose and carries placement descendants.
Deletion reports every placement, containment, decomposition or in-document placement-reference
dependant. Detach or reparent those records before retrying.

An Opening stays fixed to the cut in its host Body. Move the host to carry the Opening and any
placement children. To retire the Opening, resolve its dependants first. Deleting the Opening
keeps the cut geometry and retires the host's recipe binding. Subsequent IFC delivery uses the
retained Body and its measurable quantities.

Storey labels and COBie Floor elevations use the current height above the enclosing Building's
datum. An unresolved datum leaves the label without a height and the COBie elevation null.
IFC4 emits the optional elevation when it also agrees with the Storey's local placement Z.
[IfcBuildingStorey](https://standards.buildingsmart.org/IFC/RELEASE/IFC4/ADD2_TC1/HTML/schema/ifcproductextension/lexical/ifcbuildingstorey.htm)

`authoring(document).addRoofWithOpening(...)` accepts a finished local Roof solid with an existing
cut, a host-relative rectangular opening definition and a stable void slot. The command returns
the Roof and Opening references together. The Opening follows the Roof when it moves. IFC delivery
currently reports `IFC_ROOF_OPENING_UNSUPPORTED` for this relationship.

The [document frame tests](tests/documentFrames.test.ts) exercise World and record-local queries
on spatial records, assemblies and placed material. The [edit tests](tests/documentEdits.test.ts)
cover dependency checks and rollback. The [Roof fixture](tests/authoredRoofOpening.test.ts) checks
occupied material at the notch, hole and interior. The [IFC placement fixture](tests/documentIfcPlacement.test.ts)
reads W-01’s placement parent and spatial container from the exported file.

## Design

Each `add*` call parses and validates its spec and stores a typed `BimElement` addressed by a document-issued `RecordRef`.
Parametric physical elements build an analytical brepjs solid; civil spatial elements are body-less,
and arbitrary-body products such as Earthworks Fill take ownership of a validated authored solid.
Families-projected civil walls and railings always retain copies of the evaluated authored items
as an `AUTHORITATIVE` Product Body, even when the geometry coincides with the nominal recipe.
The IFC writer walks the model, applies placement, and emits schema-correct IFC entities; the
importer is the inverse. No kernel/WASM changes are required.

## Development

```bash
npm run typecheck --workspace=brepjs-bim
npm run lint --workspace=brepjs-bim
npm run build --workspace=brepjs-bim
npm run test --workspace=brepjs-bim
```
