import { authoring } from '../../src/model/authoring.js';
import { unwrap } from 'brepjs';
import { expect } from 'vitest';
import { BimDocument } from '../../src/model/bimDocument.js';
import type { WallSpec } from '../../src/specs/wallSpec.js';
import type { ImportedPset } from '../../src/import/dataRead.js';

export function expectWallQuantities(
  actual: ImportedPset | undefined,
  expected: Readonly<Record<string, number>>
): void {
  if (actual === undefined) throw new Error('Missing Wall quantities');
  expect(Object.keys(actual.properties).sort()).toEqual(Object.keys(expected).sort());
  for (const [name, value] of Object.entries(expected)) {
    expect(actual.properties[name], name).toBeCloseTo(value, 8);
  }
}

/** A fully contained recipe Wall: 0.1 m³ before the optional 0.006 m³ door cut. */
export function recipeWallFixture() {
  const model = new BimDocument();
  try {
    const project = unwrap(model.init({ name: 'Wall quantities', projectId: 'wall-quantities' }));
    const site = unwrap(authoring(model).addSite({ name: 'Site' }));
    const building = unwrap(authoring(model).addBuilding({ name: 'Building' }));
    const storey = unwrap(authoring(model).addStorey({ name: 'Level', elevation: 0 }));
    model.aggregate(project, site);
    model.aggregate(site, building);
    model.aggregate(building, storey);
    const spec: WallSpec = {
      length: 2000,
      height: 500,
      thickness: 100,
      origin: [0, 0, 0],
      axisX: [1, 0, 0],
      axisZ: [0, 0, 1],
      materialName: 'Concrete',
    };
    const localId = unwrap(authoring(model).addWall(spec, { stableKey: 'wall' }));
    model.placeIn(localId, storey);
    return {
      model,
      localId,
      addDoorAndCutWall() {
        const door = unwrap(
          authoring(model).addDoorAndCutWall({
            wallLocalId: localId,
            width: 200,
            height: 300,
            offsetAlongWall: 200,
            offsetFromFloor: 0,
            materialName: 'Wood',
          })
        );
        model.placeIn(door, storey);
        return door;
      },
    };
  } catch (cause) {
    model[Symbol.dispose]();
    throw cause;
  }
}
