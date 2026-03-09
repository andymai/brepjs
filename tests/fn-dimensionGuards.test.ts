/**
 * Runtime tests for dimension type guards: is3D, is2D, as3D, as2D.
 *
 * Verifies that the runtime dimension markers correctly classify shapes
 * and that the assertion functions throw on mismatches.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { initOC } from './setup.js';
import {
  is3D,
  is2D,
  as3D,
  as2D,
  box,
  createVertex,
  createEdge,
  getShapeKind,
} from '../src/index.js';
import { getKernel } from '../src/kernel/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('is3D / is2D runtime guards', () => {
  it('classifies a regular 3D shape as 3D', () => {
    const solid = box(10, 10, 10);
    expect(is3D(solid)).toBe(true);
    expect(is2D(solid)).toBe(false);
  });

  it('classifies a vertex as 3D by default', () => {
    const kernel = getKernel();
    const pnt = kernel.makeVertex([0, 0, 0]);
    const v = createVertex(pnt);
    expect(is3D(v)).toBe(true);
    expect(is2D(v)).toBe(false);
  });

  it('classifies a shape with __is2D marker as 2D', () => {
    const kernel = getKernel();
    const pnt = kernel.makeVertex([1, 2, 0]);
    const v = createEdge(pnt);
    // Simulate what a 2D API path would do — set the runtime marker
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing runtime marker
    (v as any).__is2D = true;
    expect(is2D(v)).toBe(true);
    expect(is3D(v)).toBe(false);
  });
});

describe('as3D / as2D assertion functions', () => {
  it('as3D returns the shape when it is 3D', () => {
    const solid = box(5, 5, 5);
    const result = as3D(solid);
    expect(result).toBe(solid);
  });

  it('as3D throws when shape is 2D', () => {
    const kernel = getKernel();
    const pnt = kernel.makeVertex([0, 0, 0]);
    const v = createVertex(pnt);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing runtime marker
    (v as any).__is2D = true;
    expect(() => as3D(v)).toThrow('Expected 3D shape, got 2D');
  });

  it('as2D returns the shape when it is 2D', () => {
    const kernel = getKernel();
    const pnt = kernel.makeVertex([0, 0, 0]);
    const v = createVertex(pnt);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing runtime marker
    (v as any).__is2D = true;
    const result = as2D(v);
    expect(result).toBe(v);
  });

  it('as2D throws when shape is 3D', () => {
    const solid = box(5, 5, 5);
    expect(() => as2D(solid)).toThrow('Expected 2D shape, got 3D');
  });
});

describe('dimension guards preserve shape identity', () => {
  it('as3D does not alter the shape kind', () => {
    const solid = box(10, 10, 10);
    const narrowed = as3D(solid);
    expect(getShapeKind(narrowed)).toBe('solid');
  });
});
