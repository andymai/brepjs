import { describe, it, expect } from 'vitest';
import {
  buildHints,
  emptyReport,
  hintFor,
  pushError,
  serializeReport,
  VALIDITY_FAILURE_CODE,
  type VerifyReport,
} from '@/verify/report.js';
import { classifyKernelMessage } from '@/verify/runPart.js';

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

  it('serializes hints into the stdout JSON contract', () => {
    const r = emptyReport();
    pushError(r, { message: 'exportSTEP: kernel crashed', code: 'STEP_EXPORT_CRASHED' });
    r.hints = buildHints(r);
    const json = JSON.parse(serializeReport(r)) as SerializedReport;
    expect(Array.isArray(json.hints)).toBe(true);
    expect(json.hints[0]?.code).toBe('STEP_EXPORT_CRASHED');
  });
});

describe('hints', () => {
  it('produces an actionable STEP_EXPORT_CRASHED hint (export-crash path)', () => {
    const hint = hintFor({ message: 'exportSTEP: boom', code: 'STEP_EXPORT_CRASHED' });
    expect(hint).not.toBeNull();
    expect(hint?.code).toBe('STEP_EXPORT_CRASHED');
    expect(hint?.fix.length).toBeGreaterThan(0);
    expect(hint?.nextStep.length).toBeGreaterThan(0);
  });

  it('fires for each table key with a non-empty fix and next step', () => {
    const codes = [
      'FILLET_NO_EDGES',
      'INVALID_FILLET_RADIUS',
      'FILLET_NOT_3D',
      'STEP_EXPORT_CRASHED',
      'LOFT_FAILED',
      'BOOLEAN_HAS_ERRORS',
      VALIDITY_FAILURE_CODE,
    ];
    for (const code of codes) {
      const hint = hintFor({ message: `${code}: x`, code });
      expect(hint, code).not.toBeNull();
      expect(hint?.fix, code).not.toBe('');
      expect(hint?.nextStep, code).not.toBe('');
    }
  });

  it('gives EXTRUDE_ZERO_VECTOR a specific hint, not the generic fallback', () => {
    // The sketch `.extrude(0)` path raises EXTRUDE_ZERO_VECTOR. The verify-heal cycle found it had
    // no HINT_TABLE entry, so it got the useless "No specific fix available" fallback. This guards
    // the heal: a real, extrude-specific fix.
    const hint = hintFor({
      message: 'EXTRUDE_ZERO_VECTOR: extrude: extrusion vector has zero length',
      code: 'EXTRUDE_ZERO_VECTOR',
    });
    expect(hint?.fix).not.toMatch(/No specific fix available/);
    expect(hint?.fix).toMatch(/extrude/i);
  });

  it('classifyKernelMessage maps the codeless makeLineEdge crash to DEGENERATE_EDGE', () => {
    expect(classifyKernelMessage('part threw: makeLineEdge: construction failed')).toBe(
      'DEGENERATE_EDGE'
    );
    expect(classifyKernelMessage('part threw: some unrelated kernel error')).toBeUndefined();
  });

  it('gives DEGENERATE_EDGE a dedupe hint (codeless makeLineEdge crash)', () => {
    // A polygon with coincident consecutive points throws `makeLineEdge: construction failed` with
    // no structured code; the verify-heal cycle classifies it to DEGENERATE_EDGE so the author gets
    // an actionable dedupe fix instead of a raw kernel string. Guards that heal.
    const hint = hintFor({
      message: 'part threw: makeLineEdge: construction failed',
      code: 'DEGENERATE_EDGE',
    });
    expect(hint?.fix).not.toMatch(/No specific fix available/);
    expect(hint?.fix).toMatch(/coincident|dedupe|duplicate/i);
  });

  it('falls back to the public BrepError.suggestion for unknown codes', () => {
    const hint = hintFor({
      message: 'something: failed',
      code: 'SOME_UNKNOWN_CODE',
      suggestion: 'try the public suggestion',
    });
    expect(hint?.fix).toBe('try the public suggestion');
    expect(hint?.nextStep.length).toBeGreaterThan(0);
  });

  it('emits no hint when an error carries no code', () => {
    expect(hintFor({ message: 'part threw: boom' })).toBeNull();
  });

  it('deduplicates identical code+message hints', () => {
    const r = emptyReport();
    pushError(r, { message: 'exportSTEP: boom', code: 'STEP_EXPORT_CRASHED' });
    pushError(r, { message: 'exportSTEP: boom', code: 'STEP_EXPORT_CRASHED' });
    expect(buildHints(r)).toHaveLength(1);
  });
});
