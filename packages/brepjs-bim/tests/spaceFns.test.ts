import { describe, it, expect, beforeAll } from 'vitest';
import * as WebIFC from 'web-ifc';
import { initOCCT } from '../../../tests/setup.js';
import { measureVolume } from 'brepjs';
import { spaceToSolid } from '../src/elementFns/spaceFns.js';
import { parseSpaceSpec } from '../src/specs/spaceSpec.js';
import { IfcWriter } from '../src/ifc-writer/ifcWriter.js';
import { writeHeader } from '../src/ifc-writer/headerWriter.js';
import {
  writeSpaceGeometry,
  writeSpaceEntity,
  writeRelSpaceBoundary,
} from '../src/ifc-writer/spaceWriter.js';
import { deriveIfcGuidSync, makeElementKey, makeRelKey } from '../src/identity/guidDerivation.js';
import { newIfcGuid, isValidIfcGuid } from '../src/identity/ifcGuid.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

const baseSpec = {
  name: 'Office 101',
  length: 4000,
  width: 3000,
  height: 2700,
  origin: [0, 0, 0] as [number, number, number],
  axisX: [1, 0, 0] as [number, number, number],
  axisZ: [0, 0, 1] as [number, number, number],
  materialName: 'Air',
};

describe('spaceToSolid', () => {
  it('returns a ValidSolid', () => {
    const result = spaceToSolid(baseSpec);
    expect(result.ok).toBe(true);
  });

  it('volume matches length × width × height in mm³', () => {
    const result = spaceToSolid(baseSpec);
    if (!result.ok) throw new Error(result.error.message);
    const vol = measureVolume(result.value);
    if (!vol.ok) throw new Error(vol.error.message);
    const expected = 4000 * 3000 * 2700;
    expect(vol.value).toBeCloseTo(expected, -3);
  });

  it('rejects zero length', () => {
    const result = spaceToSolid({ ...baseSpec, length: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('BIM_SPEC');
    expect(result.error.code).toBe('SPACE_ZERO_LENGTH');
  });

  it('rejects zero width', () => {
    const result = spaceToSolid({ ...baseSpec, width: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('SPACE_ZERO_WIDTH');
  });

  it('rejects negative height', () => {
    const result = spaceToSolid({ ...baseSpec, height: -1 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('SPACE_ZERO_HEIGHT');
  });
});

describe('parseSpaceSpec', () => {
  it('accepts a valid spec', () => {
    expect(parseSpaceSpec(baseSpec).ok).toBe(true);
  });

  it('accepts a predefinedType and longName', () => {
    const result = parseSpaceSpec({
      ...baseSpec,
      predefinedType: 'INTERNAL',
      longName: 'Open-plan office',
      isExternal: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.predefinedType).toBe('INTERNAL');
    expect(result.value.longName).toBe('Open-plan office');
  });

  it('rejects an unknown predefinedType', () => {
    const result = parseSpaceSpec({ ...baseSpec, predefinedType: 'BOGUS' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_SPACE_SPEC');
  });

  it('rejects non-unit axisX', () => {
    const result = parseSpaceSpec({ ...baseSpec, axisX: [2, 0, 0] });
    expect(result.ok).toBe(false);
  });

  it('rejects non-orthogonal axes', () => {
    const result = parseSpaceSpec({ ...baseSpec, axisX: [1, 0, 0], axisZ: [1, 0, 0] });
    expect(result.ok).toBe(false);
  });

  it('rejects missing materialName', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { materialName: _, ...rest } = baseSpec;
    expect(parseSpaceSpec(rest).ok).toBe(false);
  });

  it('rejects zero or negative dimensions', () => {
    expect(parseSpaceSpec({ ...baseSpec, length: 0 }).ok).toBe(false);
    expect(parseSpaceSpec({ ...baseSpec, height: -1 }).ok).toBe(false);
  });
});

async function makeWriter(): Promise<IfcWriter> {
  const result = await IfcWriter.create();
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

async function openSaved(w: IfcWriter): Promise<{ api: WebIFC.IfcAPI; mid: number }> {
  const saved = w.save();
  if (!saved.ok) throw new Error(saved.error.message);
  const api = new WebIFC.IfcAPI();
  await api.Init();
  const mid = api.OpenModel(saved.value);
  return { api, mid };
}

function writeBoundingWall(w: IfcWriter, ownerHistoryId: number): number {
  return w.writeLine({
    expressID: w.nextId(),
    type: WebIFC.IFCWALL,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, newIfcGuid()),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: w.mkType(WebIFC.IFCLABEL, 'Bounding Wall'),
    Description: null,
    ObjectType: null,
    ObjectPlacement: null,
    Representation: null,
    Tag: null,
    PredefinedType: null,
  });
}

describe('spaceWriter serialization', () => {
  it('serializes an IfcSpace with a non-null body Representation', async () => {
    const w = await makeWriter();
    const header = writeHeader(w, {
      applicationName: 'brepjs-bim',
      applicationVersion: '0.1.0',
    });

    const geom = writeSpaceGeometry(w, baseSpec, header.geomSubContextId, null);
    const guid = deriveIfcGuidSync(makeElementKey('SPACE', 1));
    const spaceId = writeSpaceEntity(
      w,
      guid,
      baseSpec.name,
      baseSpec.name,
      'INTERNAL',
      header.ownerHistoryId,
      geom.localPlacementId,
      geom.productDefinitionShapeId
    );
    expect(spaceId).toBeGreaterThan(0);

    const { api, mid } = await openSaved(w);
    const spaceIds = api.GetLineIDsWithType(mid, WebIFC.IFCSPACE);
    expect(spaceIds.size()).toBe(1);

    const space = api.GetLine(mid, spaceIds.get(0)) as Record<string, unknown>;
    expect(space['Representation']).not.toBeNull();
    const spaceGuid = (space['GlobalId'] as { value?: string } | undefined)?.value;
    expect(typeof spaceGuid).toBe('string');
    expect(isValidIfcGuid(spaceGuid as string)).toBe(true);

    // Body geometry present: at least one swept solid + shape representation.
    expect(api.GetLineIDsWithType(mid, WebIFC.IFCEXTRUDEDAREASOLID).size()).toBeGreaterThan(0);

    api.CloseModel(mid);
  });

  it('serializes an IfcRelSpaceBoundary tying the space to a bounding element', async () => {
    const w = await makeWriter();
    const header = writeHeader(w, {
      applicationName: 'brepjs-bim',
      applicationVersion: '0.1.0',
    });

    const wallId = writeBoundingWall(w, header.ownerHistoryId);
    const geom = writeSpaceGeometry(w, baseSpec, header.geomSubContextId, null);
    const spaceGuid = deriveIfcGuidSync(makeElementKey('SPACE', 1));
    const spaceId = writeSpaceEntity(
      w,
      spaceGuid,
      baseSpec.name,
      baseSpec.name,
      'INTERNAL',
      header.ownerHistoryId,
      geom.localPlacementId,
      geom.productDefinitionShapeId
    );

    const relGuid = deriveIfcGuidSync(makeRelKey('SPACE_BOUNDARY', 1));
    writeRelSpaceBoundary(w, relGuid, header.ownerHistoryId, spaceId, wallId, 'PHYSICAL');

    const { api, mid } = await openSaved(w);
    const relIds = api.GetLineIDsWithType(mid, WebIFC.IFCRELSPACEBOUNDARY);
    expect(relIds.size()).toBe(1);

    const rel = api.GetLine(mid, relIds.get(0)) as Record<string, unknown>;
    const relatingSpace = (rel['RelatingSpace'] as { value?: number } | undefined)?.value;
    const relatedElement = (rel['RelatedBuildingElement'] as { value?: number } | undefined)?.value;
    expect(relatingSpace).toBe(spaceId);
    expect(relatedElement).toBe(wallId);

    api.CloseModel(mid);
  });
});
