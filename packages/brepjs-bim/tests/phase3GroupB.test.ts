import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import * as WebIFC from 'web-ifc';
import { BimModel } from '../src/model/bimModel.js';
import { toIfc } from '../src/serialize/toIfc.js';

beforeAll(async () => { await initOCCT(); }, 30000);

const META = { applicationName: 'brepjs-bim', applicationVersion: '0.1.0' };

const UP: [number, number, number] = [0, 0, 1];
const XAXIS: [number, number, number] = [1, 0, 0];

interface GroupBModel {
  readonly model: BimModel;
  readonly stairId: number;
  readonly railingId: number;
  readonly coveringId: number;
}

// Builds a model with a stair (2 flights), a styled railing, a covering on a slab
// host, an element assembly nesting the railing, and a connectivity rel.
function buildGroupBModel(): GroupBModel {
  const model = new BimModel();
  const initResult = model.init({ name: 'Phase3 GroupB Project' });
  if (!initResult.ok) throw new Error(initResult.error.message);
  const projectId = initResult.value;
  const siteId = model.addSite({ name: 'Site' });
  const buildingId = model.addBuilding({ name: 'Building' });
  const storeyId = model.addStorey({ name: 'L1', elevation: 0 });
  model.aggregate(projectId, siteId);
  model.aggregate(siteId, buildingId);
  model.aggregate(buildingId, storeyId);

  const stair = model.addStair({
    name: 'Main Stair',
    predefinedType: 'STRAIGHT_RUN_STAIR',
    materialName: 'Concrete',
    flights: [
      {
        width: 1200, riserHeight: 175, treadLength: 280, numberOfRisers: 9,
        origin: [0, 0, 0], axisX: XAXIS, axisZ: UP, materialName: 'Concrete',
      },
      {
        width: 1200, riserHeight: 175, treadLength: 280, numberOfRisers: 9,
        origin: [3000, 0, 1575], axisX: XAXIS, axisZ: UP, materialName: 'Concrete',
      },
    ],
  });
  if (!stair.ok) throw new Error(stair.error.message);
  model.placeIn(stair.value, storeyId);

  const ramp = model.addRamp({
    name: 'Service Ramp',
    predefinedType: 'STRAIGHT_RUN_RAMP',
    materialName: 'Concrete',
    flights: [
      {
        width: 1500, length: 4000, slope: 0.08, thickness: 200,
        origin: [0, 6000, 0], axisX: XAXIS, axisZ: UP, materialName: 'Concrete',
      },
    ],
  });
  if (!ramp.ok) throw new Error(ramp.error.message);
  model.placeIn(ramp.value, storeyId);

  const slab = model.addSlab({
    length: 5000, width: 4000, thickness: 200,
    origin: [0, 0, 0], axisX: XAXIS, axisZ: UP,
    materialName: 'Concrete',
  });
  if (!slab.ok) throw new Error(slab.error.message);
  model.placeIn(slab.value, storeyId);

  const railing = model.addRailing({
    length: 3000, height: 1100, thickness: 50,
    origin: [0, 0, 0], axisX: XAXIS, axisZ: UP,
    predefinedType: 'GUARDRAIL', materialName: 'Steel',
  });
  if (!railing.ok) throw new Error(railing.error.message);
  model.placeIn(railing.value, storeyId);
  model.setSurfaceStyle(railing.value, { name: 'Steel Grey', r: 0.5, g: 0.5, b: 0.55 });

  const covering = model.addCovering(
    {
      length: 5000, width: 4000, thickness: 20,
      origin: [0, 0, 200], axisX: XAXIS, axisZ: UP,
      predefinedType: 'FLOORING', materialName: 'Tile',
    },
    slab.value
  );
  if (!covering.ok) throw new Error(covering.error.message);
  model.placeIn(covering.value, storeyId);

  // Element assembly nesting the railing (ordered nesting via IfcRelNests).
  const assemblyId = model.addElementAssembly({ name: 'Guard Assembly', predefinedType: 'ACCESSORY_ASSEMBLY' });
  model.placeIn(assemblyId, storeyId);
  model.nest(assemblyId, railing.value);

  // Connectivity: the railing connects to the stair.
  model.connectElements(railing.value, stair.value, 'railing-on-stair');

  return {
    model,
    stairId: stair.value,
    railingId: railing.value,
    coveringId: covering.value,
  };
}

async function serialize(model: BimModel): Promise<Uint8Array> {
  const result = await toIfc(model, META);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function countOf(api: WebIFC.IfcAPI, mid: number, type: number): number {
  return api.GetLineIDsWithType(mid, type).size();
}

describe('Phase 3 Group B integration', () => {
  it('serializes one of each Group B element with the expected entity counts', async () => {
    const bytes = await serialize(buildGroupBModel().model);
    const api = new WebIFC.IfcAPI();
    await api.Init();
    const mid = api.OpenModel(bytes);

    expect(countOf(api, mid, WebIFC.IFCSTAIR)).toBe(1);
    // The stair aggregates 2 flights.
    expect(countOf(api, mid, WebIFC.IFCSTAIRFLIGHT)).toBe(2);
    expect(countOf(api, mid, WebIFC.IFCRAMP)).toBe(1);
    expect(countOf(api, mid, WebIFC.IFCRAMPFLIGHT)).toBe(1);
    expect(countOf(api, mid, WebIFC.IFCRAILING)).toBe(1);
    expect(countOf(api, mid, WebIFC.IFCCOVERING)).toBe(1);
    expect(countOf(api, mid, WebIFC.IFCELEMENTASSEMBLY)).toBe(1);

    api.CloseModel(mid);
  });

  it('aggregates stair flights into the stair via IfcRelAggregates', async () => {
    const bytes = await serialize(buildGroupBModel().model);
    const api = new WebIFC.IfcAPI();
    await api.Init();
    const mid = api.OpenModel(bytes);

    const stairId = api.GetLineIDsWithType(mid, WebIFC.IFCSTAIR).get(0);
    const flightIds = new Set<number>();
    const flightLineIds = api.GetLineIDsWithType(mid, WebIFC.IFCSTAIRFLIGHT);
    for (let i = 0; i < flightLineIds.size(); i++) flightIds.add(flightLineIds.get(i));

    // Find the IfcRelAggregates whose RelatingObject is the stair.
    const aggIds = api.GetLineIDsWithType(mid, WebIFC.IFCRELAGGREGATES);
    let found = false;
    for (let i = 0; i < aggIds.size(); i++) {
      const agg = api.GetLine(mid, aggIds.get(i)) as Record<string, unknown>;
      const relating = (agg['RelatingObject'] as { value?: number } | undefined)?.value;
      if (relating !== stairId) continue;
      found = true;
      const related = agg['RelatedObjects'] as ReadonlyArray<{ value?: number }>;
      expect(related.length).toBe(2);
      for (const r of related) expect(flightIds.has(r.value ?? -1)).toBe(true);
    }
    expect(found).toBe(true);

    api.CloseModel(mid);
  });

  it('every stair flight has a non-null Representation; the stair assembly has none', async () => {
    const bytes = await serialize(buildGroupBModel().model);
    const api = new WebIFC.IfcAPI();
    await api.Init();
    const mid = api.OpenModel(bytes);

    const flightIds = api.GetLineIDsWithType(mid, WebIFC.IFCSTAIRFLIGHT);
    for (let i = 0; i < flightIds.size(); i++) {
      const line = api.GetLine(mid, flightIds.get(i)) as Record<string, unknown>;
      expect(line['Representation']).not.toBeNull();
    }
    const stair = api.GetLine(mid, api.GetLineIDsWithType(mid, WebIFC.IFCSTAIR).get(0)) as Record<string, unknown>;
    expect(stair['Representation']).toBeNull();

    api.CloseModel(mid);
  });

  it('emits a styled item linking the railing body to an IfcSurfaceStyle', async () => {
    const bytes = await serialize(buildGroupBModel().model);
    const api = new WebIFC.IfcAPI();
    await api.Init();
    const mid = api.OpenModel(bytes);

    expect(countOf(api, mid, WebIFC.IFCSURFACESTYLE)).toBe(1);
    expect(countOf(api, mid, WebIFC.IFCSTYLEDITEM)).toBe(1);

    const styledItem = api.GetLine(
      mid, api.GetLineIDsWithType(mid, WebIFC.IFCSTYLEDITEM).get(0)
    ) as Record<string, unknown>;
    const itemRef = (styledItem['Item'] as { value?: number } | undefined)?.value;
    expect(itemRef).toBeDefined();
    const styles = styledItem['Styles'] as ReadonlyArray<{ value?: number }>;
    expect(styles.length).toBe(1);

    api.CloseModel(mid);
  });

  it('emits an IfcRelNests decomposing the assembly and an IfcRelConnectsElements', async () => {
    const built = buildGroupBModel();
    const bytes = await serialize(built.model);
    const api = new WebIFC.IfcAPI();
    await api.Init();
    const mid = api.OpenModel(bytes);

    const nestsIds = api.GetLineIDsWithType(mid, WebIFC.IFCRELNESTS);
    expect(nestsIds.size()).toBe(1);
    const nests = api.GetLine(mid, nestsIds.get(0)) as Record<string, unknown>;
    const assemblyId = api.GetLineIDsWithType(mid, WebIFC.IFCELEMENTASSEMBLY).get(0);
    const railingId = api.GetLineIDsWithType(mid, WebIFC.IFCRAILING).get(0);
    expect((nests['RelatingObject'] as { value?: number }).value).toBe(assemblyId);
    const nested = nests['RelatedObjects'] as ReadonlyArray<{ value?: number }>;
    expect(nested.map((n) => n.value)).toContain(railingId);

    const connIds = api.GetLineIDsWithType(mid, WebIFC.IFCRELCONNECTSELEMENTS);
    expect(connIds.size()).toBe(1);
    const conn = api.GetLine(mid, connIds.get(0)) as Record<string, unknown>;
    const stairId = api.GetLineIDsWithType(mid, WebIFC.IFCSTAIR).get(0);
    expect((conn['RelatingElement'] as { value?: number }).value).toBe(railingId);
    expect((conn['RelatedElement'] as { value?: number }).value).toBe(stairId);

    api.CloseModel(mid);
  });

  it('emits IfcRelCoversBldgElements tying the covering to its host slab', async () => {
    const bytes = await serialize(buildGroupBModel().model);
    const api = new WebIFC.IfcAPI();
    await api.Init();
    const mid = api.OpenModel(bytes);

    const coversIds = api.GetLineIDsWithType(mid, WebIFC.IFCRELCOVERSBLDGELEMENTS);
    expect(coversIds.size()).toBe(1);
    const covers = api.GetLine(mid, coversIds.get(0)) as Record<string, unknown>;
    const slabId = api.GetLineIDsWithType(mid, WebIFC.IFCSLAB).get(0);
    const coveringId = api.GetLineIDsWithType(mid, WebIFC.IFCCOVERING).get(0);
    expect((covers['RelatingBuildingElement'] as { value?: number }).value).toBe(slabId);
    const related = covers['RelatedCoverings'] as ReadonlyArray<{ value?: number }>;
    expect(related.map((r) => r.value)).toContain(coveringId);

    api.CloseModel(mid);
  });

  it('railing and covering carry IfcType objects', async () => {
    const bytes = await serialize(buildGroupBModel().model);
    const api = new WebIFC.IfcAPI();
    await api.Init();
    const mid = api.OpenModel(bytes);

    expect(countOf(api, mid, WebIFC.IFCRAILINGTYPE)).toBe(1);
    expect(countOf(api, mid, WebIFC.IFCCOVERINGTYPE)).toBe(1);

    api.CloseModel(mid);
  });

  it('deterministic GUIDs are stable across two exports of the same model', async () => {
    const a = await serialize(buildGroupBModel().model);
    const b = await serialize(buildGroupBModel().model);
    const textA = new TextDecoder().decode(a);
    const textB = new TextDecoder().decode(b);
    const guidsA = [...textA.matchAll(/'([0-9A-Za-z_$]{22})'/g)].map((m) => m[1]);
    const guidsB = [...textB.matchAll(/'([0-9A-Za-z_$]{22})'/g)].map((m) => m[1]);
    expect(guidsA.length).toBeGreaterThan(0);
    expect(guidsB).toEqual(guidsA);
  });
});
