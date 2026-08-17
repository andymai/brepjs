/**
 * Color node — metadata attached at evaluation without contaminating shared
 * cache entries, geometry-preserving relocation, serialization round-trip
 * (CSG_VERSION 4), optimizer recursion, and tree editing.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel, currentKernel } from '../setup.js';
import {
  box,
  color,
  cut,
  translate,
  param,
  optimize,
  outputKindOf,
  toJSON,
  fromJSON,
  replaceNode,
  Evaluator,
  CSG_VERSION,
} from '@/csg/index.js';
import { isOk, unwrap, measureVolume } from '@/index.js';
import { getShapeColor, hasColorMetadata } from '@/topology/metadata/colorFns.js';
import type { AnyShape, Dimension } from '@/core/shapeTypes.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

function vol(s: AnyShape<Dimension>): number {
  return unwrap(measureVolume(s));
}

const itBrep = it.skipIf(currentKernel === 'manifold');

describe('Color node', () => {
  it('preserves the target output kind', () => {
    expect(outputKindOf(color(box(10, 10, 10), '#ff0000'))).toBe('Solid');
  });

  itBrep('attaches shape color at evaluation', () => {
    using ev = new Evaluator();
    const r = ev.evaluate(color(box(10, 10, 10), '#ff0000'));
    expect(isOk(r)).toBe(true);
    expect(getShapeColor(unwrap(r))).toEqual([1, 0, 0, 1]);
    expect(vol(unwrap(r))).toBeCloseTo(1000, 0);
  });

  itBrep('does NOT contaminate the shared cache entry of the plain target', () => {
    using ev = new Evaluator();
    const plain = box(10, 10, 10);
    const colored = ev.evaluate(color(plain, '#00ff00'));
    expect(isOk(colored)).toBe(true);
    // The same target node evaluated bare must come back metadata-free even
    // though the Color evaluation reused its cache entry underneath.
    const bare = ev.evaluate(plain);
    expect(isOk(bare)).toBe(true);
    expect(hasColorMetadata(unwrap(bare))).toBe(false);
    expect(unwrap(bare)).not.toBe(unwrap(colored));
    // And the bare evaluation was a cache hit, not a re-materialization.
    const stats = ev.cacheStats();
    expect(stats.hits).toBeGreaterThan(0);
  });

  itBrep('two colors over one target share the target materialization', () => {
    using ev = new Evaluator();
    const target = cut(box(20, 20, 20), translate(box(10, 10, 30), [5, 5, -5]));
    expect(isOk(ev.evaluate(color(target, '#ff0000'))));
    const s1 = ev.cacheStats();
    const r2 = ev.evaluate(color(target, '#0000ff'));
    expect(isOk(r2)).toBe(true);
    const s2 = ev.cacheStats();
    // Second color: the whole target subtree hits; only the new Color node
    // evaluates (an O(1) relocation, no boolean re-run).
    expect(s2.misses - s1.misses).toBe(1);
    expect(s2.hits - s1.hits).toBe(1);
    expect(getShapeColor(unwrap(r2))).toEqual([0, 0, 1, 1]);
  });

  itBrep('rgba tuple colors round-trip through evaluation', () => {
    using ev = new Evaluator();
    const r = ev.evaluate(color(box(5, 5, 5), [0.2, 0.4, 0.6, 0.5]));
    expect(isOk(r)).toBe(true);
    const c = getShapeColor(unwrap(r));
    expect(c?.[0]).toBeCloseTo(0.2, 5);
    expect(c?.[3]).toBeCloseTo(0.5, 5);
  });

  it('hashes color into the content address', () => {
    const t = box(10, 10, 10);
    expect(color(t, '#ff0000').structuralHash).not.toBe(color(t, '#00ff00').structuralHash);
    expect(color(t, '#ff0000').structuralHash).toBe(
      color(box(10, 10, 10), '#ff0000').structuralHash
    );
  });

  it('serialize round-trip preserves the structural hash', () => {
    for (const node of [
      color(box(param('w'), 10, 10), '#aabbcc'),
      color(box(1, 2, 3), [0.1, 0.2, 0.3, 0.4]),
    ]) {
      const back = fromJSON(toJSON(node));
      expect(isOk(back)).toBe(true);
      expect(unwrap(back).structuralHash).toBe(node.structuralHash);
    }
  });

  it('clamps out-of-range tuple components to canonical RGBA', () => {
    const node = color(box(1, 2, 3), [2, -1, 0.5, 3]);
    expect(node.color).toEqual([1, 0, 0.5, 1]);
    const back = fromJSON(toJSON(node));
    expect(isOk(back)).toBe(true);
    expect(unwrap(back).structuralHash).toBe(node.structuralHash);
  });

  it('canonicalizes non-finite components (malformed hex, NaN tuples)', () => {
    const malformed = color(box(1, 2, 3), '#zz0000');
    expect(malformed.color.every((c) => Number.isFinite(c))).toBe(true);
    expect(isOk(fromJSON(toJSON(malformed)))).toBe(true);
    const nans = color(box(1, 2, 3), [Number.NaN, 0.5, 0, Number.NaN]);
    expect(nans.color).toEqual([0, 0.5, 0, 1]);
    expect(isOk(fromJSON(toJSON(nans)))).toBe(true);
  });

  it('rejects out-of-range RGBA components at the trust boundary', () => {
    const envelope = JSON.parse(JSON.stringify(toJSON(color(box(1, 2, 3), '#ffffff')))) as {
      root: { color: number[] };
    };
    envelope.root.color = [2, 0, 0, 1];
    expect(isOk(fromJSON(envelope))).toBe(false);
    envelope.root.color = [0.5, -0.1, 0, 1];
    expect(isOk(fromJSON(envelope))).toBe(false);
  });

  it('envelope version is 4; versions 1..4 load, 5 rejects', () => {
    expect(CSG_VERSION).toBe(4);
    const envelope = JSON.parse(JSON.stringify(toJSON(box(1, 2, 3)))) as {
      csgVersion: number;
    };
    envelope.csgVersion = 1;
    expect(isOk(fromJSON(envelope))).toBe(true);
    envelope.csgVersion = 5;
    expect(isOk(fromJSON(envelope))).toBe(false);
  });

  it('optimize() recurses into the target', () => {
    const node = color(translate(box(10, 10, 10), [0, 0, 0]), '#ff0000');
    const opt = optimize(node);
    expect(opt.kind).toBe('Color');
    // The identity translate folds away beneath the color.
    expect(opt.structuralHash).toBe(color(box(10, 10, 10), '#ff0000').structuralHash);
  });

  it('replaceNode rebuilds through Color', () => {
    const node = color(box(10, 10, 10), '#ff0000');
    const bigger = replaceNode(node, (n) => n.kind === 'Box', box(20, 20, 20));
    expect(bigger.structuralHash).toBe(color(box(20, 20, 20), '#ff0000').structuralHash);
  });
});
