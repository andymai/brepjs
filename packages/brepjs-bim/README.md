# brepjs-bim

> Experimental satellite package, published to npm. Early-stage — the API may change.

```bash
npm install brepjs-bim
```

A BIM (Building Information Modeling) layer for [brepjs](https://github.com/andymai/brepjs). It
authors IFC4-aligned parametric building elements and a focused IFC4X3 civil bridge profile,
assembles them into a spatial structure, and serializes the result to a valid **IFC-SPF** file —
with a matching importer to read IFC back in.

Pipeline: **author spec → `BimModel` (typed element + brepjs geometry) → spatial structure +
property sets + classification → export IFC / COBie, validate, round-trip.**

The declarative entry point is
[`brepjs-families`](https://www.npmjs.com/package/brepjs-families): author the building as a tree of
prop-driven components, then `familiesToBim(tree, { project })` projects it onto a `BimModel` with
stable GlobalIds derived from component key paths. Hand-authoring specs against `BimModel` remains
the low-level path (and covers elements the declarative route doesn't yet). See the
[Declarative Models guide](https://brepjs.dev/families/overview).

## Scope

Parametric authoring of the common IFC4 building elements plus the data layers that make a model
useful downstream (psets, classification, materials, quantities), with import, export, and
validation. Geometry is produced by brepjs (OCCT). Walls and railings carry a `ProductBody`, either
a parametric solid or a non-empty collection of authoritative exact solids. Use `bodySolids()` to
borrow their Product-local model handles and narrow `geometry.kind` when a caller specifically
needs the parametric branch. Other solid-bearing categories continue to expose their existing
geometry types.

`takeExactProductBody(localId, { kind: 'EXACT', solids })` installs an authoritative wall or
railing Body atomically. Success transfers every supplied handle to the model and disposes the
superseded parametric Body; failure transfers nothing. Add wall openings before takeover, because
an exact wall rejects later `addDoor()` and `addWindow()` mutations.

Element geometry is **unplaced template geometry** in local coordinates. Placement (`origin` /
`axisX` / `axisZ`) is applied by the IFC layer via `IfcLocalPlacement`, not baked into the brepjs
solid. Use `placedSolids(element)` to read fresh, caller-owned solids transformed by the element's
own placement. Stairs and ramps return one solid per flight, curtain walls return their panels and
mullions, and an exact Product Body returns one placed copy per Body item. When an element is
beneath a placed spatial structure, pass its cumulative frame as
`placedSolids(element, { parentFrame })` to obtain world coordinates. This is especially important
for parent-local Proxy and Earthworks Fill bodies.

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
  otherwise). Shaped roofs and posted railings serialize to IFC as tessellated bodies; flat roofs
  and panel railings keep their parametric `IfcExtrudedAreaSolid`.

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

Civil-semantic wall and railing routes require `bodyEvaluator` (or the
`proxyEvaluator` fallback) so the adapter can verify the authored Product Body. Missing the
evaluator is `FAMILIES_PRODUCT_BODY_EVALUATOR_REQUIRED` (element path and mapped category); the
adapter does not silently keep a parametric envelope. Conventional archetype walls and railings
stay specification-authoritative and do not need an evaluator. When the evaluator is present, the
adapter applies registered wall openings to the parametric candidate, then compares that candidate
with the evaluated source in Product-local coordinates. Coincident bodies retain editable
parametric IFC; compound, voided, or otherwise different bodies retain their typed Wall or Railing
classification and export every authoritative item as tessellation. The evaluator's source handles
remain borrowed. Other typed civil routes continue to use their semantic envelope dimensions.

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
import { BimModel, toIfc } from 'brepjs-bim';
import { unwrap } from 'brepjs';

const model = new BimModel();
model.init({ name: 'Example' });

// Spatial structure: project → site → building → storey.
const project = model.getProject();
const siteId = unwrap(model.addSite({ name: 'Site' }));
const buildingId = unwrap(model.addBuilding({ name: 'Building' }));
const storeyId = unwrap(model.addStorey({ name: 'Level 1', elevation: 0 }));
if (project) model.aggregate(project.localId, siteId);
model.aggregate(siteId, buildingId);
model.aggregate(buildingId, storeyId);

// A parametric wall, placed on the storey. Dimensions in mm; axisX is the wall's
// length direction and axisZ its up direction.
const wall = model.addWall({
  length: 4000,
  height: 3000,
  thickness: 200,
  origin: [0, 0, 0],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  materialName: 'Concrete',
});
if (wall.ok) model.placeIn(wall.value, storeyId);

// Renderable geometry (a brepjs ValidSolid, unplaced/local coords):
const solid = model.getWalls()[0]?.geometry;

// Serialize to an IFC-SPF byte buffer.
const ifc = await toIfc(model, { applicationName: 'brepjs-bim', applicationVersion: '1.0' });
// ifc.ok && ifc.value instanceof Uint8Array
```

Reading element geometry requires only the core brepjs kernel; `toIfc` / `fromIfc` additionally load
the `web-ifc` peer dependency.

All public operations return `Result<T, BimError>` (from `brepjs`); validation issues and non-fatal
warnings travel inside the payload rather than throwing.

## Design

Each `add*` call parses and validates its spec and stores a typed `BimElement` keyed by a `LocalId`.
Parametric physical elements build an analytical brepjs solid; civil spatial elements are body-less,
and arbitrary-body products such as Earthworks Fill take ownership of a validated authored solid.
Families-projected civil walls and railings retain evaluated authored solids when their Bodies do
not coincide with the post-opening parametric candidate.
The IFC writer walks the model, applies placement, and emits schema-correct IFC entities; the
importer is the inverse. No kernel/WASM changes are required.

## Development

```bash
npm run typecheck --workspace=brepjs-bim
npm run lint --workspace=brepjs-bim
npm run build --workspace=brepjs-bim
npm run test --workspace=brepjs-bim
```
