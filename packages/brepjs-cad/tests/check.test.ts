import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { runPart } from '@/verify/runPart.js';
import { reportOk } from '@/verify/report.js';
import { TYPECHECK_CODE } from '@/verify/typecheck.js';

const fix = (n: string) => fileURLToPath(new URL(`./fixtures/${n}`, import.meta.url));

describe('runPart --check (typecheck pre-pass)', () => {
  it('skips execution and reports a TYPECHECK error for a type-wrong part', async () => {
    const { report, shape } = await runPart(fix('typeWrong.brep.ts'), { check: true });
    expect(shape).toBeNull();
    expect(reportOk(report)).toBe(false);
    expect(report.errorInfos.some((e) => e.code === TYPECHECK_CODE)).toBe(true);
    // No execution: the part never ran, so it produced no shape type or measurements.
    expect(report.shapeType).toBeNull();
    expect(report.measurements.volume).toBeUndefined();
    expect(report.hints.some((h) => h.code === TYPECHECK_CODE)).toBe(true);
  }, 30000);

  it('runs normally when --check passes for a well-typed part', async () => {
    const result = await runPart(fix('validBox.brep.ts'), { check: true });
    using shape = result.shape; // live WASM handle — dispose so it doesn't leak into the worker
    expect(shape).not.toBeNull();
    expect(result.report.shapeType).toBe('Solid');
    expect(reportOk(result.report)).toBe(true);
    expect(result.report.errorInfos.some((e) => e.code === TYPECHECK_CODE)).toBe(false);
  }, 30000);

  it('without --check, executes a type-wrong part (type-strip + run, today’s behavior)', async () => {
    const { report } = await runPart(fix('typeWrong.brep.ts'));
    expect(report.errorInfos.some((e) => e.code === TYPECHECK_CODE)).toBe(false);
  }, 30000);
});
