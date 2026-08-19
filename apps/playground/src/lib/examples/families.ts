/**
 * Declarative-model examples: the `brepjs-families` element layer. Trees of
 * typed families resolve to key-path identity plus content-addressed CSG
 * geometry; one example projects the tree into a BimModel for IFC export.
 * See the module-authoring rules in ./types.
 */
import type { Example } from './types';

export const FAMILIES_EXAMPLES: readonly Example[] = [
  {
    id: 'families-building',
    label: 'Declarative Building',
    description:
      'A storey authored as a tree of typed families: four walls, a floor slab, and a door and window as fill-role voids. Every element is addressed by an order-independent key path, and the openings are real elements with Fills relationships rather than anonymous boolean holes.',
    code: `import { csg, unwrap } from 'brepjs/quick';
import { color } from 'brepjs/playground';
import { family, el, resolve, evaluateModel, tTranslate, type Element } from 'brepjs-families';

// Families are typed constructors returning elements; rendering happens inside
// resolve(). Keys become order-independent key paths: reorder siblings and
// every element keeps its identity (the property IFC GlobalIds derive from).
const Wall = family<{
  length: number;
  height: number;
  thickness: number;
  at: readonly [number, number, number];
  alongY?: boolean;
  voids?: readonly Element[];
}>('Wall', (p) =>
  el('Box', {
    size: p.alongY ? [p.thickness, p.length, p.height] : [p.length, p.thickness, p.height],
    voids: p.voids ?? [],
    transform: [tTranslate(p.at)],
  })
);

// role:'fill' makes an element placed in a wall's voids a synthesized Opening
// with a Fills relationship, not just a cut. Position is wall-local.
type FillProps = {
  width: number;
  height: number;
  at: readonly [number, number]; // [along-wall, sill]
  depth: number;
  alongY?: boolean;
};
const fillBox = (p: FillProps): Element =>
  el('Box', {
    size: p.alongY ? [p.depth, p.width, p.height] : [p.width, p.depth, p.height],
    transform: [tTranslate(p.alongY ? [0, p.at[0], p.at[1]] : [p.at[0], 0, p.at[1]])],
  });
const Door = family<FillProps>('Door', fillBox, { role: 'fill' });
const Window = family<FillProps>('Window', fillBox, { role: 'fill' });

const Slab = family<{
  length: number;
  width: number;
  thickness: number;
  at: readonly [number, number, number];
}>('Slab', (p) => el('Box', { size: [p.length, p.width, p.thickness], transform: [tTranslate(p.at)] }));

const Storey = family<{ items: readonly Element[] }>('Storey', (p) => el('Group', {}, p.items));

const L = 6000; // room length
const W = 4000; // room width
const H = 3000; // wall height
const T = 200; // wall thickness

const tree = resolve(
  Storey({
    key: 'ground',
    items: [
      Wall({
        key: 'south',
        length: L,
        height: H,
        thickness: T,
        at: [0, 0, 0],
        voids: [
          Door({ key: 'entry', width: 1000, height: 2100, at: [1200, 0], depth: T }),
          Window({ key: 'win', width: 1500, height: 1200, at: [3600, 900], depth: T }),
        ],
      }),
      Wall({ key: 'north', length: L, height: H, thickness: T, at: [0, W - T, 0] }),
      Wall({ key: 'east', length: W, height: H, thickness: T, at: [L - T, 0, 0], alongY: true }),
      Wall({ key: 'west', length: W, height: H, thickness: T, at: [0, 0, 0], alongY: true }),
      Slab({ key: 'floor', length: L, width: W, thickness: 250, at: [0, 0, -250] }),
    ],
  })
);

// Materialize against the content-addressed evaluator; shapes are opt-in.
const ev = new csg.Evaluator();
const model = evaluateModel(tree, ev, {}, { shapes: true });

// byKeyPath is the identity axis: stable addresses instead of array indices.
// Void slots path as host/voids:slot; the filling element is its /fill child.
const at = (keyPath: string) => {
  const node = model.byKeyPath.get(keyPath);
  if (!node || !node.shape) throw new Error('no geometry at ' + keyPath);
  return unwrap(node.shape);
};

export default [
  color(at('ground/south'), '#cfc4b0'),
  color(at('ground/north'), '#cfc4b0'),
  color(at('ground/east'), '#cfc4b0'),
  color(at('ground/west'), '#cfc4b0'),
  color(at('ground/floor'), '#8f8f8f'),
  color(at('ground/south/voids:entry/fill'), '#8b5a2b'),
  color(at('ground/south/voids:win/fill'), '#7ec8e3'),
];
`,
  },
  {
    id: 'families-ifc',
    label: 'Families to IFC',
    description:
      'The declarative building projected into a BimModel with familiesToBim: spatial containment, wall openings as IfcOpeningElement relationships, and GlobalIds derived from key paths so they survive reordering. The BIM panel shows the spatial tree and the IFC button downloads the exported file.',
    code: `import { color, present } from 'brepjs/playground';
import { family, el, resolve, tTranslate, type Element } from 'brepjs-families';
import { familiesToBim, toIfc } from 'brepjs-bim';

// Spec-shaped families: prop names feed the IFC element specs 1:1, so the
// adapter can mint real building elements (walls, slabs, doors, windows).
type Vec3 = readonly [number, number, number];

const Wall = family<{
  length: number;
  height: number;
  thickness: number;
  at: Vec3;
  axisX?: Vec3; // along-wall direction for the IFC spec
  voids?: readonly Element[];
  materialName: string;
  isExternal?: boolean;
  loadBearing?: boolean;
}>('Wall', (p) => {
  const alongY = (p.axisX ?? [1, 0, 0])[1] !== 0;
  return el('Box', {
    size: alongY ? [p.thickness, p.length, p.height] : [p.length, p.thickness, p.height],
    voids: p.voids ?? [],
    // A +Y wall's thickness spans world -X, so the box shifts to coincide
    // with the IFC spec solid.
    transform: [tTranslate(alongY ? [p.at[0] - p.thickness, p.at[1], p.at[2]] : p.at)],
  });
});

type FillProps = {
  width: number;
  height: number;
  at: readonly [number, number]; // [along-wall, sill]
  depth: number;
  alongY?: boolean;
  materialName: string;
  isExternal?: boolean;
};
const fillBox = (p: FillProps): Element =>
  el('Box', {
    size: p.alongY ? [p.depth, p.width, p.height] : [p.width, p.depth, p.height],
    transform: [tTranslate(p.alongY ? [0, p.at[0], p.at[1]] : [p.at[0], 0, p.at[1]])],
  });
const Door = family<FillProps>('Door', fillBox, { role: 'fill' });
const Window = family<FillProps>('Window', fillBox, { role: 'fill' });

const Slab = family<{
  length: number;
  width: number;
  thickness: number;
  at: Vec3;
  predefinedType: 'FLOOR' | 'ROOF' | 'LANDING' | 'BASESLAB';
  materialName: string;
  loadBearing?: boolean;
}>('Slab', (p) => el('Box', { size: [p.length, p.width, p.thickness], transform: [tTranslate(p.at)] }));

const Storey = family<{ elevation: number; items: readonly Element[] }>('Storey', (p) =>
  el('Group', {}, p.items)
);
const Building = family<{ storeys: readonly Element[] }>('Building', (p) =>
  el('Group', {}, p.storeys)
);

const L = 6000;
const W = 4000;
const H = 3000;
const T = 200;
const concrete = { thickness: T, height: H, materialName: 'Concrete', isExternal: true, loadBearing: true };

const tree = resolve(
  Building({
    key: 'demo',
    storeys: [
      Storey({
        key: 'ground',
        elevation: 0,
        items: [
          Wall({
            key: 'south',
            ...concrete,
            length: L,
            at: [0, 0, 0],
            voids: [
              Window({
                key: 'win',
                width: 1500,
                height: 1200,
                at: [2250, 900],
                depth: T,
                materialName: 'Aluminium + Glazing',
                isExternal: true,
              }),
            ],
          }),
          Wall({
            key: 'east',
            ...concrete,
            length: W,
            at: [L, 0, 0],
            axisX: [0, 1, 0],
            voids: [
              Door({
                key: 'entry',
                width: 1000,
                height: 2100,
                at: [1500, 0],
                depth: T,
                alongY: true,
                materialName: 'Timber',
                isExternal: true,
              }),
            ],
          }),
          Slab({
            key: 'floor',
            length: L,
            width: W,
            thickness: 250,
            at: [0, 0, -250],
            predefinedType: 'FLOOR',
            materialName: 'Concrete',
            loadBearing: true,
          }),
        ],
      }),
    ],
  })
);

// Project the tree into an eager BimModel: storeys, walls, slabs, openings,
// psets, materials, and reorder-stable GlobalIds from the key paths.
const projected = familiesToBim(tree, {
  project: { name: 'Families playground demo', projectId: 'families-playground-demo' },
  siteName: 'Site',
  buildingName: 'Block A',
});
if (!projected.ok) throw projected.error;
const model = projected.value.model;

// Walls carry their openings as real holes; door/window elements exist in the
// model as opening fillers (see the BIM panel), without display solids here.
const walls = model.getWalls().map((w) => color(w.geometry, '#cfc4b0'));
const slabs = model.getSlabs().map((s) => color(s.geometry, '#8f8f8f'));

// The ifc thunk runs only when you click the IFC download button.
export default present([...walls, ...slabs], {
  bimTree: model.toTreeSummary(),
  ifc: async () => {
    const result = await toIfc(model, {
      applicationName: 'brepjs playground',
      applicationVersion: '1.0',
    });
    if (!result.ok) throw result.error;
    return result.value;
  },
});
`,
  },
  {
    id: 'families-dedup',
    label: 'Shared Materialization',
    description:
      'Twelve identical piers: twelve identities, one materialized box. The CSG IR is content-addressed, so identical subtrees share a single cache entry while each element keeps its own key path. Respacing the row re-places every pier without ever rebuilding the shared box; the console shows the cache stats.',
    code: `import { csg, unwrap } from 'brepjs/quick';
import { family, el, resolve, evaluateModel, tTranslate } from 'brepjs-families';

// Each pier is Translate(Box). The Box subtree hashes identically for all
// twelve, so it materializes once; only the twelve translates are distinct.
const Pier = family<{ at: readonly [number, number, number] }>('Pier', (p) =>
  el('Box', { size: [400, 400, 2800], transform: [tTranslate(p.at)] })
);

const Colonnade = family<{ count: number; spacing: number }>('Colonnade', (p) =>
  el(
    'Group',
    {},
    Array.from({ length: p.count }, (_, i) => Pier({ key: 'p' + i, at: [i * p.spacing, 0, 0] }))
  )
);

const ev = new csg.Evaluator();
const row = evaluateModel(resolve(Colonnade({ key: 'row', count: 12, spacing: 900 })), ev, {}, { shapes: true });
const s1 = ev.cacheStats();
console.log('first eval: ' + s1.misses + ' misses, ' + s1.hits + ' hits, ' + s1.entries + ' cache entries');

// Respace the row: every Translate re-evaluates, the shared box never does.
evaluateModel(resolve(Colonnade({ key: 'row', count: 12, spacing: 1100 })), ev);
const s2 = ev.cacheStats();
console.log('respaced: +' + (s2.misses - s1.misses) + ' misses, +' + (s2.hits - s1.hits) + ' hits (the 400x400x2800 box is a pure hit)');

export default [...row.byKeyPath.values()].flatMap((n) =>
  n.type === 'Pier' && n.shape ? [unwrap(n.shape)] : []
);
`,
  },
  {
    id: 'families-room',
    label: 'Room Composition',
    description:
      'A Room family composed from Wall and Door families, mirroring the copy-in starter registry: families are source files you own and compose like components. Two rooms with shared dimensions also share wall materializations through the content-addressed cache.',
    code: `import { csg, unwrap } from 'brepjs/quick';
import { color } from 'brepjs/playground';
import { family, el, resolve, evaluateModel, tTranslate, type Element } from 'brepjs-families';

const T = 200; // wall thickness

const Wall = family<{
  length: number;
  height: number;
  at: readonly [number, number, number];
  alongY?: boolean;
  voids?: readonly Element[];
}>('Wall', (p) =>
  el('Box', {
    size: p.alongY ? [T, p.length, p.height] : [p.length, T, p.height],
    voids: p.voids ?? [],
    transform: [tTranslate(p.at)],
  })
);

const Door = family<{ width: number; height: number; at: readonly [number, number] }>(
  'Door',
  (p) => el('Box', { size: [p.width, T, p.height], transform: [tTranslate([p.at[0], 0, p.at[1]])] }),
  { role: 'fill' }
);

// A composed family, the registry pattern (npx brepjs add room): Room depends
// on Wall and Door the way a component depends on its children. Identical
// rooms share wall materializations content-addressed under the hood.
const Room = family<{
  width: number;
  depth: number;
  height: number;
  at: readonly [number, number];
  doorAt: number;
}>('Room', (p) => {
  const x = p.at[0];
  const y = p.at[1];
  return el('Group', {}, [
    Wall({
      key: 'south',
      length: p.width,
      height: p.height,
      at: [x, y, 0],
      voids: [Door({ key: 'entry', width: 900, height: 2100, at: [p.doorAt, 0] })],
    }),
    Wall({ key: 'north', length: p.width, height: p.height, at: [x, y + p.depth - T, 0] }),
    Wall({ key: 'east', length: p.depth, height: p.height, at: [x + p.width - T, y, 0], alongY: true }),
    Wall({ key: 'west', length: p.depth, height: p.height, at: [x, y, 0], alongY: true }),
  ]);
});

const Suite = family<{ items: readonly Element[] }>('Suite', (p) => el('Group', {}, p.items));

const tree = resolve(
  Suite({
    key: 'suite',
    items: [
      Room({ key: 'a', width: 4000, depth: 3000, height: 2700, at: [0, 0], doorAt: 1500 }),
      Room({ key: 'b', width: 4000, depth: 3000, height: 2700, at: [4200, 0], doorAt: 1500 }),
    ],
  })
);

const ev = new csg.Evaluator();
const model = evaluateModel(tree, ev, {}, { shapes: true });

// Key paths compose through the tree: suite/a/south, suite/b/entry, ...
const walls = [...model.byKeyPath.values()].flatMap((n) =>
  n.type === 'Wall' && n.shape ? [color(unwrap(n.shape), '#d9d2c4')] : []
);
const doors = [...model.byKeyPath.values()].flatMap((n) =>
  n.type === 'Door' && n.shape ? [color(unwrap(n.shape), '#8b5a2b')] : []
);

export default [...walls, ...doors];
`,
  },
];
