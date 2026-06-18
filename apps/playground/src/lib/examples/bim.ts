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
    label: 'Steel I-Beam',
    description:
      'A parametric structural-steel wide-flange (I-beam) authored through a BimModel, complete with the rolled root fillets where the web meets the flanges. The element carries a brepjs solid for display and the model serializes to IFC.',
    code: `import { BimModel } from 'brepjs-bim';
import { present } from 'brepjs/playground';

// A parametric structural-steel I-beam authored through the BIM model (it also
// serializes to IFC via toIfc(model)). filletRadius adds the rolled root fillets
// real wide-flange sections carry where the web meets the flanges. Placed in a
// project → site → building → storey so the BIM panel shows a real model tree.
const model = new BimModel();
model.init({ name: 'Beam example' });

// Spatial structure — what makes this a BIM model, not just geometry.
const project = model.getProject();
const siteId = model.addSite({ name: 'Site' });
const buildingId = model.addBuilding({ name: 'Building' });
const storeyId = model.addStorey({ name: 'Level 1', elevation: 0 });
if (project) model.aggregate(project.localId, siteId);
model.aggregate(siteId, buildingId);
model.aggregate(buildingId, storeyId);

const beam = model.addBeam({
  length: 1500,
  profile: {
    kind: 'I_BEAM',
    overallWidth: 150,
    overallDepth: 300,
    flangeThickness: 12,
    webThickness: 8,
    filletRadius: 14,
  },
  origin: [0, 0, 0],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  materialName: 'Steel',
});
if (!beam.ok) throw beam.error;
model.placeIn(beam.value, storeyId);

// Show the beam solid and the live IFC model tree in the BIM panel.
export default present(model.getBeams()[0].geometry, {
  bimTree: model.toTreeSummary(),
});
`,
  },
  {
    id: 'bim-wall-openings',
    label: 'Wall with Openings',
    description:
      'A parametric wall hosting a door and a window, placed in a project → site → building → storey spatial structure. The BIM panel shows the live IFC model tree.',
    code: `import { BimModel, toIfc } from 'brepjs-bim';
import { present } from 'brepjs/playground';

// A parametric wall hosting a door and a window, organised into a real IFC
// spatial structure (project → site → building → storey). Each opening is a void
// boolean-cut into the wall solid. The BIM panel (top-right) shows the model
// tree; the IFC button exports the model as a real IFC-SPF file.
const model = new BimModel();
model.init({ name: 'Wall example' });

// Spatial structure — what makes this a BIM model, not just geometry.
const project = model.getProject();
const siteId = model.addSite({ name: 'Site' });
const buildingId = model.addBuilding({ name: 'Building' });
const storeyId = model.addStorey({ name: 'Ground Floor', elevation: 0 });
if (project) model.aggregate(project.localId, siteId);
model.aggregate(siteId, buildingId);
model.aggregate(buildingId, storeyId);

const wall = model.addWall({
  length: 3000,
  height: 2400,
  thickness: 200,
  origin: [0, 0, 0],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  materialName: 'Concrete',
});
if (!wall.ok) throw wall.error;
model.placeIn(wall.value, storeyId);

const door = model.addDoor({
  wallLocalId: wall.value,
  width: 900,
  height: 2000,
  offsetAlongWall: 400,
  offsetFromFloor: 0,
  materialName: 'Timber',
});
if (!door.ok) throw door.error;
model.placeIn(door.value, storeyId);

const win = model.addWindow({
  wallLocalId: wall.value,
  width: 1200,
  height: 1000,
  offsetAlongWall: 1600,
  offsetFromFloor: 900,
  materialName: 'Aluminium',
});
if (!win.ok) throw win.error;
model.placeIn(win.value, storeyId);

// Show the wall solid (with its openings), the IFC tree for the panel, and an
// IFC export. The ifc thunk runs only when you click the IFC button — serializing
// IFC re-initializes web-ifc, so it's deferred from every render.
export default present(model.getWalls()[0].geometry, {
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
    id: 'bim-curtain-wall',
    label: 'Curtain Wall',
    description:
      'A parametric curtain-wall facade — a grid of glazing panels framed by vertical and horizontal mullions, each placed from its IFC local origin.',
    code: `import { BimModel } from 'brepjs-bim';
import { present } from 'brepjs/playground';
import { translate } from 'brepjs/quick';

// A parametric curtain wall: a columns x rows grid of glazing panels framed by
// mullions. The model returns each panel and mullion as a local-origin solid
// plus its placement origin; we translate each into place and show them all.
// Placed in a project → site → building → storey so the BIM panel shows a tree.
const model = new BimModel();
model.init({ name: 'Curtain wall' });

// Spatial structure — what makes this a BIM model, not just geometry.
const project = model.getProject();
const siteId = model.addSite({ name: 'Site' });
const buildingId = model.addBuilding({ name: 'Building' });
const storeyId = model.addStorey({ name: 'Level 1', elevation: 0 });
if (project) model.aggregate(project.localId, siteId);
model.aggregate(siteId, buildingId);
model.aggregate(buildingId, storeyId);

const cw = model.addCurtainWall({
  width: 2700,
  height: 2000,
  columns: 3,
  rows: 2,
  panelThickness: 24,
  mullionWidth: 50,
  mullionDepth: 120,
  origin: [0, 0, 0],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  materialName: 'Aluminium',
});
if (!cw.ok) throw cw.error;
model.placeIn(cw.value, storeyId);

const grid = model.getCurtainWalls()[0].geometry;
const parts = [...grid.panels, ...grid.mullions].map((c) => translate(c.solid, c.origin));

// Show every panel + mullion solid and the live IFC model tree in the BIM panel.
export default present(parts, {
  bimTree: model.toTreeSummary(),
});
`,
  },
  {
    id: 'bim-steel-frame',
    label: 'Steel Frame',
    description:
      'A connected two-bay structural steel frame: I-section columns on a 3×2 grid, a beam grid tying their heads together, and a concrete floor deck seated on the beams — all grouped as an IfcElementAssembly. Members deliberately overlap at the joints so the structure reads as one piece. Each element is read back already placed via placedSolids().',
    code: `import { BimModel, placedSolids, toIfc } from 'brepjs-bim';
import { unwrap } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';

// A two-bay steel frame: 3x2 columns, a beam grid over their heads, a floor deck.
const model = new BimModel();
model.init({ name: 'Steel frame' });
const site = model.addSite({ name: 'Site' });
const building = model.addBuilding({ name: 'Building' });
const storey = model.addStorey({ name: 'Level 1', elevation: 0 });
const project = model.getProject();
if (project) model.aggregate(project.localId, site);
model.aggregate(site, building);
model.aggregate(building, storey);

const COLS = [0, 3500, 7000];   // column lines along X (two bays)
const ROWS = [0, 3000];          // column lines along Y
const SPAN_X = 7000, SPAN_Y = 3000, COL_H = 3200;
const I = { kind: 'I_BEAM', overallWidth: 150, overallDepth: 200, flangeThickness: 12, webThickness: 8 } as const;

for (const x of COLS) for (const y of ROWS) {
  const col = model.addColumn({ height: COL_H, profile: I, origin: [x, y, 0], axisX: [1, 0, 0], axisZ: [0, 0, 1], materialName: 'Steel' });
  if (!col.ok) throw col.error;
  model.placeIn(col.value, storey);
}
// Beams are centred on z=COL_H, so the I-section (+/-100 deep) straddles the column
// heads — the joints overlap rather than just touch.
for (const y of ROWS) {
  const b = model.addBeam({ length: SPAN_X, profile: I, origin: [0, y, COL_H], axisX: [1, 0, 0], axisZ: [0, 0, 1], materialName: 'Steel' });
  if (!b.ok) throw b.error;
  model.placeIn(b.value, storey);
}
for (const x of COLS) {
  const b = model.addBeam({ length: SPAN_Y, profile: I, origin: [x, 0, COL_H], axisX: [0, 1, 0], axisZ: [0, 0, 1], materialName: 'Steel' });
  if (!b.ok) throw b.error;
  model.placeIn(b.value, storey);
}
// Deck seated on the beams: beam tops are at COL_H+100, so a deck bottom at COL_H+70
// overlaps them by 30mm — no floating gap.
const deck = model.addSlab({ length: SPAN_X, width: SPAN_Y, thickness: 150, origin: [0, 0, COL_H + 70], axisX: [1, 0, 0], axisZ: [0, 0, 1], predefinedType: 'FLOOR', materialName: 'Concrete' });
if (!deck.ok) throw deck.error;
model.placeIn(deck.value, storey);

const assembly = model.addElementAssembly({ name: 'Frame' });
for (const e of [...model.getColumns(), ...model.getBeams(), ...model.getSlabs()]) model.aggregate(assembly, e.localId);

// Playground runtime owns the displayed geometry for this eval; snippets don't dispose it.
const steel = [...model.getColumns(), ...model.getBeams()].flatMap((e) => unwrap(placedSolids(e))).map((s) => color(s, '#8a99ad'));
const deckSolids = unwrap(placedSolids(model.getSlabs()[0])).map((s) => color(s, '#cfcabb'));

export default present([...steel, ...deckSolids], {
  bimTree: model.toTreeSummary(),
  ifc: async () => {
    const r = await toIfc(model, { applicationName: 'brepjs playground', applicationVersion: '1.0' });
    if (!r.ok) throw r.error;
    return r.value;
  },
});
`,
  },
  {
    id: 'bim-building-shell',
    label: 'Building Shell',
    description:
      'A single-room building shell: a foundation plinth, four walls meeting cleanly at the corners, a door and two windows, a gable roof seated on the wall heads, and an IfcSpace for the room — organised in a full project → site → building → storey tree. Material-tinted; the IFC button exports a valid file.',
    code: `import { BimModel, placedSolids, toIfc } from 'brepjs-bim';
import { unwrap } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';

// A single-room shell on a foundation plinth: four walls that meet cleanly at the
// corners, a door + two windows, a gable roof seated on the wall heads, + an IfcSpace.
const model = new BimModel();
model.init({ name: 'Building shell' });
const site = model.addSite({ name: 'Site' });
const building = model.addBuilding({ name: 'Building' });
const storey = model.addStorey({ name: 'Ground Floor', elevation: 0 });
const project = model.getProject();
if (project) model.aggregate(project.localId, site);
model.aggregate(site, building);
model.aggregate(building, storey);

const L = 5000, W = 4000, H = 2700, T = 200;

// Foundation plinth: 100mm proud of the footprint, top flush with the floor (z=0).
const plinth = model.addSlab({ length: L + 200, width: W + 200, thickness: 300, origin: [-100, -100, -300], axisX: [1, 0, 0], axisZ: [0, 0, 1], predefinedType: 'BASESLAB', materialName: 'Concrete' });
if (!plinth.ok) throw plinth.error;
model.placeIn(plinth.value, storey);

// Walls extrude thickness on one side of their origin line. Front/back run the full
// length (y in [0,T] and [W-T,W]); left/right fit BETWEEN them (length W-2T) so the
// corners meet without doubling up.
const wallDefs: { origin: [number, number, number]; axisX: [number, number, number]; len: number }[] = [
  { origin: [0, 0, 0], axisX: [1, 0, 0], len: L },
  { origin: [0, W - T, 0], axisX: [1, 0, 0], len: L },
  { origin: [T, T, 0], axisX: [0, 1, 0], len: W - 2 * T },
  { origin: [L, T, 0], axisX: [0, 1, 0], len: W - 2 * T },
];
const wallIds = [];
for (const d of wallDefs) {
  const wall = model.addWall({ length: d.len, height: H, thickness: T, origin: d.origin, axisX: d.axisX, axisZ: [0, 0, 1], materialName: 'Concrete' });
  if (!wall.ok) throw wall.error;
  model.placeIn(wall.value, storey);
  wallIds.push(wall.value);
}
const door = model.addDoor({ wallLocalId: wallIds[0], width: 1000, height: 2100, offsetAlongWall: 700, offsetFromFloor: 0, materialName: 'Timber' });
if (!door.ok) throw door.error;
model.placeIn(door.value, storey);
const win1 = model.addWindow({ wallLocalId: wallIds[0], width: 1400, height: 1100, offsetAlongWall: 3000, offsetFromFloor: 1000, materialName: 'Aluminium' });
if (!win1.ok) throw win1.error;
model.placeIn(win1.value, storey);
const win2 = model.addWindow({ wallLocalId: wallIds[1], width: 1400, height: 1100, offsetAlongWall: 1800, offsetFromFloor: 1000, materialName: 'Aluminium' });
if (!win2.ok) throw win2.error;
model.placeIn(win2.value, storey);

// Gable roof seated on the wall heads (roof base at z=H).
const roof = model.addRoof({ length: L, width: W, thickness: 150, origin: [0, 0, H], axisX: [1, 0, 0], axisZ: [0, 0, 1], predefinedType: 'GABLE_ROOF', pitch: 32, materialName: 'Tile' });
if (!roof.ok) throw roof.error;
model.placeIn(roof.value, storey);

// The room volume itself — a first-class IfcSpace, kept in the model + IFC tree.
const space = model.addSpace({ name: 'Room', length: L - 2 * T, width: W - 2 * T, height: H, origin: [T, T, 0], axisX: [1, 0, 0], axisZ: [0, 0, 1], materialName: 'Air' });
if (!space.ok) throw space.error;
model.placeIn(space.value, storey);

// Playground runtime owns the displayed geometry for this eval; snippets don't dispose it.
const walls = model.getWalls().flatMap((e) => unwrap(placedSolids(e))).map((s) => color(s, '#d9d3c7'));
const base = unwrap(placedSolids(model.getSlabs()[0])).map((s) => color(s, '#9a948a'));
const tile = unwrap(placedSolids(model.getRoofs()[0])).map((s) => color(s, '#9c6b52'));

export default present([...walls, ...base, ...tile], {
  bimTree: model.toTreeSummary(),
  ifc: async () => {
    const r = await toIfc(model, { applicationName: 'brepjs playground', applicationVersion: '1.0' });
    if (!r.ok) throw r.error;
    return r.value;
  },
});
`,
  },
  {
    id: 'bim-switchback-stair',
    label: 'Switchback Stair',
    description:
      'A half-turn (switchback) stair: two straight flights running opposite ways in parallel lanes, a half-landing at the 180° turn and a top arrival landing, plus a posted guardrail. The stair is an IFC assembly with no solid of its own — its flights are read back as placed solids via placedSolids().',
    code: `import { BimModel, placedSolids, toIfc } from 'brepjs-bim';
import { unwrap } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';

// A half-turn (switchback) stair. Two straight flights run in opposite directions
// in parallel lanes separated by an open well; flight 1 climbs from the ground to a
// half-landing, you turn 180 degrees, and flight 2 climbs the other way to a top
// landing. Each flight is a real stepped solid read back via placedSolids().
const model = new BimModel();
model.init({ name: 'Stair core' });
const site = model.addSite({ name: 'Site' });
const building = model.addBuilding({ name: 'Building' });
const storey = model.addStorey({ name: 'Ground Floor', elevation: 0 });
const project = model.getProject();
if (project) model.aggregate(project.localId, site);
model.aggregate(site, building);
model.aggregate(building, storey);

const RISERS = 9, RH = 175, TL = 260, W = 1100, LT = 200;
const run = RISERS * TL, rise = RISERS * RH;   // 2340 long, 1575 tall per flight
const GAP = 300;                                 // open well between the two lanes
const SPANY = 2 * W + GAP;                       // far edge of the upper lane (2500)
const LANE2 = W + GAP;                           // near edge of the upper lane (1400)
const LD = 1100;                                 // half-landing depth (along X)

// A flight's local solid climbs +X/+Z with its width on +Y; placement maps that frame.
const flight = { width: W, riserHeight: RH, treadLength: TL, numberOfRisers: RISERS, axisZ: [0, 0, 1] as [number, number, number], materialName: 'Concrete' };
const stair = model.addStair({
  name: 'Stair',
  predefinedType: 'HALF_TURN_STAIR',
  flights: [
    // Flight 1: foot at origin, climbing +X in the lower lane y in [0, W], z 0 -> rise.
    { ...flight, origin: [0, 0, 0], axisX: [1, 0, 0] },
    // Flight 2: foot at the turn (x = run), climbing back -X one level up. The -X axis
    // flips its width onto -Y, so it sits in the upper lane y in [LANE2, SPANY],
    // separated from flight 1 by the open well. z rise -> 2*rise.
    { ...flight, origin: [run, SPANY, rise], axisX: [-1, 0, 0] },
  ],
  materialName: 'Concrete',
});
if (!stair.ok) throw stair.error;
model.placeIn(stair.value, storey);

// Half-landing at the turn: spans both lanes + the well at the east end, top flush
// with the flight-1 head (z = rise); both flights seat on it.
const landing = model.addSlab({ length: LD, width: SPANY, thickness: LT, origin: [run - 100, 0, rise - LT], axisX: [1, 0, 0], axisZ: [0, 0, 1], predefinedType: 'LANDING', materialName: 'Concrete' });
if (!landing.ok) throw landing.error;
model.placeIn(landing.value, storey);

// Top landing: the upper-floor arrival pad under flight 2's head (x = 0, z = 2*rise).
const topLanding = model.addSlab({ length: 500, width: W, thickness: LT, origin: [-300, LANE2, 2 * rise - LT], axisX: [1, 0, 0], axisZ: [0, 0, 1], predefinedType: 'LANDING', materialName: 'Concrete' });
if (!topLanding.ok) throw topLanding.error;
model.placeIn(topLanding.value, storey);

// Posted guardrail along the half-landing's open (south) edge.
const rail = model.addRailing({ length: LD, height: 1000, thickness: 80, origin: [run - 100, 0, rise], axisX: [1, 0, 0], axisZ: [0, 0, 1], predefinedType: 'GUARDRAIL', infill: 'POSTED', materialName: 'Steel' });
if (!rail.ok) throw rail.error;
model.placeIn(rail.value, storey);

// Playground runtime owns the displayed geometry for this eval; snippets don't dispose it.
const concrete = [...unwrap(placedSolids(model.getStairs()[0])), ...model.getSlabs().flatMap((e) => unwrap(placedSolids(e)))].map((s) => color(s, '#cccccc'));
const steel = unwrap(placedSolids(model.getRailings()[0])).map((s) => color(s, '#8a99ad'));

export default present([...concrete, ...steel], {
  bimTree: model.toTreeSummary(),
  ifc: async () => {
    const r = await toIfc(model, { applicationName: 'brepjs playground', applicationVersion: '1.0' });
    if (!r.ok) throw r.error;
    return r.value;
  },
});
`,
  },
  {
    id: 'bim-roof-gallery',
    label: 'Roof Gallery',
    description:
      'Four parametric roof shapes side by side — shed, gable, hip, and dome — each a real IfcRoof solid (not a flat slab). Demonstrates the brepjs-bim roof builder’s shape range; the IFC export tessellates each shaped body.',
    code: `import { BimModel, placedSolids, toIfc } from 'brepjs-bim';
import { unwrap } from 'brepjs/quick';
import { present } from 'brepjs/playground';

const model = new BimModel();
model.init({ name: 'Roof gallery' });
const site = model.addSite({ name: 'Site' });
const building = model.addBuilding({ name: 'Building' });
const storey = model.addStorey({ name: 'Level', elevation: 0 });
const project = model.getProject();
if (project) model.aggregate(project.localId, site);
model.aggregate(site, building);
model.aggregate(building, storey);

const ROOF_L = 2400, ROOF_W = 2000, ROOF_T = 120, GAP = 3200;
const kinds = ['SHED_ROOF', 'GABLE_ROOF', 'HIP_ROOF', 'DOME_ROOF'] as const;
kinds.forEach((kind, i) => {
  const roof = model.addRoof({ length: ROOF_L, width: ROOF_W, thickness: ROOF_T, origin: [i * GAP, 0, 0], axisX: [1, 0, 0], axisZ: [0, 0, 1], predefinedType: kind, pitch: 35, materialName: 'Tile' });
  if (!roof.ok) throw roof.error;
  model.placeIn(roof.value, storey);
});

// Displayed geometry is owned by the playground runtime for this eval; snippets don't dispose it.
const parts = model.getRoofs().flatMap((e) => unwrap(placedSolids(e)));

export default present(parts, {
  bimTree: model.toTreeSummary(),
  ifc: async () => {
    const r = await toIfc(model, { applicationName: 'brepjs playground', applicationVersion: '1.0' });
    if (!r.ok) throw r.error;
    return r.value;
  },
});
`,
  },
  {
    id: 'bim-space-volume',
    label: 'Space Volume',
    description:
      'An IfcSpace — the room volume itself, a first-class spatial element — shown as a tinted solid nested inside a cutaway enclosure (front wall removed) so the volume reads clearly against its neutral bounding walls. Illustrates the pure-BIM “space” concept that has no equivalent in plain solid modelling.',
    code: `import { BimModel, placedSolids, toIfc } from 'brepjs-bim';
import { unwrap } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';

const model = new BimModel();
model.init({ name: 'Space' });
const site = model.addSite({ name: 'Site' });
const building = model.addBuilding({ name: 'Building' });
const storey = model.addStorey({ name: 'Level', elevation: 0 });
const project = model.getProject();
if (project) model.aggregate(project.localId, site);
model.aggregate(site, building);
model.aggregate(building, storey);

const L = 4000, W = 3000, H = 2700, T = 200;
// A cutaway enclosure: three walls (back + two sides) with the front wall removed,
// so the tinted space reads as a volume nested *inside* the room rather than a slab
// floating on top. Each side wall extrudes its thickness inward (toward the room).
const wallDefs: { origin: [number, number, number]; axisX: [number, number, number]; len: number }[] = [
  { origin: [T, W - T, 0], axisX: [1, 0, 0], len: L - 2 * T }, // back, between the sides
  { origin: [T, 0, 0], axisX: [0, 1, 0], len: W },             // left side, full depth
  { origin: [L, 0, 0], axisX: [0, 1, 0], len: W },             // right side, full depth
];
for (const d of wallDefs) {
  const wall = model.addWall({ length: d.len, height: H, thickness: T, origin: d.origin, axisX: d.axisX, axisZ: [0, 0, 1], materialName: 'Concrete' });
  if (!wall.ok) throw wall.error;
  model.placeIn(wall.value, storey);
}
// The room volume itself: a first-class IfcSpace filling the interior to the wall
// heads, flush with the three inner faces and open at the cut-away front.
const space = model.addSpace({ name: 'Room', length: L - 2 * T, width: W - T, height: H, origin: [T, 0, 0], axisX: [1, 0, 0], axisZ: [0, 0, 1], materialName: 'Air' });
if (!space.ok) throw space.error;
model.placeIn(space.value, storey);

// Displayed geometry is owned by the playground runtime for this eval; snippets don't dispose it.
const shell = model.getWalls().flatMap((e) => unwrap(placedSolids(e))).map((s) => color(s, '#d8d4c8'));
const room = unwrap(placedSolids(model.getSpaces()[0])).map((s) => color(s, '#4fd1c5'));

export default present([...shell, ...room], {
  bimTree: model.toTreeSummary(),
  ifc: async () => {
    const r = await toIfc(model, { applicationName: 'brepjs playground', applicationVersion: '1.0' });
    if (!r.ok) throw r.error;
    return r.value;
  },
});
`,
  },
];
