import { describe, it, expect } from 'vitest';
import { checkAuto, formatScorecard, type EvalResult } from '../bench/score.js';
import { emptyReport, type VerifyReport } from '../src/verify/report.js';

function validReport(over: Partial<VerifyReport['measurements']> = {}): VerifyReport {
  const r = emptyReport();
  r.shapeType = 'Solid';
  r.checks = [
    { name: 'isValidSolid', passed: true },
    { name: 'positiveVolume', passed: true },
  ];
  r.measurements = { volume: 1000, area: 600, ...over };
  return r;
}

describe('checkAuto', () => {
  it('passes a valid report with no pinned dims', () => {
    expect(checkAuto(validReport(), undefined).pass).toBe(true);
  });

  it('fails when the report is not ok and surfaces the errors', () => {
    const r = emptyReport();
    r.checks = [{ name: 'isValidSolid', passed: false }];
    r.errors = ['part returned Err: BOOLEAN_HAS_ERRORS'];
    const res = checkAuto(r, undefined);
    expect(res.pass).toBe(false);
    expect(res.failures.join(' ')).toContain('valid');
    expect(res.failures.join(' ')).toContain('BOOLEAN_HAS_ERRORS');
  });

  it('passes pinned volume within tolerance and fails outside it', () => {
    expect(checkAuto(validReport({ volume: 1004 }), { volume: 1000, tolerancePct: 1 }).pass).toBe(true);
    const bad = checkAuto(validReport({ volume: 1100 }), { volume: 1000, tolerancePct: 1 });
    expect(bad.pass).toBe(false);
    expect(bad.failures.join(' ')).toContain('volume');
  });

  it('checks pinned bounds per axis with a span-relative tolerance', () => {
    const bounds = { xMin: 0, xMax: 40, yMin: 0, yMax: 30, zMin: 0, zMax: 20 };
    expect(checkAuto(validReport({ bounds }), { bounds: { x: [0, 40], z: [0, 20] }, tolerancePct: 1 }).pass).toBe(true);
    const off = checkAuto(validReport({ bounds }), { bounds: { x: [0, 50] }, tolerancePct: 1 });
    expect(off.pass).toBe(false);
    expect(off.failures.join(' ')).toContain('bounds.x');
  });
});

describe('formatScorecard', () => {
  it('renders per-category and total tallies with the version stamp', () => {
    const results: EvalResult[] = [
      { id: 'a', category: 'primitive', auto: { pass: true, failures: [] }, judgePass: true },
      { id: 'b', category: 'primitive', auto: { pass: true, failures: [] }, judgePass: false, judgeReason: 'no bore' },
      { id: 'c', category: 'boolean', auto: { pass: false, failures: ['not a valid part (ok=false)'] } },
    ];
    const out = formatScorecard({ model: 'claude-opus-4-8', brepjsVersion: '18.60.0', date: '2026-06-04', results });
    expect(out).toContain('brepjs=18.60.0');
    expect(out).toContain('model=claude-opus-4-8');
    expect(out).toContain('TOTAL');
    expect(out).toContain('primitive');
    // 2/3 valid overall, 1/3 judged matching, 1/3 both.
    expect(out).toMatch(/TOTAL\s+valid 67%\s+judge 33%\s+both 33%/);
  });
});
