import { checkAuto, type AttemptResult, type AutoResult, type EvalResult } from './score.js';
import type { EvalPrompt } from './prompts.js';
import type { RunProgramWithStepResult } from '../src/sandbox/runProgram.js';

// The bounded build→verify→edit loop, extracted from live.ts as a pure orchestrator over injected
// dependencies so it is unit-testable without spawning a child or calling an API. Each turn: author
// code from the running transcript, execute it in the sandbox (one bounded spawn), score the
// objective `auto` signal, judge the rendered part (attempt 1 + final + any auto-passing attempt),
// and either CONVERGE or feed the structured failure back and retry, up to `maxAttempts`.

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** The loop's injected dependencies — real impls live in live.ts; tests stub them. */
export interface LoopDeps {
  /** Author a `.brep.ts` module given the running transcript (the system prompt is the dep's concern). */
  author: (messages: ChatMessage[]) => Promise<string>;
  /** Execute code in the sandbox; writes a STEP to disk only when a valid solid builds. */
  execute: (code: string, attempt: number) => Promise<RunProgramWithStepResult>;
  /** Render multi-view snapshots of a STEP; returns [] when unavailable (no Chrome/viewer). */
  snapshot: (stepPath: string) => Promise<readonly string[]>;
  /** Multimodal judge over the rendered views; null = no verdict (e.g. judge errored — a soft skip). */
  judge: (pngPaths: readonly string[]) => Promise<{ pass: boolean; reason: string } | null>;
}

export interface LoopOptions {
  /** N — the hard upper bound on attempts. */
  maxAttempts: number;
}

/** Objective signal from a sandbox outcome: report-derived when completed, else the failure reason. */
function autoFromOutcome(
  outcome: RunProgramWithStepResult,
  expected: EvalPrompt['expected']
): AutoResult {
  if (outcome.outcome === 'completed') return checkAuto(outcome.report, expected);
  if (outcome.outcome === 'timeout')
    return { pass: false, failures: [`sandbox timeout after ${outcome.timeoutMs}ms`] };
  return { pass: false, failures: [`sandbox crashed: ${outcome.detail}`] };
}

/** Normalized failure codes for the breakdown: sandbox outcome, else report error codes. */
function codesFromOutcome(outcome: RunProgramWithStepResult): string[] {
  if (outcome.outcome === 'timeout') return ['TIMEOUT'];
  if (outcome.outcome === 'crashed') return ['CRASHED'];
  // Validity failures land in errorInfos (with code VALIDATION_FAILED), never in `errors`. A codeless
  // failure (e.g. "part produced no shape") buckets as UNCODED so the breakdown still counts it.
  return outcome.report.errorInfos.map((e) => e.code ?? 'UNCODED');
}

/**
 * Build the retry feedback bundle from whatever the report carries — reusing the structured findings
 * the substrate already produces for the live agent. Reads `errorInfos` (validity failures live
 * there, not in `errors`) + `hints` (code-keyed fix/nextStep) + the objective `auto` failures + the
 * judge's reason. Degrades for a type-error/crash/timeout attempt that carries no measurements.
 */
function buildFeedbackBundle(
  outcome: RunProgramWithStepResult,
  auto: AutoResult,
  judgeReason: string | undefined
): string {
  const lines = ['The previous attempt did not pass. Fix it and return the full corrected module.'];
  if (outcome.outcome === 'completed') {
    for (const info of outcome.report.errorInfos) lines.push(`- error: ${info.message}`);
    for (const h of outcome.report.hints) lines.push(`- fix (${h.code}): ${h.fix} ${h.nextStep}`);
  } else if (outcome.outcome === 'timeout') {
    lines.push(
      `- the program timed out after ${outcome.timeoutMs}ms — remove the slow/looping op.`
    );
  } else {
    lines.push(`- the program crashed: ${outcome.detail}`);
  }
  for (const f of auto.failures) lines.push(`- check failed: ${f}`);
  if (judgeReason) lines.push(`- a reviewer of the rendered part said: ${judgeReason}`);
  return lines.join('\n');
}

export async function runAttemptLoop(
  p: EvalPrompt,
  deps: LoopDeps,
  opts: LoopOptions
): Promise<EvalResult> {
  const messages: ChatMessage[] = [{ role: 'user', content: p.prompt }];
  const attempts: AttemptResult[] = [];
  let lastCode = '';
  let termination: 'CONVERGED' | 'EXHAUSTED' = 'EXHAUSTED';

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    const code = await deps.author(messages);
    lastCode = code;
    const outcome = await deps.execute(code, attempt);
    const auto = autoFromOutcome(outcome, p.expected);

    // Judge attempt 1 (first-try metric), any auto-passing attempt (a convergence candidate), and
    // the final attempt (eventual metric) — but only when a STEP actually built. Intermediate
    // auto-failing attempts are skipped (the cost gate).
    const isFinal = attempt === opts.maxAttempts;
    const wantJudge = attempt === 1 || auto.pass || isFinal;
    let judgePass: boolean | undefined;
    let judgeReason: string | undefined;
    if (wantJudge && outcome.outcome === 'completed' && outcome.stepPath) {
      const pngs = await deps.snapshot(outcome.stepPath);
      if (pngs.length > 0) {
        const v = await deps.judge(pngs);
        if (v) {
          judgePass = v.pass;
          judgeReason = v.reason;
        }
      }
    }

    const result: AttemptResult = {
      auto,
      outcome: outcome.outcome,
      hasStep: outcome.outcome === 'completed' && Boolean(outcome.stepPath),
      codes: codesFromOutcome(outcome),
    };
    if (judgePass !== undefined) result.judgePass = judgePass;
    if (judgeReason !== undefined) result.judgeReason = judgeReason;
    attempts.push(result);

    // An absent judge does not block convergence (judge:— is a legitimate skip, not a fail).
    if (auto.pass && (judgePass ?? true)) {
      termination = 'CONVERGED';
      break;
    }
    if (isFinal) {
      termination = 'EXHAUSTED';
      break;
    }
    // Retry: append the prior code (extracted text only — no raw thinking blocks) + the feedback.
    messages.push({ role: 'assistant', content: code });
    messages.push({ role: 'user', content: buildFeedbackBundle(outcome, auto, judgeReason) });
  }

  const firstTry = attempts[0];
  const eventual = attempts[attempts.length - 1];
  const out: EvalResult = {
    id: p.id,
    category: p.category,
    auto: eventual?.auto ?? { pass: false, failures: ['no attempts ran'] },
    attempts,
    iterations: attempts.length,
    termination,
  };
  if (p.prompt) out.prompt = p.prompt;
  if (lastCode) out.code = lastCode;
  if (firstTry) out.firstTry = firstTry;
  if (eventual?.judgePass !== undefined) out.judgePass = eventual.judgePass;
  if (eventual?.judgeReason !== undefined) out.judgeReason = eventual.judgeReason;
  return out;
}
