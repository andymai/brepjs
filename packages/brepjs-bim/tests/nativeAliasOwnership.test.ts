import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import * as brepjs from 'brepjs';
import {
  box,
  clone,
  createSolid,
  getKernel,
  locate,
  unwrap,
  validSolid,
  type ValidSolid,
} from 'brepjs';
import { validateProductBody } from '../src/types/productBody.js';
import { BimModel } from '../src/model/bimModel.js';
import type { WallSpec } from '../src/specs/wallSpec.js';
import { currentKernel, initKernel } from '../../../tests/setup.js';
import { nativeShapeCount } from './helpers/nativeArena.js';

beforeAll(async () => {
  await initKernel();
}, 30000);
afterEach(() => vi.restoreAllMocks());

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
function expectArena(expected: number | null) {
  if (expected !== null) expect(nativeShapeCount()).toBe(expected);
}

/** Manufacturing an owning alias violates the caller contract. At fixture end,
 * unregister that alias without releasing its shared native object. This is a
 * test-only repair, not a lifetime guarantee supplied by BIM rejection.
 */
function aliasFixture(source: ValidSolid) {
  const raw: unknown = source.wrapped;
  const alias = unwrap(validSolid(createSolid(raw)));
  const disposeAlias = alias[Symbol.dispose].bind(alias);
  return {
    alias,
    [Symbol.dispose]() {
      const kernel = getKernel();
      const release = kernel.dispose.bind(kernel);
      const disarm = vi.spyOn(kernel, 'dispose').mockImplementation((candidate) => {
        if (candidate !== raw) release(candidate);
      });
      try {
        disposeAlias();
      } finally {
        disarm.mockRestore();
      }
    },
  };
}

it('rejects a later Body item wrapping the exact same native object without releasing caller inputs', () => {
  const baseline = arena();
  {
    using first = box(1, 2, 3);
    using sibling = box(2, 2, 2);
    using fixture = aliasFixture(first);
    const live = arena();
    const aliasRelease = vi.spyOn(fixture.alias, Symbol.dispose);
    expect(fixture.alias === first).toBe(false);
    expect(fixture.alias.wrapped === first.wrapped).toBe(true);
    expect(
      validateProductBody({ kind: 'AUTHORITATIVE', solids: [first, sibling, fixture.alias] })
    ).toMatchObject({
      ok: false,
      error: { code: 'BODY_DUPLICATE_ITEM', itemIndex: 2 },
    });
    expect(aliasRelease).not.toHaveBeenCalled();
    expect(getKernel().volume(first.wrapped)).toBeCloseTo(6, 8);
    expect(getKernel().volume(sibling.wrapped)).toBeCloseTo(8, 8);
    expect(getKernel().volume(fixture.alias.wrapped)).toBeCloseTo(6, 8);
    expectArena(live);
  }
  expectArena(baseline);
});

it.each(['Proxy', 'EarthworksFill'] as const)(
  'rejects adoption of a retained Wall resource alias by %s without consuming identity or inputs',
  (category) => {
    const baseline = arena();
    {
      using model = new BimModel();
      const wallId = unwrap(model.addWall(WALL));
      const wall = model.getElement(wallId);
      if (wall?.category !== 'WALL') throw new Error('Expected Wall');
      const source = wall.geometry.solids[0];
      using fixture = aliasFixture(source);
      const aliasRelease = vi.spyOn(fixture.alias, Symbol.dispose);
      const elements = model.getAllElements();
      const relationships = model.getAllRelationships();
      const live = arena();
      const adopt =
        category === 'Proxy' ? model.addProxy.bind(model) : model.addEarthworksFill.bind(model);
      expect(
        adopt({ name: 'Alias', solid: fixture.alias, materialName: 'Test' }, { stableKey: 'retry' })
      ).toMatchObject({
        ok: false,
        error: {
          code: 'BODY_OWNERSHIP_CONFLICT',
          metadata: {
            itemIndex: 0,
            ownerLocalId: wallId,
            ownerItemIndex: 0,
            ownerState: 'RETAINED',
          },
        },
      });
      expect(model.getAllElements()).toEqual(elements);
      expect(model.getAllRelationships()).toEqual(relationships);
      expect(model.getElement(wallId)).toBe(wall);
      expect(aliasRelease).not.toHaveBeenCalled();
      expect(getKernel().volume(source.wrapped)).toBeCloseTo(6, 8);
      expect(getKernel().volume(fixture.alias.wrapped)).toBeCloseTo(6, 8);
      expectArena(live);
      const independent = unwrap(clone(source));
      const adoptedId = unwrap(
        adopt(
          { name: 'Independent', solid: independent, materialName: 'Test' },
          { stableKey: 'retry' }
        )
      );
      expect(adoptedId).toBe(Number(wallId) + 2);
      expect(model.getElement(adoptedId)?.geometry).toBe(independent);
    }
    expectArena(baseline);
  }
);

it.each(['before', 'after'] as const)(
  'rejects aliases of UNCERTAIN resources after a failure %s native release, without native validation or retry',
  (failurePoint) => {
    const baseline = arena();
    {
      using model = new BimModel();
      const id = unwrap(model.addWall(WALL));
      const wall = model.getElement(id);
      if (wall?.category !== 'WALL') throw new Error('Expected Wall');
      const source = wall.geometry.solids[0];
      using fixture = aliasFixture(source);
      const release = source[Symbol.dispose].bind(source);
      const cause = new Error(`Failure ${failurePoint} native release`);
      const attempt = vi.spyOn(source, Symbol.dispose).mockImplementation(() => {
        if (failurePoint === 'after') release();
        throw cause;
      });
      try {
        const next = box(2, 2, 2);
        const receipt = unwrap(
          model.replaceProductBody({
            localId: id,
            body: { kind: 'AUTHORITATIVE', solids: [next] },
          })
        );
        expect(receipt).toMatchObject({
          kind: 'COMMITTED',
          localId: id,
          guid: wall.guid,
          cleanup: { kind: 'FAILED', diagnostics: [{ localId: id, itemIndex: 0, cause }] },
        });
        expect(source.disposed).toBe(failurePoint === 'after');
        const originalRead = vi.spyOn(source, 'wrapped', 'get').mockImplementation(() => {
          throw new Error('Must use the resource identity captured before cleanup');
        });
        const shapeType = vi.spyOn(getKernel(), 'shapeType');
        const elements = model.getAllElements();
        const relationships = model.getAllRelationships();
        const diagnostics = model.getGeometryCleanupDiagnostics();
        const live = arena();
        const conflict = {
          ok: false,
          error: {
            code: 'BODY_OWNERSHIP_CONFLICT',
            metadata: { ownerLocalId: id, ownerItemIndex: 0, ownerState: 'UNCERTAIN' },
          },
        };
        expect(
          model.replaceProductBody({
            localId: id,
            body: { kind: 'AUTHORITATIVE', solids: [fixture.alias] },
          })
        ).toMatchObject(conflict);
        expect(model.addProxy({ name: 'Uncertain alias', solid: fixture.alias })).toMatchObject(
          conflict
        );
        expect(
          model.addEarthworksFill({
            name: 'Uncertain alias',
            solid: fixture.alias,
            materialName: 'Test',
          })
        ).toMatchObject(conflict);
        expect(shapeType).not.toHaveBeenCalled();
        expect(originalRead).not.toHaveBeenCalled();
        expect(model.getAllElements()).toEqual(elements);
        expect(model.getAllRelationships()).toEqual(relationships);
        expect(model.getGeometryCleanupDiagnostics()).toEqual(diagnostics);
        expect(getKernel().volume(next.wrapped)).toBeCloseTo(8, 8);
        expectArena(live);
        model[Symbol.dispose]();
        model[Symbol.dispose]();
        expect(attempt).toHaveBeenCalledTimes(1);
        expect(model.getGeometryCleanupDiagnostics()).toEqual(diagnostics);
        if (baseline !== null) expectArena(baseline + (failurePoint === 'before' ? 1 : 0));
      } finally {
        // Repair only the deliberately failed fixture release, outside the model.
        attempt.mockRestore();
        release();
      }
    }
    expectArena(baseline);
  }
);

it('reports a later item resource-access failure without committing or releasing caller inputs', () => {
  const baseline = arena();
  {
    using model = new BimModel();
    const id = unwrap(model.addWall(WALL));
    const original = model.getElement(id);
    const relationships = model.getAllRelationships();
    using first = box(1, 1, 1);
    using second = box(2, 2, 2);
    const cause = new Error('Second resource accessor');
    const fault = vi.spyOn(second, 'wrapped', 'get').mockImplementation(() => {
      throw cause;
    });
    const live = arena();
    expect(
      model.replaceProductBody({
        localId: id,
        body: { kind: 'AUTHORITATIVE', solids: [first, second] },
      })
    ).toMatchObject({
      ok: false,
      error: { code: 'BODY_VALIDATION_FAILED', cause, metadata: { itemIndex: 1 } },
    });
    fault.mockRestore();
    expect(model.getElement(id)).toBe(original);
    expect(model.getAllRelationships()).toEqual(relationships);
    expect(getKernel().volume(first.wrapped)).toBeCloseTo(1, 8);
    expect(getKernel().volume(second.wrapped)).toBeCloseTo(8, 8);
    expectArena(live);
  }
  expectArena(baseline);
});

it.each(['target Body', 'Proxy', 'EarthworksFill'] as const)(
  'rejects a later replacement item aliasing a retained %s resource and leaves all siblings live',
  (ownerKind) => {
    const baseline = arena();
    {
      using model = new BimModel();
      const id = unwrap(model.addWall(WALL));
      const source = box(2, 2, 2);
      let ownerId = id;
      let ownerItemIndex = 0;
      if (ownerKind === 'target Body') {
        const first = box(1, 1, 1);
        unwrap(
          model.replaceProductBody({
            localId: id,
            body: { kind: 'PARAMETRIC', solids: [first, source] },
          })
        );
        ownerItemIndex = 1;
      } else if (ownerKind === 'Proxy') {
        ownerId = unwrap(model.addProxy({ name: 'Source', solid: source }));
      } else {
        ownerId = unwrap(
          model.addEarthworksFill({ name: 'Source', solid: source, materialName: 'Test' })
        );
      }
      using fixture = aliasFixture(source);
      using sibling = box(3, 3, 3);
      const release = vi.spyOn(fixture.alias, Symbol.dispose);
      const elements = model.getAllElements();
      const relationships = model.getAllRelationships();
      const live = arena();
      expect(
        model.replaceProductBody({
          localId: id,
          body: { kind: 'AUTHORITATIVE', solids: [sibling, fixture.alias] },
        })
      ).toMatchObject({
        ok: false,
        error: {
          code: 'BODY_OWNERSHIP_CONFLICT',
          metadata: { itemIndex: 1, ownerLocalId: ownerId, ownerItemIndex, ownerState: 'RETAINED' },
        },
      });
      expect(model.getAllElements()).toEqual(elements);
      expect(model.getAllRelationships()).toEqual(relationships);
      expect(release).not.toHaveBeenCalled();
      expect(getKernel().volume(sibling.wrapped)).toBeCloseTo(27, 8);
      expect(getKernel().volume(source.wrapped)).toBeCloseTo(8, 8);
      expect(getKernel().volume(fixture.alias.wrapped)).toBeCloseTo(8, 8);
      expectArena(live);
    }
    expectArena(baseline);
  }
);

it('accepts independent clone and placement owners that remain natively usable after source retirement', () => {
  const baseline = arena();
  {
    using model = new BimModel();
    const id = unwrap(model.addWall(WALL));
    const wall = model.getElement(id);
    if (wall?.category !== 'WALL') throw new Error('Expected Wall');
    const source = wall.geometry.solids[0];
    const independent = unwrap(clone(source));
    const placed = locate(source, []);
    expect(independent.wrapped === source.wrapped).toBe(false);
    expect(placed.wrapped === source.wrapped).toBe(false);
    // Legacy OCCT shares topology even though each wrapper owns a separate native handle.
    if (currentKernel === 'occt')
      expect(getKernel().isSame(source.wrapped, independent.wrapped)).toBe(true);
    expect(
      validateProductBody({ kind: 'AUTHORITATIVE', solids: [source, independent, placed] }).ok
    ).toBe(true);
    unwrap(model.addProxy({ name: 'Clone', solid: independent }));
    unwrap(model.addEarthworksFill({ name: 'Placement', solid: placed, materialName: 'Test' }));
    const replacement = box(3, 3, 3);
    expect(
      unwrap(
        model.replaceProductBody({
          localId: id,
          body: { kind: 'AUTHORITATIVE', solids: [replacement] },
        })
      )
    ).toMatchObject({ kind: 'COMMITTED', cleanup: { kind: 'COMPLETE' } });
    expect(source.disposed).toBe(true);
    // Use uncached native queries. measureVolume can return a cached value for a dangling alias.
    expect(getKernel().volume(independent.wrapped)).toBeCloseTo(6, 8);
    expect(getKernel().volume(placed.wrapped)).toBeCloseTo(6, 8);
    expect(getKernel().volume(replacement.wrapped)).toBeCloseTo(27, 8);
  }
  expectArena(baseline);
});

it('captures resource identity before publishing the replacement and rejects retirement reentry', () => {
  const baseline = arena();
  {
    using model = new BimModel();
    const id = unwrap(model.addWall(WALL));
    const original = model.getElement(id);
    if (original?.category !== 'WALL') throw new Error('Expected Wall');
    const source = original.geometry.solids[0];
    using fixture = aliasFixture(source);
    const next = box(2, 2, 2);
    const guards = [source, next].map((solid) => {
      const raw: unknown = solid.wrapped;
      return vi.spyOn(solid, 'wrapped', 'get').mockImplementation(() => {
        if (model.getElement(id) !== original)
          throw new Error('Resource accessor ran after commit began');
        return raw;
      });
    });
    let callbackBody: unknown;
    let reentrant: unknown;
    source.onDispose(() => {
      callbackBody = model.getElement(id)?.geometry;
      reentrant = model.addProxy({ name: 'Retiring alias', solid: fixture.alias });
    });
    const receipt = unwrap(
      model.replaceProductBody({
        localId: id,
        body: { kind: 'AUTHORITATIVE', solids: [next] },
      })
    );
    for (const guard of guards) guard.mockRestore();
    expect(receipt).toMatchObject({ kind: 'COMMITTED', cleanup: { kind: 'COMPLETE' } });
    expect(callbackBody).toBe(model.getElement(id)?.geometry);
    expect(callbackBody).toMatchObject({ kind: 'AUTHORITATIVE', solids: [next] });
    expect(reentrant).toMatchObject({ ok: false, error: { code: 'MODEL_BUSY' } });
    expect(getKernel().volume(next.wrapped)).toBeCloseTo(8, 8);
  }
  expectArena(baseline);
});

it('rejects a generated resource alias already pending adoption without publishing partial records', () => {
  const baseline = arena();
  {
    using model = new BimModel();
    const site = unwrap(model.addSite({ name: 'Existing site' }));
    const records = model.getAllElements();
    const extrude = brepjs.extrude;
    let first: ValidSolid | undefined;
    let fixture: ReturnType<typeof aliasFixture> | undefined;
    const injection = vi.spyOn(brepjs, 'extrude').mockImplementation((...args) => {
      if (first !== undefined && fixture === undefined) {
        fixture = aliasFixture(first);
        // Inject a faulty producer at the native operation boundary. The fixture
        // disarms its second owning wrapper when the command cleans generated outputs.
        vi.spyOn(fixture.alias, Symbol.dispose).mockImplementation(fixture[Symbol.dispose]);
        return brepjs.ok(fixture.alias);
      }
      const result = extrude(...args);
      if (result.ok && first === undefined) first = unwrap(validSolid(result.value));
      return result;
    });
    try {
      expect(
        model.addCurtainWall(
          {
            ...WALL,
            width: 10,
            height: 10,
            columns: 2,
            rows: 2,
            panelThickness: 0.1,
            mullionWidth: 1,
            mullionDepth: 1,
          },
          { stableKey: 'retry-pending' }
        )
      ).toMatchObject({
        ok: false,
        error: {
          code: 'BODY_OWNERSHIP_CONFLICT',
          metadata: {
            itemIndex: 1,
            ownerLocalId: Number(site) + 1,
            ownerItemIndex: 0,
            ownerState: 'RETAINED',
          },
        },
      });
      expect(fixture).toBeDefined();
      expect(model.getAllElements()).toEqual(records);
      expect(model.getAllRelationships()).toEqual([]);
      expect(model.getGeometryCleanupDiagnostics()).toEqual([]);
      expectArena(baseline);
      injection.mockRestore();
      expect(unwrap(model.addSite({ name: 'Retry' }, { stableKey: 'retry-pending' }))).toBe(
        Number(site) + 1
      );
    } finally {
      injection.mockRestore();
      fixture?.[Symbol.dispose]();
    }
  }
  expectArena(baseline);
});

it('releases every generated candidate when a later resource accessor throws during adoption', () => {
  const baseline = arena();
  using model = new BimModel();
  const extrude = brepjs.extrude;
  const outputs: brepjs.Solid[] = [];
  const attempts: ReturnType<typeof vi.fn>[] = [];
  const cause = new Error('Later generated resource accessor');
  const injection = vi.spyOn(brepjs, 'extrude').mockImplementation((...args) => {
    const result = extrude(...args);
    if (!result.ok) return result;
    const solid = result.value;
    outputs.push(solid);
    const release = vi.fn(solid[Symbol.dispose].bind(solid));
    attempts.push(release);
    vi.spyOn(solid, Symbol.dispose).mockImplementation(release);
    if (outputs.length === 2) {
      const raw: unknown = solid.wrapped;
      vi.spyOn(solid, 'wrapped', 'get').mockImplementation(() => {
        // Generation captures identities before cleanup. Fail the subsequent
        // model adoption read, after every grid output has been generated.
        if (outputs.length === 10) throw cause;
        return raw;
      });
    }
    return result;
  });
  try {
    expect(
      model.addCurtainWall(
        {
          ...WALL,
          width: 10,
          height: 10,
          columns: 2,
          rows: 2,
          panelThickness: 0.1,
          mullionWidth: 1,
          mullionDepth: 1,
        },
        { stableKey: 'retry-accessor' }
      )
    ).toMatchObject({ ok: false, error: { cause } });
    expect(outputs).toHaveLength(10);
    for (const output of outputs) expect(output.disposed).toBe(true);
    for (const attempt of attempts) expect(attempt).toHaveBeenCalledTimes(1);
    expect(model.getAllElements()).toEqual([]);
    expect(model.getAllRelationships()).toEqual([]);
    expect(model.getGeometryCleanupDiagnostics()).toEqual([]);
    expectArena(baseline);
    injection.mockRestore();
    expect(unwrap(model.addSite({ name: 'Retry' }, { stableKey: 'retry-accessor' }))).toBe(1);
  } finally {
    injection.mockRestore();
    // Red-phase fixture repair after observing any missed generated releases.
    for (const output of outputs) if (!output.disposed) output[Symbol.dispose]();
  }
  expectArena(baseline);
});

it.each(['before', 'after'] as const)(
  'keeps later generated resource identities when an earlier accessor fails and cleanup throws %s release',
  (failurePoint) => {
    const baseline = arena();
    {
      using model = new BimModel();
      const extrude = brepjs.extrude;
      const outputs: brepjs.Solid[] = [];
      const primary = new Error('Second output resource accessor');
      const cleanupCause = new Error('Third output cleanup');
      let fixture: ReturnType<typeof aliasFixture> | undefined;
      let repairRelease: (() => void) | undefined;
      let attempts = 0;
      const injection = vi.spyOn(brepjs, 'extrude').mockImplementation((...args) => {
        const result = extrude(...args);
        if (!result.ok) return result;
        const solid = result.value;
        outputs.push(solid);
        if (outputs.length === 2) {
          const raw: unknown = solid.wrapped;
          vi.spyOn(solid, 'wrapped', 'get').mockImplementation(() => {
            // Keep this fault at adoption even when generation captures identity.
            if (outputs.length === 10) throw primary;
            return raw;
          });
        }
        if (outputs.length === 3) {
          fixture = aliasFixture(unwrap(validSolid(solid)));
          const release = solid[Symbol.dispose].bind(solid);
          repairRelease = release;
          vi.spyOn(solid, Symbol.dispose).mockImplementation(() => {
            attempts++;
            if (failurePoint === 'after') release();
            throw cleanupCause;
          });
        }
        return result;
      });
      try {
        expect(
          model.addCurtainWall(
            {
              ...WALL,
              width: 10,
              height: 10,
              columns: 2,
              rows: 2,
              panelThickness: 0.1,
              mullionWidth: 1,
              mullionDepth: 1,
            },
            { stableKey: 'retry-two-faults' }
          )
        ).toMatchObject({
          ok: false,
          error: {
            cause: primary,
            cleanup: { kind: 'FAILED', diagnostics: [{ itemIndex: 2, cause: cleanupCause }] },
          },
        });
        injection.mockRestore();
        expect(outputs).toHaveLength(10);
        outputs.forEach((solid, itemIndex) => {
          expect(solid.disposed).toBe(itemIndex !== 2 || failurePoint === 'after');
        });
        if (fixture === undefined) throw new Error('Expected third output alias fixture');
        expect(
          model.addProxy({ name: 'Uncertain generated alias', solid: fixture.alias })
        ).toMatchObject({
          ok: false,
          error: {
            code: 'BODY_OWNERSHIP_CONFLICT',
            metadata: { ownerItemIndex: 2, ownerState: 'UNCERTAIN' },
          },
        });
        expect(model.getAllElements()).toEqual([]);
        expect(model.getAllRelationships()).toEqual([]);
        expect(unwrap(model.addSite({ name: 'Retry' }, { stableKey: 'retry-two-faults' }))).toBe(1);
        model[Symbol.dispose]();
        model[Symbol.dispose]();
        expect(attempts).toBe(1);
        expect(model.getGeometryCleanupDiagnostics()).toMatchObject([
          { itemIndex: 2, cause: cleanupCause },
        ]);
        if (baseline !== null) expectArena(baseline + (failurePoint === 'before' ? 1 : 0));
      } finally {
        injection.mockRestore();
        fixture?.[Symbol.dispose]();
        // Explicit repair of the deliberately uncertain fixture, without a model retry.
        repairRelease?.();
      }
    }
    expectArena(baseline);
  }
);
