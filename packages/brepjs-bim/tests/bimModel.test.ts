import { describe, it, expect, beforeAll } from 'vitest';
import { unwrap } from 'brepjs';
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
    unwrap(model.init({ name: 'Test Project' }));
    const project = model.getProject();
    expect(project).not.toBeNull();
    expect(project?.spec.name).toBe('Test Project');
  });

  it('addWall returns a LocalId on success', () => {
    const model = new BimModel();
    unwrap(model.init({ name: 'P' }));
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

  it('init() called twice returns DUPLICATE_PROJECT error', () => {
    const model = new BimModel();
    unwrap(model.init({ name: 'First' }));
    const second = model.init({ name: 'Second' });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.code).toBe('DUPLICATE_PROJECT');
  });

  it('getProject returns null before init()', () => {
    const model = new BimModel();
    expect(model.getProject()).toBeNull();
  });

  it('[Symbol.dispose] disposes wall geometry handles', () => {
    const model = new BimModel();
    const result = model.addWall(WALL_SPEC);
    if (!result.ok) throw new Error(result.error.message);
    const wall = model.getElement(result.value);
    if (!wall || wall.category !== 'WALL') throw new Error('Expected wall element');
    model[Symbol.dispose]();
    expect(wall.geometry.disposed).toBe(true);
  });

  it('getWalls returns only wall elements', () => {
    const model = new BimModel();
    unwrap(model.init({ name: 'P' }));
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

describe('BimModel.addDoor', () => {
  function buildWallModel() {
    const model = new BimModel();
    const initResult = model.init({ name: 'Test' });
    if (!initResult.ok) throw new Error(initResult.error.message);
    const wallResult = model.addWall({
      length: 5000, height: 3000, thickness: 250,
      origin: [0, 0, 0], axisX: [1, 0, 0], axisZ: [0, 0, 1],
      materialName: 'Concrete',
    });
    if (!wallResult.ok) throw new Error(wallResult.error.message);
    return { model, wallLocalId: wallResult.value };
  }

  it('adds a door and creates opening + relationships', () => {
    const { model, wallLocalId } = buildWallModel();
    const result = model.addDoor({
      width: 900, height: 2100, offsetAlongWall: 500, offsetFromFloor: 0,
      wallLocalId, materialName: 'Wood',
    });
    expect(result.ok).toBe(true);
    expect(model.getDoors()).toHaveLength(1);
  });

  it('rejects door that exceeds wall length', () => {
    const { model, wallLocalId } = buildWallModel();
    const result = model.addDoor({
      width: 900, height: 2100, offsetAlongWall: 4500, offsetFromFloor: 0,
      wallLocalId, materialName: 'Wood',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('DOOR_EXCEEDS_WALL_BOUNDS');
  });

  it('rejects door that exceeds wall height', () => {
    const { model, wallLocalId } = buildWallModel();
    const result = model.addDoor({
      width: 900, height: 2100, offsetAlongWall: 500, offsetFromFloor: 1000,
      wallLocalId, materialName: 'Wood',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('DOOR_EXCEEDS_WALL_BOUNDS');
  });

  it('rejects door referencing non-existent wall', () => {
    const { model } = buildWallModel();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment -- testing invalid input path
    const result = model.addDoor({ width: 900, height: 2100, offsetAlongWall: 500, offsetFromFloor: 0, wallLocalId: 9999 as any, materialName: 'Wood' });
    expect(result.ok).toBe(false);
  });
});

describe('BimModel.addWindow', () => {
  function buildWallModel() {
    const model = new BimModel();
    const initResult = model.init({ name: 'Test' });
    if (!initResult.ok) throw new Error(initResult.error.message);
    const wallResult = model.addWall({
      length: 5000, height: 3000, thickness: 250,
      origin: [0, 0, 0], axisX: [1, 0, 0], axisZ: [0, 0, 1],
      materialName: 'Concrete',
    });
    if (!wallResult.ok) throw new Error(wallResult.error.message);
    return { model, wallLocalId: wallResult.value };
  }

  it('adds a window and creates opening + relationships', () => {
    const { model, wallLocalId } = buildWallModel();
    const result = model.addWindow({
      width: 1200, height: 1400, offsetAlongWall: 1000, offsetFromFloor: 900,
      wallLocalId, materialName: 'Aluminum',
    });
    expect(result.ok).toBe(true);
    expect(model.getWindows()).toHaveLength(1);
  });

  it('rejects window that exceeds wall bounds', () => {
    const { model, wallLocalId } = buildWallModel();
    const result = model.addWindow({
      width: 1200, height: 1400, offsetAlongWall: 4500, offsetFromFloor: 900,
      wallLocalId, materialName: 'Aluminum',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('WINDOW_EXCEEDS_WALL_BOUNDS');
  });
});
