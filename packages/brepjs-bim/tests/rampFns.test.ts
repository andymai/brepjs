import { describe, it, expect, beforeAll } from 'vitest';
import * as WebIFC from 'web-ifc';
import { measureVolume, isSolid } from 'brepjs';
import { initOCCT } from '../../../tests/setup.js';
import { rampFlightToSolid, rampFlightVolume } from '../src/elementFns/rampFns.js';
import { parseRampSpec, parseRampFlightSpec } from '../src/specs/rampSpec.js';
import { IfcWriter } from '../src/ifc-writer/ifcWriter.js';
import { writeHeader } from '../src/ifc-writer/headerWriter.js';
import {
  writeProject,
  writeSite,
  writeBuilding,
  writeStorey,
} from '../src/ifc-writer/entityWriter.js';
import { writeRelAggregates, writeRelContainedInSpatialStructure } from '../src/ifc-writer/relWriter.js';
import { deriveIfcGuidSync } from '../src/identity/guidDerivation.js';
import { writeRampAssembly } from '../src/ifc-writer/stairWriter.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

const META = { applicationName: 'brepjs-bim', applicationVersion: '0.1.0' };

const flightSpec = {
  width: 1200,
  length: 6000,
  slope: 1 / 12,
  thickness: 200,
  origin: [0, 0, 0] as [number, number, number],
  axisX: [1, 0, 0] as [number, number, number],
  axisZ: [0, 0, 1] as [number, number, number],
  materialName: 'Concrete',
};

describe('rampFlightToSolid', () => {
  it('returns a ValidSolid flagged as simplified geometry', () => {
    const result = rampFlightToSolid(flightSpec);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(isSolid(result.value.solid)).toBe(true);
    expect(result.value.geometrySimplified).toBe(true);
    result.value.solid[Symbol.dispose]();
  });

  it('produces a non-zero volume matching the inclined-slab formula', () => {
    const result = rampFlightToSolid(flightSpec);
    if (!result.ok) throw new Error(result.error.message);
    const vol = measureVolume(result.value.solid);
    if (!vol.ok) throw new Error(vol.error.message);
    expect(vol.value).toBeGreaterThan(0);
    expect(vol.value).toBeCloseTo(rampFlightVolume(flightSpec), -3);
    result.value.solid[Symbol.dispose]();
  });

  it('rejects zero width', () => {
    const result = rampFlightToSolid({ ...flightSpec, width: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('RAMP_FLIGHT_ZERO_WIDTH');
  });

  it('rejects zero length', () => {
    const result = rampFlightToSolid({ ...flightSpec, length: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('RAMP_FLIGHT_ZERO_LENGTH');
  });

  it('rejects zero slope', () => {
    const result = rampFlightToSolid({ ...flightSpec, slope: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('RAMP_FLIGHT_ZERO_SLOPE');
  });

  it('rejects zero thickness', () => {
    const result = rampFlightToSolid({ ...flightSpec, thickness: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('RAMP_FLIGHT_ZERO_THICKNESS');
  });
});

describe('parseRampSpec', () => {
  const valid = {
    name: 'Entry Ramp',
    predefinedType: 'STRAIGHT_RUN_RAMP',
    materialName: 'Concrete',
    flights: [flightSpec],
  };

  it('accepts a valid spec', () => {
    expect(parseRampSpec(valid).ok).toBe(true);
  });

  it('rejects a spec with no flights', () => {
    const result = parseRampSpec({ ...valid, flights: [] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_RAMP_SPEC');
  });

  it('rejects a flight with non-orthogonal axes', () => {
    const result = parseRampSpec({
      ...valid,
      flights: [{ ...flightSpec, axisX: [1, 0, 0], axisZ: [1, 0, 0] }],
    });
    expect(result.ok).toBe(false);
  });

  it('parseRampFlightSpec accepts a valid flight and an optional predefinedType', () => {
    expect(parseRampFlightSpec({ ...flightSpec, predefinedType: 'STRAIGHT' }).ok).toBe(true);
  });
});

async function buildBaseModel(): Promise<{
  w: IfcWriter;
  ownerHistoryId: number;
  geomSubContextId: number;
  storeyPlacementId: number;
  storeyEntityId: number;
}> {
  const writerResult = await IfcWriter.create();
  if (!writerResult.ok) throw new Error(writerResult.error.message);
  const w = writerResult.value;
  const { ownerHistoryId, geomContextId, geomSubContextId, unitAssignmentId } = writeHeader(w, META);

  const projectId = writeProject(
    w,
    deriveIfcGuidSync('elem:PROJECT:0'),
    'Ramp Project',
    ownerHistoryId,
    unitAssignmentId,
    geomContextId
  );
  const site = writeSite(w, deriveIfcGuidSync('elem:SITE:1'), 'Site', ownerHistoryId);
  const building = writeBuilding(
    w,
    deriveIfcGuidSync('elem:BUILDING:2'),
    'Building',
    ownerHistoryId,
    site.placementId
  );
  const storey = writeStorey(
    w,
    deriveIfcGuidSync('elem:STOREY:3'),
    'L1',
    0,
    ownerHistoryId,
    building.placementId
  );
  writeRelAggregates(w, deriveIfcGuidSync('rel:agg:0'), ownerHistoryId, projectId, [site.entityId]);
  writeRelAggregates(w, deriveIfcGuidSync('rel:agg:1'), ownerHistoryId, site.entityId, [
    building.entityId,
  ]);
  writeRelAggregates(w, deriveIfcGuidSync('rel:agg:2'), ownerHistoryId, building.entityId, [
    storey.entityId,
  ]);

  return {
    w,
    ownerHistoryId,
    geomSubContextId,
    storeyPlacementId: storey.placementId,
    storeyEntityId: storey.entityId,
  };
}

async function open(bytes: Uint8Array): Promise<{ api: WebIFC.IfcAPI; mid: number }> {
  const api = new WebIFC.IfcAPI();
  await api.Init();
  const mid = api.OpenModel(bytes);
  return { api, mid };
}

describe('writeRampAssembly serialization + aggregation', () => {
  const rampSpec = {
    name: 'Entry Ramp',
    predefinedType: 'STRAIGHT_RUN_RAMP' as const,
    materialName: 'Concrete',
    flights: [flightSpec],
  };

  it('emits one IfcRamp aggregating one IfcRampFlight, flagged simplified', async () => {
    const base = await buildBaseModel();
    const written = writeRampAssembly(
      base.w,
      rampSpec,
      'ramp-1',
      base.ownerHistoryId,
      base.geomSubContextId,
      base.storeyPlacementId
    );
    expect(written.ok).toBe(true);
    if (!written.ok) return;
    expect(written.value.flightExpressIds).toHaveLength(1);
    expect(written.value.geometrySimplified).toBe(true);

    writeRelContainedInSpatialStructure(
      base.w,
      deriveIfcGuidSync('rel:contained:ramp'),
      base.ownerHistoryId,
      base.storeyEntityId,
      [written.value.assemblyExpressId]
    );

    const saved = base.w.save();
    if (!saved.ok) throw new Error(saved.error.message);

    const { api, mid } = await open(saved.value);
    expect(api.GetLineIDsWithType(mid, WebIFC.IFCRAMP).size()).toBe(1);
    const flights = api.GetLineIDsWithType(mid, WebIFC.IFCRAMPFLIGHT);
    expect(flights.size()).toBe(1);

    const ramp = api.GetLine(mid, api.GetLineIDsWithType(mid, WebIFC.IFCRAMP).get(0)) as Record<
      string,
      unknown
    >;
    expect(ramp['Representation']).toBeNull();

    const flight = api.GetLine(mid, flights.get(0)) as Record<string, unknown>;
    expect(flight['Representation']).not.toBeNull();

    const aggIds = api.GetLineIDsWithType(mid, WebIFC.IFCRELAGGREGATES);
    const rampId = api.GetLineIDsWithType(mid, WebIFC.IFCRAMP).get(0);
    let rampAgg: Record<string, unknown> | undefined;
    for (let i = 0; i < aggIds.size(); i++) {
      const agg = api.GetLine(mid, aggIds.get(i)) as Record<string, unknown>;
      const relating = agg['RelatingObject'] as { value?: number } | undefined;
      if (relating?.value === rampId) rampAgg = agg;
    }
    expect(rampAgg).toBeDefined();
    const related = rampAgg?.['RelatedObjects'] as ReadonlyArray<{ value?: number }> | undefined;
    expect(related).toHaveLength(1);
    api.CloseModel(mid);
  });

  it('emits a tessellated body and an IfcRampType', async () => {
    const base = await buildBaseModel();
    const written = writeRampAssembly(
      base.w,
      rampSpec,
      'ramp-2',
      base.ownerHistoryId,
      base.geomSubContextId,
      base.storeyPlacementId
    );
    if (!written.ok) throw new Error(written.error.message);
    const saved = base.w.save();
    if (!saved.ok) throw new Error(saved.error.message);

    const { api, mid } = await open(saved.value);
    expect(api.GetLineIDsWithType(mid, WebIFC.IFCTRIANGULATEDFACESET).size()).toBe(1);
    expect(api.GetLineIDsWithType(mid, WebIFC.IFCRAMPTYPE).size()).toBe(1);
    expect(api.GetLineIDsWithType(mid, WebIFC.IFCRAMPFLIGHTTYPE).size()).toBe(1);
    api.CloseModel(mid);
  });
});
