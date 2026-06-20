import { describe, it, expect } from 'vitest';
import { runAttemptLoop, type LoopDeps } from '../bench/loop.js';
import type { EvalPrompt } from '../bench/prompts.js';
import type { ChatMessage } from '../bench/loop.js';
import type { RunProgramWithStepResult } from '@/sandbox/runProgram.js';

// Pure loop tests — every dependency (author/execute/judge/snapshot) is stubbed, so no child
// process is spawned and no API is called. The loop's bookkeeping is the unit under test.

const PROMPT: EvalPrompt = {
  id: 't',
  category: 'primitive',
  prompt: 'make a 10mm box',
  rubric: 'a box',
};

function okOutcome(): RunProgramWithStepResult {
  return {
    outcome: 'completed',
    stepPath: '/tmp/ok.step',
    report: {
      ok: true,
      shapeType: 'Solid',
      checks: [{ name: 'isValidSolid', passed: true }],
      measurements: { volume: 1000 },
      errors: [],
      errorInfos: [],
      hints: [],
      assertions: [],
    },
  };
}

function badOutcome(): RunProgramWithStepResult {
  return {
    outcome: 'completed', // built, but invalid — no STEP, validity failure in errorInfos (not errors)
    report: {
      ok: false,
      shapeType: 'Solid',
      checks: [{ name: 'isValidSolid', passed: false }],
      measurements: {},
      errors: [],
      errorInfos: [{ message: 'isValidSolid: non-manifold', code: 'VALIDATION_FAILED' }],
      hints: [
        {
          code: 'VALIDATION_FAILED',
          message: 'isValidSolid: non-manifold',
          fix: 'heal/sew the shape',
          nextStep: 'until validSolid passes',
        },
      ],
      assertions: [],
    },
  };
}

function deps(over: Partial<LoopDeps> = {}): LoopDeps {
  return {
    author: () => Promise.resolve('export default () => box(10, 10, 10);'),
    execute: () => Promise.resolve(okOutcome()),
    snapshot: () => Promise.resolve(['/tmp/iso.png']),
    judge: () => Promise.resolve({ pass: true, reason: 'looks right' }),
    ...over,
  };
}

describe('runAttemptLoop', () => {
  it('converges on attempt 1 when auto and judge both pass', async () => {
    const res = await runAttemptLoop(PROMPT, deps(), { maxAttempts: 3 });
    expect(res.iterations).toBe(1);
    expect(res.termination).toBe('CONVERGED');
    expect(res.auto.pass).toBe(true);
    expect(res.judgePass).toBe(true);
    expect(res.firstTry?.auto.pass).toBe(true);
    expect(res.attempts).toHaveLength(1);
  });

  it('exhausts after maxAttempts when it never passes', async () => {
    const res = await runAttemptLoop(
      PROMPT,
      deps({ execute: () => Promise.resolve(badOutcome()) }),
      {
        maxAttempts: 3,
      }
    );
    expect(res.iterations).toBe(3);
    expect(res.termination).toBe('EXHAUSTED');
    expect(res.auto.pass).toBe(false);
    expect(res.firstTry?.auto.pass).toBe(false);
    expect(res.attempts).toHaveLength(3);
  });

  it('records a failed first-try but a passing eventual (the lift signal)', async () => {
    let n = 0;
    const res = await runAttemptLoop(
      PROMPT,
      deps({
        execute: () => Promise.resolve(++n === 1 ? badOutcome() : okOutcome()),
      }),
      { maxAttempts: 3 }
    );
    expect(res.iterations).toBe(2);
    expect(res.termination).toBe('CONVERGED');
    expect(res.firstTry?.auto.pass).toBe(false); // first-try failed
    expect(res.auto.pass).toBe(true); // eventual passed
  });

  it('judges attempt 1 and the final attempt, but not intermediate auto-failing attempts', async () => {
    // A valid solid (STEP present) that misses the pinned dims → auto fails while a STEP exists, so
    // the judge *could* run every attempt; the gate must still skip the intermediate one.
    const promptWithDims: EvalPrompt = { ...PROMPT, expected: { volume: 1000, tolerancePct: 1 } };
    const validWrongDims = (): RunProgramWithStepResult => ({
      outcome: 'completed',
      stepPath: '/tmp/wrong.step',
      report: {
        ok: true,
        shapeType: 'Solid',
        checks: [{ name: 'isValidSolid', passed: true }],
        measurements: { volume: 500 }, // off by 2× → checkAuto fails on volume
        errors: [],
        errorInfos: [],
        hints: [],
        assertions: [],
      },
    });
    let judgeCalls = 0;
    await runAttemptLoop(
      promptWithDims,
      deps({
        execute: () => Promise.resolve(validWrongDims()),
        judge: () => {
          judgeCalls++;
          return Promise.resolve({ pass: false, reason: 'wrong size' });
        },
      }),
      { maxAttempts: 3 }
    );
    // attempt 1 (first) + attempt 3 (final), NOT attempt 2 (intermediate auto-fail).
    expect(judgeCalls).toBe(2);
  });

  it('on retry, appends the prior code as the assistant turn and a feedback bundle citing errorInfos + hints', async () => {
    const seen: ChatMessage[][] = [];
    let n = 0;
    await runAttemptLoop(
      PROMPT,
      deps({
        author: (messages) => {
          seen.push(messages);
          return Promise.resolve(`// attempt ${++n}\nexport default () => box(1,1,1);`);
        },
        execute: () => Promise.resolve(n === 1 ? badOutcome() : okOutcome()),
      }),
      { maxAttempts: 3 }
    );
    // Second author call carries: [user(prompt), assistant(prior code), user(feedback)].
    const second = seen[1];
    expect(second).toBeDefined();
    if (!second) return;
    expect(second).toHaveLength(3);
    expect(second[0]?.role).toBe('user');
    expect(second[1]?.role).toBe('assistant');
    expect(second[1]?.content).toContain('// attempt 1'); // the extracted prior code, verbatim
    expect(second[2]?.role).toBe('user');
    expect(second[2]?.content).toContain('isValidSolid: non-manifold'); // from errorInfos
    expect(second[2]?.content).toContain('heal/sew the shape'); // from the hint's fix
  });

  it('treats a sandbox timeout as a failed attempt carrying a TIMEOUT code', async () => {
    const res = await runAttemptLoop(
      PROMPT,
      deps({ execute: () => Promise.resolve({ outcome: 'timeout' as const, timeoutMs: 30000 }) }),
      { maxAttempts: 1 }
    );
    expect(res.termination).toBe('EXHAUSTED');
    expect(res.auto.pass).toBe(false);
    expect(res.attempts?.[0]?.codes).toContain('TIMEOUT');
    expect(res.attempts?.[0]?.outcome).toBe('timeout');
  });

  it('captures the request and the eventual authored code on the result', async () => {
    const res = await runAttemptLoop(
      PROMPT,
      deps({ author: () => Promise.resolve('export default () => box(5, 5, 5);') }),
      { maxAttempts: 3 }
    );
    expect(res.prompt).toBe('make a 10mm box');
    expect(res.code).toBe('export default () => box(5, 5, 5);');
  });

  it('captures the eventual code after a retry, not the first attempt', async () => {
    let authorN = 0;
    let execN = 0;
    const res = await runAttemptLoop(
      PROMPT,
      deps({
        author: () => Promise.resolve(`// v${++authorN}\nexport default () => box(1, 1, 1);`),
        execute: () => Promise.resolve(++execN === 1 ? badOutcome() : okOutcome()),
      }),
      { maxAttempts: 3 }
    );
    expect(res.iterations).toBe(2);
    expect(res.code).toBe('// v2\nexport default () => box(1, 1, 1);');
  });
});
