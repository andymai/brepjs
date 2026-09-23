import { unwrap } from 'brepjs';
import { expect } from 'vitest';
import { BimModel } from '../../src/model/bimModel.js';
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
  const model = new BimModel();
  try {
    const project = unwrap(model.init({ name: 'Wall quantities', projectId: 'wall-quantities' }));
    const site = unwrap(model.addSite({ name: 'Site' }));
    const building = unwrap(model.addBuilding({ name: 'Building' }));
    const storey = unwrap(model.addStorey({ name: 'Level', elevation: 0 }));
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
    const localId = unwrap(model.addWall(spec, { stableKey: 'wall' }));
    model.placeIn(localId, storey);
    return {
      model,
      localId,
      addDoor() {
        const door = unwrap(
          model.addDoor({
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
