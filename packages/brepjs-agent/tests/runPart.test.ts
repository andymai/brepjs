import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { runPart } from '@/verify/runPart.js';

const fix = (n: string) => fileURLToPath(new URL(`./fixtures/${n}`, import.meta.url));

describe('runPart', () => {
  it('builds a shape and verifies it', async () => {
    const { report } = await runPart(fix('validBox.brep.ts'));
    expect(report.shapeType).toBe('Solid');
    expect(report.measurements.volume).toBeCloseTo(1000, 1);
  }, 30000);

  it('flags a degenerate part deterministically', async () => {
    const { report } = await runPart(fix('degenerate.brep.ts'));
    const failed = report.errors.length + report.checks.filter((c) => !c.passed).length;
    expect(failed).toBeGreaterThan(0);
  }, 30000);

  it('emits a STEP buffer (primary artifact) for a valid shape', async () => {
    const { step } = await runPart(fix('validBox.brep.ts'), { step: true });
    expect(step).toBeInstanceOf(ArrayBuffer);
    expect((step as ArrayBuffer).byteLength).toBeGreaterThan(0);
  }, 30000);

  it('emits a GLB buffer (derived preview) for a valid shape', async () => {
    const { glb } = await runPart(fix('validBox.brep.ts'), { glb: true });
    expect(glb).toBeInstanceOf(ArrayBuffer);
    expect((glb as ArrayBuffer).byteLength).toBeGreaterThan(0);
  }, 30000);
});
