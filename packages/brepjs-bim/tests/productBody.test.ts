import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { box, cylinder, DisposalScope, getBounds, getKernel, measureVolume, unwrap } from 'brepjs';
import {
  bodySolids,
  copyProductBody,
  disposeProductBody,
  measureProductBodyMaterial,
  productBodyBounds,
  transformProductBody,
  validateProductBody,
} from '../src/types/productBody.js';
import { IDENTITY_FRAME, rotationFrame, translationFrame } from '../src/placementFrame.js';
import { createOverlapFixture } from './helpers/nativeBodyFixture.js';
import { nativeShapeCount } from './helpers/nativeArena.js';
import { currentKernel, initKernel } from '../../../tests/setup.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

afterEach(() => vi.restoreAllMocks());

describe.each(['PARAMETRIC', 'AUTHORITATIVE'] as const)('%s ProductBody', (kind) => {
  it.each(['singleton', 'disconnected', 'overlapping'] as const)(
    'protects and borrows %s items, measures occupied material and owns independent outputs',
    (arrangement) => {
      const before = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
      {
        using scope = new DisposalScope();
        const { a, b } = createOverlapFixture(scope);
        const distant = scope.register(box(1, 1, 1, { at: [3.5, 0.5, 0.5] }));
        const solids =
          arrangement === 'singleton' ? [a] : [a, arrangement === 'overlapping' ? b : distant];
        const input = { kind, solids };
        const body = unwrap(validateProductBody(input));
        const retained = [...solids];
        Reflect.set(input, 'kind', 'INVALID');
        solids.reverse();
        solids.push(distant);
        expect(body.kind).toBe(kind);
        expect(bodySolids(body)).toEqual(retained);
        expect(bodySolids(body)).toBe(bodySolids(body));
        expect(Object.isFrozen(body)).toBe(true);
        expect(Object.isFrozen(bodySolids(body))).toBe(true);
        expect(Reflect.set(body, 'kind', 'INVALID')).toBe(false);
        expect(Reflect.set(bodySolids(body), 0, distant)).toBe(false);
        const live = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
        expect(unwrap(measureProductBodyMaterial(bodySolids(body)))).toBeCloseTo(
          arrangement === 'singleton' ? 1 : arrangement === 'overlapping' ? 1.5 : 2,
          8
        );
        const bounds = unwrap(productBodyBounds(body));
        expect(bounds.space).toEqual({ kind: 'LOCAL' });
        expect(bounds.bounds.xMin).toBeCloseTo(0, 6);
        expect(bounds.bounds.xMax).toBeCloseTo(
          arrangement === 'singleton' ? 1 : arrangement === 'overlapping' ? 1.5 : 4,
          6
        );
        const copied = unwrap(copyProductBody(body));
        const identity = unwrap(transformProductBody(body, IDENTITY_FRAME));
        const placed = unwrap(transformProductBody(body, unwrap(translationFrame([10, 2, 3]))));
        try {
          for (const output of [copied, identity, placed]) {
            expect(output.kind).toBe(kind);
            expect(output.solids).toHaveLength(retained.length);
            output.solids.forEach((solid, i) => {
              expect(solid).not.toBe(retained[i]);
              expect(solid.disposed).toBe(false);
            });
            expect(unwrap(measureProductBodyMaterial(output.solids))).toBeCloseTo(
              unwrap(measureProductBodyMaterial(body.solids)),
              8
            );
          }
          placed.solids.forEach((solid, i) => {
            const source = retained[i];
            if (!source) throw new Error('Expected source item');
            expect(getBounds(solid).xMin - getBounds(source).xMin).toBeCloseTo(10, 6);
          });
        } finally {
          for (const output of [copied, identity, placed])
            expect(disposeProductBody(output)).toEqual({ kind: 'COMPLETE' });
        }
        expect(body.solids).toEqual(retained);
        for (const solid of retained) expect(unwrap(measureVolume(solid))).toBeCloseTo(1, 8);
        if (live !== null) expect(nativeShapeCount()).toBe(live);
      }
      if (before !== null) expect(nativeShapeCount()).toBe(before);
    }
  );
});

it('uses actual rotated geometry for tight bounds in a caller-named resolved space', () => {
  using solid = cylinder(1, 2);
  const body = unwrap(validateProductBody({ kind: 'AUTHORITATIVE', solids: [solid] }));
  const before = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
  const result = unwrap(
    productBodyBounds(body.solids, {
      kind: 'RESOLVED',
      tag: 'test-container',
      frame: unwrap(rotationFrame(45, [0, 0, 1])),
    })
  );
  expect(result.space).toEqual({ kind: 'RESOLVED', tag: 'test-container' });
  expect(result.bounds.xMin).toBeCloseTo(-1, 6);
  expect(result.bounds.xMax).toBeCloseTo(1, 6);
  expect(result.bounds.yMin).toBeCloseTo(-1, 6);
  expect(result.bounds.yMax).toBeCloseTo(1, 6);
  if (before !== null) expect(nativeShapeCount()).toBe(before);
});

it('rejects malformed JavaScript descriptors and invalid later items without allocating or releasing inputs', () => {
  using solid = box(1, 1, 1);
  const disposed = box(1, 1, 1);
  disposed[Symbol.dispose]();
  const release = vi.spyOn(solid, Symbol.dispose);
  const copy = vi.spyOn(getKernel(), 'copyShape');
  for (const input of [
    null,
    1,
    {},
    { kind: 'EXACT', solids: [solid] },
    { kind: 'PARAMETRIC', solid },
    { kind: 'PARAMETRIC', solids: [] },
  ]) {
    expect(validateProductBody(input)).toMatchObject({
      ok: false,
      error: { operation: 'validateProductBody' },
    });
  }
  for (const item of [null, {}, disposed, solid]) {
    expect(validateProductBody({ kind: 'AUTHORITATIVE', solids: [solid, item] })).toMatchObject({
      ok: false,
      error: { operation: 'validateProductBody', itemIndex: 1 },
    });
  }
  expect(release).not.toHaveBeenCalled();
  expect(copy).not.toHaveBeenCalled();
  expect(unwrap(measureVolume(solid))).toBeCloseTo(1, 8);
});

it.each(['copy', 'transform'] as const)(
  '%s outputs survive disposal of every borrowed input',
  (operation) => {
    const baseline = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
    const solid = box(1, 2, 3);
    const body = unwrap(validateProductBody({ kind: 'AUTHORITATIVE', solids: [solid] }));
    const output = unwrap(
      operation === 'copy' ? copyProductBody(body) : transformProductBody(body, IDENTITY_FRAME)
    );
    expect(disposeProductBody(body)).toEqual({ kind: 'COMPLETE' });
    try {
      expect(output.solids[0].disposed).toBe(false);
      expect(unwrap(measureVolume(output.solids[0]))).toBeCloseTo(6, 8);
    } finally {
      expect(disposeProductBody(output)).toEqual({ kind: 'COMPLETE' });
    }
    if (baseline !== null) expect(nativeShapeCount()).toBe(baseline);
  }
);
