import { beforeAll, afterEach, expect, it, vi } from 'vitest';
import { box, unwrap, type ValidSolid } from 'brepjs';
import { BimModel } from '../src/model/bimModel.js';
import type { WallSpec } from '../src/specs/wallSpec.js';
import { currentKernel, initKernel } from '../../../tests/setup.js';
import { nativeShapeCount } from './helpers/nativeArena.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

const WALL: WallSpec = {
  length: 2,
  height: 3,
  thickness: 1,
  origin: [0, 0, 0],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  materialName: 'Brick',
};
const arena = () => (currentKernel === 'occt-wasm' ? nativeShapeCount() : null);
function expectArena(count: number | null) {
  if (count !== null) expect(nativeShapeCount()).toBe(count);
}
afterEach(() => vi.restoreAllMocks());

it('reports post-release failure as COMMITTED, attempts every old item once, and exposes only committed reads', () => {
  const baseline = arena();
  const model = new BimModel();
  const id = unwrap(model.addWall(WALL));
  const first = box(1, 1, 1);
  const second = box(1, 1, 1);
  unwrap(
    model.replaceProductBody({ localId: id, body: { kind: 'PARAMETRIC', solids: [first, second] } })
  );
  const next = box(2, 2, 2);
  const cause = new Error('Failure after native release');
  const firstRelease = first[Symbol.dispose].bind(first);
  const secondRelease = second[Symbol.dispose].bind(second);
  let callbackRead: unknown;
  let reentrant: unknown;
  let metadataMutation: unknown;
  let specReads = 0;
  const firstAttempt = vi.spyOn(first, Symbol.dispose).mockImplementation(() => {
    callbackRead = model.getElement(id)?.geometry;
    reentrant = model.addWall({
      ...WALL,
      get length() {
        specReads++;
        return 1;
      },
    });
    try {
      model.setSurfaceStyle(id, { name: 'late', r: 1, g: 0, b: 0 });
    } catch (error) {
      metadataMutation = error;
    }
    firstRelease();
    throw cause;
  });
  const secondAttempt = vi.spyOn(second, Symbol.dispose).mockImplementation(secondRelease);
  const nextAttempt = vi.spyOn(next, Symbol.dispose);
  const receipt = unwrap(
    model.replaceProductBody({ localId: id, body: { kind: 'AUTHORITATIVE', solids: [next] } })
  );
  expect(receipt).toMatchObject({
    kind: 'COMMITTED',
    localId: id,
    cleanup: {
      kind: 'FAILED',
      diagnostics: [{ operation: 'replaceProductBody', localId: id, itemIndex: 0, cause }],
    },
  });
  expect(callbackRead).toBe(model.getElement(id)?.geometry);
  expect(callbackRead).toMatchObject({ solids: [next] });
  expect(reentrant).toMatchObject({ ok: false, error: { code: 'MODEL_BUSY' } });
  expect(metadataMutation).toMatchObject({ cause: { code: 'MODEL_BUSY' } });
  expect(specReads).toBe(0);
  expect(firstAttempt).toHaveBeenCalledTimes(1);
  expect(secondAttempt).toHaveBeenCalledTimes(1);
  expect(nextAttempt).not.toHaveBeenCalled();
  const diagnostics = model.getGeometryCleanupDiagnostics();
  expect(diagnostics).toHaveLength(1);
  expect(Object.isFrozen(diagnostics)).toBe(true);
  expect(Object.isFrozen(diagnostics[0])).toBe(true);
  expect(Reflect.set(diagnostics, 'length', 0)).toBe(false);
  model[Symbol.dispose]();
  model[Symbol.dispose]();
  expect(firstAttempt).toHaveBeenCalledTimes(1);
  expect(secondAttempt).toHaveBeenCalledTimes(1);
  expect(nextAttempt).toHaveBeenCalledTimes(1);
  expect(model.getGeometryCleanupDiagnostics()).toEqual(diagnostics);
  expectArena(baseline);
});

it('retains responsibility for a live uncertain retirement and never readopts or retries it', () => {
  const baseline = arena();
  const model = new BimModel();
  const id = unwrap(model.addWall(WALL));
  const wall = model.getElement(id);
  if (wall?.category !== 'WALL') throw new Error('Expected Wall');
  const uncertain = wall.geometry.solids[0];
  const realRelease = uncertain[Symbol.dispose].bind(uncertain);
  const cause = new Error('Failure before native release');
  const attempt = vi.spyOn(uncertain, Symbol.dispose).mockImplementation(() => {
    throw cause;
  });
  try {
    const next = box(2, 2, 2);
    const receipt = unwrap(
      model.replaceProductBody({ localId: id, body: { kind: 'AUTHORITATIVE', solids: [next] } })
    );
    expect(receipt.cleanup.kind).toBe('FAILED');
    expect(uncertain.disposed).toBe(false);
    expect(
      model.replaceProductBody({
        localId: id,
        body: { kind: 'AUTHORITATIVE', solids: [uncertain] },
      })
    ).toMatchObject({
      ok: false,
      error: { code: 'BODY_OWNERSHIP_CONFLICT', metadata: { ownerState: 'UNCERTAIN' } },
    });
    expect(model.addProxy({ name: 'Uncertain', solid: uncertain })).toMatchObject({
      ok: false,
      error: { code: 'BODY_OWNERSHIP_CONFLICT' },
    });
    model[Symbol.dispose]();
    model[Symbol.dispose]();
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(model.getGeometryCleanupDiagnostics()).toMatchObject([
      { operation: 'replaceProductBody', localId: id, itemIndex: 0, cause },
    ]);
    if (baseline !== null) expect(nativeShapeCount()).toBe(baseline + 1);
  } finally {
    // Fixture repair only: the model explicitly reports this unresolved native resource.
    realRelease();
  }
  expectArena(baseline);
});

it('attempts all model-owned releases before throwing an aggregate, and disposal twice never retries', () => {
  const baseline = arena();
  const model = new BimModel();
  const inputs: ValidSolid[] = [box(1, 1, 1), box(2, 2, 2), box(3, 3, 3)];
  const attempts = inputs.map((solid, index) => {
    unwrap(model.addProxy({ name: `Proxy ${index}`, solid }));
    const release = solid[Symbol.dispose].bind(solid);
    return vi.spyOn(solid, Symbol.dispose).mockImplementation(() => {
      release();
      if (index !== 1) throw new Error(`Release ${index}`);
    });
  });
  expect(() => model[Symbol.dispose]()).toThrow(AggregateError);
  expect(model.getGeometryCleanupDiagnostics()).toHaveLength(2);
  expect(() => model[Symbol.dispose]()).not.toThrow();
  for (const attempt of attempts) expect(attempt).toHaveBeenCalledTimes(1);
  const before = model.getAllElements();
  let reads = 0;
  expect(
    model.addWall({
      ...WALL,
      get length() {
        reads++;
        return 9;
      },
    })
  ).toMatchObject({ ok: false, error: { code: 'MODEL_DISPOSED' } });
  expect(model.init({ name: 'After close' })).toMatchObject({
    ok: false,
    error: { code: 'MODEL_DISPOSED' },
  });
  expect(model.addSite({ name: 'After close' })).toMatchObject({
    ok: false,
    error: { code: 'MODEL_DISPOSED' },
  });
  expect(reads).toBe(0);
  expect(model.getAllElements()).toEqual(before);
  expectArena(baseline);
});

it('keeps a successful LocalId outcome and diagnostics when retiring a slab opening host fails', () => {
  const baseline = arena();
  const model = new BimModel();
  const id = unwrap(model.addSlab({ ...WALL, length: 10, width: 10, predefinedType: 'FLOOR' }));
  const before = model.getElement(id);
  if (before?.category !== 'SLAB') throw new Error('Expected Slab');
  const release = before.geometry[Symbol.dispose].bind(before.geometry);
  let callbackRelationships: unknown;
  const cause = new Error('Old slab release');
  const attempt = vi.spyOn(before.geometry, Symbol.dispose).mockImplementation(() => {
    callbackRelationships = model.getAllRelationships();
    release();
    throw cause;
  });
  const opening = unwrap(
    model.addSlabOpening({ slabLocalId: id, sizeX: 1, sizeY: 1, offsetX: 1, offsetY: 1 })
  );
  expect(model.getElement(opening)?.category).toBe('OPENING');
  expect(callbackRelationships).toEqual(model.getAllRelationships());
  expect(model.getGeometryCleanupDiagnostics()).toMatchObject([
    { operation: 'addSlabOpening', localId: id, itemIndex: 0, cause },
  ]);
  const after = model.getElement(id);
  if (after?.category !== 'SLAB') throw new Error('Expected Slab');
  expect(after.geometry === before.geometry).toBe(false);
  expect(model.addProxy({ name: 'Borrowed slab', solid: after.geometry })).toMatchObject({
    ok: false,
    error: { code: 'BODY_OWNERSHIP_CONFLICT' },
  });
  model[Symbol.dispose]();
  model[Symbol.dispose]();
  expect(attempt).toHaveBeenCalledTimes(1);
  expectArena(baseline);
});
