import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import { BimModel } from '../src/model/bimModel.js';
import { toIfc } from '../src/serialize/toIfc.js';
import { checkSchema } from '../src/validation/schemaCheck.js';
import { hasErrors } from '../src/validation/severity.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

function buildModel(): BimModel {
  const model = new BimModel();
  const initResult = model.init({ name: 'Schema Test Project' });
  if (!initResult.ok) throw new Error(initResult.error.message);
  const projectLocalId = initResult.value;
  const siteLocalId = model.addSite({ name: 'Test Site' });
  const buildingLocalId = model.addBuilding({ name: 'Test Building' });
  const storeyLocalId = model.addStorey({ name: 'Ground Floor', elevation: 0 });
  model.aggregate(projectLocalId, siteLocalId);
  model.aggregate(siteLocalId, buildingLocalId);
  model.aggregate(buildingLocalId, storeyLocalId);
  const wallResult = model.addWall({
    length: 5000,
    height: 3000,
    thickness: 250,
    origin: [0, 0, 0],
    axisX: [1, 0, 0],
    axisZ: [0, 0, 1],
    materialName: 'Concrete',
  });
  if (!wallResult.ok) throw new Error(wallResult.error.message);
  model.placeIn(wallResult.value, storeyLocalId);
  return model;
}

async function buildBytes(): Promise<Uint8Array> {
  const result = await toIfc(buildModel(), {
    applicationName: 'brepjs-bim-test',
    applicationVersion: '0.0.0',
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe('schemaCheck self-validation gate', () => {
  it('passes a real IFC produced by BimModel + toIfc', async () => {
    const bytes = await buildBytes();
    const report = await checkSchema(bytes);
    expect(hasErrors(report)).toBe(false);
    expect(report.issues.filter((i) => i.severity === 'error')).toHaveLength(0);
  });

  it('reports a parse failure for empty bytes', async () => {
    const report = await checkSchema(new Uint8Array(0));
    expect(hasErrors(report)).toBe(true);
    expect(report.issues.some((i) => i.code === 'EMPTY_MODEL')).toBe(true);
  });

  it('detects a duplicate GlobalId collision', async () => {
    const bytes = await buildBytes();
    const text = new TextDecoder().decode(bytes);

    // Collect the 22-char IFC GUIDs from the data section (first arg of each line).
    const guidMatches = [...text.matchAll(/'([0-9A-Za-z_$]{22})'/g)].map((m) => m[1]);
    const unique = [...new Set(guidMatches)];
    expect(unique.length).toBeGreaterThanOrEqual(2);

    const keep = unique[0];
    const victim = unique[1];
    if (keep === undefined || victim === undefined) throw new Error('expected two distinct GUIDs');

    // Force a collision: rewrite every occurrence of `victim` to `keep`.
    const collided = text.split(victim).join(keep);
    const collidedBytes = new TextEncoder().encode(collided);

    const report = await checkSchema(collidedBytes);
    expect(hasErrors(report)).toBe(true);
    expect(report.issues.some((i) => i.code === 'DUPLICATE_GUID')).toBe(true);
  });
});
