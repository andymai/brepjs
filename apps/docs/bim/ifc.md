---
title: IFC Export & Import
description: 'toIfc serializes a BimModel to IFC-SPF bytes (IFC4 or IFC4X3); fromIfc and SpfReader read IFC back into elements, psets, and a spatial tree.'
---

# IFC Export & Import

## Export

`toIfc(model, meta)` walks the model and returns IFC-SPF bytes.

```typescript
import { toIfc } from 'brepjs-bim';

const result = await toIfc(model, {
  applicationName: 'office-tool',
  applicationVersion: '1.0',
  author: { givenName: 'Jane', familyName: 'Doe', email: 'jane@example.com' },
  organizationName: 'Example Ltd',
});
if (result.ok) await writeFile('model.ifc', result.value);
```

- **Schema**: IFC4 by default; pass `ifcSchema: 'IFC4X3'` to target the newer schema.
- **Units**: specs are millimeters; the writer emits SI metres (`toIfcLengthM` / `toLengthMm` convert explicitly).
- **Owner history**: author and organization metadata become a proper `IfcOwnerHistory`.
- **Determinism**: element GUIDs and local id counters are stable, and `creationTimestamp` defaults to the epoch, so re-exporting an unchanged model yields byte-identical content (modulo the timestamped `FILE_NAME` header line).

`toIfcValidated` runs export plus the [validation suite](/bim/validation) in one call and returns the bytes together with the reports.

## Import

`fromIfc(bytes)` parses an IFC file (via `web-ifc`) into an `ImportedModel`: elements with geometry, property sets, materials, and the spatial tree.

```typescript
import { fromIfc, disposeImportedModel } from 'brepjs-bim';

const imported = await fromIfc(bytes);
if (imported.ok) {
  const model = imported.value;
  // model.elements, model.spatialTree, model.psets, ...
  disposeImportedModel(model);
}
```

Imported geometry pins kernel memory; call `disposeImportedModel` when done. `geometry.solids` owns
every reconstructed, World-placed Body item. `geometry.completeness` reports `COMPLETE`, `PARTIAL`,
or `NONE`. `geometry.fidelity` reports the least faithful retained item. Raw mesh siblings are
combined in `meshVertices` and `meshIndices`. The `geometry.solid` compatibility property borrows
the same handle only when a `COMPLETE` Body contains one solid; it is `null` for multi-item, partial,
and missing Bodies. Never dispose the alias separately. Complete Bodies expose the component-wise
aggregate `bounds` and the sum of item volumes as `volumeMm3`. Both become `null` when aggregate
measurement fails. Both are also `null` when completeness is `PARTIAL` or `NONE`. For header-level
inspection without geometry, `SpfReader` parses the STEP structure directly.

The IFC4X3 importer recognizes Bridge and Bridge Part nodes in `spatialTree` and imports
`IfcEarthworksFill` as `EARTHWORKS_FILL`. Each imported product exposes
`spatialStructureExpressId` for its direct Storey or civil Spatial Part;
`storeyExpressId` remains as a compatibility alias.

## Round-tripping

Export → import → compare is a first-class operation, not a demo: `checkRoundTrip(bytes)` re-reads an exported file and reports entity counts and losses, and the test suite gates on semantic round-trip fidelity (identity, relationships, psets, containment, and volumes within 0.5%). If you build on the families layer, GlobalIds additionally survive **source-level** edits: they derive from key paths, not insertion order.
