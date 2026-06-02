import { describe, it, expect, beforeAll } from 'vitest';
import * as WebIFC from 'web-ifc';
import { initOCCT } from '../../../tests/setup.js';
import { railingToSolid } from '../src/elementFns/railingFns.js';
import { parseRailingSpec } from '../src/specs/railingSpec.js';
import { IfcWriter } from '../src/ifc-writer/ifcWriter.js';
import { writeRailingGeometry, writeRailingEntity } from '../src/ifc-writer/railingWriter.js';
import { deriveIfcGuidSync, makeElementKey } from '../src/identity/guidDerivation.js';
import { writeHeader } from '../src/ifc-writer/headerWriter.js';
import { measureVolume } from 'brepjs';

beforeAll(async () => { await initOCCT(); }, 30000);

const spec = {
  length: 4000,
  height: 1000,
  thickness: 50,
  origin: [0, 0, 0] as [number, number, number],
  axisX: [1, 0, 0] as [number, number, number],
  axisZ: [0, 0, 1] as [number, number, number],
  predefinedType: 'GUARDRAIL' as const,
  materialName: 'Steel',
};

describe('railingToSolid', () => {
  it('returns a ValidSolid', () => {
    const result = railingToSolid(spec);
    expect(result.ok).toBe(true);
  });

  it('volume matches length × height × thickness in mm³', () => {
    const result = railingToSolid(spec);
    if (!result.ok) throw new Error(result.error.message);
    const vol = measureVolume(result.value);
    if (!vol.ok) throw new Error(vol.error.message);
    const expected = 4000 * 1000 * 50;
    expect(vol.value).toBeCloseTo(expected, -3);
  });

  it('rejects zero length', () => {
    const result = railingToSolid({ ...spec, length: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('BIM_SPEC');
    expect(result.error.code).toBe('RAILING_ZERO_LENGTH');
  });

  it('rejects zero height', () => {
    const result = railingToSolid({ ...spec, height: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('RAILING_ZERO_HEIGHT');
  });

  it('rejects negative thickness', () => {
    const result = railingToSolid({ ...spec, thickness: -1 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('RAILING_ZERO_THICKNESS');
  });
});

describe('parseRailingSpec', () => {
  const valid = {
    length: 4000,
    height: 1000,
    thickness: 50,
    origin: [0, 0, 0],
    axisX: [1, 0, 0],
    axisZ: [0, 0, 1],
    materialName: 'Steel',
  };

  it('accepts a valid spec', () => {
    expect(parseRailingSpec(valid).ok).toBe(true);
  });

  it('accepts each predefined type', () => {
    for (const t of ['BALUSTRADE', 'GUARDRAIL', 'HANDRAIL', 'NOTDEFINED']) {
      expect(parseRailingSpec({ ...valid, predefinedType: t }).ok).toBe(true);
    }
  });

  it('rejects an unknown predefined type', () => {
    expect(parseRailingSpec({ ...valid, predefinedType: 'FENCE' }).ok).toBe(false);
  });

  it('rejects non-unit axisX', () => {
    const result = parseRailingSpec({ ...valid, axisX: [2, 0, 0] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_RAILING_SPEC');
  });

  it('rejects non-orthogonal axes', () => {
    expect(parseRailingSpec({ ...valid, axisX: [1, 0, 0], axisZ: [1, 0, 0] }).ok).toBe(false);
  });

  it('rejects zero or negative dimensions', () => {
    expect(parseRailingSpec({ ...valid, length: 0 }).ok).toBe(false);
    expect(parseRailingSpec({ ...valid, height: -1 }).ok).toBe(false);
  });

  it('rejects missing required fields', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { materialName: _, ...noMaterial } = valid;
    expect(parseRailingSpec(noMaterial).ok).toBe(false);
  });

  it('accepts Pset_RailingCommon and manufacturer fields', () => {
    const result = parseRailingSpec({
      ...valid,
      isExternal: true,
      fireRating: 'A1',
      status: 'NEW',
      manufacturerName: 'Acme',
    });
    expect(result.ok).toBe(true);
  });
});

describe('railing IFC serialization', () => {
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

  it('emits exactly one IfcRailing with a non-null representation', async () => {
    const w = await makeWriter();
    const ids = writeHeader(w, { applicationName: 'test', applicationVersion: '0' });
    const geom = writeRailingGeometry(w, spec, ids.geomSubContextId, null);
    const guid = deriveIfcGuidSync(makeElementKey('RAILING', 1));
    writeRailingEntity(
      w,
      guid,
      'Guardrail',
      'GUARDRAIL',
      ids.ownerHistoryId,
      geom.localPlacementId,
      geom.productDefinitionShapeId
    );

    const { api, mid } = await openSaved(w);
    const railingIds = api.GetLineIDsWithType(mid, WebIFC.IFCRAILING);
    expect(railingIds.size()).toBe(1);

    const railing = api.GetLine(mid, railingIds.get(0)) as Record<string, unknown>;
    expect(railing['Representation']).not.toBeNull();
    const pred = (railing['PredefinedType'] as { value?: string } | undefined)?.value;
    expect(pred).toBe('GUARDRAIL');
    const extrusions = api.GetLineIDsWithType(mid, WebIFC.IFCEXTRUDEDAREASOLID);
    expect(extrusions.size()).toBe(1);

    api.CloseModel(mid);
  });
});
