import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  box,
  clone,
  cut,
  cylinder,
  getKernel,
  getSolids,
  isValidSolid,
  measureVolume,
  translate,
} from 'brepjs';
import { initKernel } from '../../../tests/setup.js';
import { BimModel } from '../src/model/bimModel.js';
import { placedSolids } from '../src/elementFns/placedGeometry.js';
import { bodySolids } from '../src/types/productBody.js';
import { setProductBodyTestHooksForTesting } from '../src/productBodyTestHooks.js';
import type { BimElement } from '../src/types/bimTypes.js';
import type { LocalId } from '../src/identity/localId.js';
import { toIfc } from '../src/serialize/toIfc.js';
import {
  setProductBodyItemPreparerForTesting,
  type ProductBodyItemPreparer,
} from '../src/serialize/productBodyPreflight.js';
import { setIfcWriterTestHooksForTesting } from '../src/ifc-writer/ifcWriter.js';
import { prepareTessellation } from '../src/ifc-writer/tessellationWriter.js';
import { fromIfc } from '../src/import/fromIfc.js';
import { disposeImportedModel } from '../src/import/importedModel.js';

beforeAll(async () => {
  await initKernel();
}, 30_000);

afterEach(() => {
  setProductBodyTestHooksForTesting(null);
  setProductBodyItemPreparerForTesting(null);
  setIfcWriterTestHooksForTesting(null);
  vi.restoreAllMocks();
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

describe('BimModel.replaceProductBody', () => {
  it('atomically transfers every exact handle and disposes the superseded Body once', () => {
    using model = new BimModel();
    const wallId = required(model.addWall(WALL_SPEC));
    const wallBefore = requiredElement(model, wallId, 'WALL');
    const oldSolid = bodySolids(wallBefore.geometry)[0];
    const oldRelease = vi.spyOn(oldSolid, Symbol.dispose);

    const first = box(100, 100, 100);
    const source = box(50, 50, 50);
    const second = translate(source, [200, 0, 0]);
    source[Symbol.dispose]();
    const releases = [vi.spyOn(first, Symbol.dispose), vi.spyOn(second, Symbol.dispose)];

    const takeover = model.replaceProductBody({
      localId: wallId,
      body: { kind: 'AUTHORITATIVE', solids: [first, second] },
    });
    expect(takeover.ok).toBe(true);
    expect(oldRelease).toHaveBeenCalledTimes(1);
    expect(first.disposed).toBe(false);
    expect(second.disposed).toBe(false);
    expect(requiredElement(model, wallId, 'WALL').geometry).toEqual({
      kind: 'AUTHORITATIVE',
      solids: [first, second],
    });

    model[Symbol.dispose]();
    releases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
  });

  it('rejects missing and unsupported targets without taking caller inputs', () => {
    using model = new BimModel();
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

    const missing = model.replaceProductBody({
      localId: localIdBeyondModel(),
      body: {
        kind: 'AUTHORITATIVE',
        solids: [missingInput],
      },
    });
    const wrongCategory = model.replaceProductBody({
      localId: slabId,
      body: {
        kind: 'AUTHORITATIVE',
        solids: [categoryInput],
      },
    });

    expect(errorCode(missing)).toBe('BODY_TARGET_NOT_FOUND');
    expect(errorCode(wrongCategory)).toBe('BODY_UNSUPPORTED_CATEGORY');
    expect(missingInput.disposed).toBe(false);
    expect(categoryInput.disposed).toBe(false);
    model[Symbol.dispose]();
  });

  it('rejects empty, duplicate, disposed, and invalid collections before mutation', () => {
    using model = new BimModel();
    const wallId = required(model.addWall(WALL_SPEC));
    const original = requiredElement(model, wallId, 'WALL').geometry;

    expect(
      Reflect.apply(model.replaceProductBody.bind(model), model, [
        {
          localId: wallId,
          body: { kind: 'AUTHORITATIVE', solids: [] },
        },
      ])
    ).toMatchObject({ ok: false, error: { code: 'BODY_INVALID_DESCRIPTOR' } });

    using duplicate = box(30, 30, 30);
    expect(
      errorCode(
        model.replaceProductBody({
          localId: wallId,
          body: { kind: 'AUTHORITATIVE', solids: [duplicate, duplicate] },
        })
      )
    ).toBe('BODY_DUPLICATE_ITEM');

    const disposed = box(40, 40, 40);
    const disposedRelease = vi.spyOn(disposed, Symbol.dispose);
    disposed[Symbol.dispose]();
    expect(
      errorCode(
        model.replaceProductBody({
          localId: wallId,
          body: { kind: 'AUTHORITATIVE', solids: [disposed] },
        })
      )
    ).toBe('BODY_INVALID_ITEM');
    expect(disposedRelease).toHaveBeenCalledTimes(1);

    const invalid = { disposed: false };
    expect(
      Reflect.apply(model.replaceProductBody.bind(model), model, [
        {
          localId: wallId,
          body: { kind: 'AUTHORITATIVE', solids: [invalid] },
        },
      ])
    ).toMatchObject({ ok: false, error: { code: 'BODY_INVALID_ITEM', itemIndex: 0 } });
    expect(requiredElement(model, wallId, 'WALL').geometry).toBe(original);
    model[Symbol.dispose]();
  });

  it('replaces an authoritative Body and releases each adopted collection exactly once', () => {
    using model = new BimModel();
    const railingId = required(model.addRailing(RAILING_SPEC));
    const selected = box(100, 20, 20);
    const replacement = box(100, 30, 30);
    const selectedRelease = vi.spyOn(selected, Symbol.dispose);
    const replacementRelease = vi.spyOn(replacement, Symbol.dispose);
    expect(
      model.replaceProductBody({
        localId: railingId,
        body: { kind: 'AUTHORITATIVE', solids: [selected] },
      }).ok
    ).toBe(true);

    const second = model.replaceProductBody({
      localId: railingId,
      body: {
        kind: 'AUTHORITATIVE',
        solids: [replacement],
      },
    });
    expect(second).toMatchObject({
      ok: true,
      value: { kind: 'COMMITTED', localId: railingId, cleanup: { kind: 'COMPLETE' } },
    });
    expect(selected.disposed).toBe(true);
    expect(selectedRelease).toHaveBeenCalledTimes(1);
    expect(replacementRelease).not.toHaveBeenCalled();
    expect(requiredElement(model, railingId, 'RAILING').geometry.solids).toEqual([replacement]);
    expect(getKernel().volume(replacement.wrapped)).toBeCloseTo(90_000, 6);

    model[Symbol.dispose]();
    model[Symbol.dispose]();
    expect(selectedRelease).toHaveBeenCalledTimes(1);
    expect(replacementRelease).toHaveBeenCalledTimes(1);
  });

  it('rejects reuse of the model-owned parametric solid', () => {
    using model = new BimModel();
    const wallId = required(model.addWall(WALL_SPEC));
    const original = requiredElement(model, wallId, 'WALL').geometry;
    if (original.kind !== 'PARAMETRIC') throw new Error('Expected a parametric wall Body');
    const originalRelease = vi.spyOn(original.solids[0], Symbol.dispose);

    const takeover = model.replaceProductBody({
      localId: wallId,
      body: {
        kind: 'AUTHORITATIVE',
        solids: [original.solids[0]],
      },
    });

    expect(errorCode(takeover)).toBe('BODY_OWNERSHIP_CONFLICT');
    expect(requiredElement(model, wallId, 'WALL').geometry).toBe(original);
    expect(original.solids[0].disposed).toBe(false);
    model[Symbol.dispose]();
    expect(originalRelease).toHaveBeenCalledTimes(1);
  });
});

describe('exact wall mutation and multi-solid placement', () => {
  it('rejects later doors and windows without changing Body or relationships', () => {
    using model = new BimModel();
    const wallId = required(model.addWall(WALL_SPEC));
    const exact = box(1_000, 100, 500);
    required(
      model.replaceProductBody({
        localId: wallId,
        body: { kind: 'AUTHORITATIVE', solids: [exact] },
      })
    );
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

    expect(errorCode(door)).toBe('AUTHORITATIVE_WALL_BODY_IMMUTABLE');
    expect(errorCode(window)).toBe('AUTHORITATIVE_WALL_BODY_IMMUTABLE');
    expect(requiredElement(model, wallId, 'WALL').geometry).toBe(bodyBefore);
    expect(model.getAllRelationships()).toEqual(relationshipsBefore);
    expect(model.getAllElements()).toEqual(elementsBefore);
    model[Symbol.dispose]();
  });

  it('returns one independent caller-owned placed copy per exact Body item', () => {
    using model = new BimModel();
    const railingId = required(model.addRailing(RAILING_SPEC));
    const first = box(100, 20, 20);
    const second = box(100, 30, 30);
    required(
      model.replaceProductBody({
        localId: railingId,
        body: { kind: 'AUTHORITATIVE', solids: [first, second] },
      })
    );

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
    using model = new BimModel();
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
    using cutShape = required(cut(outer, cutter));
    // A Boolean may return a compound wrapper around its single solid.
    const items = getSolids(cutShape);
    expect(items).toHaveLength(1);
    const [item] = items;
    if (item === undefined || !isValidSolid(item))
      throw new Error('Expected one valid curved solid');
    const exact = required(clone(item));
    const localVolume = required(measureVolume(exact));
    required(
      model.replaceProductBody({
        localId: wallId,
        body: { kind: 'AUTHORITATIVE', solids: [exact] },
      })
    );

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
    using model = new BimModel();
    const railingId = required(model.addRailing(RAILING_SPEC));
    const first = box(100, 20, 20);
    const second = box(100, 30, 30);
    required(
      model.replaceProductBody({
        localId: railingId,
        body: { kind: 'AUTHORITATIVE', solids: [first, second] },
      })
    );
    const placedReleases: ReturnType<typeof vi.fn>[] = [];
    setProductBodyTestHooksForTesting({
      afterAllocate: ({ solid }) => {
        placedReleases.push(vi.spyOn(solid, Symbol.dispose));
        if (placedReleases.length === 2) throw new Error('injected later placement failure');
      },
    });

    const placed = placedSolids(requiredElement(model, railingId, 'RAILING'));
    expect(errorCode(placed)).toBe('BODY_OPERATION_FAILED');
    expect(placedReleases).toHaveLength(2);
    placedReleases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
    expect(first.disposed).toBe(false);
    expect(second.disposed).toBe(false);
    model[Symbol.dispose]();
  });
});

describe('exact Product Body IFC integration', () => {
  it('round-trips a two-item exact railing without changing IFC classification', async () => {
    using model = initializedModel();
    const railingId = required(model.addRailing(RAILING_SPEC));
    const first = box(1_000, 20, 20);
    const source = box(1_000, 20, 20);
    const second = translate(source, [0, 0, 480]);
    source[Symbol.dispose]();
    required(
      model.replaceProductBody({
        localId: railingId,
        body: { kind: 'AUTHORITATIVE', solids: [first, second] },
      })
    );

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
    using model = initializedModel();
    const wallId = required(model.addWall(WALL_SPEC));
    const first = box(100, 100, 100);
    const source = box(100, 100, 100);
    const second = translate(source, [50, 0, 0]);
    source[Symbol.dispose]();
    required(
      model.replaceProductBody({
        localId: wallId,
        body: { kind: 'AUTHORITATIVE', solids: [first, second] },
      })
    );

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

  it('preflights every exact Body before writing IFC lines', async () => {
    using model = initializedModel();
    const wallId = required(model.addWall(WALL_SPEC));
    const railingId = required(model.addRailing(RAILING_SPEC));
    const exactWall = box(100, 100, 100);
    const exactRailing = box(200, 20, 20);
    required(
      model.replaceProductBody({
        localId: wallId,
        body: { kind: 'AUTHORITATIVE', solids: [exactWall] },
      })
    );
    required(
      model.replaceProductBody({
        localId: railingId,
        body: { kind: 'AUTHORITATIVE', solids: [exactRailing] },
      })
    );
    let prepareCalls = 0;
    const failingPreparer: ProductBodyItemPreparer = (solid) => {
      prepareCalls++;
      return prepareCalls === 2
        ? { ok: false, reason: 'injected later preflight failure' }
        : prepareTessellation(solid);
    };
    setProductBodyItemPreparerForTesting(failingPreparer);
    let closeCalls = 0;
    let writeCalls = 0;
    setIfcWriterTestHooksForTesting({
      afterClose: () => closeCalls++,
      afterWriteLine: () => writeCalls++,
    });

    const serialized = await toIfc(model, META);
    expect(errorCode(serialized)).toBe('BODY_TESSELLATION_FAILED');
    expect(prepareCalls).toBe(2);
    expect(writeCalls).toBe(0);
    expect(closeCalls).toBe(1);
    expect(exactWall.disposed).toBe(false);
    expect(exactRailing.disposed).toBe(false);
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

function requiredElement(
  model: BimModel,
  localId: LocalId,
  category: 'WALL' | 'RAILING'
): BimElement<'WALL'> | BimElement<'RAILING'> {
  const element = model.getElement(localId);
  if (element === null || element.category !== category) {
    throw new Error(`Expected ${category} element ${localId}`);
  }
  return element;
}

function localIdBeyondModel(): LocalId {
  return 1_000_000 as LocalId;
}
