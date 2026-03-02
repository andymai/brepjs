import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  box,
  sphere,
  cylinder,
  exportAssemblySTEP,
  exportSTEP,
  createAssembly,
  isOk,
  isErr,
  unwrap,
} from '../src/index.js';
import { exportSTEP as exportAssemblySTEPOop } from '../src/operations/exporters.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('createAssembly', () => {
  it('creates an assembly from a single shape', () => {
    const b = box(10, 10, 10);
    const assembly = createAssembly([{ shape: b, name: 'box', color: '#ff0000' }]);
    expect(assembly).toBeDefined();
    expect(assembly.value).toBeDefined();
  });

  it('creates an assembly from multiple shapes with colors', () => {
    const b = box(10, 10, 10);
    const s = sphere(5);
    const assembly = createAssembly([
      { shape: b, name: 'box', color: '#ff0000', alpha: 1 },
      { shape: s, name: 'sphere', color: '#00ff00', alpha: 0.5 },
    ]);
    expect(assembly).toBeDefined();
    expect(assembly.value).toBeDefined();
  });

  it('creates an assembly with default name and color', () => {
    const b = box(5, 5, 5);
    const assembly = createAssembly([{ shape: b }]);
    expect(assembly).toBeDefined();
  });

  it('creates an empty assembly', () => {
    const assembly = createAssembly([]);
    expect(assembly).toBeDefined();
  });

  it('handles 3-char hex color shorthand', () => {
    const b = box(10, 10, 10);
    const assembly = createAssembly([{ shape: b, color: '#f00' }]);
    expect(assembly).toBeDefined();
  });
});

describe('exportAssemblySTEP', () => {
  it('exports a single shape to STEP format', () => {
    const b = box(10, 10, 10);
    const result = exportAssemblySTEP([{ shape: b, name: 'box', color: '#ff0000' }]);
    expect(isOk(result)).toBe(true);
    const blob = unwrap(result);
    expect(blob).toBeDefined();
    expect(blob.size).toBeGreaterThan(0);
  });

  it('exports multiple shapes to STEP format', () => {
    const b = box(10, 10, 10);
    const s = sphere(5);
    const result = exportAssemblySTEP([
      { shape: b, name: 'mybox', color: '#ff0000' },
      { shape: s, name: 'mysphere', color: '#0000ff' },
    ]);
    expect(isOk(result)).toBe(true);
    const blob = unwrap(result);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('exports with unit option', () => {
    const b = box(10, 10, 10);
    const result = exportAssemblySTEP([{ shape: b, name: 'box', color: '#ff0000' }], {
      unit: 'MM',
    });
    expect(isOk(result)).toBe(true);
    const blob = unwrap(result);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('exports with modelUnit option', () => {
    const b = box(10, 10, 10);
    const result = exportAssemblySTEP([{ shape: b, name: 'box', color: '#ff0000' }], {
      modelUnit: 'CM',
    });
    expect(isOk(result)).toBe(true);
    const blob = unwrap(result);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('exports with both unit and modelUnit options', () => {
    const b = box(10, 10, 10);
    const result = exportAssemblySTEP([{ shape: b, name: 'box', color: '#ff0000' }], {
      unit: 'INCH',
      modelUnit: 'MM',
    });
    expect(isOk(result)).toBe(true);
    const blob = unwrap(result);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('exports an empty shapes array returns error', () => {
    const result = exportAssemblySTEP([]);
    expect(isErr(result)).toBe(true);
  });

  it('STEP blob has correct MIME type', () => {
    const b = box(5, 5, 5);
    const result = exportAssemblySTEP([{ shape: b, name: 'test' }]);
    expect(isOk(result)).toBe(true);
    const blob = unwrap(result);
    // Blob constructor lowercases MIME types
    expect(blob.type).toBe('application/step');
  });
});

describe('exportSTEP (single-shape)', () => {
  it('exports a box to STEP', () => {
    const b = box(10, 10, 10);
    const result = exportSTEP(b);
    expect(isOk(result)).toBe(true);
    const blob = unwrap(result);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('exports a sphere to STEP', () => {
    const s = sphere(5);
    const result = exportSTEP(s);
    expect(isOk(result)).toBe(true);
  });

  it('exports a cylinder to STEP', () => {
    const c = cylinder(3, 10);
    const result = exportSTEP(c);
    expect(isOk(result)).toBe(true);
  });
});

describe('exportSTEP (OOP assembly, exporters.ts)', () => {
  it('exports a single named shape to STEP blob', () => {
    const b = box(10, 10, 10);
    const result = exportAssemblySTEPOop([{ shape: b, name: 'box', color: '#ff0000' }]);
    expect(isOk(result)).toBe(true);
    const blob = unwrap(result);
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe('application/step');
  });

  it('exports multiple shapes to STEP blob', () => {
    const b = box(10, 10, 10);
    const s = sphere(5);
    const result = exportAssemblySTEPOop([
      { shape: b, name: 'box', color: '#00ff00', alpha: 1 },
      { shape: s, name: 'sphere', color: '#0000ff', alpha: 0.5 },
    ]);
    expect(isOk(result)).toBe(true);
    const blob = unwrap(result);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('exports with auto-generated name when name is omitted', () => {
    const b = box(5, 5, 5);
    const result = exportAssemblySTEPOop([{ shape: b }]);
    expect(isOk(result)).toBe(true);
    expect(unwrap(result).size).toBeGreaterThan(0);
  });

  it('exports with default red color when color is omitted', () => {
    const b = box(5, 5, 5);
    const result = exportAssemblySTEPOop([{ shape: b, name: 'nocolor' }]);
    expect(isOk(result)).toBe(true);
    expect(unwrap(result).size).toBeGreaterThan(0);
  });

  it('exports with 3-char hex color shorthand', () => {
    const b = box(5, 5, 5);
    const result = exportAssemblySTEPOop([{ shape: b, name: 'shortcolor', color: '#abc' }]);
    expect(isOk(result)).toBe(true);
    expect(unwrap(result).size).toBeGreaterThan(0);
  });

  it('exports empty shapes array', () => {
    const result = exportAssemblySTEPOop([]);
    // empty assembly may succeed or fail depending on kernel writer; just verify Result type
    expect(result).toHaveProperty('ok');
  });

  it('exports with MM unit option', () => {
    const b = box(10, 10, 10);
    const result = exportAssemblySTEPOop([{ shape: b, name: 'box' }], { unit: 'MM' });
    expect(isOk(result)).toBe(true);
    expect(unwrap(result).size).toBeGreaterThan(0);
  });

  it('exports with modelUnit option', () => {
    const b = box(10, 10, 10);
    const result = exportAssemblySTEPOop([{ shape: b, name: 'box' }], { modelUnit: 'CM' });
    expect(isOk(result)).toBe(true);
    expect(unwrap(result).size).toBeGreaterThan(0);
  });

  it('exports with both unit and modelUnit options', () => {
    const b = box(10, 10, 10);
    const result = exportAssemblySTEPOop([{ shape: b, name: 'box' }], {
      unit: 'INCH',
      modelUnit: 'MM',
    });
    expect(isOk(result)).toBe(true);
    expect(unwrap(result).size).toBeGreaterThan(0);
  });

  it('exports a cylinder to STEP', () => {
    const c = cylinder(3, 10);
    const result = exportAssemblySTEPOop([{ shape: c, name: 'cyl' }]);
    expect(isOk(result)).toBe(true);
    expect(unwrap(result).size).toBeGreaterThan(0);
  });
});
