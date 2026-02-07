import { describe, it, expect, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { makeBox, makeSphere, autoHeal, isShapeValid } from '../src/index.js';
import { unwrap } from '../src/core/result.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('autoHeal', () => {
  it('returns valid shape unchanged with alreadyValid: true', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    expect(isShapeValid(box)).toBe(true);

    const result = unwrap(autoHeal(box));
    expect(result.report.isValid).toBe(true);
    expect(result.report.alreadyValid).toBe(true);
    expect(result.report.steps).toContain('Shape already valid');
    expect(result.report.wiresHealed).toBe(0);
    expect(result.report.facesHealed).toBe(0);
    expect(result.report.solidHealed).toBe(false);
  });

  it('returns valid sphere unchanged', () => {
    const sphere = makeSphere(5);
    expect(isShapeValid(sphere)).toBe(true);

    const result = unwrap(autoHeal(sphere));
    expect(result.report.isValid).toBe(true);
    expect(result.report.steps).toContain('Shape already valid');
  });

  it('report has expected structure', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const result = unwrap(autoHeal(box));

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
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const result = unwrap(autoHeal(box));

    // Should return a valid shape
    expect(result.shape).toBeDefined();
    expect(isShapeValid(result.shape)).toBe(true);
  });

  it('diagnostics contain validation entry for valid shape', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const result = unwrap(autoHeal(box));

    const validationDiag = result.report.diagnostics.find((d) => d.name === 'validation');
    expect(validationDiag).toBeDefined();
    expect(validationDiag!.attempted).toBe(true);
    expect(validationDiag!.succeeded).toBe(true);
  });

  it('accepts options with fixWires disabled', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const result = unwrap(autoHeal(box, { fixWires: false }));
    expect(result.report.isValid).toBe(true);
  });

  it('accepts options with fixFaces disabled', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const result = unwrap(autoHeal(box, { fixFaces: false }));
    expect(result.report.isValid).toBe(true);
  });

  it('accepts options with fixSolids disabled', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const result = unwrap(autoHeal(box, { fixSolids: false }));
    expect(result.report.isValid).toBe(true);
  });

  it('accepts options with sewTolerance', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const result = unwrap(autoHeal(box, { sewTolerance: 0.01 }));
    // Valid shapes short-circuit before sewing is applied
    expect(result.report.isValid).toBe(true);
  });

  it('accepts fixSelfIntersection option', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const result = unwrap(autoHeal(box, { fixSelfIntersection: true }));
    // Valid shapes short-circuit
    expect(result.report.isValid).toBe(true);
  });
});
