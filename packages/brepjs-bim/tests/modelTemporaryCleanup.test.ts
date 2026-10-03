import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as brepjs from 'brepjs';
import { BimModel } from '../src/model/bimModel.js';
import { extendedProfileToFace, type ExtendedProfile } from '../src/specs/profilesExtended.js';
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
function expectArena(count: number | null, uncertain = 0) {
  if (count !== null) expect(nativeShapeCount()).toBe(count + uncertain);
}

type Resource = Disposable & { readonly disposed: boolean };
type Role = 'profile' | 'prism' | 'rotated' | 'holeWire' | 'holedFace';
type Timing = 'before' | 'after';
type Fault = { readonly timing: Timing; readonly cause: Error };

/** Observe real native constructors; only the selected public disposer is made to throw. */
function observeGeneration(faultFor: (role: Role, index: number) => Fault | undefined) {
  const resources: Array<{
    resource: Resource;
    role: Role;
    release: () => void;
    fault: Fault | undefined;
    attempts: number;
  }> = [];
  const track = <T extends Resource>(resource: T, role: Role): T => {
    const observed: Resource = resource;
    const release = resource[Symbol.dispose].bind(resource);
    const index = resources.filter((entry) => entry.role === role).length;
    const entry = { resource, role, release, fault: faultFor(role, index), attempts: 0 };
    resources.push(entry);
    vi.spyOn(observed, Symbol.dispose).mockImplementation(() => {
      entry.attempts++;
      if (entry.fault?.timing === 'before') throw entry.fault.cause;
      release();
      if (entry.fault?.timing === 'after') throw entry.fault.cause;
    });
    return resource;
  };
  const { polygon, extrude, rotate, outerWire, addHoles } = brepjs;
  vi.spyOn(brepjs, 'polygon').mockImplementation((...args) => {
    const result = polygon(...args);
    if (result.ok) track(result.value, 'profile');
    return result;
  });
  vi.spyOn(brepjs, 'extrude').mockImplementation((...args) => {
    const result = extrude(...args);
    if (result.ok) track(result.value, 'prism');
    return result;
  });
  vi.spyOn(brepjs, 'rotate').mockImplementation((...args) => track(rotate(...args), 'rotated'));
  vi.spyOn(brepjs, 'outerWire').mockImplementation((...args) =>
    track(outerWire(...args), 'holeWire')
  );
  vi.spyOn(brepjs, 'addHoles').mockImplementation((...args) =>
    track(addHoles(...args), 'holedFace')
  );
  return {
    resources,
    repairFixture() {
      // Explicit fixture repair for pre-release uncertainty and red-phase leaked outputs.
      for (const entry of resources) if (!entry.resource.disposed) entry.release();
    },
  };
}

const RECIPE = {
  length: 2000,
  height: 1000,
  thickness: 50,
  origin: [0, 0, 0],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  materialName: 'Steel',
} satisfies RailingSpec;
const rectangular = { kind: 'RECTANGULAR', width: 1, height: 1 } as const;
const extended = { kind: 'L_SHAPE', width: 150, depth: 200, legThickness: 20 } as const;
const withVoids: ExtendedProfile = {
  kind: 'ARBITRARY_WITH_VOIDS',
  outerPoints: [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ],
  voids: [
    [
      [10, 10],
      [20, 10],
      [20, 20],
      [10, 20],
    ],
    [
      [60, 60],
      [80, 60],
      [80, 80],
      [60, 80],
    ],
  ],
};
type Creator = (model: BimModel) => brepjs.Result<LocalId, BimError>;
const options = { stableKey: 'retry' };
const recipes: ReadonlyArray<readonly [string, Creator]> = [
  ['Wall', (m) => m.addWall(RECIPE, options)],
  ['Slab', (m) => m.addSlab({ ...RECIPE, width: 10, predefinedType: 'FLOOR' }, options)],
  ['Beam', (m) => m.addBeam({ ...RECIPE, profile: rectangular }, options)],
  ['Column', (m) => m.addColumn({ ...RECIPE, profile: rectangular }, options)],
  ['Space', (m) => m.addSpace({ ...RECIPE, width: 10, name: 'Room' }, options)],
  ['Flat roof', (m) => m.addRoof({ ...RECIPE, width: 10, predefinedType: 'FLAT_ROOF' }, options)],
  [
    'Shed roof',
    (m) => m.addRoof({ ...RECIPE, width: 10, predefinedType: 'SHED_ROOF', pitch: 15 }, options),
  ],
  [
    'Gable roof',
    (m) => m.addRoof({ ...RECIPE, width: 10, predefinedType: 'GABLE_ROOF', pitch: 15 }, options),
  ],
  ['Footing', (m) => m.addFooting({ ...RECIPE, width: 10 }, options)],
  ['Pile', (m) => m.addPile({ ...RECIPE, profile: rectangular }, options)],
  ['Covering', (m) => m.addCovering({ ...RECIPE, width: 10 }, undefined, options)],
  ['Panel railing', (m) => m.addRailing({ ...RECIPE, infill: 'PANEL' }, options)],
  ['Extended beam', (m) => m.addBeam({ ...RECIPE, profile: extended }, options)],
  ['Extended column', (m) => m.addColumn({ ...RECIPE, profile: extended }, options)],
  ['Extended pile', (m) => m.addPile({ ...RECIPE, profile: extended }, options)],
];

describe.each(['before', 'after'] as const)(
  'temporary cleanup throws %s native release',
  (timing) => {
    it.each(recipes)(
      '%s rejects without orphaning its prepared output or stable key',
      (_, create) => {
        const baseline = arena();
        const model = new BimModel();
        const cause = new Error('Temporary profile cleanup');
        const fixture = observeGeneration((role, index) =>
          role === 'profile' && index === 0 ? { timing, cause } : undefined
        );
        try {
          expect(create(model)).toMatchObject({
            ok: false,
            error: { cleanup: { kind: 'FAILED', diagnostics: [{ cause }] } },
          });
          expect(fixture.resources.some((entry) => entry.role === 'prism')).toBe(true);
          expect(
            fixture.resources.every(
              (entry) => entry.resource.disposed || entry.fault?.timing === 'before'
            )
          ).toBe(true);
          expect(model.getAllElements()).toEqual([]);
          expect(model.getAllRelationships()).toEqual([]);
          expect(model.getGeometryCleanupDiagnostics()).toMatchObject([{ cause }]);
          expectArena(baseline, timing === 'before' ? 1 : 0);
          expect(create(model)).toMatchObject({ ok: true });
          model[Symbol.dispose]();
          model[Symbol.dispose]();
          expect(fixture.resources.every((entry) => entry.attempts === 1)).toBe(true);
          expectArena(baseline, timing === 'before' ? 1 : 0);
        } finally {
          model[Symbol.dispose]();
          fixture.repairFixture();
        }
        expectArena(baseline);
      }
    );

    it('releases the rotated beam output and later profile after prism cleanup fails', () => {
      const baseline = arena();
      const model = new BimModel();
      const cause = new Error('Beam prism cleanup');
      const fixture = observeGeneration((role) =>
        role === 'prism' ? { timing, cause } : undefined
      );
      try {
        expect(model.addBeam({ ...RECIPE, profile: extended })).toMatchObject({
          ok: false,
          error: { cleanup: { kind: 'FAILED', diagnostics: [{ cause }] } },
        });
        expect(fixture.resources.map((entry) => entry.role)).toEqual([
          'profile',
          'prism',
          'rotated',
        ]);
        expect(fixture.resources.every((entry) => entry.attempts === 1)).toBe(true);
        expect(model.getAllElements()).toEqual([]);
        model[Symbol.dispose]();
        expectArena(baseline, timing === 'before' ? 1 : 0);
      } finally {
        model[Symbol.dispose]();
        fixture.repairFixture();
      }
      expectArena(baseline);
    });

    const nestedTargets: ReadonlyArray<readonly [Role, number]> = [
      ['profile', 0],
      ['profile', 1],
      ['holeWire', 0],
    ];
    it.each(nestedTargets)(
      'nested profile retains its output through %s %i cleanup',
      (role, index) => {
        const baseline = arena();
        const cause = new Error('Nested profile cleanup');
        const fixture = observeGeneration((candidateRole, candidateIndex) =>
          candidateRole === role && candidateIndex === index ? { timing, cause } : undefined
        );
        try {
          expect(extendedProfileToFace(withVoids)).toMatchObject({
            ok: false,
            error: {
              metadata: {
                cleanup: {
                  kind: 'FAILED',
                  diagnostics: [{ operation: 'extendedProfileToFace', cause }],
                },
              },
            },
          });
          expect(fixture.resources.filter((entry) => entry.role === 'holedFace')).toHaveLength(1);
          expect(fixture.resources.every((entry) => entry.attempts === 1)).toBe(true);
          expectArena(baseline, timing === 'before' ? 1 : 0);
        } finally {
          fixture.repairFixture();
        }
        expectArena(baseline);
      }
    );
  }
);

const hollowRecipes: ReadonlyArray<readonly [string, Creator]> = [
  ['Beam', (m) => m.addBeam({ ...RECIPE, profile: withVoids }, options)],
  ['Column', (m) => m.addColumn({ ...RECIPE, profile: withVoids }, options)],
  ['Pile', (m) => m.addPile({ ...RECIPE, profile: withVoids }, options)],
];
it.each(hollowRecipes)(
  '%s preserves a nested profile cleanup report and releases a successful retry',
  (_, create) => {
    const baseline = arena();
    const model = new BimModel();
    const cause = new Error('Hole face cleanup');
    const fixture = observeGeneration((role, index) =>
      role === 'profile' && index === 1 ? { timing: 'after', cause } : undefined
    );
    try {
      expect(create(model)).toMatchObject({
        ok: false,
        error: {
          cleanup: { kind: 'FAILED', diagnostics: [{ operation: 'extendedProfileToFace', cause }] },
        },
      });
      expect(model.getGeometryCleanupDiagnostics()).toMatchObject([
        { operation: 'extendedProfileToFace', cause },
      ]);
      expect(model.getAllElements()).toEqual([]);
      expectArena(baseline);
      expect(create(model)).toMatchObject({ ok: true });
      model[Symbol.dispose]();
      expect(fixture.resources.every((entry) => entry.attempts === 1)).toBe(true);
      expectArena(baseline);
    } finally {
      model[Symbol.dispose]();
      fixture.repairFixture();
    }
  }
);

it('preserves a primary validation error and both output/profile cleanup failures', () => {
  const baseline = arena();
  const model = new BimModel();
  const primary = new Error('Native validity failure');
  const cause = new Error('Cleanup failed after release');
  const fixture = observeGeneration(() => ({ timing: 'after', cause }));
  vi.spyOn(brepjs.getKernel(), 'isValid').mockImplementation(() => {
    throw primary;
  });
  try {
    const result = model.addWall(RECIPE);
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'WALL_INVALID_SOLID', cause: primary },
    });
    expect(model.getGeometryCleanupDiagnostics()).toHaveLength(2);
    expect(fixture.resources.every((entry) => entry.attempts === 1)).toBe(true);
    model[Symbol.dispose]();
    expectArena(baseline);
  } finally {
    model[Symbol.dispose]();
    fixture.repairFixture();
  }
});

it('reports output cleanup failure after a temporary failure cancels a successful build', () => {
  const baseline = arena();
  const model = new BimModel();
  const cause = new Error('Release completed but reported failure');
  const fixture = observeGeneration(() => ({ timing: 'after', cause }));
  try {
    expect(model.addWall(RECIPE)).toMatchObject({
      ok: false,
      error: {
        code: 'WALL_CLEANUP_FAILED',
        cleanup: {
          kind: 'FAILED',
          diagnostics: [
            { itemIndex: 0, cause },
            { itemIndex: 1, cause },
          ],
        },
      },
    });
    expect(model.getGeometryCleanupDiagnostics()).toHaveLength(2);
    expect(model.getAllElements()).toEqual([]);
    model[Symbol.dispose]();
    model[Symbol.dispose]();
    expect(fixture.resources.every((entry) => entry.attempts === 1)).toBe(true);
    expectArena(baseline);
  } finally {
    model[Symbol.dispose]();
    fixture.repairFixture();
  }
});

it('returns a usable face with both voids after releasing every profile temporary', () => {
  const baseline = arena();
  const fixture = observeGeneration(() => undefined);
  try {
    const face = brepjs.unwrap(extendedProfileToFace(withVoids));
    expect(brepjs.unwrap(brepjs.measureArea(face))).toBeCloseTo(9500, 5);
    expect(fixture.resources.filter((entry) => entry.resource.disposed)).toHaveLength(5);
    expectArena(baseline, 1);
    face[Symbol.dispose]();
    expect(fixture.resources.every((entry) => entry.attempts === 1)).toBe(true);
    expectArena(baseline);
  } finally {
    fixture.repairFixture();
  }
});

it('preserves a nested construction error while attempting every remaining temporary release', () => {
  const baseline = arena();
  const model = new BimModel();
  const primary = new Error('Adding holes failed');
  const cause = new Error('Nested temporary release');
  const fixture = observeGeneration(() => ({ timing: 'after', cause }));
  vi.spyOn(brepjs, 'addHoles').mockImplementation(() => {
    throw primary;
  });
  try {
    const result = model.addColumn({ ...RECIPE, profile: withVoids });
    expect(result).toMatchObject({ ok: false, error: { cause: primary } });
    expect(fixture.resources).toHaveLength(5);
    expect(fixture.resources.every((entry) => entry.attempts === 1)).toBe(true);
    expect(model.getGeometryCleanupDiagnostics()).toHaveLength(5);
    model[Symbol.dispose]();
    expectArena(baseline);
  } finally {
    model[Symbol.dispose]();
    fixture.repairFixture();
  }
});
