import { describe, it, expect, beforeAll } from 'vitest';
import * as WebIFC from 'web-ifc';
import { measureVolume } from 'brepjs';
import { initOCCT } from '../../../tests/setup.js';
import { BimModel } from '../src/model/bimModel.js';
import { toIfc } from '../src/serialize/toIfc.js';
import { SpfReader } from '../src/import/spfReader.js';
import { readBodyGeometry } from '../src/import/geometryRead.js';
import { emptyReport } from '../src/validation/severity.js';
import type { ValidationIssue } from '../src/validation/severity.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

const META = { applicationName: 'brepjs-bim', applicationVersion: '0.1.0' };

// METRE files: web-ifc reports geometry in metres; scale (metres-per-unit) = 1.0.
// geometryRead converts file units → mm via scale * 1000.
const SCALE_METRE = 1.0;

const WALL = { length: 5000, height: 3000, thickness: 200 } as const;

function buildWallModel(): BimModel {
  const model = new BimModel();
  const initResult = model.init({ name: 'Geometry RoundTrip' });
  if (!initResult.ok) throw new Error(initResult.error.message);
  const projectId = initResult.value;
  const siteId = model.addSite({ name: 'Site' });
  const buildingId = model.addBuilding({ name: 'Building' });
  const storeyId = model.addStorey({ name: 'L1', elevation: 0 });
  model.aggregate(projectId, siteId);
  model.aggregate(siteId, buildingId);
  model.aggregate(buildingId, storeyId);

  const wall = model.addWall({
    length: WALL.length,
    height: WALL.height,
    thickness: WALL.thickness,
    origin: [0, 0, 0],
    axisX: [1, 0, 0],
    axisZ: [0, 0, 1],
    materialName: 'Concrete',
  });
  if (!wall.ok) throw new Error(wall.error.message);
  model.placeIn(wall.value, storeyId);
  return model;
}

const CIRC_COLUMN = { radius: 150, height: 4000 } as const;
const IBEAM = {
  overallWidth: 200,
  overallDepth: 400,
  webThickness: 12,
  flangeThickness: 20,
  length: 6000,
} as const;

function buildCircularColumnModel(): BimModel {
  const model = new BimModel();
  const ir = model.init({ name: 'Column RoundTrip' });
  if (!ir.ok) throw new Error(ir.error.message);
  const pid = ir.value;
  const sid = model.addSite({ name: 'Site' });
  const bid = model.addBuilding({ name: 'Building' });
  const stid = model.addStorey({ name: 'L1', elevation: 0 });
  model.aggregate(pid, sid);
  model.aggregate(sid, bid);
  model.aggregate(bid, stid);
  const col = model.addColumn({
    height: CIRC_COLUMN.height,
    profile: { kind: 'CIRCULAR', radius: CIRC_COLUMN.radius },
    origin: [0, 0, 0],
    axisX: [1, 0, 0],
    axisZ: [0, 0, 1],
    materialName: 'Steel',
  });
  if (!col.ok) throw new Error(col.error.message);
  model.placeIn(col.value, stid);
  return model;
}

function buildIBeamModel(): BimModel {
  const model = new BimModel();
  const ir = model.init({ name: 'IBeam RoundTrip' });
  if (!ir.ok) throw new Error(ir.error.message);
  const pid = ir.value;
  const sid = model.addSite({ name: 'Site' });
  const bid = model.addBuilding({ name: 'Building' });
  const stid = model.addStorey({ name: 'L1', elevation: 0 });
  model.aggregate(pid, sid);
  model.aggregate(sid, bid);
  model.aggregate(bid, stid);
  const beam = model.addBeam({
    length: IBEAM.length,
    profile: {
      kind: 'I_BEAM',
      overallWidth: IBEAM.overallWidth,
      overallDepth: IBEAM.overallDepth,
      webThickness: IBEAM.webThickness,
      flangeThickness: IBEAM.flangeThickness,
    },
    origin: [0, 0, 0],
    axisX: [1, 0, 0],
    axisZ: [0, 0, 1],
    materialName: 'Steel',
  });
  if (!beam.ok) throw new Error(beam.error.message);
  model.placeIn(beam.value, stid);
  return model;
}

async function readerFor(model: BimModel): Promise<SpfReader> {
  const bytesResult = await toIfc(model, META);
  if (!bytesResult.ok) throw new Error(bytesResult.error.message);
  const readerResult = await SpfReader.create(bytesResult.value);
  if (!readerResult.ok) throw new Error(readerResult.error.message);
  return readerResult.value;
}

describe('geometryRead — extruded-solid round-trip', () => {
  it('reconstructs a wall (extruded rectangle) as a SOLID whose volume matches the original', async () => {
    const reader = await readerFor(buildWallModel());
    try {
      const wallId = reader.getLinesOfType(WebIFC.IFCWALL)[0];
      expect(wallId).toBeDefined();
      if (wallId === undefined) return;

      const diagnostics: ValidationIssue[] = [];
      const result = readBodyGeometry(reader, wallId, SCALE_METRE, diagnostics);

      expect(result.kind).toBe('SOLID');
      if (result.kind !== 'SOLID') return;

      const volume = measureVolume(result.solid);
      expect(volume.ok).toBe(true);
      if (!volume.ok) return;

      const expectedMm3 = WALL.length * WALL.height * WALL.thickness;
      // Geometry-level tolerance: relative comparison via toBeCloseTo on the ratio.
      expect(volume.value / expectedMm3).toBeCloseTo(1, 3);
    } finally {
      reader.close();
    }
  });

  it('produces no error-severity diagnostics for a clean wall reconstruction', async () => {
    const reader = await readerFor(buildWallModel());
    try {
      const wallId = reader.getLinesOfType(WebIFC.IFCWALL)[0];
      if (wallId === undefined) throw new Error('no wall in model');

      const diagnostics: ValidationIssue[] = [];
      readBodyGeometry(reader, wallId, SCALE_METRE, diagnostics);

      const errors = diagnostics.filter((i) => i.severity === 'error');
      expect(errors).toHaveLength(0);
    } finally {
      reader.close();
    }
  });

  it('returns NONE for a product with no body representation', async () => {
    const reader = await readerFor(buildWallModel());
    try {
      // IFCSITE has no Body shape representation in our writer output.
      const siteId = reader.getLinesOfType(WebIFC.IFCSITE)[0];
      if (siteId === undefined) throw new Error('no site in model');

      const diagnostics: ValidationIssue[] = [];
      const result = readBodyGeometry(reader, siteId, SCALE_METRE, diagnostics);
      expect(result.kind).toBe('NONE');
    } finally {
      reader.close();
    }
  });

  it('reconstructs a circular column whose volume matches the 32-gon extrusion', async () => {
    const reader = await readerFor(buildCircularColumnModel());
    try {
      const colId = reader.getLinesOfType(WebIFC.IFCCOLUMN)[0];
      if (colId === undefined) throw new Error('no column');

      const diagnostics: ValidationIssue[] = [];
      const result = readBodyGeometry(reader, colId, SCALE_METRE, diagnostics);
      expect(result.kind).toBe('SOLID');
      if (result.kind !== 'SOLID') return;

      const volume = measureVolume(result.solid);
      expect(volume.ok).toBe(true);
      if (!volume.ok) return;

      // profileToPolygon tessellates circles to 32 segments; the cross-section is
      // a regular 32-gon: area = 0.5 · n · r² · sin(2π/n).
      const n = 32;
      const polyArea =
        0.5 * n * CIRC_COLUMN.radius * CIRC_COLUMN.radius * Math.sin((2 * Math.PI) / n);
      const expectedMm3 = polyArea * CIRC_COLUMN.height;
      expect(volume.value / expectedMm3).toBeCloseTo(1, 2);
    } finally {
      reader.close();
    }
  });

  it('reconstructs an I-beam whose volume matches the analytic cross-section', async () => {
    const reader = await readerFor(buildIBeamModel());
    try {
      const beamId = reader.getLinesOfType(WebIFC.IFCBEAM)[0];
      if (beamId === undefined) throw new Error('no beam');

      const diagnostics: ValidationIssue[] = [];
      const result = readBodyGeometry(reader, beamId, SCALE_METRE, diagnostics);
      expect(result.kind).toBe('SOLID');
      if (result.kind !== 'SOLID') return;

      const volume = measureVolume(result.solid);
      expect(volume.ok).toBe(true);
      if (!volume.ok) return;

      const flangeArea = 2 * IBEAM.overallWidth * IBEAM.flangeThickness;
      const webArea = (IBEAM.overallDepth - 2 * IBEAM.flangeThickness) * IBEAM.webThickness;
      const expectedMm3 = (flangeArea + webArea) * IBEAM.length;
      expect(volume.value / expectedMm3).toBeCloseTo(1, 2);
    } finally {
      reader.close();
    }
  });

  // emptyReport is imported only to keep the report helper in scope for callers
  // that thread a ValidationReport rather than a raw issue list.
  it('exposes an empty-report helper for diagnostic accumulation', () => {
    expect(emptyReport().issues).toHaveLength(0);
  });
});
