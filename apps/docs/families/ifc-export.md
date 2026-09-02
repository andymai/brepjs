---
title: 'IFC Export'
description: 'Project a families element tree onto an IFC4 model with brepjs-bim: key-path-derived GlobalIds that survive reordering, property sets, wall openings with IfcRelVoids, and independent IfcOpenShell validation.'
---

# IFC Export

Everything before this page kept identity abstract: key paths, `keyed` flags, relationships. IFC is where it cashes out. `familiesToBim` (from [brepjs-bim](https://www.npmjs.com/package/brepjs-bim)) projects a resolved element tree onto an IFC4 model in which every element's **GlobalId derives from its key path**, so the same wall keeps the same GlobalId across rebuilds, reorders, and re-exports. For anyone consuming the file downstream (clash detection, facility management, a model server tracking deltas), that stability is the difference between "the wall moved" and "a wall was deleted and another appeared".

```typescript
import { resolve } from 'brepjs-families';
import { familiesToBim, toIfcValidated } from 'brepjs-bim';

const projected = familiesToBim(resolve(building()), {
  project: { name: 'Office Block A', projectId: 'office-a' },
  siteName: 'Riverside Plot',
});
if (!projected.ok) throw new Error(projected.error.message);
using model = projected.value.model;

const ifc = await toIfcValidated(model, {
  applicationName: 'my-app',
  applicationVersion: '1',
});
// ifc.value.bytes is the IFC4 file; ifc.value.report carries validation issues.
```

The adapter returns a `Result`; the model it produces owns kernel geometry, so hold it in a `using` scope. `idByKeyPath` on the result maps each families key path to its element in the model.

Civil-semantic walls and railings require `bodyEvaluator` so the adapter can verify their authored Product Bodies. It applies registered wall openings before comparison. Bodies that coincide with the typed spec remain editable parametric IFC; compound, voided, or otherwise different bodies keep their Wall or Railing classification and export each exact item as tessellation. `proxyEvaluator` remains a compatibility fallback for this evaluation but also enables the separate proxy route described below.

## What maps to what

| Families element                   | IFC                                                                                                   |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `Storey`                           | `IfcBuildingStorey`, aggregated under site and building                                               |
| `Wall`                             | `IfcWall` with an extruded-solid body                                                                 |
| `Slab`                             | `IfcSlab` (`FLOOR`, `ROOF`, `LANDING`, `BASESLAB`)                                                    |
| `Column`                           | `IfcColumn`, rectangular / circular / I-shape profile extruded along `axisZ`                          |
| `Beam`                             | `IfcBeam`, the same profile vocabulary extruded along `axisX`                                         |
| `Roof`                             | `IfcRoof`, flat by default, shaped (shed / gable / hip / dome) when `pitch` is present                |
| `Stair`                            | `IfcStair` assembly, one `IfcStairFlight` per flight with its own placement                           |
| Fill-role `Door` in `voids`        | `IfcDoor` + synthesized `IfcOpeningElement`, wired with `IfcRelVoidsElement` and `IfcRelFillsElement` |
| Fill-role `Window` in `voids`      | `IfcWindow`, same opening wiring                                                                      |
| `Group` and other empty containers | Structure only, no IFC element                                                                        |

Every mapped element must sit under a `Storey` ancestor: IFC requires spatial containment, and the adapter returns `FAMILIES_NO_STOREY` rather than emit an uncontained element. Fillers are contained in their wall's storey, openings are related to their wall through `IfcRelVoidsElement` alone, exactly as the schema intends. Openings are a wall-only mapping; a fill-role element hosted by anything else returns `FAMILIES_OPENING_OUTSIDE_WALL`.

## Routing is by archetype, not by name

The left column above lists the starter registry's names, but the adapter does not match on them. Each family declares an `archetype`, and that is what selects the mapping:

```typescript
family('Storey', render, { archetype: 'storey' });
family('Wall', render, { archetype: 'wall' });
```

The registry files are yours once copied, so renaming them is expected. Keep the archetype and the mapping follows:

```typescript
family('Level', render, { archetype: 'storey' }); // still IfcBuildingStorey
family('Partition', render, { archetype: 'wall' }); // still IfcWall
```

Fillers route the same way: `archetype: 'door'` or `'window'` on a `role: 'fill'` family picks the IFC entity, so a `Glazing` family still becomes an `IfcWindow`. The mapped archetypes are `storey`, `wall`, `slab`, `column`, `beam`, `roof`, `stair`, `door`, and `window`.

`archetype` is a plain string that brepjs-families never interprets: the vocabulary belongs to the adapter, which is what keeps the family layer free of IFC.

A family that declares none falls back to matching its display name, so families written before `archetype` existed keep working. The fallback carries the original trap, though: rename an undeclared family and it quietly stops routing. Without `proxyEvaluator` that is a hard `FAMILIES_UNSUPPORTED_TYPE` error, but with one set it becomes an `IfcBuildingElementProxy` instead of the element you meant, which is a valid file that is wrong. Every proxied element is reported so you can catch it:

```typescript
const { model, proxied } = unwrap(familiesToBim(tree, { project, proxyEvaluator: ev }));
// proxied: [{ keyPath: 'l1/p1', type: 'Partition', archetype: undefined }]
```

## Two sources, one element

The adapter reads each element twice, on purpose:

- **Props feed the parametric spec.** IFC's extruded-solid representation wants `length`, `height`, `thickness`, `axisX` as parameters, which cannot be recovered from baked geometry. The resolved element's pre-desugared props feed the spec 1:1 under their spec names.
- **Geometry supplies placement.** The resolved geometry's outer translate chain folds into the IFC local placement, so the placement matches the IR world frame no matter whether the transform came from a prop or from inside a family's render. Millimeters in; the writer emits meters.

For openings the same split holds: the door's `width` and `height` come from its props, while `offsetAlongWall` and the sill height derive from the void geometry's frame, projected onto the wall's axis so doors land correctly on rotated walls too.

## Property sets

Identity-side attributes flow into IFC property sets. A wall carrying `psets: { Pset_WallCommon: { FireRating: 'REI 120', IsExternal: true } }` emits those into `Pset_WallCommon`; spec-level fields (`materialName`, `loadBearing`, `thermalTransmittance` on windows) travel as props. Two walls sharing one cached solid still emit distinct psets, because attributes never touched the geometry path.

## The rules the adapter enforces

- **Explicit keys everywhere identity is minted.** Unkeyed storeys, walls, slabs, or void slots produce a `FAMILIES_UNKEYED_ELEMENT` error (see [the identity page](/families/identity) for why this is not negotiable).
- **Stable keys are single-use.** Two elements resolving to the same key path would be one GlobalId claimed twice; the adapter refuses before building any geometry.
- **Unmapped types fail loudly.** An element type without a spec mapping is a `Result` error, not a silent omission from the file.

## Proof, not promises

The repository carries this pipeline end to end: `packages/brepjs-bim/examples/sampleBuildingFamilies.ts` authors a two-storey building (four walls including Y-running ones, a door, a window, two slabs) as declarative source and writes `sample-building-families.ifc`. The committed fixture is validated by **IfcOpenShell**, an independent IFC implementation sharing no code with the writer:

```
[1] Parsed OK — schema IFC4
[2] Schema validation: PASS (no EXPRESS / where-rule violations)
[3] Spatial structure: 1 project, 1 site, 1 building, 2 storey(s)
[4] GlobalIds: 62 unique, 0 malformed
[5] Geometry: 10/10 products generated a shape
```

A CI gate additionally asserts the export is byte-identical across independent rebuilds and that every key-path-derived GlobalId lands in the file. If you change the projection, the fixture test tells you; if you break the schema, IfcOpenShell does.

## Next steps

- **[Openings & Voids](/families/openings)**: the synthesis model behind the door and window rows above.
- **[Props & Validation](/families/props-and-validation)**: schemas, defaults, and how validated props reach the spec path.
