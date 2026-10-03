import { afterEach, beforeAll, expect, it, vi, type MockInstance } from 'vitest';
import { box, getKernel, ok, translate } from 'brepjs';
import * as brepjs from 'brepjs';
import { cutOpeningSolid } from '../src/elementFns/cutOpeningSolid.js';
import { currentKernel, initKernel } from '../../../tests/setup.js';
import { nativeShapeCount } from './helpers/nativeArena.js';
beforeAll(async () => {
  await initKernel();
}, 30000);
afterEach(() => vi.restoreAllMocks());

it('releases every split child when later child wrapping fails', () => {
  using host = box(10, 2, 2);
  using source = box(2, 4, 4);
  const tool = translate(source, [4, -1, -1]);
  const kernel = getKernel();
  const live = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
  const iterate = kernel.iterShapes.bind(kernel);
  const release = kernel.dispose.bind(kernel);
  const create = brepjs.createSolid;
  const raws: Parameters<typeof kernel.dispose>[0][] = [];
  const children: brepjs.Solid[] = [];
  const releases = vi.spyOn(kernel, 'dispose');
  const cause = new Error('Later child wrapping failed');
  vi.spyOn(kernel, 'iterShapes').mockImplementation((shape, type) => {
    const result: unknown[] = iterate(shape, type);
    if (type === 'solid') raws.push(...result.map(nativeResource));
    return result;
  });
  const wrapping = vi.spyOn(brepjs, 'createSolid').mockImplementation((raw) => {
    if (children.length === 1) throw cause;
    const child = create(raw);
    children.push(child);
    return child;
  });
  try {
    expect(cutOpeningSolid({ host, makeTool: () => ok(tool), hostKind: 'WALL' })).toMatchObject({
      ok: false,
      error: { code: 'WALL_OPENING_BUILD_FAILED', cause },
    });
    expect(wrapping).toHaveBeenCalledTimes(2);
    expect(raws).toHaveLength(2);
    for (const raw of raws)
      expect(releases.mock.calls.filter(([released]) => released === raw)).toHaveLength(1);
    expect(tool.disposed).toBe(true);
    expect(host.disposed).toBe(false);
    expect(kernel.volume(host.wrapped)).toBeCloseTo(40, 8);
    if (live !== null) expect(nativeShapeCount()).toBe(live - 1);
  } finally {
    // Repair only allocations with no release attempt in the failing candidate.
    for (const child of children) if (!child.disposed) child[Symbol.dispose]();
    for (const raw of raws)
      if (!releases.mock.calls.some(([released]) => released === raw)) release(raw);
    vi.restoreAllMocks();
    if (!tool.disposed) tool[Symbol.dispose]();
  }
});

it.each(['before', 'after'] as const)(
  'cancels a cut when child cleanup fails %s release, attempting every owner once',
  (point) => {
    using host = box(10, 10, 10);
    const tool = box(2, 10, 5);
    const live = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
    const toolRelease = vi.spyOn(tool, Symbol.dispose);
    const create = brepjs.createSolid;
    const clone = brepjs.clone;
    const children: MockInstance<() => void>[] = [];
    const outputs: MockInstance<() => void>[] = [];
    let recovery: (() => void) | undefined;
    const cause = new Error('child cleanup failed');
    vi.spyOn(brepjs, 'createSolid').mockImplementation((raw) => {
      const child = create(raw);
      const release = child[Symbol.dispose].bind(child);
      children.push(
        vi.spyOn(child, Symbol.dispose).mockImplementation(() => {
          if (point === 'after') release();
          else recovery = release;
          throw cause;
        })
      );
      return child;
    });
    vi.spyOn(brepjs, 'clone').mockImplementation((...args) => {
      const result = clone(...args);
      if (result.ok) outputs.push(vi.spyOn(result.value, Symbol.dispose));
      return result;
    });
    try {
      expect(cutOpeningSolid({ host, makeTool: () => ok(tool), hostKind: 'WALL' })).toMatchObject({
        ok: false,
        error: {
          code: 'WALL_OPENING_CLEANUP_FAILED',
          metadata: { cleanup: { kind: 'FAILED', diagnostics: [{ cause }] } },
        },
      });
      expect(children).toHaveLength(1);
      expect(outputs).toHaveLength(1);
      for (const release of [...children, ...outputs, toolRelease])
        expect(release).toHaveBeenCalledTimes(1);
      expect(getKernel().volume(host.wrapped)).toBeCloseTo(1000, 6);
      if (live !== null) expect(nativeShapeCount()).toBe(live - 1 + (point === 'before' ? 1 : 0));
    } finally {
      vi.restoreAllMocks();
      recovery?.();
    }
    if (live !== null) expect(nativeShapeCount()).toBe(live - 1);
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
