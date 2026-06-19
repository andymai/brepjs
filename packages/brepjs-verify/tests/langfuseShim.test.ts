import { describe, it, expect } from 'vitest';
import { createTelemetry } from '../bench/langfuse.js';
import type { EvalPrompt } from '../bench/prompts.js';
import type { EvalResult } from '../bench/score.js';

// Without LANGFUSE_* keys the factory must return a no-op shim: it never starts the OTel SDK, runs
// the eval fn unchanged, and resolves register/shutdown — so the offline `eval:live` workflow and
// the default test gate are unaffected by the telemetry layer.

describe('createTelemetry — no-op shim when keys absent', () => {
  it('runs the eval fn unchanged and no-ops registerSkill/shutdown', async () => {
    const { LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY } = process.env;
    delete process.env['LANGFUSE_PUBLIC_KEY'];
    delete process.env['LANGFUSE_SECRET_KEY'];
    try {
      const t = createTelemetry();
      const p: EvalPrompt = { id: 't', category: 'primitive', prompt: 'x', rubric: 'a box' };
      const result: EvalResult = {
        id: 't',
        category: 'primitive',
        auto: { pass: true, failures: [] },
      };

      const out = await t.observePrompt(p, { model: 'm' }, () => Promise.resolve(result));
      expect(out).toBe(result); // passthrough — same object, no wrapping

      await expect(t.registerSkill('# skill')).resolves.toBeUndefined();
      await expect(t.shutdown()).resolves.toBeUndefined();
    } finally {
      if (LANGFUSE_PUBLIC_KEY !== undefined)
        process.env['LANGFUSE_PUBLIC_KEY'] = LANGFUSE_PUBLIC_KEY;
      if (LANGFUSE_SECRET_KEY !== undefined)
        process.env['LANGFUSE_SECRET_KEY'] = LANGFUSE_SECRET_KEY;
    }
  });
});
