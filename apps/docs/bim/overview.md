---
title: The BIM Layer
description: 'brepjs-bim authors IFC4-aligned parametric building elements and a focused IFC4X3 civil bridge profile on brepjs geometry.'
---

# The BIM Layer

`brepjs-bim` turns brepjs geometry into building information. You describe elements as typed parametric specs (a wall is a length, height, thickness, placement, and material, not a mesh); the model assembles them into a building or focused civil spatial structure, layers on property sets, materials, quantities, and classifications, and serializes the result to a valid **IFC-SPF** file. A matching importer reads IFC back in.

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

1. **Typed specs anchor the model.** Every `add*` call validates its spec (zod schemas; the `parse*Spec` functions are exported for standalone use) and stores a typed element. Parametric physical specs build analytical solids and editable IFC representations; civil spatial elements are body-less, while explicitly arbitrary bodies such as Earthworks Fill serialize as tessellation. Families-projected civil walls and railings retain an evaluated exact Body when it differs from their post-opening parametric candidate.
2. **Geometry is unplaced template geometry.** Element solids live in local coordinates; `origin` / `axisX` / `axisZ` are applied by the IFC layer via `IfcLocalPlacement`. `placedSolids(element)` applies the element frame; when its spatial parent is placed, pass the cumulative `parentFrame` to obtain world coordinates.
3. **Results, not exceptions.** Every operation returns `Result<T, BimError>` from brepjs. Validation issues travel inside reports; nothing throws across the API boundary.

Dimensions are millimeters everywhere; IFC export emits SI metres. Reading element geometry needs only the brepjs kernel; `toIfc` / `fromIfc` additionally load the `web-ifc` peer dependency.

## Focused civil bridge profile

For IFC4X3, the public Families path supports Project → Site → Bridge → recursively nested Bridge Part, exact Earthworks Fill bodies, and nearest-part product containment. Civil Product semantics route the infrastructure fixture's existing Beam (`beam`, `cross-girder`, `girder`), Column (`pier-stem`), Footing (`pad`), Railing (`guardrail`), Slab (`deck`), and Wall (`wall`) categories to their normal typed BIM elements. Semantic material is used when the element does not separately provide `materialName`.

Civil wall and railing routes need `bodyEvaluator` (or `proxyEvaluator` as a compatibility fallback) to verify their authored Product Bodies. Registered wall openings are applied first. A coincident authored Body keeps editable parametric IFC; a compound, voided, or otherwise different Body remains a typed Wall or Railing and exports all of its items as tessellation. Other typed civil routes continue to use the reference Families' semantic envelope dimensions.

Member and Sign are explicitly outside this profile. They remain hard unsupported-type errors unless `proxyEvaluator` is deliberately enabled, in which case `projected.proxied` reports them. This profile does not claim complete IFC infrastructure coverage or unchanged full scratch-example parity.

Continue with the [element catalog](/bim/elements), [IFC export & import](/bim/ifc), [validation](/bim/validation), and [interop](/bim/interop).
