import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import * as brepjs from 'brepjs';
import { currentKernel, initKernel } from '../../../tests/setup.js';
import { fromIfc } from '../src/import/fromIfc.js';
import * as cutImport from '../src/import/cutImportedSolids.js';
import * as geometryRead from '../src/import/geometryRead.js';
import { disposeImportedModel } from '../src/import/importedModel.js';
import { nativeShapeCount } from './helpers/nativeArena.js';
import { bodyFixture } from './helpers/importedBodyFixture.js';

beforeAll(async () => {
  await initKernel();
}, 30_000);
afterEach(() => vi.restoreAllMocks());

function arena(): number | null {
  return currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
}

for (const primaryFailure of [false, true]) {
  it.each(['before', 'after'] as const)(
    `cleans every current host when opening release fails %s native disposal, primary failure=${String(primaryFailure)}`,
    async (point) => {
      const before = arena();
      const observed = observeCutResources();
      const cut = vi.mocked(brepjs.cut).getMockImplementation();
      if (!cut) throw new Error('Missing native cut observer');
      let release: ReturnType<typeof vi.fn> | undefined;
      let recovery: (() => void) | undefined;
      const cleanupCause = new Error('opening release failed');
      const primaryCause = new Error('later opening cut failed');
      vi.mocked(brepjs.cut).mockImplementation((...args) => {
        if (!release) {
          const opening = brepjs.resolve(args[1]);
          const dispose = opening[Symbol.dispose].bind(opening);
          if (point === 'before') recovery = dispose;
          release = vi.spyOn(opening, Symbol.dispose).mockImplementation(() => {
            if (point === 'after') dispose();
            throw cleanupCause;
          });
        }
        return cut(...args);
      });
      const normalize = cutImport.cutImportedSolids;
      let calls = 0;
      if (primaryFailure)
        vi.spyOn(cutImport, 'cutImportedSolids').mockImplementation((...args) => {
          if (++calls === 2) throw primaryCause;
          return normalize(...args);
        });
      try {
        const imported = brepjs.unwrap(
          await fromIfc(
            await bodyFixture({
              extrudedCubes: 2,
              withOpening: { width: 20, height: 100, offsetAlongWall: 40 },
            })
          )
        );
        try {
          expect(imported.elements.filter(({ category }) => category === 'WALL').length).toBe(0);
          expect(imported.elements.filter(({ category }) => category === 'OPENING').length).toBe(1);
          const diagnostic = imported.diagnostics.issues.find(
            ({ code }) => code === 'ELEMENT_READ_FAILED'
          );
          expect(diagnostic?.context?.['cause']).toMatchObject({
            metadata: { cleanup: { kind: 'FAILED', diagnostics: [{ cause: cleanupCause }] } },
          });
          if (primaryFailure)
            expect(diagnostic?.context?.['cause']).toMatchObject({
              cause: { suppressed: primaryCause },
            });
          expect(observed.copies.length).toBe(primaryFailure ? 2 : 3);
          observed.copies.forEach(({ release: copyRelease }) =>
            expect(copyRelease).toHaveBeenCalledTimes(1)
          );
          observed.cuts.forEach(({ release: cutRelease }) =>
            expect(cutRelease).toHaveBeenCalledTimes(1)
          );
          expect(release).toHaveBeenCalledTimes(1);
          expectArena(before, 1 + (point === 'before' ? 1 : 0));
        } finally {
          disposeImportedModel(imported);
        }
        expect(release).toHaveBeenCalledTimes(1);
        expectArena(before, point === 'before' ? 1 : 0);
      } finally {
        recovery?.();
      }
      expectArena(before);
    }
  );
}

it('cleans normalized hosts when a later opening cannot be read', async () => {
  const before = arena();
  const observed = observeCutResources();
  const read = geometryRead.readBodyGeometry;
  let reads = 0;
  const cause = new Error('later opening read failed');
  vi.spyOn(geometryRead, 'readBodyGeometry').mockImplementation((...args) => {
    if (++reads === 2) throw cause;
    return read(...args);
  });
  const imported = brepjs.unwrap(
    await fromIfc(
      await bodyFixture({
        extrudedCubes: 2,
        withOpening: { width: 20, height: 100, offsetAlongWall: 40 },
        secondOpening: { width: 10, height: 100, offsetAlongWall: 20 },
      })
    )
  );
  try {
    expect(imported.elements.filter(({ category }) => category === 'WALL').length).toBe(0);
    expect(imported.elements.filter(({ category }) => category === 'OPENING').length).toBe(2);
    const diagnostic = imported.diagnostics.issues.find(
      ({ code }) => code === 'ELEMENT_READ_FAILED'
    );
    expect(diagnostic?.context?.['cause']).toMatchObject({
      cause,
      metadata: { cleanup: { kind: 'COMPLETE' } },
    });
    expect(observed.copies.length).toBe(3);
    observed.copies.forEach(({ release }) => expect(release).toHaveBeenCalledTimes(1));
    expectArena(before, 2);
  } finally {
    disposeImportedModel(imported);
  }
  expectArena(before);
});
function expectArena(expected: number | null, outstanding = 0): void {
  if (expected !== null) expect(nativeShapeCount()).toBe(expected + outstanding);
}

function observeCutResources() {
  const cuts: {
    shape: brepjs.Shape3D;
    release: ReturnType<typeof vi.fn>;
    realRelease: () => void;
  }[] = [];
  const copies: { shape: brepjs.AnyShape<brepjs.Dimension>; release: ReturnType<typeof vi.fn> }[] =
    [];
  const children: { shape: brepjs.Solid; release: ReturnType<typeof vi.fn> }[] = [];
  const cut = brepjs.cut;
  const clone = brepjs.clone;
  const createSolid = brepjs.createSolid;
  vi.spyOn(brepjs, 'cut').mockImplementation((...args) => {
    const result = cut(...args);
    if (result.ok) {
      const realRelease = result.value[Symbol.dispose].bind(result.value);
      cuts.push({
        shape: result.value,
        release: vi.spyOn(result.value, Symbol.dispose),
        realRelease,
      });
    }
    return result;
  });
  vi.spyOn(brepjs, 'clone').mockImplementation((...args) => {
    const result = clone(...args);
    if (result.ok)
      copies.push({ shape: result.value, release: vi.spyOn(result.value, Symbol.dispose) });
    return result;
  });
  vi.spyOn(brepjs, 'createSolid').mockImplementation((raw) => {
    const shape = createSolid(raw);
    children.push({ shape, release: vi.spyOn(shape, Symbol.dispose) });
    return shape;
  });
  return { cuts, copies, children };
}

for (const mode of ['split', 'remove-first', 'remove-all'] as const) {
  it(`preserves successful ${mode} cuts as independently owned solids in source-item groups`, async () => {
    const before = arena();
    const observed = observeCutResources();
    const imported = brepjs.unwrap(
      await fromIfc(
        await bodyFixture({
          extrudedCubes: 2,
          withOpening: {
            width: mode === 'split' ? 20 : mode === 'remove-first' ? 100 : 250,
            height: 100,
            offsetAlongWall: mode === 'split' ? 40 : 0,
          },
        })
      )
    );
    const releases = imported.elements.flatMap(({ geometry }) =>
      geometry.solids.map((solid) => vi.spyOn(solid, Symbol.dispose))
    );
    try {
      const wall = imported.elements.find(({ category }) => category === 'WALL');
      const opening = imported.elements.find(({ category }) => category === 'OPENING');
      if (!wall || !opening) throw new Error('Missing imported identities');
      expect(wall.voidedBy).toEqual([opening.expressId]);
      expect(wall.geometry.completeness).toBe('COMPLETE');
      expect(wall.geometry.fidelity).toBe('PARAMETRIC');
      const expected =
        mode === 'split' ? [400_000, 400_000, 125_000] : mode === 'remove-first' ? [125_000] : [];
      const xMins = mode === 'split' ? [1000, 1060, 1200] : mode === 'remove-first' ? [1200] : [];
      expect(wall.geometry.solids).toHaveLength(expected.length);
      wall.geometry.solids.forEach((solid, index) => {
        expect(brepjs.getKernel().shapeType(solid.wrapped)).toBe('solid');
        expect(brepjs.getKernel().volume(solid.wrapped)).toBeCloseTo(expected[index] ?? -1, 2);
        expect(brepjs.getBounds(solid).xMin).toBeCloseTo(xMins[index] ?? -1, 2);
      });
      expect(wall.geometry.solid).toBe(expected.length === 1 ? wall.geometry.solids[0] : null);
      if (mode === 'remove-all') {
        expect(wall.geometry.volumeMm3).toBeNull();
        expect(wall.geometry.bounds).toBeNull();
      } else {
        expect(wall.geometry.volumeMm3).toBeCloseTo(mode === 'split' ? 925_000 : 125_000, 2);
        expect(wall.geometry.bounds?.xMin).toBeCloseTo(mode === 'split' ? 1000 : 1200, 2);
        expect(wall.geometry.bounds?.xMax).toBeCloseTo(1250, 2);
      }
      expect(observed.cuts.length).toBe(2);
      expect(observed.copies.length).toBe(expected.length);
      expect(observed.children.length).toBe(expected.length);
      observed.cuts.forEach(({ release }) => expect(release).toHaveBeenCalledTimes(1));
      observed.children.forEach(({ shape, release }) => {
        expect(shape.disposed).toBe(true);
        expect(release).toHaveBeenCalledTimes(1);
      });
      observed.copies.forEach(({ release }) => expect(release).not.toHaveBeenCalled());
      expect(imported.diagnostics.issues.some(({ code }) => code.startsWith('VOID_'))).toBe(false);
      expectArena(before, releases.length);
    } finally {
      disposeImportedModel(imported);
    }
    releases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
    observed.copies.forEach(({ release }) => expect(release).toHaveBeenCalledTimes(1));
    expectArena(before);
  });
}

it.each(['copy-error', 'copy-throw', 'validation-error'] as const)(
  'cleans a later %s in cut normalization and retains the original source item',
  async (failure) => {
    const before = arena();
    const observed = observeCutResources();
    const copyShape = brepjs.getKernel().copyShape.bind(brepjs.getKernel());
    let copyCalls = 0;
    if (failure === 'copy-throw')
      vi.spyOn(brepjs.getKernel(), 'copyShape').mockImplementation((...args) => {
        if (++copyCalls === 2) throw new Error('native later copy failure');
        const result: unknown = copyShape(...args);
        return result;
      });
    const clone = vi.mocked(brepjs.clone).getMockImplementation();
    if (!clone) throw new Error('Missing observed clone implementation');
    if (failure === 'copy-error')
      vi.spyOn(brepjs, 'clone').mockImplementation((...args) => {
        if (++copyCalls === 2)
          return brepjs.err(brepjs.kernelError('COPY_FAILED', 'later copy error'));
        return clone(...args);
      });
    const valid = brepjs.validSolid;
    if (failure === 'validation-error')
      vi.spyOn(brepjs, 'validSolid').mockImplementation((...args) => {
        if (observed.copies.length === 2 && args[0] === observed.copies[1]?.shape)
          return brepjs.err('later validation error');
        return valid(...args);
      });
    const imported = brepjs.unwrap(
      await fromIfc(
        await bodyFixture({
          extrudedCubes: 2,
          withOpening: { width: 20, height: 100, offsetAlongWall: 40 },
        })
      )
    );
    const releases = imported.elements.flatMap(({ geometry }) =>
      geometry.solids.map((solid) => vi.spyOn(solid, Symbol.dispose))
    );
    try {
      const wall = imported.elements.find(({ category }) => category === 'WALL');
      if (!wall) throw new Error('Missing host');
      expect(wall.geometry.completeness).toBe('COMPLETE');
      expect(wall.geometry.solids).toHaveLength(2);
      const [first] = wall.geometry.solids;
      if (!first) throw new Error('Missing first host');
      expect(brepjs.getKernel().volume(first.wrapped)).toBeCloseTo(1_000_000, 2);
      expect(wall.geometry.volumeMm3).toBeCloseTo(1_125_000, 2);
      expect(imported.diagnostics.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'VOID_SUBTRACTION_FAILED', severity: 'warning' }),
        ])
      );
      const failedOutputs = observed.copies.slice(0, failure === 'validation-error' ? 2 : 1);
      failedOutputs.forEach(({ release }) => expect(release).toHaveBeenCalledTimes(1));
      observed.cuts.forEach(({ release }) => expect(release).toHaveBeenCalledTimes(1));
      observed.children.forEach(({ release }) => expect(release).toHaveBeenCalledTimes(1));
      expectArena(before, releases.length);
    } finally {
      disposeImportedModel(imported);
    }
    releases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
    observed.copies.forEach(({ release }) => expect(release).toHaveBeenCalledTimes(1));
    expectArena(before);
  }
);

for (const primaryFailure of [false, true]) {
  it.each(['before', 'after'] as const)(
    `reports cut normalization cleanup %s native release, primary failure=${String(primaryFailure)}`,
    async (releasePoint) => {
      const before = arena();
      const observed = observeCutResources();
      const cut = vi.mocked(brepjs.cut).getMockImplementation();
      const clone = vi.mocked(brepjs.clone).getMockImplementation();
      if (!cut || !clone) throw new Error('Missing observed native operations');
      const cleanupCause = new Error('uncertain cut compound cleanup');
      let recovery: (() => void) | undefined;
      vi.mocked(brepjs.cut).mockImplementation((...args) => {
        const result = cut(...args);
        const first = observed.cuts[0];
        if (observed.cuts.length === 1 && first) {
          if (releasePoint === 'before') recovery = first.realRelease;
          first.release.mockImplementation(() => {
            if (releasePoint === 'after') first.realRelease();
            throw cleanupCause;
          });
        }
        return result;
      });
      let copies = 0;
      if (primaryFailure)
        vi.mocked(brepjs.clone).mockImplementation((...args) => {
          if (++copies === 2)
            return brepjs.err(brepjs.kernelError('COPY_FAILED', 'later copy error'));
          return clone(...args);
        });
      // Extracted children are released independently, even when their parent release fails.
      const outstanding = releasePoint === 'before' ? 1 : 0;
      try {
        const imported = brepjs.unwrap(
          await fromIfc(
            await bodyFixture({
              extrudedCubes: 2,
              withOpening: { width: 20, height: 100, offsetAlongWall: 40 },
            })
          )
        );
        const releases = imported.elements.flatMap(({ geometry }) =>
          geometry.solids.map((solid) => vi.spyOn(solid, Symbol.dispose))
        );
        try {
          const wall = imported.elements.find(({ category }) => category === 'WALL');
          if (!wall) throw new Error('Missing source host');
          expect(wall.geometry.solids).toHaveLength(2);
          expect(wall.geometry.volumeMm3).toBeCloseTo(1_125_000, 2);
          const [first, second] = wall.geometry.solids;
          if (!first || !second) throw new Error('Missing retained siblings');
          expect(brepjs.getKernel().volume(first.wrapped)).toBeCloseTo(1_000_000, 2);
          expect(brepjs.getKernel().volume(second.wrapped)).toBeCloseTo(125_000, 2);
          const failure = imported.diagnostics.issues.find(
            ({ code }) => code === 'VOID_SUBTRACTION_FAILED'
          );
          expect(failure).toMatchObject({
            severity: 'warning',
            context: {
              cause: {
                code: primaryFailure ? 'VOID_COPY_FAILED' : 'VOID_CLEANUP_FAILED',
                metadata: { cleanup: { kind: 'FAILED', diagnostics: [{ cause: cleanupCause }] } },
              },
            },
          });
          observed.cuts.forEach(({ release }) => expect(release).toHaveBeenCalledTimes(1));
          observed.copies
            .slice(0, primaryFailure ? 1 : 2)
            .forEach(({ release }) => expect(release).toHaveBeenCalledTimes(1));
          expectArena(before, releases.length + outstanding);
        } finally {
          disposeImportedModel(imported);
        }
        releases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
        observed.copies.forEach(({ release }) => expect(release).toHaveBeenCalledTimes(1));
        observed.cuts.forEach(({ release }) => expect(release).toHaveBeenCalledTimes(1));
        expectArena(before, outstanding);
      } finally {
        // The test alone knows that this injected before-release failure freed nothing.
        recovery?.();
      }
      observed.children.forEach(({ release }) => expect(release).toHaveBeenCalledTimes(1));
      expectArena(before);
    }
  );
}
