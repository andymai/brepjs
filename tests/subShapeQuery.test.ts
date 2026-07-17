/**
 * Handle-free sub-shape count/hash queries. `subShapeCount`/`subShapeHashes` use
 * the native occt-wasm 3.7.0 primitives when present and an iterate-and-release
 * fallback otherwise; both must agree with the handle-based results and with
 * `hashCode` at HASH_CODE_MAX. Runs on every kernel project to cover both paths.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { box, cylinder, cut, translate } from '@/index.js';
import { getFaces, getEdges, getVertices } from '@/topology/topologyQueryFns.js';
import { subShapeCount, subShapeHashes } from '@/topology/topologyQueryFns.js';
import { getKernel } from '@/kernel/index.js';
import { HASH_CODE_MAX } from '@/core/constants.js';
import { unwrap, isOk } from '@/core/result.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

function handleHashes(shape: Parameters<typeof getFaces>[0], type: 'face' | 'edge' | 'vertex') {
  const kernel = getKernel();
  const get = type === 'face' ? getFaces : type === 'edge' ? getEdges : getVertices;
  return new Set(get(shape).map((s) => kernel.hashCode(s.wrapped, HASH_CODE_MAX)));
}

describe('subShapeCount / subShapeHashes', () => {
  it('counts match the handle-based extraction (box)', () => {
    using b = box(10, 10, 10, { centered: true });
    expect(subShapeCount(b, 'face')).toBe(getFaces(b).length);
    expect(subShapeCount(b, 'edge')).toBe(getEdges(b).length);
    expect(subShapeCount(b, 'vertex')).toBe(getVertices(b).length);
    expect(subShapeCount(b, 'face')).toBe(6);
    expect(subShapeCount(b, 'edge')).toBe(12);
    expect(subShapeCount(b, 'vertex')).toBe(8);
  });

  it('hashes are deduplicated and agree with hashCode(_, HASH_CODE_MAX)', () => {
    using b = box(10, 10, 10, { centered: true });
    for (const type of ['face', 'edge', 'vertex'] as const) {
      const hashes = subShapeHashes(b, type);
      expect(new Set(hashes).size).toBe(hashes.length); // deduplicated
      expect(new Set(hashes)).toEqual(handleHashes(b, type));
    }
  });

  it('agree on a curved and a boolean result', () => {
    using c = cylinder(5, 10);
    expect(subShapeCount(c, 'face')).toBe(getFaces(c).length);
    expect(new Set(subShapeHashes(c, 'face'))).toEqual(handleHashes(c, 'face'));

    using a = box(10, 10, 10);
    using t0 = cylinder(3, 20, { centered: true });
    using t = translate(t0, [2, 2, 0]);
    const r = cut(a, t);
    expect(isOk(r)).toBe(true); // fail loudly rather than skip the boolean case
    using s = unwrap(r);
    expect(subShapeCount(s, 'edge')).toBe(getEdges(s).length);
    expect(new Set(subShapeHashes(s, 'edge'))).toEqual(handleHashes(s, 'edge'));
  });
});
