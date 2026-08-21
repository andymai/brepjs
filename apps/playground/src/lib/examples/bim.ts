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
    code: `import { BimModel, placedSolids, toIfc } from 'brepjs-bim';
import { present } from 'brepjs/playground';
import { unwrap } from 'brepjs/quick';

// A parametric structural-steel I-beam authored through the BIM model.
// filletRadius adds the rolled root fillets real wide-flange sections carry
// where the web meets the flanges. Placed in a project → site → building →
// storey so the BIM panel shows a real model tree.
const model = new BimModel();
model.init({ name: 'Beam example' });

// Spatial structure — what makes this a BIM model, not just geometry.
const project = model.getProject();
const siteId = unwrap(model.addSite({ name: 'Site' }));
const buildingId = unwrap(model.addBuilding({ name: 'Building' }));
const storeyId = unwrap(model.addStorey({ name: 'Level 1', elevation: 0 }));
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

// placedSolids() applies the element's (origin, axisX, axisZ) frame, so the
// scene matches the IFC. Reading .geometry instead would show the unplaced
// local solid, identical here only because this beam sits at the origin.
export default present(unwrap(placedSolids(model.getBeams()[0])), {
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
  {
    id: 'bim-wall-openings',
    label: 'Wall with Openings',
    description:
      'A parametric wall hosting a door and a window, placed in a project → site → building → storey spatial structure. The BIM panel shows the live IFC model tree.',
    code: `import { BimModel, placedSolids, toIfc } from 'brepjs-bim';
import { present } from 'brepjs/playground';
import { unwrap } from 'brepjs/quick';

// A parametric wall hosting a door and a window, organised into a real IFC
// spatial structure (project → site → building → storey). Each opening is a void
// boolean-cut into the wall solid. The BIM panel (top-right) shows the model
// tree; the IFC button exports the model as a real IFC-SPF file.
const model = new BimModel();
model.init({ name: 'Wall example' });

// Spatial structure — what makes this a BIM model, not just geometry.
const project = model.getProject();
const siteId = unwrap(model.addSite({ name: 'Site' }));
const buildingId = unwrap(model.addBuilding({ name: 'Building' }));
const storeyId = unwrap(model.addStorey({ name: 'Ground Floor', elevation: 0 }));
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
// IFC export. placedSolids() applies the wall's frame so the scene matches the
// exported file. The ifc thunk runs only when you click the IFC button —
// serializing IFC re-initializes web-ifc, so it's deferred from every render.
export default present(unwrap(placedSolids(model.getWalls()[0])), {
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
      'A parametric curtain-wall facade: a grid of glazing panels framed by vertical and horizontal mullions, standing on a wall line skewed 30 degrees off the X axis. Placement is two-level (component origin, then the wall frame) and placedSolids() applies both.',
    code: `import { BimModel, placedSolids, toIfc } from 'brepjs-bim';
import { present } from 'brepjs/playground';
import { unwrap } from 'brepjs/quick';

// A parametric curtain wall: a columns x rows grid of glazing panels framed by
// mullions, standing on a wall line that runs 30 degrees off the X axis.
// Placed in a project → site → building → storey so the BIM panel shows a tree.
const model = new BimModel();
model.init({ name: 'Curtain wall' });

// Spatial structure — what makes this a BIM model, not just geometry.
const project = model.getProject();
const siteId = unwrap(model.addSite({ name: 'Site' }));
const buildingId = unwrap(model.addBuilding({ name: 'Building' }));
const storeyId = unwrap(model.addStorey({ name: 'Level 1', elevation: 0 }));
if (project) model.aggregate(project.localId, siteId);
model.aggregate(siteId, buildingId);
model.aggregate(buildingId, storeyId);

// A facade rarely runs along world X, so this one is skewed 30 degrees to make
// the placement real rather than incidental.
const A = Math.PI / 6;
const cw = model.addCurtainWall({
  width: 2700,
  height: 2000,
  columns: 3,
  rows: 2,
  panelThickness: 24,
  mullionWidth: 50,
  mullionDepth: 120,
  origin: [0, 0, 0],
  axisX: [Math.cos(A), Math.sin(A), 0],
  axisZ: [0, 0, 1],
  materialName: 'Aluminium',
});
if (!cw.ok) throw cw.error;
model.placeIn(cw.value, storeyId);

// Curtain-wall placement is two-level: each panel/mullion carries a grid-local
// origin, and the whole grid then sits on the wall's own frame. placedSolids()
// applies both. Translating by the component origin alone would build the grid
// flat along X and silently drop the 30-degree rotation.
const parts = unwrap(placedSolids(model.getCurtainWalls()[0]));

export default present(parts, {
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
const site = unwrap(model.addSite({ name: 'Site' }));
const building = unwrap(model.addBuilding({ name: 'Building' }));
const storey = unwrap(model.addStorey({ name: 'Level 1', elevation: 0 }));
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

const assembly = unwrap(model.addElementAssembly({ name: 'Frame' }));
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
const site = unwrap(model.addSite({ name: 'Site' }));
const building = unwrap(model.addBuilding({ name: 'Building' }));
const storey = unwrap(model.addStorey({ name: 'Ground Floor', elevation: 0 }));
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
const site = unwrap(model.addSite({ name: 'Site' }));
const building = unwrap(model.addBuilding({ name: 'Building' }));
const storey = unwrap(model.addStorey({ name: 'Ground Floor', elevation: 0 }));
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
const site = unwrap(model.addSite({ name: 'Site' }));
const building = unwrap(model.addBuilding({ name: 'Building' }));
const storey = unwrap(model.addStorey({ name: 'Level', elevation: 0 }));
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
const site = unwrap(model.addSite({ name: 'Site' }));
const building = unwrap(model.addBuilding({ name: 'Building' }));
const storey = unwrap(model.addStorey({ name: 'Level', elevation: 0 }));
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
  {
    id: 'bim-profile-gallery',
    label: 'Profile Gallery',
    description:
      'Eight structural sections as real IfcColumns: I, L, T, U, Z, C, rectangular hollow and circular hollow. Beams and columns share one profile vocabulary, and each named kind exports as its own parametric IFC profile def (IfcLShapeProfileDef, IfcRectangleHollowProfileDef, and so on) swept by an IfcExtrudedAreaSolid, so the section stays editable data downstream.',
    code: `import { BimModel, placedSolids, toIfc } from 'brepjs-bim';
import { unwrap } from 'brepjs/quick';
import { present } from 'brepjs/playground';

// Eight structural sections, each a real IfcColumn. Beams and columns share one
// profile vocabulary, and every named kind exports as its own parametric IFC
// profile def: IfcLShapeProfileDef, IfcUShapeProfileDef,
// IfcRectangleHollowProfileDef and so on, each swept by an IfcExtrudedAreaSolid.
// The section stays editable data downstream instead of a baked outline.
// Laid out in two rows of four, read left to right then back: I, L, T, U,
// then Z, C, rectangular hollow, circular hollow.
const model = new BimModel();
model.init({ name: 'Profile gallery' });

const project = model.getProject();
const siteId = unwrap(model.addSite({ name: 'Site' }));
const buildingId = unwrap(model.addBuilding({ name: 'Building' }));
const storeyId = unwrap(model.addStorey({ name: 'Level 1', elevation: 0 }));
if (project) model.aggregate(project.localId, siteId);
model.aggregate(siteId, buildingId);
model.aggregate(buildingId, storeyId);

// Short extrusions on purpose: at storey height these read as sticks and the
// section is the thing worth seeing, so each is a stub the camera looks down on.
const HEIGHT = 300;
const GAP = 400;
const ROW = 500;
const PER_ROW = 4;

// filletRadius on the rolled sections is the root fillet a real mill leaves
// where the web meets the flange; the hollow sections take separate inner and
// outer corner radii.
const profiles = [
  {
    kind: 'I_BEAM',
    overallWidth: 150,
    overallDepth: 300,
    flangeThickness: 12,
    webThickness: 8,
    filletRadius: 14,
  },
  { kind: 'L_SHAPE', depth: 200, width: 200, legThickness: 16, filletRadius: 12 },
  {
    kind: 'T_SHAPE',
    depth: 200,
    flangeWidth: 200,
    webThickness: 12,
    flangeThickness: 16,
    filletRadius: 10,
  },
  { kind: 'U_SHAPE', depth: 250, flangeWidth: 100, webThickness: 10, flangeThickness: 14 },
  { kind: 'Z_SHAPE', depth: 200, flangeWidth: 90, webThickness: 10, flangeThickness: 14 },
  { kind: 'C_SHAPE', depth: 200, width: 80, wallThickness: 4, girth: 20, internalFilletRadius: 5 },
  {
    kind: 'RECTANGLE_HOLLOW',
    xDim: 200,
    yDim: 120,
    wallThickness: 8,
    outerFilletRadius: 12,
    innerFilletRadius: 6,
  },
  { kind: 'CIRCLE_HOLLOW', radius: 90, wallThickness: 8 },
] as const;

profiles.forEach((profile, i) => {
  const col = model.addColumn({
    height: HEIGHT,
    profile,
    origin: [(i % PER_ROW) * GAP, Math.floor(i / PER_ROW) * ROW, 0],
    axisX: [1, 0, 0],
    axisZ: [0, 0, 1],
    materialName: 'Steel',
  });
  if (!col.ok) throw col.error;
  model.placeIn(col.value, storeyId);
});

// Displayed geometry is owned by the playground runtime for this eval.
const parts = model.getColumns().flatMap((e) => unwrap(placedSolids(e)));

export default present(parts, {
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
  {
    id: 'bim-validation',
    label: 'Validated Export',
    description:
      'One toIfcValidated call exports the model and runs the whole checker suite: referential integrity before serializing, then schema, round-trip, geometry validity, and the buildingSMART gherkin rules. Findings are severity-tagged, and this model deliberately trips a real one. Exports against IFC4 and IFC4X3; the Files button saves the full report.',
    code: `import { BimModel, countBySeverity, placedSolids, toIfcValidated } from 'brepjs-bim';
import { unwrap } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';

// toIfcValidated exports the model and runs the whole checker suite in one
// call: referential integrity before serializing, then schema, round-trip,
// geometry validity, and the buildingSMART gherkin rules that touch this
// writer's vocabulary. Findings are severity-tagged, never thrown.
//
// Open the console panel below to read the report. web-ifc chatters
// "Attempt to Access Invalid ExpressID" while saving a model that has
// openings; that is its own logging during SaveModel, not a finding.
const model = new BimModel();
model.init({ name: 'Validated building', projectId: 'validation-demo' });

const project = model.getProject();
const siteId = unwrap(model.addSite({ name: 'Site' }));
const buildingId = unwrap(model.addBuilding({ name: 'Building' }));
const storeyId = unwrap(model.addStorey({ name: 'Ground Floor', elevation: 0 }));
if (project) model.aggregate(project.localId, siteId);
model.aggregate(siteId, buildingId);
model.aggregate(buildingId, storeyId);

const L = 4000;
const W = 3000;
const H = 2700;
const T = 200;

const slab = model.addSlab({
  length: L,
  width: W,
  thickness: 250,
  origin: [0, 0, -250],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  predefinedType: 'FLOOR',
  materialName: 'Concrete',
});
if (!slab.ok) throw slab.error;
model.placeIn(slab.value, storeyId);

const wall = model.addWall({
  length: L,
  height: H,
  thickness: T,
  origin: [0, 0, 0],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  materialName: 'Concrete',
});
if (!wall.ok) throw wall.error;
model.placeIn(wall.value, storeyId);

const win = model.addWindow({
  wallLocalId: wall.value,
  width: 1200,
  height: 1000,
  offsetAlongWall: 1400,
  offsetFromFloor: 900,
  materialName: 'Aluminium',
});
if (!win.ok) throw win.error;
model.placeIn(win.value, storeyId);

// A severity summary is the useful read. Note what actually blocks: only a
// referential-integrity failure makes toIfcValidated return Err. Schema,
// round-trip, geometry and gherkin findings come back in the report alongside
// usable bytes, so the caller decides whether they are shippable.
// This model deliberately omits a coordinate reference system, so the gherkin
// layer raises GRF003. Passing crs: { name: 'EPSG:25832', eastings: ..., northings: ... }
// to model.init() clears it. A checker that only ever prints zeroes teaches
// nothing about what it checks.
const report = (label: string, issues: readonly { severity: string; code: string; message: string }[]) => {
  const counts = { error: 0, warning: 0, info: 0 };
  for (const i of issues) counts[i.severity as 'error' | 'warning' | 'info'] += 1;
  console.log(
    label + ': ' + counts.error + ' errors, ' + counts.warning + ' warnings, ' + counts.info + ' info'
  );
  for (const i of issues.slice(0, 4)) console.log('   [' + i.severity + '] ' + i.code + ' ' + i.message);
};

const ifc4 = await toIfcValidated(model, {
  applicationName: 'brepjs playground',
  applicationVersion: '1.0',
});
if (!ifc4.ok) throw ifc4.error;
report('IFC4', ifc4.value.report.issues);

// The same model against the newer schema: ifcSchema is the only change, and
// the suite runs identically. countBySeverity is the one-line version of the
// tally above.
const ifc4x3 = await toIfcValidated(model, {
  applicationName: 'brepjs playground',
  applicationVersion: '1.0',
  ifcSchema: 'IFC4X3',
});
if (!ifc4x3.ok) throw ifc4x3.error;
const x3 = countBySeverity(ifc4x3.value.report);
console.log('IFC4X3: ' + x3.error + ' errors, ' + x3.warning + ' warnings, ' + x3.info + ' info');

// Playground runtime owns the displayed geometry for this eval.
const walls = model
  .getWalls()
  .flatMap((e) => unwrap(placedSolids(e)))
  .map((s) => color(s, '#d9d3c7'));
const slabs = model
  .getSlabs()
  .flatMap((e) => unwrap(placedSolids(e)))
  .map((s) => color(s, '#9a948a'));

export default present([...walls, ...slabs], {
  bimTree: model.toTreeSummary(),
  ifc: () => ifc4.value.bytes,
  // The Files button saves the full report; the console shows the summary.
  files: () => [
    {
      name: 'validation-report.json',
      data: JSON.stringify({ ifc4: ifc4.value.report.issues, ifc4x3: ifc4x3.value.report.issues }, null, 2),
      mime: 'application/json',
    },
  ],
});
`,
  },
  {
    id: 'bim-interop',
    label: 'COBie, IDS and BCF',
    description:
      'The three formats that carry the workflows around a model: COBie 2.4 handover sheets derived from the spatial structure, an IDS 1.0 requirement checked against the exported file, and a BCF 3.0 issue filed against a wall by its GlobalId. Results print to the console; the Files button saves the COBie sheets and the BCF markup.',
    code: `import {
  BimModel,
  checkIds,
  deriveCobieModel,
  newIfcGuid,
  parseIdsXml,
  placedSolids,
  serializeBcfFiles,
  serializeCobieToCsv,
  toIfc,
} from 'brepjs-bim';
import { unwrap } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';

// IFC carries the model; three sibling formats carry the workflows around it.
// COBie is the handover spreadsheet, IDS is machine-readable requirements, BCF
// is issue exchange. All three key off the same model, and off GlobalIds.
// Console panel shows the results; the Files button saves them.
const model = new BimModel();
model.init({ name: 'Interop demo', projectId: 'interop-demo' });

const project = model.getProject();
const siteId = unwrap(model.addSite({ name: 'Site' }));
const buildingId = unwrap(model.addBuilding({ name: 'Riverside Block' }));
const storeyId = unwrap(model.addStorey({ name: 'Ground Floor', elevation: 0 }));
if (project) model.aggregate(project.localId, siteId);
model.aggregate(siteId, buildingId);
model.aggregate(buildingId, storeyId);

const L = 6000;
const W = 4000;
const H = 2700;
const T = 200;

// Two rooms behind one external wall. Spaces are what COBie's Space sheet is
// built from, so a handover export needs them to be real elements.
const rooms = [
  { key: 'Office 01', x: 0, len: 3400 },
  { key: 'Office 02', x: 3600, len: 2400 },
];
for (const r of rooms) {
  const space = model.addSpace({
    name: r.key,
    length: r.len,
    width: W - 2 * T,
    height: H,
    origin: [r.x + T, T, 0],
    axisX: [1, 0, 0],
    axisZ: [0, 0, 1],
    materialName: 'Air',
  });
  if (!space.ok) throw space.error;
  model.placeIn(space.value, storeyId);
}

const wall = model.addWall({
  length: L,
  height: H,
  thickness: T,
  origin: [0, 0, 0],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  materialName: 'Concrete',
  isExternal: true,
});
if (!wall.ok) throw wall.error;
model.placeIn(wall.value, storeyId);

const bytesResult = await toIfc(model, {
  applicationName: 'brepjs playground',
  applicationVersion: '1.0',
});
if (!bytesResult.ok) throw bytesResult.error;
const bytes = bytesResult.value;

// COBie 2.4: the facility-management view, derived from the spatial structure
// and property sets rather than from geometry.
const cobie = deriveCobieModel(model, {
  contact: { email: 'fm@example.com', givenName: 'Facilities', familyName: 'Team' },
});
const sheets = serializeCobieToCsv(cobie);
console.log('COBie sheets: ' + [...sheets.keys()].join(', '));
console.log(
  '  ' + cobie.space.length + ' spaces, ' + cobie.floor.length + ' floors, ' + cobie.component.length + ' components'
);

// IDS 1.0: a requirement written the way a client would issue it. Applicability
// picks the entities to test, requirements say what they must carry.
// Joined with a space, not a newline: this whole example is itself a template
// literal, so a backslash escape here would be consumed before the example ever
// runs. XML does not care about the whitespace.
const IDS_XML = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<ids xmlns="http://standards.buildingsmart.org/IDS">',
  '  <info><title>External walls declare IsExternal</title></info>',
  '  <specifications>',
  '    <specification name="External walls declare IsExternal" ifcVersion="IFC4">',
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

const ids = parseIdsXml(IDS_XML);
if (!ids.ok) throw ids.error;
const idsReport = await checkIds(bytes, ids.value);
if (!idsReport.ok) throw idsReport.error;
console.log('IDS: ' + (idsReport.value.pass ? 'PASS' : 'FAIL'));
for (const r of idsReport.value.results) {
  console.log(
    '  ' + r.specificationName + ': ' + r.passedCount + '/' + r.applicableCount + ' applicable entities pass'
  );
}

// BCF 3.0: an issue filed against a specific element by its GlobalId, which is
// why stable ids matter. Zip packaging is the caller's job, so this is the
// unzipped container as a name to contents map.
const wallGuid = model.getWalls()[0].guid;
const bcf = serializeBcfFiles({
  version: { versionId: '3.0' },
  project: { projectId: 'interop-demo', name: 'Riverside Block' },
  topics: [
    {
      guid: newIfcGuid(),
      title: 'Confirm external wall U-value',
      topicType: 'Issue',
      topicStatus: 'Open',
      creationAuthor: 'fm@example.com',
      creationDate: '2026-01-05T09:00:00Z',
      description: 'Pset_WallCommon carries IsExternal but no ThermalTransmittance.',
      comments: [],
      viewpoints: [
        {
          guid: newIfcGuid(),
          components: { selection: [{ ifcGuid: wallGuid }] },
        },
      ],
    },
  ],
});
console.log('BCF container: ' + [...bcf.keys()].join(', '));

// Topic files are nested under the topic guid, so select by suffix rather than
// by position: the container also holds bcf.version and project.bcfp.
const markupKey = [...bcf.keys()].find((k) => k.endsWith('/markup.bcf')) ?? '';

// Playground runtime owns the displayed geometry for this eval.
const walls = model
  .getWalls()
  .flatMap((e) => unwrap(placedSolids(e)))
  .map((s) => color(s, '#d9d3c7'));
const spaces = model
  .getSpaces()
  .flatMap((e) => unwrap(placedSolids(e)))
  .map((s) => color(s, '#4fd1c5'));

export default present([...walls, ...spaces], {
  bimTree: model.toTreeSummary(),
  ifc: () => bytes,
  // A curated few rather than all nine COBie sheets: the Files button saves one
  // file per entry and nobody wants nine clicks' worth of empty sheets.
  files: () => [
    { name: 'cobie-Facility.csv', data: sheets.get('Facility') ?? '', mime: 'text/csv' },
    { name: 'cobie-Space.csv', data: sheets.get('Space') ?? '', mime: 'text/csv' },
    { name: 'markup.bcf', data: bcf.get(markupKey) ?? '', mime: 'application/xml' },
  ],
});
`,
  },
  {
    id: 'bim-round-trip',
    label: 'IFC Round Trip',
    description:
      'Export to IFC, read the file straight back with fromIfc, and render what came back. Every solid on screen was reconstructed from the exported file rather than kept from the source model, so a writer/importer disagreement would be visible. Reports geometry fidelity per element and how many GlobalIds survived.',
    code: `import { BimModel, disposeImportedModel, fromIfc, toIfc } from 'brepjs-bim';
import { clone, unwrap } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';

// Export to IFC, then read the file straight back with fromIfc and render what
// came back. Open the console panel below for the element and fidelity counts.
// Nothing on screen is the original geometry: every solid here was
// reconstructed from the exported file's IfcExtrudedAreaSolid definitions, so
// if the writer and importer disagreed you would see it immediately.
const model = new BimModel();
model.init({ name: 'Round trip', projectId: 'round-trip-demo' });

const project = model.getProject();
const siteId = unwrap(model.addSite({ name: 'Site' }));
const buildingId = unwrap(model.addBuilding({ name: 'Building' }));
const storeyId = unwrap(model.addStorey({ name: 'Ground Floor', elevation: 0 }));
if (project) model.aggregate(project.localId, siteId);
model.aggregate(siteId, buildingId);
model.aggregate(buildingId, storeyId);

const L = 5000;
const W = 3600;
const H = 2700;
const T = 200;

const slab = model.addSlab({
  length: L,
  width: W,
  thickness: 250,
  origin: [0, 0, -250],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  predefinedType: 'FLOOR',
  materialName: 'Concrete',
});
if (!slab.ok) throw slab.error;
model.placeIn(slab.value, storeyId);

// Two walls meeting at a corner, so a placement error in either direction
// shows up as a gap or an overlap rather than hiding at the origin.
const defs: { origin: [number, number, number]; axisX: [number, number, number]; len: number }[] = [
  { origin: [0, 0, 0], axisX: [1, 0, 0], len: L },
  { origin: [L, 0, 0], axisX: [0, 1, 0], len: W },
];
const walls = defs.map((d) => {
  const wall = model.addWall({
    length: d.len,
    height: H,
    thickness: T,
    origin: d.origin,
    axisX: d.axisX,
    axisZ: [0, 0, 1],
    materialName: 'Concrete',
  });
  if (!wall.ok) throw wall.error;
  model.placeIn(wall.value, storeyId);
  return wall.value;
});

const door = model.addDoor({
  wallLocalId: walls[0],
  width: 1000,
  height: 2100,
  offsetAlongWall: 1600,
  offsetFromFloor: 0,
  materialName: 'Timber',
});
if (!door.ok) throw door.error;
model.placeIn(door.value, storeyId);

const exported = await toIfc(model, {
  applicationName: 'brepjs playground',
  applicationVersion: '1.0',
});
if (!exported.ok) throw exported.error;
const bytes = exported.value;

const imported = await fromIfc(bytes);
if (!imported.ok) throw imported.error;
const back = imported.value;

console.log('exported ' + bytes.length + ' bytes, schema ' + back.schema);
console.log('read back ' + back.elements.length + ' elements');

// Geometry fidelity is reported per element. PARAMETRIC means the importer
// rebuilt a real B-Rep solid from the profile and extrusion in the file, not a
// mesh; TESSELLATED_LOSSY would mean triangles only, with no solid to show.
const byFidelity = new Map<string, number>();
for (const e of back.elements) {
  byFidelity.set(e.geometry.fidelity, (byFidelity.get(e.geometry.fidelity) ?? 0) + 1);
}
for (const [f, n] of byFidelity) console.log('  ' + f + ': ' + n);

// GlobalIds are the identity contract across the boundary: every id the writer
// minted must come back naming the same element.
const original = new Set(model.getAllElements().map((e) => e.guid));
const survived = back.elements.filter((e) => original.has(e.guid)).length;
console.log(survived + ' of ' + back.elements.length + ' imported GlobalIds match the source model');

// The imported solids, not the originals. An ImportedModel pins kernel memory
// for every element it read, including the openings filtered out above, and
// those have no other release path. So clone what gets displayed, hand the
// clones to the runtime, and release the imported model here the way a real
// app would.
const PALETTE: Record<string, string> = {
  WALL: '#d9d3c7',
  SLAB: '#9a948a',
  DOOR: '#8b5a2b',
};
// Openings come back as elements with their own solid (the void box). They are
// holes, not things to draw, so they are filtered out here exactly as the
// direct-API examples never display them.
const shown = back.elements.flatMap((e) =>
  e.category !== 'OPENING' && e.geometry.solid
    ? [color(unwrap(clone(e.geometry.solid)), PALETTE[e.category] ?? '#8a99ad')]
    : []
);
disposeImportedModel(back);

export default present(shown, {
  bimTree: model.toTreeSummary(),
  ifc: () => bytes,
});
`,
  },
  {
    id: 'bim-takeoff',
    label: 'Quantity Takeoff',
    description:
      'A quantity schedule computed from the model rather than counted by hand: net volume per category and material, grouped the way a takeoff sheet is. Openings are already subtracted, so the wall figure is net, not gross. The console shows the schedule and the Files button saves it as CSV.',
    code: `import { BimModel, placedSolids, toIfc } from 'brepjs-bim';
import { measureVolume, unwrap } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';

// A quantity schedule, computed from the model rather than counted by hand.
// Every element carries a spec and a solid, so net volume comes straight off
// the geometry after openings are cut. Open the console panel for the
// schedule; the Files button saves it as CSV for a takeoff sheet.
const model = new BimModel();
model.init({ name: 'Takeoff demo', projectId: 'takeoff-demo' });

const project = model.getProject();
const siteId = unwrap(model.addSite({ name: 'Site' }));
const buildingId = unwrap(model.addBuilding({ name: 'Block A' }));
const storeyId = unwrap(model.addStorey({ name: 'Ground Floor', elevation: 0 }));
if (project) model.aggregate(project.localId, siteId);
model.aggregate(siteId, buildingId);
model.aggregate(buildingId, storeyId);

const L = 8000;
const W = 5000;
const H = 3000;
const T = 250;

const slab = model.addSlab({
  length: L,
  width: W,
  thickness: 300,
  origin: [0, 0, -300],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  predefinedType: 'FLOOR',
  materialName: 'Concrete C30/37',
});
if (!slab.ok) throw slab.error;
model.placeIn(slab.value, storeyId);

// Four perimeter walls. Front and back run the full length; the sides fit
// between them so the corners meet without doubling up, which would otherwise
// inflate the concrete quantity by two corner volumes.
const wallDefs: {
  origin: [number, number, number];
  axisX: [number, number, number];
  len: number;
}[] = [
  { origin: [0, 0, 0], axisX: [1, 0, 0], len: L },
  { origin: [0, W - T, 0], axisX: [1, 0, 0], len: L },
  { origin: [T, T, 0], axisX: [0, 1, 0], len: W - 2 * T },
  { origin: [L, T, 0], axisX: [0, 1, 0], len: W - 2 * T },
];
const wallIds = wallDefs.map((d) => {
  const wall = model.addWall({
    length: d.len,
    height: H,
    thickness: T,
    origin: d.origin,
    axisX: d.axisX,
    axisZ: [0, 0, 1],
    materialName: 'Concrete C30/37',
    isExternal: true,
  });
  if (!wall.ok) throw wall.error;
  model.placeIn(wall.value, storeyId);
  return wall.value;
});

const door = model.addDoor({
  wallLocalId: wallIds[0],
  width: 1200,
  height: 2400,
  offsetAlongWall: 900,
  offsetFromFloor: 0,
  materialName: 'Timber',
});
if (!door.ok) throw door.error;
model.placeIn(door.value, storeyId);

for (const at of [3200, 5600]) {
  const win = model.addWindow({
    wallLocalId: wallIds[0],
    width: 1600,
    height: 1400,
    offsetAlongWall: at,
    offsetFromFloor: 900,
    materialName: 'Aluminium + Glazing',
  });
  if (!win.ok) throw win.error;
  model.placeIn(win.value, storeyId);
}

const steel = { kind: 'I_BEAM', overallWidth: 180, overallDepth: 360, flangeThickness: 14, webThickness: 9 } as const;
for (const x of [2000, 6000]) {
  const beam = model.addBeam({
    length: W,
    profile: steel,
    origin: [x, 0, H],
    axisX: [0, 1, 0],
    axisZ: [0, 0, 1],
    materialName: 'Steel S355',
  });
  if (!beam.ok) throw beam.error;
  model.placeIn(beam.value, storeyId);
}

// Volume comes from the placed solid, so the openings cut into the front wall
// are already subtracted: this is net quantity, not gross. Group by category
// and material the way a takeoff sheet does.
// placedSolids mints fresh caller-owned solids on every call, so measure and
// display from ONE pass rather than building a throwaway set to measure and a
// second set to show.
const TINT: Record<string, string> = {
  WALL: '#d9d3c7',
  SLAB: '#9a948a',
  BEAM: '#8a99ad',
};
type Row = { category: string; material: string; count: number; m3: number };
const rows = new Map<string, Row>();
const shown = [];
for (const el of model.getAllElements()) {
  // Fillers and spatial containers legitimately have no solid; placedSolids
  // returns an empty list for them rather than an error.
  const solids = unwrap(placedSolids(el));
  if (solids.length === 0) continue;
  const material = (el.spec as { materialName?: string }).materialName ?? '(none)';
  const key = el.category + '|' + material;
  const row = rows.get(key) ?? { category: el.category, material, count: 0, m3: 0 };
  row.count += 1;
  for (const s of solids) {
    // Millimetres in, cubic metres out: 1 m3 is 1e9 mm3.
    row.m3 += unwrap(measureVolume(s)) / 1e9;
    shown.push(color(s, TINT[el.category] ?? '#8b5a2b'));
  }
  rows.set(key, row);
}

const ordered = [...rows.values()].sort((a, b) => b.m3 - a.m3);
console.log('category         material                count      m3');
let total = 0;
for (const r of ordered) {
  total += r.m3;
  console.log(
    r.category.padEnd(17) + r.material.padEnd(24) + String(r.count).padStart(5) + r.m3.toFixed(2).padStart(8)
  );
}
console.log('total concrete + steel volume: ' + total.toFixed(2) + ' m3');

const csv = ['Category,Material,Count,NetVolume_m3']
  .concat(ordered.map((r) => r.category + ',' + r.material + ',' + r.count + ',' + r.m3.toFixed(3)))
  .join(String.fromCharCode(10));

// Playground runtime owns the displayed geometry for this eval.
export default present(shown, {
  bimTree: model.toTreeSummary(),
  ifc: async () => {
    const r = await toIfc(model, {
      applicationName: 'brepjs playground',
      applicationVersion: '1.0',
    });
    if (!r.ok) throw r.error;
    return r.value;
  },
  files: () => [{ name: 'takeoff.csv', data: csv, mime: 'text/csv' }],
});
`,
  },
  {
    id: 'bim-foundations',
    label: 'Foundations to Roof',
    description:
      'A structural section from the ground up: bored piles, pile caps, ground beams, columns, and the suspended slab they carry. Foundations are first-class IFC elements (IfcPile, IfcFooting) rather than boxes below zero, which is what lets a structural model schedule and coordinate them.',
    code: `import { BimModel, placedSolids, toIfc } from 'brepjs-bim';
import { unwrap } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';

// A structural section from the ground up: bored piles, pile caps, ground beams,
// columns, and the suspended slab they carry. Foundations are first-class IFC
// elements (IfcPile, IfcFooting), not just boxes below zero, which is what lets
// a structural model schedule and coordinate them.
const model = new BimModel();
model.init({ name: 'Foundations', projectId: 'foundations-demo' });

const project = model.getProject();
const siteId = unwrap(model.addSite({ name: 'Site' }));
const buildingId = unwrap(model.addBuilding({ name: 'Block A' }));
const storeyId = unwrap(model.addStorey({ name: 'Substructure', elevation: -1200 }));
if (project) model.aggregate(project.localId, siteId);
model.aggregate(siteId, buildingId);
model.aggregate(buildingId, storeyId);

const GRID_X = [0, 4000, 8000];
const GRID_Y = [0, 4000];
const PILE_LEN = 6000;
const CAP = 1200;
const CAP_T = 700;
const COL_H = 3400;

// Each grid node gets a pile driven down from the cap soffit, then a pad cap
// sitting on it, then the column above. Piles take a profile like any other
// linear member, so a circular bored pile is just a CIRCULAR section.
for (const x of GRID_X) {
  for (const y of GRID_Y) {
    const pile = model.addPile({
      length: PILE_LEN,
      profile: { kind: 'CIRCULAR', radius: 225 },
      origin: [x, y, -PILE_LEN - CAP_T],
      axisX: [1, 0, 0],
      axisZ: [0, 0, 1],
      predefinedType: 'BORED',
      materialName: 'Concrete C32/40',
    });
    if (!pile.ok) throw pile.error;
    model.placeIn(pile.value, storeyId);

    const cap = model.addFooting({
      length: CAP,
      width: CAP,
      thickness: CAP_T,
      origin: [x - CAP / 2, y - CAP / 2, -CAP_T],
      axisX: [1, 0, 0],
      axisZ: [0, 0, 1],
      predefinedType: 'PILE_CAP',
      materialName: 'Concrete C32/40',
    });
    if (!cap.ok) throw cap.error;
    model.placeIn(cap.value, storeyId);

    const col = model.addColumn({
      height: COL_H,
      profile: { kind: 'RECTANGULAR', width: 400, height: 400 },
      origin: [x, y, 0],
      axisX: [1, 0, 0],
      axisZ: [0, 0, 1],
      materialName: 'Concrete C32/40',
    });
    if (!col.ok) throw col.error;
    model.placeIn(col.value, storeyId);
  }
}

// Ground beams tying the caps together, at cap level rather than up at the head.
for (const y of GRID_Y) {
  const gb = model.addBeam({
    length: 8000,
    profile: { kind: 'RECTANGULAR', width: 300, height: 600 },
    origin: [0, y, -CAP_T / 2],
    axisX: [1, 0, 0],
    axisZ: [0, 0, 1],
    predefinedType: 'BEAM',
    materialName: 'Concrete C32/40',
  });
  if (!gb.ok) throw gb.error;
  model.placeIn(gb.value, storeyId);
}

// The suspended slab the columns carry.
const deck = model.addSlab({
  length: 8400,
  width: 4400,
  thickness: 300,
  origin: [-200, -200, COL_H],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  predefinedType: 'FLOOR',
  materialName: 'Concrete C32/40',
});
if (!deck.ok) throw deck.error;
model.placeIn(deck.value, storeyId);

console.log(
  model.getPiles().length + ' piles, ' + model.getFootings().length + ' pile caps, ' +
    model.getColumns().length + ' columns, ' + model.getBeams().length + ' ground beams'
);

// Playground runtime owns the displayed geometry for this eval.
const tint = (cat: string): string => {
  if (cat === 'PILE') return '#6f6a60';
  if (cat === 'FOOTING') return '#8a8378';
  if (cat === 'SLAB') return '#cfcabb';
  return '#a8a196';
};
const shown = model
  .getAllElements()
  .flatMap((el) => unwrap(placedSolids(el)).map((solid) => color(solid, tint(el.category))));

export default present(shown, {
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
  {
    id: 'bim-spaces-zones',
    label: 'Room Schedule and Zones',
    description:
      'The room programme rather than the walls around it. Each room is an IfcSpace with a name, area and volume, and zones group them into departments across the plan. Prints a room schedule with per-department totals and percentages, the layer an area take or an energy model reads from.',
    code: `import { BimModel, placedSolids, toIfc } from 'brepjs-bim';
import { measureVolume, unwrap } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';

// The room programme, not the walls around it. An IfcSpace is a first-class
// element with a name, an area and a volume, and zones group spaces across the
// plan the way a department or a fire compartment does. This is the layer a
// space schedule, an area take, and an energy model all read from.
const model = new BimModel();
model.init({ name: 'Space programme', projectId: 'spaces-demo' });

const project = model.getProject();
const siteId = unwrap(model.addSite({ name: 'Site' }));
const buildingId = unwrap(model.addBuilding({ name: 'Block A' }));
const storeyId = unwrap(model.addStorey({ name: 'Level 1', elevation: 0 }));
if (project) model.aggregate(project.localId, siteId);
model.aggregate(siteId, buildingId);
model.aggregate(buildingId, storeyId);

const H = 3000;
const T = 150;

// name, x, y, length, depth, department
const PROGRAMME: [string, number, number, number, number, string][] = [
  ['Studio 01', 0, 0, 5200, 4800, 'Workplace'],
  ['Studio 02', 5350, 0, 5200, 4800, 'Workplace'],
  ['Meeting', 0, 4950, 3400, 3200, 'Workplace'],
  ['Kitchen', 3550, 4950, 2600, 3200, 'Amenity'],
  ['WC', 6300, 4950, 1800, 3200, 'Amenity'],
  ['Plant', 8250, 4950, 2300, 3200, 'Service'],
];

const spaceIds = PROGRAMME.map(([name, x, y, len, depth]) => {
  const space = model.addSpace({
    name,
    length: len,
    width: depth,
    height: H,
    origin: [x, y, 0],
    axisX: [1, 0, 0],
    axisZ: [0, 0, 1],
    materialName: 'Air',
  });
  if (!space.ok) throw space.error;
  model.placeIn(space.value, storeyId);
  return space.value;
});

// Zones cut across the plan: a space belongs to a department regardless of
// where it sits. assignToGroup is the IfcRelAssignsToGroup relationship.
const departments = [...new Set(PROGRAMME.map((p) => p[5]))];
for (const dept of departments) {
  const zone = model.addZone({ name: dept, longName: dept + ' zone' });
  if (!zone.ok) throw zone.error;
  const members = spaceIds.filter((_, i) => PROGRAMME[i][5] === dept);
  model.assignToGroup(zone.value, members);
}

// Dividing walls between the studios and along the back, so the spaces read as
// rooms rather than floating blocks.
for (const d of [
  { origin: [5200, 0, 0] as [number, number, number], axisX: [0, 1, 0] as [number, number, number], len: 4800 },
  { origin: [0, 4800, 0] as [number, number, number], axisX: [1, 0, 0] as [number, number, number], len: 10550 },
]) {
  const wall = model.addWall({
    length: d.len,
    height: H,
    thickness: T,
    origin: d.origin,
    axisX: d.axisX,
    axisZ: [0, 0, 1],
    materialName: 'Plasterboard',
  });
  if (!wall.ok) throw wall.error;
  model.placeIn(wall.value, storeyId);
}

// The schedule a space plan is actually judged on: area per room, totals per
// department, and the ratio of usable to serviced area.
// Look the programme entry up by the space's own name rather than by position:
// a schedule that depends on insertion order silently mislabels every row the
// day someone reorders the model.
const byName = new Map(PROGRAMME.map((p) => [p[0], p]));
console.log('room          department     area m2   volume m3');
const byDept = new Map<string, number>();
let totalArea = 0;
const DEPT_TINT: Record<string, string> = {
  Workplace: '#4fd1c5',
  Amenity: '#f6c177',
  Service: '#c4a7e7',
};
// One pass again: placedSolids allocates on every call, so the solids measured
// for the schedule are the same ones handed to the viewer.
const spaces = [];
for (const el of model.getSpaces()) {
  const name = (el.spec as { name?: string }).name ?? '(unnamed)';
  const entry = byName.get(name);
  if (!entry) continue;
  const area = (entry[3] * entry[4]) / 1e6;
  let vol = 0;
  for (const s of unwrap(placedSolids(el))) {
    vol += unwrap(measureVolume(s)) / 1e9;
    spaces.push(color(s, DEPT_TINT[entry[5]] ?? '#4fd1c5'));
  }
  totalArea += area;
  byDept.set(entry[5], (byDept.get(entry[5]) ?? 0) + area);
  console.log(name.padEnd(14) + entry[5].padEnd(15) + area.toFixed(1).padStart(7) + vol.toFixed(1).padStart(11));
}
console.log('total area ' + totalArea.toFixed(1) + ' m2 across ' + model.getSpaces().length + ' rooms');
for (const [dept, area] of byDept) {
  console.log('  ' + dept.padEnd(12) + area.toFixed(1).padStart(7) + ' m2  (' + ((area / totalArea) * 100).toFixed(0) + '%)');
}

// Playground runtime owns the displayed geometry for this eval.
const walls = model
  .getWalls()
  .flatMap((el) => unwrap(placedSolids(el)))
  .map((s) => color(s, '#d9d3c7'));

export default present([...spaces, ...walls], {
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
  {
    id: 'bim-finishes',
    label: 'Finishes and Access',
    description:
      'Floor, ceiling and cladding as separate IfcCovering elements, each with its own material and thickness, plus a 1:15 entrance ramp with a landing and a posted guardrail. Finishes live on their own layer so a specification and a maintenance schedule can read them independently of the structure.',
    code: `import { BimModel, placedSolids, toIfc } from 'brepjs-bim';
import { unwrap } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';

// Finishes and an accessible entrance. Coverings are the layer a specification
// and a maintenance schedule live on: a floor finish is its own IfcCovering
// with its own material, not a property of the slab underneath. The ramp is
// built to a 1:15 gradient with a landing and a guardrail.
const model = new BimModel();
model.init({ name: 'Finishes and access', projectId: 'finishes-demo' });

const project = model.getProject();
const siteId = unwrap(model.addSite({ name: 'Site' }));
const buildingId = unwrap(model.addBuilding({ name: 'Block A' }));
const storeyId = unwrap(model.addStorey({ name: 'Ground Floor', elevation: 0 }));
if (project) model.aggregate(project.localId, siteId);
model.aggregate(siteId, buildingId);
model.aggregate(buildingId, storeyId);

const L = 6000;
const W = 4500;
const H = 3000;
const T = 200;
const RISE = 450; // entrance threshold above external ground

// Structural slab at the raised floor level, plus the wall behind it.
const slab = model.addSlab({
  length: L,
  width: W,
  thickness: 250,
  origin: [0, 0, RISE - 250],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  predefinedType: 'FLOOR',
  materialName: 'Concrete',
});
if (!slab.ok) throw slab.error;
model.placeIn(slab.value, storeyId);

const wall = model.addWall({
  length: L,
  height: H,
  thickness: T,
  origin: [0, W - T, RISE],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  materialName: 'Blockwork',
  isExternal: true,
});
if (!wall.ok) throw wall.error;
model.placeIn(wall.value, storeyId);

// Three coverings, each a separate element with its own thickness and material:
// the floor finish on top of the slab, the ceiling below the soffit, and
// external cladding on the wall face.
const flooring = model.addCovering({
  length: L,
  width: W,
  thickness: 18,
  origin: [0, 0, RISE],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  predefinedType: 'FLOORING',
  materialName: 'Oak parquet',
});
if (!flooring.ok) throw flooring.error;
model.placeIn(flooring.value, storeyId);

const ceiling = model.addCovering({
  length: L,
  width: W,
  thickness: 12,
  origin: [0, 0, RISE + H - 400],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  predefinedType: 'CEILING',
  materialName: 'Acoustic tile',
});
if (!ceiling.ok) throw ceiling.error;
model.placeIn(ceiling.value, storeyId);

// A vertical covering needs its frame handed correctly: a covering's local +Y
// is axisZ x axisX, so axisZ=[0,1,0] with axisX=[1,0,0] would point the panel's
// height at world -Z and hang it below ground. axisX=[-1,0,0] flips it upright,
// which is why the panel runs back from x = L.
const cladding = model.addCovering({
  length: L,
  width: H,
  thickness: 40,
  origin: [L, W, RISE],
  axisX: [-1, 0, 0],
  axisZ: [0, 1, 0],
  predefinedType: 'CLADDING',
  materialName: 'Fibre cement panel',
});
if (!cladding.ok) throw cladding.error;
model.placeIn(cladding.value, storeyId);

// A 1:15 ramp reaching the threshold, plus its top landing. slope is rise over
// run, so the run follows from the rise the ramp has to climb.
const SLOPE = 1 / 15;
const RUN = RISE / SLOPE;
const ramp = model.addRamp({
  name: 'Entrance ramp',
  predefinedType: 'STRAIGHT_RUN_RAMP',
  materialName: 'Concrete',
  flights: [
    {
      width: 1500,
      length: RUN,
      slope: SLOPE,
      thickness: 180,
      origin: [1000, -RUN, 0],
      axisX: [0, 1, 0],
      axisZ: [0, 0, 1],
      materialName: 'Concrete',
      predefinedType: 'STRAIGHT',
    },
  ],
});
if (!ramp.ok) throw ramp.error;
model.placeIn(ramp.value, storeyId);

const landing = model.addSlab({
  length: 1500,
  width: 1500,
  thickness: 180,
  origin: [1000, -1500, RISE - 180],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  predefinedType: 'LANDING',
  materialName: 'Concrete',
});
if (!landing.ok) throw landing.error;
model.placeIn(landing.value, storeyId);

// A posted guardrail along the open edge of the ramp run.
const rail = model.addRailing({
  length: RUN,
  height: 1100,
  thickness: 60,
  origin: [1000, -RUN, RISE - 180],
  axisX: [0, 1, 0],
  axisZ: [0, 0, 1],
  predefinedType: 'GUARDRAIL',
  infill: 'POSTED',
  materialName: 'Steel',
});
if (!rail.ok) throw rail.error;
model.placeIn(rail.value, storeyId);

console.log('ramp: rise ' + RISE + ' mm over ' + RUN + ' mm run (1:15), landing 1500 mm deep');
for (const c of model.getCoverings()) {
  const spec = c.spec as { predefinedType?: string; materialName: string; thickness: number };
  console.log(
    '  ' + (spec.predefinedType ?? 'COVERING').padEnd(10) + spec.materialName.padEnd(22) + spec.thickness + ' mm'
  );
}

// Playground runtime owns the displayed geometry for this eval.
const tint = (cat: string, spec: unknown): string => {
  if (cat === 'COVERING') {
    const t = (spec as { predefinedType?: string }).predefinedType;
    if (t === 'FLOORING') return '#a9743f';
    if (t === 'CEILING') return '#e8e4dc';
    return '#7d8b8f';
  }
  if (cat === 'RAILING') return '#8a99ad';
  if (cat === 'RAMP') return '#b9b2a6';
  return '#cfcabb';
};
const shown = model
  .getAllElements()
  .flatMap((el) => unwrap(placedSolids(el)).map((solid) => color(solid, tint(el.category, el.spec))));

export default present(shown, {
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
  {
    id: 'bim-datacenter',
    label: 'Datacenter Hall',
    description:
      'A data hall designed on the 600mm tile grid: four rows of 42U racks on the metric 8-tile pitch with hot-aisle containment, a fully perforated cold-aisle floor over a raised-floor plenum, six CRAH units sized N+1, and A+B power down redundant 250A overhead busway. Every element carries datacenter psets (including the IFC class a native writer would use) and lands in a zone or system; the console runs the capacity checks a design review would, and the Files button saves the validated IFC plus the equipment schedule.',
    code: `import { BimModel, countBySeverity, placedSolids, toIfcValidated } from 'brepjs-bim';
import { box, unwrap } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';

// A data hall laid out the way one is actually designed: on the tile grid.
// Hot-aisle containment, N+1 CRAH cooling, A+B power. The console panel runs
// the capacity checks a design review would; Files saves the IFC + schedule.
const model = new BimModel();
model.init({
  name: 'Data Hall 1',
  projectId: 'dc-hall-demo',
  crs: { name: 'EPSG:25832', eastings: 691000, northings: 5335000 },
});

const project = model.getProject();
const siteId = unwrap(model.addSite({ name: 'Campus' }));
const buildingId = unwrap(model.addBuilding({ name: 'DC1' }));
const storeyId = unwrap(model.addStorey({ name: 'Data Hall Level', elevation: 0 }));
if (project) model.aggregate(project.localId, siteId);
model.aggregate(siteId, buildingId);
model.aggregate(buildingId, storeyId);

// Design constants. The metric 8-tile pitch closes exactly: 1200 cold aisle +
// 1200 rack + 1200 hot aisle + 1200 rack (the imperial 7-tile pitch needs
// 610 mm tiles). Cold aisle 1.2 m is TIA-942's preferable front clearance.
const TILE = 600; // raised-floor module (24 in grid)
const RF = 600; // raised-floor height: full-depth underfloor supply plenum
const RACK = { w: 600, d: 1200, h: 1991, kW: 8 }; // 42U cabinet; ~8 kW is today's modal density
const ROWS = 4;
const PER_ROW = 10;
const AISLE = 2 * TILE; // cold and hot aisles both two tiles
const BAND = 2 * TILE; // a rack row: 1200 mm deep rack fills its band exactly
const END = 3 * TILE; // service zone at each row end: CRAH + egress clearance
const ROW_LEN = (PER_ROW + 2) * TILE; // 10 racks + a remote power panel at each end
const HALL_X = END + ROW_LEN + END; // 10.8 m — 18 tiles
const HALL_Y = (2 * ROWS + 1) * BAND; // 10.8 m — 4 rack bands + 5 aisles

const ITLOAD_KW = ROWS * PER_ROW * RACK.kW;
const CRAH = { kW: 74.6, airM3h: 15000, w: 2050, d: 890, h: 1970 }; // chilled-water downflow class
const RPP_KVA = 150; // row-end panel; each feed alone carries its row (80 kW at 0.9 pf)
const BUS_A = 250; // track busway, 415 V 3-phase, A + B runs per row

// Structural slab, then the access floor 600 above it.
const base = unwrap(model.addSlab({
  length: HALL_X, width: HALL_Y, thickness: 250, origin: [0, 0, -250],
  axisX: [1, 0, 0], axisZ: [0, 0, 1], predefinedType: 'BASESLAB', materialName: 'Concrete',
}));
model.placeIn(base, storeyId);
const raised = unwrap(model.addSlab({
  length: HALL_X, width: HALL_Y, thickness: 35, origin: [0, 0, RF - 35],
  axisX: [1, 0, 0], axisZ: [0, 0, 1], predefinedType: 'FLOOR', materialName: 'Raised access floor',
}));
model.placeIn(raised, storeyId);

// Two of the four hall walls, so the interior stays readable in the viewer.
const WALL_H = 4400;
for (const d of [
  { origin: [0, HALL_Y, 0] as [number, number, number], axisX: [1, 0, 0] as [number, number, number], len: HALL_X },
  { origin: [HALL_X, 0, 0] as [number, number, number], axisX: [0, 1, 0] as [number, number, number], len: HALL_Y },
]) {
  const wall = unwrap(model.addWall({
    length: d.len, height: WALL_H, thickness: 200,
    origin: d.origin, axisX: d.axisX, axisZ: [0, 0, 1], materialName: 'Concrete',
  }));
  model.placeIn(wall, storeyId);
}

// Y bands, 2 tiles each: cold | row | hot | row | cold | row | hot | row | cold.
// Rows alternate facing (TIA-942), so back-to-back pairs share the contained
// hot aisles and every front breathes from a cold aisle.
const bandY = (i: number) => i * BAND;
const rowBand = (r: number) => bandY(2 * r + 1);
const facesUp = (r: number) => r % 2 === 1; // rows A,C front -y; rows B,D front +y
const seq = (n: number) => Array.from({ length: n }, (_, i) => i);
const rowMidX = END + ROW_LEN / 2;

const addEquip = (
  name: string, solid: ReturnType<typeof box>, material: string,
  psets: Record<string, Record<string, string | number | boolean>>
) => {
  const id = unwrap(model.addProxy({ name, solid, materialName: material, customProperties: psets }));
  model.placeIn(id, storeyId);
  return id;
};

// Racks: row letter + position, dual-corded to the row's A and B feeds. The
// pset records the IFC class a native writer would use for each element.
const racks = seq(ROWS).flatMap((r) => seq(PER_ROW).map((j) => {
  const tag = 'ABCD'[r] + String(j + 1).padStart(2, '0');
  const cx = END + TILE * (1 + j) + TILE / 2;
  const id = addEquip(
    'Rack ' + tag,
    box(RACK.w, RACK.d, RACK.h, { at: [cx, rowBand(r) + BAND / 2, RF + RACK.h / 2] }),
    'Steel, powder coated',
    { DC_Rack: { tag, ifcClass: 'IfcFurniture/TECHNICALCABINET', uHeight: 42,
      designLoadKW: RACK.kW, feedA: 'RPP-0' + (r + 1) + 'A', feedB: 'RPP-0' + (r + 1) + 'B' } }
  );
  return { tag, id };
}));

// Cold aisles get a fully perforated floor: at 8 kW/rack the one-tile-per-rack
// rule of thumb is long broken (a 25%-open tile carries 400-600 CFM, ~3 kW).
// Tiles sit 3 mm proud of the floor plane so they read in the viewer.
const tileIds = [0, 4, 8].flatMap((band) =>
  seq(2 * (PER_ROW + 2)).map((p) => {
    const t = unwrap(model.addCovering({
      length: TILE, width: TILE, thickness: 35,
      origin: [END + TILE * (p % (PER_ROW + 2)), bandY(band) + TILE * Math.floor(p / (PER_ROW + 2)), RF - 32],
      axisX: [1, 0, 0], axisZ: [0, 0, 1], predefinedType: 'FLOORING',
      materialName: 'Perforated tile, 25% open',
    }));
    model.placeIn(t, storeyId);
    return t;
  }));

// Remote power panels close each row: one floor tile of footprint (ASHRAE
// TC9.9), A feed at the east end, B at the west, so either feed alone carries
// the row when the other is down. Front faces align with the rack fronts.
const rpps = seq(ROWS).flatMap((r) =>
  ([['B', END], ['A', END + ROW_LEN - TILE]] as const).map(([feed, x0]) => {
    const tag = 'RPP-0' + (r + 1) + feed;
    const cy = rowBand(r) + (facesUp(r) ? BAND - TILE / 2 : TILE / 2);
    const id = addEquip(
      tag, box(TILE, TILE, 2000, { at: [x0 + TILE / 2, cy, RF + 1000] }),
      'Steel, light grey',
      { DC_RPP: { tag, ifcClass: 'IfcElectricDistributionBoard', ratedKVA: RPP_KVA,
        feed, sourceUPS: 'UPS-' + feed } }
    );
    return { tag, feed, id };
  }));

// Perimeter CRAHs on the row-end walls, discharging into the floor plenum.
// N+1 sizing: five 74.6 kW units carry the 320 kW load, the sixth is spare.
const crahs = [CRAH.d / 2 + 50, HALL_X - CRAH.d / 2 - 50].flatMap((cx, side) =>
  [bandY(2), bandY(4), bandY(6)].map((y0, k) => {
    const tag = 'CRAH-0' + (side * 3 + k + 1);
    const id = addEquip(
      tag, box(CRAH.d, CRAH.w, CRAH.h, { at: [cx, y0 + BAND / 2, RF + CRAH.h / 2] }),
      'Galvanized steel',
      { DC_CRAH: { tag, ifcClass: 'IfcUnitaryEquipment/AIRHANDLER',
        sensibleCoolingKW: CRAH.kW, airflowM3h: CRAH.airM3h, coil: 'Chilled water' } }
    );
    return { tag, id };
  }));

// Overhead, working up from the TIA-942 2.6 m clear-height floor: cabling
// tray at 2.7 m over each row, then the A and B busway runs at 3.2 m.
const trayIds = seq(ROWS).map((r) => addEquip(
  'CT-' + 'ABCD'[r] + '-01',
  box(ROW_LEN, 450, 100, { at: [rowMidX, rowBand(r) + BAND / 2, RF + 2750] }),
  'Galvanized steel',
  { DC_Tray: { tag: 'CT-' + 'ABCD'[r] + '-01', ifcClass: 'IfcCableCarrierSegment/CABLETRAYSEGMENT',
    widthMm: 450, service: 'Structured cabling' } }
));
const buses = seq(ROWS).flatMap((r) =>
  ([['A', 350], ['B', -350]] as const).map(([feed, off]) => {
    const tag = 'BB-' + 'ABCD'[r] + '-' + feed;
    const id = addEquip(
      tag, box(ROW_LEN, 160, 150, { at: [rowMidX, rowBand(r) + BAND / 2 + off, RF + 3275] }),
      'Aluminium busway',
      { DC_Busway: { tag, ifcClass: 'IfcCableSegment/BUSBARSEGMENT',
        ratedA: BUS_A, voltageV: 415, feed } }
    );
    return { tag, feed, id };
  }));

// Hot-aisle containment: roof panels at rack-top height plus a door at each
// row end. The cold aisles stay open — the room itself is the cold plenum.
const hacIds = [bandY(2), bandY(6)].flatMap((y0, k) => {
  const tag = 'HAC-' + (k + 1);
  const roof = addEquip(
    tag + ' roof',
    box(ROW_LEN, AISLE, 40, { at: [rowMidX, y0 + AISLE / 2, RF + RACK.h + 20] }),
    'Polycarbonate panel',
    { DC_Containment: { tag, ifcClass: 'IfcPlate', scheme: 'Hot aisle' } }
  );
  const doors = [20, ROW_LEN - 20].map((dx) => addEquip(
    tag + ' door',
    box(40, AISLE, RACK.h, { at: [END + dx, y0 + AISLE / 2, RF + RACK.h / 2] }),
    'Polycarbonate panel',
    { DC_Containment: { tag, ifcClass: 'IfcDoor', scheme: 'Hot aisle', part: 'End door' } }
  ));
  return [roof, ...doors];
});

// Aisles as IfcSpaces (not displayed), named by the rows that bound them and
// grouped into zones; equipment grouped into the systems that serve it.
const aisleSpace = (name: string, longName: string, y0: number, h: number) => {
  const s = unwrap(model.addSpace({
    name, length: ROW_LEN, width: AISLE, height: h, origin: [END, y0, RF],
    axisX: [1, 0, 0], axisZ: [0, 0, 1], materialName: 'Air',
  }));
  model.placeIn(s, storeyId);
  return s;
};
const coldSpaces = [
  aisleSpace('CA-A', 'Cold aisle, row A front', bandY(0), WALL_H - RF),
  aisleSpace('CA-BC', 'Cold aisle between rows B and C', bandY(4), WALL_H - RF),
  aisleSpace('CA-D', 'Cold aisle, row D front', bandY(8), WALL_H - RF),
];
const hotSpaces = [
  aisleSpace('HA-AB', 'Contained hot aisle between rows A and B', bandY(2), RACK.h),
  aisleSpace('HA-CD', 'Contained hot aisle between rows C and D', bandY(6), RACK.h),
];

model.assignToGroup(unwrap(model.addZone({ name: 'Cold Aisles', longName: 'Supply air zone' })), coldSpaces);
model.assignToGroup(unwrap(model.addZone({ name: 'Hot Aisles', longName: 'Return air zone' })), hotSpaces);
const feedIds = (feed: string) => [...rpps, ...buses].filter((e) => e.feed === feed).map((e) => e.id);
model.assignToGroup(unwrap(model.addSystem({ name: 'Critical Power A' })), feedIds('A'));
model.assignToGroup(unwrap(model.addSystem({ name: 'Critical Power B' })), feedIds('B'));
model.assignToGroup(unwrap(model.addSystem({ name: 'Air Cooling' })),
  [...crahs.map((c) => c.id), ...tileIds, ...hacIds]);
model.assignToGroup(unwrap(model.addSystem({ name: 'Structured Cabling' })), trayIds);
model.assignToGroup(unwrap(model.addSystem({ name: 'IT Equipment' })), racks.map((r) => r.id));

// The checks a design review actually runs, computed off the model. dT 15 K
// is the containment dividend: no bypass air, supply stays in the ASHRAE
// 18-27 C inlet envelope while the return runs hot.
const firmKW = (crahs.length - 1) * CRAH.kW;
const dT = 15;
const reqAirM3h = (ITLOAD_KW * 3600) / (1.2 * 1.005 * dT); // Q = P / (rho cp dT)
const firmAirM3h = (crahs.length - 1) * CRAH.airM3h;
const perTileM3h = reqAirM3h / tileIds.length;
const rowAmps = (PER_ROW * RACK.kW * 1000) / 0.9 / (415 * Math.sqrt(3));
const busContA = 0.8 * BUS_A; // 80% continuous rating
const verdict = (okQ: boolean) => (okQ ? ' — ok' : ' — SHORT');
console.log('IT load   ' + racks.length + ' racks x ' + RACK.kW + ' kW = ' + ITLOAD_KW + ' kW');
console.log('cooling   N+1: ' + (crahs.length - 1) + ' of ' + crahs.length + ' CRAH x ' + CRAH.kW +
  ' kW = ' + Math.round(firmKW) + ' kW vs ' + ITLOAD_KW + ' kW' + verdict(firmKW >= ITLOAD_KW));
console.log('airflow   N+1 ' + Math.round(firmAirM3h) + ' m3/h vs ' + Math.round(reqAirM3h) +
  ' m3/h at dT ' + dT + ' K' + verdict(firmAirM3h >= reqAirM3h));
console.log('tiles     ' + tileIds.length + ' perforated, ' + Math.round(perTileM3h) +
  ' m3/h each vs 680-1020 (400-600 CFM) band' + verdict(perTileM3h >= 680 && perTileM3h <= 1020));
console.log('power     row ' + Math.round(rowAmps) + ' A at 0.9 pf vs ' + busContA +
  ' A continuous on each ' + BUS_A + ' A feed' + verdict(rowAmps <= busContA));

const exported = await toIfcValidated(model, {
  applicationName: 'brepjs playground', applicationVersion: '1.0',
});
if (!exported.ok) throw exported.error;
const sev = countBySeverity(exported.value.report);
console.log('IFC4      ' + sev.error + ' errors, ' + sev.warning + ' warnings, ' + sev.info + ' info');

// Equipment schedule the FM team gets on handover.
const schedule = [['Tag', 'Type', 'Rating', 'Feed'].join(',')];
for (const r of racks) schedule.push(r.tag + ',Rack 42U,' + RACK.kW + ' kW,A+B');
for (const p of rpps) schedule.push(p.tag + ',Remote power panel,' + RPP_KVA + ' kVA,' + p.feed);
for (const c of crahs) schedule.push(c.tag + ',CRAH,' + CRAH.kW + ' kW sensible,N+1');
for (const b of buses) schedule.push(b.tag + ',Track busway,' + BUS_A + ' A 415 V,' + b.feed);

// Playground runtime owns the displayed geometry for this eval.
const PALETTE: Record<string, string> = {
  Concrete: '#c9c4b8', 'Raised access floor': '#c4bfb5', 'Perforated tile, 25% open': '#4f5c73',
  'Steel, powder coated': '#454c56', 'Steel, light grey': '#8b9199', 'Galvanized steel': '#9aa3ab',
  'Polycarbonate panel': '#d9a441',
};
const FEED_TINT: Record<string, string> = { A: '#b5443c', B: '#3c66b5' };
const busFeed = new Map(buses.map((b) => [b.id, b.feed]));
const shown = model.getAllElements().flatMap((el) => {
  if (el.category === 'SPACE') return []; // aisle volumes would hide the hall
  const mat = (el.spec as { materialName?: string }).materialName ?? '';
  const feed = busFeed.get(el.localId);
  const css = feed ? FEED_TINT[feed] : (PALETTE[mat] ?? '#8b8b8b');
  return unwrap(placedSolids(el)).map((s) => color(s, css));
});

// Display-only dressing the viewer needs but the model does not: a proud
// front door per rack and a tap-off drop from each busway run every third
// rack. The BIM model stays one element per asset.
const doors = seq(ROWS).flatMap((r) => seq(PER_ROW).map((j) => {
  const cx = END + TILE * (1 + j) + TILE / 2;
  const yFront = rowBand(r) + BAND / 2 + (facesUp(r) ? 1 : -1) * (RACK.d / 2 + 15);
  return color(box(RACK.w - 100, 30, RACK.h - 160, { at: [cx, yFront, RF + RACK.h / 2] }), '#5f6774');
}));
const DROP_H = 3275 - 75 - RACK.h; // busway underside down to the rack top
const drops = seq(ROWS).flatMap((r) =>
  ([['A', 350], ['B', -350]] as const).flatMap(([feed, off]) =>
    [0, 3, 6, 9].map((j) => color(
      box(60, 60, DROP_H, {
        at: [END + TILE * (1 + j) + TILE / 2, rowBand(r) + BAND / 2 + off, RF + RACK.h + DROP_H / 2],
      }),
      FEED_TINT[feed]
    ))));

export default present([...shown, ...doors, ...drops], {
  bimTree: model.toTreeSummary(),
  ifc: () => exported.value.bytes,
  files: () => [{ name: 'equipment-schedule.csv', data: schedule.join(String.fromCharCode(10)), mime: 'text/csv' }],
});
`,
  },
];
