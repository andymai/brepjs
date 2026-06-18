import { describe, it, expect, beforeAll } from 'vitest';
import { unwrap } from 'brepjs';
import { initOCCT } from '../../../tests/setup.js';
import { BimModel } from '../src/model/bimModel.js';
import { toIfc, toIfcValidated } from '../src/serialize/toIfc.js';
import { hasErrors } from '../src/validation/severity.js';

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

// Builds a minimal valid model (project→site→building→storey), runs the caller's
// element setup, serializes to IFC, and returns the SPF text.
async function ifcText(build: (m: BimModel) => void): Promise<string> {
  const m = new BimModel();
  m.init({ name: 'T' });
  const site = m.addSite({ name: 'S' });
  const bld = m.addBuilding({ name: 'B' });
  const st = m.addStorey({ name: 'L', elevation: 0 });
  const p = m.getProject();
  if (p) m.aggregate(p.localId, site);
  m.aggregate(site, bld);
  m.aggregate(bld, st);
  build(m);
  const r = await toIfc(m, { applicationName: 'test', applicationVersion: '1' });
  return decode(unwrap(r));
}

const roofBase = {
  length: 4000,
  width: 3000,
  thickness: 200,
  origin: [0, 0, 0] as [number, number, number],
  axisX: [1, 0, 0] as [number, number, number],
  axisZ: [0, 0, 1] as [number, number, number],
  materialName: 'Tile',
};

describe('roof IFC representation', () => {
  beforeAll(async () => {
    await initOCCT();
  }, 30000);

  it('shaped roof serializes as a Tessellation, not a degenerate brep', async () => {
    const txt = await ifcText((m) => {
      unwrap(m.addRoof({ ...roofBase, predefinedType: 'GABLE_ROOF', pitch: 30 }));
    });
    expect(txt).toContain('IFCTRIANGULATEDFACESET');
    expect(txt).not.toContain('IFCFACETEDBREP'); // the degenerate mesh-failure fallback
  });

  it('flat roof keeps the parametric SweptSolid (no regression)', async () => {
    const txt = await ifcText((m) => {
      unwrap(m.addRoof({ ...roofBase, predefinedType: 'FLAT_ROOF' }));
    });
    expect(txt).toContain('IFCEXTRUDEDAREASOLID');
  });
});

const railBase = {
  length: 2000,
  height: 1000,
  thickness: 50,
  origin: [0, 0, 0] as [number, number, number],
  axisX: [1, 0, 0] as [number, number, number],
  axisZ: [0, 0, 1] as [number, number, number],
  predefinedType: 'GUARDRAIL' as const,
  materialName: 'Steel',
};

describe('railing IFC representation', () => {
  beforeAll(async () => {
    await initOCCT();
  }, 30000);

  it('POSTED railing serializes as a Tessellation', async () => {
    const txt = await ifcText((m) => {
      unwrap(m.addRailing({ ...railBase, infill: 'POSTED' }));
    });
    expect(txt).toContain('IFCTRIANGULATEDFACESET');
  });

  it('PANEL railing keeps the parametric SweptSolid', async () => {
    const txt = await ifcText((m) => {
      unwrap(m.addRailing({ ...railBase }));
    });
    expect(txt).toContain('IFCEXTRUDEDAREASOLID');
  });
});

describe('shaped model round-trips cleanly', () => {
  beforeAll(async () => {
    await initOCCT();
  }, 30000);

  it('shaped roof + posted railing + stair → no error-severity IFC issues', async () => {
    const m = new BimModel();
    m.init({ name: 'Validity' });
    const site = m.addSite({ name: 'S' });
    const bld = m.addBuilding({ name: 'B' });
    const st = m.addStorey({ name: 'L', elevation: 0 });
    const p = m.getProject();
    if (p) m.aggregate(p.localId, site);
    m.aggregate(site, bld);
    m.aggregate(bld, st);
    const roof = unwrap(
      m.addRoof({
        length: 4000, width: 3000, thickness: 200, origin: [0, 0, 0],
        axisX: [1, 0, 0], axisZ: [0, 0, 1], predefinedType: 'HIP_ROOF', pitch: 35, materialName: 'Tile',
      })
    );
    m.placeIn(roof, st);
    const rail = unwrap(
      m.addRailing({
        length: 2000, height: 1000, thickness: 50, origin: [0, 0, 0],
        axisX: [1, 0, 0], axisZ: [0, 0, 1], predefinedType: 'GUARDRAIL', infill: 'POSTED', materialName: 'Steel',
      })
    );
    m.placeIn(rail, st);
    const stair = unwrap(
      m.addStair({
        flights: [{
          width: 1000, riserHeight: 175, treadLength: 250, numberOfRisers: 10,
          origin: [0, 0, 0], axisX: [1, 0, 0], axisZ: [0, 0, 1], materialName: 'Concrete',
        }],
        materialName: 'Concrete',
      })
    );
    m.placeIn(stair, st);
    const res = await toIfcValidated(m, { applicationName: 'test', applicationVersion: '1' });
    expect(res.ok).toBe(true);
    if (res.ok) expect(hasErrors(res.value.report)).toBe(false);
  });
});
