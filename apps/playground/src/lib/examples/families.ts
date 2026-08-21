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
    code: `import { unwrap } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';
import { family, el, resolve, tTranslate, type Element } from 'brepjs-families';
import { familiesToBim, placedSolids, toIfc } from 'brepjs-bim';

// Spec-shaped families: prop names feed the IFC element specs 1:1, so the
// adapter can mint real building elements (walls, slabs, doors, windows).
// These renders match the starter registry (npx brepjs add wall slab door
// window); the registry files additionally wrap each one in a zod schema that
// applies defaults before render. Schema output becomes the element's props,
// which is what the adapter reads, so without zod every spec field has to be
// passed explicitly here.
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
// placedSolids() is what puts each wall where its IFC placement says: the
// adapter folded the family's translate into IfcLocalPlacement, so .geometry
// is the unplaced local solid and reading it would stack the east wall on top
// of the south one.
const walls = model
  .getWalls()
  .flatMap((w) => unwrap(placedSolids(w)))
  .map((s) => color(s, '#cfc4b0'));
const slabs = model
  .getSlabs()
  .flatMap((s) => unwrap(placedSolids(s)))
  .map((s) => color(s, '#8f8f8f'));

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
      'A Room family composed from Wall and Door, copied from the starter registry (npx brepjs add room). Families are source files you own and compose like components, and a composed family threads its own placement into the children it builds. Key paths nest through the composition: suite/a/south, suite/b/south/voids:door.',
    code: `import { csg, unwrap } from 'brepjs/quick';
import { color } from 'brepjs/playground';
import { family, el, resolve, evaluateModel, tTranslate, type Element } from 'brepjs-families';

// The starter families, as the registry ships them (npx brepjs add room) with
// one difference: the real files wrap each render in a zod schema that supplies
// defaults and rejects bad dimensions. The playground cannot import zod, so
// every prop a schema would default is spelled out at the call site instead.

const Wall = family<{
  length: number;
  height: number;
  thickness: number;
  at: readonly [number, number, number];
  axisX?: readonly [number, number, number];
  voids?: readonly Element[];
  materialName: string;
}>('Wall', (p) => {
  const alongY = (p.axisX ?? [1, 0, 0])[1] !== 0;
  return el('Box', {
    size: alongY ? [p.thickness, p.length, p.height] : [p.length, p.thickness, p.height],
    voids: p.voids ?? [],
    // A +Y wall's thickness spans world -X (axisY = axisZ x axisX), so the box
    // shifts to coincide with the IFC spec solid.
    transform: [tTranslate(alongY ? [p.at[0] - p.thickness, p.at[1], p.at[2]] : p.at)],
  });
});

const Door = family<{
  width: number;
  height: number;
  at: readonly [number, number];
  depth: number;
  alongY?: boolean;
  materialName: string;
}>(
  'Door',
  (p) =>
    el('Box', {
      size: p.alongY ? [p.depth, p.width, p.height] : [p.width, p.depth, p.height],
      transform: [tTranslate(p.alongY ? [0, p.at[0], p.at[1]] : [p.at[0], 0, p.at[1]])],
    }),
  { role: 'fill' }
);

// A composed family depends on Wall and Door the way a component depends on its
// children, and threads its own placement down to them: element trees carry no
// hierarchical transform, so a Group transform would move the group's geometry
// and leave every wall behind at the origin.
const Room = family<{
  width: number;
  depth: number;
  height: number;
  thickness: number;
  at: readonly [number, number];
  doorWidth: number;
  doorHeight: number;
  materialName: string;
}>('Room', (p) => {
  const w = p.width;
  const d = p.depth;
  const t = p.thickness;
  const x = p.at[0];
  const y = p.at[1];
  const doorAlong = (w - p.doorWidth) / 2; // centered in the south wall
  const shared = { height: p.height, thickness: t, materialName: p.materialName };
  return el('Group', {}, [
    Wall({
      key: 'south',
      ...shared,
      length: w,
      at: [x, y, 0],
      voids: [
        Door({
          key: 'door',
          width: p.doorWidth,
          height: p.doorHeight,
          at: [doorAlong, 0],
          depth: t,
          materialName: 'Timber',
        }),
      ],
    }),
    Wall({ key: 'north', ...shared, length: w, at: [x, y + d - t, 0] }),
    Wall({ key: 'west', ...shared, length: d, at: [x + t, y, 0], axisX: [0, 1, 0] }),
    Wall({ key: 'east', ...shared, length: d, at: [x + w, y, 0], axisX: [0, 1, 0] }),
  ]);
});

const Suite = family<{ items: readonly Element[] }>('Suite', (p) => el('Group', {}, p.items));

const room = {
  depth: 3000,
  height: 2700,
  thickness: 200,
  doorWidth: 900,
  doorHeight: 2100,
  materialName: 'Concrete',
};

const tree = resolve(
  Suite({
    key: 'suite',
    items: [
      Room({ key: 'a', ...room, width: 4000, at: [0, 0] }),
      Room({ key: 'b', ...room, width: 4000, at: [4200, 0] }),
    ],
  })
);

const ev = new csg.Evaluator();
const model = evaluateModel(tree, ev, {}, { shapes: true });

// Key paths compose through the tree: suite/a/south, suite/b/south/voids:door.
const walls = [...model.byKeyPath.values()].flatMap((n) =>
  n.type === 'Wall' && n.shape ? [color(unwrap(n.shape), '#d9d2c4')] : []
);
const doors = [...model.byKeyPath.values()].flatMap((n) =>
  n.type === 'Door' && n.shape ? [color(unwrap(n.shape), '#8b5a2b')] : []
);

export default [...walls, ...doors];
`,
  },
  {
    id: 'families-structure',
    label: 'Declarative Steel Frame',
    description:
      'The two-bay frame from the Steel Frame example, authored as a family tree instead of imperative addColumn/addBeam calls, then projected through familiesToBim. Adds a gable roof and a switchback stair in the open west bay, so it exercises all four of the newest mapped types (column, beam, roof, stair). Every member carries a GlobalId derived from its key path, so reordering the tree changes nothing in the exported IFC.',
    code: `import { csg, unwrap } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';
import { family, el, resolve, tTranslate, type Element } from 'brepjs-families';
import { familiesToBim, placedSolids, toIfc } from 'brepjs-bim';

// The two-bay frame from the Steel Frame example, authored as a declarative
// tree instead of imperative addBeam/addColumn calls, with a gable roof and a
// switchback stair added. Compare the two: same kind of IFC out, but here every
// member is addressed by key path and its GlobalId survives reordering.
// Renders are the registry starter families
// (npx brepjs add column beam slab roof stair) minus their zod schemas, which
// the playground cannot import.

type Vec3 = readonly [number, number, number];
type Profile =
  | { kind: 'RECTANGULAR'; width: number; height: number }
  | { kind: 'CIRCULAR'; radius: number }
  | {
      kind: 'I_BEAM';
      overallWidth: number;
      overallDepth: number;
      flangeThickness: number;
      webThickness: number;
    };

// Profile outline centred on the member axis, shared by column and beam.
// I-beam outlines skip root fillets: IfcIShapeProfileDef carries filletRadius
// parametrically, so the viewport outline stays sharp.
const profilePoints = (p: Profile): ReadonlyArray<readonly [number, number]> => {
  if (p.kind === 'RECTANGULAR') {
    const hw = p.width / 2;
    const hh = p.height / 2;
    return [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ];
  }
  if (p.kind === 'CIRCULAR') return [];
  const hw = p.overallWidth / 2;
  const hd = p.overallDepth / 2;
  const hweb = p.webThickness / 2;
  const fi = hd - p.flangeThickness;
  return [
    [-hw, -hd],
    [hw, -hd],
    [hw, -fi],
    [hweb, -fi],
    [hweb, fi],
    [hw, fi],
    [hw, hd],
    [-hw, hd],
    [-hw, fi],
    [-hweb, fi],
    [-hweb, -fi],
    [-hw, -fi],
  ];
};

// Column: cross-section centred on its placement point, extruded up by height.
const Column = family<{
  height: number;
  profile: Profile;
  at: Vec3;
  materialName: string;
}>('Column', (p) => {
  if (p.profile.kind === 'CIRCULAR') {
    return el('Cylinder', {
      radius: p.profile.radius,
      height: p.height,
      transform: [tTranslate(p.at)],
    });
  }
  const pts = profilePoints(p.profile).map(([px, py]): [number, number, number] => [px, py, 0]);
  return el('Geometry', {
    node: csg.extrude(csg.polygon(pts), [0, 0, p.height]),
    transform: [tTranslate(p.at)],
  });
});

// Beam: cross-section centred on the axis, extruded along axisX by length.
const Beam = family<{
  length: number;
  profile: Profile;
  at: Vec3;
  axisX: Vec3;
  materialName: string;
}>('Beam', (p) => {
  const alongY = p.axisX[1] !== 0;
  // Placement frame per axis: along +X keeps profile-x on +Y; along +Y the
  // placement's local Y is world -X (Z cross axisX), so profile-x flips.
  const toWorld = alongY
    ? ([px, py]: readonly [number, number]): [number, number, number] => [-px, 0, py]
    : ([px, py]: readonly [number, number]): [number, number, number] => [0, px, py];
  const dir: [number, number, number] = alongY ? [0, p.length, 0] : [p.length, 0, 0];
  return el('Geometry', {
    node: csg.extrude(csg.polygon(profilePoints(p.profile).map(toWorld)), dir),
    transform: [tTranslate(p.at)],
  });
});

const Slab = family<{
  length: number;
  width: number;
  thickness: number;
  at: Vec3;
  predefinedType: 'FLOOR' | 'ROOF' | 'LANDING' | 'BASESLAB';
  materialName: string;
}>('Slab', (p) =>
  el('Box', { size: [p.length, p.width, p.thickness], transform: [tTranslate(p.at)] })
);

// Roof: pitched geometry is opt-in via the pitch prop, matching the spec-solid
// rule. The registry roof@1 also builds shed, hip and dome; gable is inlined.
const Roof = family<{
  length: number;
  width: number;
  thickness: number;
  at: Vec3;
  predefinedType: 'GABLE_ROOF';
  pitch: number;
  materialName: string;
}>('Roof', (p) => {
  const ridge = (p.width / 2) * Math.tan((p.pitch * Math.PI) / 180);
  return el('Geometry', {
    node: csg.extrude(
      csg.polygon([
        [0, 0, 0],
        [0, p.width, 0],
        [0, p.width, p.thickness],
        [0, p.width / 2, p.thickness + ridge],
        [0, 0, p.thickness],
      ]),
      [p.length, 0, 0]
    ),
    transform: [tTranslate(p.at)],
  });
});

// Stair: one stepped sawtooth solid per flight, each with its own placement,
// so return and switchback stairs compose from flights facing different ways.
type Flight = {
  width: number;
  riserHeight: number;
  treadLength: number;
  numberOfRisers: number;
  origin: Vec3;
  axisX: Vec3;
  axisZ: Vec3;
  materialName: string;
};
const Stair = family<{ flights: readonly Flight[]; at: Vec3; materialName: string }>(
  'Stair',
  (p) => {
    const flightNode = (f: Flight): csg.IRNode => {
      const ax = f.axisX[0];
      const ay = f.axisX[1];
      // Local +Y (the sweep across the width) = axisZ x axisX.
      const yx = -ay;
      const yy = ax;
      const pts: Array<[number, number, number]> = [[f.origin[0], f.origin[1], f.origin[2]]];
      let x = 0;
      let z = 0;
      for (let i = 0; i < f.numberOfRisers; i++) {
        z += f.riserHeight;
        pts.push([f.origin[0] + x * ax, f.origin[1] + x * ay, f.origin[2] + z]);
        x += f.treadLength;
        pts.push([f.origin[0] + x * ax, f.origin[1] + x * ay, f.origin[2] + z]);
      }
      pts.push([f.origin[0] + x * ax, f.origin[1] + x * ay, f.origin[2]]);
      return csg.extrude(csg.polygon(pts), [yx * f.width, yy * f.width, 0]);
    };
    const nodes = p.flights.map(flightNode);
    const node = nodes.length === 1 && nodes[0] ? nodes[0] : csg.compound(nodes);
    return el('Geometry', { node, transform: [tTranslate(p.at)] });
  }
);

const Storey = family<{ elevation: number; items: readonly Element[] }>('Storey', (p) =>
  el('Group', {}, p.items)
);

const COLS = [0, 3500, 7000];
const ROWS = [0, 3000];
const SPAN_X = 7000;
const SPAN_Y = 3000;
const COL_H = 3200;
const I: Profile = {
  kind: 'I_BEAM',
  overallWidth: 150,
  overallDepth: 200,
  flangeThickness: 12,
  webThickness: 8,
};

const columns = COLS.flatMap((x) =>
  ROWS.map((y) =>
    Column({
      key: 'col-' + x + '-' + y,
      height: COL_H,
      profile: I,
      at: [x, y, 0],
      materialName: 'Steel',
    })
  )
);
// Beams centre on z=COL_H, so the section straddles the column heads.
const beamsX = ROWS.map((y) =>
  Beam({
    key: 'bx-' + y,
    length: SPAN_X,
    profile: I,
    at: [0, y, COL_H],
    axisX: [1, 0, 0],
    materialName: 'Steel',
  })
);
const beamsY = COLS.map((x) =>
  Beam({
    key: 'by-' + x,
    length: SPAN_Y,
    profile: I,
    at: [x, 0, COL_H],
    axisX: [0, 1, 0],
    materialName: 'Steel',
  })
);

const DECK_Z = COL_H + 70;
const DECK_TOP = DECK_Z + 150;
// Nine risers per flight, twice, lands exactly on the deck top.
const RISERS = 9;
const TREAD = 260;
const RISER = DECK_TOP / (2 * RISERS);
const RUN = RISERS * TREAD;
const HALF_Z = RISERS * RISER;

const tree = resolve(
  Storey({
    key: 'level-1',
    elevation: 0,
    items: [
      ...columns,
      ...beamsX,
      ...beamsY,
      // The deck stops short of the west bay, leaving that bay open as the
      // stairwell rather than burying the flights under a solid floor.
      Slab({
        key: 'deck',
        length: SPAN_X - RUN,
        width: SPAN_Y,
        thickness: 150,
        at: [RUN, 0, DECK_Z],
        predefinedType: 'FLOOR',
        materialName: 'Concrete',
      }),
      Roof({
        key: 'roof',
        length: SPAN_X,
        width: SPAN_Y,
        thickness: 150,
        at: [0, 0, DECK_TOP],
        predefinedType: 'GABLE_ROOF',
        pitch: 30,
        materialName: 'Tile',
      }),
      // A switchback in the west bay: flight 1 climbs -X to the half level,
      // flight 2 turns 180 degrees and climbs +X to the deck edge. Per-flight
      // placement is the whole point of the stair mapping. A flight's width
      // sweeps along axisZ x axisX, so a -X flight lays its width on -Y.
      Stair({
        key: 'stair',
        at: [0, 0, 0],
        materialName: 'Concrete',
        flights: [
          // axisZ and materialName are spelled out per flight: registry
          // stair@1 fills them from a zod default and a schema transform, and
          // schema output IS the props the adapter reads. No schema here, so
          // each flight has to arrive spec-complete.
          {
            width: 1100,
            riserHeight: RISER,
            treadLength: TREAD,
            numberOfRisers: RISERS,
            origin: [RUN, 1100, 0],
            axisX: [-1, 0, 0],
            axisZ: [0, 0, 1],
            materialName: 'Concrete',
          },
          {
            width: 1100,
            riserHeight: RISER,
            treadLength: TREAD,
            numberOfRisers: RISERS,
            origin: [0, 1400, HALF_Z],
            axisX: [1, 0, 0],
            axisZ: [0, 0, 1],
            materialName: 'Concrete',
          },
        ],
      }),
    ],
  })
);

// Project onto a BimModel: storey, columns, beams, slab, roof, stair, each
// with a GlobalId derived from its key path.
const projected = familiesToBim(tree, {
  project: { name: 'Declarative steel frame', projectId: 'families-structure' },
  siteName: 'Site',
  buildingName: 'Block A',
});
if (!projected.ok) throw projected.error;
const model = projected.value.model;

const steel = [...model.getColumns(), ...model.getBeams()]
  .flatMap((e) => unwrap(placedSolids(e)))
  .map((s) => color(s, '#8a99ad'));
const concrete = [...model.getSlabs(), ...model.getStairs()]
  .flatMap((e) => unwrap(placedSolids(e)))
  .map((s) => color(s, '#cfcabb'));
const tile = model
  .getRoofs()
  .flatMap((e) => unwrap(placedSolids(e)))
  .map((s) => color(s, '#9c6b52'));

export default present([...steel, ...concrete, ...tile], {
  bimTree: model.toTreeSummary(),
  ifc: async () => {
    const r = await toIfc(model, {
      applicationName: 'brepjs playground',
      applicationVersion: '1.0',
    });
    if (!r.ok) throw r.error;
    return r.value;
  },
});
`,
  },
];
