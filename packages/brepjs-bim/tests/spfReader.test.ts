import { describe, it, expect, beforeAll } from 'vitest';
import * as WebIFC from 'web-ifc';
import { initOCCT } from '../../../tests/setup.js';
import { BimModel } from '../src/model/bimModel.js';
import { toIfc } from '../src/serialize/toIfc.js';
import { SpfReader } from '../src/import/spfReader.js';

beforeAll(async () => { await initOCCT(); }, 30000);

const META = { applicationName: 'brepjs-bim', applicationVersion: '0.1.0' };

function buildModel(): BimModel {
  const model = new BimModel();
  const initResult = model.init({ name: 'SpfReader Project' });
  if (!initResult.ok) throw new Error(initResult.error.message);
  const projectId = initResult.value;
  const siteId = model.addSite({ name: 'Site' });
  const buildingId = model.addBuilding({ name: 'Building' });
  const storeyId = model.addStorey({ name: 'L1', elevation: 0 });
  model.aggregate(projectId, siteId);
  model.aggregate(siteId, buildingId);
  model.aggregate(buildingId, storeyId);

  const wall = model.addWall({
    length: 5000, height: 3000, thickness: 200,
    origin: [0, 0, 0], axisX: [1, 0, 0], axisZ: [0, 0, 1],
    materialName: 'Concrete',
  });
  if (!wall.ok) throw new Error(wall.error.message);
  model.placeIn(wall.value, storeyId);

  return model;
}

async function bytesFor(model: BimModel): Promise<Uint8Array> {
  const result = await toIfc(model, META);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe('SpfReader', () => {
  it('opens IFC bytes and detects the IFC4 schema', async () => {
    const bytes = await bytesFor(buildModel());
    const result = await SpfReader.create(bytes);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const reader = result.value;
    try {
      expect(reader.schema).toBe('IFC4');
      expect(reader.modelId).toBeGreaterThanOrEqual(0);
    } finally {
      reader.close();
    }
  });

  it('reports line counts greater than zero', async () => {
    const bytes = await bytesFor(buildModel());
    const result = await SpfReader.create(bytes);
    if (!result.ok) throw new Error(result.error.message);
    const reader = result.value;
    try {
      expect(reader.getAllLines().length).toBeGreaterThan(0);
      expect(reader.getLinesOfType(WebIFC.IFCPROJECT).length).toBe(1);
      expect(reader.getLinesOfType(WebIFC.IFCWALL).length).toBe(1);
    } finally {
      reader.close();
    }
  });

  it('reads a typed line and its decoded Name', async () => {
    const bytes = await bytesFor(buildModel());
    const result = await SpfReader.create(bytes);
    if (!result.ok) throw new Error(result.error.message);
    const reader = result.value;
    try {
      const projectId = reader.getLinesOfType(WebIFC.IFCPROJECT)[0];
      expect(projectId).toBeDefined();
      if (projectId === undefined) return;
      const project = reader.getLine<Record<string, unknown>>(projectId);
      expect(project).not.toBeNull();
      const name = (project?.['Name'] as { value?: string } | undefined)?.value;
      expect(name).toBe('SpfReader Project');
    } finally {
      reader.close();
    }
  });

  it('resolves a known GlobalId to an expressId via the GUID map', async () => {
    const model = buildModel();
    const wallGuid = model.getWalls()[0]?.guid;
    expect(wallGuid).toBeDefined();
    if (wallGuid === undefined) return;

    const bytes = await bytesFor(model);
    const result = await SpfReader.create(bytes);
    if (!result.ok) throw new Error(result.error.message);
    const reader = result.value;
    try {
      reader.buildGuidMap();
      const expressId = reader.expressIdFromGuid(wallGuid);
      expect(expressId).toBeDefined();
      if (expressId === undefined) return;
      // The express id round-trips back to the same GlobalId.
      expect(reader.guidFromExpressId(expressId)).toBe(wallGuid);
      // ...and that express id is the wall line.
      expect(reader.getLinesOfType(WebIFC.IFCWALL)).toContain(expressId);
    } finally {
      reader.close();
    }
  });

  it('close() is idempotent and releases the model cleanly', async () => {
    const bytes = await bytesFor(buildModel());
    const result = await SpfReader.create(bytes);
    if (!result.ok) throw new Error(result.error.message);
    const reader = result.value;
    expect(() => {
      reader.close();
      reader.close();
    }).not.toThrow();
  });

  it('returns an err for non-IFC input', async () => {
    const garbage = new TextEncoder().encode('not an ifc file at all');
    const result = await SpfReader.create(garbage);
    expect(result.ok).toBe(false);
    if (result.ok) {
      result.value.close();
      return;
    }
    expect(result.error.kind).toBe('BIM_IMPORT');
  });
});
