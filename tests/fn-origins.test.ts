import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  box,
  getFaces,
  getHashCode,
  setShapeOrigin,
  getFaceOrigins,
  translate,
  fuse,
  unwrap,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('setShapeOrigin / getFaceOrigins', () => {
  it('tags all faces of a shape with an origin', () => {
    const b = box(10, 10, 10);
    setShapeOrigin(b, 42);

    const origins = getFaceOrigins(b);
    expect(origins).toBeDefined();
    if (!origins) return; // narrowing for TypeScript

    const faces = getFaces(b);
    expect(faces.length).toBe(6); // box has 6 faces
    for (const f of faces) {
      expect(origins.get(getHashCode(f))).toBe(42);
    }
  });

  it('returns undefined for shapes with no origin set', () => {
    const b = box(10, 10, 10);
    expect(getFaceOrigins(b)).toBeUndefined();
  });

  it('overwrites previous origins', () => {
    const b = box(10, 10, 10);
    setShapeOrigin(b, 1);
    setShapeOrigin(b, 2);

    const origins = getFaceOrigins(b);
    expect(origins).toBeDefined();
    if (!origins) return;
    const faces = getFaces(b);
    for (const f of faces) {
      expect(origins.get(getHashCode(f))).toBe(2);
    }
  });
});

describe('origin propagation through fuse', () => {
  it('propagates origins from both inputs to the fuse result', () => {
    const a = box(10, 10, 10);
    const b = translate(box(10, 10, 10), [10, 0, 0]);
    setShapeOrigin(a, 1);
    setShapeOrigin(b, 2);

    const result = unwrap(fuse(a, b));
    const origins = getFaceOrigins(result);
    expect(origins).toBeDefined();
    if (!origins) return;

    const faces = getFaces(result);
    expect(faces.length).toBeGreaterThan(0);
    const originValues = new Set<number>();
    for (const f of faces) {
      const o = origins.get(getHashCode(f));
      expect(o).toBeDefined();
      originValues.add(o ?? -1);
    }
    expect(originValues.has(1)).toBe(true);
    expect(originValues.has(2)).toBe(true);
  });

  it('preserves origins through chained fuse', () => {
    const a = box(10, 10, 10);
    const b = translate(box(10, 10, 10), [10, 0, 0]);
    const c = translate(box(10, 10, 10), [20, 0, 0]);
    setShapeOrigin(a, 10);
    setShapeOrigin(b, 20);
    setShapeOrigin(c, 30);

    const ab = unwrap(fuse(a, b));
    const abc = unwrap(fuse(ab, c));

    const origins = getFaceOrigins(abc);
    expect(origins).toBeDefined();
    if (!origins) return;

    const originValues = new Set<number>();
    for (const f of getFaces(abc)) {
      originValues.add(origins.get(getHashCode(f)) ?? -1);
    }
    expect(originValues.has(10)).toBe(true);
    expect(originValues.has(20)).toBe(true);
    expect(originValues.has(30)).toBe(true);
  });

  it('result has no origins when inputs have no origins', () => {
    const a = box(10, 10, 10);
    const b = translate(box(10, 10, 10), [10, 0, 0]);
    const result = unwrap(fuse(a, b));
    expect(getFaceOrigins(result)).toBeUndefined();
  });
});
