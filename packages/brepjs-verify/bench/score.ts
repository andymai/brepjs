import { reportOk, type VerifyReport } from '../src/verify/report.js';
import { DEFAULT_TOLERANCE_PCT, pctDelta } from '../src/verify/expected.js';
import type { EvalPrompt } from './prompts.js';

// Pure scoring + scorecard formatting for the live eval. No I/O, no network —
// unit-tested directly (see tests/liveEvalScore.test.ts).

export interface AutoResult {
  /** Objective signal: valid solid (ok=true) AND any pinned dims within tolerance. */
  pass: boolean;
  failures: string[];
}

export interface EvalResult {
  id: string;
  category: EvalPrompt['category'];
  auto: AutoResult;
  /** undefined when the judge couldn't run (e.g. snapshots unavailable). */
  judgePass?: boolean | undefined;
  judgeReason?: string | undefined;
  /** undefined when generation/build failed before a report existed. */
  error?: string | undefined;
}

/** Objective check: the report is ok (valid solid) and any pinned dims are within tolerance. */
export function checkAuto(report: VerifyReport, expected: EvalPrompt['expected']): AutoResult {
  const failures: string[] = [];
  if (!reportOk(report)) {
    failures.push('not a valid part (ok=false)');
    for (const e of report.errors) failures.push(`error: ${e}`);
  }
  if (expected) {
    const tol = expected.tolerancePct ?? DEFAULT_TOLERANCE_PCT;
    if (expected.volume !== undefined) {
      const v = report.measurements.volume;
      if (v === undefined) failures.push('volume: no measurement');
      else if (pctDelta(v, expected.volume) > tol)
        failures.push(`volume ${v.toFixed(1)} vs ${expected.volume} (>${tol}%)`);
    }
    if (expected.bounds) {
      const b = report.measurements.bounds;
      if (!b) failures.push('bounds: no measurement');
      else {
        for (const [axis, range] of Object.entries(expected.bounds)) {
          if (!range) continue;
          const [emin, emax] = range;
          const amin = b[`${axis}Min` as keyof typeof b];
          const amax = b[`${axis}Max` as keyof typeof b];
          // Tolerance is on the expected span, with a 0.1 mm floor for tiny axes.
          const eps = Math.max(0.1, (Math.abs(emax - emin) * tol) / 100);
          if (Math.abs(amin - emin) > eps || Math.abs(amax - emax) > eps)
            failures.push(`bounds.${axis}: [${amin},${amax}] vs [${emin},${emax}] (±${eps.toFixed(2)})`);
        }
      }
    }
  }
  return { pass: failures.length === 0, failures };
}

export interface Scorecard {
  model: string;
  brepjsVersion: string;
  date: string;
  results: readonly EvalResult[];
}

interface Tally {
  total: number;
  autoValid: number;
  judgeMatch: number;
  both: number;
}

function tally(results: readonly EvalResult[]): Tally {
  return {
    total: results.length,
    autoValid: results.filter((r) => r.auto.pass).length,
    judgeMatch: results.filter((r) => r.judgePass === true).length,
    both: results.filter((r) => r.auto.pass && r.judgePass === true).length,
  };
}

const pct = (n: number, d: number): string => (d === 0 ? '—' : `${Math.round((100 * n) / d)}%`);

export function formatScorecard(card: Scorecard): string {
  const lines: string[] = [];
  lines.push(`brepjs-verify live eval — model=${card.model} brepjs=${card.brepjsVersion} ${card.date}`);
  lines.push('='.repeat(64));
  const pad = Math.max(2, ...card.results.map((r) => r.id.length));
  for (const r of card.results) {
    const a = r.error ? 'ERR ' : r.auto.pass ? 'valid' : 'INVALID';
    const j = r.judgePass === undefined ? 'judge:—' : r.judgePass ? 'judge:✓' : 'judge:✗';
    lines.push(`  ${r.id.padEnd(pad)}  ${a.padEnd(7)} ${j}`);
    if (r.error) lines.push(`        ${r.error}`);
    else {
      for (const f of r.auto.failures) lines.push(`        auto: ${f}`);
      if (r.judgePass === false && r.judgeReason) lines.push(`        judge: ${r.judgeReason}`);
    }
  }
  lines.push('='.repeat(64));

  const cats = [...new Set(card.results.map((r) => r.category))].sort();
  for (const cat of cats) {
    const t = tally(card.results.filter((r) => r.category === cat));
    lines.push(
      `  ${cat.padEnd(10)} valid ${pct(t.autoValid, t.total)}  judge ${pct(t.judgeMatch, t.total)}  both ${pct(t.both, t.total)}  (n=${t.total})`
    );
  }
  const all = tally(card.results);
  lines.push('-'.repeat(64));
  lines.push(
    `  TOTAL      valid ${pct(all.autoValid, all.total)}  judge ${pct(all.judgeMatch, all.total)}  both ${pct(all.both, all.total)}  (n=${all.total})`
  );
  return lines.join('\n');
}
