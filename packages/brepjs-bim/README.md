# brepjs-bim

> Experimental satellite package, published to npm. Early-stage — the API may change.

```bash
npm install brepjs-bim
```

A BIM (Building Information Modeling) layer for [brepjs](https://github.com/andymai/brepjs). It
authors IFC4-aligned parametric building elements (walls, slabs, beams, columns, roofs, curtain
walls, stairs, …), assembles them into a spatial structure (project → site → building → storey),
and serializes the result to a valid **IFC-SPF** file — with a matching importer to read IFC back in.

Pipeline: **author spec → `BimModel` (typed element + brepjs geometry) → spatial structure +
property sets + classification → export IFC / COBie, validate, round-trip.**

## Scope

Parametric authoring of the common IFC4 building elements plus the data layers that make a model
useful downstream (psets, classification, materials, quantities), with import, export, and
validation. Geometry is produced by brepjs (OCCT); each element carries a `ValidSolid` (or, for
curtain walls, a panel/mullion grid). Element geometry is **unplaced template geometry** in local
coordinates — placement (`origin` / `axisX` / `axisZ`) is applied by the IFC layer via
`IfcLocalPlacement`, not baked into the brepjs solid.

- Units default to mm; IFC export emits SI metres.
- Stable identity: deterministic IFC GUIDs (`deriveIfcGuid`) and local id counters.

## Status

| Area              | State                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| Elements          | wall, slab, beam, column, roof, curtain wall, space, footing/pile, stair, ramp, railing, covering, proxy |
| Profiles          | rectangular / circular / I-shape cores + extended L/T/U/Z/C, hollow, ellipse, arbitrary-with-voids       |
| Openings          | door / window / slab openings cut as boolean voids; `FillsOpening` / `Voids*` relationships              |
| Spatial structure | project → site → building → storey aggregation; `placeIn` to assign elements to a storey                 |
| Property sets     | IFC pset templates + measure types; quantity sets for takeoff                                            |
| Data layers       | materials (layer/profile/simple sets), classification refs, surface styles, zones/systems                |
| IFC export        | `toIfc` → IFC-SPF (`Uint8Array`); IFC2X3 / IFC4 schema selection; owner history                          |
| IFC import        | `fromIfc` / `SpfReader` → `ImportedModel` (elements, geometry, psets, materials, spatial tree)           |
| Validation        | referential integrity, schema check, geometry validity, IFC round-trip report                            |
| Interop           | COBie 2.4 export (CSV/JSON), IDS 1.0 checking, BCF 3.0 read/write                                        |

### Independent validation

The exported IFC is validated by **IfcOpenShell** (a separate implementation from the
web-ifc parser used internally), not just self-checked. The committed sample
(`examples/sample-building.ifc`) passes IfcOpenShell's EXPRESS schema + where-rule
validator and generates geometry for every product. See [VALIDATION.md](./VALIDATION.md)
to reproduce, and `examples/sampleBuilding.mjs` for the model it validates.

> **Not yet:** the official buildingSMART Validation Service and desktop-tool
> interop (Revit / ArchiCAD / Solibri) are unverified. This is an early-stage
> (`0.1.x`) experimental package and the API will change.

## Usage

Author a small model and export IFC:

```ts
import { BimModel, toIfc } from 'brepjs-bim';

const model = new BimModel();
model.init({ name: 'Example' });

// Spatial structure: project → site → building → storey.
const project = model.getProject();
const siteId = model.addSite({ name: 'Site' });
const buildingId = model.addBuilding({ name: 'Building' });
const storeyId = model.addStorey({ name: 'Level 1', elevation: 0 });
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
const ifc = await toIfc(model, { name: 'Example', author: 'brepjs-bim' });
// ifc.ok && ifc.value instanceof Uint8Array
```

Reading element geometry requires only the core brepjs kernel; `toIfc` / `fromIfc` additionally load
the `web-ifc` peer dependency.

All public operations return `Result<T, BimError>` (from `brepjs`); validation issues and non-fatal
warnings travel inside the payload rather than throwing.

## Design

Each `add*` call parses and validates the spec (the `parse*Spec` functions are also exported for
standalone use), builds the brepjs solid analytically from the spec, and stores a typed `BimElement`
keyed by a `LocalId`. The IFC writer walks the model, applies placement, and emits schema-correct
IFC entities; the importer is the inverse. No kernel/WASM changes are required.

## Development

```bash
npm run typecheck --workspace=brepjs-bim
npm run lint --workspace=brepjs-bim
npm run build --workspace=brepjs-bim
npm run test --workspace=brepjs-bim
```
