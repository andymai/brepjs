import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { csg, getKernel, unwrap } from 'brepjs';
import * as brepjs from 'brepjs';
import { prepareCivilProductBody } from '../src/familiesProductBody.js';
import { IDENTITY_FRAME } from '../src/placementFrame.js';
import { currentKernel, initKernel } from '../../../tests/setup.js';
import { nativeShapeCount } from './helpers/nativeArena.js';
import {
  bodyTree,
  civilBody,
  disconnectedBody,
  resolvedProduct,
} from './helpers/familiesBodyFixture.js';

beforeAll(async () => {
  await initKernel();
}, 30000);
afterEach(() => vi.restoreAllMocks());

it('releases earlier native children when a later uncached authored item cast fails', () => {
  using evaluator = new csg.Evaluator();
  const element = resolvedProduct(bodyTree(civilBody(disconnectedBody())));
  const source = unwrap(evaluator.evaluate(element.geometry));
  const sourceRelease = vi.spyOn(source, Symbol.dispose);
  const baseline = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
  const kernel = getKernel();
  const downcast = kernel.downcast.bind(kernel);
  const dispose = kernel.dispose.bind(kernel);
  const releases = vi.spyOn(kernel, 'dispose');
  let first: unknown;
  let casts = 0;
  vi.spyOn(kernel, 'downcast').mockImplementation((raw, type): unknown => {
    if (type === 'solid') {
      if (++casts === 2) throw new Error('Later authored item cast');
      first = downcast(raw, type);
      return first;
    }
    return downcast(raw, type);
  });
  try {
    expect(
      prepareCivilProductBody({
        element,
        category: 'RAILING',
        evaluator,
        productWorldFrame: IDENTITY_FRAME,
      })
    ).toMatchObject({ ok: false });
    expect(casts).toBe(2);
    expect(releases.mock.calls.filter(([raw]) => raw === first)).toHaveLength(1);
    expect(sourceRelease).not.toHaveBeenCalled();
    expect(kernel.volume(source.wrapped)).toBeCloseTo(0.8, 8);
    if (baseline !== null) expect(nativeShapeCount()).toBe(baseline);
  } finally {
    // Repair only the red candidate's known ownerless resource after no-retry observations.
    if (first !== undefined && !releases.mock.calls.some(([raw]) => raw === first)) {
      dispose(nativeResource(first));
    }
    vi.restoreAllMocks();
  }
});

it.each(['before', 'after'] as const)(
  'cancels authored handoff when extracted-child cleanup fails %s release',
  (point) => {
    using evaluator = new csg.Evaluator();
    const element = resolvedProduct(bodyTree(civilBody(disconnectedBody())));
    const source = unwrap(evaluator.evaluate(element.geometry));
    const sourceRelease = vi.spyOn(source, Symbol.dispose);
    const baseline = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
    const create = brepjs.createSolid;
    const releases: ReturnType<typeof vi.fn>[] = [];
    let recovery: (() => void) | undefined;
    const cause = new Error('Extracted authored child cleanup');
    vi.spyOn(brepjs, 'createSolid').mockImplementation((raw) => {
      const child = create(raw);
      const release = child[Symbol.dispose].bind(child);
      const first = releases.length === 0;
      const attempt = vi.fn(() => {
        if (first && point === 'before') {
          recovery = release;
          throw cause;
        }
        release();
        if (first) throw cause;
      });
      vi.spyOn(child, Symbol.dispose).mockImplementation(attempt);
      releases.push(attempt);
      return child;
    });
    try {
      expect(
        prepareCivilProductBody({
          element,
          category: 'RAILING',
          evaluator,
          productWorldFrame: IDENTITY_FRAME,
        })
      ).toMatchObject({
        ok: false,
        error: {
          code: 'FAMILIES_PRODUCT_BODY_CLEANUP_FAILED',
          metadata: { cleanup: { kind: 'FAILED', diagnostics: [{ cause }] } },
        },
      });
      expect(releases).toHaveLength(2);
      releases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
      expect(sourceRelease).not.toHaveBeenCalled();
      expect(getKernel().volume(source.wrapped)).toBeCloseTo(0.8, 8);
      if (baseline !== null)
        expect(nativeShapeCount()).toBe(baseline + (point === 'before' ? 1 : 0));
    } finally {
      vi.restoreAllMocks();
      recovery?.();
    }
    if (baseline !== null) expect(nativeShapeCount()).toBe(baseline);
  }
);

function nativeResource(value: unknown): { delete(): void } {
  if (!isNativeResource(value)) throw new Error('Expected native resource');
  return value;
}
function isNativeResource(value: unknown): value is { delete(): void } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'delete' in value &&
    typeof value.delete === 'function'
  );
}
