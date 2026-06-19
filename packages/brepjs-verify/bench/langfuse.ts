import { NodeSDK } from '@opentelemetry/sdk-node';
import { LangfuseSpanProcessor } from '@langfuse/otel';
import { startActiveObservation } from '@langfuse/tracing';
import { LangfuseClient } from '@langfuse/client';
import type { EvalPrompt } from './prompts.js';
import { SCHEMA_VERSION, type EvalResult } from './score.js';

/**
 * Langfuse v5 (OpenTelemetry-based) telemetry for the live eval, behind a no-op shim.
 *
 * When the LANGFUSE_* keys are absent the factory returns a shim that no-ops every method, so the
 * offline `eval:live` workflow keeps working and the OTel SDK is never even started (so
 * `startActiveObservation` is never reached without a provider). Telemetry is a strictly optional
 * side-channel: every real Langfuse call is wrapped so a failure only warns — it must never fail or
 * corrupt the eval. The split-package v5 API is used directly (`@langfuse/tracing` + `@langfuse/otel`
 * + `@langfuse/client`); there is no single `langfuse` package and no `.trace()/.generation()`.
 *
 * Deferred (spec Delta 2, both need live keys to validate): a formal dataset run linking traces to
 * dataset items, and per-call nested generation/span observations. Runs are grouped today via trace
 * metadata (runId / skillVersion / model).
 */
export interface Telemetry {
  /** Run one prompt's eval inside a trace; derive + attach scores from the result. */
  observePrompt: (
    p: EvalPrompt,
    metadata: Record<string, unknown>,
    run: () => Promise<EvalResult>
  ) => Promise<EvalResult>;
  /** Register the SKILL.md text as a versioned Langfuse prompt (best-effort, once per run). */
  registerSkill: (skillMd: string) => Promise<void>;
  /** Flush spans + scores and shut down. */
  shutdown: () => Promise<void>;
}

const NOOP: Telemetry = {
  observePrompt: (_p, _metadata, run) => run(),
  registerSkill: () => Promise.resolve(),
  shutdown: () => Promise.resolve(),
};

/** Build telemetry from env. Absent keys → the no-op shim (offline `eval:live` still works). */
export function createTelemetry(): Telemetry {
  if (!process.env['LANGFUSE_PUBLIC_KEY'] || !process.env['LANGFUSE_SECRET_KEY']) return NOOP;

  const sdk = new NodeSDK({ spanProcessors: [new LangfuseSpanProcessor()] });
  sdk.start();
  const client = new LangfuseClient();

  return {
    observePrompt: async (p, metadata, run) => {
      let result: EvalResult | undefined;
      let ran = false;
      try {
        await startActiveObservation(p.id, async (obs) => {
          obs.update({
            input: p.prompt,
            metadata: { ...metadata, schemaVersion: SCHEMA_VERSION, units: 'mm' },
          });
          ran = true;
          result = await run();
          obs.update({
            output: {
              termination: result.termination,
              iterations: result.iterations,
              autoPass: result.auto.pass,
              judgePass: result.judgePass,
            },
          });
          attachScores(client, obs.traceId, result);
        });
      } catch (e) {
        // A telemetry failure must never corrupt the eval result — warn and fall through.
        console.warn(`langfuse: observePrompt failed (${(e as Error).message.split('\n')[0]})`);
      }
      if (result !== undefined) return result;
      // run() already executed (and rejected) → never re-run it (no double author+sandbox); invoke
      // run() only when telemetry threw *before* it started.
      return ran
        ? {
            id: p.id,
            category: p.category,
            auto: { pass: false, failures: [] },
            error: 'eval failed',
          }
        : run();
    },
    registerSkill: async (skillMd) => {
      try {
        await client.prompt.create({
          name: 'brepjs-skill',
          prompt: skillMd,
          labels: ['production'],
        });
      } catch (e) {
        console.warn(
          `langfuse: skill prompt registration failed (${(e as Error).message.split('\n')[0]})`
        );
      }
    },
    shutdown: async () => {
      try {
        await client.flush();
        await sdk.shutdown();
      } catch (e) {
        console.warn(`langfuse: shutdown/flush failed (${(e as Error).message.split('\n')[0]})`);
      }
    },
  };
}

/** Derive the run's scores from the EvalResult and queue them on the trace (best-effort). */
function attachScores(client: LangfuseClient, traceId: string, r: EvalResult): void {
  const both = (autoPass: boolean, judgePass: boolean | undefined): number =>
    autoPass && judgePass === true ? 1 : 0;
  const put = (name: string, value: number): void => {
    try {
      client.score.create({ traceId, name, value, dataType: 'NUMERIC' });
    } catch {
      // best-effort — never let a score failure break the eval.
    }
  };
  put('auto_pass', r.auto.pass ? 1 : 0);
  put('judge_pass', r.judgePass === true ? 1 : 0);
  put('eventual_both', both(r.auto.pass, r.judgePass));
  if (r.firstTry) put('first_try_both', both(r.firstTry.auto.pass, r.firstTry.judgePass));
}
