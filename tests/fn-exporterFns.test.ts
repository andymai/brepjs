import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  makeBox,
  makeSphere,
  // functional API
  castShape,
  exportAssemblySTEP,
  isOk,
  unwrap,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('exportAssemblySTEP', () => {
  it('exports a single shape', () => {
    const box = castShape(makeBox([0, 0, 0], [10, 10, 10]).wrapped);
    const result = exportAssemblySTEP([{ shape: box, name: 'box' }]);
    expect(isOk(result)).toBe(true);
    const blob = unwrap(result);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('exports multiple shapes', () => {
    const box = castShape(makeBox([0, 0, 0], [10, 10, 10]).wrapped);
    const sphere = castShape(makeSphere(5).wrapped);
    const result = exportAssemblySTEP([
      { shape: box, name: 'box' },
      { shape: sphere, name: 'sphere' },
    ]);
    expect(isOk(result)).toBe(true);
    const blob = unwrap(result);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('exports with unit option', () => {
    const box = castShape(makeBox([0, 0, 0], [10, 10, 10]).wrapped);
    const result = exportAssemblySTEP([{ shape: box, name: 'box' }], { unit: 'MM' });
    expect(isOk(result)).toBe(true);
  });
});
