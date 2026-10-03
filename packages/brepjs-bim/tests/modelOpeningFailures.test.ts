import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import * as brepjs from 'brepjs';
import { BimModel } from '../src/model/bimModel.js';
import { currentKernel, initKernel } from '../../../tests/setup.js';
import { nativeShapeCount } from './helpers/nativeArena.js';
import { openingHost } from './helpers/openingFixture.js';

beforeAll(async () => {
  await initKernel();
}, 30000);
afterEach(() => vi.restoreAllMocks());
const arena = () => (currentKernel === 'occt-wasm' ? nativeShapeCount() : null);
function expectArena(count: number | null, uncertain = 0) {
  if (count !== null) expect(nativeShapeCount()).toBe(count + uncertain);
}

type Role = 'profile' | 'tool' | 'cut' | 'copy';
type Resource = brepjs.AnyShape<brepjs.Dimension>;
type Fault = { timing: 'before' | 'after'; cause: Error };

/** Real native results; faults affect only the selected resource's release. */
function observeOpening(
  faultFor: (role: Role) => Fault | undefined = () => undefined,
  onAllocate?: (role: Role, resource: Resource) => void
) {
  const resources: Array<{
    resource: Resource;
    role: Role;
    release: () => void;
    attempts: number;
  }> = [];
  const track = <T extends Resource>(resource: T, role: Role) => {
    const observed: Resource = resource;
    const release = resource[Symbol.dispose].bind(resource);
    const entry = { resource, role, release, attempts: 0 };
    const fault = faultFor(role);
    resources.push(entry);
    onAllocate?.(role, resource);
    vi.spyOn(observed, Symbol.dispose).mockImplementation(() => {
      entry.attempts++;
      if (fault?.timing === 'before') throw fault.cause;
      release();
      if (fault?.timing === 'after') throw fault.cause;
    });
    return resource;
  };
  const { polygon, extrude, cut, clone } = brepjs;
  vi.spyOn(brepjs, 'polygon').mockImplementation((...args) => {
    const result = polygon(...args);
    if (result.ok) track(result.value, 'profile');
    return result;
  });
  vi.spyOn(brepjs, 'extrude').mockImplementation((...args) => {
    const result = extrude(...args);
    if (result.ok) track(result.value, 'tool');
    return result;
  });
  vi.spyOn(brepjs, 'cut').mockImplementation((...args) => {
    const result = cut(...args);
    if (result.ok) track(result.value, 'cut');
    return result;
  });
  vi.spyOn(brepjs, 'clone').mockImplementation((...args) => {
    const result = clone(...args);
    if (result.ok) track(result.value, 'copy');
    return result;
  });
  return {
    resources,
    repair() {
      for (const entry of resources) if (!entry.resource.disposed) entry.release();
    },
  };
}

it('releases a successful cut output when tool cleanup cancels the opening command', () => {
  const baseline = arena();
  const model = new BimModel();
  const host = openingHost(model, 'Door');
  const before = model.getAllElements();
  const relationships = model.getAllRelationships();
  const nativeBefore = arena();
  const cause = new Error('Tool released, but reported failure');
  const observed = observeOpening((role) =>
    role === 'tool' ? { timing: 'after', cause } : undefined
  );
  try {
    expect
      .soft(host.open())
      .toMatchObject({ ok: false, error: { code: 'WALL_OPENING_CLEANUP_FAILED' } });
    expect(model.getAllElements()).toEqual(before);
    expect(model.getAllRelationships()).toEqual(relationships);
    expect(brepjs.getKernel().volume(host.solid().wrapped)).toBeCloseTo(60, 7);
    expect
      .soft(observed.resources.find((entry) => entry.role === 'cut')?.resource.disposed)
      .toBe(true);
    expect.soft(observed.resources.every((entry) => entry.attempts === 1)).toBe(true);
    expect.soft(model.getGeometryCleanupDiagnostics()).toMatchObject([{ cause }]);
    expectArena(nativeBefore);
  } finally {
    model[Symbol.dispose]();
    observed.repair();
  }
  expectArena(baseline);
});

for (const kind of ['Door', 'Window', 'Slab'] as const) {
  for (const timing of ['before', 'after'] as const) {
    it.each(['profile', 'tool', 'cut'] as const)(
      `${kind} cancels safely when %s cleanup throws ${timing} native release`,
      (role) => {
        const baseline = arena();
        const model = new BimModel();
        const host = openingHost(model, kind);
        const old = host.solid();
        const before = model.getAllElements();
        const relationships = model.getAllRelationships();
        const nativeBefore = arena();
        const cause = new Error(`${role} cleanup ${timing}`);
        let inject = true;
        const observed = observeOpening((candidate) =>
          inject && candidate === role ? { timing, cause } : undefined
        );
        try {
          expect(host.open()).toMatchObject({
            ok: false,
            error: { cleanup: { kind: 'FAILED', diagnostics: [{ cause }] } },
          });
          expect(model.getAllElements()).toEqual(before);
          expect(model.getAllRelationships()).toEqual(relationships);
          expect(host.solid()).toBe(old);
          expect(brepjs.getKernel().volume(old.wrapped)).toBeCloseTo(host.volume, 7);
          expect(model.addProxy({ name: 'Still owned', solid: old })).toMatchObject({
            ok: false,
            error: { code: 'BODY_OWNERSHIP_CONFLICT' },
          });
          expect(model.getGeometryCleanupDiagnostics()).toMatchObject([{ cause }]);
          expect(observed.resources.every((entry) => entry.attempts === 1)).toBe(true);
          // Extracted children have independent temporary owners and are already released.
          const uncertain = timing === 'after' ? 0 : 1;
          expectArena(nativeBefore, uncertain);
          inject = false;
          expect(host.open()).toEqual({ ok: true, value: kind === 'Slab' ? 3 : 5 });
          expect(brepjs.getKernel().volume(host.solid().wrapped)).toBeCloseTo(host.cutVolume, 7);
          model[Symbol.dispose]();
          model[Symbol.dispose]();
          expect(observed.resources.every((entry) => entry.attempts === 1)).toBe(true);
          expectArena(baseline, uncertain);
        } finally {
          model[Symbol.dispose]();
          observed.repair();
        }
        expectArena(baseline);
      }
    );
  }

  it.each(['throw', 'result'] as const)(
    `${kind} preserves its host and all identities after a cut %s failure`,
    (failure) => {
      const baseline = arena();
      const model = new BimModel();
      const host = openingHost(model, kind);
      const before = model.getAllElements();
      const relationships = model.getAllRelationships();
      const nativeBefore = arena();
      const observed = observeOpening();
      const cause = new Error('Native cut failure');
      const cut =
        failure === 'throw'
          ? vi.spyOn(brepjs.getKernel(), 'cutWithHistory').mockImplementationOnce(() => {
              throw cause;
            })
          : vi
              .spyOn(brepjs, 'cut')
              .mockReturnValueOnce(
                brepjs.err(brepjs.kernelError('INJECTED', 'Native cut failure', cause))
              );
      try {
        expect(host.open()).toMatchObject({
          ok: false,
          error: {
            code:
              failure === 'throw'
                ? `${host.cutPrefix}_BUILD_FAILED`
                : kind === 'Slab'
                  ? 'SLAB_CUT_FAILED'
                  : 'WALL_CUT_FAILED',
            cause: failure === 'throw' ? cause : { cause },
          },
        });
        expect(model.getAllElements()).toEqual(before);
        expect(model.getAllRelationships()).toEqual(relationships);
        expect(brepjs.getKernel().volume(host.solid().wrapped)).toBeCloseTo(host.volume, 7);
        expect(observed.resources.every((entry) => entry.attempts === 1)).toBe(true);
        expectArena(nativeBefore);
        cut.mockRestore();
        expect(host.open()).toEqual({ ok: true, value: kind === 'Slab' ? 3 : 5 });
        expect(brepjs.getKernel().volume(host.solid().wrapped)).toBeCloseTo(host.cutVolume, 7);
        model[Symbol.dispose]();
        expect(observed.resources.every((entry) => entry.attempts === 1)).toBe(true);
        expectArena(baseline);
      } finally {
        cut.mockRestore();
        model[Symbol.dispose]();
        observed.repair();
      }
      expectArena(baseline);
    }
  );

  it.each(['false', 'throw'] as const)(
    `${kind} rolls back generated-output adoption when validation returns %s`,
    (failure) => {
      const baseline = arena();
      const model = new BimModel();
      const host = openingHost(model, kind);
      const before = model.getAllElements();
      const relationships = model.getAllRelationships();
      const nativeBefore = arena();
      let output: Resource | undefined;
      const observed = observeOpening(undefined, (role, resource) => {
        if (role === 'copy') output = resource;
      });
      const kernel = brepjs.getKernel();
      const isValid = kernel.isValid.bind(kernel);
      let outputChecks = 0;
      const cause = new Error('Adoption validation');
      const validate = vi.spyOn(kernel, 'isValid').mockImplementation((shape) => {
        if (output !== undefined && shape === output.wrapped && ++outputChecks === 2) {
          if (failure === 'throw') throw cause;
          return false;
        }
        return isValid(shape);
      });
      try {
        expect(host.open()).toMatchObject({
          ok: false,
          error: { code: failure === 'throw' ? 'BODY_VALIDATION_FAILED' : 'BODY_INVALID_ITEM' },
        });
        expect(output?.disposed).toBe(true);
        expect(model.getAllElements()).toEqual(before);
        expect(model.getAllRelationships()).toEqual(relationships);
        expect(brepjs.getKernel().volume(host.solid().wrapped)).toBeCloseTo(host.volume, 7);
        expect(observed.resources.every((entry) => entry.attempts === 1)).toBe(true);
        expectArena(nativeBefore);
        validate.mockRestore();
        expect(host.open()).toEqual({ ok: true, value: kind === 'Slab' ? 3 : 5 });
        expect(brepjs.getKernel().volume(host.solid().wrapped)).toBeCloseTo(host.cutVolume, 7);
        model[Symbol.dispose]();
        expect(observed.resources.every((entry) => entry.attempts === 1)).toBe(true);
        expectArena(baseline);
      } finally {
        validate.mockRestore();
        model[Symbol.dispose]();
        observed.repair();
      }
      expectArena(baseline);
    }
  );
}

it.each(['Door', 'Slab'] as const)(
  '%s releases the generated tool when native validity throws',
  (kind) => {
    const baseline = arena();
    const model = new BimModel();
    const host = openingHost(model, kind);
    const before = model.getAllElements();
    const relationships = model.getAllRelationships();
    const nativeBefore = arena();
    const observed = observeOpening();
    const cause = new Error('Native tool validation');
    const validate = vi.spyOn(brepjs.getKernel(), 'isValid').mockImplementation(() => {
      throw cause;
    });
    try {
      expect
        .soft(host.open())
        .toMatchObject({ ok: false, error: { code: `${host.toolPrefix}_INVALID_SOLID`, cause } });
      expect.soft(observed.resources.every((entry) => entry.attempts === 1)).toBe(true);
      expect(model.getAllElements()).toEqual(before);
      expect(model.getAllRelationships()).toEqual(relationships);
      expect(brepjs.getKernel().volume(host.solid().wrapped)).toBeCloseTo(host.volume, 7);
      expectArena(nativeBefore);
    } finally {
      validate.mockRestore();
      model[Symbol.dispose]();
      observed.repair();
    }
    expectArena(baseline);
  }
);

it('preserves native validation failure and attempts every failed tool/profile cleanup once', () => {
  const baseline = arena();
  const model = new BimModel();
  const host = openingHost(model, 'Door');
  const primary = new Error('Native validity failure');
  const cleanup = new Error('Released but failed');
  const observed = observeOpening(() => ({ timing: 'after', cause: cleanup }));
  const validate = vi.spyOn(brepjs.getKernel(), 'isValid').mockImplementation(() => {
    throw primary;
  });
  try {
    expect(host.open()).toMatchObject({
      ok: false,
      error: {
        code: 'OPENING_INVALID_SOLID',
        cause: primary,
        cleanup: { kind: 'FAILED', diagnostics: [{ cause: cleanup }, { cause: cleanup }] },
      },
    });
    expect(brepjs.getKernel().volume(host.solid().wrapped)).toBeCloseTo(60, 7);
    expect(model.getGeometryCleanupDiagnostics()).toHaveLength(2);
    expect(observed.resources.every((entry) => entry.attempts === 1)).toBe(true);
    model[Symbol.dispose]();
    model[Symbol.dispose]();
    expect(observed.resources.every((entry) => entry.attempts === 1)).toBe(true);
    expectArena(baseline);
  } finally {
    validate.mockRestore();
    model[Symbol.dispose]();
    observed.repair();
  }
});

it('keeps a rejected generated output uncertain when its release throws, without retry or readoption', () => {
  const baseline = arena();
  const model = new BimModel();
  const host = openingHost(model, 'Door');
  const before = model.getAllElements();
  const cleanup = new Error('Output release did not complete');
  let output: Resource | undefined;
  const observed = observeOpening(
    (role) => (role === 'copy' ? { timing: 'before', cause: cleanup } : undefined),
    (role, resource) => {
      if (role === 'copy') output = resource;
    }
  );
  const kernel = brepjs.getKernel();
  const isValid = kernel.isValid.bind(kernel);
  let checks = 0;
  const validate = vi.spyOn(kernel, 'isValid').mockImplementation((shape) => {
    if (output !== undefined && shape === output.wrapped && ++checks === 2) return false;
    return isValid(shape);
  });
  try {
    expect(host.open()).toMatchObject({
      ok: false,
      error: {
        code: 'BODY_INVALID_ITEM',
        cleanup: { kind: 'FAILED', diagnostics: [{ cause: cleanup }] },
      },
    });
    expect(model.getAllElements()).toEqual(before);
    validate.mockRestore();
    if (output === undefined || !brepjs.isSolid(output) || !brepjs.isValidSolid(output)) {
      throw new Error('Expected the uncertain output to remain a live native solid');
    }
    expect(kernel.volume(output.wrapped)).toBeCloseTo(54, 7);
    expect(kernel.volume(host.solid().wrapped)).toBeCloseTo(60, 7);
    expect(model.addProxy({ name: 'Uncertain output', solid: output })).toMatchObject({
      ok: false,
      error: {
        code: 'BODY_OWNERSHIP_CONFLICT',
        metadata: { ownerState: 'UNCERTAIN' },
      },
    });
    model[Symbol.dispose]();
    model[Symbol.dispose]();
    expect(observed.resources.every((entry) => entry.attempts === 1)).toBe(true);
    expectArena(baseline, 1);
  } finally {
    validate.mockRestore();
    model[Symbol.dispose]();
    observed.repair();
  }
  expectArena(baseline);
});

it('reports both temporary and cancelled-output cleanup failures after an otherwise successful cut', () => {
  const baseline = arena();
  const model = new BimModel();
  const host = openingHost(model, 'Door');
  const temporary = new Error('Tool cleanup');
  const output = new Error('Cancelled output cleanup');
  const observed = observeOpening((role) =>
    role === 'tool'
      ? { timing: 'after', cause: temporary }
      : role === 'copy'
        ? { timing: 'after', cause: output }
        : undefined
  );
  try {
    expect(host.open()).toMatchObject({
      ok: false,
      error: {
        code: 'WALL_OPENING_CLEANUP_FAILED',
        cleanup: {
          kind: 'FAILED',
          diagnostics: [{ cause: temporary }, { cause: output }],
        },
      },
    });
    expect(brepjs.getKernel().volume(host.solid().wrapped)).toBeCloseTo(60, 7);
    expect(model.getAllElements().map((element) => element.category)).toEqual(['WALL']);
    expect(model.getGeometryCleanupDiagnostics()).toHaveLength(2);
    model[Symbol.dispose]();
    model[Symbol.dispose]();
    expect(observed.resources.every((entry) => entry.attempts === 1)).toBe(true);
    expectArena(baseline);
  } finally {
    model[Symbol.dispose]();
    observed.repair();
  }
});

it.each(['Door', 'Slab'] as const)(
  '%s preserves its host when copying the cut subsolid fails',
  (kind) => {
    const baseline = arena();
    const model = new BimModel();
    const host = openingHost(model, kind);
    const before = model.getAllElements();
    const nativeBefore = arena();
    const observed = observeOpening();
    const cause = new Error('Native independent copy failed');
    const copy = vi.spyOn(brepjs.getKernel(), 'copyShape').mockImplementationOnce(() => {
      throw cause;
    });
    try {
      expect(host.open()).toMatchObject({
        ok: false,
        error: { code: `${host.cutPrefix}_COPY_FAILED` },
      });
      expect(model.getAllElements()).toEqual(before);
      expect(brepjs.getKernel().volume(host.solid().wrapped)).toBeCloseTo(host.volume, 7);
      expect(observed.resources.every((entry) => entry.attempts === 1)).toBe(true);
      expectArena(nativeBefore);
      copy.mockRestore();
      expect(host.open()).toEqual({ ok: true, value: kind === 'Slab' ? 3 : 5 });
      expect(brepjs.getKernel().volume(host.solid().wrapped)).toBeCloseTo(host.cutVolume, 7);
      model[Symbol.dispose]();
      expect(observed.resources.every((entry) => entry.attempts === 1)).toBe(true);
      expectArena(baseline);
    } finally {
      copy.mockRestore();
      model[Symbol.dispose]();
      observed.repair();
    }
    expectArena(baseline);
  }
);

for (const kind of ['Door', 'Window', 'Slab'] as const) {
  for (const role of ['tool', 'copy'] as const) {
    it.each(['before', 'after'] as const)(
      `${kind} keeps a cancelled ${role} uncertain after its release throws %s native release`,
      (timing) => {
        const baseline = arena();
        const model = new BimModel();
        const host = openingHost(model, kind);
        const before = model.getAllElements();
        const relationships = model.getAllRelationships();
        const nativeBefore = arena();
        const temporary = new Error('Temporary release reported failure');
        const cancelled = new Error('Cancelled output release reported failure');
        let output: brepjs.ValidSolid | undefined;
        const observed = observeOpening(
          (candidate) =>
            candidate === (role === 'copy' ? 'tool' : 'profile')
              ? { timing: 'after', cause: temporary }
              : candidate === role
                ? { timing, cause: cancelled }
                : undefined,
          (candidate, resource) => {
            if (candidate === role && brepjs.isSolid(resource) && brepjs.isValidSolid(resource))
              output = resource;
          }
        );
        try {
          expect(host.open()).toMatchObject({
            ok: false,
            error: {
              code: `${role === 'copy' ? host.cutPrefix : host.toolPrefix}_CLEANUP_FAILED`,
              cleanup: {
                kind: 'FAILED',
                diagnostics: [{ cause: temporary }, { cause: cancelled }],
              },
            },
          });
          expect(model.getAllElements()).toEqual(before);
          expect(model.getAllRelationships()).toEqual(relationships);
          expect(brepjs.getKernel().volume(host.solid().wrapped)).toBeCloseTo(host.volume, 7);
          expect(model.getGeometryCleanupDiagnostics()).toMatchObject([
            { cause: temporary },
            { cause: cancelled },
          ]);
          if (output === undefined) throw new Error('Expected the cancelled generated solid');
          if (timing === 'before') {
            const volume = role === 'copy' ? host.cutVolume : kind === 'Window' ? 3 : 18;
            expect(brepjs.getKernel().volume(output.wrapped)).toBeCloseTo(volume, 7);
          }
          expect(observed.resources.every((entry) => entry.attempts === 1)).toBe(true);
          expectArena(nativeBefore, timing === 'before' ? 1 : 0);
          expect
            .soft(model.addProxy({ name: 'Uncertain cancelled solid', solid: output }))
            .toMatchObject({
              ok: false,
              error: { code: 'BODY_OWNERSHIP_CONFLICT', metadata: { ownerState: 'UNCERTAIN' } },
            });
          if (timing === 'before') {
            const raw: unknown = output.wrapped;
            const alias = brepjs.unwrap(brepjs.validSolid(brepjs.createSolid(raw)));
            try {
              expect(
                model.addProxy({ name: 'Aliased uncertain output', solid: alias })
              ).toMatchObject({
                ok: false,
                error: { code: 'BODY_OWNERSHIP_CONFLICT', metadata: { ownerState: 'UNCERTAIN' } },
              });
            } finally {
              // Fixture-only disarming of an owning alias; leave the uncertain resource untouched.
              const kernel = brepjs.getKernel();
              const release = kernel.dispose.bind(kernel);
              const disarm = vi.spyOn(kernel, 'dispose').mockImplementation((candidate) => {
                if (candidate !== raw) release(candidate);
              });
              try {
                alias[Symbol.dispose]();
              } finally {
                disarm.mockRestore();
              }
            }
          }
          expect.soft(() => model[Symbol.dispose]()).not.toThrow();
          model[Symbol.dispose]();
          expect.soft(observed.resources.every((entry) => entry.attempts === 1)).toBe(true);
          expectArena(baseline, timing === 'before' ? 1 : 0);
        } finally {
          try {
            model[Symbol.dispose]();
          } finally {
            observed.repair();
          }
        }
        expectArena(baseline);
      }
    );
  }
}
