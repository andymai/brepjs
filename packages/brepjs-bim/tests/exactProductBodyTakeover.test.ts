import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { box, cut, cylinder, measureVolume, translate, type ValidSolid } from 'brepjs';
import { initKernel } from '../../../tests/setup.js';
import { BimModel } from '../src/model/bimModel.js';
import {
  placedSolids,
  setPlacedGeometryTestHooksForTesting,
} from '../src/elementFns/placedGeometry.js';
import { bodySolids, type ProductBody } from '../src/types/productBody.js';
import type { LocalId } from '../src/identity/localId.js';
import { toIfc } from '../src/serialize/toIfc.js';
import {
  setExactBodyItemPreparerForTesting,
  type ExactBodyItemPreparer,
} from '../src/serialize/exactBodyPreflight.js';
import { setIfcWriterTestHooksForTesting } from '../src/ifc-writer/ifcWriter.js';
import { fromIfc } from '../src/import/fromIfc.js';
import { disposeImportedModel } from '../src/import/importedModel.js';

beforeAll(async () => {
  await initKernel();
}, 30_000);

afterEach(() => {
  setPlacedGeometryTestHooksForTesting(null);
  setExactBodyItemPreparerForTesting(null);
  setIfcWriterTestHooksForTesting(null);
});

const FRAME = {
  origin: [0, 0, 0] as [number, number, number],
  axisX: [1, 0, 0] as [number, number, number],
  axisZ: [0, 0, 1] as [number, number, number],
};

const WALL_SPEC = {
  length: 1_000,
  height: 500,
  thickness: 100,
  ...FRAME,
  materialName: 'Concrete',
};

const RAILING_SPEC = {
  length: 1_000,
  height: 500,
  thickness: 100,
  ...FRAME,
  materialName: 'Steel',
};

type ExactProductBody = Extract<ProductBody, { readonly kind: 'EXACT' }>;

describe('BimModel.takeExactProductBody', () => {
  it('atomically transfers every exact handle and disposes the superseded Body once', () => {
    const model = new BimModel();
    const wallId = required(model.addWall(WALL_SPEC));
    const wallBefore = requiredElement(model, wallId, 'WALL');
    const oldSolid = bodySolids(wallBefore.geometry)[0];
    let oldDisposals = 0;
    oldSolid.onDispose(() => oldDisposals++);

    const first = box(100, 100, 100);
    const source = box(50, 50, 50);
    const second = translate(source, [200, 0, 0]);
    source[Symbol.dispose]();
    const exactDisposals = [0, 0];
    first.onDispose(() => exactDisposals[0]++);
    second.onDispose(() => exactDisposals[1]++);

    const takeover = model.takeExactProductBody(wallId, { kind: 'EXACT', solids: [first, second] });
    expect(takeover.ok).toBe(true);
    expect(oldDisposals).toBe(1);
    expect(first.disposed).toBe(false);
    expect(second.disposed).toBe(false);
    expect(requiredElement(model, wallId, 'WALL').geometry).toEqual({
      kind: 'EXACT',
      solids: [first, second],
    });

    model[Symbol.dispose]();
    expect(exactDisposals).toEqual([1, 1]);
  });

  it('rejects missing and unsupported targets without taking caller inputs', () => {
    const model = new BimModel();
    const slabId = required(
      model.addSlab({
        length: 1_000,
        width: 500,
        thickness: 100,
        ...FRAME,
        predefinedType: 'FLOOR',
        materialName: 'Concrete',
      })
    );
    using missingInput = box(10, 10, 10);
    using categoryInput = box(20, 20, 20);

    const missing = model.takeExactProductBody(localIdBeyondModel(), {
      kind: 'EXACT',
      solids: [missingInput],
    });
    const wrongCategory = model.takeExactProductBody(slabId, {
      kind: 'EXACT',
      solids: [categoryInput],
    });

    expect(errorCode(missing)).toBe('EXACT_BODY_TARGET_NOT_FOUND');
    expect(errorCode(wrongCategory)).toBe('EXACT_BODY_UNSUPPORTED_CATEGORY');
    expect(missingInput.disposed).toBe(false);
    expect(categoryInput.disposed).toBe(false);
    model[Symbol.dispose]();
  });

  it('rejects empty, duplicate, disposed, and invalid collections before mutation', () => {
    const model = new BimModel();
    const wallId = required(model.addWall(WALL_SPEC));
    const original = requiredElement(model, wallId, 'WALL').geometry;

    const emptyBody = { kind: 'EXACT', solids: [] } as unknown as ExactProductBody;
    expect(errorCode(model.takeExactProductBody(wallId, emptyBody))).toBe('EXACT_BODY_EMPTY');

    using duplicate = box(30, 30, 30);
    expect(
      errorCode(
        model.takeExactProductBody(wallId, { kind: 'EXACT', solids: [duplicate, duplicate] })
      )
    ).toBe('EXACT_BODY_DUPLICATE_SOLID');

    const disposed = box(40, 40, 40);
    let disposedCalls = 0;
    disposed.onDispose(() => disposedCalls++);
    disposed[Symbol.dispose]();
    expect(
      errorCode(model.takeExactProductBody(wallId, { kind: 'EXACT', solids: [disposed] }))
    ).toBe('EXACT_BODY_SOLID_DISPOSED');
    expect(disposedCalls).toBe(1);

    const invalid = { disposed: false } as unknown as ValidSolid;
    expect(
      errorCode(model.takeExactProductBody(wallId, { kind: 'EXACT', solids: [invalid] }))
    ).toBe('EXACT_BODY_SOLID_INVALID');
    expect(requiredElement(model, wallId, 'WALL').geometry).toBe(original);
    model[Symbol.dispose]();
  });

  it('rejects replacement of an already exact Body and leaves both collections owned correctly', () => {
    const model = new BimModel();
    const railingId = required(model.addRailing(RAILING_SPEC));
    const selected = box(100, 20, 20);
    const rejected = box(100, 30, 30);
    let selectedDisposals = 0;
    let rejectedDisposals = 0;
    selected.onDispose(() => selectedDisposals++);
    rejected.onDispose(() => rejectedDisposals++);
    expect(model.takeExactProductBody(railingId, { kind: 'EXACT', solids: [selected] }).ok).toBe(
      true
    );

    const second = model.takeExactProductBody(railingId, {
      kind: 'EXACT',
      solids: [rejected],
    });
    expect(errorCode(second)).toBe('EXACT_BODY_ALREADY_EXACT');
    expect(selected.disposed).toBe(false);
    expect(rejected.disposed).toBe(false);

    model[Symbol.dispose]();
    expect(selectedDisposals).toBe(1);
    expect(rejectedDisposals).toBe(0);
    rejected[Symbol.dispose]();
    expect(rejectedDisposals).toBe(1);
  });

  it('rejects reuse of the model-owned parametric solid', () => {
    const model = new BimModel();
    const wallId = required(model.addWall(WALL_SPEC));
    const original = requiredElement(model, wallId, 'WALL').geometry;
    if (original.kind !== 'PARAMETRIC') throw new Error('Expected a parametric wall Body');
    let originalDisposals = 0;
    original.solid.onDispose(() => originalDisposals++);

    const takeover = model.takeExactProductBody(wallId, {
      kind: 'EXACT',
      solids: [original.solid],
    });

    expect(errorCode(takeover)).toBe('EXACT_BODY_SOLID_OWNERSHIP_CONFLICT');
    expect(requiredElement(model, wallId, 'WALL').geometry).toBe(original);
    expect(original.solid.disposed).toBe(false);
    model[Symbol.dispose]();
    expect(originalDisposals).toBe(1);
  });
});

describe('exact wall mutation and multi-solid placement', () => {
  it('rejects later doors and windows without changing Body or relationships', () => {
    const model = new BimModel();
    const wallId = required(model.addWall(WALL_SPEC));
    const exact = box(1_000, 100, 500);
    required(model.takeExactProductBody(wallId, { kind: 'EXACT', solids: [exact] }));
    const bodyBefore = requiredElement(model, wallId, 'WALL').geometry;
    const relationshipsBefore = model.getAllRelationships();
    const elementsBefore = model.getAllElements();

    const door = model.addDoor({
      wallLocalId: wallId,
      width: 100,
      height: 200,
      offsetAlongWall: 100,
      offsetFromFloor: 0,
      materialName: 'Wood',
    });
    const window = model.addWindow({
      wallLocalId: wallId,
      width: 100,
      height: 100,
      offsetAlongWall: 300,
      offsetFromFloor: 200,
      materialName: 'Glass',
    });

    expect(errorCode(door)).toBe('EXACT_WALL_BODY_IMMUTABLE');
    expect(errorCode(window)).toBe('EXACT_WALL_BODY_IMMUTABLE');
    expect(requiredElement(model, wallId, 'WALL').geometry).toBe(bodyBefore);
    expect(model.getAllRelationships()).toEqual(relationshipsBefore);
    expect(model.getAllElements()).toEqual(elementsBefore);
    model[Symbol.dispose]();
  });

  it('returns one independent caller-owned placed copy per exact Body item', () => {
    const model = new BimModel();
    const railingId = required(model.addRailing(RAILING_SPEC));
    const first = box(100, 20, 20);
    const second = box(100, 30, 30);
    required(model.takeExactProductBody(railingId, { kind: 'EXACT', solids: [first, second] }));

    const placed = required(placedSolids(requiredElement(model, railingId, 'RAILING')));
    expect(placed).toHaveLength(2);
    expect(placed[0]).not.toBe(first);
    expect(placed[1]).not.toBe(second);
    for (const solid of placed) solid[Symbol.dispose]();
    expect(first.disposed).toBe(false);
    expect(second.disposed).toBe(false);
    model[Symbol.dispose]();
  });

  it('preserves curved exact-Body volume through rotated placement', () => {
    const model = new BimModel();
    const angle = Math.PI / 6;
    const wallId = required(
      model.addWall({
        ...WALL_SPEC,
        origin: [1_000, 2_000, 3_000],
        axisX: [Math.cos(angle), Math.sin(angle), 0],
      })
    );
    using outer = box(1_200, 100, 500);
    using cutter = cylinder(125, 200, { at: [300, -50, 250], axis: [0, 1, 0] });
    const exact = required(cut(outer, cutter));
    const localVolume = required(measureVolume(exact));
    required(model.takeExactProductBody(wallId, { kind: 'EXACT', solids: [exact] }));

    const placed = required(placedSolids(requiredElement(model, wallId, 'WALL')));
    try {
      expect(placed).toHaveLength(1);
      const placedSolid = placed[0];
      if (placedSolid === undefined) throw new Error('Expected one placed wall Body item');
      expect(required(measureVolume(placedSolid))).toBeCloseTo(localVolume, 6);
    } finally {
      for (const solid of placed) solid[Symbol.dispose]();
      model[Symbol.dispose]();
    }
  });

  it('disposes all partial placement outputs while preserving stored exact inputs', () => {
    const model = new BimModel();
    const railingId = required(model.addRailing(RAILING_SPEC));
    const first = box(100, 20, 20);
    const second = box(100, 30, 30);
    required(model.takeExactProductBody(railingId, { kind: 'EXACT', solids: [first, second] }));
    const placedDisposals = [0, 0];
    let placedIndex = 0;
    setPlacedGeometryTestHooksForTesting({
      afterPlaced: (solid) => {
        const current = placedIndex++;
        solid.onDispose(() => placedDisposals[current]++);
        if (current === 1) throw new Error('injected later placement failure');
      },
    });

    const placed = placedSolids(requiredElement(model, railingId, 'RAILING'));
    expect(errorCode(placed)).toBe('PLACED_GEOMETRY_FAILED');
    expect(placedDisposals).toEqual([1, 1]);
    expect(first.disposed).toBe(false);
    expect(second.disposed).toBe(false);
    model[Symbol.dispose]();
  });
});

describe('exact Product Body IFC integration', () => {
  it('round-trips a two-item exact railing without changing IFC classification', async () => {
    const model = initializedModel();
    const railingId = required(model.addRailing(RAILING_SPEC));
    const first = box(1_000, 20, 20);
    const source = box(1_000, 20, 20);
    const second = translate(source, [0, 0, 480]);
    source[Symbol.dispose]();
    required(model.takeExactProductBody(railingId, { kind: 'EXACT', solids: [first, second] }));

    const serialized = required(await toIfc(model, META));
    const text = new TextDecoder().decode(serialized);
    expect(text.match(/IFCTRIANGULATEDFACESET\(/g)).toHaveLength(2);
    expect(text).toContain('IFCRAILING(');

    const imported = required(await fromIfc(serialized));
    const railing = imported.elements.find((element) => element.category === 'RAILING');
    expect(railing?.geometry.completeness).toBe('COMPLETE');
    expect(railing?.geometry.solids).toHaveLength(2);
    disposeImportedModel(imported);
    model[Symbol.dispose]();
  });

  it('keeps overlapping exact wall items separate and writes union NetVolume', async () => {
    const model = initializedModel();
    const wallId = required(model.addWall(WALL_SPEC));
    const first = box(100, 100, 100);
    const source = box(100, 100, 100);
    const second = translate(source, [50, 0, 0]);
    source[Symbol.dispose]();
    required(model.takeExactProductBody(wallId, { kind: 'EXACT', solids: [first, second] }));

    const serialized = required(await toIfc(model, META));
    const text = new TextDecoder().decode(serialized);
    expect(text.match(/IFCTRIANGULATEDFACESET\(/g)).toHaveLength(2);

    const imported = required(await fromIfc(serialized));
    const wall = imported.elements.find((element) => element.category === 'WALL');
    expect(wall?.geometry.solids).toHaveLength(2);
    const qto = wall?.psets.find((pset) => pset.name === 'Qto_WallBaseQuantities');
    expect(Object.keys(qto?.properties ?? {}).sort()).toEqual([
      'Height',
      'Length',
      'NetVolume',
      'Width',
    ]);
    expect(qto?.properties['NetVolume']).toBeCloseTo(0.0015, 10);
    disposeImportedModel(imported);
    model[Symbol.dispose]();
  });

  it('closes the IFC writer on a returned exact-item preflight error', async () => {
    const model = initializedModel();
    const wallId = required(model.addWall(WALL_SPEC));
    const exact = box(100, 100, 100);
    required(model.takeExactProductBody(wallId, { kind: 'EXACT', solids: [exact] }));
    const failingPreparer: ExactBodyItemPreparer = () => ({
      ok: false,
      reason: 'injected preflight failure',
    });
    setExactBodyItemPreparerForTesting(failingPreparer);
    let closeCalls = 0;
    setIfcWriterTestHooksForTesting({ afterClose: () => closeCalls++ });

    const serialized = await toIfc(model, META);
    expect(errorCode(serialized)).toBe('EXACT_BODY_TESSELLATION_FAILED');
    expect(closeCalls).toBe(1);
    expect(exact.disposed).toBe(false);
    model[Symbol.dispose]();
  });
});

const META = { applicationName: 'exact-body-test', applicationVersion: '1' };

function initializedModel(): BimModel {
  const model = new BimModel();
  required(model.init({ name: 'Exact Body Test', projectId: 'exact-body-test' }));
  return model;
}

function required<T, E extends { readonly message: string }>(
  result: { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E }
): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function errorCode(result: {
  readonly ok: boolean;
  readonly error?: { readonly code: string };
}): string {
  if (result.ok || result.error === undefined) throw new Error('Expected an error Result');
  return result.error.code;
}

function requiredElement<C extends 'WALL' | 'RAILING'>(
  model: BimModel,
  localId: LocalId,
  category: C
): Extract<ReturnType<BimModel['getAllElements']>[number], { readonly category: C }> {
  const element = model.getElement(localId);
  if (element === null || element.category !== category) {
    throw new Error(`Expected ${category} element ${localId}`);
  }
  return element;
}

function localIdBeyondModel(): LocalId {
  return 1_000_000 as LocalId;
}
