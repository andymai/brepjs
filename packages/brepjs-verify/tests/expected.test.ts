import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { runPart } from '@/verify/runPart.js';
import { reportOk } from '@/verify/report.js';
import { evaluateExpected, isExpectedDims, unknownExpectedKeys } from '@/verify/expected.js';

const fix = (n: string) => fileURLToPath(new URL(`./fixtures/${n}`, import.meta.url));

describe('asserted dims (export const expected)', () => {
  it('passes all assertions when expected matches the measured part', async () => {
    const { report } = await runPart(fix('expectedPass.brep.ts'));
    expect(report.assertions.length).toBeGreaterThan(0);
    expect(report.assertions.every((a) => a.passed)).toBe(true);
    const vol = report.assertions.find((a) => a.name === 'volume');
    expect(vol?.expected).toBe(1000);
    expect(vol?.actual).toBeCloseTo(1000, 1);
    expect(reportOk(report)).toBe(true);
  }, 30000);

  it('fails with ok:false and a failing assertion when expected is wrong', async () => {
    const { report } = await runPart(fix('expectedWrong.brep.ts'));
    const vol = report.assertions.find((a) => a.name === 'volume');
    expect(vol).toBeDefined();
    expect(vol?.passed).toBe(false);
    expect(vol?.expected).toBe(2000);
    expect(reportOk(report)).toBe(false);
  }, 30000);

  it('fails loud (EXPECTED_UNKNOWN_KEY) when expected uses an unrecognized shape', async () => {
    const { report } = await runPart(fix('expectedUnknownKeys.brep.ts'));
    expect(reportOk(report)).toBe(false);
    expect(report.errorInfos.some((e) => e.code === 'EXPECTED_UNKNOWN_KEY')).toBe(true);
    expect(report.hints.some((h) => h.code === 'EXPECTED_UNKNOWN_KEY')).toBe(true);
  }, 30000);

  it('adds no assertions when the part declares no expected', async () => {
    const { report } = await runPart(fix('validBox.brep.ts'));
    expect(report.assertions).toEqual([]);
    expect(reportOk(report)).toBe(true);
  }, 30000);
});

describe('evaluateExpected / isExpectedDims (unit)', () => {
  it('marks a missing measurement as a failing assertion', () => {
    const assertions = evaluateExpected({ area: 100 }, {});
    expect(assertions).toEqual([{ name: 'area', expected: 100, actual: null, passed: false }]);
  });

  it('honors tolerancePct on the boundary', () => {
    const [a] = evaluateExpected({ volume: 1000, tolerancePct: 1 }, { volume: 1011 });
    expect(a?.passed).toBe(false);
    const [b] = evaluateExpected({ volume: 1000, tolerancePct: 1 }, { volume: 1010 });
    expect(b?.passed).toBe(true);
  });

  it('compares declared bounds fields', () => {
    const assertions = evaluateExpected(
      { bounds: { xMax: 10, zMin: 0 } },
      { bounds: { xMin: 0, xMax: 10, yMin: 0, yMax: 10, zMin: 0, zMax: 10 } }
    );
    expect(assertions.map((a) => a.name)).toEqual(['bounds.xMax', 'bounds.zMin']);
    expect(assertions.every((a) => a.passed)).toBe(true);
  });

  it('passes a zero-valued expectation against sub-epsilon kernel float noise', () => {
    // A loft base lands at z = -1e-7, not exactly 0; pinning zMin: 0 must still pass.
    const [a] = evaluateExpected(
      { bounds: { zMin: 0 }, tolerancePct: 1 },
      { bounds: { xMin: 0, xMax: 1, yMin: 0, yMax: 1, zMin: -1e-7, zMax: 1 } }
    );
    expect(a?.passed).toBe(true);
    // Noise an order of magnitude above the epsilon still fails — the slack is tight.
    const [b] = evaluateExpected({ volume: 0, tolerancePct: 1 }, { volume: 1e-3 });
    expect(b?.passed).toBe(false);
  });

  it('flags an unrecognized expected shape so it fails loud instead of being ignored', () => {
    expect(unknownExpectedKeys({ volume: 1, bounds: { xMin: 0, zMax: 5 } })).toEqual([]);
    // The wrong bounds shapes two different models reached for:
    expect(unknownExpectedKeys({ volume: 1, bounds: { min: [0], max: [1] } })).toEqual([
      'bounds.min',
      'bounds.max',
    ]);
    expect(unknownExpectedKeys({ bounds: { x: [0, 1] } })).toEqual(['bounds.x']);
    expect(unknownExpectedKeys({ vol: 1 })).toEqual(['vol']);
  });

  it('isExpectedDims rejects non-objects and bad field types', () => {
    expect(isExpectedDims({ volume: 1 })).toBe(true);
    expect(isExpectedDims({ volume: 'x' })).toBe(false);
    expect(isExpectedDims(null)).toBe(false);
    expect(isExpectedDims({ bounds: { xMin: 0 } })).toBe(true);
  });
});
