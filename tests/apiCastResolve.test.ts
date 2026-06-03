/**
 * Coverage for the thin public helpers resolve3D (Shapeable→Shape3D) and
 * castShape3D (raw kernel shape→branded AnyShape). Neither is exercised by
 * existing suites beyond the export-name check in public-api-types.test.ts.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { box, resolve3D, castShape3D, isSolid } from '@/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('resolve3D', () => {
  it('returns the underlying Shape3D for a raw solid handle', () => {
    const solid = box(2, 3, 4);
    const resolved = resolve3D(solid);
    expect(isSolid(resolved)).toBe(true);
  });
});

describe('castShape3D', () => {
  it('brands a raw kernel shape back into a Solid handle', () => {
    const solid = box(2, 3, 4);
    const cast = castShape3D(solid.wrapped);
    expect(isSolid(cast)).toBe(true);
  });
});
