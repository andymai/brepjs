import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  makeBox,
  makeSphere,
  makeCylinder,
  exportSTEP,
  createAssembly,
  isOk,
  isErr,
  unwrap,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('createAssembly', () => {
  it('creates an assembly from a single shape', () => {
    const box = makeBox([10, 10, 10]);
    const assembly = createAssembly([{ shape: box, name: 'box', color: '#ff0000' }]);
    expect(assembly).toBeDefined();
    expect(assembly.wrapped).toBeDefined();
  });

  it('creates an assembly from multiple shapes with colors', () => {
    const box = makeBox([10, 10, 10]);
    const sphere = makeSphere(5);
    const assembly = createAssembly([
      { shape: box, name: 'box', color: '#ff0000', alpha: 1 },
      { shape: sphere, name: 'sphere', color: '#00ff00', alpha: 0.5 },
    ]);
    expect(assembly).toBeDefined();
    expect(assembly.wrapped).toBeDefined();
  });

  it('creates an assembly with default name and color', () => {
    const box = makeBox([5, 5, 5]);
    const assembly = createAssembly([{ shape: box }]);
    expect(assembly).toBeDefined();
  });

  it('creates an empty assembly', () => {
    const assembly = createAssembly([]);
    expect(assembly).toBeDefined();
  });

  it('handles 3-char hex color shorthand', () => {
    const box = makeBox([10, 10, 10]);
    const assembly = createAssembly([{ shape: box, color: '#f00' }]);
    expect(assembly).toBeDefined();
  });
});

describe('exportSTEP', () => {
  it('exports a single shape to STEP format', () => {
    const box = makeBox([10, 10, 10]);
    const result = exportSTEP([{ shape: box, name: 'box', color: '#ff0000' }]);
    expect(isOk(result)).toBe(true);
    const blob = unwrap(result);
    expect(blob).toBeDefined();
    expect(blob.size).toBeGreaterThan(0);
  });

  it('exports multiple shapes to STEP format', () => {
    const box = makeBox([10, 10, 10]);
    const sphere = makeSphere(5);
    const result = exportSTEP([
      { shape: box, name: 'mybox', color: '#ff0000' },
      { shape: sphere, name: 'mysphere', color: '#0000ff' },
    ]);
    expect(isOk(result)).toBe(true);
    const blob = unwrap(result);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('exports with unit option', () => {
    const box = makeBox([10, 10, 10]);
    const result = exportSTEP([{ shape: box, name: 'box', color: '#ff0000' }], { unit: 'MM' });
    expect(isOk(result)).toBe(true);
    const blob = unwrap(result);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('exports with modelUnit option', () => {
    const box = makeBox([10, 10, 10]);
    const result = exportSTEP([{ shape: box, name: 'box', color: '#ff0000' }], { modelUnit: 'CM' });
    expect(isOk(result)).toBe(true);
    const blob = unwrap(result);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('exports with both unit and modelUnit options', () => {
    const box = makeBox([10, 10, 10]);
    const result = exportSTEP([{ shape: box, name: 'box', color: '#ff0000' }], {
      unit: 'INCH',
      modelUnit: 'MM',
    });
    expect(isOk(result)).toBe(true);
    const blob = unwrap(result);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('exports an empty shapes array returns error', () => {
    const result = exportSTEP([]);
    expect(isErr(result)).toBe(true);
  });
});
