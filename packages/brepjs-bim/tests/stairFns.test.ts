import { describe, it, expect, beforeAll } from 'vitest';
import * as WebIFC from 'web-ifc';
import { measureVolume, isSolid } from 'brepjs';
import { initOCCT } from '../../../tests/setup.js';
import { stairFlightToSolid, stairFlightVolume } from '../src/elementFns/stairFns.js';
import { parseStairSpec, parseStairFlightSpec } from '../src/specs/stairSpec.js';
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
import { writeStairAssembly } from '../src/ifc-writer/stairWriter.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

const META = { applicationName: 'brepjs-bim', applicationVersion: '0.1.0' };

const flightSpec = {
  width: 1000,
  riserHeight: 175,
  treadLength: 280,
  numberOfRisers: 16,
  origin: [0, 0, 0] as [number, number, number],
  axisX: [1, 0, 0] as [number, number, number],
  axisZ: [0, 0, 1] as [number, number, number],
  materialName: 'Concrete',
};

describe('stairFlightToSolid', () => {
  it('returns a stepped ValidSolid (not flagged simplified)', () => {
    const result = stairFlightToSolid(flightSpec);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(isSolid(result.value.solid)).toBe(true);
    expect(result.value.geometrySimplified).toBe(false);
    result.value.solid[Symbol.dispose]();
  });

  it('produces a non-zero, finite volume matching the stepped-wedge formula', () => {
    const result = stairFlightToSolid(flightSpec);
    if (!result.ok) throw new Error(result.error.message);
    const vol = measureVolume(result.value.solid);
    if (!vol.ok) throw new Error(vol.error.message);
    expect(vol.value).toBeGreaterThan(0);
    expect(Number.isFinite(vol.value)).toBe(true);
    // Stepped solid analytic volume.
    expect(vol.value).toBeCloseTo(stairFlightVolume(flightSpec), -3);
    result.value.solid[Symbol.dispose]();
  });

  it('handles a single-riser flight', () => {
    const result = stairFlightToSolid({ ...flightSpec, numberOfRisers: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const vol = measureVolume(result.value.solid);
    if (!vol.ok) throw new Error(vol.error.message);
    expect(vol.value).toBeCloseTo(
      flightSpec.treadLength * flightSpec.riserHeight * flightSpec.width,
      -2
    );
    result.value.solid[Symbol.dispose]();
  });

  it('rejects zero width', () => {
    const result = stairFlightToSolid({ ...flightSpec, width: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('STAIR_FLIGHT_ZERO_WIDTH');
  });

  it('rejects zero riser height', () => {
    const result = stairFlightToSolid({ ...flightSpec, riserHeight: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('STAIR_FLIGHT_ZERO_RISER');
  });

  it('rejects zero tread length', () => {
    const result = stairFlightToSolid({ ...flightSpec, treadLength: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('STAIR_FLIGHT_ZERO_TREAD');
  });

  it('rejects non-integer or zero riser count', () => {
    expect(stairFlightToSolid({ ...flightSpec, numberOfRisers: 0 }).ok).toBe(false);
    expect(stairFlightToSolid({ ...flightSpec, numberOfRisers: 2.5 }).ok).toBe(false);
  });
});

describe('parseStairSpec', () => {
  const valid = {
    name: 'Main Stair',
    predefinedType: 'STRAIGHT_RUN_STAIR',
    materialName: 'Concrete',
    flights: [flightSpec],
  };

  it('accepts a valid spec', () => {
    expect(parseStairSpec(valid).ok).toBe(true);
  });

  it('rejects a spec with no flights', () => {
    const result = parseStairSpec({ ...valid, flights: [] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_STAIR_SPEC');
  });

  it('rejects a flight with non-unit axisX', () => {
    const result = parseStairSpec({
      ...valid,
      flights: [{ ...flightSpec, axisX: [2, 0, 0] }],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a flight with non-orthogonal axes', () => {
    const result = parseStairSpec({
      ...valid,
      flights: [{ ...flightSpec, axisX: [1, 0, 0], axisZ: [1, 0, 0] }],
    });
    expect(result.ok).toBe(false);
  });

  it('parseStairFlightSpec accepts a valid flight', () => {
    expect(parseStairFlightSpec(flightSpec).ok).toBe(true);
  });

  it('parseStairFlightSpec rejects a fractional riser count', () => {
    const result = parseStairFlightSpec({ ...flightSpec, numberOfRisers: 3.5 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_STAIR_FLIGHT_SPEC');
  });
});

// Builds a spatially-complete model fragment (project→site→building→storey) and
// returns the writer plus the storey placement id so callers can attach an
// assembly. Saving requires this minimal hierarchy for web-ifc to OpenModel.
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
    'Stair Project',
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

describe('writeStairAssembly serialization + aggregation', () => {
  const stairSpec = {
    name: 'Main Stair',
    predefinedType: 'STRAIGHT_RUN_STAIR' as const,
    materialName: 'Concrete',
    flights: [flightSpec, { ...flightSpec, origin: [4480, 0, 2800] as [number, number, number] }],
  };

  it('emits one IfcStair aggregating two IfcStairFlight occurrences', async () => {
    const base = await buildBaseModel();
    const written = writeStairAssembly(
      base.w,
      stairSpec,
      'stair-1',
      base.ownerHistoryId,
      base.geomSubContextId,
      base.storeyPlacementId
    );
    expect(written.ok).toBe(true);
    if (!written.ok) return;
    expect(written.value.flightExpressIds).toHaveLength(2);
    expect(written.value.geometrySimplified).toBe(false);

    writeRelContainedInSpatialStructure(
      base.w,
      deriveIfcGuidSync('rel:contained:stair'),
      base.ownerHistoryId,
      base.storeyEntityId,
      [written.value.assemblyExpressId]
    );

    const saved = base.w.save();
    if (!saved.ok) throw new Error(saved.error.message);

    const { api, mid } = await open(saved.value);
    const stairs = api.GetLineIDsWithType(mid, WebIFC.IFCSTAIR);
    expect(stairs.size()).toBe(1);
    const flights = api.GetLineIDsWithType(mid, WebIFC.IFCSTAIRFLIGHT);
    expect(flights.size()).toBe(2);

    const stair = api.GetLine(mid, stairs.get(0)) as Record<string, unknown>;
    // The assembly container itself carries no Representation; geometry is in flights.
    expect(stair['Representation']).toBeNull();

    // Every flight must have a non-null Representation (never null geometry).
    for (let i = 0; i < flights.size(); i++) {
      const flight = api.GetLine(mid, flights.get(i)) as Record<string, unknown>;
      expect(flight['Representation']).not.toBeNull();
    }

    // The IfcRelAggregates must link the stair to both flights.
    const aggIds = api.GetLineIDsWithType(mid, WebIFC.IFCRELAGGREGATES);
    let stairAgg: Record<string, unknown> | undefined;
    for (let i = 0; i < aggIds.size(); i++) {
      const agg = api.GetLine(mid, aggIds.get(i)) as Record<string, unknown>;
      const relating = agg['RelatingObject'] as { value?: number } | undefined;
      if (relating?.value === stairs.get(0)) stairAgg = agg;
    }
    expect(stairAgg).toBeDefined();
    const related = stairAgg?.['RelatedObjects'] as ReadonlyArray<{ value?: number }> | undefined;
    expect(related).toHaveLength(2);
    api.CloseModel(mid);
  });

  it('emits a tessellated body (IfcTriangulatedFaceSet) per flight', async () => {
    const base = await buildBaseModel();
    const written = writeStairAssembly(
      base.w,
      stairSpec,
      'stair-2',
      base.ownerHistoryId,
      base.geomSubContextId,
      base.storeyPlacementId
    );
    if (!written.ok) throw new Error(written.error.message);
    const saved = base.w.save();
    if (!saved.ok) throw new Error(saved.error.message);

    const { api, mid } = await open(saved.value);
    const faceSets = api.GetLineIDsWithType(mid, WebIFC.IFCTRIANGULATEDFACESET);
    expect(faceSets.size()).toBe(2);
    api.CloseModel(mid);
  });

  it('emits an IfcStairType linked via IfcRelDefinesByType', async () => {
    const base = await buildBaseModel();
    const written = writeStairAssembly(
      base.w,
      stairSpec,
      'stair-3',
      base.ownerHistoryId,
      base.geomSubContextId,
      base.storeyPlacementId
    );
    if (!written.ok) throw new Error(written.error.message);
    const saved = base.w.save();
    if (!saved.ok) throw new Error(saved.error.message);

    const { api, mid } = await open(saved.value);
    expect(api.GetLineIDsWithType(mid, WebIFC.IFCSTAIRTYPE).size()).toBe(1);
    expect(api.GetLineIDsWithType(mid, WebIFC.IFCSTAIRFLIGHTTYPE).size()).toBe(1);
    api.CloseModel(mid);
  });

  it('derives a deterministic IfcStair GlobalId across two serializations', async () => {
    const guidOf = async (): Promise<string> => {
      const base = await buildBaseModel();
      const written = writeStairAssembly(
        base.w,
        stairSpec,
        'stair-x',
        base.ownerHistoryId,
        base.geomSubContextId,
        base.storeyPlacementId
      );
      if (!written.ok) throw new Error(written.error.message);
      const saved = base.w.save();
      if (!saved.ok) throw new Error(saved.error.message);
      const { api, mid } = await open(saved.value);
      const stairs = api.GetLineIDsWithType(mid, WebIFC.IFCSTAIR);
      const stair = api.GetLine(mid, stairs.get(0)) as Record<string, unknown>;
      const guid = (stair['GlobalId'] as { value?: string } | undefined)?.value ?? '';
      api.CloseModel(mid);
      return guid;
    };
    const first = await guidOf();
    const second = await guidOf();
    expect(first).toBe(second);
    expect(first.length).toBe(22);
  });
});
