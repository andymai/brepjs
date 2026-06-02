import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import { measureVolume } from 'brepjs';
import * as WebIFC from 'web-ifc';
import { footingToSolid, pileToSolid } from '../src/elementFns/foundationFns.js';
import { parseFootingSpec, parsePileSpec } from '../src/specs/foundationSpec.js';
import { IfcWriter } from '../src/ifc-writer/ifcWriter.js';
import { writeHeader } from '../src/ifc-writer/headerWriter.js';
import { writeFootingEntity, writeFootingGeometry, writePileEntity, writePileGeometry } from '../src/ifc-writer/foundationWriter.js';
import { deriveIfcGuidSync } from '../src/identity/guidDerivation.js';
import type { FootingSpec, PileSpec } from '../src/specs/foundationSpec.js';

beforeAll(async () => { await initOCCT(); }, 30000);

const footingSpec: FootingSpec = {
  length: 2000,
  width: 1500,
  thickness: 400,
  origin: [0, 0, 0],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  predefinedType: 'PAD_FOOTING',
  materialName: 'Concrete',
};

const pileSpec: PileSpec = {
  length: 12000,
  profile: { kind: 'CIRCULAR', radius: 300 },
  origin: [0, 0, 0],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  predefinedType: 'BORED',
  constructionType: 'CAST_IN_PLACE',
  materialName: 'Concrete',
};

describe('footingToSolid', () => {
  it('returns a ValidSolid', () => {
    const result = footingToSolid(footingSpec);
    expect(result.ok).toBe(true);
  });

  it('volume matches length × width × thickness in mm³', () => {
    const result = footingToSolid(footingSpec);
    if (!result.ok) throw new Error(result.error.message);
    const vol = measureVolume(result.value);
    if (!vol.ok) throw new Error(vol.error.message);
    expect(vol.value).toBeCloseTo(2000 * 1500 * 400, -3);
  });

  it('rejects zero length', () => {
    const result = footingToSolid({ ...footingSpec, length: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('FOOTING_ZERO_LENGTH');
  });

  it('rejects zero width', () => {
    const result = footingToSolid({ ...footingSpec, width: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('FOOTING_ZERO_WIDTH');
  });

  it('rejects negative thickness', () => {
    const result = footingToSolid({ ...footingSpec, thickness: -1 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('FOOTING_ZERO_THICKNESS');
  });
});

describe('pileToSolid', () => {
  it('returns a ValidSolid', () => {
    const result = pileToSolid(pileSpec);
    expect(result.ok).toBe(true);
  });

  it('circular pile volume ≈ π r² × length', () => {
    const result = pileToSolid(pileSpec);
    if (!result.ok) throw new Error(result.error.message);
    const vol = measureVolume(result.value);
    if (!vol.ok) throw new Error(vol.error.message);
    // 32-segment polygon under-approximates the true circle area slightly.
    const exact = Math.PI * 300 * 300 * 12000;
    expect(vol.value).toBeGreaterThan(exact * 0.98);
    expect(vol.value).toBeLessThan(exact);
  });

  it('rectangular pile volume matches profile × length', () => {
    const result = pileToSolid({
      ...pileSpec,
      profile: { kind: 'RECTANGULAR', width: 400, height: 600 },
    });
    if (!result.ok) throw new Error(result.error.message);
    const vol = measureVolume(result.value);
    if (!vol.ok) throw new Error(vol.error.message);
    expect(vol.value).toBeCloseTo(400 * 600 * 12000, -3);
  });

  it('rejects zero length', () => {
    const result = pileToSolid({ ...pileSpec, length: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('PILE_ZERO_LENGTH');
  });
});

describe('parseFootingSpec', () => {
  it('accepts a valid spec', () => {
    expect(parseFootingSpec(footingSpec).ok).toBe(true);
  });

  it('defaults predefinedType to NOTDEFINED when omitted', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { predefinedType: _omit, ...rest } = footingSpec;
    const result = parseFootingSpec(rest);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.predefinedType).toBe('NOTDEFINED');
  });

  it('rejects non-unit axisX', () => {
    const result = parseFootingSpec({ ...footingSpec, axisX: [2, 0, 0] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_FOOTING_SPEC');
  });

  it('rejects non-orthogonal axes', () => {
    const result = parseFootingSpec({ ...footingSpec, axisX: [1, 0, 0], axisZ: [1, 0, 0] });
    expect(result.ok).toBe(false);
  });

  it('rejects zero dimensions', () => {
    expect(parseFootingSpec({ ...footingSpec, length: 0 }).ok).toBe(false);
    expect(parseFootingSpec({ ...footingSpec, thickness: -1 }).ok).toBe(false);
  });

  it('rejects missing materialName', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { materialName: _omit, ...rest } = footingSpec;
    expect(parseFootingSpec(rest).ok).toBe(false);
  });

  it('accepts Pset + classification fields', () => {
    const result = parseFootingSpec({
      ...footingSpec,
      isExternal: true,
      loadBearing: true,
      fireRating: 'REI120',
      status: 'NEW',
      classification: { system: 'Uniclass2015', code: 'Ss_20', description: 'Foundations' },
    });
    expect(result.ok).toBe(true);
  });
});

describe('parsePileSpec', () => {
  it('accepts a valid spec', () => {
    expect(parsePileSpec(pileSpec).ok).toBe(true);
  });

  it('defaults predefinedType to NOTDEFINED when omitted', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { predefinedType: _omit, ...rest } = pileSpec;
    const result = parsePileSpec(rest);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.predefinedType).toBe('NOTDEFINED');
  });

  it('accepts each construction type', () => {
    for (const constructionType of ['CAST_IN_PLACE', 'COMPOSITE', 'PRECAST_CONCRETE', 'PREFAB_STEEL'] as const) {
      expect(parsePileSpec({ ...pileSpec, constructionType }).ok).toBe(true);
    }
  });

  it('rejects an invalid profile', () => {
    const result = parsePileSpec({ ...pileSpec, profile: { kind: 'CIRCULAR', radius: 0 } });
    expect(result.ok).toBe(false);
  });

  it('rejects missing materialName', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { materialName: _omit, ...rest } = pileSpec;
    expect(parsePileSpec(rest).ok).toBe(false);
  });
});

describe('foundationWriter serialize round-trip', () => {
  async function buildModel(): Promise<{ api: WebIFC.IfcAPI; mid: number }> {
    const writerResult = await IfcWriter.create();
    if (!writerResult.ok) throw new Error(writerResult.error.message);
    const w = writerResult.value;
    const header = writeHeader(w, { applicationName: 'test', applicationVersion: '0' });

    const footingGeom = writeFootingGeometry(w, footingSpec, header.geomSubContextId, null);
    writeFootingEntity(
      w,
      deriveIfcGuidSync('footing:1'),
      'F1',
      footingSpec.predefinedType ?? 'NOTDEFINED',
      header.ownerHistoryId,
      footingGeom.localPlacementId,
      footingGeom.productDefinitionShapeId
    );

    const pileGeom = writePileGeometry(w, pileSpec, header.geomSubContextId, null);
    writePileEntity(
      w,
      deriveIfcGuidSync('pile:1'),
      'P1',
      pileSpec.predefinedType ?? 'NOTDEFINED',
      pileSpec.constructionType ?? null,
      header.ownerHistoryId,
      pileGeom.localPlacementId,
      pileGeom.productDefinitionShapeId
    );

    const bytes = w.save();
    if (!bytes.ok) throw new Error(bytes.error.message);
    const api = new WebIFC.IfcAPI();
    await api.Init();
    const mid = api.OpenModel(bytes.value);
    return { api, mid };
  }

  it('emits one IfcFooting with the spec PredefinedType', async () => {
    const { api, mid } = await buildModel();
    const footings = api.GetLineIDsWithType(mid, WebIFC.IFCFOOTING);
    expect(footings.size()).toBe(1);
    const footing = api.GetLine(mid, footings.get(0)) as Record<string, unknown>;
    const pred = (footing['PredefinedType'] as { value?: string } | undefined)?.value;
    expect(pred).toBe('PAD_FOOTING');
    const rep = (footing['Representation'] as { value?: number } | undefined)?.value;
    expect(typeof rep).toBe('number');
    api.CloseModel(mid);
  });

  it('emits one IfcPile with PredefinedType and ConstructionType', async () => {
    const { api, mid } = await buildModel();
    const piles = api.GetLineIDsWithType(mid, WebIFC.IFCPILE);
    expect(piles.size()).toBe(1);
    const pile = api.GetLine(mid, piles.get(0)) as Record<string, unknown>;
    const pred = (pile['PredefinedType'] as { value?: string } | undefined)?.value;
    expect(pred).toBe('BORED');
    const ctype = (pile['ConstructionType'] as { value?: string } | undefined)?.value;
    expect(ctype).toBe('CAST_IN_PLACE');
    const rep = (pile['Representation'] as { value?: number } | undefined)?.value;
    expect(typeof rep).toBe('number');
    api.CloseModel(mid);
  });

  it('footing geometry is an IfcExtrudedAreaSolid (non-null representation)', async () => {
    const { api, mid } = await buildModel();
    const solids = api.GetLineIDsWithType(mid, WebIFC.IFCEXTRUDEDAREASOLID);
    expect(solids.size()).toBeGreaterThanOrEqual(2);
    api.CloseModel(mid);
  });

  it('pile geometry emits an IfcCircleProfileDef', async () => {
    const { api, mid } = await buildModel();
    const profiles = api.GetLineIDsWithType(mid, WebIFC.IFCCIRCLEPROFILEDEF);
    expect(profiles.size()).toBe(1);
    api.CloseModel(mid);
  });

  it('footing GlobalId matches the derived GUID', async () => {
    const { api, mid } = await buildModel();
    const footings = api.GetLineIDsWithType(mid, WebIFC.IFCFOOTING);
    const footing = api.GetLine(mid, footings.get(0)) as Record<string, unknown>;
    const guid = (footing['GlobalId'] as { value?: string } | undefined)?.value;
    expect(guid).toBe(deriveIfcGuidSync('footing:1'));
    api.CloseModel(mid);
  });

  it('pile with NOTDEFINED construction type emits null ConstructionType', async () => {
    const writerResult = await IfcWriter.create();
    if (!writerResult.ok) throw new Error(writerResult.error.message);
    const w = writerResult.value;
    const header = writeHeader(w, { applicationName: 'test', applicationVersion: '0' });
    const noCt: PileSpec = {
      length: 8000,
      profile: { kind: 'RECTANGULAR', width: 400, height: 400 },
      origin: [0, 0, 0],
      axisX: [1, 0, 0],
      axisZ: [0, 0, 1],
      predefinedType: 'NOTDEFINED',
      materialName: 'Concrete',
    };
    const geom = writePileGeometry(w, noCt, header.geomSubContextId, null);
    writePileEntity(
      w,
      deriveIfcGuidSync('pile:nc'),
      'P-nc',
      noCt.predefinedType ?? 'NOTDEFINED',
      noCt.constructionType ?? null,
      header.ownerHistoryId,
      geom.localPlacementId,
      geom.productDefinitionShapeId
    );
    const bytes = w.save();
    if (!bytes.ok) throw new Error(bytes.error.message);
    const api = new WebIFC.IfcAPI();
    await api.Init();
    const mid = api.OpenModel(bytes.value);
    const piles = api.GetLineIDsWithType(mid, WebIFC.IFCPILE);
    expect(piles.size()).toBe(1);
    const pile = api.GetLine(mid, piles.get(0)) as Record<string, unknown>;
    expect(pile['ConstructionType']).toBeNull();
    api.CloseModel(mid);
  });
});
