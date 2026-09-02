import { describe, it, expect, beforeAll } from 'vitest';
import {
  getBounds,
  measureVolume,
  unwrap,
  type AnyShape,
  type Bounds3D,
  type Dimension,
} from 'brepjs';
import { initOCCT } from '../../../tests/setup.js';
import {
  BimModel,
  disposeImportedModel,
  fromIfc,
  placedSolids,
  toIfc,
  type GeometryFidelity,
  type ImportedModel,
  type LocalId,
} from '../src/index.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

const META = { applicationName: 'brepjs-bim', applicationVersion: '0.1.0' };
const ORIGIN: [number, number, number] = [1000, 2000, 3000];
const X: [number, number, number] = [1, 0, 0];
const Y: [number, number, number] = [0, 1, 0];
const Z: [number, number, number] = [0, 0, 1];

interface Case {
  readonly name: string;
  readonly fidelity: GeometryFidelity;
  readonly add: (model: BimModel) => LocalId;
}

const CASES: readonly Case[] = [
  {
    name: 'wall',
    fidelity: 'PARAMETRIC',
    add: (m) =>
      unwrap(
        m.addWall({
          length: 5000,
          height: 3000,
          thickness: 200,
          origin: ORIGIN,
          axisX: X,
          axisZ: Z,
          materialName: 'Concrete',
        })
      ),
  },
  {
    name: 'wall running along +Y',
    fidelity: 'PARAMETRIC',
    add: (m) =>
      unwrap(
        m.addWall({
          length: 5000,
          height: 3000,
          thickness: 200,
          origin: ORIGIN,
          axisX: Y,
          axisZ: Z,
          materialName: 'Concrete',
        })
      ),
  },
  {
    name: 'slab',
    fidelity: 'PARAMETRIC',
    add: (m) =>
      unwrap(
        m.addSlab({
          length: 500,
          width: 300,
          thickness: 40,
          origin: ORIGIN,
          axisX: X,
          axisZ: Z,
          predefinedType: 'FLOOR',
          materialName: 'Concrete',
        })
      ),
  },
  {
    name: 'slab running along +Y',
    fidelity: 'PARAMETRIC',
    add: (m) =>
      unwrap(
        m.addSlab({
          length: 500,
          width: 300,
          thickness: 40,
          origin: ORIGIN,
          axisX: Y,
          axisZ: Z,
          predefinedType: 'FLOOR',
          materialName: 'Concrete',
        })
      ),
  },
  {
    name: 'footing',
    fidelity: 'PARAMETRIC',
    add: (m) =>
      unwrap(
        m.addFooting({
          length: 500,
          width: 300,
          thickness: 100,
          origin: ORIGIN,
          axisX: X,
          axisZ: Z,
          materialName: 'Concrete',
        })
      ),
  },
  {
    name: 'covering',
    fidelity: 'PARAMETRIC',
    add: (m) =>
      unwrap(
        m.addCovering({
          length: 2000,
          width: 1000,
          thickness: 20,
          origin: ORIGIN,
          axisX: X,
          axisZ: Z,
          materialName: 'Gypsum',
        })
      ),
  },
  {
    name: 'panel railing',
    fidelity: 'PARAMETRIC',
    add: (m) =>
      unwrap(
        m.addRailing({
          length: 1000,
          height: 1100,
          thickness: 50,
          origin: ORIGIN,
          axisX: X,
          axisZ: Z,
          materialName: 'Steel',
        })
      ),
  },
  {
    name: 'posted railing',
    fidelity: 'TESSELLATED_MANIFOLD',
    add: (m) =>
      unwrap(
        m.addRailing({
          length: 1000,
          height: 1100,
          thickness: 50,
          origin: ORIGIN,
          axisX: X,
          axisZ: Z,
          materialName: 'Steel',
          infill: 'POSTED',
        })
      ),
  },
  {
    name: 'flat roof',
    fidelity: 'PARAMETRIC',
    add: (m) =>
      unwrap(
        m.addRoof({
          length: 4000,
          width: 3000,
          thickness: 200,
          origin: ORIGIN,
          axisX: X,
          axisZ: Z,
          predefinedType: 'FLAT_ROOF',
          materialName: 'Concrete',
        })
      ),
  },
  {
    name: 'pitched roof',
    fidelity: 'TESSELLATED_MANIFOLD',
    add: (m) =>
      unwrap(
        m.addRoof({
          length: 4000,
          width: 3000,
          thickness: 200,
          origin: ORIGIN,
          axisX: X,
          axisZ: Z,
          predefinedType: 'GABLE_ROOF',
          pitch: 30,
          materialName: 'Timber',
        })
      ),
  },
  {
    name: 'space',
    fidelity: 'PARAMETRIC',
    add: (m) =>
      unwrap(
        m.addSpace({
          name: 'Room',
          length: 4000,
          width: 3000,
          height: 2700,
          origin: ORIGIN,
          axisX: X,
          axisZ: Z,
          materialName: 'Air',
        })
      ),
  },
  {
    name: 'pile',
    fidelity: 'PARAMETRIC',
    add: (m) =>
      unwrap(
        m.addPile({
          length: 6000,
          profile: { kind: 'RECTANGULAR', width: 300, height: 300 },
          origin: ORIGIN,
          axisX: X,
          axisZ: Z,
          materialName: 'Concrete',
        })
      ),
  },
];

function boundsTuple(b: Bounds3D): readonly number[] {
  return [b.xMin, b.xMax, b.yMin, b.yMax, b.zMin, b.zMax];
}

function unionBounds(shapes: readonly AnyShape<Dimension>[]): readonly number[] {
  const all = shapes.map((s) => boundsTuple(getBounds(s)));
  return [0, 2, 4].flatMap((i) => [
    Math.min(...all.map((b) => b[i] ?? Infinity)),
    Math.max(...all.map((b) => b[i + 1] ?? -Infinity)),
  ]);
}

function totalVolume(shapes: readonly AnyShape<Dimension>[]): number {
  return shapes.reduce((sum, s) => sum + unwrap(measureVolume(s)), 0);
}

function newModel(): { readonly model: BimModel; readonly storeyId: LocalId } {
  const model = new BimModel();
  const projectId = unwrap(model.init({ name: 'Placement RoundTrip' }));
  const siteId = unwrap(model.addSite({ name: 'Site' }));
  const buildingId = unwrap(model.addBuilding({ name: 'Building' }));
  const storeyId = unwrap(model.addStorey({ name: 'L1', elevation: 0 }));
  model.aggregate(projectId, siteId);
  model.aggregate(siteId, buildingId);
  model.aggregate(buildingId, storeyId);
  return { model, storeyId };
}

interface EagerBody {
  readonly guid: string;
  readonly bounds: readonly number[];
  readonly volume: number;
}

function eagerBody(model: BimModel, id: LocalId): EagerBody {
  const element = model.getElement(id);
  if (element === null) throw new Error(`element ${id} missing`);
  const solids = unwrap(placedSolids(element));
  try {
    return { guid: element.guid, bounds: unionBounds(solids), volume: totalVolume(solids) };
  } finally {
    for (const s of solids) s[Symbol.dispose]();
  }
}

async function roundTrip(model: BimModel): Promise<ImportedModel> {
  const bytes = unwrap(await toIfc(model, META));
  return unwrap(await fromIfc(bytes));
}

function expectImportedBody(
  imported: ImportedModel,
  eager: EagerBody,
  fidelity: GeometryFidelity,
  label: string
): void {
  const element = imported.elements.find(({ guid }) => guid === eager.guid);
  expect(element?.geometry.fidelity, label).toBe(fidelity);
  const solid = element?.geometry.solid;
  expect(solid, label).toBeDefined();
  if (solid === null || solid === undefined) throw new Error(`${label} imported without a body`);
  const bounds = boundsTuple(getBounds(solid));
  eager.bounds.forEach((v, i) => expect(bounds[i], `${label} bound ${i}`).toBeCloseTo(v, 1));
  expect(unwrap(measureVolume(solid)) / eager.volume, `${label} volume`).toBeCloseTo(1, 3);
}

describe('element placement survives the IFC round trip', () => {
  it('imports swept and tessellated bodies at the bounds placedSolids reports', async () => {
    const { model, storeyId } = newModel();
    const eager: Array<{ readonly c: Case; readonly body: EagerBody }> = [];
    for (const c of CASES) {
      const id = c.add(model);
      model.placeIn(id, storeyId);
      eager.push({ c, body: eagerBody(model, id) });
    }
    const imported = await roundTrip(model);
    try {
      expect(imported.diagnostics.issues.filter((i) => i.severity === 'error')).toEqual([]);
      for (const { c, body } of eager) expectImportedBody(imported, body, c.fidelity, c.name);
    } finally {
      disposeImportedModel(imported);
      model[Symbol.dispose]();
    }
  }, 120000);

  it('cuts a door void where the corner-anchored wall body has it', async () => {
    const { model, storeyId } = newModel();
    const wallId = unwrap(
      model.addWall({
        length: 5000,
        height: 3000,
        thickness: 200,
        origin: ORIGIN,
        axisX: X,
        axisZ: Z,
        materialName: 'Concrete',
      })
    );
    model.placeIn(wallId, storeyId);
    const doorId = unwrap(
      model.addDoor({
        wallLocalId: wallId,
        width: 900,
        height: 2100,
        offsetAlongWall: 1000,
        offsetFromFloor: 0,
        materialName: 'Timber',
      })
    );
    model.placeIn(doorId, storeyId);
    const wall = eagerBody(model, wallId);
    expect(wall.volume / (5000 * 3000 * 200 - 900 * 2100 * 200)).toBeCloseTo(1, 6);

    const imported = await roundTrip(model);
    try {
      expectImportedBody(imported, wall, 'PARAMETRIC', 'wall with door');
    } finally {
      disposeImportedModel(imported);
      model[Symbol.dispose]();
    }
  }, 60000);
});
