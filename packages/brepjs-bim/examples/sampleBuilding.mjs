// Authors a small but representative IFC4 building with brepjs-bim and writes it
// to examples/sample-building.ifc. The output is the fixture validated by an
// independent toolchain (IfcOpenShell) in scripts/validateIfc.py — see
// VALIDATION.md. Run: `node examples/sampleBuilding.mjs`.
//
// Importing 'brepjs/quick' initialises the OCCT-WASM kernel (top-level await)
// before any geometry is built; brepjs-bim shares that same kernel singleton.
import 'brepjs/quick';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { BimModel, toIfcValidated } from 'brepjs-bim';

const outFile = resolve(dirname(fileURLToPath(import.meta.url)), 'sample-building.ifc');

function expect(result, label) {
  if (result && result.ok === false) {
    throw new Error(`${label} failed: ${result.error?.code ?? ''} ${result.error?.message ?? result.error}`);
  }
  return result && 'value' in result ? result.value : result;
}

const model = new BimModel();
model.init({ name: 'brepjs-bim Sample Office' });

// Spatial structure: project → site → building → two storeys.
const project = model.getProject();
const siteId = model.addSite({ name: 'Riverside Plot' });
const buildingId = model.addBuilding({ name: 'Office Block A' });
const groundId = model.addStorey({ name: 'Ground Floor', elevation: 0 });
const firstId = model.addStorey({ name: 'First Floor', elevation: 3200 });
if (project) model.aggregate(project.localId, siteId);
model.aggregate(siteId, buildingId);
model.aggregate(buildingId, groundId);
model.aggregate(buildingId, firstId);

// A 6 m × 4 m room on the ground floor: four perimeter walls.
const L = 6000;
const W = 4000;
const H = 3000;
const T = 200;
const wallDefs = [
  { origin: [0, 0, 0], axisX: [1, 0, 0], length: L, external: true },
  { origin: [L, 0, 0], axisX: [0, 1, 0], length: W, external: true },
  { origin: [L, W, 0], axisX: [-1, 0, 0], length: L, external: true },
  { origin: [0, W, 0], axisX: [0, -1, 0], length: W, external: true },
];
const wallIds = wallDefs.map((d, i) =>
  expect(
    model.addWall({
      length: d.length,
      height: H,
      thickness: T,
      origin: d.origin,
      axisX: d.axisX,
      axisZ: [0, 0, 1],
      materialName: 'Concrete',
      isExternal: d.external,
      loadBearing: true,
      fireRating: 'REI 120',
    }),
    `addWall[${i}]`,
  ),
);
for (const id of wallIds) model.placeIn(id, groundId);

// A window in the front wall and a door in the side wall.
const windowId = expect(
  model.addWindow({
    width: 1500,
    height: 1200,
    offsetAlongWall: 2250,
    offsetFromFloor: 900,
    wallLocalId: wallIds[0],
    materialName: 'Aluminium + Glazing',
    isExternal: true,
    thermalTransmittance: 1.4,
  }),
  'addWindow',
);
const doorId = expect(
  model.addDoor({
    width: 1000,
    height: 2100,
    offsetAlongWall: 1500,
    offsetFromFloor: 0,
    wallLocalId: wallIds[1],
    materialName: 'Timber',
    isExternal: true,
    fireRating: 'EI 60',
  }),
  'addDoor',
);
model.placeIn(windowId, groundId);
model.placeIn(doorId, groundId);

// Floor slab + first-floor slab.
const slabGround = expect(
  model.addSlab({
    length: L,
    width: W,
    thickness: 250,
    origin: [0, 0, -250],
    axisX: [1, 0, 0],
    axisZ: [0, 0, 1],
    predefinedType: 'FLOOR',
    materialName: 'Concrete',
    isExternal: false,
    loadBearing: true,
  }),
  'addSlab[ground]',
);
model.placeIn(slabGround, groundId);
const slabFirst = expect(
  model.addSlab({
    length: L,
    width: W,
    thickness: 250,
    origin: [0, 0, H],
    axisX: [1, 0, 0],
    axisZ: [0, 0, 1],
    predefinedType: 'FLOOR',
    materialName: 'Concrete',
    loadBearing: true,
  }),
  'addSlab[first]',
);
model.placeIn(slabFirst, firstId);

// Two structural columns.
for (const [cx, cy] of [
  [1000, 1000],
  [L - 1000, W - 1000],
]) {
  const col = expect(
    model.addColumn({
      height: H,
      profile: { kind: 'RECTANGULAR', width: 300, height: 300 },
      origin: [cx, cy, 0],
      axisX: [1, 0, 0],
      axisZ: [0, 0, 1],
      materialName: 'Steel',
      loadBearing: true,
    }),
    'addColumn',
  );
  model.placeIn(col, groundId);
}

// Uniclass classification on the external walls.
model.addClassification(
  {
    system: 'Uniclass 2015',
    code: 'EF_25_10',
    name: 'Walls',
  },
  wallIds,
);

const result = await toIfcValidated(model, {
  applicationName: 'brepjs-bim',
  applicationVersion: '0.1.0',
  organizationName: 'brepjs',
  author: { givenName: 'Andy', familyName: 'Aragon' },
  ifcSchema: 'IFC4',
  mvdViewDefinition: 'CoordinationView',
});

if (!result.ok) {
  const detail = Array.isArray(result.error.cause)
    ? '\n' + result.error.cause.map((d) => `  - ${d.code}: ${d.message}`).join('\n')
    : '';
  throw new Error(`toIfcValidated failed: ${result.error.code} ${result.error.message}${detail}`);
}

const { bytes, report } = result.value;
await writeFile(outFile, bytes);

const errors = report.issues.filter((i) => i.severity === 'error');
const warnings = report.issues.filter((i) => i.severity === 'warning');
console.log(`Wrote ${outFile} (${bytes.byteLength} bytes)`);
console.log(`Internal self-validation: ${errors.length} errors, ${warnings.length} warnings`);
for (const i of report.issues) console.log(`  [${i.severity}] ${i.code}: ${i.message}`);
if (errors.length > 0) process.exitCode = 1;
