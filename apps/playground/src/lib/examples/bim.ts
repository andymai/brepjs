/**
 * BIM examples — parametric IFC4 building elements authored with the
 * `brepjs-bim` domain package. Each builds a `BimModel`, reads element geometry
 * back out for display, and could serialize to IFC via `toIfc`. See the
 * module-authoring rules in ./types.
 */
import type { Example } from './types';

export const BIM_EXAMPLES: readonly Example[] = [
  {
    id: 'bim-steel-beam',
    label: 'Steel Floor Beam',
    description:
      'A steel floor beam as a BIM model: an IfcBeam with a rolled I profile between two column stubs, with fin plates, bolts, shear studs and a strip of the slab with its mesh. The sections, the fin plate, the bolts, the studs and the mesh are published figures, and the kernel measures the mass of the beam for each metre against the section table. The view shows each M20 bolt as a screw with a helical thread in its nut, and the IFC file keeps it as a plain proxy. The span, the column stubs and the slab strip are a display model.',
    code: `import { BimModel, placedSolids, toIfc } from 'brepjs-bim';
import { box, clone, compound, cutAll, cylinder, extrude, fuseAll, getSolids, line, loft, measureVolume, polygon, rotate, translate, unwrap, wire } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';

// Steel floor beam as a BIM model: an IfcBeam with a rolled I profile between two column stubs, with its fin
// plates, bolts, shear studs and a strip of the slab with its mesh. The sections, the fin plate, the bolts, the
// studs and the mesh are published figures. The span, the stubs and the slab strip are a display model.
// Units are millimetres. Y is along the beam and z = 0 is the top of the steel.
interface BeamParams {
  section?: Size; // the beam, from the IPE series
  span?: number; // distance between the column lines
  slab?: number; // part of the slab width to show, 0 to 1. The IFC file keeps the whole slab
}

// ---- published figures
// European rolled sections: depth, width, web, flange, root radius, and the table mass in kg for each metre.
const IPE = {
  'IPE 240': { h: 240, b: 120, tw: 6.2, tf: 9.8, r: 15, kg: 30.7 },
  'IPE 300': { h: 300, b: 150, tw: 7.1, tf: 10.7, r: 15, kg: 42.2 },
  'IPE 400': { h: 400, b: 180, tw: 8.6, tf: 13.5, r: 21, kg: 66.3 },
};
type Size = keyof typeof IPE;
const HE200B = { h: 200, b: 200, tw: 9, tf: 15, r: 18 };
const STEEL = 7850e-9; // kg in each mm3
// Standard fin plate: a 10 mm plate, M20 bolts in 22 mm holes at 70 mm centres, 10 mm between beam and column.
const FIN = { plate: 10, width: 100, hole: 22, pitch: 70, end: 40, edge: 50, gap: 10, top: 50 };
const M20 = { d: 20, minor: 17.294, pitch: 2.5, flats: 30, head: 12.5, nut: 18, washer: 37, washerHole: 21, washerT: 3 }; // metric coarse thread, right hand
const STUD = { d: 19, height: 100, head: 32, headT: 10 }; // 100 mm high after it is welded to the flange
const MESH = { wire: 6, pitch: 200 }; // fabric A142: 6 mm wires at 200 mm centres, both ways

// ---- display model
const STUB = { below: 320, above: 320 }; // the columns go on: the model shows a piece of each
const STRIP = { width: 800, depth: 150, studPitch: 190, cover: 30 };
const PLAY = 0.1; // radial play between the thread of a bolt and of its nut
const COLORS = { beam: '#12b5b0', column: '#c3c9d1', plate: '#ff5a1f', bolt: '#f5f2ea', stud: '#d3a956', mesh: '#a8623f', slab: '#cfcabb' };
type Tone = keyof typeof COLORS;
type P3 = [number, number, number];
type Body = ReturnType<typeof box>;
type Id = Extract<ReturnType<BimModel['addBeam']>, { ok: true }>['value']; // the id of an element in the model
const X: P3 = [1, 0, 0], Y: P3 = [0, 1, 0], Z: P3 = [0, 0, 1];

function beamModel({ section = 'IPE 300', span = 2000, slab = 0.5 }: BeamParams = {}) {
  const model = new BimModel(), owned: { delete(): void }[] = [];
  const own = <T extends { delete(): void }>(s: T): T => { owned.push(s); return s; };
  try {
    model.init({ name: 'Beam example' });
    // The spatial structure makes this a BIM model: project, site, building, storey.
    const project = model.getProject();
    const site = unwrap(model.addSite({ name: 'Site' }));
    const building = unwrap(model.addBuilding({ name: 'Building' }));
    const storey = unwrap(model.addStorey({ name: 'Level 1', elevation: 0 }));
    if (project) model.aggregate(project.localId, site);
    model.aggregate(site, building);
    model.aggregate(building, storey);
    const tones = new Map<Id, Tone>();
    const put = (tone: Tone, made: ReturnType<BimModel['addBeam']>): Id => {
      const id = unwrap(made);
      model.placeIn(id, storey);
      tones.set(id, tone);
      return id;
    };

    // The beam. The profile carries the figures of the section table. filletRadius is the root radius between the
    // web and the flanges. The beam stops 10 mm short of each column face.
    const s = IPE[section], face = span / 2 - HE200B.h / 2, length = 2 * (face - FIN.gap);
    const beam = put('beam', model.addBeam({
      length,
      profile: { kind: 'I_BEAM', overallWidth: s.b, overallDepth: s.h, flangeThickness: s.tf, webThickness: s.tw, filletRadius: s.r },
      origin: [0, -length / 2, -s.h / 2],
      axisX: Y,
      axisZ: Z,
      materialName: 'Steel S355',
    }));

    // Two column stubs. Their flanges face the beam.
    const column = { kind: 'I_BEAM', overallWidth: HE200B.b, overallDepth: HE200B.h, flangeThickness: HE200B.tf, webThickness: HE200B.tw, filletRadius: HE200B.r } as const;
    for (const side of [-1, 1])
      put('column', model.addColumn({ height: s.h + STUB.below + STUB.above, profile: column, origin: [0, side * span / 2, -s.h - STUB.below], axisX: X, axisZ: Z, materialName: 'Steel S355' }));

    // A slab strip on the top flange, between the column faces.
    const deck = put('slab', model.addSlab({ length: STRIP.width, width: 2 * face, thickness: STRIP.depth, origin: [-STRIP.width / 2, -face, 0], axisX: X, axisZ: Z, predefinedType: 'FLOOR', materialName: 'Concrete C30/37' }));

    // Parts with no class in this library go in as proxies: the model owns their solids.
    // A boolean gives a compound, and a proxy takes a solid: one() copies the solid out.
    const one = (shape: Parameters<typeof getSolids>[0]): Body => unwrap(clone(getSolids(own(shape))[0]!)) as Body;
    const part = (tone: Tone, name: string, solid: Body, materialName: string): Id => put(tone, model.addProxy({ name, solid, materialName }));
    const hex = (flats: number, x: number, depth: number): Body => {
      const r = flats / Math.sqrt(3);
      const ring = own(unwrap(polygon(Array.from({ length: 6 }, (_, i): P3 => [x, r * Math.cos(i * Math.PI / 3), r * Math.sin(i * Math.PI / 3)]))));
      return own(unwrap(extrude(ring, [depth, 0, 0]))) as Body;
    };
    // One bolt along X, with x = 0 at the outer face of the plate: washer and head, shank, washer and nut.
    const grip = FIN.plate + s.tw, w = M20.washerT, shank = grip + w + M20.nut + 8;
    const bolt = own(one(unwrap(fuseAll([
      own(cylinder(M20.washer / 2, w, { axis: X })), hex(M20.flats, w, M20.head),
      own(cylinder(M20.d / 2, shank, { at: [-shank, 0, 0], axis: X })),
      own(cylinder(M20.washer / 2, w, { at: [-grip - w, 0, 0], axis: X })), hex(M20.flats, -grip - w - M20.nut, M20.nut),
    ]))));
    // The view draws each bolt as a real screw: a core with one helical tooth, and a nut with the mating tooth, half a
    // pitch out of phase. The proxy in the IFC file keeps the plain solid above. A tooth is a smooth loft about Z, turned to X.
    const tooth = (core: number, tip: number, from: number, to: number, ref: number): Body => {
      const root = tip > core ? core / 0.998 : core * 0.998, half = 0.42 * M20.pitch; // a hair clear of the core or the bore
      const start = from + half, span = to - from - 2 * half, pieces = Math.ceil(span / (4 * M20.pitch));
      const n = Math.round(span / pieces / M20.pitch * 24); // 24 loft sections in each turn
      const section = (z: number) => {
        const a = 2 * Math.PI * (z - ref) / M20.pitch;
        const pts = [[root, -half], [tip, 0], [root, half]].map(([r, dz]): P3 => [r! * Math.cos(a), r! * Math.sin(a), z + dz!]);
        return own(unwrap(wire(pts.map((q, i) => own(line(q, pts[(i + 1) % 3]!))))));
      };
      // A row of lofts of 4 turns or less, end to end on one helix: a long loft is slow to mesh.
      const lofts = Array.from({ length: pieces }, (_, k) => own(unwrap(loft(Array.from({ length: n + 1 }, (_, j) => section(start + span * (k + j / n) / pieces)), { ruled: false }))));
      return own(rotate(own(compound(lofts)), 90, { axis: Y })) as Body;
    };
    const bore = M20.d / 2 + PLAY, nutX = -grip - w - M20.nut;
    const drilled = (body: Body, r: number, x: number, depth: number): Body => own(unwrap(cutAll(body, [own(cylinder(r, depth + 2, { at: [x - 1, 0, 0], axis: X }))]))) as Body;
    const washer = (x: number): Body => drilled(own(cylinder(M20.washer / 2, w, { at: [x, 0, 0], axis: X })), M20.washerHole / 2, x, w);
    const screw = own(compound([
      washer(0), hex(M20.flats, w, M20.head), own(cylinder(M20.minor / 2, shank + w, { at: [-shank, 0, 0], axis: X })), tooth(M20.minor / 2, M20.d / 2, -shank, w, 0),
      washer(-grip - w), drilled(hex(M20.flats, nutX, M20.nut), bore, nutX, M20.nut), tooth(bore, M20.minor / 2 + PLAY, nutX, nutX + M20.nut, M20.pitch / 2),
    ]));
    const boltAt: P3[] = [];
    // A fin plate on each column, on the +X side of the web. Its depth is 0.6 of the beam depth or more.
    const rows = Math.ceil((0.6 * s.h - 2 * FIN.end) / FIN.pitch) + 1, depth = (rows - 1) * FIN.pitch + 2 * FIN.end;
    const holes: Body[] = [];
    for (const side of [-1, 1]) {
      const at = (i: number): P3 => [s.tw / 2 + FIN.plate, side * (face - FIN.edge), -FIN.top - FIN.end - i * FIN.pitch];
      const blank = own(box(FIN.plate, FIN.width, depth, { at: [s.tw / 2 + FIN.plate / 2, side * (face - FIN.width / 2), -FIN.top - depth / 2] }));
      const drills = Array.from({ length: rows }, (_, i) => own(cylinder(FIN.hole / 2, 60, { at: [-30, at(i)[1], at(i)[2]], axis: X })));
      holes.push(...drills);
      part('plate', 'Fin plate', one(unwrap(cutAll(blank, drills))), 'Steel S275');
      for (let i = 0; i < rows; i++) {
        const position = at(i);
        boltAt.push(position);
        part('bolt', 'Bolt M20 8.8', translate(bolt, position), 'Steel 8.8');
      }
    }
    // Headed studs on the centre line of the top flange. They tie the slab to the beam.
    const stud = own(one(unwrap(fuseAll([own(cylinder(STUD.d / 2, STUD.height - STUD.headT)), own(cylinder(STUD.head / 2, STUD.headT, { at: [0, 0, STUD.height - STUD.headT] }))]))));
    const count = Math.floor((length - 300) / STRIP.studPitch) + 1;
    for (let i = 0; i < count; i++) part('stud', 'Shear stud 19 x 100', translate(stud, [0, (i - (count - 1) / 2) * STRIP.studPitch, 0]), 'Steel');
    // The mesh in the slab: wires along the beam, and cross wires welded on top of them.
    const wires: Body[] = [], zWire = STRIP.depth - STRIP.cover - MESH.wire, across = Math.floor(STRIP.width / MESH.pitch), along = Math.floor(2 * face / MESH.pitch);
    for (let j = 0; j < across; j++) wires.push(own(cylinder(MESH.wire / 2, 2 * face - 40, { at: [(j - (across - 1) / 2) * MESH.pitch, -face + 20, zWire], axis: Y })));
    for (let i = 0; i < along; i++) wires.push(own(cylinder(MESH.wire / 2, STRIP.width - 40, { at: [-STRIP.width / 2 + 20, (i - (along - 1) / 2) * MESH.pitch, zWire + MESH.wire - 1], axis: X })));
    const mesh = part('mesh', 'Fabric A142', one(unwrap(fuseAll(wires))), 'Steel B500');

    // The view. placedSolids() gives each element in its place, as the IFC file has it. The view then drills the
    // web for the bolts, cuts the slab back along the beam to show the studs and the mesh in it, and puts the
    // screw with its helical thread in the place of each bolt proxy.
    const share = Math.min(Math.max(slab, 0), 1), behind = -STUD.head / 2 - 4;
    const raw = (share - 0.5) * STRIP.width, edge = share < 1 && Math.abs(raw) < -behind ? behind : raw; // not through a stud
    const cutSlab = share > 0 && share < 1;
    const open = cutSlab ? [own(box(STRIP.width, 2 * face + 2, STRIP.depth + 2, { at: [edge + STRIP.width / 2, 0, STRIP.depth / 2] }))] : [];
    const kept = cutSlab ? [own(box(STRIP.width, 2 * face + 2, STRIP.depth + 2, { at: [edge - STRIP.width / 2, 0, STRIP.depth / 2] }))] : [];
    const groups: Record<Tone, Body[]> = { beam: [], column: [], plate: [], bolt: [], stud: [], mesh: [], slab: [] };
    let kg = 0;
    for (const el of model.getAllElements()) {
      const tone = tones.get(el.localId);
      if (!tone) continue;
      const placed = unwrap(placedSolids(el)).map((body) => own(body));
      if (el.localId === beam) {
        kg = unwrap(measureVolume(placed[0]!)) * STEEL / (length / 1000);
        groups.beam.push(own(unwrap(cutAll(placed[0]!, holes))));
      } else if (el.localId === deck) {
        if (share > 0) groups.slab.push(cutSlab ? own(unwrap(cutAll(placed[0]!, open))) : placed[0]!);
      } else if (el.localId === mesh) {
        if (share < 1) groups.mesh.push(cutSlab ? own(unwrap(cutAll(placed[0]!, kept))) : placed[0]!);
      } else if (tone !== 'bolt' && (tone !== 'stud' || edge < 0)) groups[tone].push(...placed);
    }
    groups.bolt = boltAt.map((at) => own(translate(screw, at)) as Body);
    const shown = (Object.keys(COLORS) as Tone[]).filter((tone) => groups[tone].length > 0).map((tone) => color(compound(groups[tone]), COLORS[tone]));
    return { model, shown, kg, table: s.kg, section, rows };
  } catch (error) {
    model[Symbol.dispose]();
    throw error;
  } finally {
    owned.splice(0).forEach((body) => body.delete());
  }
}

// Try beamModel({ section: 'IPE 400' }), beamModel({ span: 3600 }) or beamModel({ slab: 0 }).
const scene = beamModel();
console.log(scene.section + ': the kernel measures ' + scene.kg.toFixed(1) + ' kg/m, the section table gives ' + scene.table + ' kg/m. ' + scene.rows + ' bolt rows in each fin plate.');
// The tree panel shows the IFC structure. The IFC button saves the model as a file.
export default present(scene.shown, {
  bimTree: scene.model.toTreeSummary(),
  ifc: async () => unwrap(await toIfc(scene.model, { applicationName: 'brepjs playground', applicationVersion: '1.0' })),
});`,
  },
  {
    id: 'bim-wall-openings',
    label: 'Wall with Door and Window',
    description:
      'The outer wall of a house as a BIM model: an IfcWall that hosts a door and a window in a project, site, building and storey structure. Each opening is a void that the model cuts into the wall solid, and the view shows the three layers of the cavity wall. The brick, the wall layers, the door leaf and the lintel bearing are published figures, and the kernel measures the wall volume against the box less the two voids. The openings, the window, the frames and the ground are a display model.',
    code: `import { BimModel, placedSolids, toIfc } from 'brepjs-bim';
import { box, clone, compound, cutAll, cylinder, extrude, fuseAll, getSolids, intersect, measureVolume, polygon, rotate, unwrap } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';

// Outer wall of a house as a BIM model: an IfcWall that hosts a door and a window. Each opening is a void that
// the model cuts into the wall solid. The brick, the wall layers, the door leaf and the lintel bearing are
// published figures. The openings, the window, the frames and the ground are a display model.
// Units are millimetres. The wall runs along Y, its outer face is at x = 0 and the room is on the -X side.
interface WallParams {
  doorOpen?: number; // degrees that the door leaf swings into the room
  windowOpen?: number; // degrees that the casement swings out
  length?: number; // length of the wall
}

// ---- published figures
const BRICK = { length: 215, width: 102.5, height: 65, joint: 10 }; // with its joint a brick takes 225 x 75 of the face
// Cavity wall, from the outside: a brick leaf, a cavity with insulation, a block leaf.
const LAYERS = [{ name: 'Facing brick', thicknessMm: 102.5 }, { name: 'Cavity with insulation', thicknessMm: 100 }, { name: 'Concrete block', thicknessMm: 100 }];
const LEAF = { width: 926, height: 2040, thickness: 44 }; // a standard door leaf
const LINTEL = { bearing: 150, courses: 3 };

// ---- display model
const COURSE = BRICK.height + BRICK.joint, EACH_M2 = 1e6 / ((BRICK.length + BRICK.joint) * COURSE), T = LAYERS.reduce((sum, layer) => sum + layer.thicknessMm, 0);
const HEIGHT = 36 * COURSE; // 2700
const DOOR = { opening: [1010, 2110], leaf: [LEAF.width, LEAF.height], leafT: LEAF.thickness, handle: 1000 }; // width, height
const WINDOW = { opening: [1810, 1350], sill: 12 * COURSE, frame: 70, depth: 70, sash: 50, glass: 24 };
const FRAME = { depth: 95, back: 60 }; // door frame, and how far the frames are behind the outer face
const COLORS = { wall: '#c97f5f', insulation: '#e3c65a', block: '#b9b5aa', stone: '#d8d2c4', frame: '#f5f2ea', leaf: '#12b5b0', glass: '#9fc3d4', metal: '#d3a956', floor: '#a8a294', ground: '#7d786f' };
type Tone = keyof typeof COLORS;
type P3 = [number, number, number];
type Body = ReturnType<typeof box>;
type Id = Extract<ReturnType<BimModel['addWall']>, { ok: true }>['value']; // the id of an element in the model
const Y: P3 = [0, 1, 0], Z: P3 = [0, 0, 1];

function wallModel({ doorOpen = 50, windowOpen = 25, length = 4500 }: WallParams = {}) {
  const model = new BimModel(), owned: { delete(): void }[] = [];
  const own = <T extends { delete(): void }>(s: T): T => { owned.push(s); return s; };
  try {
    model.init({ name: 'Wall example' });
    // The spatial structure makes this a BIM model: project, site, building, storey.
    const project = model.getProject();
    const site = unwrap(model.addSite({ name: 'Site' }));
    const building = unwrap(model.addBuilding({ name: 'House' }));
    const storey = unwrap(model.addStorey({ name: 'Ground floor', elevation: 0 }));
    if (project) model.aggregate(project.localId, site);
    model.aggregate(site, building);
    model.aggregate(building, storey);
    const tones = new Map<Id, Tone>();
    const put = (tone: Tone, made: ReturnType<BimModel['addWall']>): Id => {
      const id = unwrap(made);
      model.placeIn(id, storey);
      tones.set(id, tone);
      return id;
    };

    // The wall. Its thickness goes to the left of axisX, so a wall along +Y is thick toward -X.
    const wall = put('wall', model.addWall({ length, height: HEIGHT, thickness: T, origin: [0, 0, 0], axisX: Y, axisZ: Z, materialName: 'Brick', materialLayers: LAYERS, layerSetName: 'Cavity wall', isExternal: true, loadBearing: true }));
    // The door and the window name their host wall. The model cuts a void for each, and the IFC file relates
    // wall, void and filling. A door and a window have no solid of their own in this library.
    const doorAt = 550, windowAt = length - WINDOW.opening[0]! - 550;
    put('frame', model.addDoor({ wallLocalId: wall, width: DOOR.opening[0]!, height: DOOR.opening[1]!, offsetAlongWall: doorAt, offsetFromFloor: 0, materialName: 'Timber', isExternal: true }));
    put('frame', model.addWindow({ wallLocalId: wall, width: WINDOW.opening[0]!, height: WINDOW.opening[1]!, offsetAlongWall: windowAt, offsetFromFloor: WINDOW.sill, materialName: 'Timber', isExternal: true }));

    // A lintel over each opening carries the wall. It bears 150 mm on each side.
    const lintelDepth = LINTEL.courses * COURSE;
    const lintel = (at: number, width: number, z: number): Id => put('stone', model.addBeam({
      length: width + 2 * LINTEL.bearing, profile: { kind: 'RECTANGULAR', width: T, height: lintelDepth },
      origin: [-T / 2, at - LINTEL.bearing, z + lintelDepth / 2], axisX: Y, axisZ: Z, predefinedType: 'LINTEL', materialName: 'Precast concrete',
    }));
    const lintels = [lintel(doorAt, DOOR.opening[0]!, DOOR.opening[1]!), lintel(windowAt, WINDOW.opening[0]!, WINDOW.sill + WINDOW.opening[1]!)];
    // The floor of the room, and the ground outside: 150 mm lower.
    put('floor', model.addSlab({ length: T + 1500, width: length, thickness: 200, origin: [-T - 1500, 0, -200], axisX: [1, 0, 0], axisZ: Z, predefinedType: 'FLOOR', materialName: 'Concrete' }));
    put('ground', model.addSlab({ length: 900, width: length, thickness: 50, origin: [0, 0, -200], axisX: [1, 0, 0], axisZ: Z, predefinedType: 'BASESLAB', materialName: 'Paving' }));

    furnish(model, put, own, { doorAt, windowAt, doorOpen, windowOpen });

    // The view. placedSolids() gives each element in its place, as the IFC file has it. The wall comes with its
    // voids. The view cuts the seat of each lintel out of the wall, splits the wall into its three layers and
    // marks the bed joints of the brick leaf.
    const groups: Record<Tone, Body[]> = { wall: [], insulation: [], block: [], stone: [], frame: [], leaf: [], glass: [], metal: [], floor: [], ground: [] };
    const all = new Map(model.getAllElements().map((el) => [el.localId, el]));
    const seats = lintels.flatMap((id) => unwrap(placedSolids(all.get(id)!)).map((body) => own(body)));
    let net = 0;
    for (const [id, el] of all) {
      const tone = tones.get(id);
      if (!tone) continue;
      const placed = unwrap(placedSolids(el)).map((body) => own(body));
      if (id === wall) {
        net = unwrap(measureVolume(placed[0]!));
        const seated = own(unwrap(cutAll(placed[0]!, seats)));
        const leaf = (from: number, to: number) => own(unwrap(intersect(seated, own(box(to - from, length + 2, HEIGHT + 2, { at: [-(from + to) / 2, length / 2, HEIGHT / 2] })))));
        const [brick, cavity] = [LAYERS[0]!.thicknessMm, LAYERS[1]!.thicknessMm];
        const joints = Array.from({ length: HEIGHT / COURSE - 1 }, (_, i) => own(box(8, length + 2, BRICK.joint, { at: [0, length / 2, (i + 1) * COURSE - BRICK.joint / 2] })));
        groups.wall.push(own(unwrap(cutAll(leaf(0, brick), joints))));
        groups.insulation.push(leaf(brick, brick + cavity));
        groups.block.push(leaf(brick + cavity, T));
      } else groups[tone].push(...placed);
    }
    const shown = (Object.keys(COLORS) as Tone[]).filter((tone) => groups[tone].length > 0).map((tone) => color(compound(groups[tone]), COLORS[tone]));
    const voids = (DOOR.opening[0]! * DOOR.opening[1]! + WINDOW.opening[0]! * WINDOW.opening[1]!) * T;
    return { model, shown, net, byHand: length * HEIGHT * T - voids, bricks: Math.round(net / T / 1e6 * EACH_M2) };
  } catch (error) {
    model[Symbol.dispose]();
    throw error;
  } finally {
    owned.splice(0).forEach((body) => body.delete());
  }
}

// The door set, the window, the sill and the step. Each part is a proxy in the storey.
function furnish(
  model: BimModel,
  put: (tone: Tone, made: ReturnType<BimModel['addWall']>) => Id,
  own: <T extends { delete(): void }>(s: T) => T,
  at: { doorAt: number; windowAt: number; doorOpen: number; windowOpen: number },
): void {
  // A boolean gives a compound, and a proxy takes a solid: one() copies the solid out.
  const one = (shape: Parameters<typeof getSolids>[0]): Body => unwrap(clone(getSolids(own(shape))[0]!)) as Body;
  const part = (tone: Tone, name: string, solid: Body, materialName: string): Id => put(tone, model.addProxy({ name, solid, materialName }));
  const block = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Body => box(x1 - x0, y1 - y0, z1 - z0, { at: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] });
  const ring = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, rim: number): Body =>
    one(unwrap(cutAll(own(block(x0, x1, y0, y1, z0, z1)), [own(block(x0 - 1, x1 + 1, y0 + rim, y1 - rim, z0 + rim, z1 - rim))])));
  const swing = (body: Body, degrees: number, pivot: P3): Body => (degrees === 0 ? body : rotate(own(body), degrees, { at: pivot, axis: Z }));

  // The door set: a frame of two jambs and a head, a threshold, and a leaf on three hinges.
  const [ow, oh] = [DOOR.opening[0]!, DOOR.opening[1]!], [lw, lh] = [DOOR.leaf[0]!, DOOR.leaf[1]!];
  const y0 = at.doorAt, y1 = y0 + ow, jamb = (ow - lw) / 2 - 2, sillH = 15, head = oh - sillH - lh - 6;
  const xo = -FRAME.back, xi = xo - FRAME.depth;
  const frame = one(unwrap(fuseAll([own(block(xi, xo, y0, y0 + jamb, 0, oh)), own(block(xi, xo, y1 - jamb, y1, 0, oh)), own(block(xi, xo, y0 + jamb, y1 - jamb, oh - head, oh))])));
  part('frame', 'Door frame', frame, 'Timber');
  part('metal', 'Threshold', block(xi, xo + 20, y0 + jamb, y1 - jamb, 0, sillH), 'Aluminium');
  // The leaf is flush with the inner face of the frame. It turns on the hinge barrels, on the room side of the jamb.
  const hinge: P3 = [xi - 7, y1 - jamb - 2, 0], z0 = sillH + 3, edge = hinge[1] - lw;
  const panels = [0, 1].flatMap((j) => [0, 1].map((k) => own(block(xi + DOOR.leafT - 8, xi + DOOR.leafT + 1, edge + 110 + j * (lw - 110) / 2, edge + (j + 1) * (lw - 110) / 2, z0 + 180 + k * 760, z0 + 180 + k * 760 + (k === 0 ? 640 : 520)))));
  const lite = own(block(xi - 1, xi + DOOR.leafT + 1, edge + 190, edge + lw - 190, z0 + 1560, z0 + lh - 180));
  // A lever handle on each face, on one spindle through the leaf.
  const hy = edge + 65, hz = DOOR.handle;
  const spindle = own(cylinder(9, DOOR.leafT + 110, { at: [xi - 55, hy, hz], axis: [1, 0, 0] }));
  const leaf = one(unwrap(cutAll(own(block(xi, xi + DOOR.leafT, edge, edge + lw, z0, z0 + lh)), [...panels, lite, spindle])));
  const lever = one(unwrap(fuseAll([
    spindle,
    own(cylinder(26, 8, { at: [xi - 8, hy, hz], axis: [1, 0, 0] })), own(cylinder(26, 8, { at: [xi + DOOR.leafT, hy, hz], axis: [1, 0, 0] })),
    own(block(xi - 55, xi - 39, hy - 8, hy + 120, hz - 8, hz + 8)), own(block(xi + DOOR.leafT + 39, xi + DOOR.leafT + 55, hy - 8, hy + 120, hz - 8, hz + 8)),
  ])));
  part('leaf', 'Door leaf', swing(leaf, -at.doorOpen, hinge), 'Timber, painted');
  part('glass', 'Door glazing', swing(block(xi + 12, xi + DOOR.leafT - 12, edge + 190, edge + lw - 190, z0 + 1560, z0 + lh - 180), -at.doorOpen, hinge), 'Glass');
  part('metal', 'Lever handle', swing(lever, -at.doorOpen, hinge), 'Brass');
  for (const z of [z0 + 150, z0 + lh / 2, z0 + lh - 250]) part('metal', 'Hinge', cylinder(7, 100, { at: [hinge[0], hinge[1], z] }), 'Brass');

  // The window: a frame with a mullion, a fixed light and a casement that opens out. A stone sill is under it.
  const [ww, wh] = [WINDOW.opening[0]!, WINDOW.opening[1]!], w0 = at.windowAt, w1 = w0 + ww, s0 = WINDOW.sill, sillT = COURSE;
  const fo = -FRAME.back, fi = fo - WINDOW.depth, f = WINDOW.frame, mid = (w0 + w1) / 2;
  const sill = own(unwrap(polygon([[-T + 0, w0, s0], [fo + 135, w0, s0], [fo + 135, w0, s0 + 30], [fo, w0, s0 + sillT], [-T, w0, s0 + sillT]])));
  part('stone', 'Window sill', unwrap(extrude(sill, [0, ww, 0])) as Body, 'Cast stone');
  const outer = own(block(fi, fo, w0, w1, s0 + sillT, s0 + wh));
  const lights = [own(block(fi - 1, fo + 1, w0 + f, mid - f / 2, s0 + sillT + f, s0 + wh - f)), own(block(fi - 1, fo + 1, mid + f / 2, w1 - f, s0 + sillT + f, s0 + wh - f))];
  part('frame', 'Window frame', one(unwrap(cutAll(outer, lights))), 'Timber');
  const g0 = (fi + fo) / 2 - WINDOW.glass / 2, g1 = g0 + WINDOW.glass;
  part('glass', 'Fixed glazing', block(g0, g1, w0 + f, mid - f / 2, s0 + sillT + f, s0 + wh - f), 'Glass');
  // The casement fills the other light. It hangs on the jamb at w1 and swings out.
  const c0 = mid + f / 2 + 3, c1 = w1 - f - 3, cz0 = s0 + sillT + f + 3, cz1 = s0 + wh - f - 3, pivot: P3 = [fo, c1, 0];
  const sash = ring(fo - 56, fo, c0, c1, cz0, cz1, WINDOW.sash);
  part('frame', 'Casement', swing(sash, at.windowOpen, pivot), 'Timber');
  part('glass', 'Casement glazing', swing(block(fo - 40, fo - 40 + WINDOW.glass, c0 + WINDOW.sash, c1 - WINDOW.sash, cz0 + WINDOW.sash, cz1 - WINDOW.sash), at.windowOpen, pivot), 'Glass');
  part('metal', 'Casement stay', swing(block(fo - 70, fo - 56, c0 + 15, c0 + 35, (cz0 + cz1) / 2 - 60, (cz0 + cz1) / 2 + 60), at.windowOpen, pivot), 'Brass');
  // A step at the door, on the ground.
  part('stone', 'Door step', block(0, 450, y0 - 150, y1 + 150, -150, -10), 'Cast stone');
}

// Try wallModel({ doorOpen: 90 }), wallModel({ windowOpen: 0 }) or wallModel({ length: 6000 }).
const scene = wallModel();
console.log('Wall: the kernel measures ' + (scene.net / 1e9).toFixed(3) + ' m3. The box less the two voids is ' + (scene.byHand / 1e9).toFixed(3) + ' m3. At ' + EACH_M2.toFixed(1) + ' bricks for each m2 of face, the outer leaf takes about ' + scene.bricks + ' bricks.');
// The tree panel shows the IFC structure. The IFC button saves the model as a file.
export default present(scene.shown, {
  bimTree: scene.model.toTreeSummary(),
  ifc: async () => unwrap(await toIfc(scene.model, { applicationName: 'brepjs playground', applicationVersion: '1.0' })),
});`,
  },
  {
    id: 'bim-curtain-wall',
    label: 'Curtain Wall',
    description:
      'A curtain wall on a facade that turns a corner, as a BIM model. Each facet is a stack of IfcCurtainWall grids of glass panes between mullions and transoms, on its own wall line, and placedSolids() applies the two levels of the placement. The planning module, the storey height, the mullion and the glass unit are published figures, and the kernel measures the area of the vision glass. The slabs, the brackets, the back pans and the corner post are a display model.',
    code: `import { BimModel, placedSolids, toIfc } from 'brepjs-bim';
import { box, clone, compound, cylinder, extrude, fuseAll, getSolids, measureVolume, polygon, rotate, translate, unwrap } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';

// Curtain wall on a facade that turns a corner: each facet is a stack of IfcCurtainWall grids, with glass panes
// between mullions and transoms, on its own wall line. The planning module, the storey height, the mullion and
// the glass unit are published figures. The slabs, the brackets, the back pans and the corner are a display
// model. Units are millimetres. The facade looks to +X and the corner is at the origin.
interface FacadeParams {
  skew?: number; // degrees between the two facets. 0 makes a flat facade
  storeys?: number; // storeys of glass
  cutaway?: number; // modules at each end that show no glass. The IFC file keeps all the glass
}

// ---- published figures
const MODULE = 1500; // office planning grid
const STOREY = 3900; // floor to floor, in the usual range of 3.6 to 4.2 m
const MULLION = { face: 65, depth: 160 }; // a unitised system
const GLASS = { unit: 28, kgM2: 30.57 }; // double glazing 6-16-6, and its mass for each m2
const SLAB = 150; // composite slab
const HE240B = { h: 240, b: 240, tw: 10, tf: 17 };

// ---- display model
const SPANDREL = 1100, VISION = STOREY - SPANDREL; // the spandrel hides the slab edge and the ceiling zone
const MODULES = 3; // glass modules in each facet
const EDGE = { gap: 60, depth: 1500, column: 600 }; // from the mullions to the slab edge, and the slab strip
const COLORS = { glass: '#9fc3d4', spandrel: '#e4e7ea', frame: '#c3c9d1', slab: '#cfcabb', steel: '#8a99ad', bracket: '#12b5b0', pan: '#d3a956', fire: '#ff5a1f' };
type Tone = keyof typeof COLORS;
type P3 = [number, number, number];
type Body = ReturnType<typeof box>;
type Id = Extract<ReturnType<BimModel['addCurtainWall']>, { ok: true }>['value']; // the id of an element in the model
const Z: P3 = [0, 0, 1];

function facade({ skew = 30, storeys = 2, cutaway = 1 }: FacadeParams = {}) {
  const model = new BimModel(), owned: { delete(): void }[] = [];
  const own = <T extends { delete(): void }>(s: T): T => { owned.push(s); return s; };
  try {
    model.init({ name: 'Curtain wall' });
    // The spatial structure makes this a BIM model: project, site, building, storey.
    const project = model.getProject();
    const site = unwrap(model.addSite({ name: 'Site' }));
    const building = unwrap(model.addBuilding({ name: 'Building' }));
    const storey = unwrap(model.addStorey({ name: 'Level 1', elevation: 0 }));
    if (project) model.aggregate(project.localId, site);
    model.aggregate(site, building);
    model.aggregate(building, storey);
    const tones = new Map<Id, Tone>(), hidden = new Map<Id, number[]>();
    const put = (tone: Tone, made: ReturnType<BimModel['addCurtainWall']>): Id => {
      const id = unwrap(made);
      model.placeIn(id, storey);
      tones.set(id, tone);
      return id;
    };

    // Two wall lines meet at the origin. Each turns half of the skew away from the Y axis. A line has its own
    // frame: axisX along the wall, and the inside of the building to the left of it.
    const half = skew * Math.PI / 360, modules = MODULES, width = modules * MODULE, levels = Math.max(1, Math.round(storeys));
    const reach = MULLION.depth * Math.tan(half) + MULLION.face / 2; // from the corner to the last grid line
    const lines = [-1, 1].map((side) => {
      const axisX: P3 = [-side * Math.sin(half), Math.cos(half), 0], inward: P3 = [-Math.cos(half), -side * Math.sin(half), 0];
      const start = side < 0 ? -(width + reach) : reach;
      return { side, axisX, inward, origin: [start * axisX[0], start * axisX[1], 0] as P3, turn: Math.atan2(axisX[1], axisX[0]) * 180 / Math.PI };
    });

    // The curtain walls. One call makes a grid of columns x rows panes with a mullion on each grid line. The
    // placement has two levels: a pane has its place in the grid, and the grid is on the frame of its wall line.
    // Each facet is a stack of grids: a spandrel band at each slab and a vision band between. A grid stops half a
    // transom short of its band, so the transoms of two bands meet.
    const bands = Array.from({ length: 2 * levels + 1 }, (_, i) => (i % 2 === 0
      ? { z: i / 2 * STOREY + SLAB - SPANDREL, height: SPANDREL, tone: 'spandrel' as const }
      : { z: (i - 1) / 2 * STOREY + SLAB, height: VISION, tone: 'glass' as const }));
    for (const line of lines) for (const band of bands) {
      const id = put(band.tone, model.addCurtainWall({
        width, height: band.height - MULLION.face, columns: modules, rows: 1,
        panelThickness: GLASS.unit, mullionWidth: MULLION.face, mullionDepth: MULLION.depth,
        origin: [line.origin[0], line.origin[1], band.z + MULLION.face / 2], axisX: line.axisX, axisZ: Z,
        materialName: 'Aluminium', panelMaterialName: band.tone === 'glass' ? 'Double glazing 6-16-6' : 'Spandrel glass',
      }));
      // The panes of the end modules stay out of the view.
      const open = Math.min(Math.max(Math.round(cutaway), 0), modules);
      hidden.set(id, Array.from({ length: open }, (_, i) => (line.side < 0 ? i : modules - 1 - i)));
    }

    const sizes = { width, reach, half, modules, levels };
    structure(model, put, own, lines, sizes);
    dress(model, put, own, lines, sizes);

    // The view. placedSolids() applies both levels of the placement. It gives the panes first, then the mullions
    // and the transoms. The kernel measures the panes of the vision band.
    const groups: Record<Tone, Body[]> = { glass: [], spandrel: [], frame: [], slab: [], steel: [], bracket: [], pan: [], fire: [] };
    let visionM2 = 0;
    for (const el of model.getAllElements()) {
      const tone = tones.get(el.localId);
      if (!tone) continue;
      const placed = unwrap(placedSolids(el)).map((body) => own(body));
      const skip = hidden.get(el.localId);
      if (!skip) { groups[tone].push(...placed); continue; }
      const panes = placed.slice(0, modules);
      if (tone === 'glass') visionM2 += panes.reduce((sum, pane) => sum + unwrap(measureVolume(pane)), 0) / GLASS.unit / 1e6;
      groups[tone].push(...panes.filter((_, i) => !skip.includes(i)));
      groups.frame.push(...placed.slice(modules));
    }
    const shown = (Object.keys(COLORS) as Tone[]).filter((tone) => groups[tone].length > 0).map((tone) => color(compound(groups[tone]), COLORS[tone]));
    const byHand = 2 * levels * modules * (MODULE - MULLION.face) * (VISION - 2 * MULLION.face) / 1e6;
    return { model, shown, visionM2, byHand, glassKg: visionM2 * GLASS.kgM2 };
  } catch (error) {
    model[Symbol.dispose]();
    throw error;
  } finally {
    owned.splice(0).forEach((body) => body.delete());
  }
}

type Line = { side: number; axisX: P3; inward: P3; origin: P3; turn: number };
type Sizes = { width: number; reach: number; half: number; modules: number; levels: number };
type Put = (tone: Tone, made: ReturnType<BimModel['addCurtainWall']>) => Id;
type Own = <T extends { delete(): void }>(s: T) => T;
// A point of a wall line: u along the wall from the corner, t into the building.
const point = (line: Line, u: number, t: number, z: number): P3 => [u * line.axisX[0] + t * line.inward[0], u * line.axisX[1] + t * line.inward[1], z];

// A strip of each floor slab behind the facade, and a steel column behind the end module of each facet.
function structure(model: BimModel, put: Put, own: Own, lines: Line[], { width, reach, half, levels }: Sizes): void {
  const edge = MULLION.depth + EDGE.gap, far = width + reach + MULLION.face / 2, near = (edge + EDGE.depth) * Math.tan(half);
  const tops = Array.from({ length: levels + 1 }, (_, i) => i * STOREY);
  for (const top of tops) {
    for (const line of lines) {
      const from = line.side < 0 ? -far : near;
      put('slab', model.addSlab({ length: far - near, width: EDGE.depth, thickness: SLAB, origin: point(line, from, edge, top - SLAB), axisX: line.axisX, axisZ: Z, predefinedType: 'FLOOR', materialName: 'Concrete' }));
    }
    // The slabs stop at the corner. A piece with four sides fills the place between them.
    if (near > 1) {
      const [a, b] = [lines[0]!, lines[1]!];
      const kite = own(unwrap(polygon([point(a, -near, edge, top - SLAB), point(a, -edge * Math.tan(half), edge, top - SLAB), point(b, near, edge, top - SLAB), point(a, -near, edge + EDGE.depth, top - SLAB)])));
      put('slab', model.addProxy({ name: 'Slab corner', solid: unwrap(extrude(kite, [0, 0, SLAB])) as Body, materialName: 'Concrete' }));
    }
  }
  const column = { kind: 'I_BEAM', overallWidth: HE240B.b, overallDepth: HE240B.h, flangeThickness: HE240B.tf, webThickness: HE240B.tw } as const;
  for (const line of lines) for (const top of tops.slice(0, -1))
    put('steel', model.addColumn({ height: STOREY - SLAB, profile: column, origin: point(line, line.side * (reach + width - MODULE / 2), edge + EDGE.column, top), axisX: line.axisX, axisZ: Z, materialName: 'Steel S355' }));
}

// The parts that hold and close the wall: a bracket at each mullion, a back pan behind each spandrel pane, a fire
// stop at each slab edge and a post at the corner. Each part is a proxy in the storey.
function dress(model: BimModel, put: Put, own: Own, lines: Line[], { width, reach, half, modules, levels }: Sizes): void {
  const one = (shape: Parameters<typeof getSolids>[0]): Body => unwrap(clone(getSolids(own(shape))[0]!)) as Body;
  const block = (u0: number, u1: number, t0: number, t1: number, z0: number, z1: number): Body => box(u1 - u0, t1 - t0, z1 - z0, { at: [(u0 + u1) / 2, (t0 + t1) / 2, (z0 + z1) / 2] });
  // A body made at the corner, with x along the wall and y into the building, goes on a wall line.
  const onLine = (line: Line, body: Body): Body => rotate(own(body), line.turn, { axis: Z });
  const edge = MULLION.depth + EDGE.gap, far = width + reach + MULLION.face / 2, g = reach - MULLION.face / 2;
  // The bracket is on top of the slab and holds the back of the mullion. Two anchors fix it to the slab.
  const bracket = own(one(unwrap(fuseAll([
    own(block(-70, 70, edge + 10, edge + 230, 0, 12)), own(block(-30, 30, MULLION.depth, edge + 90, 12, 90)),
    own(cylinder(11, 14, { at: [-40, edge + 180, 12] })), own(cylinder(11, 14, { at: [40, edge + 180, 12] })),
  ]))));
  for (const line of lines) {
    const first = line.side < 0 ? -(width + reach) : reach, corner = line.side < 0 ? modules : 0; // no bracket at the corner
    for (let level = 0; level <= levels; level++) {
      const top = level * STOREY;
      for (let k = 0; k <= modules; k++) if (k !== corner) put('bracket', model.addProxy({ name: 'Bracket', solid: onLine(line, translate(bracket, [first + k * MODULE, 0, top])), materialName: 'Steel, galvanised' }));
      const from = line.side < 0 ? -far : edge * Math.tan(half), to = line.side < 0 ? -edge * Math.tan(half) : far;
      put('fire', model.addProxy({ name: 'Fire stop', solid: onLine(line, block(from, to, MULLION.depth, edge, top - SLAB, top)), materialName: 'Mineral wool' }));
    }
    for (let level = 0; level <= levels; level++) for (let k = 0; k < modules; k++) {
      const z = level * STOREY + SLAB - SPANDREL;
      const u = first + k * MODULE + MULLION.face / 2;
      put('pan', model.addProxy({ name: 'Back pan', solid: onLine(line, block(u, u + MODULE - MULLION.face, 60, MULLION.depth, z + MULLION.face, z + SPANDREL - MULLION.face)), materialName: 'Insulated steel pan' }));
    }
  }
  // The corner post closes the wall between the end mullions of the two facets.
  if (g > 1) {
    const [a, b] = [lines[0]!, lines[1]!], z0 = SLAB - SPANDREL;
    const kite = own(unwrap(polygon([point(a, -g, 0, z0), [0, 0, z0], point(b, g, 0, z0), point(a, -g, MULLION.depth, z0)])));
    put('frame', model.addProxy({ name: 'Corner post', solid: unwrap(extrude(kite, [0, 0, levels * STOREY + SPANDREL])) as Body, materialName: 'Aluminium' }));
  }
}

// Try facade({ skew: 0 }), facade({ skew: 60, storeys: 3 }) or facade({ cutaway: 0 }).
const scene = facade();
console.log('Vision glass: the kernel measures ' + scene.visionM2.toFixed(2) + ' m2 in the panes, the grid gives ' + scene.byHand.toFixed(2) + ' m2. That is ' + scene.glassKg.toFixed(0) + ' kg of double glazing.');
// The tree panel shows the IFC structure. The IFC button saves the model as a file.
export default present(scene.shown, {
  bimTree: scene.model.toTreeSummary(),
  ifc: async () => unwrap(await toIfc(scene.model, { applicationName: 'brepjs playground', applicationVersion: '1.0' })),
});`,
  },
  {
    id: 'bim-steel-frame',
    label: 'Braced Steel Frame',
    description:
      'A braced steel frame of two storeys as a BIM model: columns on a grid, a beam grid at each floor, tube bracing with gusset plates, a slab on each level and a base under each column, all grouped as one IfcElementAssembly. The sections, the grid, the storey height, the slab depth and the column base are published figures, and the kernel measures the mass of the steel against the section tables. The view shows each M24 holding down bolt as a screw with a helical thread in its nut, and the IFC file keeps it as a plain proxy. The layout of the bracing, the gussets and the footings are a display model.',
    code: `import { BimModel, placedSolids, toIfc } from 'brepjs-bim';
import { box, clone, compound, cutAll, cylinder, extrude, fuseAll, getSolids, line, loft, measureVolume, polygon, translate, unwrap, wire } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';

// Braced steel frame as a BIM model: columns on a grid, a beam grid at each floor, tube bracing, a slab on each
// level and a base under each column, all members of one IfcElementAssembly. The sections, the grid, the storey
// height, the slab depth and the column base are published figures. The layout of the bracing, the gussets and
// the footings are a display model. Units are millimetres. Z is up and the origin is at one corner column.
interface FrameParams {
  storeys?: number; // 1 to 3
  bays?: number; // bays of 6 m along X
  deck?: number; // part of each slab to show, 0 to 1. The IFC file keeps the whole slabs
}

// ---- published figures
// Rolled sections: depth, width, web, flange, root radius, and the table mass in kg for each metre.
const HE240B = { h: 240, b: 240, tw: 10, tf: 17, r: 21, kg: 83.2 };
const IPE400 = { h: 400, b: 180, tw: 8.6, tf: 13.5, r: 21, kg: 66.3 };
const IPE300 = { h: 300, b: 150, tw: 7.1, tf: 10.7, r: 15, kg: 42.2 };
const SHS = { b: 150, t: 6.3, ro: 9.45, ri: 6.3, kg: 28.1 }; // hot finished square tube for the bracing
const STEEL = 7850e-9; // kg in each mm3
const GRID = { x: 6000, y: 9000, storey: 3600 }; // a usual grid of 6 m by 9 m
const SLAB = 150; // composite slab
// Column base: a plate 100 mm larger than the column all round, four M24 bolts, 25 to 50 mm of grout.
const BASE = { plate: 450, thickness: 25, grout: 30, bolt: 24, minor: 20.752, pitch: 3, nut: 21.5, flats: 36, washer: 44, washerHole: 25, washerT: 4 }; // M24: metric coarse thread, right hand

// ---- display model
const SECONDARY = 3000; // spacing of the floor beams
const EDGE = 200; // the slab goes past the grid lines
const GUSSET = { plate: 15, reach: 520, half: 110 };
const FOOTING = { size: 1500, depth: 600 };
const ANCHOR = { embed: 300, hole: 30, play: 0.15 }; // a holding down bolt in the footing, its hole in the plate, the play of its nut
const COLORS = { column: '#c3c9d1', beam: '#12b5b0', brace: '#ff5a1f', plate: '#8a99ad', bolt: '#d3a956', slab: '#cfcabb', base: '#a8a294' };
type Tone = keyof typeof COLORS;
type P3 = [number, number, number];
type Body = ReturnType<typeof box>;
type Id = Extract<ReturnType<BimModel['addBeam']>, { ok: true }>['value']; // the id of an element in the model
type Section = { h: number; b: number; tw: number; tf: number; r: number };
const X: P3 = [1, 0, 0], Y: P3 = [0, 1, 0], Z: P3 = [0, 0, 1];
const rolled = (s: Section) => ({ kind: 'I_BEAM', overallWidth: s.b, overallDepth: s.h, flangeThickness: s.tf, webThickness: s.tw, filletRadius: s.r }) as const;

function frame({ storeys = 2, bays = 2, deck = 0.5 }: FrameParams = {}) {
  const model = new BimModel(), owned: { delete(): void }[] = [];
  const own = <T extends { delete(): void }>(s: T): T => { owned.push(s); return s; };
  try {
    model.init({ name: 'Steel frame' });
    const site = unwrap(model.addSite({ name: 'Site' }));
    const building = unwrap(model.addBuilding({ name: 'Building' }));
    const storey = unwrap(model.addStorey({ name: 'Ground floor', elevation: 0 }));
    const project = model.getProject();
    if (project) model.aggregate(project.localId, site);
    model.aggregate(site, building);
    model.aggregate(building, storey);
    const tones = new Map<Id, Tone>();
    let tableKg = 0;
    const put = (tone: Tone, made: ReturnType<BimModel['addBeam']>, kg = 0): Id => {
      const id = unwrap(made);
      model.placeIn(id, storey);
      tones.set(id, tone);
      tableKg += kg;
      return id;
    };
    const steel = { materialName: 'Steel S355' };
    const levels = Math.min(Math.max(Math.round(storeys), 1), 3), nx = Math.min(Math.max(Math.round(bays), 1), 3);
    const lines = Array.from({ length: nx + 1 }, (_, i) => i * GRID.x), rows = [0, GRID.y];
    const tops = Array.from({ length: levels }, (_, i) => (i + 1) * GRID.storey - SLAB); // top of steel of each level

    // Columns on the grid, from the base to the roof steel. Their flanges face along Y.
    const height = tops[levels - 1]!;
    for (const x of lines) for (const y of rows)
      put('column', model.addColumn({ height, profile: rolled(HE240B), origin: [x, y, 0], axisX: X, axisZ: Z, ...steel }), height / 1000 * HE240B.kg);
    const slabs: Id[] = [];
    for (const top of tops) {
      // Primary beams across the frame, between the column flanges.
      const span = GRID.y - HE240B.h;
      for (const x of lines)
        put('beam', model.addBeam({ length: span, profile: rolled(IPE400), origin: [x, HE240B.h / 2, top - IPE400.h / 2], axisX: Y, axisZ: Z, ...steel }), span / 1000 * IPE400.kg);
      // Floor beams along the frame at 3 m. On a grid line they go to the column webs, and between the grid lines
      // they stop at the flanges of the primary beams.
      for (let y = 0; y <= GRID.y; y += SECONDARY) for (let i = 0; i < nx; i++) {
        const gap = y === 0 || y === GRID.y ? HE240B.tw / 2 : IPE400.b / 2;
        put('beam', model.addBeam({ length: GRID.x - 2 * gap, profile: rolled(IPE300), origin: [i * GRID.x + gap, y, top - IPE300.h / 2], axisX: X, axisZ: Z, ...steel }), (GRID.x - 2 * gap) / 1000 * IPE300.kg);
      }
      // The slab on the beams. An opening lets each column go through the floor slabs.
      const slab = put('slab', model.addSlab({ length: nx * GRID.x + 2 * EDGE, width: GRID.y + 2 * EDGE, thickness: SLAB, origin: [-EDGE, -EDGE, top], axisX: X, axisZ: Z, predefinedType: top === height ? 'ROOF' : 'FLOOR', materialName: 'Concrete C30/37' }));
      slabs.push(slab);
      if (top < height) for (const x of lines) for (const y of rows)
        unwrap(model.addSlabOpening({ slabLocalId: slab, offsetX: x + EDGE - HE240B.b / 2, offsetY: y + EDGE - HE240B.h / 2, sizeX: HE240B.b, sizeY: HE240B.h }));
    }

    const kit = { model, put, own, levels, nx, tops };
    bracing(kit);
    const anchor = bases(kit, lines, rows);

    // One assembly holds the frame: the IFC file groups all the parts under it.
    const assembly = unwrap(model.addElementAssembly({ name: 'Frame', predefinedType: 'BRACED_FRAME' }));
    for (const id of tones.keys()) model.aggregate(assembly, id);

    // The view and the takeoff. placedSolids() gives each element in its place. The kernel measures each steel
    // member, and a density gives its mass. The view cuts the slabs back to show the beams. It also shows each holding
    // down bolt whole, in its holes, in the place of the proxy that the IFC file keeps.
    const groups: Record<Tone, Body[]> = { column: [], beam: [], brace: [], plate: [], bolt: [], slab: [], base: [] };
    const share = Math.min(Math.max(deck, 0), 1), length = nx * GRID.x + 2 * EDGE;
    const open = own(box(length, GRID.y + 2 * EDGE + 2, 2 * height, { at: [-EDGE + share * length + length / 2, GRID.y / 2, height] }));
    let kg = 0;
    for (const el of model.getAllElements()) {
      const tone = tones.get(el.localId);
      if (!tone) continue;
      const placed = unwrap(placedSolids(el)).map((body) => own(body));
      if (tone === 'column' || tone === 'beam' || tone === 'brace') kg += placed.reduce((sum, body) => sum + unwrap(measureVolume(body)), 0) * STEEL;
      if (slabs.includes(el.localId)) {
        if (share <= 0) continue;
        groups.slab.push(...(share < 1 ? placed.map((body) => own(unwrap(cutAll(body, [open])))) : placed));
      } else if (tone !== 'bolt') {
        const drills = anchor.holes.get(el.localId);
        groups[tone].push(...(drills ? placed.map((body) => own(unwrap(cutAll(body, drills)))) : placed));
      }
    }
    groups.bolt = anchor.screws.map((at) => own(translate(anchor.screw, at)) as Body);
    const shown = (Object.keys(COLORS) as Tone[]).filter((tone) => groups[tone].length > 0).map((tone) => color(compound(groups[tone]), COLORS[tone]));
    return { model, shown, kg, tableKg, members: [...tones.values()].filter((tone) => tone === 'column' || tone === 'beam' || tone === 'brace').length };
  } catch (error) {
    model[Symbol.dispose]();
    throw error;
  } finally {
    owned.splice(0).forEach((body) => body.delete());
  }
}

type Kit = { model: BimModel; put: (tone: Tone, made: ReturnType<BimModel['addBeam']>, kg?: number) => Id; own: <T extends { delete(): void }>(s: T) => T; levels: number; nx: number; tops: number[] };

// Bracing: two tubes in each braced bay go from the column feet to the middle of the beam over them. A gusset
// plate at each end joins the tube to the frame. Both end frames and one bay of each side are braced.
function bracing({ model, put, own, levels, nx, tops }: Kit): void {
  const tube = { kind: 'RECTANGLE_HOLLOW', xDim: SHS.b, yDim: SHS.b, wallThickness: SHS.t, outerFilletRadius: SHS.ro, innerFilletRadius: SHS.ri } as const;
  // A braced bay is a plane: o is the foot of its first column face, h its direction, and it is wide and high.
  const bay = (o: P3, h: P3, wide: number, high: number): void => {
    const at = (s: number, z: number): P3 => [o[0] + s * h[0], o[1] + s * h[1], o[2] + z];
    const normal: P3 = [-h[1], h[0], 0], t = GUSSET.plate;
    const plate = (points: [number, number][]): void => {
      const face = own(unwrap(polygon(points.map(([s, z]): P3 => { const p = at(s, z); return [p[0] - normal[0] * t / 2, p[1] - normal[1] * t / 2, p[2]]; }))));
      put('plate', model.addProxy({ name: 'Gusset plate', solid: unwrap(extrude(face, [normal[0] * t, normal[1] * t, 0])) as Body, materialName: 'Steel S355' }));
    };
    const angle = Math.atan2(high, wide / 2), c = Math.cos(angle), s = Math.sin(angle), r = GUSSET.reach, w = GUSSET.half;
    // The plate under the beam takes both tubes.
    const reachX = r * c + w * s + 20;
    plate([[wide / 2 + reachX, high], [wide / 2 + r * c + w * s, high - r * s + w * c], [wide / 2 + r * c - w * s, high - r * s - w * c], [wide / 2 - r * c + w * s, high - r * s - w * c], [wide / 2 - r * c - w * s, high - r * s + w * c], [wide / 2 - reachX, high]]);
    for (const side of [1, -1]) {
      // A plate in the corner at the column foot, then the tube from plate to plate.
      const foot = (ds: number): number => (side > 0 ? ds : wide - ds);
      plate([[foot(0), 0], [foot(r * c + w * s + 20), 0], [foot(r * c + w * s), r * s - w * c], [foot(r * c - w * s), r * s + w * c], [foot(0), r * s + w * c + 20]]);
      const from = at(foot(r * c), r * s), to = at(wide / 2 - side * r * c, high - r * s);
      const length = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
      const axisX: P3 = [(to[0] - from[0]) / length, (to[1] - from[1]) / length, (to[2] - from[2]) / length];
      const axisZ: P3 = [normal[1] * axisX[2] - normal[2] * axisX[1], normal[2] * axisX[0] - normal[0] * axisX[2], normal[0] * axisX[1] - normal[1] * axisX[0]];
      put('brace', model.addBeam({ length, profile: tube, origin: from, axisX, axisZ, materialName: 'Steel S355' }), length / 1000 * SHS.kg);
    }
  };
  for (let level = 0; level < levels; level++) {
    const floor = level === 0 ? 0 : tops[level - 1]! + SLAB, top = tops[level]!;
    for (const x of [0, nx * GRID.x]) bay([x, HE240B.h / 2, floor], Y, GRID.y - HE240B.h, top - IPE400.h - floor);
    bay([HE240B.tw / 2, 0, floor], X, GRID.x - HE240B.tw, top - IPE300.h - floor);
    bay([(nx - 1) * GRID.x + HE240B.tw / 2, GRID.y, floor], X, GRID.x - HE240B.tw, top - IPE300.h - floor);
  }
}

// A base under each column: a pad footing, a bed of grout, a base plate and four holding down bolts.
function bases({ model, put, own }: Kit, lines: number[], rows: number[]) {
  const one = (shape: Parameters<typeof getSolids>[0]): Body => unwrap(clone(getSolids(own(shape))[0]!)) as Body;
  const hex = own(unwrap(polygon(Array.from({ length: 6 }, (_, i): P3 => [BASE.flats / Math.sqrt(3) * Math.cos(i * Math.PI / 3), BASE.flats / Math.sqrt(3) * Math.sin(i * Math.PI / 3), BASE.washerT]))));
  // The part of a bolt over the plate: washer, nut and the end of the thread.
  const bolt = own(one(unwrap(fuseAll([own(cylinder(BASE.washer / 2, BASE.washerT)), own(unwrap(extrude(hex, BASE.nut))), own(cylinder(BASE.bolt / 2, BASE.washerT + BASE.nut + 20))]))));
  const p = BASE.plate, under = -BASE.thickness - BASE.grout, hold = p / 2 - 55;
  // The view shows the whole bolt as a real screw: a plain shank from the footing up through the grout and the plate,
  // then a core with one helical tooth, a washer, and a nut with the mating tooth, half a pitch out of phase.
  const tooth = (core: number, tip: number, from: number, to: number, ref: number): Body => {
    const root = tip > core ? core / 0.998 : core * 0.998, half = 0.42 * BASE.pitch; // a hair clear of the core or the bore
    const start = from + half, span = to - from - 2 * half, pieces = Math.ceil(span / (4 * BASE.pitch));
    const n = Math.round(span / pieces / BASE.pitch * 24); // 24 loft sections in each turn
    const section = (z: number) => {
      const a = 2 * Math.PI * (z - ref) / BASE.pitch;
      const pts = [[root, -half], [tip, 0], [root, half]].map(([r, dz]): P3 => [r! * Math.cos(a), r! * Math.sin(a), z + dz!]);
      return own(unwrap(wire(pts.map((q, i) => own(line(q, pts[(i + 1) % 3]!))))));
    };
    // A row of lofts of 4 turns or less, end to end on one helix: a long loft is slow to mesh.
    const lofts = Array.from({ length: pieces }, (_, k) => own(unwrap(loft(Array.from({ length: n + 1 }, (_, j) => section(start + span * (k + j / n) / pieces)), { ruled: false }))));
    return own(compound(lofts)) as Body;
  };
  const drilled = (body: Body, r: number, z: number, depth: number): Body => own(unwrap(cutAll(body, [own(cylinder(r, depth + 2, { at: [0, 0, z - 1] }))]))) as Body;
  const low = under - ANCHOR.embed, top = BASE.washerT + BASE.nut + 20, bore = BASE.bolt / 2 + ANCHOR.play;
  const screw = own(compound([
    own(cylinder(BASE.bolt / 2, -low, { at: [0, 0, low] })), own(cylinder(BASE.minor / 2, top)), tooth(BASE.minor / 2, BASE.bolt / 2, 0, top, 0),
    drilled(own(cylinder(BASE.washer / 2, BASE.washerT)), BASE.washerHole / 2, 0, BASE.washerT),
    drilled(own(unwrap(extrude(hex, BASE.nut))) as Body, bore, BASE.washerT, BASE.nut), tooth(bore, BASE.minor / 2 + ANCHOR.play, BASE.washerT, BASE.washerT + BASE.nut, BASE.pitch / 2),
  ])) as Body;
  const screws: P3[] = [], holes = new Map<Id, Body[]>(); // where the bolts are, and the holes that the view drills for them
  for (const x of lines) for (const y of rows) {
    const spots = [-hold, hold].flatMap((dx) => [-hold, hold].map((dy): P3 => [x + dx, y + dy, 0]));
    const drill = (r: number, z0: number, z1: number): Body[] => spots.map(([sx, sy]) => own(cylinder(r, z1 - z0, { at: [sx, sy, z0] })));
    screws.push(...spots);
    holes.set(put('base', model.addFooting({ length: FOOTING.size, width: FOOTING.size, thickness: FOOTING.depth, origin: [x - FOOTING.size / 2, y - FOOTING.size / 2, under - FOOTING.depth], axisX: X, axisZ: Z, predefinedType: 'PAD_FOOTING', materialName: 'Concrete C30/37' })), drill(BASE.bolt / 2, low, under + 1));
    holes.set(put('base', model.addProxy({ name: 'Grout', solid: box(p + 60, p + 60, BASE.grout, { at: [x, y, under + BASE.grout / 2] }), materialName: 'Grout' })), drill(BASE.bolt / 2 + 0.2, under - 1, -BASE.thickness + 1));
    holes.set(put('plate', model.addProxy({ name: 'Base plate', solid: box(p, p, BASE.thickness, { at: [x, y, -BASE.thickness / 2] }), materialName: 'Steel S355' })), drill(ANCHOR.hole / 2, -BASE.thickness - 1, 1));
    for (const at of spots) put('bolt', model.addProxy({ name: 'Holding down bolt M24', solid: translate(bolt, at), materialName: 'Steel 8.8' }));
  }
  return { screw, screws, holes };
}

// Try frame({ storeys: 3 }), frame({ bays: 3 }) or frame({ deck: 0 }).
const scene = frame();
console.log(scene.members + ' steel members: the kernel measures ' + (scene.kg / 1000).toFixed(2) + ' t, the section tables give ' + (scene.tableKg / 1000).toFixed(2) + ' t.');
// The tree panel shows the IFC structure. The IFC button saves the model as a file.
export default present(scene.shown, {
  bimTree: scene.model.toTreeSummary(),
  ifc: async () => unwrap(await toIfc(scene.model, { applicationName: 'brepjs playground', applicationVersion: '1.0' })),
});`,
  },
  {
    id: 'bim-building-shell',
    label: 'Building Shell',
    description:
      'A garden studio as a BIM model: a foundation slab, four walls that meet at the corners, a door and three windows, a gable roof on the wall heads and an IfcSpace for the room, in a project, site, building and storey structure. The brick, the wall layers, the door leaf, the lintel bearing, the step up from the ground and the least roof pitch are published figures, and the kernel measures the volume of the room. The plan, the windows and the trim are a display model.',
    code: `import { BimModel, placedSolids, toIfc } from 'brepjs-bim';
import { box, clone, compound, cutAll, cylinder, extrude, fuseAll, getSolids, measureVolume, polygon, rotate, translate, unwrap } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';

// Garden studio as a BIM model: a foundation slab, four walls that meet at the corners, a door and three windows,
// a gable roof on the wall heads and an IfcSpace for the room, in a project, site, building and storey structure.
// The brick, the wall layers, the door leaf, the lintel bearing, the step up from the ground and the least roof
// pitch are published figures. The plan, the windows and the trim are a display model.
// Units are millimetres. The ridge is along X, and the door is in the gable wall that looks to +X.
interface StudioParams {
  roofLift?: number; // 0 to 1: lifts the roof off the walls in the view
  pitch?: number; // roof pitch in degrees, 35 or more
  length?: number; // length of the building along the ridge
}

// ---- published figures
const BRICK = { length: 215, height: 65, joint: 10 }; // with its joint a brick takes 225 x 75 of the face
// Cavity wall, from the outside: a brick leaf, a cavity with insulation, a block leaf.
const LAYERS = [{ name: 'Facing brick', thicknessMm: 102.5 }, { name: 'Cavity with insulation', thicknessMm: 100 }, { name: 'Concrete block', thicknessMm: 100 }];
const LEAF = { width: 926, height: 2040, thickness: 44 }; // a standard door leaf
const BEARING = 150; // a lintel bears this much on each side
const STEP = 150; // the floor and the damp proof course are this far over the ground
const MIN_PITCH = 35; // plain tiles

// ---- display model
const COURSE = BRICK.height + BRICK.joint, T = LAYERS.reduce((sum, layer) => sum + layer.thicknessMm, 0);
const W = 4200, H = 32 * COURSE; // width of the plan, and 2400 of wall
const DOOR = { width: 1010, height: 2110 }, WINDOW = { height: 16 * COURSE, sill: 12 * COURSE };
const ROOF = { eave: 300, verge: 200, depth: 150, gauge: 250 };
const FRAME = { face: 60, depth: 80, back: 55, glass: 24 };
const COLORS = { wall: '#d08a68', roof: '#6f7b8a', timber: '#d3a956', stone: '#d8d2c4', frame: '#f5f2ea', leaf: '#12b5b0', glass: '#9fc3d4', metal: '#48515c', base: '#9a948a', floor: '#b89263', ground: '#7f9a62' };
type Tone = keyof typeof COLORS;
type P3 = [number, number, number];
type Body = ReturnType<typeof box>;
type Id = Extract<ReturnType<BimModel['addWall']>, { ok: true }>['value']; // the id of an element in the model
const X: P3 = [1, 0, 0], Y: P3 = [0, 1, 0], Z: P3 = [0, 0, 1];
// A wall as the openings see it: u goes along the wall, d goes from the outer face into the wall.
type Side = { along: 'x' | 'y'; from: number; face: number; into: 1 | -1 };

function studio({ roofLift = 0, pitch = MIN_PITCH, length = 6000 }: StudioParams = {}) {
  const model = new BimModel(), owned: { delete(): void }[] = [];
  const own = <T extends { delete(): void }>(s: T): T => { owned.push(s); return s; };
  try {
    model.init({ name: 'Building shell' });
    const site = unwrap(model.addSite({ name: 'Site' }));
    const building = unwrap(model.addBuilding({ name: 'Garden studio' }));
    const storey = unwrap(model.addStorey({ name: 'Ground floor', elevation: 0 }));
    const project = model.getProject();
    if (project) model.aggregate(project.localId, site);
    model.aggregate(site, building);
    model.aggregate(building, storey);
    const tones = new Map<Id, Tone>(), lifted = new Set<Id>();
    const put = (tone: Tone, made: ReturnType<BimModel['addWall']>): Id => {
      const id = unwrap(made);
      model.placeIn(id, storey);
      tones.set(id, tone);
      return id;
    };
    const L = Math.max(length, 3600), slope = Math.max(pitch, MIN_PITCH);

    // The foundation slab is 100 mm proud of the walls. Its top is the floor level, z = 0.
    put('base', model.addSlab({ length: L + 200, width: W + 200, thickness: 300, origin: [-100, -100, -300], axisX: X, axisZ: Z, predefinedType: 'BASESLAB', materialName: 'Concrete' }));

    // Four walls. The thickness of a wall is on the left of its axisX. The two long walls have the full length,
    // and the two gable walls fit between them, so the corners meet and do not double up.
    const wall = (origin: P3, axisX: P3, run: number): Id => put('wall', model.addWall({ length: run, height: H, thickness: T, origin, axisX, axisZ: Z, materialName: 'Brick', materialLayers: LAYERS, layerSetName: 'Cavity wall', isExternal: true }));
    const south = wall([0, 0, 0], X, L), north = wall([0, W - T, 0], X, L);
    const east = wall([L, T, 0], Y, W - 2 * T);
    wall([T, T, 0], Y, W - 2 * T);
    // The door and the windows name their host wall. The model cuts a void for each.
    const sides: Record<'south' | 'north' | 'east', Side> = { south: { along: 'x', from: 0, face: 0, into: 1 }, north: { along: 'x', from: 0, face: W, into: -1 }, east: { along: 'y', from: T, face: L, into: -1 } };
    const hosts = { south, north, east };
    const openings = [
      { host: 'east', door: true, at: (W - 2 * T - DOOR.width) / 2, width: DOOR.width, height: DOOR.height, sill: 0 },
      { host: 'south', door: false, at: 900, width: 1210, height: WINDOW.height, sill: WINDOW.sill },
      { host: 'south', door: false, at: L - 900 - 1210, width: 1210, height: WINDOW.height, sill: WINDOW.sill },
      { host: 'north', door: false, at: (L - 2410) / 2, width: 2410, height: WINDOW.height, sill: WINDOW.sill },
    ] as const;
    for (const o of openings) {
      const spec = { wallLocalId: hosts[o.host], width: o.width, height: o.height, offsetAlongWall: o.at, offsetFromFloor: o.sill, isExternal: true };
      put('frame', o.door ? model.addDoor({ ...spec, materialName: 'Timber' }) : model.addWindow({ ...spec, materialName: 'Timber' }));
    }

    // A gable roof on the wall heads. Its base is at z = H, and it goes past the walls at the eaves and the verges.
    const roof = put('roof', model.addRoof({ length: L + 2 * ROOF.verge, width: W + 2 * ROOF.eave, thickness: ROOF.depth, origin: [-ROOF.verge, -ROOF.eave, H], axisX: X, axisZ: Z, predefinedType: 'GABLE_ROOF', pitch: slope, materialName: 'Plain tile' }));
    lifted.add(roof);

    // The room is an IfcSpace: a volume in the model and in the IFC tree, with no solid in the view.
    const room = unwrap(model.addSpace({ name: 'Studio', length: L - 2 * T, width: W - 2 * T, height: H, origin: [T, T, 0], axisX: X, axisZ: Z, materialName: 'Air' }));
    model.placeIn(room, storey);

    const kit = { model, put, own, lifted, L, slope };
    const seats = fillOpenings(kit, openings.map((o) => ({ ...o, side: sides[o.host] })));
    trim(kit);

    // The view. placedSolids() gives each element in its place. The view cuts the lintel seats into the
    // walls, marks the tile courses on the roof, and lifts the roof and its trim when roofLift is not 0.
    const groups = Object.fromEntries(Object.keys(COLORS).map((tone) => [tone, []])) as unknown as Record<Tone, Body[]>;
    const all = new Map(model.getAllElements().map((el) => [el.localId, el]));
    const lintels = seats.flatMap((id) => unwrap(placedSolids(all.get(id)!)).map((body) => own(body)));
    const rad = slope * Math.PI / 180, ridge: P3 = [L / 2, W / 2, H + ROOF.depth + (W / 2 + ROOF.eave) * Math.tan(rad)];
    const run = (W / 2 + ROOF.eave) / Math.cos(rad);
    const groove = own(box(L + 2 * ROOF.verge + 2, 8, 14, { at: [0, 0, 0] }));
    const courses = [-1, 1].flatMap((side) => Array.from({ length: Math.floor(run / ROOF.gauge) }, (_, i) => {
      const s = (i + 0.5) * ROOF.gauge;
      return own(translate(own(rotate(groove, -side * slope, { axis: X })), [ridge[0], ridge[1] + side * s * Math.cos(rad), ridge[2] - s * Math.sin(rad)]));
    }));
    const lift = Math.min(Math.max(roofLift, 0), 1) * 1800;
    let spaceM3 = 0;
    for (const [id, el] of all) {
      if (id === room) spaceM3 = unwrap(placedSolids(el)).map((body) => own(body)).reduce((sum, body) => sum + unwrap(measureVolume(body)), 0) / 1e9;
      const tone = tones.get(id);
      if (!tone) continue;
      let placed: Body[] = unwrap(placedSolids(el)).map((body) => own(body));
      if (tone === 'wall') placed = placed.map((body) => own(unwrap(cutAll(body, lintels))) as Body);
      if (id === roof) placed = placed.map((body) => own(unwrap(cutAll(body, courses))) as Body);
      if (lifted.has(id) && lift > 0) placed = placed.map((body) => own(translate(body, [0, 0, lift])));
      groups[tone].push(...placed);
    }
    const shown = (Object.keys(COLORS) as Tone[]).filter((tone) => groups[tone].length > 0).map((tone) => color(compound(groups[tone]), COLORS[tone]));
    return { model, shown, spaceM3, floorM2: spaceM3 * 1e3 / H, byHand: (L - 2 * T) * (W - 2 * T) * H / 1e9 };
  } catch (error) {
    model[Symbol.dispose]();
    throw error;
  } finally {
    owned.splice(0).forEach((body) => body.delete());
  }
}

type Kit = { model: BimModel; put: (tone: Tone, made: ReturnType<BimModel['addWall']>) => Id; own: <T extends { delete(): void }>(s: T) => T; lifted: Set<Id>; L: number; slope: number };
type Opening = { side: Side; door: boolean; at: number; width: number; height: number; sill: number };

// What fills each opening: a lintel over it, a frame, glass or a door leaf, and a sill or a step. The lintel is an
// IfcBeam and the other parts are proxies. It gives back the lintels.
function fillOpenings({ model, put, own }: Kit, openings: Opening[]): Id[] {
  const one = (shape: Parameters<typeof getSolids>[0]): Body => unwrap(clone(getSolids(own(shape))[0]!)) as Body;
  const part = (tone: Tone, name: string, solid: Body, materialName: string): Id => put(tone, model.addProxy({ name, solid, materialName }));
  const lintels: Id[] = [];
  for (const { side, door, at, width, height, sill } of openings) {
    // A block in the wall of this opening: u along the wall from the opening, d into the wall, z from the floor.
    const block = (u0: number, u1: number, d0: number, d1: number, z0: number, z1: number): Body => {
      const a = side.from + at + (u0 + u1) / 2, b = side.face + side.into * (d0 + d1) / 2;
      return side.along === 'x' ? box(u1 - u0, d1 - d0, z1 - z0, { at: [a, b, (z0 + z1) / 2] }) : box(d1 - d0, u1 - u0, z1 - z0, { at: [b, a, (z0 + z1) / 2] });
    };
    const top = sill + height, depth = 3 * COURSE, mid = side.face + side.into * T / 2, start = side.from + at - BEARING;
    lintels.push(put('stone', model.addBeam({
      length: width + 2 * BEARING, profile: { kind: 'RECTANGULAR', width: T, height: depth },
      origin: side.along === 'x' ? [start, mid, top + depth / 2] : [mid, start, top + depth / 2], axisX: side.along === 'x' ? X : Y, axisZ: Z, predefinedType: 'LINTEL', materialName: 'Precast concrete',
    })));
    const f = FRAME.face, d0 = FRAME.back, d1 = d0 + FRAME.depth, g0 = (d0 + d1 - FRAME.glass) / 2;
    if (door) {
      const jamb = (width - LEAF.width) / 2 - 2, head = height - 18 - LEAF.height - 6, z0 = 18, l0 = jamb + 2, l1 = l0 + LEAF.width;
      part('frame', 'Door frame', one(unwrap(fuseAll([own(block(0, jamb, d0, d1, 0, height)), own(block(width - jamb, width, d0, d1, 0, height)), own(block(jamb, width - jamb, d0, d1, height - head, height))]))), 'Timber');
      part('metal', 'Threshold', block(jamb, width - jamb, d0 - 20, d1, 0, 15), 'Aluminium');
      // The leaf has four sunk panels and a glazed light on its outer face.
      const panels = [0, 1].flatMap((j) => [0, 1].map((k) => own(block(l0 + 110 + j * (LEAF.width - 110) / 2, l0 + (j + 1) * (LEAF.width - 110) / 2, d0 + 9, d0 + 18, z0 + 180 + k * 760, z0 + 180 + k * 760 + (k === 0 ? 640 : 520)))));
      const light = [l0 + 190, l1 - 190, z0 + 1560, z0 + LEAF.height - 180] as const;
      part('leaf', 'Door leaf', one(unwrap(cutAll(own(block(l0, l1, d0 + 10, d0 + 10 + LEAF.thickness, z0, z0 + LEAF.height)), [...panels, own(block(light[0], light[1], d0 + 9, d0 + 11 + LEAF.thickness, light[2], light[3]))]))), 'Timber, painted');
      part('glass', 'Door glazing', block(light[0], light[1], d0 + 22, d0 + 42, light[2], light[3]), 'Glass');
      part('metal', 'Door handle', one(unwrap(fuseAll([own(block(l1 - 90, l1 - 40, d0 - 2, d0 + 10, 960, 1040)), own(block(l1 - 190, l1 - 50, d0 - 40, d0 - 2, 992, 1008))]))), 'Steel');
      part('stone', 'Door step', block(-150, width + 150, -600, -100, -STEP, -10), 'Cast stone');
      continue;
    }
    // A window: a stone sill, a frame with a light for each 600 mm, and the glass.
    const s = COURSE, count = Math.max(1, Math.round(width / 600)), clear = (width - (count + 1) * f) / count;
    part('stone', 'Window sill', block(0, width, -60, T, sill, sill + s), 'Cast stone');
    const lights = Array.from({ length: count }, (_, i) => [f + i * (clear + f), f + i * (clear + f) + clear] as const);
    part('frame', 'Window frame', one(unwrap(cutAll(own(block(0, width, d0, d1, sill + s, top)), lights.map(([u0, u1]) => own(block(u0, u1, d0 - 1, d1 + 1, sill + s + f, top - f)))))), 'Timber');
    for (const [u0, u1] of lights) part('glass', 'Glazing', block(u0, u1, g0, g0 + FRAME.glass, sill + s + f, top - f), 'Glass');
  }
  return lintels;
}

// The trim: boards on the two gables, a ridge cap and a gutter on each eave, a timber floor, and the ground with a
// path to the door. The parts on the roof go up with it.
function trim({ model, put, own, lifted, L, slope }: Kit): void {
  const one = (shape: Parameters<typeof getSolids>[0]): Body => unwrap(clone(getSolids(own(shape))[0]!)) as Body;
  const part = (tone: Tone, name: string, solid: Body, materialName: string): Id => put(tone, model.addProxy({ name, solid, materialName }));
  const rad = slope * Math.PI / 180, tan = Math.tan(rad), top = H + ROOF.depth, rise = (W / 2 + ROOF.eave) * tan;
  for (const x of [-ROOF.verge - 22, L + ROOF.verge]) {
    // The boards leave the edge of the roof free: 120 mm in from the eaves, and a constant drop under the slopes.
    const inset = 120, y0 = -ROOF.eave + inset, y1 = W + ROOF.eave - inset, drop = inset / Math.cos(rad) - inset * tan;
    const face = own(unwrap(polygon([[x, y0, H + 30], [x, y1, H + 30], [x, y1, top + inset * tan - drop], [x, W / 2, top + rise - drop], [x, y0, top + inset * tan - drop]])));
    lifted.add(part('timber', 'Gable boards', unwrap(extrude(face, [22, 0, 0])) as Body, 'Timber'));
  }
  // The ridge cap lies on the two slopes.
  const half = 170, t = 18, zr = top + rise;
  const cap = own(unwrap(polygon([[0, W / 2 - half, zr - half * tan], [0, W / 2, zr], [0, W / 2 + half, zr - half * tan], [0, W / 2 + half, zr - half * tan + t / Math.cos(rad)], [0, W / 2, zr + t / Math.cos(rad)], [0, W / 2 - half, zr - half * tan + t / Math.cos(rad)]])));
  lifted.add(part('metal', 'Ridge cap', translate(own(unwrap(extrude(cap, [L + 2 * ROOF.verge, 0, 0])) as Body), [-ROOF.verge, 0, 0]), 'Clay'));
  for (const side of [-1, 1]) {
    const y = W / 2 + side * (W / 2 + ROOF.eave + 60);
    const channel = one(unwrap(cutAll(own(box(L + 2 * ROOF.verge, 120, 75, { at: [L / 2, y, H + 60] })), [own(box(L + 2 * ROOF.verge - 12, 108, 75, { at: [L / 2, y, H + 66] }))])));
    lifted.add(part('metal', 'Gutter', channel, 'Aluminium'));
  }
  put('floor', model.addCovering({ length: L - 2 * T, width: W - 2 * T, thickness: 20, origin: [T, T, 0], axisX: X, axisZ: Z, predefinedType: 'FLOORING', materialName: 'Oak boards' }));
  // The ground is 150 mm under the floor. An opening in it takes the foundation slab.
  const ground = put('ground', model.addSlab({ length: L + 4200, width: W + 2600, thickness: 100, origin: [-1300, -1300, -STEP - 100], axisX: X, axisZ: Z, predefinedType: 'BASESLAB', materialName: 'Topsoil' }));
  unwrap(model.addSlabOpening({ slabLocalId: ground, offsetX: 1200, offsetY: 1200, sizeX: L + 200, sizeY: W + 200 }));
  for (let i = 0; i < 3; i++) part('stone', 'Paving slab', box(600, 900, 40, { at: [L + 950 + i * 640, W / 2, -STEP + 20] }), 'Cast stone');
}

// Try studio({ roofLift: 1 }), studio({ pitch: 45 }) or studio({ length: 8000 }).
const scene = studio();
console.log('Room: the kernel measures ' + scene.spaceM3.toFixed(2) + ' m3 in the IfcSpace, which is ' + scene.floorM2.toFixed(2) + ' m2 of floor. Length x width x height gives ' + scene.byHand.toFixed(2) + ' m3.');
// The tree panel shows the IFC structure. The IFC button saves the model as a file.
export default present(scene.shown, {
  bimTree: scene.model.toTreeSummary(),
  ifc: async () => unwrap(await toIfc(scene.model, { applicationName: 'brepjs playground', applicationVersion: '1.0' })),
});`,
  },
  {
    id: 'bim-switchback-stair',
    label: 'Switchback Stair',
    description:
      'A stair core as a BIM model: a half-turn stair for each storey, with two flights that go opposite ways, a half landing at the turn, a wall with a door at each floor, railings on the landings and a balustrade along each flight. The stair is an IfcStair with no solid of its own, and placedSolids() gives its flights. The rise, the going, the flight length, the widths and the heights of handrail and guarding follow the limits of a building code for a general access stair, and the kernel measures the concrete. The wall, the doors and the shape of the balustrade are a display model.',
    code: `import { BimModel, placedSolids, toIfc } from 'brepjs-bim';
import { box, clone, compound, cutAll, cylinder, extrude, fuseAll, getSolids, measureVolume, polygon, translate, unwrap } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';

// Stair core as a BIM model: a half-turn stair for each storey. Two flights go opposite ways in two lanes with a
// half landing at the turn. The stair is an IfcStair with no solid of its own: placedSolids() gives its flights.
// The rise, the going, the flight length, the widths and the heights of handrail and guarding are the limits of
// a building code for a general access stair. The wall, the door and the shape of the balustrade are a display
// model. Units are millimetres. The flights go along Y, and the open side of the core looks to +X.
interface StairParams {
  storeys?: number; // 1 to 4
  storeyHeight?: number; // floor to floor, 2400 to 4080
  width?: number; // width of a flight
}

// ---- published figures (general access stair)
const RISE = { min: 150, max: 170 };
const GOING = 300; // 250 to 400 is allowed
const COMFORT = { min: 550, max: 700 }; // twice the rise plus the going
const MAX_RISERS = 12; // in one flight
const MIN_WIDTH = 1200; // between walls. A landing is as long as the flight is wide, or longer
const HANDRAIL = 950; // above the pitch line: 900 to 1000
const GUARD = 1100; // guarding of a landing

// ---- display model
const WELL = 200, WAIST = 150, SLAB = 200, WALL = 200;
const RAIL = { post: 16, top: 22, mid: 12, inset: 60, guard: 50 };
const DOOR = { width: 1010, height: 2110 };
const COLORS = { stair: '#d8d4c8', landing: '#c2bdaf', wall: '#a8a294', rail: '#12b5b0', frame: '#f5f2ea', leaf: '#ff5a1f', ground: '#8d887c' };
type Tone = keyof typeof COLORS;
type P3 = [number, number, number];
type Body = ReturnType<typeof box>;
type Id = Extract<ReturnType<BimModel['addStair']>, { ok: true }>['value']; // the id of an element in the model
const X: P3 = [1, 0, 0], Y: P3 = [0, 1, 0], Z: P3 = [0, 0, 1], BACK: P3 = [0, -1, 0];

function stairCore({ storeys = 2, storeyHeight = 3600, width = MIN_WIDTH }: StairParams = {}) {
  const model = new BimModel(), owned: { delete(): void }[] = [];
  const own = <T extends { delete(): void }>(s: T): T => { owned.push(s); return s; };
  try {
    model.init({ name: 'Stair core' });
    const site = unwrap(model.addSite({ name: 'Site' }));
    const building = unwrap(model.addBuilding({ name: 'Building' }));
    const storey = unwrap(model.addStorey({ name: 'Ground floor', elevation: 0 }));
    const project = model.getProject();
    if (project) model.aggregate(project.localId, site);
    model.aggregate(site, building);
    model.aggregate(building, storey);
    const tones = new Map<Id, Tone>();
    const put = (tone: Tone, made: ReturnType<BimModel['addStair']>): Id => {
      const id = unwrap(made);
      model.placeIn(id, storey);
      tones.set(id, tone);
      return id;
    };
    const concrete = { materialName: 'Concrete' };

    // The storey height gives the steps: an even number of equal risers, each 170 mm or less, in two flights.
    const levels = Math.min(Math.max(Math.round(storeys), 1), 4), H = Math.min(Math.max(storeyHeight, 2400), 2 * MAX_RISERS * RISE.max);
    const risers = 2 * Math.ceil(H / 2 / RISE.max), rise = H / risers, n = risers / 2, run = n * GOING;
    const W = Math.max(width, MIN_WIDTH), across = 2 * W + WELL, foot = WAIST / Math.cos(Math.atan2(rise, GOING)) * GOING / rise;
    const landing = W + foot, far = run + landing; // a landing also takes the foot of the flight that starts on it

    // The stair of one storey. A flight is a stepped solid that goes up along its axisX, with its width on the left.
    // Flight 1 goes up along +Y in the lane on the +X side. Flight 2 comes back along -Y in the other lane.
    const flight = { width: W, riserHeight: rise, treadLength: GOING, numberOfRisers: n, axisZ: Z, ...concrete };
    const stairs: Id[] = [];
    for (let level = 0; level < levels; level++) {
      const z = level * H;
      stairs.push(put('stair', model.addStair({
        name: 'Stair ' + (level + 1),
        predefinedType: 'HALF_TURN_STAIR',
        flights: [{ ...flight, origin: [across, 0, z], axisX: Y }, { ...flight, origin: [0, run + foot, z + H / 2], axisX: BACK }],
        ...concrete,
      })));
      // The half landing at the turn. Both flights meet it.
      put('landing', model.addSlab({ length: across, width: landing, thickness: SLAB, origin: [0, run, z + H / 2 - SLAB], axisX: X, axisZ: Z, predefinedType: 'LANDING', ...concrete }));
      // The landing at the floor over it, where flight 2 arrives.
      put('landing', model.addSlab({ length: across, width: landing, thickness: SLAB, origin: [0, foot - landing, z + H - SLAB], axisX: X, axisZ: Z, predefinedType: 'LANDING', ...concrete }));
    }

    const kit = { model, put, own, levels, H, W, across, run, foot, landing, far, rise, n };
    enclose(kit);
    guard(kit);

    // The view. placedSolids() gives the two flights of each stair in their places. A flight in the model is solid
    // down to its foot. The view cuts the waist under each flight, as a concrete stair has it.
    const groups: Record<Tone, Body[]> = { stair: [], landing: [], wall: [], rail: [], frame: [], leaf: [], ground: [] };
    const drop = WAIST / Math.cos(Math.atan2(rise, GOING));
    let concreteM3 = 0;
    for (const el of model.getAllElements()) {
      const tone = tones.get(el.localId);
      if (!tone) continue;
      const placed = unwrap(placedSolids(el)).map((body) => own(body));
      if (tone === 'stair' || tone === 'landing') concreteM3 += placed.reduce((sum, body) => sum + unwrap(measureVolume(body)), 0) / 1e9;
      const level = stairs.indexOf(el.localId);
      if (level < 0) { groups[tone].push(...placed); continue; }
      placed.forEach((body, i) => {
        const z = level * H + i * H / 2, y0 = i === 0 ? 0 : run + foot, way = i === 0 ? 1 : -1, x0 = i === 0 ? W + WELL : 0;
        const under = own(unwrap(polygon([[x0 - 1, y0 + way * foot, z - 1], [x0 - 1, y0 + way * run + way, z - 1], [x0 - 1, y0 + way * run + way, z + n * rise - drop], [x0 - 1, y0 + way * foot, z]])));
        groups.stair.push(own(unwrap(cutAll(body, [own(unwrap(extrude(under, [W + 2, 0, 0])))]))));
      });
    }
    const shown = (Object.keys(COLORS) as Tone[]).filter((tone) => groups[tone].length > 0).map((tone) => color(compound(groups[tone]), COLORS[tone]));
    return { model, shown, concreteM3, risers, rise, comfort: 2 * rise + GOING, pitch: Math.atan2(rise, GOING) * 180 / Math.PI };
  } catch (error) {
    model[Symbol.dispose]();
    throw error;
  } finally {
    owned.splice(0).forEach((body) => body.delete());
  }
}

type Kit = {
  model: BimModel; put: (tone: Tone, made: ReturnType<BimModel['addStair']>) => Id; own: <T extends { delete(): void }>(s: T) => T;
  levels: number; H: number; W: number; across: number; run: number; foot: number; landing: number; far: number; rise: number; n: number;
};

// The core: a ground slab, the wall behind the stair and a door from each floor landing. The other three sides
// stay open in this model.
function enclose({ model, put, own, levels, H, across, foot, landing, far }: Kit): void {
  const one = (shape: Parameters<typeof getSolids>[0]): Body => unwrap(clone(getSolids(own(shape))[0]!)) as Body;
  const y0 = foot - landing, length = far - y0;
  put('ground', model.addSlab({ length: across + WALL + 300, width: length + 600, thickness: 250, origin: [-WALL, y0 - 300, -250], axisX: X, axisZ: Z, predefinedType: 'BASESLAB', materialName: 'Concrete' }));
  // The wall is along +Y, so its thickness goes to -X.
  const wall = put('wall', model.addWall({ length, height: levels * H + DOOR.height + 300, thickness: WALL, origin: [0, y0, 0], axisX: Y, axisZ: Z, materialName: 'Concrete', loadBearing: true }));
  for (let level = 0; level <= levels; level++) {
    const z = level * H, at = 150, d0 = -WALL + 40, d1 = d0 + 100, jamb = 45, head = 45;
    put('frame', model.addDoor({ wallLocalId: wall, width: DOOR.width, height: DOOR.height, offsetAlongWall: at, offsetFromFloor: z, materialName: 'Steel', fireRating: 'FD30' }));
    const block = (u0: number, u1: number, x0: number, x1: number, z0: number, z1: number): Body => box(x1 - x0, u1 - u0, z1 - z0, { at: [(x0 + x1) / 2, y0 + at + (u0 + u1) / 2, z + (z0 + z1) / 2] });
    const w = DOOR.width, h = DOOR.height;
    put('frame', model.addProxy({ name: 'Door frame', solid: one(unwrap(fuseAll([own(block(0, jamb, d0, d1, 0, h)), own(block(w - jamb, w, d0, d1, 0, h)), own(block(jamb, w - jamb, d0, d1, h - head, h))]))), materialName: 'Steel' }));
    const light = own(block(w - jamb - 330, w - jamb - 130, d1 - 60, d1 - 10, 1250, 1750));
    put('leaf', model.addProxy({ name: 'Fire door leaf', solid: one(unwrap(cutAll(own(block(jamb + 3, w - jamb - 3, d1 - 55, d1 - 11, 8, h - head - 3)), [light]))), materialName: 'Timber, painted' }));
  }
}

// Guarding: an IfcRailing on the open edges of each landing, and a balustrade with a handrail along each flight.
// A railing is level, so the balustrade of a flight is a proxy.
function guard({ model, put, own, levels, H, W, across, run, foot, landing, far, rise, n }: Kit): void {
  const one = (shape: Parameters<typeof getSolids>[0]): Body => unwrap(clone(getSolids(own(shape))[0]!)) as Body;
  const t = RAIL.guard;
  // A railing from one point to the next at level z. Its thickness is on the left of its direction.
  const rail = (from: [number, number], to: [number, number], z: number): void => {
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    put('rail', model.addRailing({ length, height: GUARD, thickness: t, origin: [from[0], from[1], z], axisX: [(to[0] - from[0]) / length, (to[1] - from[1]) / length, 0], axisZ: Z, predefinedType: 'GUARDRAIL', infill: 'POSTED', materialName: 'Steel' }));
  };
  // The balustrade of one flight: posts on the treads, a handrail and a mid rail. u goes up the flight, and the
  // pitch line joins the nosings.
  const balustrade = (place: (u: number, z: number) => P3, way: 1 | -1): Body => {
    const slope = rise / GOING, pitch = (u: number): number => rise + u * slope, axis: P3 = [0, way * GOING, rise];
    const bar = (radius: number, over: number): Body => {
      const from = place(GOING / 2 - 60, pitch(GOING / 2 - 60) + over), reach = (n - 1) * GOING + 120;
      return own(cylinder(radius, reach * Math.hypot(1, slope), { at: from, axis }));
    };
    const posts = Array.from({ length: n }, (_, i) => i).filter((i) => i % 2 === 0 || i === n - 1).map((i) => {
      const u = (i + 0.5) * GOING, top = pitch(u) + HANDRAIL - RAIL.top;
      return own(cylinder(RAIL.post, top - (i + 1) * rise, { at: place(u, (i + 1) * rise) }));
    });
    return one(unwrap(fuseAll([bar(RAIL.top, HANDRAIL - RAIL.top), bar(RAIL.mid, HANDRAIL / 2), ...posts])));
  };
  const first = own(balustrade((u, z) => [across - RAIL.inset, u, z], 1));
  const second = own(balustrade((u, z) => [W - RAIL.inset, run + foot - u, H / 2 + z], -1));
  const y0 = foot - landing;
  for (let level = 0; level < levels; level++) {
    const z = level * H;
    put('rail', model.addProxy({ name: 'Balustrade', solid: translate(first, [0, 0, z]), materialName: 'Steel' }));
    put('rail', model.addProxy({ name: 'Balustrade', solid: translate(second, [0, 0, z]), materialName: 'Steel' }));
    // Half landing: the +X edge and the far end.
    rail([across, run], [across, far - t], z + H / 2);
    rail([across, far], [0, far], z + H / 2);
    // Floor landing over it: the near end and the +X edge. On the top floor the edge over the flights is closed too.
    const top = level === levels - 1;
    rail([0, y0], [across, y0], z + H);
    rail([across, y0 + t], [across, top ? foot - t : 0], z + H);
    if (top) rail([across, foot], [W, foot], z + H);
  }
}

// Try stairCore({ storeys: 3 }), stairCore({ storeyHeight: 3000 }) or stairCore({ width: 1500 }).
const scene = stairCore();
console.log(scene.risers + ' risers of ' + scene.rise.toFixed(1) + ' mm for each storey, going ' + GOING + ' mm, pitch ' + scene.pitch.toFixed(1) + ' degrees. 2R + G = ' + scene.comfort.toFixed(0) + ' mm, and ' + COMFORT.min + ' to ' + COMFORT.max + ' is allowed. The kernel measures ' + scene.concreteM3.toFixed(2) + ' m3 of concrete in the flights and the landings of the model.');
// The tree panel shows the IFC structure. The IFC button saves the model as a file.
export default present(scene.shown, {
  bimTree: scene.model.toTreeSummary(),
  ifc: async () => unwrap(await toIfc(scene.model, { applicationName: 'brepjs playground', applicationVersion: '1.0' })),
});`,
  },
  {
    id: 'bim-roof-gallery',
    label: 'Roof Gallery',
    description:
      'Six roofs of the brepjs-bim roof builder on six small pavilions: gable, hip, pyramid, flat, shed and dome. Each one is a real IfcRoof solid that one addRoof call shapes from its type and its pitch, and the IFC export writes each body. The 35 degree pitch is the published minimum for clay plain tiles. The kernel measures the tiled area of each roof: the gable and the hip have the same area. The pavilions are a display model.',
    code: `import { BimModel, placedSolids, toIfc } from 'brepjs-bim';
import { box, compound, faceCenter, getBounds, getFaces, measureArea, normalAt, translate, unwrap } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';

// Roof gallery: the roof shapes of the brepjs-bim roof builder, each one a real IfcRoof on a small pavilion.
// The lesson is in CATALOGUE and in roofOf(): one addRoof call, and predefinedType with pitch selects the shape.
// The pavilions are a display model. Units are millimetres, Z is up, and the fronts look toward +X.
interface GalleryParams {
  pitch?: number; // degrees, for the gable, the hip and the pyramid
  eaves?: number; // how far each roof goes past its walls
  lift?: number; // raise each roof off its walls to show it as one solid
}

type P3 = [number, number, number];
type Id = Extract<ReturnType<BimModel['addRoof']>, { ok: true }>['value'];
type Body = ReturnType<typeof box>;
const X: P3 = [1, 0, 0], Y: P3 = [0, 1, 0], Z: P3 = [0, 0, 1];

// ---- published figures
const TILE_PITCH = 35; // degrees: the smallest pitch for clay plain tiles

// ---- display model
const SHED_PITCH = 15;
const DOOR = { width: 900, height: 2100 };
const WALL = { height: 2700, thickness: 300 };
const FLOOR = { thickness: 200, edge: 150 };
const COURT = 1800; // paving past the pavilions
const GRID = 9300; // from one pavilion to the next
// One entry for each roof: its type, its pitch, the plan of its walls, and its place in the grid.
const CATALOGUE = [
  { name: 'Gable', kind: 'GABLE_ROOF', pitch: TILE_PITCH, plan: [4800, 6600], at: [0, 0] },
  { name: 'Hip', kind: 'HIP_ROOF', pitch: TILE_PITCH, plan: [4800, 6600], at: [0, 1] },
  { name: 'Pyramid', kind: 'HIP_ROOF', pitch: TILE_PITCH, plan: [5400, 5400], at: [0, 2] }, // a hip on a square plan
  { name: 'Flat', kind: 'FLAT_ROOF', pitch: undefined, plan: [4800, 6600], at: [1, 0] },
  { name: 'Shed', kind: 'SHED_ROOF', pitch: SHED_PITCH, plan: [4800, 6600], at: [1, 1] },
  { name: 'Dome', kind: 'DOME_ROOF', pitch: TILE_PITCH, plan: [5400, 5400], at: [1, 2] }, // the dome ignores the pitch
] as const;
type Entry = (typeof CATALOGUE)[number];

function gallery({ pitch = TILE_PITCH, eaves = 450, lift = 0 }: GalleryParams = {}) {
  const model = new BimModel();
  model.init({ name: 'Roof gallery' });
  const site = unwrap(model.addSite({ name: 'Site' }));
  const building = unwrap(model.addBuilding({ name: 'Pavilions' }));
  const storey = unwrap(model.addStorey({ name: 'Ground floor', elevation: 0 }));
  const project = model.getProject();
  if (project) model.aggregate(project.localId, site);
  model.aggregate(site, building);
  model.aggregate(building, storey);
  const put = (made: ReturnType<BimModel['addRoof']>): Id => {
    const id = unwrap(made);
    model.placeIn(id, storey);
    return id;
  };

  // THE LESSON. A roof is a plan of length by width, a thickness, a type and a pitch. The ridge runs along the
  // local X axis. With axisX along +Y the width goes toward -X, so the origin is the front corner of the eaves.
  const roofOf = (e: Entry, x0: number, y0: number): Id => {
    const [a, b] = e.plan;
    const dome = e.kind === 'DOME_ROOF';
    const out = dome ? -300 : eaves; // the dome stands inside the edge of its flat deck
    const slope = e.pitch === undefined ? undefined : e.kind === 'SHED_ROOF' || dome ? e.pitch : pitch;
    return put(model.addRoof({
      length: b + 2 * out, width: a + 2 * out, thickness: e.kind === 'FLAT_ROOF' ? 250 : 120,
      origin: [x0 + a + out, y0 - out, WALL.height + lift + (dome ? 200 : 0)], axisX: Y, axisZ: Z,
      predefinedType: e.kind, pitch: slope, materialName: e.kind === 'FLAT_ROOF' ? 'Membrane' : 'Clay tile',
    }));
  };
  const roofs = CATALOGUE.map((e) => roofOf(e, e.at[0] * GRID, e.at[1] * GRID));

  // The scenery: a pavilion under each roof, on one paved court.
  const owned: Body[] = [];
  const fills: { glass: Id[]; door: Id[]; sill: Id[]; step: Id[] } = { glass: [], door: [], sill: [], step: [] };
  const block = (name: string, lo: P3, hi: P3, material: string): Id => {
    const unit = box(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
    owned.push(unit);
    return put(model.addProxy({ name, solid: translate(unit, lo), materialName: material }));
  };
  for (const e of CATALOGUE) {
    const [a, b] = e.plan, t = WALL.thickness, x0 = e.at[0] * GRID, y0 = e.at[1] * GRID;
    const wall = (length: number, origin: P3, axisX: P3): Id =>
      put(model.addWall({ length, height: WALL.height, thickness: t, origin, axisX, axisZ: Z, materialName: 'Rendered masonry', isExternal: true }));
    const front = wall(b, [x0 + a, y0, 0], Y); // the thickness goes toward -X
    wall(b, [x0, y0 + b, 0], [0, -1, 0]);
    const south = wall(a - 2 * t, [x0 + t, y0, 0], X);
    const north = wall(a - 2 * t, [x0 + a - t, y0 + b, 0], [-1, 0, 0]);
    put(model.addSlab({ length: a + 2 * FLOOR.edge, width: b + 2 * FLOOR.edge, thickness: FLOOR.thickness, origin: [x0 - FLOOR.edge, y0 - FLOOR.edge, -FLOOR.thickness], axisX: X, axisZ: Z, predefinedType: 'BASESLAB', materialName: 'Concrete' }));
    if (e.kind === 'DOME_ROOF') put(model.addSlab({ length: a + 2 * eaves, width: b + 2 * eaves, thickness: 200, origin: [x0 - eaves, y0 - eaves, WALL.height], axisX: X, axisZ: Z, predefinedType: 'ROOF', materialName: 'Concrete' }));

    // The door and a window in the front, and a window in each side. Each opening is a void in its wall.
    const door = { ...DOOR, offsetAlongWall: 900, offsetFromFloor: 0 };
    const pane = { width: 1500, height: 1200, offsetAlongWall: b - 2700, offsetFromFloor: 900 };
    const side = { ...pane, offsetAlongWall: (a - 2 * t - pane.width) / 2 };
    put(model.addDoor({ ...door, wallLocalId: front, materialName: 'Timber' }));
    put(model.addWindow({ ...pane, wallLocalId: front, materialName: 'Aluminium' }));
    put(model.addWindow({ ...side, wallLocalId: south, materialName: 'Aluminium' }));
    put(model.addWindow({ ...side, wallLocalId: north, materialName: 'Aluminium' }));
    // A leaf, a pane of glass and a sill are proxies in the outer part of each opening. The IFC writer gives
    // each door and window a panel in the inner 100 mm of its wall, so the proxies stay out of that part.
    const fx = x0 + a, sx = x0 + t + side.offsetAlongWall, top = pane.offsetFromFloor + pane.height;
    fills.door.push(block('Door leaf', [fx - 140, y0 + door.offsetAlongWall, 0], [fx - 90, y0 + door.offsetAlongWall + door.width, door.height], 'Timber'));
    fills.step.push(block('Step', [fx + FLOOR.edge, y0 + door.offsetAlongWall - 200, -FLOOR.thickness], [fx + FLOOR.edge + 500, y0 + door.offsetAlongWall + door.width + 200, -40], 'Stone'));
    fills.glass.push(block('Glazing', [fx - 160, y0 + pane.offsetAlongWall, 950], [fx - 130, y0 + pane.offsetAlongWall + pane.width, top], 'Glass'));
    fills.sill.push(block('Sill', [fx - t + 100, y0 + pane.offsetAlongWall, 900], [fx + 60, y0 + pane.offsetAlongWall + pane.width, 950], 'Stone'));
    for (const [glassAt, sillAt] of [[y0 + 130, y0 - 60], [y0 + b - 160, y0 + b - t + 100]] as const) {
      fills.glass.push(block('Glazing', [sx, glassAt, 950], [sx + side.width, glassAt + 30, top], 'Glass'));
      fills.sill.push(block('Sill', [sx, sillAt, 900], [sx + side.width, sillAt + t - 40, 950], 'Stone'));
    }
  }
  const court = put(model.addSlab({ length: GRID + 5400 + 2 * COURT, width: 2 * GRID + 6600 + 2 * COURT, thickness: 150, origin: [-COURT, -COURT, -FLOOR.thickness - 150], axisX: X, axisZ: Z, predefinedType: 'BASESLAB', materialName: 'Paving' }));

  // The kernel measures the tiled area of each roof: every face that is not vertical and is not the underside.
  const elements = new Map(model.getAllElements().map((el) => [el.localId, el]));
  const solidsOf = (ids: readonly Id[]): Body[] => {
    const list = ids.flatMap((id) => unwrap(placedSolids(elements.get(id) as never)) as Body[]);
    owned.push(...list);
    return list;
  };
  const tiled = solidsOf(roofs).map((roof) => {
    const base = getBounds(roof).zMin;
    const faces = getFaces(roof).filter((f) => Math.abs(normalAt(f)[2]) > 0.05 && faceCenter(f)[2] > base + 1);
    return faces.reduce((sum, f) => sum + unwrap(measureArea(f)), 0) / 1e6;
  });
  const shown = {
    roofs: compound(solidsOf(roofs)),
    walls: compound(solidsOf(model.getWalls().map((w) => w.localId))),
    floors: compound(solidsOf(model.getSlabs().map((s) => s.localId).filter((id) => id !== court))),
    court: compound(solidsOf([court])),
    doors: compound(solidsOf(fills.door)),
    glass: compound(solidsOf(fills.glass)),
    sills: compound(solidsOf([...fills.sill, ...fills.step])),
  };
  owned.splice(0).forEach((s) => s.delete());
  return { model, shown, tiled, pitch };
}

// Try gallery({ pitch: 50 }), gallery({ eaves: 900 }) or gallery({ lift: 1500 }).
const g = gallery();
const area = (name: string): string => (g.tiled[CATALOGUE.findIndex((e) => e.name === name)] as number).toFixed(1);
console.log('Roof area from the kernel, in m2: gable ' + area('Gable') + ', hip ' + area('Hip') + ' (the same plan and pitch give the same area: plan / cos ' + g.pitch + '), pyramid ' + area('Pyramid') + ', flat ' + area('Flat') + ', shed ' + area('Shed') + ', dome ' + area('Dome'));

export default present(
  [
    color(g.shown.roofs, '#12b5b0'),
    color(g.shown.walls, '#f5f2ea'),
    color(g.shown.floors, '#c3c9d1'),
    color(g.shown.court, '#48515c'),
    color(g.shown.doors, '#ff5a1f'),
    color(g.shown.glass, '#9fc3d4'),
    color(g.shown.sills, '#c3c9d1'),
  ],
  {
    bimTree: g.model.toTreeSummary(),
    ifc: async () => unwrap(await toIfc(g.model, { applicationName: 'brepjs playground', applicationVersion: '1.0' })),
  },
);`,
  },
  {
    id: 'bim-space-volume',
    label: 'Space Volume',
    description:
      'An IfcSpace is the volume of a room, an element of its own that plain solid modelling does not have. Two rooms of an office floor, each with its space lifted out above it to show the volume as a solid: set lift to 0 to put it back. The kernel measures each volume, and the published rule of 11 cubic metres of room for each person gives the people that the room has volume for. The rooms and the furniture are a display model.',
    code: `import { BimModel, placedSolids, toIfc } from 'brepjs-bim';
import { box, compound, cylinder, measureVolume, translate, unwrap } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';

// Space volume: an IfcSpace is the volume of a room, an element of its own with no part to touch.
// Two rooms of an office floor, and above each room its space, lifted out to show it as a solid.
// The lesson is the SPACES table and the addSpace call. The rooms are a display model. Units are millimetres.
interface SpaceParams {
  lift?: number; // how far the view raises each space above its room. 0 puts it back
  height?: number; // clear height of the rooms, from the floor finish to the ceiling
  cutaway?: boolean; // leave the corridor partition off in the view. The model and the IFC file keep it
}

type P3 = [number, number, number];
type Made = ReturnType<BimModel['addSpace']>;
type Id = Extract<Made, { ok: true }>['value'];
type Body = ReturnType<typeof box>;
type Tone = 'space' | 'wall' | 'slab' | 'carpet' | 'rug' | 'glass' | 'wood' | 'seat' | 'dark';
const X: P3 = [1, 0, 0], Y: P3 = [0, 1, 0], Z: P3 = [0, 0, 1];

// ---- published figures
const ROOM_PER_PERSON = 11; // m3 of empty room for each person who works in it
const COUNTED_HEIGHT = 3000; // a room that is higher than this counts as 3.0 m high

// ---- display model
const FINISH = 10; // the floor finish on the slab
const WALL = { height: 3000, facade: 300, partition: 100 };
const DEPTH = 4500, LENGTH = 11500, SPLIT = 7200; // the plan: X is into the room, Y is along the facade
// One row for each room: the corner of its floor and its size in plan.
const SPACES = [
  { name: 'Office 1.01', longName: 'Open office', at: [0, 0], size: [DEPTH, SPLIT], seats: 6 },
  { name: 'Meeting 1.02', longName: 'Meeting room', at: [0, SPLIT + WALL.partition], size: [DEPTH, LENGTH - SPLIT - WALL.partition], seats: 4 },
] as const;

function floor({ lift = 4800, height = 2700, cutaway = true }: SpaceParams = {}) {
  const model = new BimModel();
  model.init({ name: 'Space volume' });
  const site = unwrap(model.addSite({ name: 'Site' }));
  const building = unwrap(model.addBuilding({ name: 'Office building' }));
  const storey = unwrap(model.addStorey({ name: 'First floor', elevation: 0 }));
  const project = model.getProject();
  if (project) model.aggregate(project.localId, site);
  model.aggregate(site, building);
  model.aggregate(building, storey);
  const placed: { id: Id; tone: Tone; hidden: boolean }[] = [];
  const put = (tone: Tone, made: Made, hidden = false): Id => {
    const id = unwrap(made);
    model.placeIn(id, storey);
    placed.push({ id, tone, hidden });
    return id;
  };

  // THE LESSON. A space is a box of air: a name, a plan, a clear height and a place. It fills its room from the
  // floor finish to the ceiling and from wall face to wall face. It is in the storey like each other element.
  const spaces = SPACES.map((s) =>
    put('space', model.addSpace({
      name: s.name, longName: s.longName, length: s.size[0], width: s.size[1], height,
      origin: [s.at[0], s.at[1], FINISH], axisX: X, axisZ: Z, predefinedType: 'INTERNAL', materialName: 'Air',
    })),
  );

  // The rooms. The facade is at x = 0. A wall goes toward its local Y from its axis: that is -X when it runs along +Y.
  const wall = { height: WALL.height, axisZ: Z, materialName: 'Plasterboard on studs' };
  const facade = put('wall', model.addWall({ ...wall, length: LENGTH, thickness: WALL.facade, origin: [0, 0, 0], axisX: Y, materialName: 'Rendered masonry', isExternal: true }));
  const cross = put('wall', model.addWall({ ...wall, length: DEPTH, thickness: WALL.partition, origin: [0, SPLIT, 0], axisX: X }));
  const aisle = put('wall', model.addWall({ ...wall, length: LENGTH, thickness: WALL.partition, origin: [DEPTH + WALL.partition, 0, 0], axisX: Y }), cutaway);
  // Each space knows the walls that bound it.
  for (const space of spaces) for (const bound of [facade, cross, aisle])
    model.addSpaceBoundary(space, bound, 'PHYSICAL');

  const slab = put('slab', model.addSlab({ length: DEPTH + WALL.partition + WALL.facade, width: LENGTH, thickness: 250, origin: [-WALL.facade, 0, -250], axisX: X, axisZ: Z, predefinedType: 'FLOOR', materialName: 'Concrete' }));
  SPACES.forEach((s, i) => {
    const made = model.addCovering({ length: s.size[0], width: s.size[1], thickness: FINISH, origin: [s.at[0], s.at[1], 0], axisX: X, axisZ: Z, predefinedType: 'FLOORING', materialName: 'Carpet' }, slab);
    put(i === 0 ? 'carpet' : 'rug', made);
  });
  const window = { width: 1800, height: 1500, offsetFromFloor: 900, wallLocalId: facade, materialName: 'Aluminium' };
  const door = { width: 900, height: 2100, offsetFromFloor: 0, materialName: 'Timber' };
  const lights = [600, 2700, 4800, 8500];
  for (const y of lights) put('glass', model.addWindow({ ...window, offsetAlongWall: y }));
  put('wood', model.addDoor({ ...door, wallLocalId: cross, offsetAlongWall: 3300 }));
  put('wood', model.addDoor({ ...door, wallLocalId: aisle, offsetAlongWall: 5900 }));
  put('wood', model.addDoor({ ...door, wallLocalId: aisle, offsetAlongWall: 7600 }));

  // Glass, window boards and the furniture are proxies: plain solids with a name. The IFC writer gives each
  // door and window a panel of its own, in the 100 mm of its wall that is farthest from the wall axis.
  const owned: Body[] = [];
  const own = <T extends Body>(s: T): T => {
    owned.push(s);
    return s;
  };
  const block = (tone: Tone, name: string, lo: P3, hi: P3, hidden = false): Id =>
    put(tone, model.addProxy({ name, solid: translate(own(box(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2])), lo) }), hidden);
  const post = (tone: Tone, name: string, at: P3, radius: number, tall: number): Id => put(tone, model.addProxy({ name, solid: cylinder(radius, tall, { at }) }));
  for (const y of lights) {
    block('glass', 'Glazing', [-170, y, 950], [-140, y + window.width, 2400]);
    block('slab', 'Window board', [-200, y, 900], [0, y + window.width, 950]);
  }
  const F = FINISH;
  const table = (x: number, y: number, deep: number, long: number): void => {
    block('wood', 'Table top', [x, y, F + 715], [x + deep, y + long, F + 740]);
    for (const end of [y + 60, y + long - 85]) block('dark', 'Table leg', [x + 60, end, F], [x + deep - 60, end + 25, F + 715]);
  };
  const chair = (x: number, y: number, faces: number): void => {
    post('dark', 'Chair base', [x, y, F], 280, 40);
    post('dark', 'Chair column', [x, y, F + 40], 30, 380);
    block('seat', 'Chair seat', [x - 230, y - 230, F + 420], [x + 230, y + 230, F + 480]);
    const rear = faces > 0 ? x - 230 : x + 190;
    block('seat', 'Chair back', [rear, y - 220, F + 480], [rear + 40, y + 220, F + 930]);
  };
  // The office: a bench of six desks, each with a screen. The meeting room: a table for four.
  for (const y of [1200, 2800, 4400]) for (const side of [-1, 1]) {
    const x = side < 0 ? 1450 : 2250;
    table(x, y, 800, 1600);
    chair(side < 0 ? 1000 : 3500, y + 800, -side);
    const screen = side < 0 ? 2050 : 2430;
    block('dark', 'Screen stand', [screen - 40, y + 760, F + 740], [screen + 60, y + 840, F + 850]);
    block('dark', 'Screen', [screen, y + 520, F + 850], [screen + 20, y + 1080, F + 1190]);
  }
  block('slab', 'Cabinet', [300, SPLIT - 450, F], [2700, SPLIT, F + 1100]);
  block('dark', 'Wall screen', [1300, SPLIT + WALL.partition, 1100], [2700, SPLIT + WALL.partition + 40, 1900]);
  table(1750, 8500, 1000, 1800);
  for (const y of [8950, 9850]) for (const side of [-1, 1]) chair(2250 + side * 900, y, -side);

  // The kernel measures each space. The published rule gives the people that the room has volume for.
  const elements = new Map(model.getAllElements().map((el) => [el.localId, el]));
  const solidsOf = (id: Id): Body[] => (unwrap(placedSolids(elements.get(id) as never)) as Body[]).map(own);
  const report = SPACES.map((s, i) => {
    const m3 = unwrap(measureVolume(solidsOf(spaces[i] as Id)[0] as Body)) / 1e9;
    const counted = m3 * Math.min(1, COUNTED_HEIGHT / height);
    return s.name + ' ' + m3.toFixed(1) + ' m3' + ', volume for ' + Math.floor(counted / ROOM_PER_PERSON) + ' people, ' + s.seats + ' seats';
  });
  const groups = new Map<Tone, Body[]>();
  for (const p of placed) {
    if (p.hidden) continue;
    const list = solidsOf(p.id).map((s) => (p.tone === 'space' && lift > 0 ? own(translate(s, [0, 0, lift])) : s));
    groups.set(p.tone, [...(groups.get(p.tone) ?? []), ...list]);
  }
  const shown = [...groups].map(([tone, list]) => ({ tone, shape: compound(list) }));
  owned.splice(0).forEach((s) => s.delete());
  return { model, shown, report };
}
const COLORS: Record<Tone, string> = { space: '#12b5b0', wall: '#f5f2ea', slab: '#c3c9d1', carpet: '#48515c', rug: '#5d6672', glass: '#9fc3d4', wood: '#d3a956', seat: '#ff5a1f', dark: '#2b3038' };

// Try floor({ lift: 0 }), floor({ height: 3600 }) or floor({ cutaway: false }).
const level = floor();
console.log('Space volumes from the kernel: ' + level.report.join('; ') + '. The rule is ' + ROOM_PER_PERSON + ' m3 for each person.');

export default present(
  level.shown.map((g) => color(g.shape, COLORS[g.tone])),
  {
    bimTree: level.model.toTreeSummary(),
    ifc: async () => unwrap(await toIfc(level.model, { applicationName: 'brepjs playground', applicationVersion: '1.0' })),
  },
);`,
  },
  {
    id: 'bim-profile-gallery',
    label: 'Profile Gallery',
    description:
      'Eight structural sections as real IfcColumn stubs on bolted base plates: I, L, T, U, Z, C, rectangular hollow and circular hollow. Beams and columns share one profile vocabulary, and each named kind exports as its own parametric IFC profile def, so the section stays editable data downstream. The IPE 300, the angle, the UPE 200 and the two hollow sections have their published dimensions, and the kernel measures the mass of each metre to set against the steel table. The view shows each M20 holding-down bolt as a screw with a helical thread in its nut, and the IFC file keeps plain proxies. The tee, the zed, the lipped channel, the base plates and the trestles are a display model.',
    code: `import { BimModel, placedSolids, toIfc } from 'brepjs-bim';
import { box, compound, cutAll, cylinder, extrude, getBounds, line, loft, measureVolume, polygon, translate, unwrap, wire } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';

// Profile gallery: eight structural sections of the steel tables, as column stubs on bolted base plates.
// The lesson is the CATALOGUE: beams and columns take the same profile, and each named kind exports as its own
// parametric IFC profile def (IfcIShapeProfileDef, IfcLShapeProfileDef and so on), not as a baked outline.
// The body in the view has the root radii of the I section only. The other radii are data in the profile def.
interface StockParams {
  as?: 'columns' | 'beams'; // stubs on base plates (IfcColumn), or lengths that lie on two trestles (IfcBeam)
  length?: number; // length of each member in millimetres
  radii?: boolean; // false leaves the root and corner radii out of each profile def
}

type P3 = [number, number, number];
type Made = ReturnType<BimModel['addBeam']>;
type Id = Extract<Made, { ok: true }>['value'];
type Profile = Parameters<BimModel['addBeam']>[0]['profile'];
type Body = Extract<ReturnType<typeof placedSolids>, { ok: true }>['value'][number];
type Tone = 'rolled' | 'hollow' | 'formed' | 'primer' | 'bolt' | 'floor';
const X: P3 = [1, 0, 0], Y: P3 = [0, 1, 0], Z: P3 = [0, 0, 1];

// ---- published figures: section dimensions and mass for each metre, from the steel tables
const STEEL = 7850e-9; // kg in each mm3
const IPE300 = { h: 300, b: 150, tw: 7.1, tf: 10.7, r: 15, kg: 42.2 };
const L150 = { leg: 150, t: 12, r: 16, kg: 27.3 };
const UPE200 = { h: 200, b: 80, tw: 6, tf: 11, kg: 22.8 };
const RHS200 = { h: 200, b: 100, t: 8, outer: 12, inner: 8, kg: 35.1 };
const CHS168 = { d: 168.3, t: 8, kg: 31.6 };
const M20 = { d: 20, minor: 17.294, pitch: 2.5, flats: 30 }; // the holding-down bolts: metric coarse thread, right hand

// ---- display model: the tee, the zed and the lipped channel have typical sizes, with no table mass
// THE LESSON. One entry for each profile kind. roll turns a section about its length to lay it on a flat side.
const catalogue = (radii: boolean): { name: string; tone: Tone; kg?: number; roll: number; profile: Profile }[] => [
  { name: 'IPE 300', tone: 'rolled', kg: IPE300.kg, roll: 0, profile: { kind: 'I_BEAM', overallWidth: IPE300.b, overallDepth: IPE300.h, flangeThickness: IPE300.tf, webThickness: IPE300.tw, filletRadius: radii ? IPE300.r : undefined } },
  { name: 'L 150x150x12', tone: 'rolled', kg: L150.kg, roll: 0, profile: { kind: 'L_SHAPE', depth: L150.leg, width: L150.leg, legThickness: L150.t, filletRadius: radii ? L150.r : undefined } },
  { name: 'T 140x140x15', tone: 'rolled', roll: 0, profile: { kind: 'T_SHAPE', depth: 140, flangeWidth: 140, webThickness: 15, flangeThickness: 15, filletRadius: radii ? 15 : undefined } },
  { name: 'UPE 200', tone: 'rolled', kg: UPE200.kg, roll: 0, profile: { kind: 'U_SHAPE', depth: UPE200.h, flangeWidth: UPE200.b, webThickness: UPE200.tw, flangeThickness: UPE200.tf } },
  { name: 'Z 160x70', tone: 'rolled', roll: 0, profile: { kind: 'Z_SHAPE', depth: 160, flangeWidth: 70, webThickness: 8.5, flangeThickness: 11 } },
  { name: 'C 200x75x20x2.5', tone: 'formed', roll: 0, profile: { kind: 'C_SHAPE', depth: 200, width: 75, wallThickness: 2.5, girth: 20, internalFilletRadius: radii ? 2.5 : undefined } },
  { name: 'RHS 200x100x8', tone: 'hollow', kg: RHS200.kg, roll: 0, profile: { kind: 'RECTANGLE_HOLLOW', xDim: RHS200.b, yDim: RHS200.h, wallThickness: RHS200.t, outerFilletRadius: radii ? RHS200.outer : undefined, innerFilletRadius: radii ? RHS200.inner : undefined } },
  { name: 'CHS 168.3x8', tone: 'hollow', kg: CHS168.kg, roll: 0, profile: { kind: 'CIRCLE_HOLLOW', radius: CHS168.d / 2, wallThickness: CHS168.t } },
];
const GAP = 110; // between two members
const ROW = 800; // from one row of stubs to the next
const PLATE = { thick: 20, margin: 70, bolt: 10 }; // a base plate with four holding-down bolts
const ANCHOR = { embed: 120, hole: 22, play: 0.15 }; // a bolt in the footing, its hole in the plate, the play of its nut
const TRESTLE = { height: 400, bearer: 100, leg: 80, stop: 150 };

function stock({ as = 'columns', length = 320, radii = true }: StockParams = {}) {
  const model = new BimModel();
  model.init({ name: 'Profile gallery' });
  const site = unwrap(model.addSite({ name: 'Site' }));
  const building = unwrap(model.addBuilding({ name: 'Workshop' }));
  const storey = unwrap(model.addStorey({ name: 'Shop floor', elevation: 0 }));
  const project = model.getProject();
  if (project) model.aggregate(project.localId, site);
  model.aggregate(site, building);
  model.aggregate(building, storey);
  const placed: { id: Id; tone: Tone }[] = [];
  const owned: Body[] = [];
  const put = (tone: Tone, made: Made): Id => {
    const id = unwrap(made);
    model.placeIn(id, storey);
    placed.push({ id, tone });
    return id;
  };
  const steel = { materialName: 'Steel S355' };
  const lying = as === 'beams';
  // THE CALL. A beam runs along its local X and a column goes up its local Z. The profile is the same for both.
  const member = (into: BimModel, profile: Profile, origin: P3, roll: number): Made => {
    const turn = (roll * Math.PI) / 180;
    return lying
      ? into.addBeam({ length, profile, origin, axisX: X, axisZ: [0, -Math.sin(turn), Math.cos(turn)], ...steel })
      : into.addColumn({ height: length, profile, origin, axisX: [Math.cos(turn), Math.sin(turn), 0], axisZ: Z, ...steel });
  };
  // The origin of a profile is not at a corner. A trial member in a scratch model gives the box of the section.
  const boxOf = (profile: Profile, roll: number) => {
    const scratch = new BimModel();
    scratch.init({ name: 'Scratch' });
    const solid = (unwrap(placedSolids(scratch.getElement(unwrap(member(scratch, profile, [0, 0, 0], roll))) as never)) as Body[])[0] as Body;
    const box = getBounds(solid);
    solid.delete();
    scratch[Symbol.dispose]();
    return box;
  };
  // Stand the members in two rows, each on its plate, or lay them side by side on the trestles.
  let cursor = 0, deepest = 0, width = 0;
  const members = catalogue(radii).map((entry, i) => {
    const b = boxOf(entry.profile, entry.roll), m = lying ? 0 : PLATE.margin;
    const half = (b.xMax - b.xMin) / 2 + m, wide = b.yMax - b.yMin + 2 * m;
    if (!lying && i === 4) cursor = 0; // the stubs stand in two rows of four
    const cx = lying ? 0 : i < 4 ? ROW / 2 : -ROW / 2;
    const origin: P3 = lying ? [0, cursor - b.yMin, TRESTLE.height - b.zMin] : [cx - (b.xMin + b.xMax) / 2, cursor + m - b.yMin, PLATE.thick];
    const plate = { x: cx - half, y: cursor, deep: 2 * half, wide };
    cursor += wide + GAP;
    width = Math.max(width, cursor - GAP);
    deepest = Math.max(deepest, 2 * half);
    return { ...entry, plate, id: put(entry.tone, member(model, entry.profile, origin, entry.roll)) };
  });

  // The scenery. For the columns: a base plate with four holding-down bolts under each stub, on a strip footing.
  // The IFC file keeps each nut and bolt end as a plain proxy. The view shows the whole bolt as a real screw: a plain
  // shank from the footing up through the plate, a core with one helical tooth, and a hex nut with the mating tooth.
  const keep = (s: unknown): Body => { owned.push(s as Body); return s as Body; };
  const tooth = (core: number, tip: number, from: number, to: number, ref: number): Body => {
    const root = tip > core ? core / 0.998 : core * 0.998, half = 0.42 * M20.pitch; // a hair clear of the core or the bore
    const start = from + half, span = to - from - 2 * half, pieces = Math.ceil(span / (4 * M20.pitch));
    const n = Math.round(span / pieces / M20.pitch * 24); // 24 loft sections in each turn
    const section = (z: number) => {
      const a = 2 * Math.PI * (z - ref) / M20.pitch;
      const pts = [[root, -half], [tip, 0], [root, half]].map(([r, dz]): P3 => [r! * Math.cos(a), r! * Math.sin(a), z + dz!]);
      return keep(unwrap(wire(pts.map((q, i) => keep(line(q, pts[(i + 1) % 3]!)) as never))));
    };
    // A row of lofts of 4 turns or less, end to end on one helix: a long loft is slow to mesh.
    const lofts = Array.from({ length: pieces }, (_, k) => keep(unwrap(loft(Array.from({ length: n + 1 }, (_, j) => section(start + span * (k + j / n) / pieces)) as never, { ruled: false }))));
    return keep(compound(lofts));
  };
  const nutTop = PLATE.thick + 16, top = nutTop + 24, bore = M20.d / 2 + ANCHOR.play, hexR = M20.flats / Math.sqrt(3);
  const hex = keep(unwrap(polygon(Array.from({ length: 6 }, (_, i): P3 => [hexR * Math.cos((i * Math.PI) / 3), hexR * Math.sin((i * Math.PI) / 3), PLATE.thick]))));
  const screw = lying ? undefined : keep(compound([
    keep(cylinder(M20.d / 2, ANCHOR.embed + PLATE.thick, { at: [0, 0, -ANCHOR.embed] })), keep(cylinder(M20.minor / 2, top - PLATE.thick, { at: [0, 0, PLATE.thick] })), tooth(M20.minor / 2, M20.d / 2, PLATE.thick, top, 0),
    keep(unwrap(cutAll(keep(unwrap(extrude(hex as never, 16))), [keep(cylinder(bore, 18, { at: [0, 0, PLATE.thick - 1] }))]))), tooth(bore, M20.minor / 2 + ANCHOR.play, PLATE.thick, nutTop, M20.pitch / 2),
  ]));
  const screws: P3[] = [], drills = new Map<Id, Body[]>(), inFooting: Body[][] = [[], []]; // the holes that the view drills
  if (!lying) for (const { plate: p } of members) {
    const unit = box(p.deep, p.wide, PLATE.thick);
    owned.push(unit);
    const spots = [p.x + 32, p.x + p.deep - 32].flatMap((x) => [p.y + 32, p.y + p.wide - 32].map((y): P3 => [x, y, 0]));
    screws.push(...spots);
    drills.set(put('primer', model.addProxy({ name: 'Base plate', solid: translate(unit, [p.x, p.y, 0]), ...steel })), spots.map(([x, y]) => keep(cylinder(ANCHOR.hole / 2, PLATE.thick + 2, { at: [x, y, -1] }))));
    inFooting[p.x + p.deep / 2 > 0 ? 0 : 1]!.push(...spots.map(([x, y]) => keep(cylinder(M20.d / 2, ANCHOR.embed + 1, { at: [x, y, -ANCHOR.embed] }))));
    for (const [x, y] of spots) {
      put('bolt', model.addProxy({ name: 'Nut', solid: cylinder(1.7 * PLATE.bolt, 16, { at: [x, y, PLATE.thick] }), ...steel }));
      put('bolt', model.addProxy({ name: 'Holding-down bolt', solid: cylinder(PLATE.bolt, 24, { at: [x, y, PLATE.thick + 16] }), ...steel }));
    }
  }
  // For the beams: two trestles of square hollow section, with a stop at each end of a bearer, on a floor slab.
  const shs = (size: number, wall: number): Profile => ({ kind: 'RECTANGLE_HOLLOW', xDim: size, yDim: size, wallThickness: wall });
  const over = 160, t = TRESTLE;
  if (lying) for (const x of [0.2 * length, 0.8 * length]) {
    put('primer', model.addBeam({ length: width + 2 * over, profile: shs(t.bearer, 5), origin: [x, -over, t.height - t.bearer / 2], axisX: Y, axisZ: Z, ...steel }));
    for (const y of [-over + t.leg / 2 + 60, width + over - t.leg / 2 - 60]) {
      put('primer', model.addColumn({ height: t.height - t.bearer - 12, profile: shs(t.leg, 4), origin: [x, y, 12], axisX: X, axisZ: Z, ...steel }));
      put('primer', model.addColumn({ height: 12, profile: { kind: 'RECTANGULAR', width: 320, height: 200 }, origin: [x, y, 0], axisX: X, axisZ: Z, ...steel }));
    }
    for (const y of [-over + 30, width + over - 30]) put('primer', model.addColumn({ height: t.stop, profile: shs(50, 4), origin: [x, y, t.height], axisX: X, axisZ: Z, ...steel }));
  }
  if (lying) put('floor', model.addSlab({ length: length + 500, width: width + 2 * over + 500, thickness: 150, origin: [-250, -over - 250, -150], axisX: X, axisZ: Z, predefinedType: 'BASESLAB', materialName: 'Concrete' }));
  else [ROW / 2, -ROW / 2].forEach((cx, row) => drills.set(put('floor', model.addFooting({ length: width + 400, width: deepest + 200, thickness: 200, origin: [cx + deepest / 2 + 100, -200, -200], axisX: Y, axisZ: Z, predefinedType: 'STRIP_FOOTING', materialName: 'Concrete' })), inFooting[row]!));

  // The kernel measures each member. Volume and density give the mass for each metre, to set against the table.
  const elements = new Map(model.getAllElements().map((el) => [el.localId, el]));
  const solidsOf = (id: Id): Body[] => {
    const list = unwrap(placedSolids(elements.get(id) as never)) as Body[];
    owned.push(...list);
    return list;
  };
  const report = members.map((m) => {
    const kg = (unwrap(measureVolume(solidsOf(m.id)[0] as Body)) * STEEL) / (length / 1000);
    return m.name + ' ' + kg.toFixed(1) + (m.kg === undefined ? '' : ' (' + m.kg + ')');
  });
  const groups = new Map<Tone, Body[]>();
  for (const p of placed) {
    if (p.tone === 'bolt') continue; // the screws below go in the place of these proxies
    const tools = drills.get(p.id), list = solidsOf(p.id);
    groups.set(p.tone, [...(groups.get(p.tone) ?? []), ...(tools ? list.map((body) => keep(unwrap(cutAll(body, tools)))) : list)]);
  }
  if (screw) groups.set('bolt', screws.map((at) => keep(translate(screw, at))));
  const shown = [...groups].map(([tone, list]) => ({ tone, shape: compound(list) }));
  owned.splice(0).forEach((s) => s.delete());
  return { model, shown, report };
}
const COLORS: Record<Tone, string> = { rolled: '#c3c9d1', hollow: '#12b5b0', formed: '#f5f2ea', primer: '#ff5a1f', bolt: '#d3a956', floor: '#48515c' };

// Try stock({ as: 'beams', length: 1500 }), stock({ radii: false }) or stock({ length: 900 }).
const rack = stock();
console.log('Mass in kg for each metre, from the kernel volume (and from the steel table): ' + rack.report.join(', '));

export default present(
  rack.shown.map((g) => color(g.shape, COLORS[g.tone])),
  {
    bimTree: rack.model.toTreeSummary(),
    ifc: async () => unwrap(await toIfc(rack.model, { applicationName: 'brepjs playground', applicationVersion: '1.0' })),
  },
);`,
  },
  {
    id: 'bim-validation',
    label: 'Validated Export',
    description:
      'One toIfcValidated call exports the model and runs the full set of checkers: referential integrity before the file is written, then schema, round trip, geometry validity and the buildingSMART gherkin rules. This steel-framed block has two faults on purpose. A column that is in no storey makes the integrity gate block the export: the view paints the column that the gate names in orange, and the code repairs it. A project with no coordinate reference system gives the GRF003 warning. The export runs against IFC4 and IFC4X3, and the Files button saves the full report. The sections are published sizes, and the block is a display model.',
    code: `import { BimModel, countBySeverity, placedSolids, toIfcValidated } from 'brepjs-bim';
import { box, compound, translate, unwrap } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';

// Validated export: toIfcValidated writes the IFC file and runs the full set of checkers in one call.
// The model is a steel-framed block with two faults put in on purpose. One column is in no storey: the
// integrity gate blocks the export and names it, and the view paints it orange. The project has no
// coordinate reference system: the buildingSMART rule GRF003 gives a warning, and the file is still good.
// The console has the report. web-ifc also logs Invalid ExpressID lines when it saves a model with openings:
// that is its own log, not a finding.
interface CheckParams {
  storeys?: number; // the number of storeys of the frame
  stray?: boolean; // false puts each column in its storey, so the gate has nothing to block
  georeference?: boolean; // true gives the project a coordinate reference system, which clears GRF003
}

type P3 = [number, number, number];
type Made = ReturnType<BimModel['addColumn']>;
type Id = Extract<Made, { ok: true }>['value'];
type Body = ReturnType<typeof box>;
type Finding = { severity: string; code: string; message: string; entity?: string | number };
type Tone = 'steel' | 'slab' | 'wall' | 'ground' | 'glass' | 'rail' | 'named';
const X: P3 = [1, 0, 0], Y: P3 = [0, 1, 0], Z: P3 = [0, 0, 1];

// ---- published figures: rolled sections of the European tables, drawn without their root radii
const HE200B = { kind: 'I_BEAM', overallWidth: 200, overallDepth: 200, flangeThickness: 15, webThickness: 9 } as const;
const IPE300 = { kind: 'I_BEAM', overallWidth: 150, overallDepth: 300, flangeThickness: 10.7, webThickness: 7.1 } as const;
const IPE240 = { kind: 'I_BEAM', overallWidth: 120, overallDepth: 240, flangeThickness: 9.8, webThickness: 6.2 } as const;

// ---- display model
const GRID = { x: 6000, y: 6000, bays: [2, 3], storey: 3600 };
const SLAB = { depth: 200, edge: 300 };
const GUARD = { height: 1100, bar: 40 };
const COLORS: Record<Tone, string> = { steel: '#c3c9d1', slab: '#f5f2ea', wall: '#d9d3c7', ground: '#48515c', glass: '#9fc3d4', rail: '#2b3038', named: '#ff5a1f' };

// A severity summary is the useful read of a report. Findings have a severity, and are never thrown.
const report = (label: string, issues: readonly Finding[]): void => {
  const counts = { error: 0, warning: 0, info: 0 };
  for (const i of issues) counts[i.severity as 'error' | 'warning' | 'info'] += 1;
  console.log(label + ': ' + counts.error + ' errors, ' + counts.warning + ' warnings, ' + counts.info + ' info');
  for (const i of issues.slice(0, 4)) console.log('   [' + i.severity + '] ' + i.code + ' ' + i.message);
};

// ---- THE LESSON. Try block({ storeys: 3 }), block({ stray: false }) or block({ georeference: true }).
const site = block();
const meta = { applicationName: 'brepjs playground', applicationVersion: '1.0' };

// Only a referential-integrity failure makes toIfcValidated return Err. Its cause is the list of findings,
// and each finding names its element. Here the repair puts the named element in the ground storey.
let ifc4 = await toIfcValidated(site.model, meta);
const named: Id[] = [];
if (!ifc4.ok && ifc4.error.code === 'INTEGRITY_FAILURE') {
  for (const finding of ifc4.error.cause as readonly Finding[]) {
    console.log('blocked: [' + finding.severity + '] ' + finding.code + ' ' + finding.message);
    named.push(finding.entity as Id);
    site.model.placeIn(finding.entity as Id, site.levels[0] as Id);
  }
  ifc4 = await toIfcValidated(site.model, meta);
}
// The export now passes the gate. The schema, round-trip, geometry and gherkin findings come back in the report
// with bytes that a reader can open, so the caller decides if the file can ship.
const checked = unwrap(ifc4);
report('IFC4', checked.report.issues);

// The same model against the newer schema: ifcSchema is the only change. countBySeverity is the short tally.
const newer = unwrap(await toIfcValidated(site.model, { ...meta, ifcSchema: 'IFC4X3' }));
const x3 = countBySeverity(newer.report);
console.log('IFC4X3: ' + x3.error + ' errors, ' + x3.warning + ' warnings, ' + x3.info + ' info');

// ---- THE SCENERY: a steel frame on pad footings, with a floor slab, a masonry wall at the back and guard rails.
function block({ storeys = 2, stray = true, georeference = false }: CheckParams = {}) {
  const model = new BimModel();
  // A project with no crs gives GRF003. The eastings and northings are the map position of the origin, in metres.
  model.init({ name: 'Validated building', projectId: 'validation-demo', ...(georeference ? { crs: { name: 'EPSG:25832', eastings: 566000, northings: 5933000 } } : {}) });
  const ground = unwrap(model.addSite({ name: 'Site' }));
  const building = unwrap(model.addBuilding({ name: 'Building' }));
  const project = model.getProject();
  if (project) model.aggregate(project.localId, ground);
  model.aggregate(ground, building);
  const levels = Array.from({ length: storeys + 1 }, (_, i) => {
    const id = unwrap(model.addStorey({ name: i === storeys ? 'Roof' : i === 0 ? 'Ground floor' : 'Floor ' + i, elevation: i * GRID.storey }));
    model.aggregate(building, id);
    return id;
  });
  const placed: { id: Id; level: number; tone: Tone }[] = [];
  const put = (level: number, tone: Tone, made: Made, contained = true): Id => {
    const id = unwrap(made);
    if (contained) model.placeIn(id, levels[level] as Id);
    placed.push({ id, level, tone });
    return id;
  };
  const steel = { materialName: 'Steel S355' }, concrete = { materialName: 'Concrete C30/37' };
  const [nx, ny] = GRID.bays as [number, number];
  const LENGTH = nx * GRID.x, WIDTH = ny * GRID.y, e = SLAB.edge;
  const xs = Array.from({ length: nx + 1 }, (_, i) => i * GRID.x), ys = Array.from({ length: ny + 1 }, (_, j) => j * GRID.y);
  const owned: Body[] = [];
  const pane = (level: number, lo: P3, hi: P3): Id => {
    const unit = box(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
    owned.push(unit);
    return put(level, 'glass', model.addProxy({ name: 'Glazing', solid: translate(unit, lo), materialName: 'Glass' }));
  };

  for (let level = 0; level <= storeys; level++) {
    if (level === 0) {
      put(0, 'ground', model.addSlab({ length: LENGTH + 2400, width: WIDTH + 2400, thickness: 150, origin: [-1200, -1200, -150], axisX: X, axisZ: Z, predefinedType: 'BASESLAB', ...concrete }));
      for (const x of xs) for (const y of ys) put(0, 'ground', model.addFooting({ length: 1400, width: 1400, thickness: 500, origin: [x - 700, y - 700, -650], axisX: X, axisZ: Z, predefinedType: 'PAD_FOOTING', ...concrete }));
    } else {
      // The beams of a level are in the storey on top of them. The primary beams stop at the column faces, and
      // the secondary beams at the third points stop at the flanges of the primary beams.
      const z = -SLAB.depth - IPE300.overallDepth / 2, flange = IPE300.overallWidth / 2;
      for (const x of xs) for (const y of ys.slice(0, -1)) put(level, 'steel', model.addBeam({ length: GRID.y - 200, profile: IPE300, origin: [x, y + 100, z], axisX: Y, axisZ: Z, ...steel }));
      for (const y of ys) for (const x of xs.slice(0, -1)) put(level, 'steel', model.addBeam({ length: GRID.x - 200, profile: IPE300, origin: [x + 100, y, z], axisX: X, axisZ: Z, ...steel }));
      for (const y of ys.slice(0, -1)) for (const third of [1, 2]) for (const x of xs.slice(0, -1))
        put(level, 'steel', model.addBeam({ length: GRID.x - 2 * flange, profile: IPE240, origin: [x + flange, y + (third * GRID.y) / 3, -SLAB.depth - IPE240.overallDepth / 2], axisX: X, axisZ: Z, predefinedType: 'JOIST', ...steel }));
      // The roof steel is open: its deck is not in the model yet. Each floor has its slab and its guard rails.
      if (level === storeys) continue;
      put(level, 'slab', model.addSlab({ length: LENGTH + 2 * e, width: WIDTH + 2 * e, thickness: SLAB.depth, origin: [-e, -e, -SLAB.depth], axisX: X, axisZ: Z, predefinedType: 'FLOOR', ...concrete }));
      // Guard rails on the open edges. A railing goes toward its local Y, as a wall does.
      const rail = { height: GUARD.height, thickness: GUARD.bar, axisZ: Z, infill: 'POSTED', predefinedType: 'GUARDRAIL', ...steel } as const;
      const run = (from: P3, axisX: P3, total: number, parts: number): void => {
        for (let k = 0; k < parts; k++) {
          const at = (k * total) / parts;
          put(level, 'rail', model.addRailing({ ...rail, length: total / parts, origin: [from[0] + axisX[0] * at, from[1] + axisX[1] * at, 0], axisX }));
        }
      };
      run([LENGTH + e, -e, 0], Y, WIDTH + 2 * e, ny);
      run([-e, -e, 0], X, LENGTH + 2 * e - GUARD.bar, nx);
      run([LENGTH + e - GUARD.bar, WIDTH + e, 0], [-1, 0, 0], LENGTH + 2 * e - GUARD.bar, nx);
    }
    if (level === storeys) continue;
    // Columns from the floor to the slab over it. The stray column is made, but it is not put in its storey.
    for (const x of xs) for (const y of ys) {
      const lost = stray && level === 0 && x === LENGTH && y === 2 * GRID.y;
      put(level, 'steel', model.addColumn({ height: GRID.storey - SLAB.depth, profile: HE200B, origin: [x, y, 0], axisX: X, axisZ: Z, ...steel }), !lost);
    }
    // A masonry panel with a window in each bay of the back. The glass is a proxy in the opening, clear of the
    // panel that the IFC writer gives each window in the 100 mm of the wall that is farthest from the wall axis.
    const tall = GRID.storey - SLAB.depth - IPE300.overallDepth;
    for (const y of ys.slice(0, -1)) {
      const wall = put(level, 'wall', model.addWall({ length: GRID.y - 200, height: tall, thickness: 200, origin: [100, y + 100, 0], axisX: Y, axisZ: Z, materialName: 'Blockwork', isExternal: true }));
      put(level, 'glass', model.addWindow({ wallLocalId: wall, width: 3000, height: 1500, offsetAlongWall: 1400, offsetFromFloor: 900, materialName: 'Aluminium' }));
      pane(level, [20, y + 1500, 900], [50, y + 4500, 2400]);
    }
  }

  // The view: one compound for each tone. An element that the gate named gets the tone of a finding.
  const view = (flagged: readonly Id[]) => {
    const elements = new Map(model.getAllElements().map((el) => [el.localId, el]));
    const groups = new Map<Tone, Body[]>();
    for (const p of placed) {
      const list = unwrap(placedSolids(elements.get(p.id) as never, { parentFrame: { origin: [0, 0, p.level * GRID.storey], axisX: X, axisZ: Z } })) as Body[];
      owned.push(...list);
      const tone = flagged.includes(p.id) ? 'named' : p.tone;
      groups.set(tone, [...(groups.get(tone) ?? []), ...list]);
    }
    const shown = [...groups].map(([tone, list]) => color(compound(list), COLORS[tone]));
    owned.splice(0).forEach((s) => s.delete());
    return shown;
  };
  return { model, levels, view };
}

export default present(site.view(named), {
  bimTree: site.model.toTreeSummary(),
  ifc: () => checked.bytes,
  // The Files button saves the full report. The console shows the summary.
  files: () => [
    {
      name: 'validation-report.json',
      data: JSON.stringify({ blocked: named.length, ifc4: checked.report.issues, ifc4x3: newer.report.issues }, null, 2),
      mime: 'application/json',
    },
  ],
});`,
  },
  {
    id: 'bim-interop',
    label: 'COBie, IDS and BCF',
    description:
      'The three formats that carry the work around a model, as one chain on a small office block. COBie 2.4 handover sheets come from the spatial structure. An IDS 1.0 requirement is checked against the exported file, and the front wall fails it. A BCF 3.0 issue is then filed on that wall by its GlobalId, with a camera on it, and the view paints the wall orange. Results print to the console, and the Files button saves the COBie sheets and the BCF markup and viewpoint. The block is a display model, shown with its roof off.',
    code: `import { BimModel, SpfReader, checkIds, deriveCobieModel, parseIdsXml, placedSolids, serializeBcfFiles, serializeCobieToCsv, toIfc } from 'brepjs-bim';
import { box, compound, getBounds, translate, unwrap } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';

// COBie, IDS and BCF: IFC carries the model, and three sibling formats carry the work around it.
// COBie is the handover sheet, IDS is a requirement that a machine can check, BCF is an issue on an element.
// Here they make one chain on a small office block: the IDS check finds a wall, and a BCF issue is filed on it
// by its GlobalId. The view paints that wall orange. The console has the results, and the Files button saves them.
interface BlockParams {
  offices?: number; // the number of offices along the block
  declared?: boolean; // true gives the front wall its IsExternal flag: the IDS passes and no issue is filed
  roof?: boolean; // show the roof slab. The model and the files have it in each case
}

type P3 = [number, number, number];
type Made = ReturnType<BimModel['addWall']>;
type Id = Extract<Made, { ok: true }>['value'];
type Body = ReturnType<typeof box>;
type Tone = 'wall' | 'flagged' | 'space' | 'slab' | 'glass' | 'door' | 'roof';
const X: P3 = [1, 0, 0], Y: P3 = [0, 1, 0], Z: P3 = [0, 0, 1];

// ---- display model: the plan of the block. X is the depth, Y is the length, and the front looks toward +X
const DEPTH = 7200, LOBBY = 2700, OFFICE = 4350, OUTER = 300, INNER = 100;
const HEIGHT = { wall: 3000, room: 2700 };
const COLORS: Record<Tone, string> = { wall: '#f5f2ea', flagged: '#ff5a1f', space: '#12b5b0', slab: '#c3c9d1', glass: '#9fc3d4', door: '#d3a956', roof: '#48515c' };

// ---- THE LESSON. Try riverside({ offices: 4 }), riverside({ declared: true }) or riverside({ roof: true }).
const block = riverside();
const bytes = unwrap(await toIfc(block.model, { applicationName: 'brepjs playground', applicationVersion: '1.0' }));

// COBie 2.4: the view for the facility manager. It comes from the spatial structure and the property sets,
// not from geometry. The spaces of the model make its Space sheet.
const cobie = deriveCobieModel(block.model, { contact: { email: 'fm@example.com', givenName: 'Facilities', familyName: 'Team' } });
const sheets = serializeCobieToCsv(cobie);
console.log('COBie sheets: ' + [...sheets.keys()].join(', '));
console.log('  ' + cobie.space.length + ' spaces, ' + cobie.floor.length + ' floors, ' + cobie.component.length + ' components');

// IDS 1.0: a requirement in the form that a client issues. Applicability selects the entities to test, and
// requirements say what they must have. The lines are joined with a space: XML does not need the line breaks.
const IDS_XML = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<ids xmlns="http://standards.buildingsmart.org/IDS">',
  '  <info><title>Walls declare IsExternal</title></info>',
  '  <specifications>',
  '    <specification name="Walls declare IsExternal" ifcVersion="IFC4">',
  '      <applicability minOccurs="1" maxOccurs="unbounded">',
  '        <entity><name><simpleValue>IFCWALL</simpleValue></name></entity>',
  '      </applicability>',
  '      <requirements>',
  '        <property>',
  '          <propertySet><simpleValue>Pset_WallCommon</simpleValue></propertySet>',
  '          <baseName><simpleValue>IsExternal</simpleValue></baseName>',
  '        </property>',
  '      </requirements>',
  '    </specification>',
  '  </specifications>',
  '</ids>',
].join(' ');
const idsReport = unwrap(await checkIds(bytes, unwrap(parseIdsXml(IDS_XML))));
console.log('IDS: ' + (idsReport.pass ? 'PASS' : 'FAIL'));
for (const r of idsReport.results) console.log('  ' + r.specificationName + ': ' + r.passedCount + '/' + r.applicableCount + ' applicable entities pass');

// The IDS report names an entity by its line in the file. The GlobalId of that line is the name that the
// model, the BCF issue and each other tool share.
const reader = unwrap(await SpfReader.create(bytes));
const failed = idsReport.results.flatMap((r) => r.issues).flatMap((i) => (typeof i.entity === 'number' ? [reader.guidFromExpressId(i.entity) ?? ''] : []));
reader.close();

// BCF 3.0: one issue for each wall that failed, on the element by its GlobalId, with a camera that looks at it.
// BCF is in metres and the model is in millimetres. A topic and a viewpoint have a UUID, not an IFC GlobalId.
// The container is not zipped here: it is a map from a file name to its contents.
const bcf = serializeBcfFiles({
  version: { versionId: '3.0' },
  project: { projectId: 'interop-demo', name: 'Riverside Block' },
  topics: block.model.getWalls().filter((wall) => failed.includes(wall.guid)).map((wall) => ({
    guid: crypto.randomUUID(),
    title: 'Wall does not declare IsExternal',
    topicType: 'Issue',
    topicStatus: 'Open',
    creationAuthor: 'fm@example.com',
    creationDate: '2026-01-05T09:00:00Z',
    description: 'Pset_WallCommon has no IsExternal. The IDS of the client requires it on each wall.',
    comments: [],
    viewpoints: [
      {
        guid: crypto.randomUUID(),
        viewpointFile: 'viewpoint.bcfv', // the markup names this file, so the saved copy keeps the name
        components: { selection: [{ ifcGuid: wall.guid }], coloring: [{ color: 'FFFF5A1F', components: [{ ifcGuid: wall.guid }] }] },
        camera: block.cameraOn(wall.localId),
      },
    ],
  })),
});
console.log('BCF container: ' + [...bcf.keys()].join(', '));
// The files of a topic are in a folder with the guid of the topic, so find them by the end of the name.
const markupKey = [...bcf.keys()].find((k) => k.endsWith('/markup.bcf')) ?? '';
const viewpointKey = [...bcf.keys()].find((k) => k.endsWith('.bcfv')) ?? '';

// ---- THE SCENERY: a lobby and a row of offices in one storey, with a space in each room.
function riverside({ offices = 2, declared = false, roof = false }: BlockParams = {}) {
  const model = new BimModel();
  model.init({ name: 'Interop demo', projectId: 'interop-demo' });
  const site = unwrap(model.addSite({ name: 'Site' }));
  const building = unwrap(model.addBuilding({ name: 'Riverside Block' }));
  const storey = unwrap(model.addStorey({ name: 'Ground Floor', elevation: 0 }));
  const project = model.getProject();
  if (project) model.aggregate(project.localId, site);
  model.aggregate(site, building);
  model.aggregate(building, storey);
  const placed: { id: Id; tone: Tone }[] = [];
  const owned: Body[] = [];
  const put = (tone: Tone, made: Made): Id => {
    const id = unwrap(made);
    model.placeIn(id, storey);
    placed.push({ id, tone });
    return id;
  };
  const fill = (tone: Tone, name: string, lo: P3, hi: P3): Id => {
    const unit = box(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
    owned.push(unit);
    return put(tone, model.addProxy({ name, solid: translate(unit, lo) }));
  };
  const LENGTH = OUTER + LOBBY + offices * (INNER + OFFICE) + OUTER, inside = DEPTH - 2 * OUTER;
  const outer = { height: HEIGHT.wall, thickness: OUTER, axisZ: Z, materialName: 'Concrete' };
  // The outer walls. A wall goes toward its local Y from its axis. The front wall is the one with the fault:
  // it is an external wall, but it does not say so.
  const front = put('wall', model.addWall({ ...outer, length: LENGTH, origin: [DEPTH, 0, 0], axisX: Y, ...(declared ? { isExternal: true } : {}) }));
  const back = put('wall', model.addWall({ ...outer, length: LENGTH, origin: [0, LENGTH, 0], axisX: [0, -1, 0], isExternal: true }));
  const south = put('wall', model.addWall({ ...outer, length: inside, origin: [OUTER, 0, 0], axisX: X, isExternal: true }));
  const north = put('wall', model.addWall({ ...outer, length: inside, origin: [DEPTH - OUTER, LENGTH, 0], axisX: [-1, 0, 0], isExternal: true }));
  put('slab', model.addSlab({ length: DEPTH, width: LENGTH, thickness: 250, origin: [0, 0, -250], axisX: X, axisZ: Z, predefinedType: 'FLOOR', materialName: 'Concrete' }));
  const top = put('roof', model.addSlab({ length: DEPTH + 600, width: LENGTH + 600, thickness: 200, origin: [-300, -300, HEIGHT.wall], axisX: X, axisZ: Z, predefinedType: 'ROOF', materialName: 'Concrete' }));

  // The rooms: a space for each one, which is the source of the COBie Space sheet.
  const room = (name: string, y: number, width: number): Id =>
    put('space', model.addSpace({ name, length: inside, width, height: HEIGHT.room, origin: [OUTER, y, 0], axisX: X, axisZ: Z, materialName: 'Air' }));
  const pane = { width: 1500, height: 1350, offsetFromFloor: 900, materialName: 'Aluminium' };
  const door = { width: 900, height: 2100, offsetFromFloor: 0, materialName: 'Timber' };
  // A window at y in the front wall and in the back wall, with its glass and its sill. The back wall runs toward
  // -Y. The IFC writer gives each door and window a panel in the inner 100 mm of its wall: the proxies stay out of it.
  const lights = (y: number): void => {
    put('glass', model.addWindow({ ...pane, wallLocalId: front, offsetAlongWall: y }));
    put('glass', model.addWindow({ ...pane, wallLocalId: back, offsetAlongWall: LENGTH - y - pane.width }));
    fill('glass', 'Glazing', [DEPTH - 165, y, 950], [DEPTH - 135, y + pane.width, 2250]);
    fill('glass', 'Glazing', [135, y, 950], [165, y + pane.width, 2250]);
    fill('slab', 'Sill', [DEPTH - OUTER + 100, y, 900], [DEPTH + 60, y + pane.width, 950]);
    fill('slab', 'Sill', [-60, y, 900], [OUTER - 100, y + pane.width, 950]);
  };
  room('Lobby', OUTER, LOBBY);
  put('door', model.addDoor({ ...door, width: 1000, wallLocalId: front, offsetAlongWall: OUTER + 850 }));
  fill('door', 'Door leaf', [DEPTH - 170, OUTER + 850, 0], [DEPTH - 120, OUTER + 1850, 2100]);
  fill('slab', 'Step', [DEPTH, OUTER + 650, -250], [DEPTH + 600, OUTER + 2050, -20]);
  put('roof', model.addSlab({ length: DEPTH + 2400, width: LENGTH + 2000, thickness: 150, origin: [-1000, -1000, -400], axisX: X, axisZ: Z, predefinedType: 'BASESLAB', materialName: 'Paving' }));
  for (let k = 0; k < offices; k++) {
    const y = OUTER + LOBBY + k * (INNER + OFFICE);
    const partition = put('wall', model.addWall({ length: inside, height: HEIGHT.wall, thickness: INNER, origin: [OUTER, y, 0], axisX: X, axisZ: Z, materialName: 'Plasterboard', isExternal: false }));
    put('door', model.addDoor({ ...door, wallLocalId: partition, offsetAlongWall: 4500 }));
    room('Office 0' + (k + 1), y + INNER, OFFICE);
    lights(y + INNER + 500);
    lights(y + INNER + 2350);
  }
  for (const [wall, y] of [[south, 135], [north, LENGTH - 165]] as const) {
    put('glass', model.addWindow({ ...pane, wallLocalId: wall, offsetAlongWall: (inside - pane.width) / 2 }));
    fill('glass', 'Glazing', [DEPTH / 2 - pane.width / 2, y, 950], [DEPTH / 2 + pane.width / 2, y + 30, 2250]);
    fill('slab', 'Sill', [DEPTH / 2 - pane.width / 2, y < OUTER ? -60 : LENGTH - OUTER + 100, 900], [DEPTH / 2 + pane.width / 2, y < OUTER ? OUTER - 100 : LENGTH + 60, 950]);
  }

  const elements = new Map(model.getAllElements().map((el) => [el.localId, el]));
  const solidsOf = (id: Id): Body[] => {
    const list = unwrap(placedSolids(elements.get(id) as never)) as Body[];
    owned.push(...list);
    return list;
  };
  // A BCF camera that looks at an element from the front and from above. Up is square to the view direction.
  const cameraOn = (id: Id) => {
    const b = getBounds(solidsOf(id)[0] as Body);
    const target = [(b.xMin + b.xMax) / 2000, (b.yMin + b.yMax) / 2000, (b.zMin + b.zMax) / 2000] as const;
    const eye = [target[0] + 12, target[1] - 12, target[2] + 9] as const;
    const dir = [target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]] as const;
    const len = Math.hypot(...dir), d = [dir[0] / len, dir[1] / len, dir[2] / len] as const;
    const up = [-d[0] * d[2], -d[1] * d[2], d[0] * d[0] + d[1] * d[1]] as const, upLen = Math.hypot(...up);
    return { kind: 'PERSPECTIVE' as const, viewPoint: [eye[0], eye[1], eye[2]] as P3, direction: [d[0], d[1], d[2]] as P3, upVector: [up[0] / upLen, up[1] / upLen, up[2] / upLen] as P3, fieldOfView: 60, aspectRatio: 16 / 9 };
  };
  // The view: one compound for each tone. A wall with an issue gets the tone of an issue.
  const view = (guids: readonly string[]) => {
    const groups = new Map<Tone, Body[]>();
    for (const p of placed) {
      if (p.id === top && !roof) continue;
      const tone = guids.includes(elements.get(p.id)?.guid ?? '') ? 'flagged' : p.tone;
      groups.set(tone, [...(groups.get(tone) ?? []), ...solidsOf(p.id)]);
    }
    const shown = [...groups].map(([tone, list]) => color(compound(list), COLORS[tone]));
    owned.splice(0).forEach((s) => s.delete());
    return shown;
  };
  return { model, cameraOn, view };
}

export default present(block.view(failed), {
  bimTree: block.model.toTreeSummary(),
  ifc: () => bytes,
  // A few files, not all nine COBie sheets: the Files button saves one file for each entry.
  files: () => [
    { name: 'cobie-Facility.csv', data: sheets.get('Facility') ?? '', mime: 'text/csv' },
    { name: 'cobie-Space.csv', data: sheets.get('Space') ?? '', mime: 'text/csv' },
    { name: 'markup.bcf', data: bcf.get(markupKey) ?? '', mime: 'application/xml' },
    { name: 'viewpoint.bcfv', data: bcf.get(viewpointKey) ?? '', mime: 'application/xml' },
  ].filter((file) => file.data.length > 0),
});`,
  },
  {
    id: 'bim-round-trip',
    label: 'IFC Round Trip',
    description:
      'Export a pavilion to IFC, read the file back with fromIfc, and show the source model and the model from the file side by side. Each solid of the second pavilion comes from the exported file, so a difference between the writer and the importer is visible. Its colour is the geometry fidelity of each element: teal for a parametric solid, orange for a mesh that the importer sewed into a solid. The console reports the fidelity counts, the GlobalIds that survived, and the largest volume difference that the kernel measures between a source body and its copy. The pavilion is a display model.',
    code: `import { BimModel, disposeImportedModel, fromIfc, placedSolids, toIfc } from 'brepjs-bim';
import { box, compound, measureVolume, translate, unwrap } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';

// IFC round trip: write a model to IFC, read the file back with fromIfc, and show the two side by side.
// The pavilion at y = 0 is the source model. The second one is made only from the file, and its colour is
// the fidelity of each body: teal is a parametric solid, orange is a mesh that was sewn into a solid.
// The console has the counts. The pavilion is a display model. Units are millimetres.
interface TripParams {
  show?: 'both' | 'source' | 'file'; // which pavilion to show
  gap?: number; // clear distance between the two roofs. -6900 lays the copy from the file on the source
  pitch?: number; // degrees of the roof, in the source model and so also in the file
}

type P3 = [number, number, number];
type Made = ReturnType<BimModel['addWall']>;
type Id = Extract<Made, { ok: true }>['value'];
type Body = ReturnType<typeof box>;
type Tone = 'wall' | 'slab' | 'roof' | 'steel' | 'glass' | 'door' | 'ground';
const X: P3 = [1, 0, 0], Y: P3 = [0, 1, 0], Z: P3 = [0, 0, 1];

// ---- display model: the plan of the pavilion. The front and its porch look toward +X
const ROOM = { depth: 4200, length: 6000, height: 2700, wall: 200 };
const PORCH = 1800, DECK = 300, EAVES = 450;
const SOURCE: Record<Tone, string> = { wall: '#f5f2ea', slab: '#c3c9d1', roof: '#48515c', steel: '#8a99ad', glass: '#9fc3d4', door: '#d3a956', ground: '#6b7480' };
const FIDELITY: Record<string, string> = { PARAMETRIC: '#12b5b0', TESSELLATED_MANIFOLD: '#ff5a1f', TESSELLATED_LOSSY: '#d3a956', NONE: '#48515c' };

// ---- THE LESSON. Try trip({ show: 'file' }), trip({ gap: -6900 }) or trip({ pitch: 45 }).
const run = await trip();
console.log('exported ' + run.bytes.length + ' bytes, schema ' + run.schema);
console.log('read back ' + run.read + ' elements with a body: ' + run.fidelity);
console.log(run.survived + ' of ' + run.read + ' imported GlobalIds match the source model');
console.log('largest volume difference between a source body and its body from the file: ' + run.worst.toFixed(4) + ' %');

async function trip({ show = 'both', gap = 1500, pitch = 25 }: TripParams = {}) {
  const source = pavilion(pitch);
  const bytes = unwrap(await toIfc(source.model, { applicationName: 'brepjs playground', applicationVersion: '1.0' }));
  const back = unwrap(await fromIfc(bytes));

  // An opening comes back as an element with the solid of its void. It is a hole, so it is not shown or counted.
  const bodies = back.elements.filter((e) => e.category !== 'OPENING' && e.geometry.solids.length > 0);
  // Fidelity is in the report for each element. PARAMETRIC: the importer made a true B-Rep solid again from the
  // profile and the extrusion in the file. TESSELLATED_MANIFOLD: it sewed a mesh into a closed solid.
  const tally = new Map<string, number>();
  for (const e of bodies) tally.set(e.geometry.fidelity, (tally.get(e.geometry.fidelity) ?? 0) + 1);
  // The GlobalId is the identity contract across the file: each id that the writer made must come back.
  const ids = new Set(source.model.getAllElements().map((el) => el.guid));
  const survived = bodies.filter((e) => ids.has(e.guid)).length;
  const volumes = source.volumes();
  // The kernel measured each source body. The importer gives the volume of the body that it made.
  let worst = 0;
  for (const e of bodies) {
    const was = volumes.get(e.guid);
    if (was !== undefined && e.geometry.volumeMm3 !== null) worst = Math.max(worst, (100 * Math.abs(e.geometry.volumeMm3 - was)) / was);
  }

  // The imported model owns the kernel memory of each solid that it read. The view takes a moved copy of each
  // one, and then the imported model is released, as in a real application.
  const shift = ROOM.length + 2 * EAVES + gap;
  const groups = new Map<string, Body[]>();
  for (const e of bodies) groups.set(e.geometry.fidelity, [...(groups.get(e.geometry.fidelity) ?? []), ...e.geometry.solids.map((s) => translate(s, [0, shift, 0]) as Body)]);
  const fromFile = [...groups].map(([fidelity, list]) => color(compound(list), FIDELITY[fidelity] ?? '#48515c'));
  for (const list of groups.values()) list.forEach((s) => s.delete());
  disposeImportedModel(back);

  const shown = [...(show === 'file' ? [] : source.view()), ...(show === 'source' ? [] : fromFile)];
  source.release();
  const fidelity = [...tally].map(([name, n]) => n + ' ' + name).join(', ');
  return { model: source.model, bytes, schema: back.schema, read: bodies.length, fidelity, survived, worst, shown };
}

// ---- THE SCENERY: a pavilion with a porch, on a deck with two steps.
function pavilion(pitch: number) {
  const model = new BimModel();
  model.init({ name: 'Round trip', projectId: 'round-trip-demo' });
  const site = unwrap(model.addSite({ name: 'Site' }));
  const building = unwrap(model.addBuilding({ name: 'Pavilion' }));
  const storey = unwrap(model.addStorey({ name: 'Ground Floor', elevation: 0 }));
  const project = model.getProject();
  if (project) model.aggregate(project.localId, site);
  model.aggregate(site, building);
  model.aggregate(building, storey);
  const placed: { id: Id; tone: Tone }[] = [];
  const owned: Body[] = [];
  const put = (tone: Tone, made: Made): Id => {
    const id = unwrap(made);
    model.placeIn(id, storey);
    placed.push({ id, tone });
    return id;
  };
  const fill = (tone: Tone, name: string, lo: P3, hi: P3): Id => {
    const unit = box(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
    owned.push(unit);
    return put(tone, model.addProxy({ name, solid: translate(unit, lo) }));
  };
  const { depth: A, length: B, height: H, wall: T } = ROOM;
  const front = A + PORCH; // the edge of the deck
  put('ground', model.addSlab({ length: front + 1900, width: B + 1400, thickness: 150, origin: [-700, -700, -DECK - 150], axisX: X, axisZ: Z, predefinedType: 'BASESLAB', materialName: 'Paving' }));
  put('slab', model.addSlab({ length: front + 150, width: B + 300, thickness: DECK, origin: [-150, -150, -DECK], axisX: X, axisZ: Z, predefinedType: 'FLOOR', materialName: 'Concrete' }));
  // Four walls. A wall goes toward its local Y from its axis, so each axis is on the outer face.
  const wall = { height: H, thickness: T, axisZ: Z, materialName: 'Masonry', isExternal: true };
  const face = put('wall', model.addWall({ ...wall, length: B, origin: [A, 0, 0], axisX: Y }));
  put('wall', model.addWall({ ...wall, length: B, origin: [0, B, 0], axisX: [0, -1, 0] }));
  const south = put('wall', model.addWall({ ...wall, length: A - 2 * T, origin: [T, 0, 0], axisX: X }));
  const north = put('wall', model.addWall({ ...wall, length: A - 2 * T, origin: [A - T, B, 0], axisX: [-1, 0, 0] }));
  // The openings: a door and a window in the front, and a window in each end. A door or a window has no body
  // in the source model. The writer gives each one a panel in the inner 100 mm of its wall, so the file has four
  // more bodies than the source view. The leaf and the glass are proxies in the outer part of each opening.
  put('door', model.addDoor({ wallLocalId: face, width: 1000, height: 2100, offsetAlongWall: 900, offsetFromFloor: 0, materialName: 'Timber' }));
  fill('door', 'Door leaf', [A - 70, 900, 0], [A - 20, 1900, 2100]);
  put('glass', model.addWindow({ wallLocalId: face, width: 1800, height: 1200, offsetAlongWall: 3000, offsetFromFloor: 900, materialName: 'Aluminium' }));
  fill('glass', 'Glazing', [A - 60, 3000, 900], [A - 30, 4800, 2100]);
  const side = (A - 2 * T - 1500) / 2;
  for (const [id, y] of [[south, 40], [north, B - 70]] as const) {
    put('glass', model.addWindow({ wallLocalId: id, width: 1500, height: 1200, offsetAlongWall: side, offsetFromFloor: 900, materialName: 'Aluminium' }));
    fill('glass', 'Glazing', [T + side, y, 900], [T + side + 1500, y + 30, 2100]);
  }
  // The porch: three round posts with a square beam, a guard rail, and two steps up to the deck.
  const steel = { materialName: 'Steel S355' };
  for (const y of [150, B / 2, B - 150]) put('steel', model.addColumn({ height: H - 150, profile: { kind: 'CIRCLE_HOLLOW', radius: 57, wallThickness: 5 }, origin: [front - 200, y, 0], axisX: X, axisZ: Z, ...steel }));
  put('steel', model.addBeam({ length: B, profile: { kind: 'RECTANGLE_HOLLOW', xDim: 150, yDim: 150, wallThickness: 6 }, origin: [front - 200, 0, H - 75], axisX: Y, axisZ: Z, ...steel }));
  const rail = { height: 1000, thickness: 40, axisX: Y, axisZ: Z, infill: 'POSTED', predefinedType: 'GUARDRAIL', ...steel } as const;
  put('steel', model.addRailing({ ...rail, length: 500, origin: [front, 250, 0] }));
  put('steel', model.addRailing({ ...rail, length: 3500, origin: [front, 2250, 0] }));
  for (const n of [1, 2]) put('slab', model.addSlab({ length: 300 * n, width: 1500, thickness: DECK / 2, origin: [front, 750, -(DECK * n) / 2], axisX: X, axisZ: Z, predefinedType: 'LANDING', materialName: 'Concrete' }));
  // One gable roof over the room and the porch. Its width goes toward -X from the front eaves.
  put('roof', model.addRoof({ length: B + 2 * EAVES, width: front + 2 * EAVES - 300, thickness: 150, origin: [front + EAVES - 300, -EAVES, H], axisX: Y, axisZ: Z, predefinedType: 'GABLE_ROOF', pitch, materialName: 'Slate' }));

  const elements = new Map(model.getAllElements().map((el) => [el.localId, el]));
  const solidsOf = (id: Id): Body[] => {
    const list = unwrap(placedSolids(elements.get(id) as never)) as Body[];
    owned.push(...list);
    return list;
  };
  // The volume of each source body, by GlobalId.
  const volumes = () => new Map(placed.map((p) => [elements.get(p.id)?.guid ?? '', solidsOf(p.id).reduce((sum, s) => sum + unwrap(measureVolume(s)), 0)] as const).filter(([, v]) => v > 0));
  const view = () => {
    const groups = new Map<Tone, Body[]>();
    for (const p of placed) groups.set(p.tone, [...(groups.get(p.tone) ?? []), ...solidsOf(p.id)]);
    return [...groups].map(([tone, list]) => color(compound(list), SOURCE[tone]));
  };
  const release = (): void => owned.splice(0).forEach((s) => s.delete());
  return { model, volumes, view, release };
}

export default present(run.shown, {
  bimTree: run.model.toTreeSummary(),
  ifc: () => run.bytes,
});`,
  },
  {
    id: 'bim-takeoff',
    label: 'Quantity Takeoff',
    description:
      'A quantity schedule of a brick and block house shell, computed from the model: the kernel measures the net volume of each element after the openings are cut, and the schedule groups the volumes by category and material. The brick and block sizes, the joint and the stair limits are published figures, and the console compares the brick and block counts with the guide figures of 60 and 10 for each square metre. The plan, the openings, the joists and the roof are a display model. The Files button saves the schedule as CSV.',
    code: `import { BimModel, placedSolids, toIfc } from 'brepjs-bim';
import { box, compound, measureVolume, unwrap } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';

// Quantity takeoff of a brick and block house shell. The kernel measures the net volume of each element
// after the openings are cut, and the schedule groups the volumes by category and material.
// Units are millimetres. X is along the front, Y is to the back, Z is up.
interface TakeoffParams {
  storeys?: 1 | 2;
  cutaway?: boolean; // leave the east wall and half of the roof finish out of the view. The model keeps them
}

// ---- published figures
const BRICK = { length: 215, width: 102.5, height: 65, joint: 10, guidePerM2: 60 }; // work size and joint
const BLOCK = { length: 440, width: 100, height: 215, joint: 10, guidePerM2: 10 };
const STAIR_LIMIT = { rise: 220, going: 220, pitch: 42 }; // private stair: largest rise, smallest going, largest pitch

// ---- display model
const CO = { x: BRICK.length + BRICK.joint, z: BRICK.height + BRICK.joint }; // one brick with its joints: 225 by 75
const PLAN = { x: 36 * CO.x, y: 27 * CO.x }; // 8100 by 6075: whole bricks on each side
const STOREY = 36 * CO.z; // 2700: whole courses
const CAVITY = 100;
const INNER = BRICK.width + CAVITY; // from the outside face to the block leaf
const WALL = INNER + BLOCK.width; // the cavity wall: 302.5
const SPINE = { x: 4000, width: BLOCK.width }; // the block wall that carries the joists at the middle
const JOIST = { width: 47, depth: 195, spacing: 400, deck: 22 };
const STAIR = { risers: 13, going: 240, width: 900, y: 1200 };
const FOOTING = { width: 600, depth: 225, top: -900 };
const PARAPET = 6 * CO.z;
const ROOF = { insulation: 120, membrane: 6 };
const MATERIAL = {
  brick: 'Facing brick', block: 'Concrete block', trench: 'Foundation block', concrete: 'Concrete C25/30',
  timber: 'Softwood C24', deck: 'Chipboard P5', stair: 'Precast concrete stair', insulation: 'PIR insulation',
  membrane: 'Roof membrane', coping: 'Precast coping', guard: 'Softwood balustrade',
};
const TINT: Record<string, string> = {
  [MATERIAL.brick]: '#b9623c', [MATERIAL.block]: '#cfcabb', [MATERIAL.trench]: '#8f897e', [MATERIAL.concrete]: '#a8a294',
  [MATERIAL.timber]: '#d3a956', [MATERIAL.deck]: '#c9b48a', [MATERIAL.stair]: '#8a99ad', [MATERIAL.insulation]: '#e9d98a',
  [MATERIAL.membrane]: '#48515c', [MATERIAL.coping]: '#f5f2ea', [MATERIAL.guard]: '#f5f2ea',
};

type P3 = [number, number, number];
type Side = 'south' | 'north' | 'west' | 'east';
type Id = Extract<ReturnType<BimModel['addSlab']>, { ok: true }>['value'];
type Body = ReturnType<typeof box>;
type Row = { category: string; material: string; count: number; m3: number };
type Opening = { side: Side; level: number; at: number; width: number; sill: number; height: number; door: boolean };
const X: P3 = [1, 0, 0], Y: P3 = [0, 1, 0], Z: P3 = [0, 0, 1];

// The model stays alive for the IFC file. Each temporary solid is freed, also when the build throws.
function takeoff({ storeys = 2, cutaway = true }: TakeoffParams = {}) {
  const model = new BimModel(), owned: Body[] = [];
  try {
    const house = shell(model, storeys);

    // ---- the takeoff. Each element gives its solid in its place, and the kernel measures the volume.
    // The openings are already cut, so each figure is net. Group them the way a takeoff sheet does.
    const rows = new Map<string, Row>(), groups = new Map<string, Body[]>();
    for (const el of model.getAllElements()) {
      const level = house.level.get(el.localId);
      if (level === undefined) continue; // the site, the building and the storeys have no solid
      const solids = unwrap(placedSolids(el, { parentFrame: { origin: [0, 0, level * STOREY], axisX: X, axisZ: Z } }));
      owned.push(...solids);
      if (solids.length === 0) continue; // a door or a window is a void in its wall
      const material = (el.spec as { materialName?: string }).materialName ?? '(none)';
      const key = el.category + '|' + material;
      const row = rows.get(key) ?? { category: el.category, material, count: 0, m3: 0 };
      row.count += 1;
      for (const s of solids) row.m3 += unwrap(measureVolume(s)) / 1e9; // 1 m3 is 1e9 mm3
      rows.set(key, row);
      if (!(cutaway && house.hidden.has(el.localId))) groups.set(material, [...(groups.get(material) ?? []), ...solids]);
    }
    const ordered = [...rows.values()].sort((a, b) => b.m3 - a.m3);

    // Masonry is ordered by number. Net volume / leaf thickness = net face area, and each unit covers its face and one joint.
    const units = (material: string, unit: { length: number; width: number; height: number; joint: number }) => {
      const net = (rows.get('WALL|' + material)?.m3 ?? 0) / (unit.width / 1000);
      const gross = model.getWalls().filter((w) => w.spec.materialName === material).reduce((sum, w) => sum + (w.spec.length * w.spec.height) / 1e6, 0);
      const perM2 = 1e6 / ((unit.length + unit.joint) * (unit.height + unit.joint));
      return { gross, net, perM2, count: Math.ceil(net * perM2) };
    };
    const shown = [...groups].map(([material, solids]) => color(compound(solids), TINT[material] ?? '#8b8b8b'));
    const dressed = dressing(house.openings, owned);
    return { model, shown: [...shown, ...dressed], ordered, bricks: units(MATERIAL.brick, BRICK), blocks: units(MATERIAL.block, BLOCK), rise: STOREY / STAIR.risers };
  } catch (error) {
    model[Symbol.dispose]();
    throw error;
  } finally {
    owned.splice(0).forEach((s) => s.delete());
  }
}

// Show two storeys, cut open. Try takeoff({ storeys: 1 }), or takeoff({ cutaway: false }).
const job = takeoff();

console.log('category   material                count      m3');
for (const r of job.ordered) console.log(r.category.padEnd(11) + r.material.padEnd(24) + String(r.count).padStart(5) + r.m3.toFixed(2).padStart(8));
const line = (name: string, u: typeof job.bricks, guide: number): string =>
  name + ': gross ' + u.gross.toFixed(1) + ' m2, net ' + u.net.toFixed(1) + ' m2 = ' + u.count + ' at ' + u.perM2.toFixed(1) + ' for each m2 (guide figure ' + guide + '). Gross would order ' + Math.ceil((u.gross - u.net) * u.perM2) + ' too many';
console.log(line('bricks', job.bricks, BRICK.guidePerM2));
console.log(line('blocks', job.blocks, BLOCK.guidePerM2));
const pitch = (Math.atan(job.rise / STAIR.going) * 180) / Math.PI;
console.log('stair: rise ' + job.rise.toFixed(1) + ' mm (limit ' + STAIR_LIMIT.rise + '), going ' + STAIR.going + ' mm (limit ' + STAIR_LIMIT.going + '), pitch ' + pitch.toFixed(1) + ' deg (limit ' + STAIR_LIMIT.pitch + ')');

const csv = ['Category,Material,Count,NetVolume_m3']
  .concat(job.ordered.map((r) => r.category + ',' + r.material + ',' + r.count + ',' + r.m3.toFixed(3)))
  .join(String.fromCharCode(10));

// The IFC button saves the model. The Files button saves the schedule as CSV for a takeoff sheet.
export default present(job.shown, {
  bimTree: job.model.toTreeSummary(),
  ifc: async () => unwrap(await toIfc(job.model, { applicationName: 'brepjs playground', applicationVersion: '1.0' })),
  files: () => [{ name: 'takeoff.csv', data: csv, mime: 'text/csv' }],
});

// ---- the building. Each element is in the frame of its storey: z = 0 is the top of the floor.
function shell(model: BimModel, storeys: number) {
  model.init({ name: 'Takeoff demo', projectId: 'takeoff-demo' });
  const site = unwrap(model.addSite({ name: 'Site' }));
  const building = unwrap(model.addBuilding({ name: 'House' }));
  const project = model.getProject();
  if (project) model.aggregate(project.localId, site);
  model.aggregate(site, building);
  const levels = Array.from({ length: storeys + 1 }, (_, i) => {
    const id = unwrap(model.addStorey({ name: i === storeys ? 'Roof' : i === 0 ? 'Ground floor' : 'Floor ' + i, elevation: i * STOREY }));
    model.aggregate(building, id);
    return id;
  });
  const level = new Map<Id, number>(), hidden = new Set<Id>(), openings: Opening[] = [];
  const put = (at: number, made: ReturnType<BimModel['addSlab']>, hide = false): Id => {
    const id = unwrap(made);
    model.placeIn(id, levels[at]!);
    level.set(id, at);
    if (hide) hidden.add(id);
    return id;
  };

  // The four rectangles of a ring of walls. Its outside is inset from the outline of the plan.
  const ring = (inset: number, t: number): Record<Side, [number, number, number, number]> => ({
    south: [inset, inset, PLAN.x - inset, inset + t],
    north: [inset, PLAN.y - inset - t, PLAN.x - inset, PLAN.y - inset],
    west: [inset, inset + t, inset + t, PLAN.y - inset - t],
    east: [PLAN.x - inset - t, inset + t, PLAN.x - inset, PLAN.y - inset - t],
  });
  const SIDES: Side[] = ['south', 'north', 'west', 'east'];
  // A wall puts its thickness on the left of its direction, so each side runs anticlockwise.
  const leaf = (at: number, inset: number, t: number, z: number, height: number, materialName: string, above = true): Record<Side, Id> => {
    const r = ring(inset, t), wall = { height, thickness: t, axisZ: Z, materialName, isExternal: true };
    const run = (side: Side): Id => {
      const [x0, y0, x1, y1] = r[side];
      if (side === 'south') return put(at, model.addWall({ ...wall, length: x1 - x0, origin: [x0, y0, z], axisX: X }));
      if (side === 'north') return put(at, model.addWall({ ...wall, length: x1 - x0, origin: [x1, y1, z], axisX: [-1, 0, 0] }));
      if (side === 'west') return put(at, model.addWall({ ...wall, length: y1 - y0, origin: [x0, y1, z], axisX: [0, -1, 0] }));
      return put(at, model.addWall({ ...wall, length: y1 - y0, origin: [x1, y0, z], axisX: Y }), above);
    };
    return { south: run('south'), north: run('north'), west: run('west'), east: run('east') };
  };
  const slab = (at: number, x0: number, y0: number, x1: number, y1: number, z: number, thickness: number, predefinedType: 'FLOOR' | 'ROOF' | 'BASESLAB', materialName: string, hide = false): Id =>
    put(at, model.addSlab({ length: x1 - x0, width: y1 - y0, thickness, origin: [x0, y0, z], axisX: X, axisZ: Z, predefinedType, materialName }), hide);

  // Below the ground: strip footings, foundation blocks up to the floor, and the ground slab between them.
  const strip = { thickness: FOOTING.depth, axisX: X, axisZ: Z, predefinedType: 'STRIP_FOOTING', materialName: MATERIAL.concrete } as const;
  const under = ring(WALL / 2 - FOOTING.width / 2, FOOTING.width);
  for (const side of SIDES) {
    const [x0, y0, x1, y1] = under[side];
    put(0, model.addFooting({ ...strip, length: x1 - x0, width: y1 - y0, origin: [x0, y0, FOOTING.top - FOOTING.depth] }));
  }
  const inside = under.south[3];
  put(0, model.addFooting({ ...strip, length: FOOTING.width, width: PLAN.y - 2 * inside, origin: [SPINE.x + SPINE.width / 2 - FOOTING.width / 2, inside, FOOTING.top - FOOTING.depth] }));
  leaf(0, 0, WALL, FOOTING.top, -FOOTING.top, MATERIAL.trench, false);
  const bays: [number, number][] = [[WALL, SPINE.x], [SPINE.x + SPINE.width, PLAN.x - WALL]];
  const spineWall = { length: PLAN.y - 2 * WALL, thickness: SPINE.width, axisX: Y, axisZ: Z, materialName: MATERIAL.block };
  put(0, model.addWall({ ...spineWall, height: -FOOTING.top, origin: [SPINE.x + SPINE.width, WALL, FOOTING.top] }));
  for (const [x0, x1] of bays) slab(0, x0, WALL, x1, PLAN.y - WALL, -100, 100, 'BASESLAB', MATERIAL.concrete);

  // Openings stand on the brick module. A cavity wall is two leaves, so each opening is cut in both.
  const window = (side: Side, at: number, width: number, upper: boolean): Omit<Opening, 'level'> =>
    ({ side, at, width, sill: upper ? 12 * CO.z : 11 * CO.z, height: upper ? 16 * CO.z : 17 * CO.z, door: false });
  const door = (side: Side, at: number, width: number): Omit<Opening, 'level'> => ({ side, at, width, sill: 0, height: 28 * CO.z, door: true });
  const GROUND = [door('south', 5 * CO.x, 4 * CO.x + 10), window('south', 11 * CO.x, 5 * CO.x + 10, false), window('south', 23 * CO.x, 8 * CO.x + 10, false),
    window('north', 6 * CO.x, 6 * CO.x + 10, false), door('north', 21 * CO.x, 8 * CO.x + 10), window('west', 11 * CO.x, 5 * CO.x + 10, false)];
  const UPPER = [window('south', 4 * CO.x, 5 * CO.x + 10, true), window('south', 11 * CO.x, 5 * CO.x + 10, true), window('south', 24 * CO.x, 6 * CO.x + 10, true),
    window('north', 6 * CO.x, 6 * CO.x + 10, true), window('north', 22 * CO.x, 6 * CO.x + 10, true), window('west', 11 * CO.x, 5 * CO.x + 10, true)];

  for (let at = 0; at <= storeys; at++) {
    const top = at === storeys;
    if (at > 0) {
      // The floor: joists on hangers between the walls, and a deck for each bay. The joists stop at the stairwell.
      const depth = JOIST.depth, well = { y0: STAIR.y, y1: STAIR.y + STAIR.risers * STAIR.going, x: SPINE.x + SPINE.width + STAIR.width };
      const joist = { profile: { kind: 'RECTANGULAR', width: JOIST.width, height: depth }, axisZ: Z, predefinedType: 'JOIST', materialName: MATERIAL.timber } as const;
      const z = -JOIST.deck - depth / 2;
      let before = WALL, after = PLAN.y - WALL;
      bays.forEach(([x0, x1], bay) => {
        for (let y = WALL + 50; y < PLAN.y - WALL - JOIST.width; y += JOIST.spacing) {
          const cut = !top && bay === 1 && y + JOIST.width / 2 > well.y0 && y - JOIST.width / 2 < well.y1;
          if (bay === 1 && !cut && y < well.y0) before = y + JOIST.width / 2;
          if (bay === 1 && !cut && y > well.y1 && after > y) after = y - JOIST.width / 2;
          const from = cut ? well.x + JOIST.width : x0;
          put(at, model.addBeam({ ...joist, length: x1 - from, origin: [from, y, z], axisX: X }));
        }
        const deck = slab(at, x0, WALL, x1, PLAN.y - WALL, -JOIST.deck, JOIST.deck, top ? 'ROOF' : 'FLOOR', MATERIAL.deck, top && bay === 1);
        if (!top && bay === 1) unwrap(model.addSlabOpening({ slabLocalId: deck, offsetX: 0, offsetY: well.y0 - WALL, sizeX: STAIR.width, sizeY: well.y1 - well.y0 }));
      });
      // The trimmer carries the cut joists at the side of the stairwell.
      if (!top) put(at, model.addBeam({ ...joist, length: after - before, origin: [well.x + JOIST.width / 2, before, z], axisX: Y }));
      // A guard on the two open sides of the stairwell.
      const guard = { height: 900, thickness: JOIST.width, axisZ: Z, predefinedType: 'BALUSTRADE', infill: 'POSTED', materialName: MATERIAL.guard } as const;
      if (!top) put(at, model.addRailing({ ...guard, length: well.y1 - well.y0 + JOIST.width, origin: [well.x + JOIST.width, well.y0 - JOIST.width, 0], axisX: Y }));
      if (!top) put(at, model.addRailing({ ...guard, length: STAIR.width, origin: [well.x - STAIR.width, well.y0 - JOIST.width, 0], axisX: X }));
    }
    if (top) {
      // The flat roof: a parapet of six courses with a coping, insulation on the deck and a membrane on top.
      leaf(at, 0, BRICK.width, 0, PARAPET, MATERIAL.brick);
      leaf(at, INNER, BLOCK.width, 0, PARAPET, MATERIAL.block);
      const cap = ring(-24, WALL + 48), cover = { axisX: X, axisZ: Z, predefinedType: 'ROOFING' } as const;
      for (const side of SIDES) {
        const [x0, y0, x1, y1] = cap[side];
        put(at, model.addCovering({ ...cover, length: x1 - x0, width: y1 - y0, thickness: 50, origin: [x0, y0, PARAPET], materialName: MATERIAL.coping }), side === 'east');
      }
      // The roof finish is in two parts that meet on the spine wall. The view leaves the east part off.
      const middle = SPINE.x + SPINE.width / 2;
      [[WALL, middle], [middle, PLAN.x - WALL]].forEach(([x0, x1], part) => {
        const field = { ...cover, length: x1! - x0!, width: PLAN.y - 2 * WALL };
        put(at, model.addCovering({ ...field, predefinedType: 'INSULATION', thickness: ROOF.insulation, origin: [x0!, WALL, 0], materialName: MATERIAL.insulation }), part === 1);
        put(at, model.addCovering({ ...field, thickness: ROOF.membrane, origin: [x0!, WALL, ROOF.insulation], materialName: MATERIAL.membrane }), part === 1);
      });
      continue;
    }

    // The walls of one storey: a brick leaf, a block leaf, and the spine wall with a door.
    const leaves = [leaf(at, 0, BRICK.width, 0, STOREY, MATERIAL.brick), leaf(at, INNER, BLOCK.width, 0, STOREY, MATERIAL.block)];
    for (const o of at === 0 ? GROUND : UPPER) {
      openings.push({ ...o, level: at });
      leaves.forEach((ids, i) => {
        const inset = i * INNER, t = i === 0 ? BRICK.width : BLOCK.width;
        // The distance along a wall is from its own start: the north and the west wall run backward.
        const offsetAlongWall = o.side === 'south' ? o.at - inset : o.side === 'north' ? PLAN.x - inset - o.at - o.width : PLAN.y - inset - t - o.at - o.width;
        const hole = { wallLocalId: ids[o.side], width: o.width, height: o.height, offsetAlongWall, offsetFromFloor: o.sill, isExternal: true };
        put(at, o.door ? model.addDoor({ ...hole, materialName: 'Timber door' }) : model.addWindow({ ...hole, materialName: 'Glazing' }));
      });
    }
    const spine = put(at, model.addWall({ ...spineWall, height: STOREY, origin: [SPINE.x + SPINE.width, WALL, 0] }));
    put(at, model.addDoor({ wallLocalId: spine, width: 4 * CO.x + 10, height: 28 * CO.z, offsetAlongWall: 4250, offsetFromFloor: 0, materialName: 'Timber door' }));

    // The stair to the next floor: one straight flight along the spine wall.
    if (at < storeys - 1) {
      const flight = { width: STAIR.width, riserHeight: STOREY / STAIR.risers, treadLength: STAIR.going, numberOfRisers: STAIR.risers, axisX: Y, axisZ: Z, materialName: MATERIAL.stair };
      put(at, model.addStair({ name: 'Stair', predefinedType: 'STRAIGHT_RUN_STAIR', flights: [{ ...flight, origin: [SPINE.x + SPINE.width + STAIR.width, STAIR.y, 0] }], materialName: MATERIAL.stair }));
    }
  }
  return { level, hidden, openings };
}

// ---- display only: a frame, glass and a sill in each opening. The model has the door or the window itself.
function dressing(openings: Opening[], owned: Body[]) {
  const frames: Body[] = [], panes: Body[] = [], sills: Body[] = [], doors: Body[] = [];
  // A box in the frame of a wall: u along it, v from the outside face inward, z up.
  const piece = (side: Side, u0: number, u1: number, v0: number, v1: number, z0: number, z1: number): Body => {
    const mid: P3 = side === 'west' ? [(v0 + v1) / 2, (u0 + u1) / 2, (z0 + z1) / 2] : [(u0 + u1) / 2, side === 'south' ? (v0 + v1) / 2 : PLAN.y - (v0 + v1) / 2, (z0 + z1) / 2];
    const made = side === 'west' ? box(v1 - v0, u1 - u0, z1 - z0, { at: mid }) : box(u1 - u0, v1 - v0, z1 - z0, { at: mid });
    owned.push(made);
    return made;
  };
  for (const o of openings) {
    const z0 = o.level * STOREY + o.sill, z1 = z0 + o.height, u0 = o.at, u1 = o.at + o.width, m = 50;
    const bottom = o.door ? z0 : z0 + m;
    if (!o.door) sills.push(piece(o.side, u0, u1, -40, 30, z0, z0 + m), piece(o.side, u0, u1, 30, 100, z0, z0 + m));
    frames.push(piece(o.side, u0, u0 + m, 30, 100, bottom, z1), piece(o.side, u1 - m, u1, 30, 100, bottom, z1), piece(o.side, u0 + m, u1 - m, 30, 100, z1 - m, z1));
    // One light for each 700 mm of width, with a mullion between two lights.
    const lights = o.door && o.width < 1000 ? 1 : Math.max(1, Math.round(o.width / 700)), pitch = (o.width - m) / lights;
    for (let i = 0; i < lights; i++) {
      const a = u0 + m + i * pitch, b = a + pitch - m;
      if (i > 0) frames.push(piece(o.side, a - m, a, 30, 100, bottom, z1 - m));
      (lights === 1 && o.door ? doors : panes).push(piece(o.side, a, b, 50, lights === 1 && o.door ? 94 : 74, bottom, z1 - m));
    }
  }
  const parts: [Body[], string][] = [[frames, '#f5f2ea'], [panes, '#9fc3d4'], [sills, '#e3dfd3'], [doors, '#12b5b0']];
  return parts.filter(([list]) => list.length > 0).map(([list, tint]) => color(compound(list), tint));
}`,
  },
  {
    id: 'bim-foundations',
    label: 'Piled Foundations',
    description:
      'The foundations of a concrete frame with the ground cut open: bored piles, pile caps, ground beams, columns and the suspended slab that they carry. Piles and footings are typed IFC elements (IfcPile, IfcFooting), so a structural model can schedule them. The pile spacing, the cap edge distance, the concrete cover and the guide rate for the steel in a cap are published figures, and the kernel measures the concrete of each class and the bars of one cap. The grid, the sizes, the strata and the cage are a display model.',
    code: `import { BimModel, placedSolids, toIfc } from 'brepjs-bim';
import { box, compound, cutAll, cylinder, measureVolume, torus, translate, unwrap } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';

// Piled foundations of a concrete frame, with the ground cut open. Piles, pile caps and ground beams are
// typed IFC elements (IfcPile, IfcFooting, IfcBeam), so a structural model can schedule them.
// Units are millimetres. Z is up, and z = 0 is the top of the ground floor slab.
interface FoundationParams {
  pileLength?: number; // 5000 to 15000
  cutaway?: boolean; // cut the ground at the middle grid line and show the cage of one cap. The model keeps all
}

// ---- published figures
const PILE_RULE = { spacing: 3, edge: 150 }; // pile centres at 3 diameters, and the cap goes 150 mm past the piles
const COVER = 75; // concrete cover to the steel where the concrete is cast against earth
const CAP_STEEL = { low: 110, high: 150 }; // guide rate for pile caps, kg of bar in each m3
const STEEL = 7850e-9; // kg in each mm3

// ---- display model
const GRID = [0, 5000, 10000];
const PILE = { diameter: 450 };
const SPACING = PILE_RULE.spacing * PILE.diameter; // 1350
const CAP = { long: SPACING + PILE.diameter + 2 * PILE_RULE.edge, short: PILE.diameter + 2 * PILE_RULE.edge, depth: 1000 }; // 2100 by 750
const SLAB = { depth: 225, edge: 300 };
const BEAM = { width: 450, depth: 600 };
const COLUMN = { side: 400, height: 3200 };
const TOP = -SLAB.depth; // top of the caps and the ground beams
const CUT_OFF = TOP - CAP.depth; // top of the piles, and the level of the dig
const STRATA = [{ name: 'made ground', top: CUT_OFF, tint: '#6b5a48' }, { name: 'firm clay', top: -2600, tint: '#8c6f55' }, { name: 'dense gravel', top: -6500, tint: '#b79a6c' }];
const CONCRETE = 'Concrete C32/40';

type P3 = [number, number, number];
type Body = ReturnType<typeof box>;
type Id = Extract<ReturnType<BimModel['addSlab']>, { ok: true }>['value'];
const X: P3 = [1, 0, 0], Y: P3 = [0, 1, 0], Z: P3 = [0, 0, 1];

// The model stays alive for the IFC file. Each temporary solid is freed, also when the build throws.
function foundations({ pileLength = 8000, cutaway = true }: FoundationParams = {}) {
  const model = new BimModel(), owned: Body[] = [];
  const own = <T extends Body>(s: T): T => { owned.push(s); return s; };
  try {
    model.init({ name: 'Foundations', projectId: 'foundations-demo' });
    const site = unwrap(model.addSite({ name: 'Site' }));
    const building = unwrap(model.addBuilding({ name: 'Block A' }));
    const storey = unwrap(model.addStorey({ name: 'Substructure', elevation: 0 }));
    const project = model.getProject();
    if (project) model.aggregate(project.localId, site);
    model.aggregate(site, building);
    model.aggregate(building, storey);
    const tone = new Map<Id, string>(), hidden = new Set<Id>();
    const put = (made: ReturnType<BimModel['addSlab']>, tint: string, hide = false): Id => {
      const id = unwrap(made);
      model.placeIn(id, storey);
      tone.set(id, tint);
      if (hide) hidden.add(id);
      return id;
    };

    // ---- the lesson. Each grid node gets its piles, then a cap on them, then the column on the cap.
    // A pile takes a profile like each linear member, so a bored pile is a CIRCULAR section. The node at
    // the middle carries the most load and stands on four piles. The others stand on two.
    const piles: P3[] = [];
    GRID.forEach((x, i) => GRID.forEach((y, j) => {
      const four = i === 1 && j === 1, bare = i === 2 && j === 0; // the cap that the view shows as a cage
      const across = four ? [-SPACING / 2, SPACING / 2] : [0];
      for (const dx of across) for (const dy of [-SPACING / 2, SPACING / 2]) {
        piles.push([x + dx, y + dy, CUT_OFF - pileLength]);
        put(model.addPile({ length: pileLength, profile: { kind: 'CIRCULAR', radius: PILE.diameter / 2 }, origin: [x + dx, y + dy, CUT_OFF - pileLength], axisX: X, axisZ: Z, predefinedType: 'BORED', constructionType: 'CAST_IN_PLACE', materialName: CONCRETE }), '#9d978b', bare);
      }
      const length = four ? CAP.long : CAP.short;
      put(model.addFooting({ length, width: CAP.long, thickness: CAP.depth, origin: [x - length / 2, y - CAP.long / 2, CUT_OFF], axisX: X, axisZ: Z, predefinedType: 'PILE_CAP', materialName: CONCRETE }), '#a8a294', bare);
      put(model.addColumn({ height: COLUMN.height - TOP, profile: { kind: 'RECTANGULAR', width: COLUMN.side, height: COLUMN.side }, origin: [x, y, TOP], axisX: X, axisZ: Z, materialName: CONCRETE }), '#d8d4c8', bare);
    }));

    // Ground beams tie the caps together. Each beam stops at the faces of its two caps.
    const beam = { profile: { kind: 'RECTANGULAR', width: BEAM.width, height: BEAM.depth }, axisZ: Z, predefinedType: 'BEAM', materialName: CONCRETE } as const;
    const z = TOP - BEAM.depth / 2;
    for (const line of GRID) for (const k of [0, 1]) {
      const a = GRID[k]!, b = GRID[k + 1]!, wide = (i: number): number => (i === 1 && line === GRID[1] ? CAP.long : CAP.short) / 2;
      put(model.addBeam({ ...beam, length: b - a - wide(k) - wide(k + 1), origin: [a + wide(k), line, z], axisX: X }), '#bdb7aa');
      put(model.addBeam({ ...beam, length: b - a - CAP.long, origin: [line, a + CAP.long / 2, z], axisX: Y }), '#bdb7aa');
    }

    // The suspended ground slab, in two pours that meet at the cut. Each column goes through a hole in it.
    const joint = GRID[1]! + SLAB.edge, far = GRID[2]! + SLAB.edge, wide = far + SLAB.edge;
    [[-SLAB.edge, joint], [joint, far]].forEach(([x0, x1], pour) => {
      const slab = put(model.addSlab({ length: x1! - x0!, width: wide, thickness: SLAB.depth, origin: [x0!, -SLAB.edge, TOP], axisX: X, axisZ: Z, predefinedType: 'FLOOR', materialName: CONCRETE }), '#e9e5da', pour === 1);
      for (const x of GRID) for (const y of GRID) if (x > x0! && x < x1!)
        unwrap(model.addSlabOpening({ slabLocalId: slab, offsetX: x - COLUMN.side / 2 - x0!, offsetY: y - COLUMN.side / 2 + SLAB.edge, sizeX: COLUMN.side, sizeY: COLUMN.side }));
    });
    console.log(model.getPiles().length + ' piles, ' + model.getFootings().length + ' pile caps, ' + model.getColumns().length + ' columns, ' + model.getBeams().length + ' ground beams');

    // ---- the view and the takeoff. The kernel measures the concrete of each class of element.
    const groups = new Map<string, Body[]>(), m3 = new Map<string, number>();
    for (const el of model.getAllElements()) {
      const tint = tone.get(el.localId);
      if (tint === undefined) continue;
      const solids = unwrap(placedSolids(el));
      owned.push(...solids);
      m3.set(el.category, (m3.get(el.category) ?? 0) + solids.reduce((sum, s) => sum + unwrap(measureVolume(s)), 0) / 1e9);
      if (!(cutaway && hidden.has(el.localId))) groups.set(tint, [...(groups.get(tint) ?? []), ...solids]);
    }
    console.log('concrete: ' + [...m3].map(([category, v]) => category.toLowerCase() + ' ' + v.toFixed(1) + ' m3').join(', '));
    const toe = CUT_OFF - pileLength, gravel = STRATA[2]!.top;
    console.log('pile toe at ' + (toe / 1000).toFixed(1) + ' m: ' + (toe < gravel ? ((gravel - toe) / 1000).toFixed(1) + ' m into the dense gravel' : 'it does not reach the dense gravel'));

    const shown = [...groups].map(([tint, solids]) => color(compound(solids), tint));
    shown.push(...ground(piles, toe, cutaway, own));
    if (cutaway) {
      const bars = cage(GRID[2]!, GRID[0]!, toe, own);
      const kg = bars.cap.reduce((sum, s) => sum + unwrap(measureVolume(s)), 0) * STEEL, capM3 = (CAP.short * CAP.long * CAP.depth) / 1e9;
      console.log('cage of one cap: ' + kg.toFixed(0) + ' kg of bar in ' + capM3.toFixed(2) + ' m3 = ' + (kg / capM3).toFixed(0) + ' kg for each m3 (guide: ' + CAP_STEEL.low + ' to ' + CAP_STEEL.high + ')');
      shown.push(color(compound([...bars.cap, ...bars.rest]), '#ff5a1f'));
    }
    return { model, shown };
  } catch (error) {
    model[Symbol.dispose]();
    throw error;
  } finally {
    owned.splice(0).forEach((s) => s.delete());
  }
}

// ---- display only: the ground in three strata, with a hole for each pile. The cut goes through the piles
// of the middle grid line.
function ground(piles: P3[], toe: number, cutaway: boolean, own: <T extends Body>(s: T) => T) {
  const x0 = -1200, x1 = cutaway ? GRID[1]! : GRID[2]! + 1200, y0 = -1200, y1 = GRID[2]! + 1200, bottom = Math.min(toe, STRATA[2]!.top) - 1200;
  return STRATA.map((layer, i) => {
    const low = STRATA[i + 1]?.top ?? bottom;
    const block = own(box(x1 - x0, y1 - y0, layer.top - low, { at: [(x0 + x1) / 2, (y0 + y1) / 2, (layer.top + low) / 2] }));
    const holes = piles.filter(([x, , z]) => x - PILE.diameter / 2 < x1 && z < layer.top)
      .map(([x, y, z]) => own(cylinder(PILE.diameter / 2, layer.top - Math.max(z, low), { at: [x, y, Math.max(z, low)] })));
    return color(unwrap(cutAll(block, holes)), layer.tint);
  });
}

// ---- display only: the steel of one two-pile cap, of its piles and of its column. The bars touch and do not cross.
function cage(cx: number, cy: number, toe: number, own: <T extends Body>(s: T) => T) {
  const cap: Body[] = [], rest: Body[] = [];
  const bar = (list: Body[], d: number, from: P3, axis: P3, length: number): void => { list.push(own(cylinder(d / 2, length, { at: [cx + from[0], cy + from[1], from[2]], axis }))); };
  const half = { x: CAP.short / 2, y: CAP.long / 2 }, link = 16, main = 32, upper = 20;
  const low = CUT_OFF + COVER + link / 2, high = TOP - COVER - link / 2, side = half.x - COVER - link / 2;
  // Links at 150 mm: two legs across and two legs up, outside the other bars.
  for (let y = -825; y <= 825; y += 150) {
    for (const zz of [low, high]) bar(cap, link, [-half.x + COVER, y, zz], X, CAP.short - 2 * COVER);
    for (const xx of [-side, side]) bar(cap, link, [xx, y, low + link / 2], Z, high - low - link);
  }
  // Six main bars at the bottom, with a leg up at each end. Four bars at the top, and three lacers on each side.
  const end = half.y - COVER, zMain = low + link / 2 + main / 2;
  for (let i = 0; i < 6; i++) {
    const xx = (i - 2.5) * ((2 * (side - link / 2 - main / 2)) / 5);
    bar(cap, main, [xx, -end + main, zMain], Y, 2 * (end - main));
    for (const yy of [-end + main / 2, end - main / 2]) bar(cap, main, [xx, yy, zMain - main / 2], Z, 700);
  }
  for (let i = 0; i < 4; i++) bar(cap, upper, [(i - 1.5) * ((2 * (side - link / 2 - upper / 2)) / 3), -end, high - link / 2 - upper / 2], Y, 2 * end);
  for (const xx of [-side + link, side - link]) for (const zz of [-900, -700, -500]) bar(cap, link, [xx, -825, zz], Y, 1650);

  // A pile has six bars in a ring with hoops at 300 mm. The bars go 600 mm into the cap.
  const ring = 130, hoop = own(torus(ring + 8 + 4, 4));
  for (const py of [-SPACING / 2, SPACING / 2]) {
    for (let k = 0; k < 6; k++) {
      const a = ((30 + 60 * k) * Math.PI) / 180;
      bar(rest, 16, [ring * Math.cos(a), py + ring * Math.sin(a), toe + 150], Z, CUT_OFF + 600 - toe - 150);
    }
    for (let zz = toe + 300; zz < CUT_OFF - 100; zz += 300) rest.push(own(translate(hoop, [cx, cy + py, zz])));
  }
  // The starter bars of the column stand on the bottom bars, with three links above the cap.
  const corner = COLUMN.side / 2 - 40 - 8 - 12.5, out = corner + 12.5 + 4;
  for (const sx of [-corner, corner]) for (const sy of [-corner, corner]) bar(rest, 25, [sx, sy, zMain + main / 2], Z, 1200 - zMain);
  for (const zz of [TOP + 150, TOP + 450, TOP + 750]) {
    for (const s of [-out, out]) bar(rest, 8, [-out - 4, s, zz], X, 2 * out + 8);
    for (const s of [-out, out]) bar(rest, 8, [s, -out + 4, zz], Y, 2 * out - 8);
  }
  return { cap, rest };
}

// Show the cut ground and the cage. Try foundations({ pileLength: 5000 }), or foundations({ cutaway: false }).
const job = foundations();
// The IFC button saves the model. The ground and the bars are a display model, and are not in the file.
export default present(job.shown, {
  bimTree: job.model.toTreeSummary(),
  ifc: async () => unwrap(await toIfc(job.model, { applicationName: 'brepjs playground', applicationVersion: '1.0' })),
});`,
  },
  {
    id: 'bim-spaces-zones',
    label: 'Room Schedule and Zones',
    description:
      'The room programme of a two-bedroom flat. Each room is an IfcSpace with a name, an area and a volume, and two sets of zones group the spaces: one by use and one by ventilation. The console prints the room schedule with the total of each zone, and compares the areas that the kernel measures with the published space standard for a flat of this size. The plan, the walls and the furniture are a display model.',
    code: `import { BimModel, placedSolids, toIfc } from 'brepjs-bim';
import { box, compound, cut, cylinder, intersect, measureVolume, sphere, unwrap } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';

// The room programme of a two-bedroom flat. Each room is an IfcSpace with a name, an area and a volume,
// and zones group the spaces. A space can be in more than one zone: here one set by use and one by air.
// Units are millimetres. The origin is the inside corner of the flat, X is east, Y is north, Z is up.
interface FlatParams {
  zoneBy?: 'use' | 'air'; // the set of zones that colours the floors
  volumes?: boolean; // show each space as its full volume, without the furniture
  cutHeight?: number; // where the view cuts the walls. 2500 shows them whole
}

// ---- published figures: the space standard for a flat of two bedrooms and four persons on one storey
const STANDARD = { gia: 70, storage: 2, doubleBedroom: 11.5, bedroomWidth: 2.75, ceiling: 2.3 }; // m2 and m

// ---- display model
const H = 2500; // floor to ceiling
// name, x, y, length, depth, zone by use, zone by air (supply to the dry rooms, extract from the wet rooms)
const PROGRAMME: [string, number, number, number, number, string, string][] = [
  ['Bedroom 1', 0, 3700, 3600, 3500, 'Sleeping', 'Supply'],
  ['Bedroom 2', 0, 0, 3600, 3600, 'Sleeping', 'Supply'],
  ['Living and kitchen', 4900, 0, 5100, 5300, 'Living', 'Supply'],
  ['Hall', 3700, 2000, 1100, 5200, 'Circulation', 'Transfer'],
  ['Store', 3700, 0, 1100, 1900, 'Service', 'Transfer'],
  ['Bathroom', 4900, 5400, 2300, 1800, 'Service', 'Extract'],
  ['Utility', 7300, 5400, 2700, 1800, 'Service', 'Extract'],
  ['Balcony', 4920, -1780, 5060, 1480, 'Outdoor', '-'], // inside its guard, and in no air zone
];
const FLAT = { x: 10000, y: 7200, wall: 300, partition: 100, slab: 250 };
const BALCONY = { x: 4900, y: -1800, length: 5100, width: 1500 };
const TINT: Record<string, string> = {
  Sleeping: '#6f8fd8', Living: '#12b5b0', Circulation: '#c3c9d1', Service: '#d3a956', Outdoor: '#79b46f',
  Supply: '#12b5b0', Extract: '#ff5a1f', Transfer: '#c3c9d1', '-': '#79b46f',
};
const FLOOR = 12; // the view shows the lowest 12 mm of each space as a coloured floor. The furniture stands on it

type P3 = [number, number, number];
type Body = ReturnType<typeof box>;
type Id = Extract<ReturnType<BimModel['addSlab']>, { ok: true }>['value'];
const X: P3 = [1, 0, 0], Y: P3 = [0, 1, 0], Z: P3 = [0, 0, 1];

// The model stays alive for the IFC file. Each temporary solid is freed, also when the build throws.
function flat({ zoneBy = 'use', volumes = false, cutHeight = 1200 }: FlatParams = {}) {
  const model = new BimModel(), owned: Body[] = [];
  const own = <T extends Body>(s: T): T => { owned.push(s); return s; };
  try {
    model.init({ name: 'Space programme', projectId: 'spaces-demo' });
    const site = unwrap(model.addSite({ name: 'Site' }));
    const building = unwrap(model.addBuilding({ name: 'Block A' }));
    const storey = unwrap(model.addStorey({ name: 'Level 1', elevation: 0 }));
    const project = model.getProject();
    if (project) model.aggregate(project.localId, site);
    model.aggregate(site, building);
    model.aggregate(building, storey);

    // ---- the lesson. One space for each room of the programme.
    const spaceIds = PROGRAMME.map(([name, x, y, length, width, use]) => {
      const space = unwrap(model.addSpace({ name, length, width, height: H, origin: [x, y, 0], axisX: X, axisZ: Z, materialName: 'Air', predefinedType: use === 'Outdoor' ? 'EXTERNAL' : 'INTERNAL' }));
      model.placeIn(space, storey);
      return space;
    });
    // Zones cut across the plan. assignToGroup is the IfcRelAssignsToGroup relationship, and each space gets two.
    for (const column of [5, 6] as const) for (const name of new Set(PROGRAMME.map((p) => p[column]))) {
      if (name === '-') continue;
      const zone = unwrap(model.addZone({ name, longName: name + (column === 5 ? ' rooms' : ' air'), objectType: column === 5 ? 'Use' : 'Ventilation' }));
      model.assignToGroup(zone, spaceIds.filter((_, i) => PROGRAMME[i]![column] === name));
    }
    // One more space for the gross internal area: all of the floor inside the outer walls.
    const gross = unwrap(model.addSpace({ name: 'Flat 1', longName: 'Gross internal area', length: FLAT.x, width: FLAT.y, height: H, origin: [0, 0, 0], axisX: X, axisZ: Z, materialName: 'Air', predefinedType: 'GFA' }));
    model.placeIn(gross, storey);

    // The schedule. The kernel measures the volume of each space, and the area is the volume / the height.
    // Find the row of a space by its name: a schedule that depends on the order of the model is easy to break.
    const byName = new Map(PROGRAMME.map((p) => [p[0], p]));
    const floors: Record<string, Body[]> = {}, area = new Map<string, number>(), zoneArea = new Map<string, number>();
    console.log('room                use          air        area m2  volume m3');
    for (const el of model.getSpaces()) {
      const [solid] = unwrap(placedSolids(el));
      if (!solid) continue;
      own(solid);
      const m3 = unwrap(measureVolume(solid)) / 1e9, m2 = m3 / (H / 1000), row = byName.get(el.spec.name);
      area.set(el.spec.name, m2);
      if (!row) continue; // the gross internal area is not a room
      console.log(row[0].padEnd(20) + row[5].padEnd(13) + row[6].padEnd(10) + m2.toFixed(1).padStart(8) + m3.toFixed(1).padStart(11));
      const zone = zoneBy === 'use' ? row[5] : row[6];
      if (zone !== '-') zoneArea.set(zone, (zoneArea.get(zone) ?? 0) + m2);
      (floors[zone] ??= []).push(volumes ? solid : own(unwrap(intersect(solid, own(box(row[3], row[4], FLOOR, { at: [row[1] + row[3] / 2, row[2] + row[4] / 2, FLOOR / 2] }))))));
    }
    const total = [...zoneArea.values()].reduce((a, b) => a + b, 0);
    for (const [zone, m2] of zoneArea) console.log('  ' + zone.padEnd(12) + m2.toFixed(1).padStart(7) + ' m2  (' + ((m2 / total) * 100).toFixed(0) + '%)');
    const check = (label: string, value: number, least: number, unit: string): void => console.log('  ' + label.padEnd(24) + value.toFixed(1).padStart(6) + unit + ' (standard: ' + least + unit + ' or more) ' + (value >= least ? 'ok' : 'SHORT'));
    check('gross internal area', area.get('Flat 1') ?? 0, STANDARD.gia, ' m2');
    check('Bedroom 1', area.get('Bedroom 1') ?? 0, STANDARD.doubleBedroom, ' m2');
    check('Bedroom 2', area.get('Bedroom 2') ?? 0, STANDARD.doubleBedroom, ' m2');
    check('Bedroom 1 width', PROGRAMME[0]![4] / 1000, STANDARD.bedroomWidth, ' m');
    check('built-in storage', area.get('Store') ?? 0, STANDARD.storage, ' m2');
    check('ceiling height', H / 1000, STANDARD.ceiling, ' m');

    // ---- the view: the coloured spaces, the building around them, and the furniture.
    const shown = Object.entries(floors).map(([zone, list]) => color(compound(list), TINT[zone] ?? '#c3c9d1'));
    const holes = shell(model, storey);
    const keep = own(box(40000, 40000, cutHeight + FLAT.slab, { at: [0, 0, (cutHeight - FLAT.slab) / 2] }));
    const built: Record<string, Body[]> = {};
    for (const el of model.getAllElements()) {
      if (el.category !== 'WALL' && el.category !== 'SLAB' && el.category !== 'RAILING') continue;
      for (const s of unwrap(placedSolids(el))) (built[el.category] ??= []).push(el.category === 'WALL' && cutHeight < H ? own(unwrap(intersect(own(s), keep))) : own(s));
    }
    shown.push(color(compound(built.WALL ?? []), '#f5f2ea'), color(compound(built.SLAB ?? []), '#b9b3a6'), color(compound(built.RAILING ?? []), '#9fc3d4'));
    shown.push(...openings(holes, Math.min(cutHeight, H), !volumes, own));
    if (!volumes) shown.push(...furniture(Math.min(cutHeight, H) - FLOOR, own));
    return { model, shown };
  } catch (error) {
    model[Symbol.dispose]();
    throw error;
  } finally {
    owned.splice(0).forEach((s) => s.delete());
  }
}

// Show the floors by use. Try flat({ zoneBy: 'air' }), flat({ volumes: true }), or flat({ cutHeight: 2500 }).
const home = flat();
export default present(home.shown, {
  bimTree: home.model.toTreeSummary(),
  ifc: async () => unwrap(await toIfc(home.model, { applicationName: 'brepjs playground', applicationVersion: '1.0' })),
});

// ---- the building: a slab, the outer walls, the partitions, a balcony, and a door or a window in each opening.
type Hole = { along: 'x' | 'y'; x0: number; y0: number; t: number; at: number; width: number; sill: number; height: number; leaf: -1 | 0 | 1; hinge: 0 | 1 };
function shell(model: BimModel, storey: Id): Hole[] {
  const holes: Hole[] = [];
  const put = (made: ReturnType<BimModel['addSlab']>) => { const id = unwrap(made); model.placeIn(id, storey); return id; };
  // A wall from its rectangle on the plan. Each opening: [distance along, width, sill, height, side of the leaf, hinge end].
  const wall = (x0: number, y0: number, x1: number, y1: number, materialName: string, cuts: [number, number, number, number, -1 | 0 | 1, 0 | 1][] = []): void => {
    const along = x1 - x0 > y1 - y0 ? 'x' : 'y', t = along === 'x' ? y1 - y0 : x1 - x0, isExternal = t === FLAT.wall;
    // The thickness of a wall is on the left of its direction: +Y for a wall along X, -X for a wall along Y.
    const id = put(model.addWall({ length: along === 'x' ? x1 - x0 : y1 - y0, height: H, thickness: t, origin: along === 'x' ? [x0, y0, 0] : [x1, y0, 0], axisX: along === 'x' ? X : Y, axisZ: Z, materialName, isExternal }));
    for (const [at, width, sill, height, leaf, hinge] of cuts) {
      const hole = { wallLocalId: id, width, height, offsetAlongWall: at - (along === 'x' ? x0 : y0), offsetFromFloor: sill, isExternal };
      put(sill > 0 ? model.addWindow({ ...hole, materialName: 'Glazing' }) : model.addDoor({ ...hole, materialName: isExternal && leaf === 0 ? 'Glazing' : 'Timber door' }));
      holes.push({ along, x0, y0, t, at, width, sill, height, leaf, hinge });
    }
  };
  const { x: LX, y: LY, wall: E, partition: P } = FLAT, outer = 'Brick cavity wall', inner = 'Plasterboard partition';
  put(model.addSlab({ length: LX + 2 * E, width: LY + 2 * E, thickness: FLAT.slab, origin: [-E, -E, -FLAT.slab], axisX: X, axisZ: Z, predefinedType: 'FLOOR', materialName: 'Concrete' }));
  wall(-E, -E, LX + E, 0, outer, [[900, 1800, 900, 1200, 0, 0], [5600, 2400, 0, 2100, 0, 0], [8500, 1200, 900, 1200, 0, 0]]); // south: the facade
  wall(-E, LY, LX + E, LY + E, outer, [[3745, 1010, 0, 2100, -1, 0]]); // north: the access deck and the front door
  wall(-E, 0, 0, LY, outer, [[1000, 1200, 900, 1200, 0, 0], [4500, 1800, 900, 1200, 0, 0]]); // west: the end of the block
  wall(LX, 0, LX + E, LY, outer); // east: the party wall
  wall(3600, 0, 3700, LY, inner, [[2500, 900, 0, 2040, -1, 0], [3900, 900, 0, 2040, -1, 0]]);
  wall(4800, 0, 4900, LY, inner, [[2600, 900, 0, 2040, 1, 1], [5700, 900, 0, 2040, 1, 0]]);
  wall(0, 3600, 3600, 3600 + P, inner);
  wall(3700, 1900, 4800, 1900 + P, inner, [[3800, 900, 0, 2040, 1, 0]]);
  wall(4900, 5300, LX, 5300 + P, inner, [[8000, 900, 0, 2040, 1, 0]]);
  wall(7200, 5400, 7300, LY, inner);
  // The balcony: a slab with a glass guard on three sides.
  const { x: bx, y: by, length: bl, width: bw } = BALCONY;
  put(model.addSlab({ length: bl, width: bw, thickness: 200, origin: [bx, by, -200], axisX: X, axisZ: Z, predefinedType: 'FLOOR', materialName: 'Concrete' }));
  const guard = { height: 1100, thickness: 20, axisZ: Z, predefinedType: 'BALUSTRADE', materialName: 'Laminated glass' } as const;
  put(model.addRailing({ ...guard, length: bl, origin: [bx, by, 0], axisX: X }));
  put(model.addRailing({ ...guard, length: bw - 20, origin: [bx + 20, by + 20, 0], axisX: Y }));
  put(model.addRailing({ ...guard, length: bw - 20, origin: [bx + bl, by + 20, 0], axisX: Y }));
  return holes;
}

// ---- display only: a frame and glass in each window, and an open leaf at each door.
function openings(holes: Hole[], top: number, open: boolean, own: <T extends Body>(s: T) => T) {
  const frames: Body[] = [], panes: Body[] = [], leaves: Body[] = [];
  // A box in the frame of a wall: u along it, v across it from its first face, z up.
  const piece = (h: Hole, u0: number, u1: number, v0: number, v1: number, z0: number, z1: number): Body =>
    own(h.along === 'x' ? box(u1 - u0, v1 - v0, z1 - z0, { at: [(u0 + u1) / 2, h.y0 + (v0 + v1) / 2, (z0 + z1) / 2] }) : box(v1 - v0, u1 - u0, z1 - z0, { at: [h.x0 + (v0 + v1) / 2, (u0 + u1) / 2, (z0 + z1) / 2] }));
  for (const h of holes) {
    const a = h.at, b = h.at + h.width, z1 = Math.min(h.sill + h.height, top), m = 50, mid = h.t / 2;
    if (z1 <= h.sill) continue;
    if (h.leaf !== 0) {
      // A door leaf, open at 90 degrees on the side of its room.
      const u = h.hinge === 0 ? a : b - 40, v0 = h.leaf > 0 ? h.t : -h.width;
      if (open) leaves.push(piece(h, u, u + 40, v0, v0 + h.width, FLOOR, z1));
      continue;
    }
    frames.push(piece(h, a, a + m, mid - 35, mid + 35, h.sill, z1), piece(h, b - m, b, mid - 35, mid + 35, h.sill, z1));
    if (h.sill > 0) frames.push(piece(h, a + m, b - m, mid - 35, mid + 35, h.sill, h.sill + m));
    const lights = Math.max(1, Math.round(h.width / 900)), pitch = (h.width - m) / lights, low = h.sill > 0 ? h.sill + m : h.sill;
    for (let i = 0; i < lights; i++) {
      if (i > 0) frames.push(piece(h, a + i * pitch, a + i * pitch + m, mid - 35, mid + 35, low, z1));
      panes.push(piece(h, a + m + i * pitch, a + (i + 1) * pitch, mid - 12, mid + 12, low, z1));
    }
  }
  const parts: [Body[], string][] = [[frames, '#48515c'], [panes, '#9fc3d4'], [leaves, '#e3dfd3']];
  return parts.filter(([list]) => list.length > 0).map(([list, tint]) => color(compound(list), tint));
}

// ---- display only: the furniture, cut at the same height as the walls.
// Each box is: tone, then x0, y0, z0, x1, y1, z1 above the floor.
function furniture(top: number, own: <T extends Body>(s: T) => T) {
  const tones: Record<string, Body[]> = { white: [], wood: [], dark: [], accent: [], steel: [], green: [] };
  const b = (tone: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void => {
    const z = Math.min(z1, top);
    if (z > z0) tones[tone]!.push(own(box(x1 - x0, y1 - y0, z - z0, { at: [(x0 + x1) / 2, (y0 + y1) / 2, FLOOR + (z0 + z) / 2] })));
  };
  const round = (tone: string, x: number, y: number, z0: number, r: number, h: number): void => {
    if (top > z0) tones[tone]!.push(own(cylinder(r, Math.min(h, top - z0), { at: [x, y, FLOOR + z0] })));
  };
  // A bed with its head at y1: a base, a mattress, a cover and the pillows.
  const bed = (x0: number, y0: number, x1: number, y1: number): void => {
    b('wood', x0, y0, 0, x1, y1 - 50, 280); b('wood', x0, y1 - 50, 0, x1, y1, 950); b('white', x0 + 20, y0 + 20, 280, x1 - 20, y1 - 50, 480);
    b('accent', x0 + 20, y0 + 20, 480, x1 - 20, y1 - 750, 530);
    const n = x1 - x0 > 1200 ? 2 : 1, w = (x1 - x0 - 40) / n;
    for (let i = 0; i < n; i++) b('white', x0 + 60 + i * w, y1 - 550, 480, x0 + i * w + w - 20, y1 - 130, 600);
  };
  // A chair: a seat on a block, with its back on the side that (dx, dy) points to.
  const chair = (x: number, y: number, dx: number, dy: number): void => {
    b('dark', x - 200, y - 200, 0, x + 200, y + 200, 450);
    b('dark', x + (dx < 0 ? -200 : dx > 0 ? 160 : -200), y + (dy < 0 ? -200 : dy > 0 ? 160 : -200), 450, x + (dx > 0 ? 200 : dx < 0 ? -160 : 200), y + (dy > 0 ? 200 : dy < 0 ? -160 : 200), 850);
  };
  // Bedroom 1: a double bed, two bedside tables and a wardrobe.
  bed(1050, 5200, 2550, 7200); b('wood', 550, 6750, 0, 1000, 7200, 500); b('wood', 2600, 6750, 0, 3050, 7200, 500); b('wood', 200, 3700, 0, 2000, 4300, 2000);
  // Bedroom 2: two single beds, a desk at the window and a wardrobe.
  bed(150, 1700, 1050, 3600); bed(1500, 1700, 2400, 3600); b('wood', 1075, 3200, 0, 1475, 3600, 500);
  b('wood', 1100, 0, 700, 2500, 600, 740); b('wood', 1100, 0, 0, 1150, 600, 700); b('wood', 2450, 0, 0, 2500, 600, 700); chair(1800, 850, 0, 1); b('wood', 3000, 100, 0, 3600, 1500, 2000);
  // Living: a sofa, a rug, a low table, the screen, and a plant.
  b('accent', 5600, 450, 0, 7450, 2350, 8); b('wood', 6200, 900, 8, 6800, 1900, 380);
  b('dark', 7500, 400, 0, 8400, 2400, 420); b('dark', 8200, 400, 420, 8400, 2400, 800); b('dark', 7500, 400, 420, 8200, 600, 620); b('dark', 7500, 2200, 420, 8200, 2400, 620);
  b('wood', 4900, 500, 0, 5350, 2300, 450); b('dark', 4930, 800, 450, 4980, 2000, 1150);
  round('wood', 9300, 600, 0, 220, 400); tones.green!.push(own(sphere(380, { at: [9300, 600, FLOOR + 780] })));
  // Dining: a table and four chairs.
  b('wood', 5800, 3900, 700, 7200, 4700, 740);
  for (const [x, y] of [[5850, 3950], [7100, 3950], [5850, 4600], [7100, 4600]] as const) b('wood', x, y, 0, x + 50, y + 50, 700);
  chair(6150, 3650, 0, -1); chair(6850, 3650, 0, -1); chair(6150, 4950, 0, 1); chair(6850, 4950, 0, 1);
  // Kitchen: base units with a worktop, a sink, a hob, a tall fridge, and an island with two stools.
  b('white', 9400, 2300, 0, 10000, 4700, 870); b('wood', 9380, 2300, 870, 10000, 4700, 910); b('steel', 9400, 4700, 0, 10000, 5300, 2000);
  b('steel', 9500, 2500, 910, 9900, 3100, 916); b('dark', 9480, 3600, 910, 9920, 4300, 918);
  for (const [x, y] of [[9590, 3780], [9810, 3780], [9590, 4120], [9810, 4120]] as const) round('steel', x, y, 918, 75, 14);
  b('white', 7950, 2900, 0, 8550, 4700, 870); b('wood', 7930, 2880, 870, 8570, 4720, 910);
  for (const y of [3350, 4250]) { round('steel', 7750, y, 0, 25, 620); round('accent', 7750, y, 620, 170, 40); }
  // Bathroom: a bath, a basin and a WC. Utility: a washer, a hot water cylinder and a shelf unit.
  tones.white!.push(own(unwrap(cut(own(box(1700, 700, 550, { at: [6350, 6850, FLOOR + 275] })), own(box(1540, 540, 480, { at: [6350, 6850, FLOOR + 310] }))))));
  b('white', 5900, 5400, 700, 6400, 5800, 850); b('white', 6080, 5400, 0, 6220, 5560, 700);
  b('white', 7000, 5650, 380, 7200, 6050, 800); round('white', 6810, 5850, 0, 190, 400);
  b('white', 9400, 6600, 0, 10000, 7200, 850); b('dark', 9380, 6700, 250, 9400, 7100, 650); round('steel', 7700, 6800, 0, 275, 1500); b('wood', 7300, 5450, 0, 7600, 6350, 1100);
  // Store: two shelf units. Balcony: a table, two chairs and a planter.
  b('wood', 3700, 100, 0, 4100, 1750, 1100); b('wood', 4450, 100, 0, 4800, 1000, 1100);
  round('steel', 6000, -1050, 0, 30, 700); round('wood', 6000, -1050, 700, 350, 30); chair(5350, -1050, -1, 0); chair(6650, -1050, 1, 0);
  b('dark', 8600, -1750, 0, 9950, -1350, 400);
  for (const x of [8850, 9275, 9700]) tones.green!.push(own(sphere(200, { at: [x, -1550, FLOOR + 600] })));
  const tint: Record<string, string> = { white: '#f5f2ea', wood: '#b98a5a', dark: '#48515c', accent: '#ff5a1f', steel: '#c3c9d1', green: '#4f9a5c' };
  return Object.entries(tones).map(([tone, list]) => color(compound(list), tint[tone]!));
}`,
  },
  {
    id: 'bim-finishes',
    label: 'Finishes and Access',
    description:
      'The finishes of one corner of a building, cut back layer by layer: the floor, the walls, the ceiling and the roof are built up from separate IfcCovering elements, each with its own material and thickness on the slab or the wall that it covers. A 1:15 entrance ramp with a landing, two steps and a posted guardrail gives access. The ramp limits, the step rise, the conductivities and the U-value limits are published figures, and the kernel measures the area of each covering. The room and the build-ups are a display model.',
    code: `import { BimModel, placedSolids, toIfc } from 'brepjs-bim';
import { box, compound, intersect, measureVolume, unwrap } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';

// The finishes of one corner of a building, peeled back layer by layer, and its entrance ramp.
// Each layer of the floor, the walls and the roof is an IfcCovering with its own material and thickness,
// on the slab or the wall that it covers. Units are millimetres. Z is up, and z = 0 is the finished floor.
interface FinishParams {
  peel?: number; // how far the view cuts each layer back from the layer under it. 0 shows the model whole
  rise?: number; // height of the floor above the ground: the ramp climbs it at 1:15
}

// ---- published figures
const RAMP = { gradient: 15, longest: 5000, width: 1500, landing: 1200 }; // a 1:15 ramp: 5 m long at most, 1.5 m wide, landings of 1.2 m or more
const STEP = { rise: 170 }; // largest rise of an outside step
const LIMIT = { wall: 0.26, roof: 0.16 }; // largest U-value of a new wall and roof, W/m2K
const LAMBDA = { mineralWool: 0.038, pir: 0.025, concrete: 2.3, block: 1.63, plaster: 0.46 }; // conductivity, W/mK
const SURFACE = { inside: 0.13, outside: 0.04, insideUp: 0.1 }; // surface resistance, m2K/W

// ---- display model
const ROOM = { x: 6000, y: 4500, clear: 2700, void: 285 };
// Each build-up from the structure outward: material, thickness, and the tint in the view.
const FLOOR = { slab: 250, layers: [['PIR insulation', 100, '#e9d98a'], ['Sand and cement screed', 65, '#c9c4b8'], ['Oak boards', 18, '#b98a5a']] as const };
const WALL = { block: 140, inside: [['Gypsum plaster', 13, '#f5f2ea']] as const, outside: [['Mineral wool slab', 150, '#d9b44a'], ['Timber batten', 38, '#8a6f52'], ['Fibre cement panel', 12, '#12b5b0']] as const };
const ROOF = { slab: 200, layers: [['PIR roof board', 160, '#e9d98a'], ['Bitumen membrane', 8, '#48515c']] as const, ceiling: ['Mineral fibre tile', 15, '#f5f2ea'] as const };
const CONCRETE = '#a8a294', BLOCK = '#bdb7aa';

type P3 = [number, number, number];
type Body = ReturnType<typeof box>;
type Id = Extract<ReturnType<BimModel['addSlab']>, { ok: true }>['value'];
type Kind = 'FLOORING' | 'CEILING' | 'CLADDING' | 'INSULATION' | 'ROOFING' | 'SKIRTINGBOARD';
type Keep = [number, number, number, number]; // the part of the plan that the view keeps: x0, y0, x1, y1
const X: P3 = [1, 0, 0], Y: P3 = [0, 1, 0], Z: P3 = [0, 0, 1], FAR = 20000;

// The model stays alive for the IFC file. Each temporary solid is freed, also when the build throws.
function finishes({ peel = 450, rise = 300 }: FinishParams = {}) {
  const model = new BimModel(), owned: Body[] = [];
  const own = <T extends Body>(s: T): T => { owned.push(s); return s; };
  try {
    model.init({ name: 'Finishes and access', projectId: 'finishes-demo' });
    const site = unwrap(model.addSite({ name: 'Site' }));
    const building = unwrap(model.addBuilding({ name: 'Block A' }));
    const storey = unwrap(model.addStorey({ name: 'Ground Floor', elevation: 0 }));
    const project = model.getProject();
    if (project) model.aggregate(project.localId, site);
    model.aggregate(site, building);
    model.aggregate(building, storey);
    const view = new Map<Id, { tint: string; keep?: Keep }>();
    const put = (made: ReturnType<BimModel['addSlab']>, tint: string, keep?: Keep): Id => {
      const id = unwrap(made);
      model.placeIn(id, storey);
      view.set(id, keep ? { tint, keep } : { tint });
      return id;
    };
    const { x: LX, y: LY } = ROOM, out = WALL.block + WALL.outside.reduce((sum, l) => sum + l[1], 0); // 340: the wall outside the room
    const floorTop = -FLOOR.layers.reduce((sum, l) => sum + l[1], 0), soffit = ROOM.clear + ROOF.ceiling[1] + ROOM.void;

    // ---- the lesson. A covering is a sheet: its length and width are in its local XY plane, and its
    // thickness is along its local Z. The host is the element that it covers.
    const flat = (host: Id, kind: Kind, [materialName, thickness, tint]: readonly [string, number, string], z: number, keep: Keep, x0 = 0, y1 = LY): Id =>
      put(model.addCovering({ length: LX - x0, width: y1, thickness, origin: [x0, 0, z], axisX: X, axisZ: Z, predefinedType: kind, materialName }, host), tint, keep);
    // A sheet on the north wall has its thickness along +Y. Its local Y is axisZ x axisX, so axisX is -X to keep it upright.
    const north = (host: Id, kind: Kind, [materialName, thickness, tint]: readonly [string, number, string], y: number, x0: number, x1: number, z0: number, z1: number, keep: Keep): Id =>
      put(model.addCovering({ length: x1 - x0, width: z1 - z0, thickness, origin: [x1, y, z0], axisX: [-1, 0, 0], axisZ: Y, predefinedType: kind, materialName }, host), tint, keep);
    // A sheet on the west wall has its thickness along +X, and runs along +Y.
    const west = (host: Id, kind: Kind, [materialName, thickness, tint]: readonly [string, number, string], x: number, y0: number, y1: number, z0: number, z1: number, keep: Keep): Id =>
      put(model.addCovering({ length: y1 - y0, width: z1 - z0, thickness, origin: [x, y0, z0], axisX: Y, axisZ: X, predefinedType: kind, materialName }, host), tint, keep);
    const upTo = (k: number): Keep => [-FAR, -FAR, LX - k * peel, FAR]; // cut back from the east end
    const from = (k: number): Keep => [-FAR, k * peel, FAR, FAR]; // cut back from the south end

    // The floor: insulation, screed and boards on the ground slab.
    const slab = put(model.addSlab({ length: LX + out, width: LY + out, thickness: FLOOR.slab, origin: [-out, 0, floorTop - FLOOR.slab], axisX: X, axisZ: Z, predefinedType: 'BASESLAB', materialName: 'Concrete' }), CONCRETE);
    let z = floorTop;
    FLOOR.layers.forEach((layer, i) => { flat(slab, i === 0 ? 'INSULATION' : 'FLOORING', layer, z, upTo(i + 1)); z += layer[1]; });

    // The walls: blockwork with plaster and a skirting inside, and insulation, battens and panels outside.
    const wall = { height: soffit - floorTop, thickness: WALL.block, axisZ: Z, materialName: 'Concrete block', isExternal: true };
    const outside = WALL.outside.length, plaster = WALL.inside[0], skirting = ['Painted softwood skirting', 15, '#e3dfd3'] as const;
    const northWall = put(model.addWall({ ...wall, length: LX + WALL.block, origin: [-WALL.block, LY, floorTop], axisX: X }), BLOCK, upTo(outside));
    const westWall = put(model.addWall({ ...wall, length: LY, origin: [0, 0, floorTop], axisX: Y }), BLOCK, from(outside));
    north(northWall, 'CLADDING', plaster, LY - plaster[1], 0, LX, 0, ROOM.clear, upTo(outside + 1));
    west(westWall, 'CLADDING', plaster, 0, 0, LY - plaster[1], 0, ROOM.clear, from(outside + 1));
    north(northWall, 'SKIRTINGBOARD', skirting, LY - plaster[1] - skirting[1], plaster[1], LX, 0, 95, upTo(outside + 1));
    west(westWall, 'SKIRTINGBOARD', skirting, plaster[1], 0, LY - plaster[1] - skirting[1], 0, 95, from(outside + 1));
    let d = WALL.block;
    WALL.outside.forEach((layer, i) => {
      const kind = i === 0 ? 'INSULATION' : 'CLADDING', k = outside - 1 - i, z1 = soffit + ROOF.slab;
      if (i === 1) {
        // The battens stand at 600 mm centres and leave an air gap behind the panels.
        for (let x = -d; x < LX - 50; x += 600) north(northWall, kind, layer, LY + d, x, x + 50, floorTop, z1, upTo(k));
        for (let y = 0; y < LY + d - 50; y += 600) west(westWall, kind, layer, -d - layer[1], y, y + 50, floorTop, z1, from(k));
      } else {
        north(northWall, kind, layer, LY + d, -d - layer[1], LX, floorTop, z1, upTo(k));
        west(westWall, kind, layer, -d - layer[1], 0, LY + d, floorTop, z1, from(k));
      }
      d += layer[1];
    });

    // The roof: a hung ceiling under the slab, and insulation and a membrane on it. The view keeps one corner.
    const corner = (k: number): Keep => (peel > 0 ? [-FAR, LY - 3000 + k * peel, 3300 - k * peel, FAR] : [-FAR, -FAR, FAR, FAR]);
    const roof = put(model.addSlab({ length: LX + WALL.block, width: LY + WALL.block, thickness: ROOF.slab, origin: [-WALL.block, 0, soffit], axisX: X, axisZ: Z, predefinedType: 'ROOF', materialName: 'Concrete' }), CONCRETE, corner(1));
    flat(roof, 'CEILING', ROOF.ceiling, ROOM.clear, corner(0), plaster[1], LY - plaster[1]);
    z = soffit + ROOF.slab;
    ROOF.layers.forEach((layer, i) => { flat(roof, i === 0 ? 'INSULATION' : 'ROOFING', layer, z, corner(i + 2), -WALL.block, LY + WALL.block); z += layer[1]; });

    // ---- access: a 1:15 ramp along the front to a landing, two steps, and a guard on the open edge of the landing.
    // The slope is rise / run, so the run follows from the rise. The width of a flight is on the left of its direction.
    const run = rise * RAMP.gradient, risers = Math.ceil(rise / STEP.rise), paving = '#6f6a60', stone = '#d8d4c8';
    const concrete = { materialName: 'Concrete' };
    put(model.addRamp({ name: 'Entrance ramp', predefinedType: 'STRAIGHT_RUN_RAMP', ...concrete, flights: [
      { width: RAMP.width, length: run, slope: 1 / RAMP.gradient, thickness: 150, origin: [RAMP.width + run, 0, -rise], axisX: [-1, 0, 0], axisZ: Z, predefinedType: 'STRAIGHT', ...concrete },
    ] }), stone);
    put(model.addSlab({ length: RAMP.width, width: RAMP.width, thickness: 150, origin: [0, -RAMP.width, -150], axisX: X, axisZ: Z, predefinedType: 'LANDING', ...concrete }), stone);
    put(model.addStair({ name: 'Entrance steps', predefinedType: 'STRAIGHT_RUN_STAIR', ...concrete, flights: [
      { width: RAMP.width, riserHeight: rise / risers, treadLength: 300, numberOfRisers: risers, origin: [RAMP.width, -RAMP.width - risers * 300, -rise], axisX: Y, axisZ: Z, ...concrete },
    ] }), stone);
    put(model.addRailing({ length: RAMP.width, height: 1100, thickness: 60, origin: [60, -RAMP.width, 0], axisX: Y, axisZ: Z, predefinedType: 'GUARDRAIL', infill: 'POSTED', materialName: 'Steel' }), '#c3c9d1');
    // The ground around the ramp, in three pieces.
    const ground = (x0: number, y0: number, x1: number, y1: number): Id =>
      put(model.addSlab({ length: x1 - x0, width: y1 - y0, thickness: 100, origin: [x0, y0, -rise - 100], axisX: X, axisZ: Z, predefinedType: 'BASESLAB', materialName: 'Concrete paving' }), paving);
    const east = Math.max(LX, RAMP.width + run) + 1200, front = -RAMP.width - risers * 300;
    ground(-out, front - 1200, east, front);
    ground(RAMP.width, front, east, -RAMP.width);
    ground(RAMP.width + run, -RAMP.width, east, 0);

    console.log('ramp: rise ' + rise + ' mm over ' + run + ' mm run (1:' + RAMP.gradient + '), landing ' + RAMP.width + ' mm deep (' + RAMP.landing + ' or more). ' + (run <= RAMP.longest ? 'ok' : 'TOO LONG') + ': a 1:' + RAMP.gradient + ' ramp can be ' + RAMP.longest + ' mm at most');

    // ---- the schedule and the view. The kernel measures each covering: volume / thickness = area.
    const groups = new Map<string, Body[]>(), rows = new Map<string, { type: string; material: string; thickness: number; m2: number }>();
    for (const el of model.getAllElements()) {
      const seen = view.get(el.localId);
      if (!seen) continue;
      for (const solid of unwrap(placedSolids(el))) {
        own(solid);
        if (el.category === 'COVERING') {
          const { predefinedType: type = 'COVERING', materialName: material, thickness } = el.spec;
          const row = rows.get(material) ?? { type, material, thickness, m2: 0 };
          row.m2 += unwrap(measureVolume(solid)) / thickness / 1e6;
          rows.set(material, row);
        }
        const k = seen.keep;
        const part = peel > 0 && k ? own(unwrap(intersect(solid, own(box(k[2] - k[0], k[3] - k[1], 2 * FAR, { at: [(k[0] + k[2]) / 2, (k[1] + k[3]) / 2, 0] }))))) : solid;
        groups.set(seen.tint, [...(groups.get(seen.tint) ?? []), part]);
      }
    }
    for (const r of rows.values()) console.log('  ' + r.type.padEnd(14) + r.material.padEnd(26) + String(r.thickness).padStart(4) + ' mm' + r.m2.toFixed(1).padStart(7) + ' m2');

    // The insulation is there for a reason. U = 1 / the sum of the resistance of each layer (thickness / conductivity).
    // The panels are in front of a vented gap, so they do not count and the gap side has the inside resistance.
    const mm = (t: number, lambda: number): number => t / 1000 / lambda;
    const wallU = 1 / (SURFACE.inside + mm(plaster[1], LAMBDA.plaster) + mm(WALL.block, LAMBDA.block) + mm(WALL.outside[0][1], LAMBDA.mineralWool) + SURFACE.inside);
    const roofU = 1 / (SURFACE.insideUp + mm(ROOF.slab, LAMBDA.concrete) + mm(ROOF.layers[0][1], LAMBDA.pir) + SURFACE.outside);
    console.log('U-value: wall ' + wallU.toFixed(2) + ' W/m2K (limit ' + LIMIT.wall + '), roof ' + roofU.toFixed(2) + ' W/m2K (limit ' + LIMIT.roof + ')');
    return { model, shown: [...groups].map(([tint, solids]) => color(compound(solids), tint)) };
  } catch (error) {
    model[Symbol.dispose]();
    throw error;
  } finally {
    owned.splice(0).forEach((s) => s.delete());
  }
}

// Show the layers cut back by 450 mm each. Try finishes({ peel: 0 }), or finishes({ rise: 150 }).
const job = finishes();
export default present(job.shown, {
  bimTree: job.model.toTreeSummary(),
  ifc: async () => unwrap(await toIfc(job.model, { applicationName: 'brepjs playground', applicationVersion: '1.0' })),
});`,
  },
  {
    id: 'bim-datacenter',
    label: 'Datacenter Hall',
    description:
      'A data hall designed on the 600 mm tile grid: four rows of 42U racks on the metric 8-tile pitch with hot-aisle containment, a fully perforated cold-aisle floor over a raised-floor plenum, six CRAH units sized N+1, and A+B power down redundant 250 A overhead busway. Each element carries datacenter psets (with the IFC class that a native writer would use) and is in a zone or a system. The console runs the capacity checks of a design review, and the Files button saves the equipment schedule. The view lifts the floor at one end to show the plenum. The rack fronts, the supports, the cables and the pipes are a display model.',
    code: `import { BimModel, countBySeverity, placedSolids, toIfcValidated } from 'brepjs-bim';
import { box, compound, cylinder, extrude, polygon, translate, unwrap, validSolid } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';

// A data hall laid out the way one is designed: on the tile grid. Hot-aisle containment, N+1 CRAH
// cooling, A+B power. The console runs the capacity checks of a design review. Files saves the schedule.
// Units are millimetres. The rows run along X, and z = 0 is the top of the structural slab.
interface HallParams {
  perRow?: number; // racks in each row. 12 takes the cooling past its N+1 capacity
  rackKW?: number; // design load of one rack
  cutaway?: boolean; // lift the floor field at the east end and leave the north wall off. The model keeps them
}

// ---- published figures. The metric 8-tile pitch closes exactly: 1200 cold aisle + 1200 rack + 1200 hot
// aisle + 1200 rack (the imperial 7-tile pitch needs 610 mm tiles). A cold aisle of 1.2 m is the front
// clearance that TIA-942 prefers.
const TILE = 600; // raised-floor module (24 in grid)
const RACK = { w: 600, d: 1200, h: 1991, u: 42 }; // 42U cabinet
const CRAH = { kW: 74.6, airM3h: 15000, w: 2050, d: 890, h: 1970 }; // chilled-water downflow class
const RPP_KVA = 150; // row-end panel: each feed alone carries its row
const BUS = { amps: 250, volts: 415, continuous: 0.8 }; // track busway, 3-phase, A + B runs for each row
const TILE_BAND = [680, 1020]; // m3/h that a 25%-open tile carries (400 to 600 CFM)
const CLEAR = 2600; // TIA-942 clear height over the floor: the trays start above it
const DT = 15; // K, the gain from containment: no bypass air, and the supply stays in the ASHRAE 18 to 27 C band

// ---- display model
const RF = 600; // raised-floor height: a full-depth supply plenum under the floor
const ROWS = 4;
const AISLE = 2 * TILE; // cold and hot aisles are two tiles each
const BAND = 2 * TILE; // a rack row: the 1200 mm rack fills its band exactly
const END = 3 * TILE; // service zone at each row end: CRAH + egress clearance
const HALL_Y = (2 * ROWS + 1) * BAND; // 10.8 m: 4 rack bands + 5 aisles
const WALL_H = 4400;
const TRAY = { width: 450, depth: 100, z: RF + CLEAR + 100 }, BUSWAY = { width: 160, depth: 150, z: RF + CLEAR + 600, off: 350 };

type P3 = [number, number, number];
type Body = ReturnType<typeof box>;
type Tones = Record<string, Body[]>;
const X: P3 = [1, 0, 0], Y: P3 = [0, 1, 0], Z: P3 = [0, 0, 1];
const seq = (n: number): number[] => Array.from({ length: n }, (_, i) => i);
// Y bands, 2 tiles each: cold | row | hot | row | cold | row | hot | row | cold. Rows alternate facing
// (TIA-942), so back-to-back pairs share a contained hot aisle and each front takes air from a cold aisle.
const bandY = (i: number): number => i * BAND;
const rowBand = (r: number): number => bandY(2 * r + 1);
const facesUp = (r: number): boolean => r % 2 === 1; // rows A, C front -y. Rows B, D front +y

// The model stays alive for the IFC file. Each temporary solid is freed, also when the build throws.
async function hall({ perRow = 10, rackKW = 8, cutaway = true }: HallParams = {}) {
  const model = new BimModel(), owned: Body[] = [];
  const own = <T extends Body>(s: T): T => { owned.push(s); return s; };
  try {
    model.init({ name: 'Data Hall 1', projectId: 'dc-hall-demo', crs: { name: 'EPSG:25832', eastings: 691000, northings: 5335000 } });
    const site = unwrap(model.addSite({ name: 'Campus' }));
    const building = unwrap(model.addBuilding({ name: 'DC1' }));
    const storey = unwrap(model.addStorey({ name: 'Data Hall Level', elevation: 0 }));
    const project = model.getProject();
    if (project) model.aggregate(project.localId, site);
    model.aggregate(site, building);
    model.aggregate(building, storey);
    const ROW_LEN = (perRow + 2) * TILE; // the racks + a remote power panel at each end
    const HALL_X = END + ROW_LEN + END; // 10.8 m for 10 racks: 18 tiles
    const rowMidX = END + ROW_LEN / 2, rackX = (j: number): number => END + TILE * (1 + j) + TILE / 2;
    const placed = <T,>(id: T): T => { model.placeIn(id as never, storey); return id; };

    // The structural slab goes 200 past the hall on the walled sides, so the walls stand on it. The access
    // floor is 600 above it, in four fields: one at each end of the rows and one under each pair of rows.
    // The perforated tiles of the cold aisles fill the space between them.
    placed(unwrap(model.addSlab({ length: HALL_X + 200, width: HALL_Y + 200, thickness: 250, origin: [-200, 0, -250], axisX: X, axisZ: Z, predefinedType: 'BASESLAB', materialName: 'Concrete' })));
    const COLD = [0, 4, 8];
    const field = (x0: number, y0: number, x1: number, y1: number) =>
      placed(unwrap(model.addSlab({ length: x1 - x0, width: y1 - y0, thickness: 35, origin: [x0, y0, RF - 35], axisX: X, axisZ: Z, predefinedType: 'FLOOR', materialName: 'Raised access floor' })));
    field(0, 0, END, HALL_Y);
    field(END, bandY(1), END + ROW_LEN, bandY(4));
    field(END, bandY(5), END + ROW_LEN, bandY(8));
    const lifted = field(END + ROW_LEN, 0, HALL_X, HALL_Y);
    // Two of the four hall walls. The thickness of a wall is on the left of its direction (+Y for the north
    // wall, -X for the west wall), so the two walls are outside the tile field.
    const north = placed(unwrap(model.addWall({ length: HALL_X, height: WALL_H, thickness: 200, origin: [0, HALL_Y, 0], axisX: X, axisZ: Z, materialName: 'Concrete' })));
    placed(unwrap(model.addWall({ length: HALL_Y + 200, height: WALL_H, thickness: 200, origin: [0, 0, 0], axisX: Y, axisZ: Z, materialName: 'Concrete' })));

    const addEquip = (name: string, solid: Body, material: string, psets: Record<string, Record<string, string | number | boolean>>) =>
      placed(unwrap(model.addProxy({ name, solid, materialName: material, customProperties: psets })));

    // Racks: row letter + position, with two cords to the A and B feeds of the row. The pset records the
    // IFC class that a native writer would use for each element.
    const racks = seq(ROWS).flatMap((r) => seq(perRow).map((j) => {
      const tag = 'ABCD'[r] + String(j + 1).padStart(2, '0');
      const id = addEquip('Rack ' + tag, box(RACK.w, RACK.d, RACK.h, { at: [rackX(j), rowBand(r) + BAND / 2, RF + RACK.h / 2] }), 'Steel, powder coated',
        { DC_Rack: { tag, ifcClass: 'IfcFurniture/TECHNICALCABINET', uHeight: RACK.u, designLoadKW: rackKW, feedA: 'RPP-0' + (r + 1) + 'A', feedB: 'RPP-0' + (r + 1) + 'B' } });
      return { tag, id };
    }));

    // Each cold aisle gets a fully perforated floor: at 8 kW for each rack, one tile for each rack is not
    // enough (a 25%-open tile carries 400 to 600 CFM, about 3 kW). The tiles fill the openings of the floor.
    const tileIds = COLD.flatMap((band) => seq(2 * (perRow + 2)).map((p) => placed(unwrap(model.addCovering({
      length: TILE, width: TILE, thickness: 35, origin: [END + TILE * (p % (perRow + 2)), bandY(band) + TILE * Math.floor(p / (perRow + 2)), RF - 35],
      axisX: X, axisZ: Z, predefinedType: 'FLOORING', materialName: 'Perforated tile, 25% open',
    })))));

    // Remote power panels close each row: one floor tile of footprint (ASHRAE TC9.9), A feed at the east
    // end and B at the west, so one feed carries the row when the other is down.
    const rpps = seq(ROWS).flatMap((r) => ([['B', END], ['A', END + ROW_LEN - TILE]] as const).map(([feed, x0]) => {
      const tag = 'RPP-0' + (r + 1) + feed, cy = rowBand(r) + (facesUp(r) ? BAND - TILE / 2 : TILE / 2);
      const id = addEquip(tag, box(TILE, TILE, 2000, { at: [x0 + TILE / 2, cy, RF + 1000] }), 'Steel, light grey',
        { DC_RPP: { tag, ifcClass: 'IfcElectricDistributionBoard', ratedKVA: RPP_KVA, feed, sourceUPS: 'UPS-' + feed } });
      return { tag, feed, id, x: x0 + TILE / 2, y: cy, front: facesUp(r) ? 1 : -1 };
    }));

    // Perimeter CRAHs at the two ends of the rows, with their discharge into the floor plenum.
    // N+1: five 74.6 kW units carry the 320 kW load, and the sixth is spare.
    const crahs = [CRAH.d / 2 + 50, HALL_X - CRAH.d / 2 - 50].flatMap((cx, side) => [bandY(2), bandY(4), bandY(6)].map((y0, k) => {
      const tag = 'CRAH-0' + (side * 3 + k + 1);
      const id = addEquip(tag, box(CRAH.d, CRAH.w, CRAH.h, { at: [cx, y0 + BAND / 2, RF + CRAH.h / 2] }), 'Galvanized steel',
        { DC_CRAH: { tag, ifcClass: 'IfcUnitaryEquipment/AIRHANDLER', sensibleCoolingKW: CRAH.kW, airflowM3h: CRAH.airM3h, coil: 'Chilled water' } });
      return { tag, id, x: cx, y: y0 + BAND / 2, east: side === 1 };
    }));

    // Overhead, above the clear height: a cable tray over each row, then the A and B busway runs.
    const trayIds = seq(ROWS).map((r) => {
      // The tray is a channel of 3 mm sheet: its section, pushed along the row.
      const y = rowBand(r) + BAND / 2, w = TRAY.width / 2, z = TRAY.z, t = 3;
      const section = own(unwrap(polygon([[END, y - w, z], [END, y + w, z], [END, y + w, z + TRAY.depth], [END, y + w - t, z + TRAY.depth], [END, y + w - t, z + t], [END, y - w + t, z + t], [END, y - w + t, z + TRAY.depth], [END, y - w, z + TRAY.depth]])));
      const channel = unwrap(validSolid(unwrap(extrude(section, [ROW_LEN, 0, 0]))));
      return addEquip('CT-' + 'ABCD'[r] + '-01', channel, 'Galvanized steel',
        { DC_Tray: { tag: 'CT-' + 'ABCD'[r] + '-01', ifcClass: 'IfcCableCarrierSegment/CABLETRAYSEGMENT', widthMm: TRAY.width, service: 'Structured cabling' } });
    });
    const buses = seq(ROWS).flatMap((r) => ([['A', BUSWAY.off], ['B', -BUSWAY.off]] as const).map(([feed, off]) => {
      const tag = 'BB-' + 'ABCD'[r] + '-' + feed, y = rowBand(r) + BAND / 2 + off;
      const id = addEquip(tag, box(ROW_LEN, BUSWAY.width, BUSWAY.depth, { at: [rowMidX, y, BUSWAY.z + BUSWAY.depth / 2] }), 'Aluminium busway',
        { DC_Busway: { tag, ifcClass: 'IfcCableSegment/BUSBARSEGMENT', ratedA: BUS.amps, voltageV: BUS.volts, feed } });
      return { tag, feed, id, r, y };
    }));

    // Hot-aisle containment: roof panels at the height of the rack tops, and a door at each end of the
    // aisle. The cold aisles stay open: the room is the cold plenum.
    const hacIds = [bandY(2), bandY(6)].flatMap((y0, k) => {
      const tag = 'HAC-' + (k + 1);
      const roof = addEquip(tag + ' roof', box(ROW_LEN, AISLE, 40, { at: [rowMidX, y0 + AISLE / 2, RF + RACK.h + 20] }), 'Polycarbonate panel',
        { DC_Containment: { tag, ifcClass: 'IfcPlate', scheme: 'Hot aisle' } });
      const doors = [20, ROW_LEN - 20].map((dx) => addEquip(tag + ' door', box(40, AISLE, RACK.h, { at: [END + dx, y0 + AISLE / 2, RF + RACK.h / 2] }), 'Polycarbonate panel',
        { DC_Containment: { tag, ifcClass: 'IfcDoor', scheme: 'Hot aisle', part: 'End door' } }));
      return [roof, ...doors];
    });

    // The aisles are IfcSpaces (not in the view), with the names of the rows on each side. Zones group the
    // spaces, and systems group the equipment that gives one service.
    const aisleSpace = (name: string, longName: string, y0: number, h: number) =>
      placed(unwrap(model.addSpace({ name, longName, length: ROW_LEN, width: AISLE, height: h, origin: [END, y0, RF], axisX: X, axisZ: Z, materialName: 'Air' })));
    const coldSpaces = [aisleSpace('CA-A', 'Cold aisle, row A front', bandY(0), WALL_H - RF), aisleSpace('CA-BC', 'Cold aisle between rows B and C', bandY(4), WALL_H - RF), aisleSpace('CA-D', 'Cold aisle, row D front', bandY(8), WALL_H - RF)];
    const hotSpaces = [aisleSpace('HA-AB', 'Contained hot aisle between rows A and B', bandY(2), RACK.h), aisleSpace('HA-CD', 'Contained hot aisle between rows C and D', bandY(6), RACK.h)];
    model.assignToGroup(unwrap(model.addZone({ name: 'Cold Aisles', longName: 'Supply air zone' })), coldSpaces);
    model.assignToGroup(unwrap(model.addZone({ name: 'Hot Aisles', longName: 'Return air zone' })), hotSpaces);
    const feedIds = (feed: string) => [...rpps, ...buses].filter((e) => e.feed === feed).map((e) => e.id);
    model.assignToGroup(unwrap(model.addSystem({ name: 'Critical Power A' })), feedIds('A'));
    model.assignToGroup(unwrap(model.addSystem({ name: 'Critical Power B' })), feedIds('B'));
    model.assignToGroup(unwrap(model.addSystem({ name: 'Air Cooling' })), [...crahs.map((c) => c.id), ...tileIds, ...hacIds]);
    model.assignToGroup(unwrap(model.addSystem({ name: 'Structured Cabling' })), trayIds);
    model.assignToGroup(unwrap(model.addSystem({ name: 'IT Equipment' })), racks.map((r) => r.id));

    // ---- the checks of a design review, from the model.
    const itKW = racks.length * rackKW, firmKW = (crahs.length - 1) * CRAH.kW;
    const reqAirM3h = (itKW * 3600) / (1.2 * 1.005 * DT); // Q = P / (rho cp dT)
    const firmAirM3h = (crahs.length - 1) * CRAH.airM3h, perTileM3h = reqAirM3h / tileIds.length;
    const rowAmps = (perRow * rackKW * 1000) / 0.9 / (BUS.volts * Math.sqrt(3)), busContA = BUS.continuous * BUS.amps;
    const verdict = (okQ: boolean): string => (okQ ? ': ok' : ': SHORT');
    console.log('IT load   ' + racks.length + ' racks x ' + rackKW + ' kW = ' + itKW + ' kW');
    console.log('cooling   N+1: ' + (crahs.length - 1) + ' of ' + crahs.length + ' CRAH x ' + CRAH.kW + ' kW = ' + Math.round(firmKW) + ' kW vs ' + itKW + ' kW' + verdict(firmKW >= itKW));
    console.log('airflow   N+1 ' + Math.round(firmAirM3h) + ' m3/h vs ' + Math.round(reqAirM3h) + ' m3/h at dT ' + DT + ' K' + verdict(firmAirM3h >= reqAirM3h));
    console.log('tiles     ' + tileIds.length + ' perforated, ' + Math.round(perTileM3h) + ' m3/h each vs ' + TILE_BAND[0] + '-' + TILE_BAND[1] + ' (400-600 CFM) band' + verdict(perTileM3h >= TILE_BAND[0]! && perTileM3h <= TILE_BAND[1]!));
    console.log('power     row ' + Math.round(rowAmps) + ' A at 0.9 pf vs ' + busContA + ' A continuous on each ' + BUS.amps + ' A feed' + verdict(rowAmps <= busContA));
    const exported = unwrap(await toIfcValidated(model, { applicationName: 'brepjs playground', applicationVersion: '1.0' }));
    const sev = countBySeverity(exported.report);
    console.log('IFC4      ' + sev.error + ' errors, ' + sev.warning + ' warnings, ' + sev.info + ' info');

    // The equipment schedule that the FM team gets on handover.
    const schedule = [['Tag', 'Type', 'Rating', 'Feed'].join(',')];
    for (const r of racks) schedule.push(r.tag + ',Rack 42U,' + rackKW + ' kW,A+B');
    for (const p of rpps) schedule.push(p.tag + ',Remote power panel,' + RPP_KVA + ' kVA,' + p.feed);
    for (const c of crahs) schedule.push(c.tag + ',CRAH,' + CRAH.kW + ' kW sensible,N+1');
    for (const b of buses) schedule.push(b.tag + ',Track busway,' + BUS.amps + ' A ' + BUS.volts + ' V,' + b.feed);

    // ---- the view: each element by its material, and the busway by its feed.
    const PALETTE: Record<string, string> = {
      Concrete: '#a8a294', 'Raised access floor': '#e3dfd3', 'Perforated tile, 25% open': '#5d7396', 'Steel, powder coated': '#3b414a',
      'Steel, light grey': '#9aa3ab', 'Galvanized steel': '#c3c9d1', 'Polycarbonate panel': '#e2a23a',
    };
    const FEED: Record<string, string> = { A: '#c9473d', B: '#3c66b5' };
    const busFeed = new Map(buses.map((b) => [b.id, b.feed]));
    const tones: Tones = {};
    const add = (tint: string, ...list: Body[]): void => { (tones[tint] ??= []).push(...list); };
    for (const el of model.getAllElements()) {
      if (el.category === 'SPACE' || (cutaway && (el.localId === north || el.localId === lifted))) continue; // the aisle volumes would hide the hall
      const feed = busFeed.get(el.localId), material = (el.spec as { materialName?: string }).materialName ?? '';
      for (const s of unwrap(placedSolids(el))) add(feed ? FEED[feed]! : (PALETTE[material] ?? '#8b8b8b'), own(s));
    }

    // ---- display only: the detail that the view needs and the model does not. The model stays one element
    // for each asset. A part is made one time, and then moved to each place.
    const b = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Body => own(box(x1 - x0, y1 - y0, z1 - z0, { at: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] }));
    const at = (part: Body[], v: P3): Body[] => part.map((s) => own(translate(s, v)));
    // A rack front: a door frame, seven blocks of 6U behind it with a status light on each, and two brush strips on the top.
    const front = (f: number) => {
      const y = (a: number, c: number): [number, number] => (f > 0 ? [a, c] : [-c, -a]); // from the front face outward
      const [f0, f1] = y(0, 30), [u0, u1] = y(0, 14), [l0, l1] = y(14, 18), h = RACK.h;
      const frame = [b(-300, f0, 30, -275, f1, h - 30), b(275, f0, 30, 300, f1, h - 30), b(-275, f0, 30, 275, f1, 55), b(-275, f0, h - 55, 275, f1, h - 30)];
      const units = seq(7).map((i) => b(-270, u0, 62 + i * 267, 270, u1, 62 + i * 267 + 257));
      const lights = seq(7).map((i) => b(-240, l0, 160 + i * 267, -60, l1, 215 + i * 267));
      const y0 = f > 0 ? -RACK.d : 0;
      return { frame, light: units.filter((_, i) => i % 2 === 0), dark: units.filter((_, i) => i % 2 === 1), lights, top: [b(-200, y0 + 150, h, 200, y0 + 210, h + 6), b(-200, y0 + 990, h, 200, y0 + 1050, h + 6)] };
    };
    const fronts = { [-1]: front(-1), [1]: front(1) };
    for (const r of seq(ROWS)) for (const j of seq(perRow)) {
      const f = facesUp(r) ? 1 : -1, part = fronts[f as 1 | -1], v: P3 = [rackX(j), rowBand(r) + BAND / 2 + (f * RACK.d) / 2, RF];
      add('#c3c9d1', ...at(part.frame, v)); add('#8a93a0', ...at(part.light, v)); add('#59616d', ...at(part.dark, v)); add('#12b5b0', ...at(part.lights, v)); add('#15181c', ...at(part.top, v));
    }
    // A tap-off box under each busway run at each third rack, with its cable down to the rack top.
    const drop = BUSWAY.z - 110 - RF - RACK.h, tapOff = [b(-110, -80, BUSWAY.z - 110, 110, 80, BUSWAY.z), own(cylinder(18, drop, { at: [0, 0, RF + RACK.h] }))];
    // A goalpost of strut on the rack tops carries the tray and the two busway runs.
    const post = [b(-20, -580, RF + RACK.h, 20, -540, BUSWAY.z), b(-20, 540, RF + RACK.h, 20, 580, BUSWAY.z), b(-20, -540, BUSWAY.z - 41, 20, 540, BUSWAY.z), b(-20, -540, TRAY.z - 41, 20, 540, TRAY.z)];
    for (const bus of buses) for (let j = 0; j < perRow; j += 3) add(FEED[bus.feed]!, ...at(tapOff, [rackX(j), bus.y, 0]));
    const CABLE = ['#19b6c9', '#ff5a1f', '#e8c63c', '#3c66b5']; // fibre jackets: aqua, orange and yellow. Blue copper
    for (const r of seq(ROWS)) {
      const cy = rowBand(r) + BAND / 2;
      for (let j = 1; j < perRow; j += 2) add('#8b9199', ...at(post, [rackX(j) - TILE / 2, cy, 0]));
      CABLE.forEach((tint, i) => add(tint, own(cylinder(34, ROW_LEN - 100, { at: [END + 50, cy - 150 + i * 100, TRAY.z + 3 + 34], axis: X }))));
    }
    // The containment: a rib on the roof at each rack, and two leaves with a window on each end door.
    for (const y0 of [bandY(2), bandY(6)]) {
      const top = RF + RACK.h + 40;
      for (let x = END; x <= END + ROW_LEN; x += TILE) add('#454c56', b(Math.max(x - 20, END), y0, top, Math.min(x + 20, END + ROW_LEN), y0 + AISLE, top + 12));
      for (const [x, s] of [[END, -1], [END + ROW_LEN, 1]] as const) {
        const x0 = Math.min(x, x + s * 6), x1 = Math.max(x, x + s * 6), mid = y0 + AISLE / 2;
        add('#454c56', b(x0, mid - 10, RF, x1, mid + 10, RF + RACK.h), b(x0, mid - 90, RF + 950, x1, mid - 60, RF + 1150), b(x0, mid + 60, RF + 950, x1, mid + 90, RF + 1150));
        add('#cfe3ea', b(x0, y0 + 120, RF + 1000, x1, mid - 140, RF + 1750), b(x0, mid + 140, RF + 1000, x1, y0 + AISLE - 120, RF + 1750));
      }
    }
    // Each CRAH: a return grille on its top, three panels on each long side, and a display. Each RPP: a door and a label.
    for (const c of crahs) {
      const x0 = c.x - CRAH.d / 2, x1 = c.x + CRAH.d / 2, y0 = c.y - CRAH.w / 2, z1 = RF + CRAH.h, third = CRAH.w / 3, room = c.east ? -1 : 1;
      add('#2f343b', b(x0 + 80, y0 + 80, z1, x1 - 80, y0 + CRAH.w - 80, z1 + 8));
      for (const s of [-1, 1]) for (const k of seq(3)) {
        const p0 = s > 0 ? x1 : x0 - 8, q0 = y0 + k * third + 20;
        add('#e3e6ea', b(p0, q0, RF + 100, p0 + 8, q0 + third - 40, z1 - 100));
        add('#2f343b', b(s > 0 ? p0 + 8 : p0 - 10, q0 + third - 110, RF + 900, s > 0 ? p0 + 18 : p0, q0 + third - 80, RF + 1100));
        if (k === 1 && s === room) add('#12b5b0', b(s > 0 ? p0 + 8 : p0 - 4, q0 + 150, RF + 1450, s > 0 ? p0 + 12 : p0, q0 + 450, RF + 1650));
      }
    }
    for (const p of rpps) {
      const y0 = p.front > 0 ? p.y + TILE / 2 : p.y - TILE / 2 - 10;
      add('#e3e6ea', b(p.x - 260, y0, RF + 80, p.x + 260, y0 + 10, RF + 1920));
      add(FEED[p.feed]!, b(p.x - 150, p.front > 0 ? y0 + 10 : y0 - 4, RF + 1600, p.x + 150, p.front > 0 ? y0 + 14 : y0, RF + 1700));
    }
    if (cutaway) {
      // Where the floor is lifted: the pedestals, a stand under each CRAH, and the chilled water mains with a riser to each unit.
      const pedestal = [own(cylinder(16, RF - 35 - 16, { at: [0, 0, 8] })), b(-55, -55, 0, 55, 55, 8), b(-45, -45, RF - 43, 45, 45, RF - 35)];
      const under = (x: number, y: number): boolean => crahs.some((c) => c.east && Math.abs(x - c.x) < CRAH.d / 2 + 60 && Math.abs(y - c.y) < CRAH.w / 2 + 60);
      for (const x of [HALL_X - END - 60, HALL_X - 2 * TILE, HALL_X - TILE, HALL_X - 60]) for (let y = 60; y < HALL_Y; y += (HALL_Y - 120) / 18)
        if (!under(x, y)) add('#c3c9d1', ...at(pedestal, [x, y, 0]));
      for (const y of [60, HALL_Y - 60]) for (let x = 60; x < HALL_X - END - 300; x += TILE) add('#c3c9d1', ...at(pedestal, [x, y, 0]));
      const mains = [HALL_X - 400, HALL_X - 230], first = crahs.find((c) => c.east)!.y - 300, last = HALL_Y - 100;
      mains.forEach((x, i) => add(i === 0 ? '#12b5b0' : '#ff5a1f', own(cylinder(55, last - first, { at: [x, first, 120], axis: Y }))));
      for (const c of crahs.filter((u) => u.east)) {
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) add('#8b9199', b(c.x + sx * (CRAH.d / 2 - 60) - 30, c.y + sy * (CRAH.w / 2 - 60) - 30, 0, c.x + sx * (CRAH.d / 2 - 60) + 30, c.y + sy * (CRAH.w / 2 - 60) + 30, RF));
        mains.forEach((x, i) => add(i === 0 ? '#12b5b0' : '#ff5a1f', own(cylinder(40, RF - 175, { at: [x, c.y - 200 + i * 400, 175] }))));
      }
    }
    const shown = Object.entries(tones).map(([tint, list]) => color(compound(list), tint));
    return { model, shown, bytes: exported.bytes, schedule };
  } catch (error) {
    model[Symbol.dispose]();
    throw error;
  } finally {
    owned.splice(0).forEach((s) => s.delete());
  }
}

// Show 4 rows of 10 racks at 8 kW. Try hall({ perRow: 12 }), hall({ rackKW: 10 }), or hall({ cutaway: false }).
const dc = await hall();
export default present(dc.shown, {
  bimTree: dc.model.toTreeSummary(),
  ifc: () => dc.bytes,
  files: () => [{ name: 'equipment-schedule.csv', data: dc.schedule.join(String.fromCharCode(10)), mime: 'text/csv' }],
});`,
  },
];
