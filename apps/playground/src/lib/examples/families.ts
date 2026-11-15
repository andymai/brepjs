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
      'A small house authored as one tree of typed families: walls, gables, a floor slab, trussed rafters, a roof covering and a chimney stack. Each door and window is a fill-role element in the voids of its wall, so the tree holds a real opening with a Fills relationship, and its frame, glass and leaf are children that move with it. Each element has an order-independent key path, and the model is drawn by type from that index. The door leaf and the truss spacing are published figures. The plan, the walls, the windows and the roof are a display model.',
    code: `import { compound, csg, unwrap } from 'brepjs/quick';
import { color } from 'brepjs/playground';
import { family, el, resolve, evaluateModel, tRotate, tTranslate, type Element } from 'brepjs-families';

// A small house as one tree of typed families. Units are millimetres, Z is up, the front door looks to +X.
// The door leaf and the truss spacing are published figures. The plan, the walls, the windows, the truss
// members and the roof covering are a display model.
interface HouseParams {
  length?: number; // along X: the long walls get one window for each 2.4 m
  pitch?: number; // roof pitch in degrees
  cover?: number; // part of the roof that has its covering, from the west end: 1 closes the roof
  open?: number; // swing of the front door in degrees
}

type Vec3 = readonly [number, number, number];
type Shape = Parameters<typeof compound>[0][number];

// ---- published figures
const LEAF = { width: 838, height: 1981, thickness: 44 }; // standard external door leaf
const TRUSS_SPACING = 600; // largest spacing of trussed rafters

// ---- display model
const WIDTH = 5400; // across Y
const WALL = { height: 2400, thickness: 300 };
const FRAME = 60; // door and window frame section
const WINDOW = { width: 1200, height: 1200, sill: 900 };
const ROOF = { thickness: 120, eaves: 350, verge: 300 };
const TRUSS = { thickness: 47, rafter: 170, tie: 120, post: 100 };
const STACK = 440; // side of the chimney stack

// Families are typed constructors that return elements. A wall is built along its own X, with its
// outer face at y = 0, and then turned into place: its openings ride with it.
const Wall = family<{ length: number; height: number; at: Vec3; turn: number; voids?: readonly Element[] }>('Wall', (p) =>
  el('Box', {
    size: [p.length, WALL.thickness, p.height],
    voids: p.voids ?? [],
    transform: [tRotate(p.turn), tTranslate(p.at)],
  })
);

// role 'fill' turns an element in the voids of a wall into an Opening with a Fills relationship.
// The box is the hole. Its children are what you see: they are placed from the corner of the hole.
const Window = family<{ at: readonly [number, number]; width: number; height: number }>(
  'Window',
  (p) =>
    el('Box', { size: [p.width, WALL.thickness, p.height], transform: [tTranslate([p.at[0], 0, p.at[1]])] }, [
      Frame({ key: 'frame', width: p.width, height: p.height, depth: 90, inset: 60 }),
      Glass({ key: 'glass', size: [p.width - 2 * FRAME, 24, p.height - 2 * FRAME], at: [FRAME, 93, FRAME] }),
      Sill({ key: 'sill', size: [p.width + 120, 60, 50], at: [-60, -60, -50] }),
    ]),
  { role: 'fill' }
);
const Door = family<{ at: readonly [number, number]; open: number }>(
  'Door',
  (p) => {
    const width = LEAF.width + 2 * FRAME;
    const height = LEAF.height + FRAME;
    return el('Box', { size: [width, WALL.thickness, height], transform: [tTranslate([p.at[0], 0, p.at[1]])] }, [
      Frame({ key: 'frame', width, height, depth: 100, inset: 100, threshold: false }),
      // The leaf hangs on the inner face of the frame and swings into the house.
      Leaf({ key: 'leaf', at: [FRAME, 200 - LEAF.thickness, 0], open: p.open }),
    ]);
  },
  { role: 'fill' }
);

const Slab = family<{ size: Vec3; at: Vec3 }>('Slab', (p) => el('Box', { size: p.size, transform: [tTranslate(p.at)] }));
const Storey = family<{ items: readonly Element[] }>('Storey', (p) => el('Group', {}, p.items));

function house({ length = 7800, pitch = 38, cover = 0.5, open = 25 }: HouseParams = {}) {
  const t = WALL.thickness;
  const h = WALL.height;
  const windows = (key: string, run: number): Element[] => {
    const count = Math.max(1, Math.floor(run / 2400));
    const gap = (run - count * WINDOW.width) / (count + 1);
    return Array.from({ length: count }, (_, i) =>
      Window({ key: key + i, ...WINDOW, at: [gap + i * (gap + WINDOW.width), WINDOW.sill] })
    );
  };
  const end = WIDTH - 2 * t; // the end walls stand between the long walls
  const doorAt = (end - LEAF.width - 2 * FRAME) / 2;
  const rise = (WIDTH / 2) * Math.tan((pitch * Math.PI) / 180);

  const tree = resolve(
    Storey({
      key: 'ground',
      items: [
        Slab({ key: 'floor', size: [length, WIDTH, 250], at: [0, 0, -250] }),
        Wall({ key: 'south', length, height: h, at: [0, 0, 0], turn: 0, voids: windows('win-', length) }),
        Wall({ key: 'north', length, height: h, at: [length, WIDTH, 0], turn: 180, voids: windows('win-', length) }),
        Wall({ key: 'east', length: end, height: h, at: [length, t, 0], turn: 90, voids: [Door({ key: 'entry', at: [doorAt, 0], open })] }),
        Wall({ key: 'west', length: end, height: h, at: [0, WIDTH - t, 0], turn: 270, voids: windows('win-', end) }),
        Wall({
          key: 'partition',
          length: end,
          height: h,
          at: [length * 0.45, t, 0],
          turn: 90,
          voids: [Door({ key: 'inner', at: [end - 1400, 0], open: 20 })],
        }),
        ...scenery(length, rise, Math.min(1, Math.max(0, cover))),
      ],
    })
  );

  // Materialize against the content-addressed evaluator. Shapes are opt-in.
  const ev = new csg.Evaluator();
  const model = evaluateModel(tree, ev, {}, { shapes: true });

  // byKeyPath is the identity axis: a stable address for each element, not an array index.
  // A void slot is host/voids:slot, the element that fills it is its /fill child.
  const entry = model.byKeyPath.get('ground/east/voids:entry');
  if (!entry || !model.byKeyPath.has('ground/east/voids:entry/fill/leaf')) throw new Error('door missing');
  const nodes = [...model.byKeyPath.values()];
  const count = (type: string): number => nodes.filter((n) => n.type === type).length;
  console.log(nodes.length + ' key paths: ' + count('Wall') + ' walls, ' + count('Opening') + ' openings, ' + count('Window') + ' windows, ' + count('Door') + ' doors');
  console.log(entry.keyPath + ' ' + entry.relationships.map((r) => r.kind + ' ' + r.target).join(', '));

  // Render along the same axis, with a colour for each type. Opening, Door and Window nodes are
  // the cut bodies of the holes, so they have no colour and are not drawn.
  const groups = new Map<string, Shape[]>();
  for (const n of nodes) {
    if (COLORS[n.type] && n.shape) groups.set(n.type, [...(groups.get(n.type) ?? []), unwrap(n.shape)]);
  }
  const bodies = [...groups.entries()].map(([type, shapes]) => color(compound(shapes), COLORS[type] ?? '#f5f2ea'));
  ev[Symbol.dispose](); // compound() copied the shapes
  return bodies;
}

const COLORS: Record<string, string> = {
  Wall: '#f5f2ea',
  Gable: '#f5f2ea',
  Slab: '#c3c9d1',
  Frame: '#c3c9d1',
  Glass: '#9fd3e6',
  Sill: '#c3c9d1',
  Leaf: '#12b5b0',
  Roof: '#5b6470',
  Ridge: '#48515c',
  Truss: '#d3a956',
  Stack: '#b5694a',
  Step: '#c3c9d1',
  Canopy: '#48515c',
};

// ---- the smaller families

const Box = (type: string) =>
  family<{ size: Vec3; at: Vec3 }>(type, (p) => el('Box', { size: p.size, transform: [tTranslate(p.at)] }));
const Glass = Box('Glass');
const Sill = Box('Sill');
const Step = Box('Step');
const Stack = Box('Stack');
const Canopy = Box('Canopy');

// A frame around a hole: the outline of the hole less the clear opening, as one extruded ring.
const Frame = family<{ width: number; height: number; depth: number; inset: number; threshold?: boolean }>('Frame', (p) => {
  const low = p.threshold === false ? 0 : FRAME; // a door frame has no bottom rail
  const outer = csg.translate(csg.box(p.width, p.depth, p.height), [0, p.inset, 0]);
  const inner = csg.translate(csg.box(p.width - 2 * FRAME, p.depth, p.height - FRAME - low), [FRAME, p.inset, low]);
  return el('Geometry', { node: csg.cut(outer, inner) });
});

// The leaf turns about its hinge edge before it moves to the frame.
const Leaf = family<{ at: Vec3; open: number }>('Leaf', (p) =>
  el('Box', {
    size: [LEAF.width, LEAF.thickness, LEAF.height],
    transform: [tRotate(p.open, { at: [0, LEAF.thickness, 0] }), tTranslate(p.at)],
  })
);

// A section in the YZ plane, extruded along X.
const along = (pts: ReadonlyArray<readonly [number, number]>, x: number, len: number): csg.IRNode =>
  csg.extrude(csg.polygon(pts.map(([y, z]): [number, number, number] => [x, y, z])), [len, 0, 0]);

// The gable is the triangle of wall above an end wall, in the frame of that wall. It takes a window too.
const Gable = family<{ rise: number; at: Vec3; turn: number; voids: readonly Element[] }>('Gable', (p) => {
  const t = WALL.thickness;
  const h = WALL.height;
  const face = csg.polygon([[-t, 0, h], [WIDTH - t, 0, h], [WIDTH / 2 - t, 0, h + p.rise]]);
  return el('Geometry', { node: csg.extrude(face, [0, t, 0]), voids: p.voids, transform: [tRotate(p.turn), tTranslate(p.at)] });
});

// Trussed rafter: a triangle of two rafters and a tie, with a king post and two queen posts.
// Every truss is the same recipe, so the evaluator builds one and places the rest.
const Truss = family<{ x: number; rise: number }>('Truss', (p) => {
  const h = WALL.height;
  const mid = WIDTH / 2;
  const slope = p.rise / mid;
  const under = (y: number): number => h + slope * Math.min(y, WIDTH - y) - TRUSS.rafter; // underside of the rafters
  const foot = (TRUSS.tie + TRUSS.rafter) / slope;
  const d = TRUSS.thickness;
  const post = (y: number): csg.IRNode => {
    const a = y - TRUSS.post / 2;
    const b = y + TRUSS.post / 2;
    const top: Array<[number, number]> = y === mid ? [[b, under(b)], [mid, under(mid)], [a, under(a)]] : [[b, under(b)], [a, under(a)]];
    return along([[a, h + TRUSS.tie], [b, h + TRUSS.tie], ...top], 0, d);
  };
  const frame = csg.cut(
    along([[0, h], [WIDTH, h], [mid, h + p.rise]], 0, d),
    along([[foot, h + TRUSS.tie], [WIDTH - foot, h + TRUSS.tie], [mid, under(mid)]], -d, 3 * d)
  );
  return el('Geometry', { node: csg.compound([frame, post(mid), post(WIDTH / 4), post((3 * WIDTH) / 4)]), transform: [tTranslate([p.x, 0, 0])] });
});

// A plain element in voids is an anonymous cut: the roof covering gets a hole for the chimney stack.
const Roof = family<{ length: number; rise: number; voids: readonly Element[] }>('Roof', (p) => {
  const slope = p.rise / (WIDTH / 2);
  const low = WALL.height - ROOF.eaves * slope;
  const d = ROOF.thickness;
  const section: Array<[number, number]> = [
    [-ROOF.eaves, low], [WIDTH / 2, WALL.height + p.rise], [WIDTH + ROOF.eaves, low],
    [WIDTH + ROOF.eaves, low + d], [WIDTH / 2, WALL.height + p.rise + d], [-ROOF.eaves, low + d],
  ];
  return el('Geometry', { node: along(section, -ROOF.verge, p.length), voids: p.voids });
});
const Ridge = family<{ node: csg.IRNode }>('Ridge', (p) => el('Geometry', { node: p.node }));

// Gables, trusses, roof covering, chimney stack, door step and canopy.
function scenery(length: number, rise: number, cover: number): Element[] {
  const t = WALL.thickness;
  const mid = WIDTH / 2;
  const slope = rise / mid;
  const top = WALL.height + rise + ROOF.thickness;
  // Trusses between the gables, not more than the published spacing apart.
  const bays = Math.ceil((length - 2 * t - TRUSS.thickness) / TRUSS_SPACING);
  const pitch = (length - 2 * t - TRUSS.thickness) / bays;
  const trusses = Array.from({ length: bays + 1 }, (_, i) => Truss({ key: 'truss-' + i, x: t + i * pitch, rise }));
  // The stack stands between two trusses, next to the partition.
  const bay = Math.floor((length * 0.45 - t - STACK) / pitch) - 1;
  const stack: Vec3 = [STACK, STACK, top + 600];
  const at: Vec3 = [t + bay * pitch + TRUSS.thickness + (pitch - TRUSS.thickness - STACK) / 2, mid - STACK - 400, 0];
  const covered = ROOF.verge + cover * (length + ROOF.verge);
  const cap: Array<[number, number]> = [
    [mid - 150, top - 150 * slope], [mid, top], [mid + 150, top - 150 * slope],
    [mid + 150, top - 150 * slope + 70], [mid, top + 70], [mid - 150, top - 150 * slope + 70],
  ];
  const doorY = (WIDTH - LEAF.width - 2 * FRAME) / 2;
  const attic = Window({ key: 'attic', width: 700, height: 700, at: [mid - t - 350, WALL.height + 350] });
  return [
    Gable({ key: 'gable-west', rise, at: [0, WIDTH - t, 0], turn: 270, voids: [attic] }),
    Gable({ key: 'gable-east', rise, at: [length, t, 0], turn: 90, voids: [attic] }),
    ...trusses,
    Stack({ key: 'stack', size: stack, at }),
    ...(cover > 0
      ? [
          Roof({ key: 'roof', length: covered, rise, voids: [Stack({ key: 'hole', size: stack, at })] }),
          Ridge({ key: 'ridge', node: along(cap, -ROOF.verge, covered) }),
        ]
      : []),
    Step({ key: 'step', size: [900, LEAF.width + 700, 150], at: [length, doorY - 350 + FRAME, -150] }),
    Canopy({ key: 'canopy', size: [800, LEAF.width + 500, 80], at: [length, doorY - 250 + FRAME, LEAF.height + 2 * FRAME + 120] }),
  ];
}

export default house();`,
  },
  {
    id: 'families-ifc',
    label: 'Families to IFC',
    description:
      'A block of flats on two storeys, authored as families and projected into a BimModel with familiesToBim: spatial containment, wall openings as IfcOpeningElement relationships with IfcDoor and IfcWindow fillers, and GlobalIds derived from key paths. The console shows that every GlobalId is the same after the tree is reversed. Families with no IFC mapping, the door leaves and the glass panes, go out as proxies. The BIM panel shows the spatial tree and the IFC button downloads the file. The stair rise, going and landing are published figures. The plan and the sizes are a display model.',
    code: `import { compound, csg, unwrap } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';
import { family, el, resolve, tTranslate, type Element } from 'brepjs-families';
import { familiesToBim, placedSolids, toIfc } from 'brepjs-bim';

// A block of flats on two storeys, authored as families and projected to a BIM model and an IFC file.
// Units are millimetres, Z is up. The stair figures are published. The plan and the sizes are a display model.
interface BlockParams {
  flats?: number; // flats on each storey: the facades, the gallery and the roof follow
  pitch?: number; // roof pitch in degrees
}

type Vec3 = readonly [number, number, number];
type Shape = Parameters<typeof compound>[0][number];
const X: Vec3 = [1, 0, 0];
const Y: Vec3 = [0, 1, 0];

// ---- published figures (general access stair)
const STAIR = { rise: 170, going: 280, flights: [9, 8], landing: 1200 }; // rise 150 to 170, going 250 to 400, 12 risers at most

// ---- display model
const STOREY = (STAIR.flights[0]! + STAIR.flights[1]!) * STAIR.rise; // floor to floor
const FLAT = 6000; // along X
const DEPTH = 7000; // along Y
const WALL = { thickness: 300, party: 200 };
const SLAB = 250;
const GALLERY = { depth: 1500, slab: 200, post: 200 };
const STAIR_WIDTH = 1100;
const GUARD = { height: 1100, thickness: 50 };

// Spec-shaped families: the prop names feed the IFC element specs 1:1, so the adapter can make real
// building elements. The IFC placement of a wall is its origin and its axisX, and its thickness goes
// along axisZ x axisX. bar() makes the same solid, so the viewer and the IFC file agree.
const bar = (axisX: Vec3, length: number, thickness: number, height: number): csg.IRNode => {
  const pt = (u: number, v: number): [number, number, number] => [u * axisX[0] - v * axisX[1], u * axisX[1] + v * axisX[0], 0];
  return csg.extrude(csg.polygon([pt(0, 0), pt(length, 0), pt(length, thickness), pt(0, thickness)]), [0, 0, height]);
};
const Wall = family<{
  length: number;
  height: number;
  thickness: number;
  at: Vec3;
  axisX: Vec3;
  voids?: readonly Element[];
  materialName: string;
  isExternal?: boolean;
  loadBearing?: boolean;
}>('Wall', (p) =>
  el('Geometry', { node: bar(p.axisX, p.length, p.thickness, p.height), voids: p.voids ?? [], transform: [tTranslate(p.at)] })
);

// role 'fill': in the voids of a wall, these become IfcOpeningElement with IfcDoor or IfcWindow as the filler.
// The translate is [along the wall, sill] in the frame of the wall: the adapter reads the offsets from it.
type FillProps = { width: number; height: number; at: readonly [number, number]; depth: number; axisX: Vec3; materialName: string; isExternal: boolean };
const fillBox = (p: FillProps): Element =>
  el('Geometry', {
    node: bar(p.axisX, p.width, p.depth, p.height),
    transform: [tTranslate([p.at[0] * p.axisX[0], p.at[0] * p.axisX[1], p.at[1]])],
  });
const Door = family<FillProps>('Door', fillBox, { role: 'fill' });
const Window = family<FillProps>('Window', fillBox, { role: 'fill' });

const Slab = family<{ length: number; width: number; thickness: number; at: Vec3; predefinedType: 'FLOOR' | 'LANDING' | 'BASESLAB'; materialName: string }>(
  'Slab',
  (p) => el('Box', { size: [p.length, p.width, p.thickness], transform: [tTranslate(p.at)] })
);

// A Storey has an elevation. Its elements are authored from its own floor level: the IFC storey
// placement lifts them, and placedSolids() gets the same lift as its parent frame.
const Storey = family<{ elevation: number; items: readonly Element[] }>('Storey', (p) => el('Group', {}, p.items));
const Building = family<{ storeys: readonly Element[] }>('Building', (p) => el('Group', {}, p.storeys));

function tree(flats: number, pitch: number, reversed: boolean) {
  const length = flats * FLAT;
  const order = <T,>(items: T[]): T[] => (reversed ? [...items].reverse() : items);
  const out = 600; // the ground slab and the roof go past the walls
  const top = STOREY - SLAB; // wall height
  const posts = Array.from({ length: flats + 1 }, (_, i) =>
    Column({ key: 'post-' + i, height: STOREY - GALLERY.slab, profile: POST, at: [Math.max(i * FLAT, GALLERY.post / 2), -GALLERY.depth + GALLERY.post / 2, 0], materialName: 'Concrete' })
  );
  return resolve(
    Building({
      key: 'block',
      storeys: order([
        Storey({
          key: 'ground',
          elevation: 0,
          items: order([
            Slab({ key: 'base', length: length + STAIR_WIDTH + 2 * out, width: DEPTH + GALLERY.depth + 2 * out, thickness: SLAB, at: [-out, -GALLERY.depth - out, -SLAB], predefinedType: 'BASESLAB', materialName: 'Concrete' }),
            Shell({ key: 'shell', flats, height: top, upper: false }),
            ...posts,
            ...access(length),
          ]),
        }),
        Storey({
          key: 'first',
          elevation: STOREY,
          items: order([
            Slab({ key: 'floor', length, width: DEPTH, thickness: SLAB, at: [0, 0, -SLAB], predefinedType: 'FLOOR', materialName: 'Concrete' }),
            Slab({ key: 'gallery', length: length + STAIR_WIDTH, width: GALLERY.depth, thickness: GALLERY.slab, at: [0, -GALLERY.depth, -GALLERY.slab], predefinedType: 'FLOOR', materialName: 'Concrete' }),
            Shell({ key: 'shell', flats, height: top, upper: true }),
            ...guards(length),
            Roof({ key: 'roof', length: length + 2 * out, width: DEPTH + 2 * out, thickness: 200, at: [-out, -out, top], predefinedType: 'GABLE_ROOF', pitch, materialName: 'Slate' }),
          ]),
        }),
      ]),
    })
  );
}

function block({ flats = 2, pitch = 25 }: BlockParams = {}) {
  // Project the tree into a BimModel: storeys, walls, slabs, openings, psets and materials.
  // Leaf and Pane have no IFC mapping: proxyEvaluator sends them out as IfcBuildingElementProxy.
  const ev = new csg.Evaluator();
  const options = {
    project: { name: 'Families playground demo', projectId: 'families-playground-demo' },
    siteName: 'Site',
    buildingName: 'Block A',
    proxyEvaluator: ev,
  };
  const projected = familiesToBim(tree(flats, pitch, false), options);
  if (!projected.ok) throw projected.error;
  const { model, idByKeyPath, proxied } = projected.value;

  // GlobalIds come from the key paths, so they stay the same when the tree is in another order.
  const again = familiesToBim(tree(flats, pitch, true), options);
  if (!again.ok) throw again.error;
  const same = [...idByKeyPath].filter(([path, id]) => {
    const other = again.value.idByKeyPath.get(path);
    return other !== undefined && again.value.model.getElement(other)?.guid === model.getElement(id)?.guid;
  }).length;
  again.value.model[Symbol.dispose]();
  ev[Symbol.dispose]();
  console.log(model.getWalls().length + ' walls, ' + model.getDoors().length + ' doors, ' + model.getWindows().length + ' windows, ' + model.getSlabs().length + ' slabs, ' + proxied.length + ' proxies');
  console.log('GlobalIds: ' + same + ' of ' + idByKeyPath.size + ' are the same after the tree is reversed');

  // placedSolids() puts each element where its IFC placement says. An IfcDoor and an IfcWindow have no
  // body of their own: the wall has the real hole, and the proxy in the hole is the leaf or the pane.
  const kind = new Map(proxied.map((p) => [p.keyPath, p.type]));
  const groups = new Map<string, Shape[]>();
  const temp: Shape[] = [];
  for (const [path, id] of idByKeyPath) {
    const element = model.getElement(id);
    if (!element) continue;
    const lift = path.startsWith('block/first') ? STOREY : 0;
    const solids = unwrap(placedSolids(element, { parentFrame: { origin: [0, 0, lift], axisX: [1, 0, 0], axisZ: [0, 0, 1] } }));
    temp.push(...solids);
    const tone = kind.get(path) ?? element.category;
    if (solids.length > 0) groups.set(tone, [...(groups.get(tone) ?? []), ...solids]);
  }
  const bodies = [...groups.entries()].map(([tone, shapes]) => color(compound(shapes), COLORS[tone] ?? '#f5f2ea'));
  temp.forEach((s) => s.delete()); // compound() copied the solids
  return { model, bodies };
}

const COLORS: Record<string, string> = {
  WALL: '#f5f2ea',
  SLAB: '#c3c9d1',
  ROOF: '#5b6470',
  STAIR: '#d8d4c8',
  COLUMN: '#c3c9d1',
  RAILING: '#48515c',
  Leaf: '#12b5b0',
  Pane: '#9fd3e6',
};

// ---- the rest of the families

// A wall with its holes, and a leaf or a pane in each hole. The leaf and the pane are siblings of the
// wall, not children of the fill, because the adapter maps a fill to one IfcDoor or IfcWindow.
type Hole = { door?: boolean; along: number; width: number; height: number; sill: number };
const Leaf = family<{ size: Vec3; at: Vec3; materialName: string }>('Leaf', (p) => el('Box', { size: p.size, transform: [tTranslate(p.at)] }));
const Pane = family<{ size: Vec3; at: Vec3; materialName: string }>('Pane', (p) => el('Box', { size: p.size, transform: [tTranslate(p.at)] }));
const Facade = family<{ length: number; height: number; at: Vec3; axisX: Vec3; holes: readonly Hole[] }>('Facade', (p) => {
  const t = WALL.thickness;
  const alongY = p.axisX[1] !== 0;
  const fills = p.holes.map((h, i) =>
    (h.door ? Door : Window)({
      key: (h.door ? 'door-' : 'window-') + i,
      width: h.width,
      height: h.height,
      at: [h.along, h.sill],
      depth: t,
      axisX: p.axisX,
      materialName: h.door ? 'Timber' : 'Aluminium + Glazing',
      isExternal: true,
    })
  );
  const infill = p.holes.map((h, i) => {
    const d = h.door ? 44 : 24;
    const inset = (t - d) / 2;
    const size: Vec3 = alongY ? [d, h.width, h.height] : [h.width, d, h.height];
    const at: Vec3 = alongY ? [p.at[0] - t + inset, p.at[1] + h.along, p.at[2] + h.sill] : [p.at[0] + h.along, p.at[1] + inset, p.at[2] + h.sill];
    return h.door ? Leaf({ key: 'leaf-' + i, size, at, materialName: 'Timber' }) : Pane({ key: 'pane-' + i, size, at, materialName: 'Glass' });
  });
  const wall = Wall({ key: 'wall', length: p.length, height: p.height, thickness: t, at: p.at, axisX: p.axisX, voids: fills, materialName: 'Masonry', isExternal: true, loadBearing: true });
  return el('Group', {}, [wall, ...infill]);
});

// The four facades of one storey and the party walls between the flats.
const Shell = family<{ flats: number; height: number; upper: boolean }>('Shell', (p) => {
  const t = WALL.thickness;
  const length = p.flats * FLAT;
  const window = (along: number, width: number): Hole => ({ along, width, height: 1200, sill: 900 });
  const each = (holes: (x: number) => Hole[]): Hole[] => Array.from({ length: p.flats }, (_, i) => holes(i * FLAT)).flat();
  const south = each((x) => [{ door: true, along: x + 700, width: 910, height: 2100, sill: 0 }, window(x + 2300, 1200), window(x + 4100, 1200)]);
  const north = each((x) => [window(x + 900, 1500), window(x + 3600, 1500)]);
  const end = DEPTH - 2 * t;
  const party = Array.from({ length: p.flats - 1 }, (_, i) =>
    Wall({ key: 'party-' + i, length: end, height: p.height, thickness: WALL.party, at: [(i + 1) * FLAT + WALL.party / 2, t, 0], axisX: Y, materialName: 'Masonry', loadBearing: true })
  );
  return el('Group', {}, [
    Facade({ key: 'south', length, height: p.height, at: [0, 0, 0], axisX: X, holes: south }),
    Facade({ key: 'north', length, height: p.height, at: [0, DEPTH - t, 0], axisX: X, holes: north }),
    // The stair runs along the east wall, so only the upper storey has a window there.
    Facade({ key: 'east', length: end, height: p.height, at: [length, t, 0], axisX: Y, holes: p.upper ? [window(3900, 1500)] : [] }),
    Facade({ key: 'west', length: end, height: p.height, at: [t, t, 0], axisX: Y, holes: [window(2450, 1500)] }),
    ...party,
  ]);
});

type Profile = { kind: 'RECTANGULAR'; width: number; height: number };
const POST: Profile = { kind: 'RECTANGULAR', width: GALLERY.post, height: GALLERY.post };
const Column = family<{ height: number; profile: Profile; at: Vec3; materialName: string }>('Column', (p) => {
  const w = p.profile.width / 2;
  const d = p.profile.height / 2;
  // The section is centred on the placement point, the same as the IFC column.
  return el('Geometry', { node: csg.extrude(csg.polygon([[-w, -d, 0], [w, -d, 0], [w, d, 0], [-w, d, 0]]), [0, 0, p.height]), transform: [tTranslate(p.at)] });
});

const Roof = family<{ length: number; width: number; thickness: number; at: Vec3; predefinedType: 'GABLE_ROOF'; pitch: number; materialName: string }>('Roof', (p) => {
  const ridge = (p.width / 2) * Math.tan((p.pitch * Math.PI) / 180);
  const section = csg.polygon([[0, 0, 0], [0, p.width, 0], [0, p.width, p.thickness], [0, p.width / 2, p.thickness + ridge], [0, 0, p.thickness]]);
  return el('Geometry', { node: csg.extrude(section, [p.length, 0, 0]), transform: [tTranslate(p.at)] });
});

const Railing = family<{ length: number; height: number; thickness: number; at: Vec3; axisX: Vec3; infill: 'POSTED'; predefinedType: 'GUARDRAIL'; materialName: string }>(
  'Railing',
  (p) => el('Geometry', { node: bar(p.axisX, p.length, p.thickness, p.height), transform: [tTranslate(p.at)] })
);

// One stepped solid for each flight. A flight has its own placement: its width goes along axisZ x axisX.
type Flight = { width: number; riserHeight: number; treadLength: number; numberOfRisers: number; origin: Vec3; axisX: Vec3; axisZ: Vec3; materialName: string };
const Stair = family<{ flights: readonly Flight[]; at: Vec3; predefinedType: 'TWO_STRAIGHT_RUN_STAIR'; materialName: string }>('Stair', (p) => {
  const flight = (f: Flight): csg.IRNode => {
    const pts: Array<[number, number, number]> = [[f.origin[0], f.origin[1], f.origin[2]]];
    for (let i = 1; i <= f.numberOfRisers; i++) {
      const z = f.origin[2] + i * f.riserHeight;
      pts.push([f.origin[0] + (i - 1) * f.treadLength * f.axisX[0], f.origin[1] + (i - 1) * f.treadLength * f.axisX[1], z]);
      pts.push([f.origin[0] + i * f.treadLength * f.axisX[0], f.origin[1] + i * f.treadLength * f.axisX[1], z]);
    }
    const run = f.numberOfRisers * f.treadLength;
    pts.push([f.origin[0] + run * f.axisX[0], f.origin[1] + run * f.axisX[1], f.origin[2]]);
    return csg.extrude(csg.polygon(pts), [-f.axisX[1] * f.width, f.axisX[0] * f.width, 0]);
  };
  return el('Geometry', { node: csg.compound(p.flights.map(flight)), transform: [tTranslate(p.at)] });
});

// The way up: two flights along the east wall, with a landing on a post between them.
function access(length: number): Element[] {
  const [first, second] = [STAIR.flights[0]!, STAIR.flights[1]!];
  const half = first * STAIR.rise;
  const y2 = second * STAIR.going; // the upper flight ends at the gallery, at y = 0
  const y1 = y2 + STAIR.landing;
  const flight = { width: STAIR_WIDTH, riserHeight: STAIR.rise, treadLength: STAIR.going, axisX: [0, -1, 0] as Vec3, axisZ: [0, 0, 1] as Vec3, materialName: 'Concrete' };
  return [
    Stair({
      key: 'stair',
      at: [0, 0, 0],
      predefinedType: 'TWO_STRAIGHT_RUN_STAIR',
      materialName: 'Concrete',
      flights: [
        { ...flight, numberOfRisers: first, origin: [length, y1 + first * STAIR.going, 0] },
        { ...flight, numberOfRisers: second, origin: [length, y2, half] },
      ],
    }),
    Slab({ key: 'landing', length: STAIR_WIDTH, width: STAIR.landing, thickness: 200, at: [length, y2, half - 200], predefinedType: 'LANDING', materialName: 'Concrete' }),
    Column({ key: 'landing-post', height: half - 200, profile: POST, at: [length + STAIR_WIDTH - GALLERY.post / 2, y2 + STAIR.landing / 2, 0], materialName: 'Concrete' }),
    Railing({ key: 'landing-guard', length: STAIR.landing, ...GUARD, at: [length + STAIR_WIDTH, y2, half], axisX: Y, infill: 'POSTED', predefinedType: 'GUARDRAIL', materialName: 'Steel' }),
  ];
}

// Guard rails on the open edges of the gallery.
function guards(length: number): Element[] {
  const rail = { ...GUARD, infill: 'POSTED' as const, predefinedType: 'GUARDRAIL' as const, materialName: 'Steel' };
  const side = GALLERY.depth - GUARD.thickness;
  return [
    Railing({ key: 'guard-south', ...rail, length: length + STAIR_WIDTH, at: [0, -GALLERY.depth, 0], axisX: X }),
    Railing({ key: 'guard-east', ...rail, length: side, at: [length + STAIR_WIDTH, -side, 0], axisX: Y }),
    Railing({ key: 'guard-west', ...rail, length: side, at: [GUARD.thickness, -side, 0], axisX: Y }),
  ];
}

const built = block();

// The ifc thunk runs only when you click the IFC download button.
export default present(built.bodies, {
  bimTree: built.model.toTreeSummary(),
  ifc: async () => {
    const result = await toIfc(built.model, { applicationName: 'brepjs playground', applicationVersion: '1.0' });
    if (!result.ok) throw result.error;
    return result.value;
  },
});`,
  },
  {
    id: 'families-dedup',
    label: 'Shared Materialization',
    description:
      'A Doric temple authored as a family tree: sixteen identical fluted columns and thirty-six triglyphs, each with its own key path. The CSG IR is content-addressed, so the evaluator builds one column and one triglyph for each facing, and a second evaluation with wider bays is almost all cache hits. The console shows the counts. The proportions of the order are published figures. The taper, the steps, the cella and the roof are a display model.',
    code: `import { compound, csg, unwrap } from 'brepjs/quick';
import { color } from 'brepjs/playground';
import { family, el, resolve, evaluateModel, tRotate, tTranslate, type Element } from 'brepjs-families';

// Doric peristyle: many identical columns, one materialized column. Units are millimetres, Z is up.
// The proportions of the order are published figures. The steps, the taper, the roof and the pitch are a display model.
interface PeristyleParams {
  columns?: number; // columns on each long side
  diameter?: number; // lower diameter of the shaft: every other size follows from it
  bay?: number; // triglyph intervals between two columns: 2 is close-set, 3 is wide
  explode?: number; // 0 closes the temple, 1 lifts the cornice and the roof to show the frieze
}

type Vec3 = readonly [number, number, number];
type Shape = Parameters<typeof compound>[0][number];

// ---- published figures (Roman Doric order after Vignola, in modules: 1 module = half a diameter)
const ORDER = { column: 16, base: 1, capital: 1, architrave: 1, frieze: 1.5, cornice: 1.5, projection: 2 };
const FLUTES = 20; // shallow channels that meet in a sharp arris
const TRIGLYPH = 1; // width

// ---- display model (modules)
const TAPER = 5 / 6; // upper diameter over lower diameter
const FLUTE = { centre: 1.15, radius: 0.2254 }; // flute circle, as fractions of the shaft radius
const METOPE = 1.5; // clear width between two triglyphs
const STEP = { count: 3, rise: 0.5, tread: 0.9, margin: 1.7 };
const PITCH = 14; // degrees
const ENDS = 4; // columns across each end
const DOOR = { width: 3, height: 10 };
const LIFT = 4; // rise of the cornice and the roof at explode = 1

// The lesson. Each Column call builds the whole fluted recipe again, but the recipe hashes the same
// every time, so the evaluator cuts the 20 flutes once. Only the Translate around it is new.
const Column = family<{ module: number; at: Vec3 }>('Column', (p) =>
  el('Geometry', { node: columnRecipe(p.module), transform: [tTranslate(p.at)] })
);
const Triglyph = family<{ module: number; at: Vec3; turn: number }>('Triglyph', (p) =>
  el('Geometry', { node: triglyphRecipe(p.module), transform: [tRotate(p.turn), tTranslate(p.at)] })
);

const Peristyle = family<{ columns: number; module: number; bay: number; explode: number }>('Peristyle', (p) => {
  const m = p.module;
  const pitch = p.bay * (TRIGLYPH + METOPE) * m; // column spacing follows the frieze
  const lx = (p.columns - 1) * pitch;
  const ly = (ENDS - 1) * pitch;
  const face = TAPER * m; // the frieze face stands over the top of the shaft
  const top = ORDER.column * m;
  const columns: Element[] = [];
  for (let i = 0; i < p.columns; i++) {
    columns.push(Column({ key: 'south-' + i, module: m, at: [i * pitch, 0, 0] }));
    columns.push(Column({ key: 'north-' + i, module: m, at: [i * pitch, ly, 0] }));
  }
  for (let j = 1; j < ENDS - 1; j++) {
    columns.push(Column({ key: 'west-' + j, module: m, at: [0, j * pitch, 0] }));
    columns.push(Column({ key: 'east-' + j, module: m, at: [lx, j * pitch, 0] }));
  }
  const unit = (TRIGLYPH + METOPE) * m;
  const z = top + ORDER.architrave * m;
  const triglyphs: Element[] = [];
  for (let i = 0; i <= (p.columns - 1) * p.bay; i++) {
    triglyphs.push(Triglyph({ key: 'tri-south-' + i, module: m, at: [i * unit, -face, z], turn: 0 }));
    triglyphs.push(Triglyph({ key: 'tri-north-' + i, module: m, at: [i * unit, ly + face, z], turn: 180 }));
  }
  for (let j = 0; j <= (ENDS - 1) * p.bay; j++) {
    triglyphs.push(Triglyph({ key: 'tri-west-' + j, module: m, at: [-face, j * unit, z], turn: -90 }));
    triglyphs.push(Triglyph({ key: 'tri-east-' + j, module: m, at: [lx + face, j * unit, z], turn: 90 }));
  }
  return el('Group', {}, [...columns, ...triglyphs, ...scenery(m, lx, ly, pitch, p.explode)]);
});

function peristyle({ columns = 6, diameter = 900, bay = 2, explode = 1 }: PeristyleParams = {}) {
  const props = { key: 'temple', columns: Math.max(2, Math.round(columns)), module: diameter / 2, explode };
  const ev = new csg.Evaluator();
  const model = evaluateModel(resolve(Peristyle({ ...props, bay })), ev, {}, { shapes: true });
  const s1 = ev.cacheStats();
  // Identity is the key path. The recipe under each Translate is the shared part.
  const tally = (type: string): string => {
    const all = model.root.children.filter((c) => c.type === type);
    const recipes = new Set(all.map((c) => (c.geometry.kind === 'Translate' ? c.geometry.target : c.geometry).structuralHash));
    return all.length + ' ' + type + ' key paths share ' + recipes.size + ' recipe' + (recipes.size > 1 ? 's' : '');
  };
  console.log(tally('Column') + ', ' + tally('Triglyph'));
  console.log('first eval: ' + s1.misses + ' misses, ' + s1.hits + ' hits, ' + s1.entries + ' cache entries');

  // Respace the columns: each Translate is evaluated again, the fluted column never is.
  evaluateModel(resolve(Peristyle({ ...props, bay: bay + 1 })), ev);
  const s2 = ev.cacheStats();
  console.log('respaced: +' + (s2.misses - s1.misses) + ' misses, +' + (s2.hits - s1.hits) + ' hits (the fluted column is a pure hit)');

  // Colour by family. compound() copies the shapes, so the evaluator can free its cache.
  const groups = new Map<string, Shape[]>();
  for (const n of model.byKeyPath.values()) {
    if (!n.shape) continue;
    groups.set(n.type, [...(groups.get(n.type) ?? []), unwrap(n.shape)]);
  }
  const bodies = [...groups.entries()].map(([type, shapes]) => color(compound(shapes), COLORS[type] ?? '#f5f2ea'));
  ev[Symbol.dispose]();
  return bodies;
}

const COLORS: Record<string, string> = {
  Column: '#f5f2ea',
  Triglyph: '#12b5b0',
  Step: '#c3c9d1',
  Architrave: '#f5f2ea',
  Frieze: '#e4dfd2',
  Cornice: '#f5f2ea',
  Pediment: '#e4dfd2',
  Cella: '#d3a956',
  Roof: '#c8643c',
  Tile: '#a84f2d',
};

// ---- recipes: plain functions that return a csg node

// A profile in the (radius, height) half-plane, turned about the Z axis.
function lathe(points: ReadonlyArray<readonly [number, number]>): csg.IRNode {
  return csg.revolve(csg.polygon(points.map(([r, h]): [number, number, number] => [r, 0, h])));
}

function arc(cx: number, cy: number, r: number, from: number, to: number, steps: number): Array<[number, number]> {
  return Array.from({ length: steps + 1 }, (_, i): [number, number] => {
    const a = ((from + ((to - from) * i) / steps) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
}

function columnRecipe(m: number): csg.IRNode {
  const r0 = m;
  const r1 = TAPER * m;
  const shaftH = (ORDER.column - ORDER.base - ORDER.capital) * m;
  const z0 = ORDER.base * m;
  // Base: a square plinth, a torus and a fillet.
  const plinth = csg.translate(csg.box(2.7 * m, 2.7 * m, 0.45 * m), [-1.35 * m, -1.35 * m, 0]);
  const torus = lathe([[0, 0.45 * m], ...arc(1.1 * m, 0.65 * m, 0.2 * m, -90, 90, 6), [1.08 * m, 0.85 * m], [1.08 * m, z0], [0, z0]]);
  // Shaft: one tapered sector between two arrises, with one flute cut in it, then turned 20 times.
  const step = 360 / FLUTES;
  const sector = csg.revolve(csg.polygon([[0, 0, z0], [r0, 0, z0], [r1, 0, z0 + shaftH], [0, 0, z0 + shaftH]]), step);
  const lean = Math.atan(((r0 - r1) * FLUTE.centre) / shaftH);
  const tool = csg.translate(
    csg.rotate(csg.cone(FLUTE.radius * r0, FLUTE.radius * r1, shaftH / Math.cos(lean)), (-lean * 180) / Math.PI, { axis: [0, 1, 0] }),
    [FLUTE.centre * r0, 0, z0]
  );
  const fluted = csg.cut(sector, csg.rotate(tool, step / 2));
  const shaft = csg.compound(Array.from({ length: FLUTES }, (_, i) => csg.rotate(fluted, i * step)));
  // Capital: necking, annulet, echinus and a square abacus.
  const zc = z0 + shaftH;
  const echinus = lathe([
    [0, zc], [r1, zc], [r1, zc + 0.33 * m], [r1 + 0.07 * m, zc + 0.33 * m], [r1 + 0.07 * m, zc + 0.43 * m],
    ...arc(0.85 * m, zc + 0.7 * m, 0.33 * m, -80, 0, 5), [0, zc + 0.7 * m],
  ]);
  const abacus = csg.translate(csg.box(2.5 * m, 2.5 * m, 0.3 * m), [-1.25 * m, -1.25 * m, zc + 0.7 * m]);
  return csg.compound([plinth, torus, shaft, echinus, abacus]);
}

// Plan outline with two V channels and two half channels, extruded up, with a cap band.
function triglyphRecipe(m: number): csg.IRNode {
  const w = TRIGLYPH * m;
  const h = ORDER.frieze * m;
  const p = 0.14 * m;
  const v = 0.1 * m;
  const g = w / 10;
  const plan: Array<[number, number]> = [
    [-w / 2, 0], [-w / 2, -p + v], [-w / 2 + g, -p],
    [-w / 6 - g, -p], [-w / 6, -p + v], [-w / 6 + g, -p],
    [w / 6 - g, -p], [w / 6, -p + v], [w / 6 + g, -p],
    [w / 2 - g, -p], [w / 2, -p + v], [w / 2, 0],
  ];
  const body = csg.extrude(csg.polygon(plan.map(([x, y]): [number, number, number] => [x, y, 0])), [0, 0, 0.86 * h]);
  const cap = csg.translate(csg.box(w, p + 0.03 * m, 0.14 * h), [-w / 2, -p - 0.03 * m, 0.86 * h]);
  return csg.compound([body, cap]);
}

// A rectangular ring around the column axes: out is the overhang past the axes, inset is the inner face.
function ring(lx: number, ly: number, out: number, inset: number, z: number, h: number): csg.IRNode {
  const outer = csg.translate(csg.box(lx + 2 * out, ly + 2 * out, h), [-out, -out, z]);
  const inner = csg.translate(csg.box(lx - 2 * inset, ly - 2 * inset, h), [inset, inset, z]);
  return csg.cut(outer, inner);
}

const Part = (type: string) =>
  family<{ node: csg.IRNode; lift?: number }>(type, (p) => el('Geometry', { node: p.node, transform: [tTranslate([0, 0, p.lift ?? 0])] }));
const Step = Part('Step');
const Architrave = Part('Architrave');
const Frieze = Part('Frieze');
const Cornice = Part('Cornice');
const Pediment = Part('Pediment');
const Roof = Part('Roof');
const Cella = Part('Cella');
const Tile = family<{ node: csg.IRNode; at: Vec3 }>('Tile', (p) => el('Geometry', { node: p.node, transform: [tTranslate(p.at)] }));

// Steps, entablature, pediments and a tiled roof around the columns.
function scenery(m: number, lx: number, ly: number, pitch: number, explode: number): Element[] {
  const face = TAPER * m;
  const top = ORDER.column * m;
  const steps = Array.from({ length: STEP.count }, (_, k) => {
    const out = (STEP.margin + k * STEP.tread) * m;
    const node = csg.translate(csg.box(lx + 2 * out, ly + 2 * out, STEP.rise * m), [-out, -out, -(k + 1) * STEP.rise * m]);
    return Step({ key: 'step-' + k, node });
  });
  const zf = top + ORDER.architrave * m;
  const zc = zf + ORDER.frieze * m;
  const architrave = csg.compound([
    ring(lx, ly, face, face, top, 0.84 * m),
    ring(lx, ly, face + 0.1 * m, face, top + 0.84 * m, 0.16 * m),
  ]);
  const cornice = csg.compound([
    ring(lx, ly, face + 0.45 * m, face, zc, 0.4 * m),
    ring(lx, ly, face + ORDER.projection * m, face, zc + 0.4 * m, 0.7 * m),
    ring(lx, ly, face + (ORDER.projection + 0.2) * m, face, zc + 1.1 * m, 0.4 * m),
  ]);
  // Cella: the closed room inside the columns, with a doorway to the east.
  const room = csg.translate(csg.box(lx - 2 * pitch + 2 * face, ly - 2 * pitch + 2 * face, top), [pitch - face, pitch - face, 0]);
  const inside = csg.translate(csg.box(lx - 2 * pitch, ly - 2 * pitch, top), [pitch, pitch, 0]);
  const doorway = csg.translate(csg.box(4 * face, DOOR.width * m, DOOR.height * m), [lx - pitch - 2 * face, (ly - DOOR.width * m) / 2, 0]);
  const cella = csg.cutAll(room, [inside, doorway]);
  const up = LIFT * explode * m;
  // Roof: a chevron section along X. Each pediment is the wall under it at one end.
  const zr = zc + ORDER.cornice * m;
  const eave = face + (ORDER.projection + 0.2) * m;
  const slope = Math.tan((PITCH * Math.PI) / 180);
  const rise = slope * (ly / 2 + eave);
  const t = 0.3 * m;
  const yz = (pts: ReadonlyArray<readonly [number, number]>, x: number, len: number): csg.IRNode =>
    csg.extrude(csg.polygon(pts.map(([y, z]): [number, number, number] => [x, y, z])), [len, 0, 0]);
  const roof = yz(
    [[-eave, zr], [ly / 2, zr + rise], [ly + eave, zr], [ly + eave, zr + t], [ly / 2, zr + rise + t], [-eave, zr + t]],
    -eave,
    lx + 2 * eave
  );
  const low = slope * (eave - face);
  const wall: Array<[number, number]> = [[-face, zr], [ly + face, zr], [ly + face, zr + low], [ly / 2, zr + rise], [-face, zr + low]];
  // Cover tiles: one rib recipe for each slope, placed along the roof.
  const ribLen = (ly / 2 + eave) / Math.cos((PITCH * Math.PI) / 180);
  const rib = csg.translate(csg.box(0.22 * m, ribLen, 0.12 * m), [-0.11 * m, 0, 0]);
  const south = csg.translate(csg.rotate(rib, PITCH, { axis: [1, 0, 0] }), [0, -eave, zr + t]);
  const north = csg.translate(csg.rotate(csg.translate(rib, [0, -ribLen, 0]), -PITCH, { axis: [1, 0, 0] }), [0, ly + eave, zr + t]);
  const ribs = Math.floor((lx + 2 * eave - 0.6 * m) / (1.5 * m));
  const x0 = lx / 2 - (ribs * 1.5 * m) / 2;
  const tiles = Array.from({ length: ribs + 1 }, (_, i) => [
    Tile({ key: 'tile-south-' + i, node: south, at: [x0 + i * 1.5 * m, 0, up] }),
    Tile({ key: 'tile-north-' + i, node: north, at: [x0 + i * 1.5 * m, 0, up] }),
  ]).flat();
  return [
    ...steps,
    Architrave({ key: 'architrave', node: architrave }),
    Frieze({ key: 'frieze', node: ring(lx, ly, face, face, zf, ORDER.frieze * m) }),
    ...(lx > 2 * pitch ? [Cella({ key: 'cella', node: cella })] : []), // a short temple has no room
    Cornice({ key: 'cornice', node: cornice, lift: up }),
    Pediment({ key: 'pediment-west', node: yz(wall, -face, 2 * face), lift: up }),
    Pediment({ key: 'pediment-east', node: yz(wall, lx - face, 2 * face), lift: up }),
    Roof({ key: 'roof', node: roof, lift: up }),
    ...tiles,
  ];
}

export default peristyle();`,
  },
  {
    id: 'families-room',
    label: 'Room Composition',
    description:
      'A floor of hotel rooms shown as a plan cut. Room is a family composed from Wall, Door and Window, with a Bath family and the furniture inside it, and its group transform places the whole room as a unit: the south row is the same family turned half a turn. Key paths nest through the composition, down to suite/n1/bath/west/voids:door/fill/leaf, and rooms of equal width share their recipes. The door leaf and the mattress sizes are published figures. The plan, the walls and the furniture are a display model.',
    code: `import { compound, csg, unwrap } from 'brepjs/quick';
import { color } from 'brepjs/playground';
import { family, el, resolve, evaluateModel, tRotate, tTranslate, type Element } from 'brepjs-families';

// A floor of hotel rooms, composed from families and shown as a plan cut. Units are millimetres, Z is up.
// The door leaf and the mattress sizes are published figures. The plan, the walls and the furniture are a display model.
interface SuiteParams {
  widths?: readonly number[]; // room widths along the corridor: a room of 4 m or more gets the large bed
  cut?: number; // height of the plan cut: 2700 shows the full walls
  open?: number; // swing of the room doors in degrees
}

type Vec3 = readonly [number, number, number];
type Shape = Parameters<typeof compound>[0][number];

// ---- published figures
const LEAF = { width: 838, height: 1981, thickness: 44 }; // standard door leaf
const MATTRESS = { single: 900, large: 1600, length: 2000 }; // European sizes

// ---- display model
const ROOM = { depth: 5000, height: 2700, wall: 200 };
const BATH = { width: 1700, depth: 2200, wall: 100 };
const CORRIDOR = 1800;
const FRAME = 60; // window frame section
const GAP = 10; // between a door leaf and its hole
const WINDOW = { width: 1800, height: 1300, sill: 800 };

// The starter families (npx brepjs add room wall door), without their zod schemas. A wall is built
// along its own X with its outer face at y = 0, then turned into place. Its openings ride with it.
const Wall = family<{ length: number; height: number; thickness: number; at: Vec3; turn: number; voids?: readonly Element[] }>('Wall', (p) =>
  el('Box', {
    size: [p.length, p.thickness, p.height],
    voids: p.voids ?? [],
    transform: [tRotate(p.turn), tTranslate(p.at)],
  })
);
const Door = family<{ along: number; depth: number; cut: number; open: number }>(
  'Door',
  (p) =>
    el('Box', { size: [LEAF.width + 2 * GAP, p.depth, LEAF.height + GAP], transform: [tTranslate([p.along, 0, 0])] }, [
      Leaf({ key: 'leaf', height: Math.min(LEAF.height, p.cut), at: [GAP, p.depth - LEAF.thickness, 0], open: p.open }),
    ]),
  { role: 'fill' }
);

// A composed family depends on Wall and Door the way a component depends on its children. The group
// transform places the room as a unit: the walls, the bathroom and the furniture stay in room coordinates.
const Room = family<{ width: number; at: Vec3; turn: number; cut: number; open: number }>('Room', (p) => {
  const w = p.width;
  const d = ROOM.depth;
  const t = ROOM.wall;
  const shared = { height: Math.min(ROOM.height, p.cut), thickness: t };
  const window = Window({ key: 'window', along: (w - WINDOW.width) / 2, depth: t, cut: p.cut });
  return el('Group', { transform: [tRotate(p.turn), tTranslate(p.at)] }, [
    Wall({ key: 'south', ...shared, length: w, at: [0, 0, 0], turn: 0, voids: [Door({ key: 'door', along: t + 150, depth: t, cut: p.cut, open: p.open })] }),
    Wall({ key: 'north', ...shared, length: w, at: [w, d, 0], turn: 180, voids: [window] }),
    Wall({ key: 'east', ...shared, length: d - 2 * t, at: [w, t, 0], turn: 90 }),
    Wall({ key: 'west', ...shared, length: d - 2 * t, at: [0, d - t, 0], turn: 270 }),
    Floor({ key: 'floor', size: [w, d, 150], at: [0, 0, -150] }),
    // A second composed family in the first one: its key paths nest one level deeper.
    Bath({ key: 'bath', at: [w - t - BATH.width, t, 0], cut: p.cut }),
    ...furniture(w, p.cut),
  ]);
});

const Suite = family<{ items: readonly Element[] }>('Suite', (p) => el('Group', {}, p.items));

function suite({ widths = [4600, 3400, 4600], cut = 1200, open = 60 }: SuiteParams = {}) {
  // Two rows of rooms on a corridor. The south row is the same family, turned half a turn.
  const rooms: Element[] = [];
  let x = 0;
  widths.forEach((width, i) => {
    rooms.push(Room({ key: 'n' + (i + 1), width, at: [x, CORRIDOR / 2, 0], turn: 0, cut, open }));
    rooms.push(Room({ key: 's' + (i + 1), width, at: [x + width, -CORRIDOR / 2, 0], turn: 180, cut, open }));
    x += width;
  });
  const corridor = Carpet({ key: 'corridor', size: [x, CORRIDOR, 150], at: [0, -CORRIDOR / 2, -150] });
  const tree = resolve(Suite({ key: 'suite', items: [...rooms, corridor] }));

  const ev = new csg.Evaluator();
  const model = evaluateModel(tree, ev, {}, { shapes: true });

  // Key paths compose through the tree.
  const paths = [...model.byKeyPath.keys()];
  const deepest = paths.reduce((a, b) => (b.split('/').length > a.split('/').length ? b : a), '');
  if (!model.byKeyPath.has('suite/n1/south/voids:door')) throw new Error('door missing');
  const stats = ev.cacheStats();
  console.log(rooms.length + ' rooms, ' + paths.length + ' key paths, for example suite/n1/south/voids:door');
  console.log('deepest: ' + deepest);
  console.log('evaluator: ' + stats.misses + ' misses, ' + stats.hits + ' hits (equal rooms share their recipes)');

  // Colour by family. Opening, Door and Window nodes are the cut bodies of the holes and are not drawn.
  const groups = new Map<string, Shape[]>();
  for (const n of model.byKeyPath.values()) {
    if (COLORS[n.type] && n.shape) groups.set(n.type, [...(groups.get(n.type) ?? []), unwrap(n.shape)]);
  }
  const bodies = [...groups.entries()].map(([type, shapes]) => color(compound(shapes), COLORS[type] ?? '#f5f2ea'));
  ev[Symbol.dispose](); // compound() copied the shapes
  return bodies;
}

const COLORS: Record<string, string> = {
  Wall: '#f5f2ea',
  Floor: '#d3a956',
  Carpet: '#48515c',
  Leaf: '#12b5b0',
  Frame: '#c3c9d1',
  Glass: '#9fd3e6',
  Tile: '#c3c9d1',
  Fixture: '#f5f2ea',
  Timber: '#a67c52',
  Linen: '#f5f2ea',
  Blanket: '#12b5b0',
  Seat: '#ff5a1f',
  Steel: '#48515c',
};

// ---- the smaller families

const Block = (type: string) =>
  family<{ size: Vec3; at: Vec3 }>(type, (p) => el('Box', { size: p.size, transform: [tTranslate(p.at)] }));
const Floor = Block('Floor');
const Carpet = Block('Carpet');
const Glass = Block('Glass');
const Tile = Block('Tile');
const Fixture = Block('Fixture');
const Timber = Block('Timber');
const Linen = Block('Linen');
const Blanket = Block('Blanket');
const Seat = Block('Seat');
const Steel = Block('Steel');

// The leaf turns about its hinge edge and swings into the room.
const Leaf = family<{ height: number; at: Vec3; open: number }>('Leaf', (p) =>
  el('Box', {
    size: [LEAF.width, LEAF.thickness, p.height],
    transform: [tRotate(p.open, { at: [0, LEAF.thickness, 0] }), tTranslate(p.at)],
  })
);

// A window is a hole with a frame and a pane. The plan cut can go through it.
const Frame = family<{ width: number; height: number; depth: number; top: boolean }>('Frame', (p) => {
  const outer = csg.translate(csg.box(p.width, p.depth, p.height), [0, 60, 0]);
  const inner = csg.translate(csg.box(p.width - 2 * FRAME, p.depth, p.height - (p.top ? 2 : 1) * FRAME + (p.top ? 0 : 1)), [FRAME, 60, FRAME]);
  return el('Geometry', { node: csg.cut(outer, inner) });
});
const Window = family<{ along: number; depth: number; cut: number }>(
  'Window',
  (p) => {
    const seen = Math.min(WINDOW.height, p.cut - WINDOW.sill); // the part below the plan cut
    const parts =
      seen > FRAME
        ? [
            Frame({ key: 'frame', width: WINDOW.width, height: seen, depth: 80, top: seen === WINDOW.height }),
            Glass({ key: 'glass', size: [WINDOW.width - 2 * FRAME, 20, seen - (seen === WINDOW.height ? 2 : 1) * FRAME], at: [FRAME, 90, FRAME] }),
          ]
        : [];
    return el('Box', { size: [WINDOW.width, p.depth, WINDOW.height], transform: [tTranslate([p.along, 0, WINDOW.sill])] }, parts);
  },
  { role: 'fill' }
);

// Bathroom: two thin walls in the corner of the room, a door, and the fixtures.
const Bath = family<{ at: Vec3; cut: number }>('Bath', (p) => {
  const b = BATH;
  const h = Math.min(ROOM.height, p.cut);
  const clip = (z: number): number => Math.min(z, p.cut);
  const inner = b.width - b.wall;
  return el('Group', { transform: [tTranslate(p.at)] }, [
    Wall({ key: 'west', length: b.depth, height: h, thickness: b.wall, at: [b.wall, 0, 0], turn: 90, voids: [Door({ key: 'door', along: 700, depth: b.wall, cut: p.cut, open: 75 })] }),
    Wall({ key: 'north', length: b.width, height: h, thickness: b.wall, at: [0, b.depth, 0], turn: 0 }),
    Tile({ key: 'tiles', size: [inner, b.depth, 15], at: [b.wall, 0, 0] }),
    Fixture({ key: 'tray', size: [900, 900, 60], at: [b.width - 900, 0, 15] }),
    Glass({ key: 'screen', size: [10, 900, clip(2000) - 15], at: [b.width - 910, 0, 15] }),
    Fixture({ key: 'pan', size: [380, 560, 400], at: [b.width - 380 - 200, b.depth - 560, 15] }),
    Fixture({ key: 'cistern', size: [380, 180, 380], at: [b.width - 380 - 200, b.depth - 180, 415] }),
    Fixture({ key: 'basin', size: [520, 400, 160], at: [b.wall + 80, b.depth - 400, 700] }),
    Timber({ key: 'vanity', size: [520, 380, 685], at: [b.wall + 80, b.depth - 380, 15] }),
  ]);
});

// Furniture in room coordinates. It follows the width of the room.
function furniture(w: number, cut: number): Element[] {
  const t = ROOM.wall;
  const d = ROOM.depth;
  const wide = w >= 4000;
  const bed = wide ? MATTRESS.large : MATTRESS.single;
  const y1 = 4100; // far side of the bed
  const y0 = y1 - bed;
  const head = t + 50;
  const pillows = wide ? [y0 + 150, y1 - 650] : [y0 + 200];
  const table = (key: string, y: number): Element => Timber({ key, size: [450, 400, 500], at: [t, y, 0] });
  const dx = w - t - 1300; // desk
  const leg = (key: string, x: number, y: number, h: number): Element => Steel({ key, size: [40, 40, h], at: [x, y, 0] });
  const cx = dx + 375; // chair
  const cy = d - t - 600 - 520;
  return [
    Timber({ key: 'headboard', size: [50, bed, 1000], at: [t, y0, 0] }),
    Timber({ key: 'bed-base', size: [MATTRESS.length, bed, 300], at: [head, y0, 0] }),
    Linen({ key: 'mattress', size: [MATTRESS.length, bed, 220], at: [head, y0, 300] }),
    Blanket({ key: 'blanket', size: [1250, bed, 30], at: [head + MATTRESS.length - 1250, y0, 520] }),
    ...pillows.map((y, i) => Fixture({ key: 'pillow-' + i, size: [380, 500, 110], at: [head + 80, y, 520] })),
    table('table-north', y1),
    ...(wide ? [table('table-south', y0 - 400)] : []),
    Timber({ key: 'desk-top', size: [1200, 600, 30], at: [dx, d - t - 600, 710] }),
    leg('desk-leg-0', dx, d - t - 600, 710),
    leg('desk-leg-1', dx + 1160, d - t - 600, 710),
    leg('desk-leg-2', dx, d - t - 40, 710),
    leg('desk-leg-3', dx + 1160, d - t - 40, 710),
    Seat({ key: 'chair-seat', size: [450, 450, 50], at: [cx, cy, 410] }),
    Seat({ key: 'chair-back', size: [450, 40, 420], at: [cx, cy, 460] }),
    leg('chair-leg-0', cx, cy, 410),
    leg('chair-leg-1', cx + 410, cy, 410),
    leg('chair-leg-2', cx, cy + 410, 410),
    leg('chair-leg-3', cx + 410, cy + 410, 410),
    Timber({ key: 'wardrobe', size: [1000, 600, Math.min(2000, cut)], at: [w - t - 1000, t + BATH.depth + BATH.wall, 0] }),
  ];
}

export default suite();`,
  },
  {
    id: 'families-structure',
    label: 'Declarative Steel Frame',
    description:
      'A steel frame on two storeys, authored as one tree of families and projected through familiesToBim: pad footings, HE 200 A columns, IPE 300 primary beams, IPE 200 joists and purlins, a deck, guard rails, a gable roof and a switchback stair in an open well. Each member has a GlobalId derived from its key path, so the order of the tree does not change the exported IFC. The kernel takes off the steel and compares it with the catalogue masses. The sections, their masses and the stair figures are published. The grid, the stacked framing, the deck and the roof are a display model.',
    code: `import { compound, csg, measureVolume, unwrap } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';
import { family, el, resolve, tTranslate, type Element } from 'brepjs-families';
import { familiesToBim, placedSolids, toIfc } from 'brepjs-bim';

// A steel frame on two storeys, authored as one tree of families and projected through familiesToBim.
// Units are millimetres, Z is up. The sections, their masses and the stair figures are published.
// The grid, the stacked framing, the deck and the roof are a display model.
interface FrameParams {
  bays?: number; // 6 m bays along X: the stair is in the last one
  roofed?: number; // bays that have their roof, from the west end
}

type Vec3 = readonly [number, number, number];
type Shape = Parameters<typeof compound>[0][number];
type Section = { kind: 'I_BEAM'; overallWidth: number; overallDepth: number; flangeThickness: number; webThickness: number };
type Profile = Section | { kind: 'RECTANGULAR'; width: number; height: number };
const X: Vec3 = [1, 0, 0];
const Y: Vec3 = [0, 1, 0];

// ---- published figures
const HEA200: Section = { kind: 'I_BEAM', overallWidth: 200, overallDepth: 190, flangeThickness: 10, webThickness: 6.5 };
const IPE300: Section = { kind: 'I_BEAM', overallWidth: 150, overallDepth: 300, flangeThickness: 10.7, webThickness: 7.1 };
const IPE200: Section = { kind: 'I_BEAM', overallWidth: 100, overallDepth: 200, flangeThickness: 8.5, webThickness: 5.6 };
const KG_PER_M: Record<number, number> = { 190: 42.3, 300: 42.2, 200: 22.4 }; // catalogue masses, by section depth
const STEEL = 7850e-9; // kg for each cubic millimetre
const STAIR = { rise: 170, going: 280, risers: 10, landing: 1200 }; // general access stair: 12 risers at most in a flight

// ---- display model
const BAY = 6000; // along X
const DEPTH = 6000; // along Y
const STOREY = 2 * STAIR.risers * STAIR.rise; // floor to floor
const JOIST = 2000; // spacing of the secondary beams
const DECK = 130;
const PLATE = 20;
const POST: Profile = { kind: 'RECTANGULAR', width: 100, height: 100 };
const GUARD = { height: 1100, thickness: 50 };

// Section outline centred on the member axis. The root radii of the rolled sections are left out.
const outline = (p: Profile): ReadonlyArray<readonly [number, number]> => {
  if (p.kind === 'RECTANGULAR') {
    const [w, h] = [p.width / 2, p.height / 2];
    return [[-w, -h], [w, -h], [w, h], [-w, h]];
  }
  const [w, d, t] = [p.overallWidth / 2, p.overallDepth / 2, p.webThickness / 2];
  const f = d - p.flangeThickness;
  return [[-w, -d], [w, -d], [w, -f], [t, -f], [t, f], [w, f], [w, d], [-w, d], [-w, f], [-t, f], [-t, -f], [-w, -f]];
};

// The families are the registry starters (npx brepjs add column beam slab roof stair), without their
// zod schemas. The prop names feed the IFC specs 1:1, and each render makes the same solid as its spec.
const Column = family<{ height: number; profile: Profile; at: Vec3; materialName: string }>('Column', (p) =>
  el('Geometry', {
    node: csg.extrude(csg.polygon(outline(p.profile).map(([u, v]): [number, number, number] => [u, v, 0])), [0, 0, p.height]),
    transform: [tTranslate(p.at)],
  })
);

// A beam runs from its origin along axisX. The width of its section goes along axisZ x axisX.
const Beam = family<{ length: number; profile: Profile; at: Vec3; axisX: Vec3; predefinedType: 'BEAM' | 'JOIST' | 'PURLIN'; materialName: string }>('Beam', (p) => {
  const a = p.axisX;
  const section = outline(p.profile).map(([u, v]): [number, number, number] => [-u * a[1], u * a[0], v]);
  return el('Geometry', { node: csg.extrude(csg.polygon(section), [a[0] * p.length, a[1] * p.length, 0]), transform: [tTranslate(p.at)] });
});

const Slab = family<{ length: number; width: number; thickness: number; at: Vec3; predefinedType: 'FLOOR' | 'LANDING' | 'BASESLAB'; materialName: string }>(
  'Slab',
  (p) => el('Box', { size: [p.length, p.width, p.thickness], transform: [tTranslate(p.at)] })
);

// The pitch prop makes the IFC roof a gable: a house section in the local YZ plane, swept along X.
const Roof = family<{ length: number; width: number; thickness: number; at: Vec3; predefinedType: 'GABLE_ROOF'; pitch: number; materialName: string }>('Roof', (p) => {
  const ridge = (p.width / 2) * Math.tan((p.pitch * Math.PI) / 180);
  const section = csg.polygon([[0, 0, 0], [0, p.width, 0], [0, p.width, p.thickness], [0, p.width / 2, p.thickness + ridge], [0, 0, p.thickness]]);
  return el('Geometry', { node: csg.extrude(section, [p.length, 0, 0]), transform: [tTranslate(p.at)] });
});

// One stepped solid for each flight. A flight has its own placement, so a switchback is two flights
// that look in opposite directions. The width of a flight goes along axisZ x axisX.
type Flight = { width: number; riserHeight: number; treadLength: number; numberOfRisers: number; origin: Vec3; axisX: Vec3; axisZ: Vec3; materialName: string };
const Stair = family<{ flights: readonly Flight[]; at: Vec3; predefinedType: 'HALF_TURN_STAIR'; materialName: string }>('Stair', (p) => {
  const flight = (f: Flight): csg.IRNode => {
    const at = (run: number, z: number): [number, number, number] => [f.origin[0] + run * f.axisX[0], f.origin[1] + run * f.axisX[1], f.origin[2] + z];
    const pts = [at(0, 0)];
    for (let i = 1; i <= f.numberOfRisers; i++) pts.push(at((i - 1) * f.treadLength, i * f.riserHeight), at(i * f.treadLength, i * f.riserHeight));
    pts.push(at(f.numberOfRisers * f.treadLength, 0));
    return csg.extrude(csg.polygon(pts), [-f.axisX[1] * f.width, f.axisX[0] * f.width, 0]);
  };
  return el('Geometry', { node: csg.compound(p.flights.map(flight)), transform: [tTranslate(p.at)] });
});

const Storey = family<{ elevation: number; items: readonly Element[] }>('Storey', (p) => el('Group', {}, p.items));
const Frame = family<{ storeys: readonly Element[] }>('Frame', (p) => el('Group', {}, p.storeys));

function tree(bays: number, roofed: number) {
  const length = bays * BAY;
  const grid = Array.from({ length: bays + 1 }, (_, i) => [0, DEPTH].map((y): [string, number, number] => [i + '-' + (y > 0 ? 'n' : 's'), i * BAY, y])).flat();
  const lines = Array.from({ length: (bays * BAY) / JOIST + 1 }, (_, k) => k * JOIST);
  const [hw, hd] = [HEA200.overallWidth / 2, HEA200.overallDepth / 2]; // half the column section
  const steel = { materialName: 'Steel S355' };
  // Primary beams run between the column faces. zc is the level of the beam axis in its storey.
  const primaries = (zc: number): Element[] =>
    grid.filter(([, x]) => x < length).map(([key, x, y]) => Beam({ key: 'beam-' + key, length: BAY - 2 * hw, profile: IPE300, at: [x + hw, y, zc], axisX: X, predefinedType: 'BEAM', ...steel }));
  const well = { x0: length - JOIST + 50, x1: length - 50, top: 400 + STAIR.landing + STAIR.risers * STAIR.going }; // the stair strip
  const rail = { ...GUARD, infill: 'POSTED' as const, predefinedType: 'GUARDRAIL' as const, ...steel };
  const g = GUARD.thickness;
  return resolve(
    Frame({
      key: 'frame',
      storeys: [
        Storey({
          key: 'level-0',
          elevation: 0,
          items: [
            Slab({ key: 'ground', length: length + 800, width: DEPTH + 800, thickness: 150, at: [-400, -400, -150], predefinedType: 'BASESLAB', materialName: 'Concrete' }),
            ...grid.flatMap(([key, x, y]) => [
              Footing({ key: 'footing-' + key, length: 1400, width: 1400, thickness: 500, at: [x - 700, y - 700, -650], predefinedType: 'PAD_FOOTING', materialName: 'Concrete' }),
              BasePlate({ key: 'plate-' + key, size: [340, 340, PLATE], at: [x - 170, y - 170, 0], ...steel }),
              Column({ key: 'col-' + key, height: 2 * STOREY - 200 - PLATE, profile: HEA200, at: [x, y, PLATE], ...steel }),
            ]),
            ...stair(well.x0, well.x1),
          ],
        }),
        Storey({
          key: 'level-1',
          elevation: STOREY,
          items: [
            ...primaries(-DECK - 200 - 150),
            // Joists bear on the primary beams. On a column line they stop at the column faces.
            ...lines.map((x, k) =>
              x % BAY === 0
                ? Beam({ key: 'joist-' + k, length: DEPTH - 2 * hd, profile: IPE200, at: [x, hd, -DECK - 100], axisX: Y, predefinedType: 'JOIST', ...steel })
                : Beam({ key: 'joist-' + k, length: DEPTH + 150, profile: IPE200, at: [x, -75, -DECK - 100], axisX: Y, predefinedType: 'JOIST', ...steel })
            ),
            // The deck stops at the stair strip, so the flights are in an open well.
            Slab({ key: 'deck', length: well.x0 + 50, width: DEPTH - 2 * hd, thickness: DECK, at: [-50, hd, -DECK], predefinedType: 'FLOOR', materialName: 'Concrete' }),
            Slab({ key: 'deck-stair', length: JOIST, width: DEPTH - hd - well.top, thickness: DECK, at: [well.x0, well.top, -DECK], predefinedType: 'FLOOR', materialName: 'Concrete' }),
            Railing({ key: 'guard-south', ...rail, length: well.x0 + 50, at: [-50, hd, 0], axisX: X }),
            Railing({ key: 'guard-north', ...rail, length: length + 100, at: [-50, DEPTH - hd - g, 0], axisX: X }),
            Railing({ key: 'guard-west', ...rail, length: DEPTH - 2 * hd - 2 * g, at: [0, hd + g, 0], axisX: Y }),
            Railing({ key: 'guard-well', ...rail, length: well.top - hd - g, at: [well.x0, hd + g, 0], axisX: Y }),
            Railing({ key: 'guard-east', ...rail, length: DEPTH - hd - g - well.top, at: [length + 50, well.top, 0], axisX: Y }),
          ],
        }),
        Storey({
          key: 'level-2',
          elevation: 2 * STOREY,
          items: [
            ...primaries(-200 - 150),
            ...lines.map((x, k) => Beam({ key: 'purlin-' + k, length: DEPTH + 150, profile: IPE200, at: [x, -75, -100], axisX: Y, predefinedType: 'PURLIN', ...steel })),
            ...(roofed > 0
              ? [Roof({ key: 'roof', length: roofed * BAY + 400, width: DEPTH + 750, thickness: 80, at: [-350, -375, 0], predefinedType: 'GABLE_ROOF', pitch: 8, materialName: 'Insulated panel' })]
              : []),
          ],
        }),
      ],
    })
  );
}

function frame({ bays = 2, roofed = 1 }: FrameParams = {}) {
  const count = Math.max(1, Math.round(bays));
  // Project onto a BimModel: storeys, footings, columns, beams, slabs, roof, stair and railings, each
  // with a GlobalId derived from its key path. BasePlate has no IFC mapping and goes out as a proxy.
  const ev = new csg.Evaluator();
  const projected = familiesToBim(tree(count, Math.min(count, Math.max(0, Math.round(roofed)))), {
    project: { name: 'Declarative steel frame', projectId: 'families-structure' },
    siteName: 'Site',
    buildingName: 'Block A',
    proxyEvaluator: ev,
  });
  if (!projected.ok) throw projected.error;
  const { model, idByKeyPath } = projected.value;
  ev[Symbol.dispose]();

  // Draw each element where its IFC placement says, in the frame of its storey, and take off the steel.
  const groups = new Map<string, Shape[]>();
  const temp: Shape[] = [];
  let kernelKg = 0;
  let catalogueKg = 0;
  for (const [path, id] of idByKeyPath) {
    const element = model.getElement(id);
    if (!element) continue;
    const level = Number(path.split('/')[1]?.slice(-1) ?? 0);
    const solids = unwrap(placedSolids(element, { parentFrame: { origin: [0, 0, level * STOREY], axisX: [1, 0, 0], axisZ: [0, 0, 1] } }));
    temp.push(...solids);
    let tone: string = element.category;
    if (element.category === 'BEAM' || element.category === 'COLUMN') {
      const profile = element.spec.profile;
      const kg = profile.kind === 'I_BEAM' ? KG_PER_M[profile.overallDepth] : undefined;
      if (kg !== undefined) {
        kernelKg += solids.reduce((sum, s) => sum + unwrap(measureVolume(s)), 0) * STEEL;
        catalogueKg += (kg * (element.category === 'BEAM' ? element.spec.length : element.spec.height)) / 1000; // length in metres
      }
      if (element.category === 'BEAM' && element.spec.predefinedType !== 'BEAM') tone = 'JOIST';
    }
    if (solids.length > 0) groups.set(tone, [...(groups.get(tone) ?? []), ...solids]);
  }
  const sample = 'frame/level-1/joist-1';
  const sampleId = idByKeyPath.get(sample);
  const guid = sampleId === undefined ? undefined : model.getElement(sampleId)?.guid;
  console.log(model.getColumns().length + ' columns, ' + model.getBeams().length + ' beams, ' + model.getSlabs().length + ' slabs, ' + model.getRailings().length + ' railings, ' + model.getStairs().length + ' stair, ' + model.getRoofs().length + ' roof');
  console.log(sample + ' has the GlobalId ' + guid + ': it comes from the key path, not from the order');
  console.log('Steel: ' + (kernelKg / 1000).toFixed(2) + ' t from the kernel volumes. The catalogue masses give ' + (catalogueKg / 1000).toFixed(2) + ' t: the model has no root radii.');

  const bodies = [...groups.entries()].map(([tone, shapes]) => color(compound(shapes), COLORS[tone] ?? '#c3c9d1'));
  temp.forEach((s) => s.delete()); // compound() copied the solids
  return { model, bodies };
}

const COLORS: Record<string, string> = {
  COLUMN: '#ff5a1f',
  BEAM: '#ff5a1f',
  JOIST: '#c3c9d1',
  SLAB: '#f5f2ea',
  FOOTING: '#b9b4a8',
  STAIR: '#d8d4c8',
  RAILING: '#12b5b0',
  ROOF: '#48515c',
  PROXY: '#48515c',
};

// ---- the rest of the families

const Footing = family<{ length: number; width: number; thickness: number; at: Vec3; predefinedType: 'PAD_FOOTING'; materialName: string }>('Footing', (p) =>
  el('Box', { size: [p.length, p.width, p.thickness], transform: [tTranslate(p.at)] })
);
const BasePlate = family<{ size: Vec3; at: Vec3; materialName: string }>('BasePlate', (p) => el('Box', { size: p.size, transform: [tTranslate(p.at)] }));

// A guard rail runs from its origin along axisX, with its thickness along axisZ x axisX.
const Railing = family<{ length: number; height: number; thickness: number; at: Vec3; axisX: Vec3; infill: 'POSTED'; predefinedType: 'GUARDRAIL'; materialName: string }>('Railing', (p) => {
  const a = p.axisX;
  const pt = (u: number, v: number): [number, number, number] => [u * a[0] - v * a[1], u * a[1] + v * a[0], 0];
  const base = csg.polygon([pt(0, 0), pt(p.length, 0), pt(p.length, p.thickness), pt(0, p.thickness)]);
  return el('Geometry', { node: csg.extrude(base, [0, 0, p.height]), transform: [tTranslate(p.at)] });
});

// Switchback stair between two joists: up to a landing on two posts, then back to the deck.
function stair(x0: number, x1: number): Element[] {
  const half = STAIR.risers * STAIR.rise;
  const y0 = 400; // near edge of the landing
  const y1 = y0 + STAIR.landing;
  const run = STAIR.risers * STAIR.going;
  const flight = { width: (x1 - x0 - 100) / 2, riserHeight: STAIR.rise, treadLength: STAIR.going, numberOfRisers: STAIR.risers, axisZ: [0, 0, 1] as Vec3, materialName: 'Concrete' };
  const post = (key: string, x: number): Element => Column({ key, height: half - 150, profile: POST, at: [x, y0 + 50, 0], materialName: 'Steel S355' });
  return [
    Stair({
      key: 'stair',
      at: [0, 0, 0],
      predefinedType: 'HALF_TURN_STAIR',
      materialName: 'Concrete',
      flights: [
        { ...flight, origin: [x0, y1 + run, 0], axisX: [0, -1, 0] },
        { ...flight, origin: [x1, y1, half], axisX: [0, 1, 0] },
      ],
    }),
    Slab({ key: 'landing', length: x1 - x0, width: STAIR.landing, thickness: 150, at: [x0, y0, half - 150], predefinedType: 'LANDING', materialName: 'Concrete' }),
    post('landing-post-w', x0 + 50),
    post('landing-post-e', x1 - 50),
  ];
}

const built = frame();

export default present(built.bodies, {
  bimTree: built.model.toTreeSummary(),
  ifc: async () => {
    const r = await toIfc(built.model, { applicationName: 'brepjs playground', applicationVersion: '1.0' });
    if (!r.ok) throw r.error;
    return r.value;
  },
});`,
  },
];
