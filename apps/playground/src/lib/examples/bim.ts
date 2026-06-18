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
      'A single-bay structural steel frame — four I-section columns, perimeter beams, and a floor slab — grouped as an IfcElementAssembly in a real spatial structure. Each element is read back already placed via placedSolids(), so the view matches the IFC export. Tinted by material role.',
    code: `import { BimModel, placedSolids, toIfc } from 'brepjs-bim';
import { unwrap } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';

// Columns + perimeter beams + a floor slab, grouped as an IfcElementAssembly.
const model = new BimModel();
model.init({ name: 'Steel frame' });
const site = model.addSite({ name: 'Site' });
const building = model.addBuilding({ name: 'Building' });
const storey = model.addStorey({ name: 'Level 1', elevation: 0 });
const project = model.getProject();
if (project) model.aggregate(project.localId, site);
model.aggregate(site, building);
model.aggregate(building, storey);

const BAY = 4000, DEPTH = 3000, COL_H = 3500;
const section = { kind: 'I_BEAM', overallWidth: 150, overallDepth: 200, flangeThickness: 12, webThickness: 8 } as const;

for (const [x, y] of [[0, 0], [BAY, 0], [BAY, DEPTH], [0, DEPTH]] as [number, number][]) {
  const col = model.addColumn({ height: COL_H, profile: section, origin: [x, y, 0], axisX: [1, 0, 0], axisZ: [0, 0, 1], materialName: 'Steel' });
  if (!col.ok) throw col.error;
  model.placeIn(col.value, storey);
}
const beamDefs: { origin: [number, number, number]; axisX: [number, number, number]; len: number }[] = [
  { origin: [0, 0, COL_H], axisX: [1, 0, 0], len: BAY },
  { origin: [0, DEPTH, COL_H], axisX: [1, 0, 0], len: BAY },
  { origin: [0, 0, COL_H], axisX: [0, 1, 0], len: DEPTH },
  { origin: [BAY, 0, COL_H], axisX: [0, 1, 0], len: DEPTH },
];
for (const b of beamDefs) {
  const beam = model.addBeam({ length: b.len, profile: section, origin: b.origin, axisX: b.axisX, axisZ: [0, 0, 1], materialName: 'Steel' });
  if (!beam.ok) throw beam.error;
  model.placeIn(beam.value, storey);
}
const slab = model.addSlab({ length: BAY, width: DEPTH, thickness: 150, origin: [0, 0, COL_H + 200], axisX: [1, 0, 0], axisZ: [0, 0, 1], predefinedType: 'FLOOR', materialName: 'Concrete' });
if (!slab.ok) throw slab.error;
model.placeIn(slab.value, storey);

const assembly = model.addElementAssembly({ name: 'Frame' });
model.aggregate(assembly, slab.value);
for (const c of model.getColumns()) model.aggregate(assembly, c.localId);
for (const bm of model.getBeams()) model.aggregate(assembly, bm.localId);

// placedSolids returns a Result of fresh, caller-owned solids; here the playground
// runtime owns the displayed geometry for this eval, so the snippet doesn't dispose it.
const steel = [...model.getColumns(), ...model.getBeams()].flatMap((e) => unwrap(placedSolids(e))).map((s) => color(s, '#8a99ad'));
const deck = unwrap(placedSolids(model.getSlabs()[0])).map((s) => color(s, '#cfcabb'));

export default present([...steel, ...deck], {
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
      'A single-room building shell: pad footings, four walls with a door and window, a floor slab, a gable roof, and an IfcSpace for the room — organised in a full project → site → building → storey tree. Material-tinted; the IFC button exports a valid file.',
    code: `import { BimModel, placedSolids, toIfc } from 'brepjs-bim';
import { unwrap } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';

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
const slab = model.addSlab({ length: L, width: W, thickness: T, origin: [0, 0, -T], axisX: [1, 0, 0], axisZ: [0, 0, 1], predefinedType: 'FLOOR', materialName: 'Concrete' });
if (!slab.ok) throw slab.error;
model.placeIn(slab.value, storey);

for (const [x, y] of [[0, 0], [L, 0], [L, W], [0, W]] as [number, number][]) {
  const footing = model.addFooting({ length: 600, width: 600, thickness: 400, origin: [x - 300, y - 300, -T - 400], axisX: [1, 0, 0], axisZ: [0, 0, 1], predefinedType: 'PAD_FOOTING', materialName: 'Concrete' });
  if (!footing.ok) throw footing.error;
  model.placeIn(footing.value, storey);
}

const wallDefs: { origin: [number, number, number]; axisX: [number, number, number]; len: number }[] = [
  { origin: [0, 0, 0], axisX: [1, 0, 0], len: L },
  { origin: [0, W, 0], axisX: [1, 0, 0], len: L },
  { origin: [0, 0, 0], axisX: [0, 1, 0], len: W },
  { origin: [L, 0, 0], axisX: [0, 1, 0], len: W },
];
const wallIds = [];
for (const d of wallDefs) {
  const wall = model.addWall({ length: d.len, height: H, thickness: T, origin: d.origin, axisX: d.axisX, axisZ: [0, 0, 1], materialName: 'Concrete' });
  if (!wall.ok) throw wall.error;
  model.placeIn(wall.value, storey);
  wallIds.push(wall.value);
}
const door = model.addDoor({ wallLocalId: wallIds[0], width: 900, height: 2100, offsetAlongWall: 600, offsetFromFloor: 0, materialName: 'Timber' });
if (!door.ok) throw door.error;
model.placeIn(door.value, storey);
const win = model.addWindow({ wallLocalId: wallIds[0], width: 1500, height: 1200, offsetAlongWall: 2800, offsetFromFloor: 900, materialName: 'Aluminium' });
if (!win.ok) throw win.error;
model.placeIn(win.value, storey);

const roof = model.addRoof({ length: L, width: W, thickness: 150, origin: [0, 0, H], axisX: [1, 0, 0], axisZ: [0, 0, 1], predefinedType: 'GABLE_ROOF', pitch: 30, materialName: 'Tile' });
if (!roof.ok) throw roof.error;
model.placeIn(roof.value, storey);

const space = model.addSpace({ name: 'Room', length: L - 2 * T, width: W - 2 * T, height: H, origin: [T, T, 0], axisX: [1, 0, 0], axisZ: [0, 0, 1], materialName: 'Air' });
if (!space.ok) throw space.error;
model.placeIn(space.value, storey);

// placedSolids returns a Result of fresh, caller-owned solids; here the playground
// runtime owns the displayed geometry for this eval, so the snippet doesn't dispose it.
const concrete = [...model.getWalls(), ...model.getSlabs(), ...model.getFootings()].flatMap((e) => unwrap(placedSolids(e))).map((s) => color(s, '#cfcabb'));
const tile = unwrap(placedSolids(model.getRoofs()[0])).map((s) => color(s, '#9c6b52'));

export default present([...concrete, ...tile], {
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
      'A half-turn (switchback) stair: two straight flights at 180°, an intermediate landing slab, and a posted guardrail. The stair is an IFC assembly with no solid of its own — its flights are read back as placed solids via placedSolids().',
    code: `import { BimModel, placedSolids, toIfc } from 'brepjs-bim';
import { unwrap } from 'brepjs/quick';
import { present } from 'brepjs/playground';

const model = new BimModel();
model.init({ name: 'Stair core' });
const site = model.addSite({ name: 'Site' });
const building = model.addBuilding({ name: 'Building' });
const storey = model.addStorey({ name: 'Ground Floor', elevation: 0 });
const project = model.getProject();
if (project) model.aggregate(project.localId, site);
model.aggregate(site, building);
model.aggregate(building, storey);

const RISERS = 9, RH = 175, TL = 260, WIDTH = 1100;
const runLen = RISERS * TL, rise = RISERS * RH, LANDING_D = 1500;
const flightCommon = { width: WIDTH, riserHeight: RH, treadLength: TL, numberOfRisers: RISERS, axisZ: [0, 0, 1] as [number, number, number], materialName: 'Concrete' };
const stair = model.addStair({
  name: 'Stair',
  predefinedType: 'HALF_TURN_STAIR',
  // Flight 1 runs +X in lane y in [0, WIDTH]; flight 2 runs -X (axisX = -X flips its
  // width into -Y), so it occupies the ADJACENT lane y in [WIDTH, 2*WIDTH] — the two
  // flights sit side by side (total width 2*WIDTH), flight 2 starting at the landing's
  // far edge (runLen + LANDING_D) and climbing back over flight 1.
  flights: [
    { ...flightCommon, origin: [0, 0, 0], axisX: [1, 0, 0] },
    { ...flightCommon, origin: [runLen + LANDING_D, WIDTH * 2, rise], axisX: [-1, 0, 0] },
  ],
  materialName: 'Concrete',
});
if (!stair.ok) throw stair.error;
model.placeIn(stair.value, storey);

const landing = model.addSlab({ length: LANDING_D, width: WIDTH * 2, thickness: 200, origin: [runLen, 0, rise - 200], axisX: [1, 0, 0], axisZ: [0, 0, 1], predefinedType: 'LANDING', materialName: 'Concrete' });
if (!landing.ok) throw landing.error;
model.placeIn(landing.value, storey);

const rail = model.addRailing({ length: LANDING_D, height: 1000, thickness: 80, origin: [runLen, 0, rise], axisX: [1, 0, 0], axisZ: [0, 0, 1], predefinedType: 'GUARDRAIL', infill: 'POSTED', materialName: 'Steel' });
if (!rail.ok) throw rail.error;
model.placeIn(rail.value, storey);

// Displayed geometry is owned by the playground runtime for this eval; snippets don't dispose it.
const parts = [
  ...unwrap(placedSolids(model.getStairs()[0])),
  ...unwrap(placedSolids(model.getSlabs()[0])),
  ...unwrap(placedSolids(model.getRailings()[0])),
];

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
      'An IfcSpace — the room volume itself, a first-class spatial element — shown as a tinted solid inside its four neutral bounding walls (it rises just above the walls so the volume reads). Illustrates the pure-BIM “space” concept that has no equivalent in plain solid modelling.',
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
const wallDefs: { origin: [number, number, number]; axisX: [number, number, number]; len: number }[] = [
  { origin: [0, 0, 0], axisX: [1, 0, 0], len: L },
  { origin: [0, W, 0], axisX: [1, 0, 0], len: L },
  { origin: [0, 0, 0], axisX: [0, 1, 0], len: W },
  { origin: [L, 0, 0], axisX: [0, 1, 0], len: W },
];
for (const d of wallDefs) {
  const wall = model.addWall({ length: d.len, height: H, thickness: T, origin: d.origin, axisX: d.axisX, axisZ: [0, 0, 1], materialName: 'Concrete' });
  if (!wall.ok) throw wall.error;
  model.placeIn(wall.value, storey);
}
// Space rises 500mm above the walls so the volume is visible above the enclosure.
const space = model.addSpace({ name: 'Room', length: L - 2 * T, width: W - 2 * T, height: H + 500, origin: [T, T, 0], axisX: [1, 0, 0], axisZ: [0, 0, 1], materialName: 'Air' });
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
