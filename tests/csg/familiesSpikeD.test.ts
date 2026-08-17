/**
 * Spike D — identity beside content addressing.
 *
 * Falsifiable checks (on the Spike E prototype):
 *  1. Two identical walls materialize ONE solid: the byKeyPath results hold the
 *     SAME kernel handle, and the second wall adds zero cache misses.
 *  2. The two walls carry distinct, deterministic, well-formed IFC GlobalIds
 *     derived from their key paths (deriveIfcGuidSync is the primitive).
 *  3. Per-element pset records stay distinct while the geometry hash is shared.
 *  4. The key path never enters the geometry cache key (onStep-observed keys
 *     contain no identity fragments; the second wall creates no new keys).
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from '../setup.js';
import { Evaluator, type StepInfo } from '@/csg/index.js';
import { isOk } from '@/index.js';
import {
  family,
  el,
  resolve,
  evaluateModel,
  type Element,
  type ResolvedElement,
} from './familiesSpike.js';
import { deriveIfcGuidSync } from '../../packages/brepjs-bim/src/identity/guidDerivation.js';
import { isValidIfcGuid } from '../../packages/brepjs-bim/src/identity/ifcGuid.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

interface WallProps {
  readonly length: number;
  readonly height: number;
  readonly thickness: number;
  readonly psets?: Readonly<Record<string, Readonly<Record<string, unknown>>>> | undefined;
}

const Wall = family<WallProps>('Wall', (p) =>
  el('Box', { size: [p.length, p.thickness, p.height] })
);

const Storey = family<{ readonly walls: readonly Element[] }>('Storey', (p) =>
  el('Group', {}, p.walls)
);

function buildStorey(): ResolvedElement {
  const dims = { length: 400, height: 270, thickness: 20 };
  return resolve(
    Storey({
      key: 'storey-1',
      walls: [
        Wall({ key: 'w1', ...dims, psets: { Pset_WallCommon: { FireRating: '60' } } }),
        Wall({ key: 'w2', ...dims, psets: { Pset_WallCommon: { FireRating: '90' } } }),
      ],
    })
  );
}

describe('Spike D — identity beside content addressing', () => {
  it('identical recipes share one structural hash; key paths differ', () => {
    const storey = buildStorey();
    const [w1, w2] = storey.children;
    expect(w1?.geometry.structuralHash).toBe(w2?.geometry.structuralHash);
    expect(w1?.keyPath).toBe('storey-1/w1');
    expect(w2?.keyPath).toBe('storey-1/w2');
  });

  it('two identical walls materialize ONE solid (same handle, zero extra misses)', () => {
    using ev = new Evaluator();
    const storey = buildStorey();
    const byKeyPath = evaluateModel(storey, ev);
    const r1 = byKeyPath.get('storey-1/w1');
    const r2 = byKeyPath.get('storey-1/w2');
    expect(r1 && isOk(r1)).toBe(true);
    expect(r2 && isOk(r2)).toBe(true);
    if (r1 && r2 && isOk(r1) && isOk(r2)) {
      expect(r1.value).toBe(r2.value);
    }
    // Whole model: the container is identity-only (Empty geometry, skipped);
    // one wall Box materializes = 1 miss; the second wall = 1 pure hit.
    const stats = ev.cacheStats();
    expect(stats.misses).toBe(1);
    expect(stats.hits).toBe(1);
    expect(stats.entries).toBe(1);
  });

  it('key paths derive distinct, deterministic, well-formed GlobalIds', () => {
    const g1 = deriveIfcGuidSync('storey-1/w1');
    const g2 = deriveIfcGuidSync('storey-1/w2');
    expect(g1).not.toBe(g2);
    expect(deriveIfcGuidSync('storey-1/w1')).toBe(g1);
    expect(isValidIfcGuid(g1)).toBe(true);
    expect(isValidIfcGuid(g2)).toBe(true);
  });

  it('pset records stay distinct beside deduped geometry', () => {
    const storey = buildStorey();
    const [w1, w2] = storey.children;
    expect(w1?.attributes['psets']).toEqual({ Pset_WallCommon: { FireRating: '60' } });
    expect(w2?.attributes['psets']).toEqual({ Pset_WallCommon: { FireRating: '90' } });
    // Identity data must not perturb the content address.
    expect(w1?.geometry.structuralHash).toBe(w2?.geometry.structuralHash);
  });

  it('the key path never enters the geometry cache key', () => {
    const steps: StepInfo[] = [];
    using ev = new Evaluator({ onStep: (s) => steps.push(s) });
    const storey = buildStorey();
    evaluateModel(storey, ev);
    expect(steps.length).toBeGreaterThan(0);
    for (const s of steps) {
      expect(s.cacheKey).not.toMatch(/storey|w1|w2/);
    }
    // Two distinct key paths, ONE cache key: the second wall re-used the first
    // wall's entry outright.
    const keys = new Set(steps.map((s) => s.cacheKey));
    expect(keys.size).toBe(1);
    expect(steps).toHaveLength(2);
  });
});
