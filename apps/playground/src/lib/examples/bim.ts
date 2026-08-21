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

// A severity summary is the useful read: errors block, warnings are advisory.
// A clean model still reports info-level findings, which is the point of a
// severity-tagged report rather than a boolean.
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
    code: `import { BimModel, fromIfc, toIfc } from 'brepjs-bim';
import { unwrap } from 'brepjs/quick';
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

// The imported solids, not the originals. Playground runtime owns them for this
// eval, so no disposeImportedModel() here; a real app calls it when done.
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
    ? [color(e.geometry.solid, PALETTE[e.category] ?? '#8a99ad')]
    : []
);

export default present(shown, {
  bimTree: model.toTreeSummary(),
  ifc: () => bytes,
});
`,
  },
];
