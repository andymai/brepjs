import { beforeAll, afterEach, expect, it, vi } from 'vitest';
import {
  box,
  clone,
  getKernel,
  measureVolume,
  polygon,
  unwrap,
  type Result,
  type ValidSolid,
} from 'brepjs';
import { BimModel } from '../src/model/bimModel.js';
import type { WallSpec } from '../src/specs/wallSpec.js';
import type { LocalId } from '../src/identity/localId.js';
import type { BimError } from '../src/errors/bimError.js';
import type { ProductBody } from '../src/types/productBody.js';
import { measureProductBodyMaterial, productBodyBounds } from '../src/types/productBody.js';
import { placedSolids } from '../src/elementFns/placedGeometry.js';
import { setProductBodyTestHooksForTesting } from '../src/productBodyTestHooks.js';
import { makeLocalIdCounter } from '../src/identity/localId.js';
import { currentKernel, initKernel } from '../../../tests/setup.js';
import { nativeShapeCount } from './helpers/nativeArena.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

const WALL: WallSpec = {
  length: 2,
  height: 3,
  thickness: 1,
  origin: [10, 20, 30],
  axisX: [0, 1, 0],
  axisZ: [0, 0, 1],
  materialName: 'Brick',
};
const PROFILE = { kind: 'RECTANGULAR', width: 1, height: 1 } as const;
const arena = () => (currentKernel === 'occt-wasm' ? nativeShapeCount() : null);
function expectArena(count: number | null) {
  if (count !== null) expect(nativeShapeCount()).toBe(count);
}
afterEach(() => {
  vi.restoreAllMocks();
  setProductBodyTestHooksForTesting(null);
});

it.each(['Proxy', 'Fill'] as const)(
  'rejects a native-valid Face at the %s adoption boundary without transfer or identity effects',
  (kind) => {
    const baseline = arena();
    {
      using model = new BimModel();
      const existing = unwrap(model.addSite({ name: 'Existing' }));
      using face = unwrap(
        polygon([
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0],
        ])
      );
      expect(getKernel().shapeType(face.wrapped)).toBe('face');
      expect(getKernel().isValid(face.wrapped)).toBe(true);
      const command =
        kind === 'Proxy' ? model.addProxy.bind(model) : model.addEarthworksFill.bind(model);
      const before = model.getAllElements();
      const relations = model.getAllRelationships();
      const result: unknown = Reflect.apply(command, model, [
        { name: 'Invalid', materialName: 'Test', solid: face },
        { stableKey: 'retry-solid' },
      ]);
      expect(result).toMatchObject({
        ok: false,
        error: { code: 'BODY_INVALID_ITEM', itemIndex: 0 },
      });
      expect(face.disposed).toBe(false);
      expect(model.getAllElements()).toEqual(before);
      expect(model.getAllRelationships()).toEqual(relations);
      const valid = box(1, 1, 1);
      const retry = unwrap(
        command({ name: 'Valid', materialName: 'Test', solid: valid }, { stableKey: 'retry-solid' })
      );
      expect(retry).toBe(existing + 1);
      expect(model.getElement(retry)?.geometry).toBe(valid);
    }
    expectArena(baseline);
  }
);

it('creates bodyless records without native allocation or ownership', () => {
  const baseline = arena();
  const model = new BimModel();
  unwrap(model.init({ name: 'Bodyless' }));
  unwrap(model.addSite({ name: 'Site' }));
  unwrap(model.addBridge({ name: 'Bridge' }));
  unwrap(model.addBridgePart({ name: 'Part', usageType: 'LONGITUDINAL' }));
  unwrap(model.addBuilding({ name: 'Building' }));
  unwrap(model.addStorey({ name: 'L1', elevation: 0 }));
  unwrap(model.addStair({ materialName: 'Concrete', flights: [] }));
  unwrap(model.addRamp({ materialName: 'Concrete', flights: [] }));
  unwrap(model.addElementAssembly({ name: 'Assembly' }));
  unwrap(model.addZone({ name: 'Zone' }));
  unwrap(model.addSystem({ name: 'System' }));
  for (const element of model.getAllElements()) {
    expect(element.geometry).toBeNull();
    expect(Object.isFrozen(element)).toBe(true);
  }
  expectArena(baseline);
  model[Symbol.dispose]();
  model[Symbol.dispose]();
  expectArena(baseline);
});

it('rejects missing or unsupported targets before reading the incoming Body', () => {
  using model = new BimModel();
  const site = unwrap(model.addSite({ name: 'Site' }));
  using input = box(1, 1, 1);
  let reads = 0;
  const body = { kind: 'AUTHORITATIVE', solids: [input] } satisfies ProductBody;
  for (const [id, code] of [
    [makeLocalIdCounter(1000).next(), 'BODY_TARGET_NOT_FOUND'],
    [site, 'BODY_UNSUPPORTED_CATEGORY'],
  ] as const) {
    expect(
      model.replaceProductBody({
        localId: id,
        get body() {
          reads++;
          return body;
        },
      })
    ).toMatchObject({ ok: false, error: { code } });
  }
  expect(reads).toBe(0);
  expect(input.disposed).toBe(false);
});

it('snapshots caller ownership descriptors without freezing the caller or cloning its native handle', () => {
  const model = new BimModel();
  const first = box(1, 1, 1);
  using second = box(2, 2, 2);
  const spec = { name: 'Caller', solid: first };
  const id = unwrap(model.addProxy(spec));
  spec.solid = second;
  const element = model.getElement(id);
  if (element?.category !== 'PROXY') throw new Error('Expected Proxy');
  expect(element.geometry).toBe(first);
  expect(element.spec.solid).toBe(first);
  expect(Reflect.set(element.spec, 'solid', second)).toBe(false);
  expect(Object.isFrozen(spec)).toBe(false);
  model[Symbol.dispose]();
  expect(first.disposed).toBe(true);
  expect(second.disposed).toBe(false);
});

it('leaves earlier live inputs unregistered when a later item has an ownership conflict', () => {
  const baseline = arena();
  {
    using model = new BimModel();
    const id = unwrap(model.addWall(WALL));
    const before = model.getElement(id);
    if (before?.category !== 'WALL') throw new Error('Expected Wall');
    const first = box(1, 1, 1);
    expect(
      model.replaceProductBody({
        localId: id,
        body: { kind: 'PARAMETRIC', solids: [first, before.geometry.solids[0]] },
      })
    ).toMatchObject({ ok: false, error: { metadata: { itemIndex: 1 } } });
    expect(first.disposed).toBe(false);
    expect(model.getElement(id)).toBe(before);
    unwrap(model.addProxy({ name: 'Retry first input', solid: first }));
  }
  expectArena(baseline);
});

type Creator = (model: BimModel) => Result<LocalId, BimError>;
const creators: ReadonlyArray<readonly [string, Creator]> = [
  ['Wall', (m) => m.addWall(WALL)],
  ['Railing', (m) => m.addRailing(WALL)],
  ['Slab', (m) => m.addSlab({ ...WALL, width: 2, predefinedType: 'FLOOR' })],
  ['Beam', (m) => m.addBeam({ ...WALL, profile: PROFILE })],
  ['Column', (m) => m.addColumn({ ...WALL, profile: PROFILE })],
  ['Space', (m) => m.addSpace({ ...WALL, name: 'Room', width: 2 })],
  ['Roof', (m) => m.addRoof({ ...WALL, width: 2, predefinedType: 'FLAT_ROOF' })],
  ['Footing', (m) => m.addFooting({ ...WALL, width: 2 })],
  ['Pile', (m) => m.addPile({ ...WALL, profile: PROFILE })],
  ['Covering', (m) => m.addCovering({ ...WALL, width: 2 })],
  ['Proxy', (m) => m.addProxy({ name: 'Proxy', solid: box(1, 1, 1), materialName: 'Steel' })],
  ['Fill', (m) => m.addEarthworksFill({ name: 'Fill', solid: box(1, 1, 1), materialName: 'Soil' })],
  [
    'Curtain wall',
    (m) =>
      m.addCurtainWall({
        ...WALL,
        width: 10,
        height: 10,
        columns: 2,
        rows: 2,
        panelThickness: 0.1,
        mullionWidth: 1,
        mullionDepth: 1,
      }),
  ],
];

it.each(creators)(
  'tracks every %s handle through public reads, rejection, and disposal',
  (_, create) => {
    const baseline = arena();
    const model = new BimModel();
    const target = unwrap(model.addWall(WALL));
    const id = unwrap(create(model));
    const element = model.getElement(id);
    if (element === null) throw new Error('Missing created element');
    expect(Object.isFrozen(element)).toBe(true);
    let items: readonly ValidSolid[];
    if (element.category === 'WALL' || element.category === 'RAILING')
      items = element.geometry.solids;
    else if (element.category === 'CURTAIN_WALL') {
      expect(Object.isFrozen(element.geometry)).toBe(true);
      expect(Object.isFrozen(element.geometry.panels)).toBe(true);
      expect(Object.isFrozen(element.geometry.mullions)).toBe(true);
      const parts = [...element.geometry.panels, ...element.geometry.mullions];
      for (const part of parts) {
        expect(Object.isFrozen(part)).toBe(true);
        expect(Reflect.set(part, 'solid', box)).toBe(false);
        expect(Reflect.set(part.origin, 0, 999)).toBe(false);
      }
      items = parts.map(({ solid }) => solid);
    } else if (element.geometry !== null) items = [element.geometry];
    else throw new Error('Expected retained geometry');
    const attempts = items.map((solid) => vi.spyOn(solid, Symbol.dispose));
    for (const item of items) {
      expect(
        model.replaceProductBody({
          localId: target,
          body: { kind: 'AUTHORITATIVE', solids: [item] },
        })
      ).toMatchObject({ ok: false, error: { code: 'BODY_OWNERSHIP_CONFLICT' } });
      expect(model.addProxy({ name: 'Reuse', solid: item })).toMatchObject({
        ok: false,
        error: { code: 'BODY_OWNERSHIP_CONFLICT' },
      });
      expect(
        model.addEarthworksFill({ name: 'Reuse', materialName: 'Soil', solid: item })
      ).toMatchObject({ ok: false, error: { code: 'BODY_OWNERSHIP_CONFLICT' } });
      expect(item.disposed).toBe(false);
      const independent = unwrap(clone(item));
      unwrap(model.addProxy({ name: 'Copy', solid: independent }));
    }
    model[Symbol.dispose]();
    model[Symbol.dispose]();
    for (const attempt of attempts) expect(attempt).toHaveBeenCalledTimes(1);
    expectArena(baseline);
  }
);

it.each(['PARAMETRIC', 'AUTHORITATIVE'] as const)(
  'retains protected %s item order through model queries',
  (kind) => {
    for (const offset of [0, 0.5, 3]) {
      const baseline = arena();
      {
        using model = new BimModel();
        const id = unwrap(model.addWall(WALL));
        const first = box(1, 1, 1, { at: [0.5, 0.5, 0.5] });
        const second = box(1, 1, 1, { at: [offset + 0.5, 0.5, 0.5] });
        const input = { kind, solids: [first, second] } satisfies ProductBody;
        unwrap(model.replaceProductBody({ localId: id, body: input }));
        input.solids.reverse();
        input.solids.pop();
        Reflect.set(input, 'kind', 'INVALID');
        const element = model.getElement(id);
        if (element?.category !== 'WALL') throw new Error('Expected Wall');
        expect(element.geometry.kind).toBe(kind);
        expect(Reflect.set(element, 'geometry', null)).toBe(false);
        expect(Reflect.set(element.geometry, 'kind', 'INVALID')).toBe(false);
        expect(Reflect.set(element.geometry.solids, 0, second)).toBe(false);
        expect(Object.isFrozen(first)).toBe(false);
        expect(element.geometry.solids).toEqual([first, second]);
        expect(unwrap(measureProductBodyMaterial(element.geometry.solids))).toBeCloseTo(
          offset < 1 ? 1 + offset : 2,
          8
        );
        const bounds = unwrap(productBodyBounds(element.geometry, { kind: 'LOCAL' }));
        expect(bounds.bounds.xMin).toBeCloseTo(0, 6);
        expect(bounds.bounds.xMax).toBeCloseTo(1 + offset, 6);
        const placed = unwrap(placedSolids(element));
        try {
          expect(placed).toHaveLength(2);
          for (const item of placed) expect(element.geometry.solids).not.toContain(item);
        } finally {
          for (const item of placed) item[Symbol.dispose]();
        }
        expect(model.getWalls()[0]?.geometry.solids).toEqual([first, second]);
      }
      expectArena(baseline);
    }
  }
);

it('preserves identity, descriptive spec, style, placement and relationship objects across replacement', () => {
  using model = new BimModel();
  const project = unwrap(model.init({ name: 'Metadata' }));
  const storey = unwrap(model.addStorey({ name: 'L1', elevation: 1000 }));
  const id = unwrap(
    model.addWall({ ...WALL, classification: { code: 'A', description: 'Wall', system: 'Test' } })
  );
  model.aggregate(project, storey);
  model.placeIn(id, storey);
  const style = { name: 'Brick', r: 0.8, g: 0.2, b: 0.1 };
  model.setSurfaceStyle(id, style);
  const before = model.getElement(id);
  const relations = model.getAllRelationships();
  unwrap(
    model.replaceProductBody({
      localId: id,
      body: { kind: 'AUTHORITATIVE', solids: [box(4, 5, 6)] },
    })
  );
  const after = model.getElement(id);
  expect(after).toMatchObject({ guid: before?.guid, localId: id });
  expect(after?.spec).toBe(before?.spec);
  expect(model.getSurfaceStyle(id)).toBe(style);
  expect(model.getAllRelationships()).toEqual(relations);
  model.getAllRelationships().forEach((rel, index) => expect(rel).toBe(relations[index]));
});

it('rolls back generated adoption failures and later relationship failures without consuming identity', () => {
  using model = new BimModel();
  const original = unwrap(model.addWall(WALL));
  const records = model.getAllElements();
  const relationships = model.getAllRelationships();
  const live = arena();
  setProductBodyTestHooksForTesting({
    before: ({ step }) => {
      if (step === 'validate') throw new Error('Adoption validation');
    },
  });
  expect(model.addWall(WALL, { stableKey: 'retry' })).toMatchObject({ ok: false });
  setProductBodyTestHooksForTesting(null);
  expectArena(live);
  const layers = new Proxy([{ name: 'Brick', thicknessMm: 1 }], {
    get(target, key, receiver): unknown {
      if (key === 'length') throw new Error('Relationship preparation');
      return Reflect.get(target, key, receiver);
    },
  });
  expect(model.addWall({ ...WALL, materialLayers: layers }, { stableKey: 'retry' })).toMatchObject({
    ok: false,
    error: { code: 'MODEL_COMMAND_FAILED' },
  });
  expectArena(live);
  expect(model.getAllElements()).toEqual(records);
  expect(model.getAllRelationships()).toEqual(relationships);
  const retry = unwrap(model.addWall(WALL, { stableKey: 'retry' }));
  expect(retry).toBe(original + 2);
});

it('rejects malformed runtime Bodies and later native validation throws without transfer', () => {
  using model = new BimModel();
  const id = unwrap(model.addWall(WALL));
  const original = model.getElement(id);
  using first = box(1, 1, 1);
  using second = box(2, 2, 2);
  using wire = unwrap(
    polygon([
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
    ])
  );
  const disposed = box(3, 3, 3);
  disposed[Symbol.dispose]();
  const live = arena();
  const invalid: unknown[] = [
    null,
    { kind: 'EXACT', solids: [first] },
    { kind: 'PARAMETRIC', solids: [] },
    { kind: 'PARAMETRIC', solids: [first, first] },
    { kind: 'PARAMETRIC', solids: [first, disposed] },
    { kind: 'PARAMETRIC', solids: [first, {}] },
    { kind: 'PARAMETRIC', solids: [first, wire] },
    {
      kind: 'AUTHORITATIVE',
      get solids() {
        throw new Error('Body snapshot');
      },
    },
  ];
  for (const body of invalid) {
    const result: unknown = Reflect.apply(model.replaceProductBody.bind(model), model, [
      { localId: id, body },
    ]);
    expect(result).toMatchObject({ ok: false });
    expect(model.getElement(id)).toBe(original);
    expect(first.disposed).toBe(false);
    expectArena(live);
  }
  const kernel = getKernel();
  const shapeType = kernel.shapeType.bind(kernel);
  const cause = new Error('Second item native validation');
  const fault = vi.spyOn(kernel, 'shapeType').mockImplementation((raw) => {
    if (raw === second.wrapped) throw cause;
    return shapeType(raw);
  });
  expect(
    model.replaceProductBody({
      localId: id,
      body: { kind: 'AUTHORITATIVE', solids: [first, second] },
    })
  ).toMatchObject({ ok: false, error: { itemIndex: 1, cause } });
  fault.mockRestore();
  const throwingItems = [first, second];
  Object.defineProperty(throwingItems, 1, {
    get() {
      throw cause;
    },
  });
  const rejected: unknown = Reflect.apply(model.replaceProductBody.bind(model), model, [
    { localId: id, body: { kind: 'AUTHORITATIVE', solids: throwingItems } },
  ]);
  expect(rejected).toMatchObject({ ok: false, error: { itemIndex: 1, cause } });
  expect(model.getElement(id)).toBe(original);
  expect(first.disposed).toBe(false);
  expect(second.disposed).toBe(false);
  expect(unwrap(measureVolume(second))).toBeCloseTo(8, 8);
  expectArena(live);
});
