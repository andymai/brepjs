import { describe, it, expect, beforeAll } from 'vitest';
import * as WebIFC from 'web-ifc';
import { initOCCT } from '../../../tests/setup.js';
import { coveringToSolid } from '../src/elementFns/coveringFns.js';
import { parseCoveringSpec } from '../src/specs/coveringSpec.js';
import { IfcWriter } from '../src/ifc-writer/ifcWriter.js';
import {
  writeCoveringGeometry,
  writeCoveringEntity,
  writeRelCoversBldgElements,
} from '../src/ifc-writer/coveringWriter.js';
import { deriveIfcGuidSync, makeElementKey, makeRelKey } from '../src/identity/guidDerivation.js';
import { writeHeader } from '../src/ifc-writer/headerWriter.js';
import { measureVolume } from 'brepjs';

beforeAll(async () => { await initOCCT(); }, 30000);

const spec = {
  length: 3000,
  width: 2000,
  thickness: 10,
  origin: [0, 0, 0] as [number, number, number],
  axisX: [1, 0, 0] as [number, number, number],
  axisZ: [0, 0, 1] as [number, number, number],
  predefinedType: 'FLOORING' as const,
  materialName: 'Tile',
};

describe('coveringToSolid', () => {
  it('returns a ValidSolid', () => {
    const result = coveringToSolid(spec);
    expect(result.ok).toBe(true);
  });

  it('volume matches length × width × thickness in mm³', () => {
    const result = coveringToSolid(spec);
    if (!result.ok) throw new Error(result.error.message);
    const vol = measureVolume(result.value);
    if (!vol.ok) throw new Error(vol.error.message);
    const expected = 3000 * 2000 * 10;
    expect(vol.value).toBeCloseTo(expected, -3);
  });

  it('rejects zero length', () => {
    const result = coveringToSolid({ ...spec, length: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('COVERING_ZERO_LENGTH');
  });

  it('rejects zero width', () => {
    const result = coveringToSolid({ ...spec, width: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('COVERING_ZERO_WIDTH');
  });

  it('rejects negative thickness', () => {
    const result = coveringToSolid({ ...spec, thickness: -1 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('COVERING_ZERO_THICKNESS');
  });
});

describe('parseCoveringSpec', () => {
  const valid = {
    length: 3000,
    width: 2000,
    thickness: 10,
    origin: [0, 0, 0],
    axisX: [1, 0, 0],
    axisZ: [0, 0, 1],
    materialName: 'Tile',
  };

  it('accepts a valid spec', () => {
    expect(parseCoveringSpec(valid).ok).toBe(true);
  });

  it('accepts each predefined type', () => {
    for (const t of [
      'CEILING',
      'FLOORING',
      'CLADDING',
      'ROOFING',
      'MOLDING',
      'SKIRTINGBOARD',
      'INSULATION',
      'MEMBRANE',
      'SLEEVING',
      'WRAPPING',
      'NOTDEFINED',
    ]) {
      expect(parseCoveringSpec({ ...valid, predefinedType: t }).ok).toBe(true);
    }
  });

  it('rejects an unknown predefined type', () => {
    expect(parseCoveringSpec({ ...valid, predefinedType: 'PAINT' }).ok).toBe(false);
  });

  it('rejects non-unit axisZ', () => {
    expect(parseCoveringSpec({ ...valid, axisZ: [0, 0, 2] }).ok).toBe(false);
  });

  it('rejects non-orthogonal axes', () => {
    expect(parseCoveringSpec({ ...valid, axisX: [1, 0, 0], axisZ: [1, 0, 0] }).ok).toBe(false);
  });

  it('rejects zero or negative dimensions', () => {
    expect(parseCoveringSpec({ ...valid, length: 0 }).ok).toBe(false);
    expect(parseCoveringSpec({ ...valid, thickness: -1 }).ok).toBe(false);
  });

  it('rejects missing required fields', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { materialName: _, ...noMaterial } = valid;
    expect(parseCoveringSpec(noMaterial).ok).toBe(false);
  });

  it('accepts Pset_CoveringCommon fields', () => {
    const result = parseCoveringSpec({
      ...valid,
      isExternal: false,
      fireRating: 'A2',
      thermalTransmittance: 0.25,
      status: 'NEW',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.thermalTransmittance).toBe(0.25);
  });

  it('rejects non-positive thermalTransmittance', () => {
    expect(parseCoveringSpec({ ...valid, thermalTransmittance: -1 }).ok).toBe(false);
  });
});

describe('covering IFC serialization', () => {
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

  // Minimal host element so the covering can relate to a building element.
  function writeHostSlab(w: IfcWriter, ownerHistoryId: number): number {
    return w.writeLine({
      expressID: w.nextId(),
      type: WebIFC.IFCSLAB,
      GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, deriveIfcGuidSync(makeElementKey('SLAB', 99))),
      OwnerHistory: w.ref(ownerHistoryId),
      Name: w.mkType(WebIFC.IFCLABEL, 'HostSlab'),
      Description: null,
      ObjectType: null,
      ObjectPlacement: null,
      Representation: null,
      Tag: null,
      PredefinedType: { type: 3, value: 'FLOOR' },
    });
  }

  it('emits exactly one IfcCovering with a non-null representation', async () => {
    const w = await makeWriter();
    const ids = writeHeader(w, { applicationName: 'test', applicationVersion: '0' });
    const geom = writeCoveringGeometry(w, spec, ids.geomSubContextId, null);
    const guid = deriveIfcGuidSync(makeElementKey('COVERING', 1));
    writeCoveringEntity(
      w,
      guid,
      'FloorFinish',
      'FLOORING',
      ids.ownerHistoryId,
      geom.localPlacementId,
      geom.productDefinitionShapeId
    );

    const { api, mid } = await openSaved(w);
    const coveringIds = api.GetLineIDsWithType(mid, WebIFC.IFCCOVERING);
    expect(coveringIds.size()).toBe(1);

    const covering = api.GetLine(mid, coveringIds.get(0)) as Record<string, unknown>;
    expect(covering['Representation']).not.toBeNull();
    const pred = (covering['PredefinedType'] as { value?: string } | undefined)?.value;
    expect(pred).toBe('FLOORING');

    api.CloseModel(mid);
  });

  it('relates the covering to its host via IfcRelCoversBldgElements', async () => {
    const w = await makeWriter();
    const ids = writeHeader(w, { applicationName: 'test', applicationVersion: '0' });
    const hostId = writeHostSlab(w, ids.ownerHistoryId);
    const geom = writeCoveringGeometry(w, spec, ids.geomSubContextId, null);
    const guid = deriveIfcGuidSync(makeElementKey('COVERING', 1));
    const coveringId = writeCoveringEntity(
      w,
      guid,
      'CeilingFinish',
      'CEILING',
      ids.ownerHistoryId,
      geom.localPlacementId,
      geom.productDefinitionShapeId
    );
    const relGuid = deriveIfcGuidSync(makeRelKey('COVERS', 1));
    writeRelCoversBldgElements(w, relGuid, ids.ownerHistoryId, hostId, [coveringId]);

    const { api, mid } = await openSaved(w);
    const relIds = api.GetLineIDsWithType(mid, WebIFC.IFCRELCOVERSBLDGELEMENTS);
    expect(relIds.size()).toBe(1);

    const rel = api.GetLine(mid, relIds.get(0)) as Record<string, unknown>;
    const relating = (rel['RelatingBuildingElement'] as { value?: number } | undefined)?.value;
    expect(relating).toBe(hostId);
    const related = (rel['RelatedCoverings'] ?? []) as Array<{ value: number }>;
    expect(related).toHaveLength(1);
    expect(related[0]?.value).toBe(coveringId);

    api.CloseModel(mid);
  });
});
