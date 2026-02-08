import { describe, it, expect, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { box, sphere, autoHeal, isValid, unwrap } from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('autoHeal', () => {
  it('returns valid shape unchanged with alreadyValid: true', () => {
    const b = box(10, 10, 10);
    expect(isValid(b)).toBe(true);

    const result = unwrap(autoHeal(b));
    expect(result.report.isValid).toBe(true);
    expect(result.report.alreadyValid).toBe(true);
    expect(result.report.steps).toContain('Shape already valid');
    expect(result.report.wiresHealed).toBe(0);
    expect(result.report.facesHealed).toBe(0);
    expect(result.report.solidHealed).toBe(false);
  });

  it('returns valid sphere unchanged', () => {
    const s = sphere(5);
    expect(isValid(s)).toBe(true);

    const result = unwrap(autoHeal(s));
    expect(result.report.isValid).toBe(true);
    expect(result.report.steps).toContain('Shape already valid');
  });

  it('report has expected structure', () => {
    const b = box(10, 10, 10);
    const result = unwrap(autoHeal(b));

    expect(result.report).toHaveProperty('isValid');
    expect(result.report).toHaveProperty('wiresHealed');
    expect(result.report).toHaveProperty('facesHealed');
    expect(result.report).toHaveProperty('solidHealed');
    expect(result.report).toHaveProperty('steps');
    expect(result.report).toHaveProperty('diagnostics');
    expect(Array.isArray(result.report.steps)).toBe(true);
    expect(Array.isArray(result.report.diagnostics)).toBe(true);
  });

  it('returns shape from result', () => {
    const b = box(10, 10, 10);
    const result = unwrap(autoHeal(b));

    // Should return a valid shape
    expect(result.shape).toBeDefined();
    expect(isValid(result.shape)).toBe(true);
  });

  it('diagnostics contain validation entry for valid shape', () => {
    const b = box(10, 10, 10);
    const result = unwrap(autoHeal(b));

    const validationDiag = result.report.diagnostics.find((d) => d.name === 'validation');
    expect(validationDiag).toBeDefined();
    expect(validationDiag!.attempted).toBe(true);
    expect(validationDiag!.succeeded).toBe(true);
  });

  it('accepts options with fixWires disabled', () => {
    const b = box(10, 10, 10);
    const result = unwrap(autoHeal(b, { fixWires: false }));
    expect(result.report.isValid).toBe(true);
  });

  it('accepts options with fixFaces disabled', () => {
    const b = box(10, 10, 10);
    const result = unwrap(autoHeal(b, { fixFaces: false }));
    expect(result.report.isValid).toBe(true);
  });

  it('accepts options with fixSolids disabled', () => {
    const b = box(10, 10, 10);
    const result = unwrap(autoHeal(b, { fixSolids: false }));
    expect(result.report.isValid).toBe(true);
  });

  it('accepts options with sewTolerance', () => {
    const b = box(10, 10, 10);
    const result = unwrap(autoHeal(b, { sewTolerance: 0.01 }));
    // Valid shapes short-circuit before sewing is applied
    expect(result.report.isValid).toBe(true);
  });

  it('accepts fixSelfIntersection option', () => {
    const b = box(10, 10, 10);
    const result = unwrap(autoHeal(b, { fixSelfIntersection: true }));
    // Valid shapes short-circuit
    expect(result.report.isValid).toBe(true);
  });
});
