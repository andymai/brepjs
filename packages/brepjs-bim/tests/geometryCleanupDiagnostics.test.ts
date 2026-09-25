import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import * as brepjs from 'brepjs';
import { geometryError } from '../src/errors/bimError.js';
import { reportedGeometryCleanup } from '../src/geometryCleanupDiagnostics.js';
import { cleanupOwnedResources } from '../src/productBodyCleanup.js';
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
