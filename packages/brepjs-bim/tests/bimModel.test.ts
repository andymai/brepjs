import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import { BimModel } from '../src/model/bimModel.js';

beforeAll(async () => { await initOCCT(); }, 30000);

const WALL_SPEC = {
  length: 5000,
  height: 3000,
  thickness: 250,
  origin: [0, 0, 0] as [number, number, number],
  axisX: [1, 0, 0] as [number, number, number],
  axisZ: [0, 0, 1] as [number, number, number],
  materialName: 'Brick',
};

describe('BimModel', () => {
  it('init creates a project element', () => {
    const model = new BimModel();
    model.init({ name: 'Test Project' });
    const project = model.getProject();
    expect(project).not.toBeNull();
    expect(project?.spec.name).toBe('Test Project');
  });

  it('addWall returns a LocalId on success', () => {
    const model = new BimModel();
    model.init({ name: 'P' });
    const siteId = model.addSite({ name: 'S' });
    const buildingId = model.addBuilding({ name: 'B' });
    const storeyId = model.addStorey({ name: 'L1', elevation: 0 });
    const project = model.getProject();
    if (project === null) throw new Error('Expected project to exist');
    model.aggregate(project.localId, siteId);
    model.aggregate(siteId, buildingId);
    model.aggregate(buildingId, storeyId);

    const result = model.addWall(WALL_SPEC);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    model.placeIn(result.value, storeyId);
    expect(model.getElement(result.value)).not.toBeNull();
  });

  it('addWall fails with invalid spec', () => {
    const model = new BimModel();
    const result = model.addWall({ ...WALL_SPEC, length: -1 });
    expect(result.ok).toBe(false);
  });

  it('getWalls returns only wall elements', () => {
    const model = new BimModel();
    model.init({ name: 'P' });
    const siteId = model.addSite({ name: 'S' });
    const buildingId = model.addBuilding({ name: 'B' });
    const storeyId = model.addStorey({ name: 'L1', elevation: 0 });
    const project = model.getProject();
    if (project === null) throw new Error('Expected project to exist');
    model.aggregate(project.localId, siteId);
    model.aggregate(siteId, buildingId);
    model.aggregate(buildingId, storeyId);
    const wallResult = model.addWall(WALL_SPEC);
    if (!wallResult.ok) throw new Error(wallResult.error.message);
    model.placeIn(wallResult.value, storeyId);

    const walls = model.getWalls();
    expect(walls).toHaveLength(1);
  });
});
