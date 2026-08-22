# Declarative buildings — brepjs-families + IFC export (brepjs-bim)

When the brief names a **building, storey, wall/slab/column layout, or an IFC deliverable**, do not
hand-model it with `box`/`fuse`. Use the declarative family layer: components → element tree →
`resolve()` → meshes for the viewport or IFC for BIM tools. Units are **mm** end to end.

```ts
import 'brepjs/quick';
import { csg, unwrap } from 'brepjs';
import { family, el, resolve, evaluateModel, tTranslate } from 'brepjs-families';
import { familiesToBim, toIfc } from 'brepjs-bim';

const Door = family<{ width: number; height: number; at: number }>(
  'Door',
  (p) => el('Box', { size: [p.width, 300, p.height], transform: [tTranslate([p.at, 0, 0])] }),
  { role: 'fill', archetype: 'door' } // placed in a host's voids, becomes a real IfcOpening + IfcDoor
);

const Wall = family<{
  length: number;
  height: number;
  thickness: number;
  voids?: readonly ReturnType<typeof Door>[];
}>(
  'Wall',
  (p) => el('Box', { size: [p.length, p.thickness, p.height], voids: p.voids ?? [] }),
  { archetype: 'wall' } // archetype routes it to IfcWall, whatever the family is named
);

const Storey = family<{ items: readonly unknown[] }>(
  'Storey',
  (p) => el('Group', {}, p.items as never),
  { archetype: 'storey' }
);

const tree = resolve(
  Storey({
    key: 'ground',
    name: 'Ground floor', // identity props (name, psets, material, classification) ride on any family
    items: [
      Wall({
        key: 'south',
        length: 4000,
        height: 2700,
        thickness: 200,
        psets: { Pset_WallCommon: { IsExternal: true, FireRating: 'REI120' } },
        voids: [Door({ key: 'entry', width: 1000, height: 2100, at: 1500 })],
      }),
    ],
  })
);

// Viewport: one mesh per element, identity preserved by key path.
using ev = new csg.Evaluator();
const model = evaluateModel(tree, ev);
model.byKeyPath.get('ground/south'); // { mesh, ... }

// IFC: project the same tree onto a BIM model and serialize (async context:
// export default async () => { … }). Write the bytes to model.ifc.
const projected = unwrap(familiesToBim(tree, { project: { name: 'Demo', projectId: 'demo-1' } }));
using bim = projected.model;
const bytes = unwrap(await toIfc(bim, { applicationName: 'agent', applicationVersion: '1' }));
```

## Hard rules

- **Every element that reaches IFC needs an explicit `key`.** Key paths (`ground/south/voids:entry`)
  are the identity: reorder siblings and GlobalIds stay stable. Unkeyed → `FAMILIES_UNKEYED_ELEMENT`.
- **Every element needs a `Storey` ancestor** (`FAMILIES_NO_STOREY`): IFC requires spatial containment.
- **Openings are fill-role families in the host's `voids`** — never a bare cut. An anonymous
  (non-fill) void is rejected (`FAMILIES_ANONYMOUS_VOID`): it would cut the viewport solid while the
  parametric IFC body stays solid.
- **Routed archetypes:** `wall`, `slab`, `column`, `beam`, `roof`, `stair`, `storey`, plus
  `door`/`window` as fills. The family's **archetype** routes it
  (`family('Wall', …, { archetype: 'wall' })`), so a renamed family keeps its mapping; declare none
  and it falls back to matching the family name. Anything else with geometry →
  `FAMILIES_UNSUPPORTED_TYPE`; drop to the imperative `BimModel` adders
  (`addSpace`, `addFooting`, `addRailing`, …) for the rest.
- **Placement frame:** an element's thickness extrudes along `axisZ × axisX`, so a wall running +Y
  (`axisX: [0,1,0]`) grows its thickness toward **−X**. Probe placement with `getBounds`, not by eye.
- **Wall/slab dims must contain their openings** — a door wider than the wall fails with
  `DOOR_EXCEEDS_WALL_BOUNDS` at add time, not at export.
- **`familiesToBim` and `toIfc` return `Result`.** `unwrap` is fine in a throwaway script; in an
  agent loop, check the `Err` branch — spec/identity failures carry the codes above plus the
  offending key path, which tells you exactly what to fix.

## Starter components (copy-in, shadcn-style)

Do not re-derive wall/room/storey math: `npx brepjs add room storey slab` copies maintained families
(wall, door, window, room, storey, slab, column, beam, roof, stair) into `src/families/` as code you
own. `npx brepjs diff room` shows upstream drift. Registry props feed the IFC specs 1:1
(`materialName`, `isExternal`, `fireRating`, `predefinedType`, …).

## Arbitrary geometry under a families identity

`el('Geometry', { node })` accepts any `csg` IR node (profile→extrude, revolve, loft, booleans), so
a family can own real modeling while keeping key-path identity for the viewport. Only routed types
reach IFC — a custom-geometry family is viewport-only until you add it imperatively.

## Scale

Identical subtrees share one materialization (content-addressed IR): a hundred identical walls mesh
once. Placement via `transform`/`at` preserves that sharing — it wraps the shared geometry in a
`Translate` node, so the placed shape is a cheap relocation and rigid placements reuse the inner
tessellation. What forks the whole subtree is baking position into the geometry itself (polygon
coordinates, per-instance dimensions): keep repeated elements' geometric props identical and vary
only keys and placement.
