import { reportOk, type VerifyReport } from '../src/verify/report.js';
import { DEFAULT_TOLERANCE_PCT, pctDelta } from '../src/verify/expected.js';
import type { EvalPrompt } from './prompts.js';

// Pure scoring + scorecard formatting for the live eval. No I/O, no network —
// unit-tested directly (see tests/liveEvalScore.test.ts).

/** Score/scorecard schema version — bump when the score/scorecard shape changes (vision §H). */
export const SCHEMA_VERSION = 1;

export interface AutoResult {
  /** Objective signal: valid solid (ok=true) AND any pinned dims within tolerance. */
  pass: boolean;
  failures: string[];
}

/** The scorer's normalized per-attempt unit — deliberately free of sandbox types. */
export interface AttemptResult {
  auto: AutoResult;
  judgePass?: boolean | undefined;
  judgeReason?: string | undefined;
  outcome: 'completed' | 'timeout' | 'crashed';
  /** Whether this attempt produced a STEP (a valid solid the judge could render). */
  hasStep: boolean;
  /** Normalized failure codes for the breakdown: report error codes, 'UNCODED', or TIMEOUT/CRASHED. */
  codes: string[];
}

export interface EvalResult {
  id: string;
  category: EvalPrompt['category'];
  /** The eventual (final) attempt's objective signal. */
  auto: AutoResult;
  /** The eventual attempt's judge verdict; undefined when the judge couldn't run (snapshots absent). */
  judgePass?: boolean | undefined;
  judgeReason?: string | undefined;
  /** undefined when generation/build failed before a report existed. */
  error?: string | undefined;
  /** Per-attempt trail from the bounded loop (absent for the legacy single-shot path). */
  attempts?: AttemptResult[] | undefined;
  /** The first attempt's result — the single-shot signal for the first-try-vs-eventual lift. */
  firstTry?: AttemptResult | undefined;
  iterations?: number | undefined;
  termination?: 'CONVERGED' | 'EXHAUSTED' | undefined;
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
          // Assert SIZE (span), not absolute position — a part's datum is unconstrained by the
          // prompt, so a correctly-sized box centered on the origin must match a corner-at-origin
          // expected box. Tolerance is span-relative, with a 0.1 mm floor for tiny axes.
          const eSpan = Math.abs(emax - emin);
          const aSpan = amax - amin;
          const eps = Math.max(0.1, (eSpan * tol) / 100);
          if (Math.abs(aSpan - eSpan) > eps)
            failures.push(`bounds.${axis}: span ${aSpan.toFixed(1)} vs ${eSpan} (±${eps.toFixed(2)})`);
        }
      }
    }
  }
  return { pass: failures.length === 0, failures };
}

export interface Scorecard {
  model: string;
  /** The model that graded the rendered parts; omitted when it's the same as the author model. */
  judgeModel?: string | undefined;
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

function pct(n: number, d: number): string {
  return d === 0 ? '—' : `${Math.round((100 * n) / d)}%`;
}

export interface FailureMode {
  code: string;
  count: number;
}

/**
 * Count how many attempts (across all results) hit each normalized failure code — the "what to fix
 * next" signal. Deduped within an attempt; a result that errored before any attempt counts once as
 * EVAL_ERROR. Sorted by count desc, then code asc.
 */
export function failureBreakdown(results: readonly EvalResult[]): FailureMode[] {
  const counts = new Map<string, number>();
  const bump = (code: string): void => {
    counts.set(code, (counts.get(code) ?? 0) + 1);
  };
  for (const r of results) {
    const attempts = r.attempts ?? [];
    if (attempts.length === 0 && r.error) bump('EVAL_ERROR');
    for (const a of attempts) for (const code of new Set(a.codes)) bump(code);
  }
  return [...counts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

interface LiftSummary {
  firstTryBoth: number;
  eventualBoth: number;
  total: number;
}

/**
 * First-try vs eventual `both%` over results that ran the loop — the lodestar lift. Null when no loop
 * data is present (legacy single-shot results), so the line is simply omitted.
 */
function liftSummary(results: readonly EvalResult[]): LiftSummary | null {
  const looped = results.filter((r) => r.firstTry !== undefined);
  if (looped.length === 0) return null;
  const firstTryBoth = looped.filter((r) => {
    const ft = r.firstTry;
    return ft !== undefined && ft.auto.pass && ft.judgePass === true;
  }).length;
  const eventualBoth = looped.filter((r) => r.auto.pass && r.judgePass === true).length;
  return { firstTryBoth, eventualBoth, total: looped.length };
}

/**
 * How many *built* parts (eventual attempt produced a STEP) actually got judged. A built part left
 * unjudged means the snapshot/judge pipeline silently failed (no Chrome/viewer) — a harness
 * regression that would otherwise hide as `judge:—` while `both%` collapses to `auto%` (vision §6).
 */
function judgeCoverage(results: readonly EvalResult[]): { built: number; unjudged: number } {
  let built = 0;
  let unjudged = 0;
  for (const r of results) {
    const ev = r.attempts?.[r.attempts.length - 1];
    if (ev?.hasStep) {
      built++;
      if (ev.judgePass === undefined) unjudged++;
    }
  }
  return { built, unjudged };
}

export function formatScorecard(card: Scorecard): string {
  const lines: string[] = [];
  const judge = card.judgeModel ? ` judge=${card.judgeModel}` : '';
  lines.push(
    `brepjs-verify live eval — model=${card.model}${judge} brepjs=${card.brepjsVersion} ${card.date} schema=v${SCHEMA_VERSION} units=mm`
  );
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

  // The lodestar signal: does iterating beat single-shot? (Omitted for legacy single-shot results.)
  const lift = liftSummary(card.results);
  if (lift) {
    const delta =
      lift.total === 0
        ? 0
        : Math.round((100 * (lift.eventualBoth - lift.firstTryBoth)) / lift.total);
    lines.push(
      `  first-try both ${pct(lift.firstTryBoth, lift.total)}  eventual both ${pct(lift.eventualBoth, lift.total)}  lift ${delta >= 0 ? '+' : ''}${delta}%  (n=${lift.total})`
    );
  }

  // No silent drops (vision §6): a built part that went unjudged means snapshots/Chrome died —
  // flag it loudly, because `both%` silently collapses to `auto%` for those.
  const cov = judgeCoverage(card.results);
  if (cov.unjudged > 0) {
    lines.push(
      `  ⚠ judge coverage: ${cov.unjudged}/${cov.built} built parts went UNJUDGED (snapshots/Chrome unavailable?) — both% is auto-only for those.`
    );
  }

  // What to rewrite in the skill next: the failure modes, most common first.
  const modes = failureBreakdown(card.results);
  if (modes.length > 0) {
    lines.push('-'.repeat(64));
    lines.push('  Failure modes (attempts hitting each code):');
    for (const m of modes) lines.push(`    ${m.code.padEnd(24)} ${m.count}`);
  }
  return lines.join('\n');
}
