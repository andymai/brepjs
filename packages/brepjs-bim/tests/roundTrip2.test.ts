import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import { unwrap } from 'brepjs';
import { BimModel } from '../src/model/bimModel.js';
import { toIfc } from '../src/serialize/toIfc.js';
import { checkRoundTrip, compareCounts, KEY_ENTITY_NAMES } from '../src/validation/roundTrip.js';
import { hasErrors } from '../src/validation/severity.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

function buildModel(): BimModel {
  const model = new BimModel();
  unwrap(model.init({ name: 'Round-trip Project' }));
  const project = model.getProject();
  if (!project) throw new Error('expected project');
  const siteId = model.addSite({ name: 'Site' });
  const buildingId = model.addBuilding({ name: 'Building' });
  const storeyId = model.addStorey({ name: 'L1', elevation: 0 });
  model.aggregate(project.localId, siteId);
  model.aggregate(siteId, buildingId);
  model.aggregate(buildingId, storeyId);

  const wall = unwrap(
    model.addWall({
      length: 5000,
      height: 3000,
      thickness: 250,
      origin: [0, 0, 0],
      axisX: [1, 0, 0],
      axisZ: [0, 0, 1],
      materialName: 'Concrete',
      isExternal: true,
    }),
  );
  model.placeIn(wall, storeyId);

  const slab = unwrap(
    model.addSlab({
      length: 6000,
      width: 4000,
      thickness: 250,
      origin: [0, 0, 0],
      axisX: [1, 0, 0],
      axisZ: [0, 0, 1],
      predefinedType: 'FLOOR',
      materialName: 'Concrete',
    }),
  );
  model.placeIn(slab, storeyId);

  const beam = unwrap(
    model.addBeam({
      length: 5000,
      profile: { kind: 'RECTANGULAR', width: 200, height: 400 },
      origin: [0, 0, 3000],
      axisX: [1, 0, 0],
      axisZ: [0, 0, 1],
      predefinedType: 'BEAM',
      materialName: 'Steel',
    }),
  );
  model.placeIn(beam, storeyId);

  const column = unwrap(
    model.addColumn({
      height: 3000,
      profile: { kind: 'RECTANGULAR', width: 200, height: 400 },
      origin: [1000, 1000, 0],
      axisX: [1, 0, 0],
      axisZ: [0, 0, 1],
      predefinedType: 'COLUMN',
      materialName: 'Concrete',
    }),
  );
  model.placeIn(column, storeyId);

  return model;
}

async function buildBytes(): Promise<Uint8Array> {
  const model = buildModel();
  const result = await toIfc(model, {
    applicationName: 'brepjs-bim-test',
    applicationVersion: '0.0.0',
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe('WRITE→READ→RE-WRITE round-trip self-check', () => {
  it('reports no issues for a stable round-trip', async () => {
    const bytes = await buildBytes();
    const report = await checkRoundTrip(bytes);
    expect(report.issues).toEqual([]);
    expect(hasErrors(report)).toBe(false);
  });

  it('exposes per-type counts for the key entities after re-write', async () => {
    const bytes = await buildBytes();
    const report = await checkRoundTrip(bytes);
    expect(report.firstPass.typeCounts.IfcProject).toBe(1);
    expect(report.firstPass.typeCounts.IfcWall).toBe(1);
    expect(report.firstPass.typeCounts.IfcSlab).toBe(1);
    expect(report.firstPass.typeCounts.IfcBeam).toBe(1);
    expect(report.firstPass.typeCounts.IfcColumn).toBe(1);
    expect(report.firstPass.typeCounts.IfcRelContainedInSpatialStructure).toBeGreaterThanOrEqual(1);
    expect(report.firstPass.typeCounts.IfcRelAggregates).toBeGreaterThanOrEqual(1);
    // counts are equal across the round-trip
    expect(report.secondPass.typeCounts).toEqual(report.firstPass.typeCounts);
    expect(report.secondPass.totalCount).toBe(report.firstPass.totalCount);
  });

  it('CloseModel runs even when re-saving twice on the same bytes', async () => {
    const bytes = await buildBytes();
    // Running twice must not leak/lock WASM handles or throw.
    const first = await checkRoundTrip(bytes);
    const second = await checkRoundTrip(bytes);
    expect(first.firstPass.totalCount).toBe(second.firstPass.totalCount);
  });
});

describe('round-trip count comparison', () => {
  const KEYS = [...KEY_ENTITY_NAMES];

  it('emits no issues when counts match exactly', () => {
    const counts = {
      totalCount: 100,
      typeCounts: Object.fromEntries(KEYS.map((k) => [k, 1])),
    };
    const issues = compareCounts(counts, counts);
    expect(issues).toEqual([]);
  });

  it('flags a total-count delta as an error', () => {
    const first = { totalCount: 100, typeCounts: Object.fromEntries(KEYS.map((k) => [k, 1])) };
    const second = { totalCount: 99, typeCounts: first.typeCounts };
    const issues = compareCounts(first, second);
    const totalIssues = issues.filter((i) => i.code === 'ROUNDTRIP_TOTAL_COUNT_DELTA');
    expect(totalIssues).toHaveLength(1);
    expect(totalIssues[0]?.severity).toBe('error');
    expect(totalIssues[0]?.context).toMatchObject({ first: 100, second: 99 });
  });

  it('flags a per-type count delta as an error keyed by entity name', () => {
    const base = Object.fromEntries(KEYS.map((k) => [k, 1]));
    const first = { totalCount: 100, typeCounts: base };
    const second = { totalCount: 100, typeCounts: { ...base, IfcWall: 2 } };
    const issues = compareCounts(first, second);
    const typeIssues = issues.filter((i) => i.code === 'ROUNDTRIP_TYPE_COUNT_DELTA');
    expect(typeIssues).toHaveLength(1);
    expect(typeIssues[0]?.severity).toBe('error');
    expect(typeIssues[0]?.entity).toBe('IfcWall');
  });
});
