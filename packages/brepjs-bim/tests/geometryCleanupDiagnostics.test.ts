import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import * as brepjs from 'brepjs';
import { BimModel } from '../src/model/bimModel.js';
import { geometryError } from '../src/errors/bimError.js';
import { reportedGeometryCleanup } from '../src/geometryCleanupDiagnostics.js';
import { cleanupOwnedResources, cleanupReport } from '../src/productBodyCleanup.js';
import { transformProductBody, validateProductBody } from '../src/types/productBody.js';
import { IDENTITY_FRAME } from '../src/placementFrame.js';
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
const axes = {
  origin: [0, 0, 0],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  materialName: 'Steel',
} satisfies Pick<
  Parameters<BimModel['addRailing']>[0],
  'origin' | 'axisX' | 'axisZ' | 'materialName'
>;

it.each(['POSTED', 'CURTAIN'] as const)(
  'preserves separate %s temporary and cancelled-output cleanup failures with one cause',
  (kind) => {
    const baseline = arena();
    const model = new BimModel();
    const cause = new Error('Shared failed-release cause');
    let attempts = 0;
    const wrap = (resource: Disposable): void => {
      const release = resource[Symbol.dispose].bind(resource);
      vi.spyOn(resource, Symbol.dispose).mockImplementation(() => {
        attempts++;
        release();
        throw cause;
      });
    };
    let temporaryAttached = false;
    if (kind === 'POSTED') {
      const { box, clone } = brepjs;
      vi.spyOn(brepjs, 'box').mockImplementation((...args) => {
        const result = box(...args);
        if (!temporaryAttached) {
          temporaryAttached = true;
          wrap(result);
        }
        return result;
      });
      vi.spyOn(brepjs, 'clone').mockImplementation((...args) => {
        const result = clone(...args);
        if (result.ok) wrap(result.value);
        return result;
      });
    } else {
      const { polygon, extrude } = brepjs;
      let outputAttached = false;
      vi.spyOn(brepjs, 'polygon').mockImplementation((...args) => {
        const result = polygon(...args);
        if (result.ok && !temporaryAttached) {
          temporaryAttached = true;
          wrap(result.value);
        }
        return result;
      });
      vi.spyOn(brepjs, 'extrude').mockImplementation((...args) => {
        const result = extrude(...args);
        if (result.ok && !outputAttached) {
          outputAttached = true;
          wrap(result.value);
        }
        return result;
      });
    }
    try {
      const result =
        kind === 'POSTED'
          ? model.addRailing({
              ...axes,
              length: 2000,
              height: 1000,
              thickness: 50,
              infill: 'POSTED',
            })
          : model.addCurtainWall({
              ...axes,
              width: 10,
              height: 10,
              columns: 2,
              rows: 2,
              panelThickness: 0.1,
              mullionWidth: 1,
              mullionDepth: 1,
            });
      expect(result).toMatchObject({ ok: false });
      expect(attempts).toBe(2);
      expect(model.getAllElements()).toEqual([]);
      expect(model.getGeometryCleanupDiagnostics()).toHaveLength(2);
      if (result.ok) throw new Error('Expected failed temporary cleanup');
      const rows = reportedGeometryCleanup(result.error, 'readAgain');
      const report = cleanupReport(rows);
      const repeated = {
        ...geometryError(
          'WRAPPED',
          'Nested report propagation',
          new AggregateError([result.error, result.error])
        ),
        cleanup: report,
        metadata: { cleanup: cleanupReport(rows.map((row) => Object.freeze({ ...row }))) },
      };
      expect(reportedGeometryCleanup(repeated, 'wrapped')).toHaveLength(2);
      expect(model.getGeometryCleanupDiagnostics().every(Object.isFrozen)).toBe(true);
      model[Symbol.dispose]();
      model[Symbol.dispose]();
      expect(attempts).toBe(2);
      expectArena(baseline);
    } finally {
      model[Symbol.dispose]();
    }
  }
);

it('preserves separate native cleanup attempts in nested aggregates while deduplicating a repeated error', () => {
  const baseline = arena();
  const first = brepjs.box(1, 1, 1);
  const second = brepjs.box(2, 1, 1);
  const model = new BimModel();
  const cause = new Error('Shared native cleanup cause');
  const firstFailure = new brepjs.GeometryCleanupError({
    message: 'First release',
    resourceKind: 'SHAPE',
    cause,
  });
  const secondFailure = new brepjs.GeometryCleanupError({
    message: 'Second release',
    resourceKind: 'SHAPE',
    cause,
  });
  const primary = new AggregateError([
    new AggregateError([firstFailure]),
    secondFailure,
    firstFailure,
  ]);
  let attempts = 0;
  vi.spyOn(brepjs.getKernel(), 'isValid').mockImplementation(() => {
    first[Symbol.dispose]();
    second[Symbol.dispose]();
    attempts += 2;
    throw primary;
  });
  try {
    expect(model.addWall({ ...axes, length: 10, height: 10, thickness: 1 })).toMatchObject({
      ok: false,
      error: { cause: primary },
    });
    expect(attempts).toBe(2);
    expect(model.getGeometryCleanupDiagnostics()).toMatchObject([{ cause }, { cause }]);
    model[Symbol.dispose]();
    expectArena(baseline);
  } finally {
    model[Symbol.dispose]();
    if (!first.disposed) first[Symbol.dispose]();
    if (!second.disposed) second[Symbol.dispose]();
  }
});

it.each(['before', 'after'] as const)(
  'preserves every reported native metadata cleanup attempt %s release across nested report forwarding',
  (timing) => {
    const baseline = arena();
    {
      using a = brepjs.box(1, 1, 1);
      using b = brepjs.box(1, 1, 1, { at: [2, 0, 0] });
      const face = brepjs.getFaces(b)[0];
      if (face === undefined) throw new Error('Expected fixture face');
      brepjs.tagFaces(b, [face], 'retained');
      const body = brepjs.unwrap(validateProductBody({ kind: 'AUTHORITATIVE', solids: [a, b] }));
      const live = arena();
      const kernel = brepjs.getKernel();
      const release = kernel.dispose.bind(kernel);
      const failed: Parameters<typeof release>[0][] = [];
      const cause = new Error('Metadata face release failed');
      const disposal = vi.spyOn(kernel, 'dispose').mockImplementation((raw) => {
        if (kernel.shapeType(raw) === 'face') {
          failed.push(raw);
          if (timing === 'after') release(raw);
          throw cause;
        }
        release(raw);
      });
      try {
        const result = transformProductBody(body, IDENTITY_FRAME);
        if (result.ok) throw new Error('Expected native metadata cleanup failure');
        expect(failed).toHaveLength(12);
        const firstReport = cleanupReport(reportedGeometryCleanup(result.error, 'forwardOne'));
        const repeated = {
          ...geometryError(
            'FORWARDED',
            'Report plus repeated causes',
            new AggregateError([result.error, result.error])
          ),
          cleanup: firstReport,
          metadata: { cleanup: firstReport },
        };
        const diagnostics = reportedGeometryCleanup(repeated, 'forwardTwo');
        expect(diagnostics).toHaveLength(12);
        expect(
          diagnostics.every(
            (entry) =>
              entry.cause === cause &&
              entry.itemIndex === 1 &&
              entry.operation === 'transformProductBody'
          )
        ).toBe(true);
        expect(diagnostics.every(Object.isFrozen)).toBe(true);
        expectArena(live, timing === 'before' ? 12 : 0);
        expect(a.disposed || b.disposed).toBe(false);
      } finally {
        disposal.mockRestore();
        // Only the fixture knows which pre-release failures it can repair safely.
        if (timing === 'before') for (const raw of new Set(failed)) release(raw);
      }
      expectArena(live);
    }
    expectArena(baseline);
  }
);

it('retains an additional native failure beside a partial report with the same cause', () => {
  const baseline = arena();
  const first = brepjs.box(1, 1, 1);
  const second = brepjs.box(1, 1, 1);
  const cause = new Error('Shared cause for independent attempts');
  const releaseFirst = first[Symbol.dispose].bind(first);
  vi.spyOn(first, Symbol.dispose).mockImplementation(() => {
    releaseFirst();
    throw cause;
  });
  try {
    const report = cleanupOwnedResources([{ resource: first, itemIndex: 0 }], {
      operation: 'partial',
    });
    second[Symbol.dispose]();
    const additional = new brepjs.GeometryCleanupError({
      message: 'Second release',
      resourceKind: 'SHAPE',
      cause,
    });
    const error = {
      ...geometryError(
        'PARTIAL',
        'A prior report and another native attempt',
        new AggregateError([additional, additional])
      ),
      metadata: { cleanup: report },
    };
    const diagnostics = reportedGeometryCleanup(error, 'extra');
    expect(diagnostics).toMatchObject([
      { operation: 'partial', itemIndex: 0, cause },
      { operation: 'extra', itemIndex: 0, cause },
    ]);
    expectArena(baseline);
  } finally {
    if (!first.disposed) releaseFirst();
    if (!second.disposed) second[Symbol.dispose]();
  }
});
