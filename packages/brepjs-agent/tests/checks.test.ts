import { describe, it, expect, beforeAll } from 'vitest';
import { init, box } from 'brepjs';
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
});
