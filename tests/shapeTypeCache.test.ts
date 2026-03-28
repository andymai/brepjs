import { describe, it, expect, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { box } from '@/index.js';
import { getKernel } from '@/kernel/index.js';
import {
  getCachedType,
  setCachedType,
  hasCachedType,
  getOrQueryType,
} from '@/core/shapeTypeCache.js';
import { castShape, castShapeWithKnownType } from '@/core/shapeTypes.js';
import { getShapeKind } from '@/core/typeDiscriminants.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('shapeTypeCache', () => {
  it('returns undefined for uncached shape', () => {
    const b = box(10, 10, 10);
    expect(getCachedType(b.wrapped)).toBeUndefined();
  });

  it('setCachedType stores and getCachedType retrieves', () => {
    const b = box(10, 10, 10);
    setCachedType(b.wrapped, 'solid');
    expect(getCachedType(b.wrapped)).toBe('solid');
  });

  it('hasCachedType returns false then true', () => {
    const b = box(10, 10, 10);
    expect(hasCachedType(b.wrapped)).toBe(false);
    setCachedType(b.wrapped, 'solid');
    expect(hasCachedType(b.wrapped)).toBe(true);
  });

  it('getOrQueryType queries kernel on miss, returns cache on hit', () => {
    const b = box(10, 10, 10);
    const k = getKernel();

    const type1 = getOrQueryType(k, b.wrapped);
    expect(type1).toBe('solid');
    expect(hasCachedType(b.wrapped)).toBe(true);

    const type2 = getOrQueryType(k, b.wrapped);
    expect(type2).toBe('solid');
  });

  it('works for all shape types', () => {
    const b = box(10, 10, 10);
    const k = getKernel();

    const faces = k.iterShapes(b.wrapped, 'face');
    const edges = k.iterShapes(b.wrapped, 'edge');
    const vertices = k.iterShapes(b.wrapped, 'vertex');

    expect(getOrQueryType(k, faces[0])).toBe('face');

    expect(getOrQueryType(k, edges[0])).toBe('edge');

    expect(getOrQueryType(k, vertices[0])).toBe('vertex');
  });
});

describe('integration: castShape populates cache', () => {
  it('castShape populates the type cache', () => {
    const b = box(10, 10, 10);
    const raw = b.wrapped;
    expect(hasCachedType(raw)).toBe(false);
    castShape(raw);
    expect(hasCachedType(raw)).toBe(true);
    expect(getCachedType(raw)).toBe('solid');
  });

  it('castShapeWithKnownType populates the type cache', () => {
    const b = box(10, 10, 10);
    const k = getKernel();
    const faces = k.iterShapes(b.wrapped, 'face');
    const face = faces[0];
    expect(hasCachedType(face)).toBe(false);
    castShapeWithKnownType(face, 'face');
    expect(hasCachedType(face)).toBe(true);
    expect(getCachedType(face)).toBe('face');
  });

  it('getShapeKind uses cache after castShape', () => {
    const b = box(10, 10, 10);
    const solid = castShape(b.wrapped);
    const kind = getShapeKind(solid);
    expect(kind).toBe('solid');
  });
});
