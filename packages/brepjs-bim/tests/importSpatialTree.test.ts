import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import { BimModel } from '../src/model/bimModel.js';
import { toIfc } from '../src/serialize/toIfc.js';
import { SpfReader } from '../src/import/spfReader.js';
import { buildSpatialTree, buildElementContainmentMap } from '../src/import/spatialTree.js';
import type { SpatialNode } from '../src/import/spatialTree.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

const META = { applicationName: 'brepjs-bim', applicationVersion: '0.1.0' };

interface RoundTrip {
  project: { guid: string; name: string };
  site: { guid: string; name: string };
  building: { guid: string; name: string };
  level1: { guid: string; name: string; elevation: number };
  level2: { guid: string; name: string; elevation: number };
  wallL1Guid: string;
  slabL1Guid: string;
  wallL2Guid: string;
}

/**
 * Builds a two-storey model: PROJECT → SITE → BUILDING → {Level 1, Level 2}.
 * Level 1 contains a wall + slab; Level 2 contains a wall. Returns the model
 * plus the GUIDs/metadata so the round-trip can assert against known values.
 */
function buildMultiStoreyModel(): { model: BimModel; meta: RoundTrip } {
  const model = new BimModel();
  const initResult = model.init({ name: 'Tree Project' });
  if (!initResult.ok) throw new Error(initResult.error.message);
  const projectId = initResult.value;
  const siteId = model.addSite({ name: 'Site A' });
  const buildingId = model.addBuilding({ name: 'Building A' });
  const level1Id = model.addStorey({ name: 'Level 1', elevation: 0 });
  const level2Id = model.addStorey({ name: 'Level 2', elevation: 3000 });

  model.aggregate(projectId, siteId);
  model.aggregate(siteId, buildingId);
  model.aggregate(buildingId, level1Id);
  model.aggregate(buildingId, level2Id);

  const wallL1 = model.addWall({
    length: 5000,
    height: 3000,
    thickness: 200,
    origin: [0, 0, 0],
    axisX: [1, 0, 0],
    axisZ: [0, 0, 1],
    materialName: 'Concrete',
  });
  if (!wallL1.ok) throw new Error(wallL1.error.message);
  model.placeIn(wallL1.value, level1Id);

  const slabL1 = model.addSlab({
    length: 6000,
    width: 4000,
    thickness: 250,
    origin: [0, 0, -250],
    axisX: [1, 0, 0],
    axisZ: [0, 0, 1],
    predefinedType: 'FLOOR',
    materialName: 'Concrete',
  });
  if (!slabL1.ok) throw new Error(slabL1.error.message);
  model.placeIn(slabL1.value, level1Id);

  const wallL2 = model.addWall({
    length: 5000,
    height: 3000,
    thickness: 200,
    origin: [0, 0, 3000],
    axisX: [1, 0, 0],
    axisZ: [0, 0, 1],
    materialName: 'Concrete',
  });
  if (!wallL2.ok) throw new Error(wallL2.error.message);
  model.placeIn(wallL2.value, level2Id);

  const project = model.getProject();
  if (project === null) throw new Error('project missing');
  const site = model.getElement(siteId);
  const building = model.getElement(buildingId);
  const level1 = model.getElement(level1Id);
  const level2 = model.getElement(level2Id);
  if (site === null || building === null || level1 === null || level2 === null) {
    throw new Error('spatial container missing');
  }

  return {
    model,
    meta: {
      project: { guid: project.guid, name: 'Tree Project' },
      site: { guid: site.guid, name: 'Site A' },
      building: { guid: building.guid, name: 'Building A' },
      level1: { guid: level1.guid, name: 'Level 1', elevation: 0 },
      level2: { guid: level2.guid, name: 'Level 2', elevation: 3000 },
      wallL1Guid: model.getWalls()[0]?.guid ?? '',
      slabL1Guid: model.getSlabs()[0]?.guid ?? '',
      wallL2Guid: model.getWalls()[1]?.guid ?? '',
    },
  };
}

async function readTree(model: BimModel): Promise<{
  reader: SpfReader;
  tree: SpatialNode | null;
  containment: Map<number, number>;
}> {
  const bytesResult = await toIfc(model, META);
  if (!bytesResult.ok) throw new Error(bytesResult.error.message);
  const readerResult = await SpfReader.create(bytesResult.value);
  if (!readerResult.ok) throw new Error(readerResult.error.message);
  const reader = readerResult.value;
  reader.buildGuidMap();
  const tree = buildSpatialTree(reader, 1.0);
  const containment = buildElementContainmentMap(reader);
  return { reader, tree, containment };
}

/** Collects every node keyed by GlobalId for direct shape assertions. */
function indexByGuid(node: SpatialNode | null): Map<string, SpatialNode> {
  const out = new Map<string, SpatialNode>();
  if (node === null) return out;
  const stack: SpatialNode[] = [node];
  while (stack.length > 0) {
    const n = stack.pop();
    if (n === undefined) continue;
    out.set(n.guid, n);
    for (const child of n.children) stack.push(child);
  }
  return out;
}

describe('buildSpatialTree — multi-storey round-trip', () => {
  it('rebuilds PROJECT → SITE → BUILDING → STOREY hierarchy', async () => {
    const { model, meta } = buildMultiStoreyModel();
    const { reader, tree } = await readTree(model);
    try {
      expect(tree).not.toBeNull();
      if (tree === null) return;

      expect(tree.category).toBe('PROJECT');
      expect(tree.guid).toBe(meta.project.guid);
      expect(tree.name).toBe(meta.project.name);

      expect(tree.children).toHaveLength(1);
      const site = tree.children[0];
      expect(site?.category).toBe('SITE');
      expect(site?.guid).toBe(meta.site.guid);

      expect(site?.children).toHaveLength(1);
      const building = site?.children[0];
      expect(building?.category).toBe('BUILDING');
      expect(building?.guid).toBe(meta.building.guid);

      const storeys = building?.children ?? [];
      expect(storeys).toHaveLength(2);
      const storeyGuids = storeys.map((s) => s.guid).sort();
      expect(storeyGuids).toEqual([meta.level1.guid, meta.level2.guid].sort());
      for (const s of storeys) expect(s.category).toBe('STOREY');
    } finally {
      reader.close();
    }
  });

  it('keys nodes by GlobalId with correct names and storey elevations', async () => {
    const { model, meta } = buildMultiStoreyModel();
    const { reader, tree } = await readTree(model);
    try {
      const byGuid = indexByGuid(tree);

      expect(byGuid.get(meta.level1.guid)?.name).toBe('Level 1');
      expect(byGuid.get(meta.level2.guid)?.name).toBe('Level 2');

      expect(byGuid.get(meta.level1.guid)?.elevation).toBeCloseTo(0, 6);
      expect(byGuid.get(meta.level2.guid)?.elevation).toBeCloseTo(3000, 3);

      // Non-storey nodes carry no elevation.
      expect(byGuid.get(meta.project.guid)?.elevation).toBeUndefined();
      expect(byGuid.get(meta.site.guid)?.elevation).toBeUndefined();
    } finally {
      reader.close();
    }
  });

  it('attaches contained element expressIds to the owning storey', async () => {
    const { model, meta } = buildMultiStoreyModel();
    const { reader, tree } = await readTree(model);
    try {
      const byGuid = indexByGuid(tree);
      const level1 = byGuid.get(meta.level1.guid);
      const level2 = byGuid.get(meta.level2.guid);
      expect(level1).toBeDefined();
      expect(level2).toBeDefined();

      // Level 1 has the wall + slab; Level 2 has one wall.
      expect(level1?.containedElements).toHaveLength(2);
      expect(level2?.containedElements).toHaveLength(1);

      // The expressIds resolve back to the originating GlobalIds.
      const wallL1Id = reader.expressIdFromGuid(meta.wallL1Guid);
      const slabL1Id = reader.expressIdFromGuid(meta.slabL1Guid);
      const wallL2Id = reader.expressIdFromGuid(meta.wallL2Guid);
      expect(wallL1Id).toBeDefined();
      expect(slabL1Id).toBeDefined();
      expect(wallL2Id).toBeDefined();
      if (wallL1Id === undefined || slabL1Id === undefined || wallL2Id === undefined) {
        return;
      }

      expect(level1?.containedElements).toContain(wallL1Id);
      expect(level1?.containedElements).toContain(slabL1Id);
      expect(level2?.containedElements).toContain(wallL2Id);
    } finally {
      reader.close();
    }
  });

  it('maps each element expressId to its storey via containment map', async () => {
    const { model, meta } = buildMultiStoreyModel();
    const { reader, containment } = await readTree(model);
    try {
      const wallL1Id = reader.expressIdFromGuid(meta.wallL1Guid);
      const slabL1Id = reader.expressIdFromGuid(meta.slabL1Guid);
      const wallL2Id = reader.expressIdFromGuid(meta.wallL2Guid);
      const level1Id = reader.expressIdFromGuid(meta.level1.guid);
      const level2Id = reader.expressIdFromGuid(meta.level2.guid);
      if (
        wallL1Id === undefined ||
        slabL1Id === undefined ||
        wallL2Id === undefined ||
        level1Id === undefined ||
        level2Id === undefined
      ) {
        throw new Error('expected all express ids to resolve');
      }

      expect(containment.get(wallL1Id)).toBe(level1Id);
      expect(containment.get(slabL1Id)).toBe(level1Id);
      expect(containment.get(wallL2Id)).toBe(level2Id);
      expect(containment.size).toBe(3);
    } finally {
      reader.close();
    }
  });

  it('handles a project-only model: root present, empty containment', async () => {
    const model = new BimModel();
    const initResult = model.init({ name: 'Lonely' });
    if (!initResult.ok) throw new Error(initResult.error.message);
    const { reader, tree, containment } = await readTree(model);
    try {
      expect(tree).not.toBeNull();
      expect(tree?.category).toBe('PROJECT');
      expect(containment.size).toBe(0);
    } finally {
      reader.close();
    }
  });
});
