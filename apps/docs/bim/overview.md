---
title: The BIM Layer
description: 'brepjs-bim authors IFC4-aligned parametric building elements on brepjs geometry: typed specs in, a validated BimModel out, IFC-SPF at the end.'
---

# The BIM Layer

`brepjs-bim` turns brepjs geometry into building information. You describe elements as typed parametric specs (a wall is a length, height, thickness, placement, and material, not a mesh); the model assembles them into a spatial structure (project → site → building → storey), layers on property sets, materials, quantities, and classifications, and serializes the result to a valid **IFC-SPF** file. A matching importer reads IFC back in.

```bash
npm install brepjs-bim brepjs web-ifc
```

Two ways in:

- **Through families** (recommended for new models): author a declarative element tree with [brepjs-families](/families/overview) and project it with `familiesToBim`. Identity, openings, and containment come from the tree; GlobalIds derive from key paths and survive reorders. Start at [IFC Export](/families/ifc-export).
- **Direct `BimModel`**: imperative `add*` calls when you already know exactly what to build, or when you need elements the families projection does not cover yet.

```typescript
import { BimModel, toIfc } from 'brepjs-bim';
import { unwrap } from 'brepjs';

const model = new BimModel();
model.init({ name: 'Example' });

const siteId = unwrap(model.addSite({ name: 'Site' }));
const buildingId = unwrap(model.addBuilding({ name: 'Building' }));
const storeyId = unwrap(model.addStorey({ name: 'Level 1', elevation: 0 }));
const project = model.getProject();
if (project) model.aggregate(project.localId, siteId);
model.aggregate(siteId, buildingId);
model.aggregate(buildingId, storeyId);

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

const ifc = await toIfc(model, { applicationName: 'example-app', applicationVersion: '1' });
// ifc.ok && ifc.value instanceof Uint8Array
```

Three design decisions carry the package:

1. **Specs are the source of truth.** Every `add*` call validates its spec (zod schemas; the `parse*Spec` functions are exported for standalone use), builds the brepjs solid analytically, and stores a typed element. The IFC writer emits parametric entities (`IfcExtrudedAreaSolid`, profile defs) from the same spec, so the exported file stays editable data, not frozen triangles.
2. **Geometry is unplaced template geometry.** Element solids live in local coordinates; `origin` / `axisX` / `axisZ` are applied by the IFC layer via `IfcLocalPlacement`. Use `placedSolids(element)` when you need world-placed solids for display.
3. **Results, not exceptions.** Every operation returns `Result<T, BimError>` from brepjs. Validation issues travel inside reports; nothing throws across the API boundary.

Dimensions are millimeters everywhere; IFC export emits SI metres. Reading element geometry needs only the brepjs kernel; `toIfc` / `fromIfc` additionally load the `web-ifc` peer dependency.

Continue with the [element catalog](/bim/elements), [IFC export & import](/bim/ifc), [validation](/bim/validation), and [interop](/bim/interop).
