// Authors the external-interop validation fixture and writes it to
// examples/interop-fixture.ifc. Where sample-building.ifc is the friendly
// baseline, this file concentrates the geometry kinds most likely to break in
// desktop tools: shaped roofs (gable / hip / dome, tessellated bodies), a
// curtain-wall panel grid, a two-flight stair, a posted railing, and profiled
// columns and beams (circular + I-shape). Validate with
// `python scripts/validateIfc.py examples/interop-fixture.ifc` and the
// checklist in VALIDATION.md. Run: `node examples/interopFixture.mjs`.
import 'brepjs/quick';
import { unwrap } from 'brepjs';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { BimModel, toIfcValidated } from 'brepjs-bim';

const outFile = resolve(dirname(fileURLToPath(import.meta.url)), 'interop-fixture.ifc');

function expect(result, label) {
  if (result && result.ok === false) {
    throw new Error(
      `${label} failed: ${result.error?.code ?? ''} ${result.error?.message ?? result.error}`
    );
  }
  return result && 'value' in result ? result.value : result;
}

const model = new BimModel();
model.init({ name: 'brepjs-bim Interop Fixture' });

const project = model.getProject();
const siteId = unwrap(model.addSite({ name: 'Interop Site' }));
const buildingId = unwrap(model.addBuilding({ name: 'Interop Pavilion' }));
const groundId = unwrap(model.addStorey({ name: 'Ground', elevation: 0 }));
if (project) model.aggregate(project.localId, siteId);
model.aggregate(siteId, buildingId);
model.aggregate(buildingId, groundId);

const L = 9000;
const W = 6000;
const H = 3000;
const T = 200;
const Z = [0, 0, 1];

// Perimeter: three solid walls plus a curtain-wall south facade.
const walls = [
  { origin: [0, 0, 0], axisX: [0, 1, 0], length: W },
  { origin: [0, W, 0], axisX: [1, 0, 0], length: L },
  { origin: [L, W, 0], axisX: [0, -1, 0], length: W },
];
const wallIds = walls.map((d, i) =>
  expect(
    model.addWall({
      length: d.length,
      height: H,
      thickness: T,
      origin: d.origin,
      axisX: d.axisX,
      axisZ: Z,
      materialName: 'Concrete',
      isExternal: true,
      loadBearing: true,
      fireRating: 'REI 120',
    }),
    `wall ${i}`
  )
);
wallIds.forEach((id) => model.placeIn(id, groundId));

const door = expect(
  model.addDoor({
    wallLocalId: wallIds[1],
    offsetAlongWall: 1200,
    offsetFromFloor: 0,
    width: 1000,
    height: 2100,
    materialName: 'Timber',
  }),
  'door'
);
const window = expect(
  model.addWindow({
    wallLocalId: wallIds[1],
    offsetAlongWall: 5000,
    offsetFromFloor: 900,
    width: 1600,
    height: 1200,
    materialName: 'Aluminium',
  }),
  'window'
);
[door, window].forEach((id) => model.placeIn(id, groundId));

const curtain = expect(
  model.addCurtainWall({
    width: L,
    height: H,
    columns: 6,
    rows: 2,
    panelThickness: 30,
    mullionWidth: 60,
    mullionDepth: 120,
    origin: [0, 0, 0],
    axisX: [1, 0, 0],
    axisZ: Z,
    materialName: 'Aluminium',
    panelMaterialName: 'Glass',
    isExternal: true,
  }),
  'curtain wall'
);
model.placeIn(curtain, groundId);

const slab = expect(
  model.addSlab({
    length: L,
    width: W,
    thickness: 250,
    origin: [0, 0, -250],
    axisX: [1, 0, 0],
    axisZ: Z,
    materialName: 'Concrete',
    predefinedType: 'BASESLAB',
    loadBearing: true,
  }),
  'base slab'
);
model.placeIn(slab, groundId);

// Profiled structure: circular and I-shape columns, an I-shape beam.
const roundCol = expect(
  model.addColumn({
    height: H,
    profile: { kind: 'CIRCULAR', radius: 150 },
    origin: [3000, 3000, 0],
    axisX: [1, 0, 0],
    axisZ: Z,
    materialName: 'Concrete',
    loadBearing: true,
  }),
  'circular column'
);
const iCol = expect(
  model.addColumn({
    height: H,
    profile: {
      kind: 'I_BEAM',
      overallWidth: 200,
      overallDepth: 200,
      flangeThickness: 12,
      webThickness: 8,
      filletRadius: 10,
    },
    origin: [6000, 3000, 0],
    axisX: [1, 0, 0],
    axisZ: Z,
    materialName: 'Steel',
    loadBearing: true,
  }),
  'I column'
);
const beam = expect(
  model.addBeam({
    length: 3000,
    profile: {
      kind: 'I_BEAM',
      overallWidth: 180,
      overallDepth: 360,
      flangeThickness: 12.8,
      webThickness: 8.6,
      filletRadius: 12,
    },
    origin: [3000, 3000, H],
    axisX: [1, 0, 0],
    axisZ: Z,
    materialName: 'Steel',
    loadBearing: true,
  }),
  'I beam'
);
[roundCol, iCol, beam].forEach((id) => model.placeIn(id, groundId));

// Shaped roofs: gable over the west half, hip over the east half, a small dome
// crown. All three serialize as tessellated bodies.
const gable = expect(
  model.addRoof({
    length: 4500,
    width: W,
    thickness: 200,
    origin: [0, 0, H],
    axisX: [1, 0, 0],
    axisZ: Z,
    materialName: 'Tile',
    predefinedType: 'GABLE_ROOF',
    pitch: 30,
    isExternal: true,
  }),
  'gable roof'
);
const hip = expect(
  model.addRoof({
    length: 4500,
    width: W,
    thickness: 200,
    origin: [4500, 0, H],
    axisX: [1, 0, 0],
    axisZ: Z,
    materialName: 'Tile',
    predefinedType: 'HIP_ROOF',
    pitch: 25,
    isExternal: true,
  }),
  'hip roof'
);
const dome = expect(
  model.addRoof({
    length: 2000,
    width: 2000,
    thickness: 100,
    origin: [3500, 2000, H + 2600],
    axisX: [1, 0, 0],
    axisZ: Z,
    materialName: 'Copper',
    predefinedType: 'DOME_ROOF',
    pitch: 45,
    isExternal: true,
  }),
  'dome roof'
);
[gable, hip, dome].forEach((id) => model.placeIn(id, groundId));

// A two-flight return stair and a posted railing beside it.
const stair = expect(
  model.addStair({
    name: 'Main Stair',
    predefinedType: 'HALF_TURN_STAIR',
    materialName: 'Concrete',
    flights: [
      {
        width: 1200,
        riserHeight: 175,
        treadLength: 280,
        numberOfRisers: 9,
        origin: [500, 500, 0],
        axisX: [1, 0, 0],
        axisZ: Z,
        materialName: 'Concrete',
      },
      {
        width: 1200,
        riserHeight: 175,
        treadLength: 280,
        numberOfRisers: 8,
        origin: [500 + 9 * 280, 500 + 1400, 9 * 175],
        axisX: [-1, 0, 0],
        axisZ: Z,
        materialName: 'Concrete',
      },
    ],
  }),
  'stair'
);
model.placeIn(stair, groundId);

const railing = expect(
  model.addRailing({
    length: 2500,
    height: 1000,
    thickness: 50,
    origin: [500, 2200, 0],
    axisX: [1, 0, 0],
    axisZ: Z,
    materialName: 'Steel',
    infill: 'POSTED',
    predefinedType: 'GUARDRAIL',
  }),
  'railing'
);
model.placeIn(railing, groundId);

const validated = expect(
  await toIfcValidated(model, {
    applicationName: 'brepjs-bim-interop-fixture',
    applicationVersion: '1',
    organizationName: 'brepjs',
  }),
  'toIfcValidated'
);
const errors = validated.report.issues.filter((i) => i.severity === 'error');
if (errors.length > 0) {
  throw new Error(
    `validation errors:\n${errors.map((i) => `- ${i.code}: ${i.message}`).join('\n')}`
  );
}
await writeFile(outFile, validated.bytes);
console.error(`wrote ${outFile} (${validated.bytes.length} bytes, ${errors.length} errors)`);
model[Symbol.dispose]();
