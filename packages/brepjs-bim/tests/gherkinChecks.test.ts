import { describe, it, expect, beforeAll } from 'vitest';
import { unwrap } from 'brepjs';
import { initOCCT } from '../../../tests/setup.js';
import { BimModel } from '../src/model/bimModel.js';
import { toIfc } from '../src/serialize/toIfc.js';
import { checkGherkinRules } from '../src/validation/gherkinChecks.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

const META = { applicationName: 'gherkin-test', applicationVersion: '1' };

function buildModel(withCrs: boolean): BimModel {
  const model = new BimModel();
  unwrap(
    model.init({
      name: 'G',
      ...(withCrs ? { crs: { name: 'EPSG:25832', eastings: 400000, northings: 5700000 } } : {}),
    })
  );
  const siteId = unwrap(model.addSite({ name: 'S' }));
  const buildingId = unwrap(model.addBuilding({ name: 'B' }));
  const storeyId = unwrap(model.addStorey({ name: 'L1', elevation: 0 }));
  const project = model.getProject();
  if (project) model.aggregate(project.localId, siteId);
  model.aggregate(siteId, buildingId);
  model.aggregate(buildingId, storeyId);
  const stair = unwrap(
    model.addStair({
      materialName: 'Concrete',
      flights: [
        {
          width: 1200,
          riserHeight: 175,
          treadLength: 280,
          numberOfRisers: 8,
          origin: [0, 0, 0],
          axisX: [1, 0, 0],
          axisZ: [0, 0, 1],
          materialName: 'Concrete',
        },
      ],
    })
  );
  model.placeIn(stair, storeyId);
  const roof = unwrap(
    model.addRoof({
      length: 8000,
      width: 5000,
      thickness: 200,
      origin: [0, 0, 3000],
      axisX: [1, 0, 0],
      axisZ: [0, 0, 1],
      materialName: 'Tile',
      predefinedType: 'GABLE_ROOF',
      pitch: 30,
    })
  );
  model.placeIn(roof, storeyId);
  return model;
}

describe('gherkin-layer checks', () => {
  it('a georeferenced export passes all gherkin rules', async () => {
    using model = buildModel(true);
    const bytes = unwrap(await toIfc(model, META));
    const issues = await checkGherkinRules(bytes);
    expect(issues).toEqual([]);
  });

  it('a facility without a CRS warns per GRF003 but raises no errors', async () => {
    using model = buildModel(false);
    const bytes = unwrap(await toIfc(model, META));
    const issues = await checkGherkinRules(bytes);
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(issues.some((i) => i.code === 'NO_GEOREFERENCING')).toBe(true);
  });

  it('flags deprecated stair-flight attributes when present in foreign bytes', async () => {
    using model = buildModel(true);
    const bytes = unwrap(await toIfc(model, META));
    // Re-introduce a deprecated attribute the way a non-conformant exporter
    // would: patch a flight line's NumberOfRisers slot in the STEP text.
    const text = new TextDecoder().decode(bytes);
    const patched = text.replace(
      /IFCSTAIRFLIGHT\(([^;]*),\$,\$,\$,\$,\$\);/,
      'IFCSTAIRFLIGHT($1,8,7,0.175,0.28,$);'
    );
    expect(patched).not.toBe(text);
    const issues = await checkGherkinRules(new TextEncoder().encode(patched));
    expect(issues.filter((i) => i.code === 'DEPRECATED_ATTRIBUTE').length).toBeGreaterThan(0);
  });
});
