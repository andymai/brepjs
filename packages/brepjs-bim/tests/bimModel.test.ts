import { describe, it, expect, beforeAll } from 'vitest';
import { unwrap, measureVolume } from 'brepjs';
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

describe('BimModel — wall geometry is cut by openings (M4)', () => {
  function buildWallModel() {
    const model = new BimModel();
    unwrap(model.init({ name: 'Test' }));
    const wallId = unwrap(model.addWall(WALL_SPEC));
    return { model, wallId };
  }

  function wallVolume(model: BimModel): number {
    const wall = model.getWalls()[0];
    if (!wall) throw new Error('Expected one wall');
    return unwrap(measureVolume(wall.geometry));
  }

  it('wall volume drops by door volume after addDoor', () => {
    const { model, wallId } = buildWallModel();
    const grossVol = wallVolume(model);

    const doorResult = model.addDoor({
      width: 900, height: 2100, offsetAlongWall: 1000, offsetFromFloor: 0,
      wallLocalId: wallId, materialName: 'Wood',
    });
    expect(doorResult.ok).toBe(true);

    const netVol = wallVolume(model);
    const expectedDelta = 900 * 2100 * WALL_SPEC.thickness;
    expect(grossVol - netVol).toBeCloseTo(expectedDelta, -2);
  });

  it('wall volume drops by combined opening volumes after door + window', () => {
    const { model, wallId } = buildWallModel();
    const grossVol = wallVolume(model);

    unwrap(model.addDoor({
      width: 900, height: 2100, offsetAlongWall: 500, offsetFromFloor: 0,
      wallLocalId: wallId, materialName: 'Wood',
    }));
    unwrap(model.addWindow({
      width: 1200, height: 1500, offsetAlongWall: 2500, offsetFromFloor: 900,
      wallLocalId: wallId, materialName: 'Glass',
    }));

    const netVol = wallVolume(model);
    const expectedDelta = (900 * 2100 + 1200 * 1500) * WALL_SPEC.thickness;
    expect(grossVol - netVol).toBeCloseTo(expectedDelta, -2);
  });

  it('addDoor with bounds violation does not mutate the model', () => {
    const { model, wallId } = buildWallModel();
    const elementsBefore = model.getAllElements().length;
    const relsBefore = model.getAllRelationships().length;
    const grossVol = wallVolume(model);

    const result = model.addDoor({
      width: WALL_SPEC.length + 100, height: 2100,
      offsetAlongWall: 0, offsetFromFloor: 0,
      wallLocalId: wallId, materialName: 'Wood',
    });
    expect(result.ok).toBe(false);

    expect(model.getAllElements().length).toBe(elementsBefore);
    expect(model.getAllRelationships().length).toBe(relsBefore);
    expect(wallVolume(model)).toBeCloseTo(grossVol, -2);
  });

  it('addDoor with invalid wall reference does not mutate the model', () => {
    const { model } = buildWallModel();
    const elementsBefore = model.getAllElements().length;
    const relsBefore = model.getAllRelationships().length;
    const grossVol = wallVolume(model);

    const result = model.addDoor({
      width: 900, height: 2100, offsetAlongWall: 0, offsetFromFloor: 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment -- testing invalid input
      wallLocalId: 9999 as any, materialName: 'Wood',
    });
    expect(result.ok).toBe(false);

    expect(model.getAllElements().length).toBe(elementsBefore);
    expect(model.getAllRelationships().length).toBe(relsBefore);
    expect(wallVolume(model)).toBeCloseTo(grossVol, -2);
  });
});

describe('BimModel.addSlab', () => {
  const SLAB_SPEC = {
    length: 5000,
    width: 4000,
    thickness: 200,
    origin: [0, 0, 0] as [number, number, number],
    axisX: [1, 0, 0] as [number, number, number],
    axisZ: [0, 0, 1] as [number, number, number],
    predefinedType: 'FLOOR' as const,
    materialName: 'Concrete',
  };

  it('adds a slab and returns a LocalId', () => {
    const model = new BimModel();
    const result = model.addSlab(SLAB_SPEC);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(model.getSlabs()).toHaveLength(1);
    expect(model.getElement(result.value)).not.toBeNull();
  });

  it('addSlab fails with invalid spec', () => {
    const model = new BimModel();
    const result = model.addSlab({ ...SLAB_SPEC, length: -1 });
    expect(result.ok).toBe(false);
  });

  it('stores the predefinedType on the spec', () => {
    const model = new BimModel();
    unwrap(model.addSlab(SLAB_SPEC));
    unwrap(model.addSlab({ ...SLAB_SPEC, predefinedType: 'ROOF' }));
    const slabs = model.getSlabs();
    expect(slabs.map((s) => s.spec.predefinedType).sort()).toEqual(['FLOOR', 'ROOF']);
  });

  it('volume of stored slab geometry matches dimensions', () => {
    const model = new BimModel();
    const result = model.addSlab(SLAB_SPEC);
    if (!result.ok) throw new Error(result.error.message);
    const slab = model.getSlabs()[0];
    if (!slab) throw new Error('Expected one slab');
    const vol = unwrap(measureVolume(slab.geometry));
    expect(vol).toBeCloseTo(5000 * 4000 * 200, -2);
  });

  it('[Symbol.dispose] disposes slab geometry', () => {
    const model = new BimModel();
    const result = model.addSlab(SLAB_SPEC);
    if (!result.ok) throw new Error(result.error.message);
    const slab = model.getSlabs()[0];
    if (!slab) throw new Error('Expected one slab');
    model[Symbol.dispose]();
    expect(slab.geometry.disposed).toBe(true);
  });

  it('emits an ASSOCIATES_MATERIAL relationship', () => {
    const model = new BimModel();
    const result = model.addSlab(SLAB_SPEC);
    if (!result.ok) throw new Error(result.error.message);
    const matRels = model
      .getAllRelationships()
      .filter((r) => r.kind === 'ASSOCIATES_MATERIAL');
    expect(matRels).toHaveLength(1);
    expect(matRels[0]?.materialName).toBe('Concrete');
  });
});

describe('BimModel.addSlabOpening (M6)', () => {
  const SLAB_SPEC = {
    length: 6000,
    width: 4000,
    thickness: 200,
    origin: [0, 0, 0] as [number, number, number],
    axisX: [1, 0, 0] as [number, number, number],
    axisZ: [0, 0, 1] as [number, number, number],
    predefinedType: 'FLOOR' as const,
    materialName: 'Concrete',
  };

  function buildSlabModel() {
    const model = new BimModel();
    unwrap(model.init({ name: 'Test' }));
    const slabId = unwrap(model.addSlab(SLAB_SPEC));
    return { model, slabId };
  }

  function slabVolume(model: BimModel): number {
    const slab = model.getSlabs()[0];
    if (!slab) throw new Error('Expected one slab');
    return unwrap(measureVolume(slab.geometry));
  }

  it('adds a slab opening and creates VOIDS_SLAB rel', () => {
    const { model, slabId } = buildSlabModel();
    const result = model.addSlabOpening({
      sizeX: 1000, sizeY: 1500, offsetX: 1000, offsetY: 800,
      slabLocalId: slabId,
    });
    expect(result.ok).toBe(true);
    const voidsRels = model.getAllRelationships().filter((r) => r.kind === 'VOIDS_SLAB');
    expect(voidsRels).toHaveLength(1);
  });

  it('slab volume drops by opening volume after addSlabOpening', () => {
    const { model, slabId } = buildSlabModel();
    const grossVol = slabVolume(model);

    unwrap(model.addSlabOpening({
      sizeX: 1000, sizeY: 1500, offsetX: 1000, offsetY: 800,
      slabLocalId: slabId,
    }));

    const netVol = slabVolume(model);
    const expectedDelta = 1000 * 1500 * SLAB_SPEC.thickness;
    expect(grossVol - netVol).toBeCloseTo(expectedDelta, -2);
  });

  it('multiple slab openings each remove their volume', () => {
    const { model, slabId } = buildSlabModel();
    const grossVol = slabVolume(model);

    unwrap(model.addSlabOpening({
      sizeX: 800, sizeY: 1200, offsetX: 200, offsetY: 200,
      slabLocalId: slabId,
    }));
    unwrap(model.addSlabOpening({
      sizeX: 600, sizeY: 600, offsetX: 4000, offsetY: 2500,
      slabLocalId: slabId,
    }));

    const netVol = slabVolume(model);
    const expectedDelta = (800 * 1200 + 600 * 600) * SLAB_SPEC.thickness;
    expect(grossVol - netVol).toBeCloseTo(expectedDelta, -2);
  });

  it('addSlabOpening with bounds violation does not mutate the model', () => {
    const { model, slabId } = buildSlabModel();
    const elementsBefore = model.getAllElements().length;
    const relsBefore = model.getAllRelationships().length;
    const grossVol = slabVolume(model);

    const result = model.addSlabOpening({
      sizeX: SLAB_SPEC.length + 100, sizeY: 100,
      offsetX: 0, offsetY: 0,
      slabLocalId: slabId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('SLAB_OPENING_EXCEEDS_SLAB_BOUNDS');

    expect(model.getAllElements().length).toBe(elementsBefore);
    expect(model.getAllRelationships().length).toBe(relsBefore);
    expect(slabVolume(model)).toBeCloseTo(grossVol, -2);
  });

  it('addSlabOpening with invalid slab reference does not mutate the model', () => {
    const { model } = buildSlabModel();
    const elementsBefore = model.getAllElements().length;
    const relsBefore = model.getAllRelationships().length;

    const result = model.addSlabOpening({
      sizeX: 500, sizeY: 500, offsetX: 0, offsetY: 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment -- testing invalid input
      slabLocalId: 9999 as any,
    });
    expect(result.ok).toBe(false);

    expect(model.getAllElements().length).toBe(elementsBefore);
    expect(model.getAllRelationships().length).toBe(relsBefore);
  });

  it('addSlabOpening rejects overlap with an existing opening on the same slab', () => {
    const { model, slabId } = buildSlabModel();
    unwrap(model.addSlabOpening({
      sizeX: 1000, sizeY: 1000, offsetX: 500, offsetY: 500,
      slabLocalId: slabId,
    }));
    const elementsBefore = model.getAllElements().length;
    const relsBefore = model.getAllRelationships().length;
    const volAfterFirst = slabVolume(model);

    const result = model.addSlabOpening({
      sizeX: 600, sizeY: 600, offsetX: 1000, offsetY: 1000,
      slabLocalId: slabId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('SLAB_OPENING_OVERLAP');

    expect(model.getAllElements().length).toBe(elementsBefore);
    expect(model.getAllRelationships().length).toBe(relsBefore);
    expect(slabVolume(model)).toBeCloseTo(volAfterFirst, -2);
  });

  it('addSlabOpening allows two openings that touch edge-to-edge (non-overlap)', () => {
    const { model, slabId } = buildSlabModel();
    unwrap(model.addSlabOpening({
      sizeX: 1000, sizeY: 1000, offsetX: 0, offsetY: 0,
      slabLocalId: slabId,
    }));
    const second = model.addSlabOpening({
      sizeX: 1000, sizeY: 1000, offsetX: 1000, offsetY: 0,
      slabLocalId: slabId,
    });
    expect(second.ok).toBe(true);
  });
});

describe('BimModel.addBeam (M7)', () => {
  const BEAM_SPEC = {
    length: 5000,
    profile: { kind: 'RECTANGULAR' as const, width: 200, height: 400 },
    origin: [0, 0, 0] as [number, number, number],
    axisX: [1, 0, 0] as [number, number, number],
    axisZ: [0, 0, 1] as [number, number, number],
    materialName: 'Steel',
  };

  it('adds a beam and returns a LocalId', () => {
    const model = new BimModel();
    const result = model.addBeam(BEAM_SPEC);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(model.getBeams()).toHaveLength(1);
    expect(model.getElement(result.value)).not.toBeNull();
  });

  it('addBeam fails with invalid spec', () => {
    const model = new BimModel();
    const result = model.addBeam({ ...BEAM_SPEC, length: -1 });
    expect(result.ok).toBe(false);
  });

  it('beam volume matches profile area × length', () => {
    const model = new BimModel();
    const result = model.addBeam(BEAM_SPEC);
    if (!result.ok) throw new Error(result.error.message);
    const beam = model.getBeams()[0];
    if (!beam) throw new Error('Expected one beam');
    const vol = unwrap(measureVolume(beam.geometry));
    expect(vol).toBeCloseTo(200 * 400 * 5000, -2);
  });

  it('[Symbol.dispose] disposes beam geometry', () => {
    const model = new BimModel();
    const result = model.addBeam(BEAM_SPEC);
    if (!result.ok) throw new Error(result.error.message);
    const beam = model.getBeams()[0];
    if (!beam) throw new Error('Expected one beam');
    model[Symbol.dispose]();
    expect(beam.geometry.disposed).toBe(true);
  });

  it('emits an ASSOCIATES_MATERIAL relationship', () => {
    const model = new BimModel();
    const result = model.addBeam(BEAM_SPEC);
    if (!result.ok) throw new Error(result.error.message);
    const matRels = model
      .getAllRelationships()
      .filter((r) => r.kind === 'ASSOCIATES_MATERIAL');
    expect(matRels).toHaveLength(1);
    expect(matRels[0]?.materialName).toBe('Steel');
  });
});

describe('BimModel.addColumn (M7)', () => {
  const COLUMN_SPEC = {
    height: 3000,
    profile: { kind: 'CIRCULAR' as const, radius: 200 },
    origin: [0, 0, 0] as [number, number, number],
    axisX: [1, 0, 0] as [number, number, number],
    axisZ: [0, 0, 1] as [number, number, number],
    materialName: 'Concrete',
  };

  it('adds a column and returns a LocalId', () => {
    const model = new BimModel();
    const result = model.addColumn(COLUMN_SPEC);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(model.getColumns()).toHaveLength(1);
  });

  it('addColumn fails with invalid spec', () => {
    const model = new BimModel();
    const result = model.addColumn({ ...COLUMN_SPEC, height: 0 });
    expect(result.ok).toBe(false);
  });

  it('column volume matches profile area × height', () => {
    const model = new BimModel();
    const result = model.addColumn(COLUMN_SPEC);
    if (!result.ok) throw new Error(result.error.message);
    const column = model.getColumns()[0];
    if (!column) throw new Error('Expected one column');
    const vol = unwrap(measureVolume(column.geometry));
    const nominal = Math.PI * 200 * 200 * 3000;
    expect(vol).toBeGreaterThan(nominal * 0.99);
    expect(vol).toBeLessThan(nominal * 1.01);
  });

  it('[Symbol.dispose] disposes column geometry', () => {
    const model = new BimModel();
    const result = model.addColumn(COLUMN_SPEC);
    if (!result.ok) throw new Error(result.error.message);
    const column = model.getColumns()[0];
    if (!column) throw new Error('Expected one column');
    model[Symbol.dispose]();
    expect(column.geometry.disposed).toBe(true);
  });
});
