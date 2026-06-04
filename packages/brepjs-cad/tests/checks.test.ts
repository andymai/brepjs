import { describe, it, expect, beforeAll } from 'vitest';
import { init, box, fuse, unwrap } from 'brepjs';
import { runChecks } from '@/verify/checks.js';

beforeAll(async () => {
  await init();
}, 30000);

describe('runChecks', () => {
  it('reports a valid solid with positive volume and bounds', () => {
    const report = runChecks(box(10, 10, 10));
    expect(report.shapeType).toBe('Solid');
    expect(report.measurements.volume).toBeCloseTo(1000, 1);
    expect(report.measurements.bounds?.xMax).toBeCloseTo(10, 3);
    expect(report.checks.find((c) => c.name === 'isValidSolid')?.passed).toBe(true);
    expect(report.checks.find((c) => c.name === 'positiveVolume')?.passed).toBe(true);
  });

  it('computes volume + positiveVolume for a boolean result even when it is a Compound', () => {
    // Booleans/modifiers often return a Compound wrapping one solid; verification must not
    // silently skip volume/positiveVolume for it (would leave `ok` vacuously true).
    const fused = unwrap(fuse(box(10, 10, 10), box(10, 10, 10, { at: [5, 0, 0] })));
    const report = runChecks(fused);
    expect(report.measurements.volume).toBeDefined();
    expect(report.measurements.volume).toBeGreaterThan(0);
    expect(report.checks.some((c) => c.name === 'positiveVolume' && c.passed)).toBe(true);
  });
});
