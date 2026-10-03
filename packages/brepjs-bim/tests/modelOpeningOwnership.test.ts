import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import * as brepjs from 'brepjs';
import { BimModel } from '../src/model/bimModel.js';
import { currentKernel, initKernel } from '../../../tests/setup.js';
import { nativeShapeCount } from './helpers/nativeArena.js';
import {
  addWallWithDoor,
  DOOR,
  WINDOW,
  OPENING_WALL,
  openingHost,
  singletonWallSolid,
} from './helpers/openingFixture.js';
import type { ProductBody } from '../src/types/productBody.js';

beforeAll(async () => {
  await initKernel();
}, 30000);
afterEach(() => vi.restoreAllMocks());

const arena = () => (currentKernel === 'occt-wasm' ? nativeShapeCount() : null);
function expectArena(count: number | null, uncertain = 0) {
  if (count !== null) expect(nativeShapeCount()).toBe(count + uncertain);
}

for (const kind of ['Door', 'Window', 'Slab'] as const) {
  it.each(['before', 'after'] as const)(
    `${kind} stays committed when superseded cleanup throws %s release and rejects reentry`,
    (timing) => {
      const baseline = arena();
      const model = new BimModel();
      const host = openingHost(model, kind);
      const old = host.solid();
      const release = old[Symbol.dispose].bind(old);
      const cause = new Error('Retired host cleanup');
      let callbackHost: unknown;
      let callbackRelationships: unknown;
      let reentrant: unknown;
      let specReads = 0;
      const retire = vi.spyOn(old, Symbol.dispose).mockImplementation(() => {
        callbackHost = host.solid();
        callbackRelationships = model.getAllRelationships();
        reentrant =
          kind === 'Slab'
            ? model.addSlabOpening({
                slabLocalId: host.hostId,
                get sizeX() {
                  specReads++;
                  return 1;
                },
                sizeY: 1,
                offsetX: 7,
                offsetY: 7,
              })
            : model[kind === 'Door' ? 'addDoor' : 'addWindow']({
                ...DOOR,
                wallLocalId: host.hostId,
                get width() {
                  specReads++;
                  return 1;
                },
              });
        if (timing === 'after') release();
        throw cause;
      });
      try {
        const opening = brepjs.unwrap(host.open());
        expect(opening).toBe(kind === 'Slab' ? 3 : 5);
        expect(model.getElement(opening)?.category).toBe(
          kind === 'Slab' ? 'OPENING' : kind.toUpperCase()
        );
        expect(callbackHost).toBe(host.solid());
        expect(callbackRelationships).toEqual(model.getAllRelationships());
        expect(model.getAllRelationships()).toHaveLength(kind === 'Slab' ? 2 : 4);
        expect(brepjs.getKernel().shapeType(host.solid().wrapped)).toBe('solid');
        expect(brepjs.getKernel().volume(host.solid().wrapped)).toBeCloseTo(host.cutVolume, 7);
        expect(reentrant).toMatchObject({ ok: false, error: { code: 'MODEL_BUSY' } });
        expect(specReads).toBe(0);
        expect(model.getGeometryCleanupDiagnostics()).toMatchObject([
          {
            operation: kind === 'Slab' ? 'addSlabOpening' : `add${kind}`,
            localId: host.hostId,
            cause,
          },
        ]);
        expect(model.addProxy({ name: 'Uncertain old host', solid: old })).toMatchObject({
          ok: false,
          error: { code: 'BODY_OWNERSHIP_CONFLICT', metadata: { ownerState: 'UNCERTAIN' } },
        });
        expect(model.addProxy({ name: 'Current host', solid: host.solid() })).toMatchObject({
          ok: false,
          error: { code: 'BODY_OWNERSHIP_CONFLICT', metadata: { ownerState: 'RETAINED' } },
        });
        if (timing === 'before')
          expect(brepjs.getKernel().volume(old.wrapped)).toBeCloseTo(host.volume, 7);
        model[Symbol.dispose]();
        model[Symbol.dispose]();
        expect(retire).toHaveBeenCalledTimes(1);
        expectArena(baseline, timing === 'before' ? 1 : 0);
      } finally {
        model[Symbol.dispose]();
        // Only the fixture repairs the reported uncertain native resource.
        if (!old.disposed) release();
      }
      expectArena(baseline);
    }
  );

  it(`${kind} rejects opening edits on a disposed model before native work`, () => {
    const baseline = arena();
    const model = new BimModel();
    const host = openingHost(model, kind);
    model[Symbol.dispose]();
    const polygon = vi.spyOn(brepjs, 'polygon');
    const cut = vi.spyOn(brepjs, 'cut');
    expect(host.open()).toMatchObject({ ok: false, error: { code: 'MODEL_DISPOSED' } });
    expect(polygon).not.toHaveBeenCalled();
    expect(cut).not.toHaveBeenCalled();
    expectArena(baseline);
  });
}

it.each(['PARAMETRIC', 'AUTHORITATIVE'] as const)(
  'replacing an already-cut Wall with %s Body preserves openings without cutting again',
  (kind) => {
    const baseline = arena();
    const model = new BimModel();
    try {
      const { wallId, doorId } = addWallWithDoor(model);
      const door = model.getElement(doorId);
      const openings = model.getAllElements().filter((element) => element.category === 'OPENING');
      const relationships = model.getAllRelationships();
      const old = singletonWallSolid(model, wallId);
      const copied = brepjs.unwrap(brepjs.clone(old));
      const cut = vi.spyOn(brepjs, 'cut');
      expect(
        model.replaceProductBody({ localId: wallId, body: { kind, solids: [copied] } })
      ).toMatchObject({ ok: true, value: { kind: 'COMMITTED', localId: wallId } });
      expect(cut).not.toHaveBeenCalled();
      expect(singletonWallSolid(model, wallId)).toBe(copied);
      expect(brepjs.getKernel().volume(copied.wrapped)).toBeCloseTo(54, 7);
      expect(model.getElement(doorId)).toBe(door);
      expect(model.getAllElements().filter((element) => element.category === 'OPENING')).toEqual(
        openings
      );
      expect(model.getAllRelationships()).toEqual(relationships);
      expect(old.disposed).toBe(true);
      if (kind === 'PARAMETRIC') {
        const windowId = brepjs.unwrap(model.addWindow({ ...WINDOW, wallLocalId: wallId }));
        expect(brepjs.getKernel().volume(singletonWallSolid(model, wallId).wrapped)).toBeCloseTo(
          53,
          7
        );
        expect(model.getElement(windowId)).toMatchObject({
          category: 'WINDOW',
          spec: { materialName: 'Glass' },
        });
        expect(model.getAllRelationships()).toEqual(expect.arrayContaining(relationships));
        expect(model.getElement(doorId)).toBe(door);
      }
    } finally {
      model[Symbol.dispose]();
    }
    expectArena(baseline);
  }
);

it('retains independent native geometry through repeated recipe door and window edits', () => {
  const baseline = arena();
  const model = new BimModel();
  try {
    const { wallId, doorId } = addWallWithDoor(model);
    const wallAfterDoor = singletonWallSolid(model, wallId);
    const windowId = brepjs.unwrap(model.addWindow({ ...WINDOW, wallLocalId: wallId }));
    expect(brepjs.getKernel().volume(singletonWallSolid(model, wallId).wrapped)).toBeCloseTo(53, 7);
    expect(wallAfterDoor.disposed).toBe(true);
    expect(model.getElement(doorId)?.category).toBe('DOOR');
    expect(model.getElement(windowId)?.category).toBe('WINDOW');
    expect(model.getAllRelationships().filter((rel) => rel.kind === 'VOIDS_WALL')).toHaveLength(2);
    expect(model.getAllRelationships().filter((rel) => rel.kind === 'FILLS_OPENING')).toHaveLength(
      2
    );
  } finally {
    model[Symbol.dispose]();
  }
  expectArena(baseline);
});

it('rejects an opening that would split a singleton Wall Body without partial adoption', () => {
  const baseline = arena();
  const model = new BimModel();
  try {
    const wallId = brepjs.unwrap(model.addWall(OPENING_WALL));
    const before = model.getAllElements();
    const relationships = model.getAllRelationships();
    expect(model.addDoor({ ...DOOR, wallLocalId: wallId, height: 6 })).toMatchObject({
      ok: false,
      error: { code: 'WALL_OPENING_INVALID_SOLID' },
    });
    expect(model.getAllElements()).toEqual(before);
    expect(model.getAllRelationships()).toEqual(relationships);
    expect(brepjs.getKernel().volume(singletonWallSolid(model, wallId).wrapped)).toBeCloseTo(60, 7);
  } finally {
    model[Symbol.dispose]();
  }
  expectArena(baseline);
});

it('cuts a singleton recipe Wall and commits door identities, material and ownership', () => {
  const baseline = arena();
  const model = new BimModel();
  try {
    const wallId = brepjs.unwrap(model.addWall(OPENING_WALL));
    const before = model.getElement(wallId);
    const old = singletonWallSolid(model, wallId);
    const retire = vi.spyOn(old, Symbol.dispose);
    const doorId = brepjs.unwrap(
      model.addDoor(
        { ...DOOR, wallLocalId: wallId },
        { stableKey: 'door', openingStableKey: 'opening' }
      )
    );
    const host = singletonWallSolid(model, wallId);
    expect(brepjs.getKernel().volume(host.wrapped)).toBeCloseTo(54, 7);
    expect(model.getElement(wallId)).toMatchObject({ localId: wallId, guid: before?.guid });
    expect(model.getElement(doorId)).toMatchObject({ category: 'DOOR', spec: DOOR });
    const opening = model.getAllElements().find((element) => element.category === 'OPENING');
    if (!opening) throw new Error('Expected opening');
    expect(model.getAllRelationships()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'VOIDS_WALL',
          wallLocalId: wallId,
          openingLocalId: opening.localId,
        }),
        expect.objectContaining({
          kind: 'FILLS_OPENING',
          openingLocalId: opening.localId,
          fillerLocalId: doorId,
        }),
        expect.objectContaining({
          kind: 'ASSOCIATES_MATERIAL',
          materialName: 'Wood',
          relatedObjects: [doorId],
        }),
      ])
    );
    expect(retire).toHaveBeenCalledTimes(1);
    expect(old.disposed).toBe(true);
    expect(model.addProxy({ name: 'Borrowed host', solid: host })).toMatchObject({
      ok: false,
      error: { code: 'BODY_OWNERSHIP_CONFLICT' },
    });
  } finally {
    model[Symbol.dispose]();
  }
  expectArena(baseline);
});

const unsupportedBodies: ReadonlyArray<{
  kind: ProductBody['kind'];
  multiple: boolean;
  code: string;
}> = [
  { kind: 'AUTHORITATIVE', multiple: false, code: 'AUTHORITATIVE_WALL_BODY_IMMUTABLE' },
  { kind: 'AUTHORITATIVE', multiple: true, code: 'AUTHORITATIVE_WALL_BODY_IMMUTABLE' },
  { kind: 'PARAMETRIC', multiple: true, code: 'MULTI_ITEM_WALL_OPENING_UNSUPPORTED' },
];

for (const method of ['addDoor', 'addWindow'] as const) {
  it.each(unsupportedBodies)(
    `${method} rejects $kind / multiple=$multiple before allocating or reserving identities`,
    ({ kind, multiple, code }) => {
      const baseline = arena();
      const model = new BimModel();
      try {
        const id = brepjs.unwrap(model.addWall(OPENING_WALL));
        const supportedId = brepjs.unwrap(model.addWall(OPENING_WALL));
        const first = brepjs.box(10, 1, 6);
        const solids: ProductBody['solids'] = multiple ? [first, brepjs.box(1, 1, 1)] : [first];
        brepjs.unwrap(model.replaceProductBody({ localId: id, body: { kind, solids } }));
        const before = model.getAllElements();
        const relationships = model.getAllRelationships();
        const nativeBefore = arena();
        const polygon = vi.spyOn(brepjs, 'polygon');
        const extrude = vi.spyOn(brepjs, 'extrude');
        const cut = vi.spyOn(brepjs, 'cut');
        const options = { stableKey: 'filler', openingStableKey: 'opening' };
        expect(model[method]({ ...DOOR, wallLocalId: id }, options)).toMatchObject({
          ok: false,
          error: { code },
        });
        expect(polygon).not.toHaveBeenCalled();
        expect(extrude).not.toHaveBeenCalled();
        expect(cut).not.toHaveBeenCalled();
        expectArena(nativeBefore);
        expect(model.getAllElements()).toEqual(before);
        expect(model.getAllRelationships()).toEqual(relationships);
        for (const solid of solids) {
          expect(model.addProxy({ name: 'Still owned', solid })).toMatchObject({
            ok: false,
            error: { code: 'BODY_OWNERSHIP_CONFLICT' },
          });
          expect(brepjs.getKernel().volume(solid.wrapped)).toBeCloseTo(solid === first ? 60 : 1, 7);
        }
        expect(model[method]({ ...DOOR, wallLocalId: supportedId }, options)).toEqual({
          ok: true,
          value: 7,
        });
        expect(
          brepjs.getKernel().volume(singletonWallSolid(model, supportedId).wrapped)
        ).toBeCloseTo(54, 7);
      } finally {
        model[Symbol.dispose]();
      }
      expectArena(baseline);
    }
  );
}
