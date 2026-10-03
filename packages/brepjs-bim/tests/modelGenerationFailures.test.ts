import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import * as brepjs from 'brepjs';
import { BimModel } from '../src/model/bimModel.js';
import type { CurtainWallSpec } from '../src/specs/curtainWallSpec.js';
import type { RailingSpec } from '../src/specs/railingSpec.js';
import type { BimError } from '../src/errors/bimError.js';
import type { LocalId } from '../src/identity/localId.js';
import { currentKernel, initKernel } from '../../../tests/setup.js';
import { nativeShapeCount } from './helpers/nativeArena.js';

beforeAll(async () => {
  await initKernel();
}, 30000);
afterEach(() => vi.restoreAllMocks());
const arena = () => (currentKernel === 'occt-wasm' ? nativeShapeCount() : null);
function expectArena(count: number | null) {
  if (count !== null) expect(nativeShapeCount()).toBe(count);
}
const CURTAIN: CurtainWallSpec = {
  width: 10,
  height: 10,
  columns: 2,
  rows: 2,
  panelThickness: 0.1,
  mullionWidth: 1,
  mullionDepth: 1,
  origin: [0, 0, 0],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  materialName: 'Glass',
};
const RAILING = {
  length: 2000,
  height: 1000,
  thickness: 50,
  infill: 'POSTED',
  origin: [0, 0, 0],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  materialName: 'Steel',
} satisfies RailingSpec;

type Creator = (model: BimModel) => brepjs.Result<LocalId, BimError>;
const profile = { kind: 'RECTANGULAR', width: 1, height: 1 } as const;
const validationCreators: ReadonlyArray<readonly [string, Creator]> = [
  ['Wall', (model) => model.addWall(RAILING)],
  ['Slab', (model) => model.addSlab({ ...RAILING, width: 10, predefinedType: 'FLOOR' })],
  ['Beam', (model) => model.addBeam({ ...RAILING, profile })],
  ['Column', (model) => model.addColumn({ ...RAILING, profile })],
  ['Space', (model) => model.addSpace({ ...RAILING, width: 10, name: 'Room' })],
  ['Roof', (model) => model.addRoof({ ...RAILING, width: 10, predefinedType: 'FLAT_ROOF' })],
  ['Footing', (model) => model.addFooting({ ...RAILING, width: 10 })],
  ['Pile', (model) => model.addPile({ ...RAILING, profile })],
  ['Covering', (model) => model.addCovering({ ...RAILING, width: 10 })],
  ['Panel railing', (model) => model.addRailing({ ...RAILING, infill: 'PANEL' })],
];

function uncertainSolidFixture(
  source: brepjs.ValidSolid,
  timing: 'before' | 'after',
  cause: Error
) {
  const raw: unknown = source.wrapped;
  const alias = brepjs.unwrap(brepjs.validSolid(brepjs.createSolid(raw)));
  const release = source[Symbol.dispose].bind(source);
  const attempts = vi.spyOn(source, Symbol.dispose).mockImplementation(() => {
    if (timing === 'after') release();
    throw cause;
  });
  const aliasAttempts = vi.spyOn(alias, Symbol.dispose);
  return {
    source,
    alias,
    attempts,
    aliasAttempts,
    release,
    disarmAlias() {
      // A manufactured owning alias violates the caller contract. Unregister
      // this fixture handle without releasing its shared native resource.
      const kernel = brepjs.getKernel();
      const dispose = kernel.dispose.bind(kernel);
      const disarm = vi.spyOn(kernel, 'dispose').mockImplementation((resource) => {
        if (resource !== raw) dispose(resource);
      });
      try {
        alias[Symbol.dispose]();
      } finally {
        disarm.mockRestore();
      }
    },
  };
}

it.each(validationCreators)(
  'releases the generated %s output when its native validity check throws',
  (_, create) => {
    const model = new BimModel();
    const baseline = arena();
    const extrude = brepjs.extrude;
    const outputs: brepjs.Solid[] = [];
    vi.spyOn(brepjs, 'extrude').mockImplementation((...args) => {
      const result = extrude(...args);
      if (result.ok) outputs.push(result.value);
      return result;
    });
    const cause = new Error('Generated solid validation');
    const validation = vi.spyOn(brepjs.getKernel(), 'isValid').mockImplementation(() => {
      throw cause;
    });
    try {
      const result = create(model);
      expect(result).toMatchObject({ ok: false, error: { cause } });
      expect(outputs.length).toBeGreaterThan(0);
      expect(outputs.every((solid) => solid.disposed)).toBe(true);
      expect(model.getAllElements()).toEqual([]);
      expect(model.getAllRelationships()).toEqual([]);
      model[Symbol.dispose]();
      expectArena(baseline);
    } finally {
      validation.mockRestore();
      model[Symbol.dispose]();
      for (const solid of outputs) if (!solid.disposed) solid[Symbol.dispose]();
    }
  }
);

it('reclaims every partial curtain-wall solid after a later native validity throw and leaves the stable key reusable', () => {
  const model = new BimModel();
  const baseline = arena();
  const kernel = brepjs.getKernel();
  const isValid = kernel.isValid.bind(kernel);
  const extrude = brepjs.extrude;
  const outputs: brepjs.Solid[] = [];
  vi.spyOn(brepjs, 'extrude').mockImplementation((...args) => {
    const result = extrude(...args);
    if (result.ok) outputs.push(result.value);
    return result;
  });
  let calls = 0;
  const cause = new Error('Second panel native validation');
  const validation = vi.spyOn(kernel, 'isValid').mockImplementation((raw) => {
    if (++calls === 2) throw cause;
    return isValid(raw);
  });
  try {
    const result = model.addCurtainWall(CURTAIN, { stableKey: 'retry' });
    validation.mockRestore();
    expect(result).toMatchObject({ ok: false, error: { cause } });
    expect(outputs).toHaveLength(2);
    expect(outputs.every((solid) => solid.disposed)).toBe(true);
    expect(model.getAllElements()).toEqual([]);
    expect(model.getAllRelationships()).toEqual([]);
    expectArena(baseline);
    expect(model.addCurtainWall(CURTAIN, { stableKey: 'retry' })).toMatchObject({ ok: true });
    model[Symbol.dispose]();
    expectArena(baseline);
  } finally {
    validation.mockRestore();
    model[Symbol.dispose]();
    // Red-phase fixture repair only; successful production cleanup is not repeated.
    for (const solid of outputs) if (!solid.disposed) solid[Symbol.dispose]();
  }
});

it.each(['before', 'after'] as const)(
  'preserves a POSTED generator cleanup failure %s native release in the Result and model diagnostics',
  (timing) => {
    const model = new BimModel();
    const baseline = arena();
    const originalBox = brepjs.box;
    const cause = new Error(`Generated bar cleanup failed ${timing} native release`);
    let fixture: ReturnType<typeof uncertainSolidFixture> | undefined;
    const bars: brepjs.ValidSolid[] = [];
    const releases: ReturnType<typeof vi.fn>[] = [];
    vi.spyOn(brepjs, 'box').mockImplementation((...args) => {
      const solid = originalBox(...args);
      bars.push(solid);
      if (fixture === undefined) {
        fixture = uncertainSolidFixture(solid, timing, cause);
        releases.push(fixture.attempts);
      } else {
        releases.push(vi.spyOn(solid, Symbol.dispose));
      }
      return solid;
    });
    try {
      const result = model.addRailing(RAILING, { stableKey: 'retry' });
      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'RAILING_CLEANUP_FAILED',
          metadata: {
            cleanup: {
              kind: 'FAILED',
              diagnostics: [{ operation: 'railingToSolid', itemIndex: 0, cause }],
            },
          },
        },
      });
      const diagnostics = model.getGeometryCleanupDiagnostics();
      expect(diagnostics).toMatchObject([{ operation: 'railingToSolid', itemIndex: 0, cause }]);
      expect(Object.isFrozen(diagnostics)).toBe(true);
      expect(Object.isFrozen(diagnostics[0])).toBe(true);
      expect(model.getAllElements()).toEqual([]);
      expect(model.getAllRelationships()).toEqual([]);
      if (fixture === undefined) throw new Error('Expected a generated bar cleanup fault');
      expect(bars.slice(1).every((solid) => solid.disposed)).toBe(true);
      expect(fixture.source.disposed).toBe(timing === 'after');
      for (const release of releases) expect(release).toHaveBeenCalledTimes(1);
      for (const solid of [fixture.alias, fixture.source]) {
        expect(
          model.addProxy({ name: 'Uncertain bar', solid }, { stableKey: 'retry' })
        ).toMatchObject({
          ok: false,
          error: { code: 'BODY_OWNERSHIP_CONFLICT', metadata: { ownerState: 'UNCERTAIN' } },
        });
      }
      expect(fixture.aliasAttempts).not.toHaveBeenCalled();
      expect(fixture.attempts).toHaveBeenCalledTimes(1);
      for (const release of releases) expect(release).toHaveBeenCalledTimes(1);
      expect(model.addRailing(RAILING, { stableKey: 'retry' })).toMatchObject({ ok: true });
      expect(diagnostics).toHaveLength(1);
      model[Symbol.dispose]();
      model[Symbol.dispose]();
      expect(fixture.attempts).toHaveBeenCalledTimes(1);
      if (baseline !== null)
        expect(nativeShapeCount()).toBe(baseline + (timing === 'before' ? 1 : 0));
    } finally {
      fixture?.disarmAlias();
      model[Symbol.dispose]();
      // Explicitly repair the uncertain resource owned by this fault-injection fixture.
      if (fixture !== undefined && !fixture.source.disposed) fixture.release();
    }
    expectArena(baseline);
  }
);

it.each(['before', 'after'] as const)(
  'rejects uncertain curtain output readoption after cleanup fails %s native release',
  (timing) => {
    const model = new BimModel();
    const baseline = arena();
    const kernel = brepjs.getKernel();
    const isValid = kernel.isValid.bind(kernel);
    const extrude = brepjs.extrude;
    const outputs: brepjs.Solid[] = [];
    const releases: ReturnType<typeof vi.fn>[] = [];
    let fixture: ReturnType<typeof uncertainSolidFixture> | undefined;
    const primary = new Error('Second curtain output validation');
    const cause = new Error(`Curtain output cleanup ${timing} release`);
    const generation = vi.spyOn(brepjs, 'extrude').mockImplementation((...args) => {
      const result = extrude(...args);
      if (result.ok) {
        outputs.push(result.value);
        if (fixture === undefined) {
          fixture = uncertainSolidFixture(
            brepjs.unwrap(brepjs.validSolid(result.value)),
            timing,
            cause
          );
          releases.push(fixture.attempts);
        } else {
          releases.push(vi.spyOn(result.value, Symbol.dispose));
        }
      }
      return result;
    });
    const validation = vi.spyOn(kernel, 'isValid').mockImplementation((raw) => {
      if (outputs.length === 2 && raw === outputs[1]?.wrapped) throw primary;
      return isValid(raw);
    });
    try {
      const result = model.addCurtainWall(CURTAIN, { stableKey: 'retry' });
      validation.mockRestore();
      generation.mockRestore();
      expect(result).toMatchObject({
        ok: false,
        error: {
          cause: primary,
          cleanup: { kind: 'FAILED', diagnostics: [{ itemIndex: 0, cause }] },
        },
      });
      if (fixture === undefined) throw new Error('Expected a curtain output cleanup fault');
      expect(outputs).toHaveLength(2);
      expect(outputs[1]?.disposed).toBe(true);
      expect(fixture.source.disposed).toBe(timing === 'after');
      for (const release of releases) expect(release).toHaveBeenCalledTimes(1);
      expect(model.getAllElements()).toEqual([]);
      expect(model.getAllRelationships()).toEqual([]);
      for (const solid of [fixture.alias, fixture.source]) {
        expect(
          model.addProxy({ name: 'Uncertain curtain item', solid }, { stableKey: 'retry' })
        ).toMatchObject({
          ok: false,
          error: { code: 'BODY_OWNERSHIP_CONFLICT', metadata: { ownerState: 'UNCERTAIN' } },
        });
      }
      expect(fixture.aliasAttempts).not.toHaveBeenCalled();
      expect(model.getGeometryCleanupDiagnostics()).toMatchObject([
        { operation: 'curtainWallToGrid', itemIndex: 0, cause },
      ]);
      expect(model.addCurtainWall(CURTAIN, { stableKey: 'retry' })).toMatchObject({ ok: true });
      model[Symbol.dispose]();
      model[Symbol.dispose]();
      for (const release of releases) expect(release).toHaveBeenCalledTimes(1);
      if (baseline !== null)
        expect(nativeShapeCount()).toBe(baseline + (timing === 'before' ? 1 : 0));
    } finally {
      validation.mockRestore();
      generation.mockRestore();
      fixture?.disarmAlias();
      model[Symbol.dispose]();
      // Restore only the deliberately uncertain fixture allocation, outside BIM.
      if (fixture !== undefined && !fixture.source.disposed) fixture.release();
    }
    expectArena(baseline);
  }
);

it.each(['before', 'after'] as const)(
  'releases curtain outputs when temporary profile cleanup fails %s native release',
  (timing) => {
    const model = new BimModel();
    const baseline = arena();
    const polygon = brepjs.polygon;
    const cause = new Error(`Profile cleanup ${timing} release`);
    let fixtureRelease: (() => void) | undefined;
    let attempts = 0;
    vi.spyOn(brepjs, 'polygon').mockImplementation((...args) => {
      const result = polygon(...args);
      if (result.ok && fixtureRelease === undefined) {
        const release = result.value[Symbol.dispose].bind(result.value);
        fixtureRelease = release;
        vi.spyOn(result.value, Symbol.dispose).mockImplementation(() => {
          attempts++;
          if (timing === 'after') release();
          throw cause;
        });
      }
      return result;
    });
    try {
      expect(model.addCurtainWall(CURTAIN)).toMatchObject({
        ok: false,
        error: {
          code: 'CURTAIN_WALL_CLEANUP_FAILED',
          metadata: {
            cleanup: {
              kind: 'FAILED',
              diagnostics: [{ operation: 'curtainWallToGrid', itemIndex: 0, cause }],
            },
          },
        },
      });
      expect(model.getGeometryCleanupDiagnostics()).toMatchObject([
        { operation: 'curtainWallToGrid', itemIndex: 0, cause },
      ]);
      expect(model.getAllElements()).toEqual([]);
      model[Symbol.dispose]();
      model[Symbol.dispose]();
      expect(attempts).toBe(1);
      if (baseline !== null)
        expect(nativeShapeCount()).toBe(baseline + (timing === 'before' ? 1 : 0));
    } finally {
      model[Symbol.dispose]();
      if (timing === 'before') fixtureRelease?.();
    }
    expectArena(baseline);
  }
);

it('preserves the primary generation failure and every cleanup diagnostic when multiple partial outputs throw after release', () => {
  const model = new BimModel();
  const baseline = arena();
  const kernel = brepjs.getKernel();
  const isValid = kernel.isValid.bind(kernel);
  const extrude = brepjs.extrude;
  const primary = new Error('Second panel validation');
  const cleanupCause = new Error('Partial solid cleanup');
  let validations = 0;
  let attempts = 0;
  vi.spyOn(kernel, 'isValid').mockImplementation((raw) => {
    if (++validations === 2) throw primary;
    return isValid(raw);
  });
  vi.spyOn(brepjs, 'extrude').mockImplementation((...args) => {
    const result = extrude(...args);
    if (result.ok) {
      const release = result.value[Symbol.dispose].bind(result.value);
      vi.spyOn(result.value, Symbol.dispose).mockImplementation(() => {
        attempts++;
        release();
        throw cleanupCause;
      });
    }
    return result;
  });
  const result = model.addCurtainWall(CURTAIN);
  expect(result).toMatchObject({
    ok: false,
    error: {
      cause: primary,
      cleanup: {
        kind: 'FAILED',
        diagnostics: [
          { itemIndex: 0, cause: cleanupCause },
          { itemIndex: 1, cause: cleanupCause },
        ],
      },
    },
  });
  expect(model.getGeometryCleanupDiagnostics()).toHaveLength(2);
  model[Symbol.dispose]();
  model[Symbol.dispose]();
  expect(attempts).toBe(2);
  expectArena(baseline);
});
