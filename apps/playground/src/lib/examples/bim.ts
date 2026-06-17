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
      'A parametric structural-steel wide-flange (I-beam) authored through a BimModel. The element carries a brepjs solid for display and the model serializes to IFC.',
    code: `import { BimModel } from 'brepjs-bim';

// A parametric structural-steel I-beam (wide-flange section), authored through
// the BIM model rather than as raw geometry. The element carries a brepjs solid
// (shown here); the same model serializes to a real IFC file via toIfc(model).
// Tune the length and the I_BEAM section dimensions.
const model = new BimModel();
model.init({ name: 'Beam example' });

const beam = model.addBeam({
  length: 1500,
  profile: {
    kind: 'I_BEAM',
    overallWidth: 150,
    overallDepth: 300,
    flangeThickness: 12,
    webThickness: 8,
  },
  origin: [0, 0, 0],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  materialName: 'Steel',
});
if (!beam.ok) throw beam.error;

export default model.getBeams()[0].geometry;
`,
  },
  {
    id: 'bim-wall-openings',
    label: 'Wall with Openings',
    description:
      'A parametric wall hosting a door and a window. Each opening is a real IFC void boolean-cut into the wall solid — the textbook BIM "hello world".',
    code: `import { BimModel } from 'brepjs-bim';

// A parametric wall hosting a door and a window. Each opening is a real IFC
// void that is boolean-cut into the wall solid (and emitted as IfcOpeningElement
// + IfcDoor/IfcWindow on export). Tune the wall size and opening placements.
const model = new BimModel();
model.init({ name: 'Wall with openings' });

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

const door = model.addDoor({
  wallLocalId: wall.value,
  width: 900,
  height: 2000,
  offsetAlongWall: 400,
  offsetFromFloor: 0,
  materialName: 'Timber',
});
if (!door.ok) throw door.error;

const win = model.addWindow({
  wallLocalId: wall.value,
  width: 1200,
  height: 1000,
  offsetAlongWall: 1600,
  offsetFromFloor: 900,
  materialName: 'Aluminium',
});
if (!win.ok) throw win.error;

// The wall solid now carries both openings (the door/window cut it).
export default model.getWalls()[0].geometry;
`,
  },
  {
    id: 'bim-curtain-wall',
    label: 'Curtain Wall',
    description:
      'A parametric curtain-wall facade — a grid of glazing panels framed by vertical and horizontal mullions, each placed from its IFC local origin.',
    code: `import { BimModel } from 'brepjs-bim';
import { translate } from 'brepjs/quick';

// A parametric curtain wall: a columns x rows grid of glazing panels framed by
// mullions. The model returns each panel and mullion as a local-origin solid
// plus its placement origin; we translate each into place and show them all.
const model = new BimModel();
model.init({ name: 'Curtain wall' });

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

const grid = model.getCurtainWalls()[0].geometry;
const parts = [...grid.panels, ...grid.mullions].map((c) => translate(c.solid, c.origin));

export default parts;
`,
  },
];
