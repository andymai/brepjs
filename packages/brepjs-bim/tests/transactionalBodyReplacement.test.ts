import type { WallSpec } from '../src/specs/wallSpec.js';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { box, unwrap } from 'brepjs';
import { BimModel } from '../src/model/bimModel.js';
import { bodySolids } from '../src/types/productBody.js';
import { currentKernel, initKernel } from '../../../tests/setup.js';
import { nativeShapeCount } from './helpers/nativeArena.js';

beforeAll(async () => {
  await initKernel();
}, 30000);
afterEach(() => vi.restoreAllMocks());
const WALL: WallSpec = {
  length: 10,
  height: 6,
  thickness: 1,
  origin: [0, 0, 0],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  materialName: 'Brick',
};

it.each(['before', 'after'] as const)(
  'commits AUTHORITATIVE takeover despite retirement failure %s native release',
  (point) => {
    const baseline = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
    const model = new BimModel();
    const id = unwrap(model.addWall(WALL));
    const element = model.getElement(id);
    if (element?.category !== 'WALL') throw new Error('Missing Wall');
    const old = bodySolids(element.geometry)[0];
    const release = old[Symbol.dispose].bind(old);
    const cause = new Error('retirement failed');
    const next = box(2, 2, 2);
    const nextRelease = vi.spyOn(next, Symbol.dispose);
    let callbackRead: unknown;
    let reentrant: unknown;
    let metadataMutation: unknown;
    let specReads = 0;
    let recovery = false;
    const attempt = vi.spyOn(old, Symbol.dispose).mockImplementation(() => {
      callbackRead = model.getElement(id)?.geometry;
      reentrant = model.addWall({
        ...WALL,
        get length() {
          specReads++;
          return 1;
        },
      });
      try {
        model.setSurfaceStyle(id, { name: 'late', r: 1, g: 0, b: 0 });
      } catch (error) {
        metadataMutation = error;
      }
      if (point === 'after') release();
      else recovery = true;
      throw cause;
    });
    try {
      expect(
        model.replaceProductBody({ localId: id, body: { kind: 'AUTHORITATIVE', solids: [next] } })
      ).toMatchObject({
        ok: true,
        value: { kind: 'COMMITTED', localId: id, cleanup: { kind: 'FAILED' } },
      });
      expect(callbackRead).toBe(model.getElement(id)?.geometry);
      expect(callbackRead).toMatchObject({ kind: 'AUTHORITATIVE', solids: [next] });
      expect(reentrant).toMatchObject({ ok: false, error: { code: 'MODEL_BUSY' } });
      expect(metadataMutation).toMatchObject({ cause: { code: 'MODEL_BUSY' } });
      expect(specReads).toBe(0);
      expect(model.getSurfaceStyle(id)).toBeNull();
      expect(model.isRecipeQuantityEligible(id)).toBe(false);
      expect(model.getGeometryCleanupDiagnostics()).toMatchObject([
        { operation: 'replaceProductBody', localId: id, itemIndex: 0, cause },
      ]);
      if (point === 'before')
        expect(model.addProxy({ name: 'uncertain alias', solid: old })).toMatchObject({
          ok: false,
          error: { code: 'BODY_OWNERSHIP_CONFLICT', metadata: { ownerState: 'UNCERTAIN' } },
        });
      expect(nextRelease).not.toHaveBeenCalled();
      model[Symbol.dispose]();
      model[Symbol.dispose]();
      expect(attempt).toHaveBeenCalledTimes(1);
      expect(nextRelease).toHaveBeenCalledTimes(1);
      if (baseline !== null)
        expect(nativeShapeCount()).toBe(baseline + (point === 'before' ? 1 : 0));
    } finally {
      vi.restoreAllMocks();
      // Fixture repairs only the known injected unreleased resource, after production no-retry assertions.
      if (recovery) release();
      try {
        model[Symbol.dispose]();
      } catch {
        /* Red candidate can throw during retirement. */
      }
      if (!next.disposed) next[Symbol.dispose]();
    }
    if (baseline !== null) expect(nativeShapeCount()).toBe(baseline);
  }
);
