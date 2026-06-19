import { describe, it, expect } from 'vitest';
import {
  checkAuto,
  formatScorecard,
  failureBreakdown,
  runScores,
  itemScores,
  mergeScorecards,
  type EvalResult,
  type AttemptResult,
} from '../bench/score.js';
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
    expect(checkAuto(validReport({ volume: 1004 }), { volume: 1000, tolerancePct: 1 }).pass).toBe(
      true
    );
    const bad = checkAuto(validReport({ volume: 1100 }), { volume: 1000, tolerancePct: 1 });
    expect(bad.pass).toBe(false);
    expect(bad.failures.join(' ')).toContain('volume');
  });

  it('checks pinned bounds per axis with a span-relative tolerance', () => {
    const bounds = { xMin: 0, xMax: 40, yMin: 0, yMax: 30, zMin: 0, zMax: 20 };
    expect(
      checkAuto(validReport({ bounds }), { bounds: { x: [0, 40], z: [0, 20] }, tolerancePct: 1 })
        .pass
    ).toBe(true);
    const off = checkAuto(validReport({ bounds }), { bounds: { x: [0, 50] }, tolerancePct: 1 });
    expect(off.pass).toBe(false);
    expect(off.failures.join(' ')).toContain('bounds.x');
  });

  it('passes a correctly-sized part regardless of placement (extent, not absolute position)', () => {
    // 40×30×20 centered on the origin — same SIZE as expected [0,40]×[0,30]×[0,20], just a
    // different datum. The prompt never pins placement, so a correct part must not fail on it.
    const centered = { xMin: -20, xMax: 20, yMin: -15, yMax: 15, zMin: -10, zMax: 10 };
    const res = checkAuto(validReport({ bounds: centered }), {
      bounds: { x: [0, 40], y: [0, 30], z: [0, 20] },
      tolerancePct: 1,
    });
    expect(res.pass).toBe(true);
  });

  it('fails a wrong-sized part even when its corner sits at the expected origin', () => {
    const tooWide = { xMin: 0, xMax: 50, yMin: 0, yMax: 30, zMin: 0, zMax: 20 };
    const res = checkAuto(validReport({ bounds: tooWide }), {
      bounds: { x: [0, 40] },
      tolerancePct: 1,
    });
    expect(res.pass).toBe(false);
    expect(res.failures.join(' ')).toContain('bounds.x');
  });
});

describe('formatScorecard', () => {
  it('renders per-category and total tallies with the version stamp', () => {
    const results: EvalResult[] = [
      { id: 'a', category: 'primitive', auto: { pass: true, failures: [] }, judgePass: true },
      {
        id: 'b',
        category: 'primitive',
        auto: { pass: true, failures: [] },
        judgePass: false,
        judgeReason: 'no bore',
      },
      {
        id: 'c',
        category: 'boolean',
        auto: { pass: false, failures: ['not a valid part (ok=false)'] },
      },
    ];
    const out = formatScorecard({
      model: 'claude-opus-4-8',
      brepjsVersion: '18.60.0',
      date: '2026-06-04',
      results,
    });
    expect(out).toContain('brepjs=18.60.0');
    expect(out).toContain('model=claude-opus-4-8');
    expect(out).toContain('TOTAL');
    expect(out).toContain('primitive');
    // 2/3 valid overall, 1/3 judged matching, 1/3 both.
    expect(out).toMatch(/TOTAL\s+valid 67%\s+judge 33%\s+both 33%/);
  });
});

describe('runScores', () => {
  it('derives run-level valid/judge/both fractions (no lift without loop data)', () => {
    const results: EvalResult[] = [
      { id: 'a', category: 'primitive', auto: { pass: true, failures: [] }, judgePass: true },
      { id: 'b', category: 'primitive', auto: { pass: true, failures: [] }, judgePass: false },
      { id: 'c', category: 'boolean', auto: { pass: false, failures: [] } },
    ];
    const scores = runScores({ model: 'm', brepjsVersion: 'v', date: 'd', results });
    const get = (n: string): number | undefined => scores.find((s) => s.name === n)?.value;
    expect(get('valid')).toBeCloseTo(2 / 3, 5);
    expect(get('judge')).toBeCloseTo(1 / 3, 5);
    expect(get('both')).toBeCloseTo(1 / 3, 5);
    expect(get('lift')).toBeUndefined();
  });

  it('adds first_try_both / eventual_both / lift when loop data is present', () => {
    const results: EvalResult[] = [
      looped('x', [
        attempt([], { auto: { pass: true, failures: [] }, judgePass: false }),
        attempt([], { auto: { pass: true, failures: [] }, judgePass: true }),
      ]),
      looped('y', [attempt([], { auto: { pass: true, failures: [] }, judgePass: true })]),
    ];
    const scores = runScores({ model: 'm', brepjsVersion: 'v', date: 'd', results });
    const get = (n: string): number | undefined => scores.find((s) => s.name === n)?.value;
    expect(get('first_try_both')).toBeCloseTo(1 / 2, 5);
    expect(get('eventual_both')).toBeCloseTo(1, 5);
    expect(get('lift')).toBeCloseTo(1 / 2, 5);
  });

  it('normalizes lift scores by the full run size, not just the looped subset', () => {
    // A mixed run: one single-shot both-pass item + one looped item (first-try miss, eventual both).
    // All six scores must share the t.total=2 denominator so they're directly comparable on a chart.
    const results: EvalResult[] = [
      { id: 'single', category: 'primitive', auto: { pass: true, failures: [] }, judgePass: true },
      looped('lp', [
        attempt([], { auto: { pass: true, failures: [] }, judgePass: false }),
        attempt([], { auto: { pass: true, failures: [] }, judgePass: true }),
      ]),
    ];
    const scores = runScores({ model: 'm', brepjsVersion: 'v', date: 'd', results });
    const get = (n: string): number | undefined => scores.find((s) => s.name === n)?.value;
    expect(get('both')).toBeCloseTo(1, 5); // 2 both-pass / 2
    expect(get('eventual_both')).toBeCloseTo(1 / 2, 5); // 1 looped-both / 2  (NOT 1/1)
    expect(get('first_try_both')).toBeCloseTo(0, 5); // 0 looped-first-try-both / 2
    expect(get('lift')).toBeCloseTo(1 / 2, 5); // (1 - 0) / 2
  });

  it('returns no scores for an empty run', () => {
    expect(runScores({ model: 'm', brepjsVersion: 'v', date: 'd', results: [] })).toEqual([]);
  });
});

describe('mergeScorecards', () => {
  const mk = (results: EvalResult[]): Parameters<typeof mergeScorecards>[0][number] => ({
    model: 'm',
    brepjsVersion: 'v',
    skillVersion: 's',
    corpus: 'playground',
    date: 'd',
    results,
  });

  it('concatenates shard results under the first shard header', () => {
    const merged = mergeScorecards([
      mk([{ id: 'p1', category: 'primitive', auto: { pass: true, failures: [] } }]),
      mk([{ id: 'p2', category: 'boolean', auto: { pass: false, failures: [] } }]),
    ]);
    expect(merged.results.map((r) => r.id)).toEqual(['p1', 'p2']);
    expect(merged.skillVersion).toBe('s');
    expect(merged.corpus).toBe('playground');
    expect(merged.model).toBe('m');
  });

  it('returns an empty run when there are no cards', () => {
    expect(mergeScorecards([]).results).toEqual([]);
  });
});

describe('itemScores', () => {
  const get = (r: EvalResult, n: string): number | undefined =>
    itemScores(r).find((s) => s.name === n)?.value;

  it('scores a part by its own auto/judge/both (no first-try without loop data)', () => {
    const r: EvalResult = {
      id: 'a',
      category: 'primitive',
      auto: { pass: true, failures: [] },
      judgePass: true,
    };
    expect(get(r, 'auto_pass')).toBe(1);
    expect(get(r, 'judge_pass')).toBe(1);
    expect(get(r, 'eventual_both')).toBe(1);
    expect(get(r, 'first_try_both')).toBeUndefined();
  });

  it('marks eventual_both 0 when the judge fails despite a valid solid', () => {
    const r: EvalResult = {
      id: 'b',
      category: 'primitive',
      auto: { pass: true, failures: [] },
      judgePass: false,
    };
    expect(get(r, 'auto_pass')).toBe(1);
    expect(get(r, 'judge_pass')).toBe(0);
    expect(get(r, 'eventual_both')).toBe(0);
  });

  it('adds first_try_both from the first attempt when loop data is present', () => {
    const r = looped('c', [
      attempt([], { auto: { pass: true, failures: [] }, judgePass: false }),
      attempt([], { auto: { pass: true, failures: [] }, judgePass: true }),
    ]);
    expect(get(r, 'eventual_both')).toBe(1);
    expect(get(r, 'first_try_both')).toBe(0);
  });
});

function attempt(codes: string[], over: Partial<AttemptResult> = {}): AttemptResult {
  return {
    auto: { pass: false, failures: [] },
    outcome: 'completed',
    hasStep: false,
    codes,
    ...over,
  };
}
function looped(id: string, attempts: AttemptResult[]): EvalResult {
  const eventual = attempts[attempts.length - 1];
  return {
    id,
    category: 'primitive',
    auto: eventual?.auto ?? { pass: false, failures: [] },
    ...(attempts[0] ? { firstTry: attempts[0] } : {}),
    ...(eventual?.judgePass !== undefined ? { judgePass: eventual.judgePass } : {}),
    attempts,
    iterations: attempts.length,
    termination: 'EXHAUSTED',
  };
}

describe('failureBreakdown', () => {
  it('returns nothing for an empty run', () => {
    expect(failureBreakdown([])).toEqual([]);
  });

  it('counts attempts hitting each code, sorted by count desc then code', () => {
    const results = [
      looped('a', [attempt(['A']), attempt(['A']), attempt(['A', 'B'])]),
      looped('b', [attempt(['B'])]),
    ];
    // A appears in 3 attempts, B in 2.
    expect(failureBreakdown(results)).toEqual([
      { code: 'A', count: 3 },
      { code: 'B', count: 2 },
    ]);
  });

  it('dedupes repeated codes within a single attempt', () => {
    expect(failureBreakdown([looped('a', [attempt(['DUP', 'DUP'])])])).toEqual([
      { code: 'DUP', count: 1 },
    ]);
  });

  it('counts a result that errored before any attempt as EVAL_ERROR', () => {
    const errored: EvalResult = {
      id: 'x',
      category: 'primitive',
      auto: { pass: false, failures: [] },
      error: 'boom',
    };
    expect(failureBreakdown([errored])).toEqual([{ code: 'EVAL_ERROR', count: 1 }]);
  });
});

describe('formatScorecard — lift + failure modes', () => {
  it('renders the first-try/eventual lift and a failure-mode section when loop data is present', () => {
    const results: EvalResult[] = [
      looped('a', [
        attempt(['VALIDATION_FAILED']),
        {
          auto: { pass: true, failures: [] },
          judgePass: true,
          outcome: 'completed',
          hasStep: true,
          codes: [],
        },
      ]),
    ];
    const out = formatScorecard({
      model: 'm',
      brepjsVersion: '1.0.0',
      date: '2026-06-18',
      results,
    });
    expect(out).toContain('first-try both');
    expect(out).toContain('eventual both');
    expect(out).toContain('lift');
    expect(out).toContain('Failure modes');
    expect(out).toContain('VALIDATION_FAILED');
  });
});

describe('formatScorecard — judge-coverage guard', () => {
  it('flags built parts (eventual produced a STEP) that went unjudged', () => {
    // eventual attempt built a valid STEP but the judge never ran → harness regression (no Chrome).
    const unjudged = looped('a', [
      attempt([], { auto: { pass: true, failures: [] }, hasStep: true }),
    ]);
    const out = formatScorecard({ model: 'm', brepjsVersion: '1', date: 'd', results: [unjudged] });
    expect(out).toContain('judge coverage');
    expect(out).toContain('UNJUDGED');
  });

  it('does not flag an invalid part (no STEP) that legitimately went unjudged', () => {
    const invalid = looped('b', [attempt(['VALIDATION_FAILED'], { hasStep: false })]);
    const out = formatScorecard({ model: 'm', brepjsVersion: '1', date: 'd', results: [invalid] });
    expect(out).not.toContain('judge coverage');
  });

  it('does not flag a normally-judged built part', () => {
    const judged = looped('c', [
      attempt([], { auto: { pass: true, failures: [] }, hasStep: true, judgePass: true }),
    ]);
    const out = formatScorecard({ model: 'm', brepjsVersion: '1', date: 'd', results: [judged] });
    expect(out).not.toContain('judge coverage');
  });
});
