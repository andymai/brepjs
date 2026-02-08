import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { box, sphere, castShape, exportAssemblySTEP, isOk, unwrap } from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('exportAssemblySTEP', () => {
  it('exports a single shape', () => {
    const b = castShape(box(10, 10, 10).wrapped);
    const result = exportAssemblySTEP([{ shape: b, name: 'box' }]);
    expect(isOk(result)).toBe(true);
    const blob = unwrap(result);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('exports multiple shapes', () => {
    const b = castShape(box(10, 10, 10).wrapped);
    const s = castShape(sphere(5).wrapped);
    const result = exportAssemblySTEP([
      { shape: b, name: 'box' },
      { shape: s, name: 'sphere' },
    ]);
    expect(isOk(result)).toBe(true);
    const blob = unwrap(result);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('exports with unit option', () => {
    const b = castShape(box(10, 10, 10).wrapped);
    const result = exportAssemblySTEP([{ shape: b, name: 'box' }], { unit: 'MM' });
    expect(isOk(result)).toBe(true);
  });
});
