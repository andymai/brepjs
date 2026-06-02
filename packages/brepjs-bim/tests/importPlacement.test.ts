import { describe, it, expect, beforeAll } from 'vitest';
import * as WebIFC from 'web-ifc';
import { initOCCT } from '../../../tests/setup.js';
import { BimModel } from '../src/model/bimModel.js';
import { toIfc } from '../src/serialize/toIfc.js';
import { SpfReader } from '../src/import/spfReader.js';
import {
  readLengthScale,
  composeWorldPlacement,
  composeWorldMatrix,
  decomposePlacement,
  readGeoref,
  identityMatrix,
} from '../src/import/placement.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

const META = { applicationName: 'brepjs-bim', applicationVersion: '0.1.0' };

interface PlacedModel {
  readonly model: BimModel;
  readonly wallGuid: string;
  readonly origin: readonly [number, number, number];
  readonly storeyElevation: number;
}

// Builds a project/site/building/storey with one wall placed at a known
// non-trivial origin, rotated so axisX points along world +Y. The storey sits
// at a non-zero elevation so the composed world placement must account for the
// full IfcLocalPlacement chain, not just the wall's relative placement.
function buildPlacedModel(): PlacedModel {
  const model = new BimModel();
  const initResult = model.init({ name: 'Placement Project' });
  if (!initResult.ok) throw new Error(initResult.error.message);
  const projectId = initResult.value;
  const siteId = model.addSite({ name: 'Site' });
  const buildingId = model.addBuilding({ name: 'Building' });
  const storeyElevation = 3500;
  const storeyId = model.addStorey({ name: 'L1', elevation: storeyElevation });
  model.aggregate(projectId, siteId);
  model.aggregate(siteId, buildingId);
  model.aggregate(buildingId, storeyId);

  const origin: [number, number, number] = [1200, -800, 250];
  const wall = model.addWall({
    length: 5000,
    height: 3000,
    thickness: 200,
    origin,
    // Rotate the wall 90 deg about Z: local X points along world +Y.
    axisX: [0, 1, 0],
    axisZ: [0, 0, 1],
    materialName: 'Concrete',
  });
  if (!wall.ok) throw new Error(wall.error.message);
  model.placeIn(wall.value, storeyId);

  const wallGuid = model.getWalls()[0]?.guid;
  if (wallGuid === undefined) throw new Error('wall guid missing');

  return { model, wallGuid, origin, storeyElevation };
}

async function bytesFor(model: BimModel): Promise<Uint8Array> {
  const result = await toIfc(model, META);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

async function openReader(bytes: Uint8Array): Promise<SpfReader> {
  const result = await SpfReader.create(bytes);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function objectPlacementId(reader: SpfReader, elementExpressId: number): number {
  const line = reader.getLine<Record<string, unknown>>(elementExpressId);
  if (line === null) throw new Error('element line missing');
  const op = line['ObjectPlacement'] as { value?: number } | undefined;
  if (op?.value === undefined) throw new Error('ObjectPlacement missing');
  return op.value;
}

describe('readLengthScale', () => {
  it('returns 1.0 (metres) for the writer-emitted SI METRE unit assignment', async () => {
    const { model } = buildPlacedModel();
    const reader = await openReader(await bytesFor(model));
    try {
      expect(readLengthScale(reader)).toBeCloseTo(1.0, 9);
    } finally {
      reader.close();
    }
  });
});

describe('placement round-trip', () => {
  it('recovers the wall world origin (storey elevation + relative origin) in mm', async () => {
    const placed = buildPlacedModel();
    const reader = await openReader(await bytesFor(placed.model));
    try {
      reader.buildGuidMap();
      const wallId = reader.expressIdFromGuid(placed.wallGuid);
      expect(wallId).toBeDefined();
      if (wallId === undefined) return;

      const scale = readLengthScale(reader);
      const placementId = objectPlacementId(reader, wallId);
      const world = composeWorldPlacement(reader, placementId, scale);
      expect(world).not.toBeNull();
      if (world === null) return;

      // World origin = wall relative origin + storey elevation in Z, all in mm.
      expect(world.origin[0]).toBeCloseTo(placed.origin[0], 4);
      expect(world.origin[1]).toBeCloseTo(placed.origin[1], 4);
      expect(world.origin[2]).toBeCloseTo(placed.origin[2] + placed.storeyElevation, 4);
    } finally {
      reader.close();
    }
  });

  it('recovers the wall axes (local X along world +Y, Z up)', async () => {
    const placed = buildPlacedModel();
    const reader = await openReader(await bytesFor(placed.model));
    try {
      reader.buildGuidMap();
      const wallId = reader.expressIdFromGuid(placed.wallGuid);
      if (wallId === undefined) throw new Error('wall id missing');

      const scale = readLengthScale(reader);
      const placementId = objectPlacementId(reader, wallId);
      const world = composeWorldPlacement(reader, placementId, scale);
      if (world === null) throw new Error('world placement null');

      expect(world.axisX[0]).toBeCloseTo(0, 6);
      expect(world.axisX[1]).toBeCloseTo(1, 6);
      expect(world.axisX[2]).toBeCloseTo(0, 6);

      expect(world.axisZ[0]).toBeCloseTo(0, 6);
      expect(world.axisZ[1]).toBeCloseTo(0, 6);
      expect(world.axisZ[2]).toBeCloseTo(1, 6);
    } finally {
      reader.close();
    }
  });

  it('composeWorldMatrix and decomposePlacement agree with composeWorldPlacement', async () => {
    const placed = buildPlacedModel();
    const reader = await openReader(await bytesFor(placed.model));
    try {
      reader.buildGuidMap();
      const wallId = reader.expressIdFromGuid(placed.wallGuid);
      if (wallId === undefined) throw new Error('wall id missing');

      const scale = readLengthScale(reader);
      const placementId = objectPlacementId(reader, wallId);
      const matrix = composeWorldMatrix(reader, placementId, scale);
      expect(matrix).not.toBeNull();
      if (matrix === null) return;

      const decomposed = decomposePlacement(matrix);
      const direct = composeWorldPlacement(reader, placementId, scale);
      if (direct === null) throw new Error('direct placement null');

      for (let i = 0; i < 3; i++) {
        expect(decomposed.origin[i]).toBeCloseTo(direct.origin[i], 4);
        expect(decomposed.axisX[i]).toBeCloseTo(direct.axisX[i], 6);
        expect(decomposed.axisZ[i]).toBeCloseTo(direct.axisZ[i], 6);
      }
    } finally {
      reader.close();
    }
  });

  it('returns the identity-equivalent placement for an unrotated element at storey origin', async () => {
    const model = new BimModel();
    const initResult = model.init({ name: 'Origin Project' });
    if (!initResult.ok) throw new Error(initResult.error.message);
    const projectId = initResult.value;
    const siteId = model.addSite({ name: 'Site' });
    const buildingId = model.addBuilding({ name: 'Building' });
    const storeyId = model.addStorey({ name: 'L0', elevation: 0 });
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
    });
    if (!wall.ok) throw new Error(wall.error.message);
    model.placeIn(wall.value, storeyId);
    const guid = model.getWalls()[0]?.guid;
    if (guid === undefined) throw new Error('guid missing');

    const reader = await openReader(await bytesFor(model));
    try {
      reader.buildGuidMap();
      const wallId = reader.expressIdFromGuid(guid);
      if (wallId === undefined) throw new Error('wall id missing');
      const scale = readLengthScale(reader);
      const matrix = composeWorldMatrix(reader, objectPlacementId(reader, wallId), scale);
      if (matrix === null) throw new Error('matrix null');
      const id = identityMatrix();
      for (let i = 0; i < 16; i++) {
        expect(matrix[i]).toBeCloseTo(id[i] ?? 0, 6);
      }
    } finally {
      reader.close();
    }
  });
});

describe('readGeoref', () => {
  it('returns null when no IfcMapConversion/IfcProjectedCRS is present', async () => {
    const { model } = buildPlacedModel();
    const reader = await openReader(await bytesFor(model));
    try {
      expect(reader.getLinesOfType(WebIFC.IFCMAPCONVERSION).length).toBe(0);
      expect(readGeoref(reader, readLengthScale(reader))).toBeNull();
    } finally {
      reader.close();
    }
  });
});
