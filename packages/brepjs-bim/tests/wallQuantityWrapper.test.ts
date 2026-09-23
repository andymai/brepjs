import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { getKernel, unwrap } from 'brepjs';
import { bodySolids } from '../src/types/productBody.js';
import { deriveWallQuantities } from '../src/serialize/wallQuantities.js';
import { recipeWallFixture } from './helpers/wallQuantityFixture.js';
import { nativeShapeCount } from './helpers/nativeArena.js';
import { currentKernel, initKernel } from '../../../tests/setup.js';

beforeAll(async () => {
  await initKernel();
}, 30_000);
afterEach(() => vi.restoreAllMocks());

it('rejects a split recipe wrapper before a later child cast can strand native resources', () => {
  const baseline = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
  const { model, localId } = recipeWallFixture();
  const kernel = getKernel();
  const release = kernel.dispose.bind(kernel);
  let leaked: unknown;
  try {
    unwrap(
      model.addDoor({
        wallLocalId: localId,
        width: 200,
        height: 500,
        offsetAlongWall: 800,
        offsetFromFloor: 0,
        materialName: 'Wood',
      })
    );
    const wall = model.getElement(localId);
    if (wall?.category !== 'WALL') throw new Error('Missing Wall');
    const downcast = kernel.downcast.bind(kernel);
    let casts = 0;
    vi.spyOn(kernel, 'downcast').mockImplementation((raw, type): unknown => {
      if (type === 'solid') {
        if (++casts === 2) throw new Error('later child cast');
        const output: unknown = downcast(raw, type);
        leaked = output;
        return output;
      }
      return downcast(raw, type);
    });
    expect(
      deriveWallQuantities({ spec: wall.spec, solids: bodySolids(wall.geometry) })
    ).toMatchObject({ ok: false });
    expect(casts).toBe(0);
  } finally {
    vi.restoreAllMocks();
    model[Symbol.dispose]();
    // Red-phase repair only: the injected later cast prevented cache registration.
    if (leaked !== undefined) release(nativeResource(leaked));
  }
  if (baseline !== null) expect(nativeShapeCount()).toBe(baseline);
});

it.each(['before', 'after'] as const)(
  'attempts every count resource once when fallback cleanup fails %s release',
  (point) => {
    const baseline = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
    const { model, localId } = recipeWallFixture();
    const kernel = getKernel();
    const originalCount = Object.getOwnPropertyDescriptor(kernel, 'subShapeCount');
    const release = kernel.dispose.bind(kernel);
    let recovery: (() => void) | undefined;
    try {
      unwrap(
        model.addDoor({
          wallLocalId: localId,
          width: 200,
          height: 500,
          offsetAlongWall: 800,
          offsetFromFloor: 0,
          materialName: 'Wood',
        })
      );
      const wall = model.getElement(localId);
      if (wall?.category !== 'WALL') throw new Error('Missing Wall');
      const parent = bodySolids(wall.geometry)[0];
      const live = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
      Object.defineProperty(kernel, 'subShapeCount', { value: undefined, configurable: true });
      const iter = kernel.iterShapes.bind(kernel);
      let children: readonly unknown[] = [];
      vi.spyOn(kernel, 'iterShapes').mockImplementation((raw, type): unknown[] => {
        const output = iter(raw, type);
        if (raw === parent.wrapped && type === 'solid') children = output;
        return output;
      });
      const cause = new Error('count cleanup failed');
      const releases = vi.spyOn(kernel, 'dispose').mockImplementation((raw) => {
        if (raw === children[0]) {
          if (point === 'before') recovery = () => release(raw);
          else release(raw);
          throw cause;
        }
        release(raw);
      });
      const result = deriveWallQuantities({ spec: wall.spec, solids: [parent] });
      expect(result).toMatchObject({
        ok: false,
        error: {
          cause: {
            cleanup: {
              kind: 'FAILED',
              diagnostics: [{ operation: 'wallQuantityWrapperCount', itemIndex: 0, cause }],
            },
          },
        },
      });
      expect(children).toHaveLength(2);
      for (const child of children)
        expect(releases.mock.calls.filter(([raw]) => raw === child)).toHaveLength(1);
      expect(parent.disposed).toBe(false);
      expect(kernel.volume(parent.wrapped)).toBeCloseTo(90_000_000, 2);
      if (live !== null) expect(nativeShapeCount()).toBe(live + (point === 'before' ? 1 : 0));
      releases.mockRestore();
    } finally {
      vi.restoreAllMocks();
      if (originalCount === undefined) Reflect.deleteProperty(kernel, 'subShapeCount');
      else Object.defineProperty(kernel, 'subShapeCount', originalCount);
      model[Symbol.dispose]();
      recovery?.();
    }
    if (baseline !== null) expect(nativeShapeCount()).toBe(baseline);
  }
);

it('reclaims the sole child when its native cast fails without releasing the retained parent', () => {
  const baseline = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
  const fixture = recipeWallFixture();
  try {
    fixture.addDoor();
    const wall = fixture.model.getElement(fixture.localId);
    if (wall?.category !== 'WALL') throw new Error('Missing Wall');
    const parent = bodySolids(wall.geometry)[0];
    const live = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
    const kernel = getKernel();
    const downcast = kernel.downcast.bind(kernel);
    let failed: unknown;
    vi.spyOn(kernel, 'downcast').mockImplementation((raw, type): unknown => {
      if (type === 'solid') {
        failed = raw;
        throw new Error('sole child cast');
      }
      return downcast(raw, type);
    });
    const releases = vi.spyOn(kernel, 'dispose');
    expect(deriveWallQuantities({ spec: wall.spec, solids: [parent] })).toMatchObject({
      ok: false,
    });
    expect(failed).toBeDefined();
    expect(releases.mock.calls.filter(([raw]) => raw === failed)).toHaveLength(1);
    expect(parent.disposed).toBe(false);
    expect(kernel.volume(parent.wrapped)).toBeCloseTo(94_000_000, 2);
    if (live !== null) expect(nativeShapeCount()).toBe(live);
  } finally {
    vi.restoreAllMocks();
    fixture.model[Symbol.dispose]();
  }
  if (baseline !== null) expect(nativeShapeCount()).toBe(baseline);
});

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
