import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { box, getKernel } from 'brepjs';
import { productBodyBounds } from '../src/types/productBody.js';
import { IDENTITY_FRAME } from '../src/placementFrame.js';
import { currentKernel, initKernel } from '../../../tests/setup.js';
import { nativeShapeCount } from './helpers/nativeArena.js';

beforeAll(async () => {
  await initKernel();
}, 30_000);
afterEach(() => vi.restoreAllMocks());

it.each([
  ['null', null],
  ['missing kind', {}],
  ['unsupported kind', { kind: 'WORLD' }],
  ['missing tag', { kind: 'RESOLVED', frame: IDENTITY_FRAME }],
  ['non-string tag', { kind: 'RESOLVED', tag: 42, frame: IDENTITY_FRAME }],
  [
    'throwing descriptor',
    {
      get kind() {
        throw new Error('Unreadable space');
      },
    },
  ],
])('rejects an invalid bounds space before native work: %s', (_, space) => {
  using solid = box(1, 2, 3);
  const baseline = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
  const kernel = getKernel();
  const shapeType = vi.spyOn(kernel, 'shapeType');
  const locate = vi.spyOn(kernel, 'locate');
  const release = vi.spyOn(solid, Symbol.dispose);
  const result: unknown = Reflect.apply(productBodyBounds, undefined, [
    { kind: 'AUTHORITATIVE', solids: [solid] },
    space,
  ]);
  expect(result).toMatchObject({
    ok: false,
    error: { operation: 'productBodyBounds', code: 'BODY_INVALID_SPACE' },
  });
  expect(shapeType).not.toHaveBeenCalled();
  expect(locate).not.toHaveBeenCalled();
  expect(release).not.toHaveBeenCalled();
  if (baseline !== null) expect(nativeShapeCount()).toBe(baseline);
});
