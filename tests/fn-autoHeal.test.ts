import { describe, it, expect, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { makeBox, makeSphere, autoHeal, isShapeValid } from '../src/index.js';
import { unwrap } from '../src/core/result.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('autoHeal', () => {
  it('returns valid shape unchanged', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    expect(isShapeValid(box)).toBe(true);

    const result = unwrap(autoHeal(box));
    expect(result.report.isValid).toBe(true);
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
    expect(Array.isArray(result.report.steps)).toBe(true);
  });

  it('returns shape from result', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const result = unwrap(autoHeal(box));

    // Should return a valid shape
    expect(result.shape).toBeDefined();
    expect(isShapeValid(result.shape)).toBe(true);
  });
});
