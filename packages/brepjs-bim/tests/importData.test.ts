import { describe, it, expect, beforeAll } from 'vitest';
import * as WebIFC from 'web-ifc';
import { initOCCT } from '../../../tests/setup.js';
import { BimModel } from '../src/model/bimModel.js';
import { toIfc } from '../src/serialize/toIfc.js';
import { SpfReader } from '../src/import/spfReader.js';
import {
  readPsets,
  readMaterial,
  readClassification,
  readVoids,
  readOwnerHistory,
} from '../src/import/dataRead.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

const META = { applicationName: 'brepjs-bim', applicationVersion: '0.1.0' };

interface Built {
  readonly model: BimModel;
  readonly wallGuid: string;
}

/**
 * A wall carrying a custom Pset, a simple material association and a door — the
 * door cuts an IfcOpeningElement that voids the wall (IfcRelVoidsElement) and is
 * itself filled into that opening (IfcRelFillsElement).
 */
function buildModel(): Built {
  const model = new BimModel();
  const initResult = model.init({ name: 'Import Data Project' });
  if (!initResult.ok) throw new Error(initResult.error.message);
  const projectId = initResult.value;
  const siteId = model.addSite({ name: 'Site' });
  const buildingId = model.addBuilding({ name: 'Building' });
  const storeyId = model.addStorey({ name: 'L1', elevation: 0 });
  model.aggregate(projectId, siteId);
  model.aggregate(siteId, buildingId);
  model.aggregate(buildingId, storeyId);

  const wall = model.addWall({
    length: 5000,
    height: 3000,
    thickness: 200,
    origin: [0, 0, 0],
    axisX: [1, 0, 0],
    axisZ: [0, 0, 1],
    materialName: 'Concrete',
    isExternal: true,
    fireRating: 'REI120',
    classification: { system: 'Uniclass', code: 'EF_25_10', description: 'Walls' },
    customProperties: {
      Pset_Custom: { Cost: 1234.5, Vendor: 'Acme', Approved: true },
    },
  });
  if (!wall.ok) throw new Error(wall.error.message);
  model.placeIn(wall.value, storeyId);

  const door = model.addDoor({
    wallLocalId: wall.value,
    width: 900,
    height: 2100,
    offsetAlongWall: 1000,
    offsetFromFloor: 0,
    materialName: 'Timber',
  });
  if (!door.ok) throw new Error(door.error.message);

  const wallGuid = model.getWalls()[0]?.guid;
  if (wallGuid === undefined) throw new Error('wall guid missing');
  return { model, wallGuid };
}

async function readerFor(built: Built): Promise<SpfReader> {
  const result = await toIfc(built.model, META);
  if (!result.ok) throw new Error(result.error.message);
  const readerResult = await SpfReader.create(result.value);
  if (!readerResult.ok) throw new Error(readerResult.error.message);
  const reader = readerResult.value;
  reader.buildGuidMap();
  return reader;
}

function wallExpressId(reader: SpfReader, guid: string): number {
  const id = reader.expressIdFromGuid(guid);
  if (id === undefined) throw new Error('wall expressId not resolved from guid');
  return id;
}

describe('dataRead — round-trip data readback', () => {
  it('reads back a custom Pset with its name and typed values', async () => {
    const built = buildModel();
    const reader = await readerFor(built);
    try {
      const wallId = wallExpressId(reader, built.wallGuid);
      const psets = readPsets(reader, wallId);
      const custom = psets.find((p) => p.name === 'Pset_Custom');
      expect(custom).toBeDefined();
      if (custom === undefined) return;
      expect(custom.properties['Cost']).toBeCloseTo(1234.5, 3);
      expect(custom.properties['Vendor']).toBe('Acme');
      expect(custom.properties['Approved']).toBe(true);
    } finally {
      reader.close();
    }
  });

  it('reads back the Pset_WallCommon set written from the wall template', async () => {
    const built = buildModel();
    const reader = await readerFor(built);
    try {
      const wallId = wallExpressId(reader, built.wallGuid);
      const psets = readPsets(reader, wallId);
      const common = psets.find((p) => p.name === 'Pset_WallCommon');
      expect(common).toBeDefined();
      expect(common?.properties['IsExternal']).toBe(true);
      expect(common?.properties['FireRating']).toBe('REI120');
    } finally {
      reader.close();
    }
  });

  it('reads back the associated material name', async () => {
    const built = buildModel();
    const reader = await readerFor(built);
    try {
      const wallId = wallExpressId(reader, built.wallGuid);
      const material = readMaterial(reader, wallId);
      expect(material).not.toBeNull();
      expect(material?.name).toBe('Concrete');
    } finally {
      reader.close();
    }
  });

  it('reads back the classification system and code', async () => {
    const built = buildModel();
    const reader = await readerFor(built);
    try {
      const wallId = wallExpressId(reader, built.wallGuid);
      const classification = readClassification(reader, wallId);
      expect(classification).not.toBeNull();
      expect(classification?.system).toBe('Uniclass');
      expect(classification?.code).toBe('EF_25_10');
    } finally {
      reader.close();
    }
  });

  it('reads back the opening that voids the wall and the door that fills it', async () => {
    const built = buildModel();
    const reader = await readerFor(built);
    try {
      const wallId = wallExpressId(reader, built.wallGuid);
      const voids = readVoids(reader, wallId);
      expect(voids.length).toBe(1);
      const relation = voids[0];
      expect(relation).toBeDefined();
      if (relation === undefined) return;

      // The voided element is an opening...
      expect(reader.getLineType(relation.openingExpressId)).toBe(WebIFC.IFCOPENINGELEMENT);
      // ...and a door fills it.
      expect(relation.fillerExpressId).toBeDefined();
      if (relation.fillerExpressId === undefined) return;
      expect(reader.getLineType(relation.fillerExpressId)).toBe(WebIFC.IFCDOOR);
    } finally {
      reader.close();
    }
  });

  it('preserves the wall GlobalId across the round-trip', async () => {
    const built = buildModel();
    const reader = await readerFor(built);
    try {
      const wallId = wallExpressId(reader, built.wallGuid);
      expect(reader.guidFromExpressId(wallId)).toBe(built.wallGuid);
    } finally {
      reader.close();
    }
  });

  it('reads OwnerHistory application metadata', async () => {
    const built = buildModel();
    const reader = await readerFor(built);
    try {
      const wallId = wallExpressId(reader, built.wallGuid);
      const wall = reader.getLine<Record<string, unknown>>(wallId);
      const ownerRef = wall?.['OwnerHistory'] as { value?: number } | undefined;
      expect(ownerRef?.value).toBeDefined();
      if (ownerRef?.value === undefined) return;
      const owner = readOwnerHistory(reader, ownerRef.value);
      expect(owner).not.toBeNull();
      expect(owner?.applicationName).toBe('brepjs-bim');
    } finally {
      reader.close();
    }
  });
});
