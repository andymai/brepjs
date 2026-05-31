import { describe, it, expect } from 'vitest';
import { emptyReport, serializeReport, type VerifyReport } from '@/verify/report.js';

type SerializedReport = VerifyReport & { ok: boolean };

describe('VerifyReport', () => {
  it('serializes a report to stable JSON with ok=true', () => {
    const r = emptyReport();
    r.shapeType = 'Solid';
    r.checks.push({ name: 'isValidSolid', passed: true });
    r.measurements.volume = 1000;
    const json = JSON.parse(serializeReport(r)) as SerializedReport;
    expect(json.ok).toBe(true);
    expect(json.measurements.volume).toBe(1000);
    expect(json.checks[0]).toEqual({ name: 'isValidSolid', passed: true });
  });

  it('ok is false when any check failed', () => {
    const r = emptyReport();
    r.checks.push({ name: 'isValidSolid', passed: false, detail: 'BRepCheck failed' });
    expect((JSON.parse(serializeReport(r)) as SerializedReport).ok).toBe(false);
  });

  it('ok is false when there are errors', () => {
    const r = emptyReport();
    r.errors.push('part threw');
    expect((JSON.parse(serializeReport(r)) as SerializedReport).ok).toBe(false);
  });
});
