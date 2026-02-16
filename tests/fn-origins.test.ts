import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { box, getFaces, getHashCode, setShapeOrigin, getFaceOrigins } from '../src/index.js';

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
