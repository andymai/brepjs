import { authoring } from '../src/model/authoring.js';
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
import { BimDocument } from '../src/model/bimDocument.js';
import type { WallSpec } from '../src/specs/wallSpec.js';
import type { RecordRef } from '../src/identity/recordRef.js';
import type { BimError } from '../src/errors/bimError.js';
import type { Body } from '../src/types/body.js';
import { measureBodyMaterial, bodyBounds } from '../src/types/body.js';
import { setBodyTestHooksForTesting } from '../src/bodyTestHooks.js';
import { ordinalOf, recordCounter } from '../src/identity/recordRef.js';
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
// The occt-wasm run requires the native slot oracle. OCCT has no equivalent
// counter, so its run checks geometry, ownership rejection, and disposer counts.
// A missing oracle on occt-wasm throws from nativeShapeCount().
const arena = () => (currentKernel === 'occt-wasm' ? nativeShapeCount() : null);
function expectArena(count: number | null) {
  if (count !== null) expect(nativeShapeCount()).toBe(count);
}
afterEach(() => {
  vi.restoreAllMocks();
  setBodyTestHooksForTesting(null);
});

it.each(['Proxy', 'Fill'] as const)(
  'rejects a native-valid Face at the %s adoption boundary without transfer or identity effects',
  (kind) => {
    const baseline = arena();
    {
      using model = new BimDocument();
      const existing = unwrap(authoring(model).addSite({ name: 'Existing' }));
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
        kind === 'Proxy' ? authoring(model).addProxy.bind(authoring(model)) : authoring(model).addEarthworksFill.bind(authoring(model));
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
      expect(ordinalOf(retry)).toBe(ordinalOf(existing) + 1);
      const adopted = model.getElement(retry);
      if (adopted?.representation !== 'BODY') throw new Error('Expected a retained Body');
      expect(adopted.geometry.solids[0]).toBe(valid);
    }
    expectArena(baseline);
  }
);

it('creates bodyless records without native allocation or ownership', () => {
  const baseline = arena();
  using model = new BimDocument();
  unwrap(model.init({ name: 'Bodyless' }));
  unwrap(authoring(model).addSite({ name: 'Site' }));
  unwrap(authoring(model).addBridge({ name: 'Bridge' }));
  unwrap(authoring(model).addBridgePart({ name: 'Part', usageType: 'LONGITUDINAL' }));
  unwrap(authoring(model).addBuilding({ name: 'Building' }));
  unwrap(authoring(model).addStorey({ name: 'L1', elevation: 0 }));
  expect(authoring(model).addStair({ materialName: 'Concrete', flights: [] }).ok).toBe(false);
  expect(authoring(model).addRamp({ materialName: 'Concrete', flights: [] }).ok).toBe(false);
  unwrap(authoring(model).addElementAssembly({ name: 'Assembly' }));
  unwrap(authoring(model).addZone({ name: 'Zone' }));
  unwrap(authoring(model).addSystem({ name: 'System' }));
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
  using model = new BimDocument();
  const site = unwrap(authoring(model).addSite({ name: 'Site' }));
  using input = box(1, 1, 1);
  let reads = 0;
  const body = { kind: 'AUTHORITATIVE', solids: [input] } satisfies Body;
  for (const [id, code] of [
    [recordCounter(1000).next(), 'BODY_TARGET_NOT_FOUND'],
    [site, 'BODY_UNSUPPORTED_CATEGORY'],
  ] as const) {
    expect(
      model.replaceBody({
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
  using model = new BimDocument();
  const first = box(1, 1, 1);
  using second = box(2, 2, 2);
  const spec = { name: 'Caller', solid: first };
  const id = unwrap(authoring(model).addProxy(spec));
  spec.solid = second;
  const element = model.getElement(id);
  if (element?.category !== 'PROXY') throw new Error('Expected Proxy');
  expect(element.geometry.solids[0]).toBe(first);
  if (element.spec === null) throw new Error('Missing Proxy metadata');
  expect(element.spec).not.toHaveProperty('solid');
  expect(Reflect.set(element.spec, 'solid', second)).toBe(false);
  expect(Object.isFrozen(spec)).toBe(false);
  model[Symbol.dispose]();
  expect(first.disposed).toBe(true);
  expect(second.disposed).toBe(false);
});

it('leaves earlier live inputs unregistered when a later item has an ownership conflict', () => {
  const baseline = arena();
  {
    using model = new BimDocument();
    const id = unwrap(authoring(model).addWall(WALL));
    const before = model.getElement(id);
    if (before?.category !== 'WALL') throw new Error('Expected Wall');
    const first = box(1, 1, 1);
    expect(
      model.replaceBody({
        localId: id,
        body: { kind: 'PARAMETRIC', solids: [first, before.geometry.solids[0]] },
      })
    ).toMatchObject({ ok: false, error: { metadata: { itemIndex: 1 } } });
    expect(first.disposed).toBe(false);
    expect(model.getElement(id)).toBe(before);
    unwrap(authoring(model).addProxy({ name: 'Retry first input', solid: first }));
  }
  expectArena(baseline);
});

type Creator = (model: BimDocument) => Result<RecordRef, BimError>;
const creators: ReadonlyArray<readonly [string, Creator]> = [
  ['Wall', (m) => authoring(m).addWall(WALL)],
  ['Railing', (m) => authoring(m).addRailing(WALL)],
  ['Slab', (m) => authoring(m).addSlab({ ...WALL, width: 2, predefinedType: 'FLOOR' })],
  ['Beam', (m) => authoring(m).addBeam({ ...WALL, profile: PROFILE })],
  ['Column', (m) => authoring(m).addColumn({ ...WALL, profile: PROFILE })],
  ['Space', (m) => authoring(m).addSpace({ ...WALL, name: 'Room', width: 2 })],
  ['Roof', (m) => authoring(m).addRoof({ ...WALL, width: 2, predefinedType: 'FLAT_ROOF' })],
  ['Footing', (m) => authoring(m).addFooting({ ...WALL, width: 2 })],
  ['Pile', (m) => authoring(m).addPile({ ...WALL, profile: PROFILE })],
  ['Covering', (m) => authoring(m).addCovering({ ...WALL, width: 2 })],
  ['Proxy', (m) => authoring(m).addProxy({ name: 'Proxy', solid: box(1, 1, 1), materialName: 'Steel' })],
  ['Fill', (m) => authoring(m).addEarthworksFill({ name: 'Fill', solid: box(1, 1, 1), materialName: 'Soil' })],
  [
    'Curtain wall',
    (m) =>
      authoring(m).addCurtainWall({
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
    using model = new BimDocument();
    const target = unwrap(authoring(model).addWall(WALL));
    const id = unwrap(create(model));
    const element = model.getElement(id);
    if (element === null) throw new Error('Missing created element');
    expect(Object.isFrozen(element)).toBe(true);
    let items: readonly ValidSolid[];
    if (element.representation === 'BODY') items = element.geometry.solids;
    else if (element.category === 'CURTAIN_WALL') {
      expect(element.representation).toBe('NONE');
      items = model.getChildren(id).flatMap((child) => {
        if (child.representation !== 'BODY') throw new Error('Missing component Body');
        expect(Object.isFrozen(child.geometry.solids)).toBe(true);
        expect(Object.isFrozen(child.placement)).toBe(true);
        return [...child.geometry.solids];
      });
    } else throw new Error('Expected retained geometry');
    const attempts = items.map((solid) => vi.spyOn(solid, Symbol.dispose));
    for (const item of items) {
      expect(
        model.replaceBody({
          localId: target,
          body: { kind: 'AUTHORITATIVE', solids: [item] },
        })
      ).toMatchObject({ ok: false, error: { code: 'BODY_OWNERSHIP_CONFLICT' } });
      expect(authoring(model).addProxy({ name: 'Reuse', solid: item })).toMatchObject({
        ok: false,
        error: { code: 'BODY_OWNERSHIP_CONFLICT' },
      });
      expect(
        authoring(model).addEarthworksFill({ name: 'Reuse', materialName: 'Soil', solid: item })
      ).toMatchObject({ ok: false, error: { code: 'BODY_OWNERSHIP_CONFLICT' } });
      expect(item.disposed).toBe(false);
      const independent = unwrap(clone(item));
      unwrap(authoring(model).addProxy({ name: 'Copy', solid: independent }));
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
        using model = new BimDocument();
        const id = unwrap(authoring(model).addWall(WALL));
        const first = box(1, 1, 1, { at: [0.5, 0.5, 0.5] });
        const second = box(1, 1, 1, { at: [offset + 0.5, 0.5, 0.5] });
        const input = { kind, solids: [first, second] } satisfies Body;
        unwrap(model.replaceBody({ localId: id, body: input }));
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
        expect(unwrap(measureBodyMaterial(element.geometry.solids))).toBeCloseTo(
          offset < 1 ? 1 + offset : 2,
          8
        );
        const bounds = unwrap(bodyBounds(element.geometry, { kind: 'LOCAL' }));
        expect(bounds.bounds.xMin).toBeCloseTo(0, 6);
        expect(bounds.bounds.xMax).toBeCloseTo(1 + offset, 6);
        const placed = unwrap(model.placedSolids(element.localId, 'WORLD'));
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
  using model = new BimDocument();
  const project = unwrap(model.init({ name: 'Metadata' }));
  const storey = unwrap(authoring(model).addStorey({ name: 'L1', elevation: 1000 }));
  const id = unwrap(
    authoring(model).addWall({ ...WALL, classification: { code: 'A', description: 'Wall', system: 'Test' } })
  );
  model.aggregate(project, storey);
  model.placeIn(id, storey);
  const style = { name: 'Brick', r: 0.8, g: 0.2, b: 0.1 };
  model.setSurfaceStyle(id, style);
  const assignedStyle=model.getSurfaceStyle(id);
  expect(assignedStyle).toEqual(style);
  const before = model.getElement(id);
  const relations = model.getAllRelationships();
  unwrap(
    model.replaceBody({
      localId: id,
      body: { kind: 'AUTHORITATIVE', solids: [box(4, 5, 6)] },
    })
  );
  const after = model.getElement(id);
  expect(after).toMatchObject({ guid: before?.guid, localId: id });
  expect(after?.spec).toBe(before?.spec);
  expect(model.getSurfaceStyle(id)).toBe(assignedStyle);
  expect(model.getAllRelationships()).toEqual(relations);
  model.getAllRelationships().forEach((rel, index) => expect(rel).toBe(relations[index]));
});

it('rolls back generated adoption failures and later relationship failures without consuming identity', () => {
  using model = new BimDocument();
  const original = unwrap(authoring(model).addWall(WALL));
  const records = model.getAllElements();
  const relationships = model.getAllRelationships();
  const live = arena();
  setBodyTestHooksForTesting({
    before: ({ step }) => {
      if (step === 'validate') throw new Error('Adoption validation');
    },
  });
  expect(authoring(model).addWall(WALL, { stableKey: 'retry' })).toMatchObject({ ok: false });
  setBodyTestHooksForTesting(null);
  expectArena(live);
  const layers = new Proxy([{ name: 'Brick', thicknessMm: 1 }], {
    get(target, key, receiver): unknown {
      if (key === 'length') throw new Error('Relationship preparation');
      return Reflect.get(target, key, receiver);
    },
  });
  expect(authoring(model).addWall({ ...WALL, materialLayers: layers }, { stableKey: 'retry' })).toMatchObject({
    ok: false,
    error: { code: 'MODEL_COMMAND_FAILED' },
  });
  expectArena(live);
  expect(model.getAllElements()).toEqual(records);
  expect(model.getAllRelationships()).toEqual(relationships);
  const retry = unwrap(authoring(model).addWall(WALL, { stableKey: 'retry' }));
  expect(ordinalOf(retry)).toBe(ordinalOf(original) + 2);
});

it('rejects malformed runtime Bodies and later native validation throws without transfer', () => {
  using model = new BimDocument();
  const id = unwrap(authoring(model).addWall(WALL));
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
    const result: unknown = Reflect.apply(model.replaceBody.bind(model), model, [
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
    model.replaceBody({
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
  const rejected: unknown = Reflect.apply(model.replaceBody.bind(model), model, [
    { localId: id, body: { kind: 'AUTHORITATIVE', solids: throwingItems } },
  ]);
  expect(rejected).toMatchObject({ ok: false, error: { itemIndex: 1, cause } });
  expect(model.getElement(id)).toBe(original);
  expect(first.disposed).toBe(false);
  expect(second.disposed).toBe(false);
  expect(unwrap(measureVolume(second))).toBeCloseTo(8, 8);
  expectArena(live);
});
