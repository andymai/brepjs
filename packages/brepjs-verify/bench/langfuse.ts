import { NodeSDK } from '@opentelemetry/sdk-node';
import { LangfuseSpanProcessor } from '@langfuse/otel';
import { startActiveObservation } from '@langfuse/tracing';
import { LangfuseClient } from '@langfuse/client';
import type { EvalPrompt } from './prompts.js';
import {
  SCHEMA_VERSION,
  runScores,
  itemScores,
  type EvalResult,
  type Scorecard,
} from './score.js';

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
 * `pushDatasetRun` records a run as a Langfuse dataset experiment — one trace per part, its scores
 * linked to the matching `brepjs-playground` dataset item, under a per-skill-version run name — so
 * runs compare natively in the dataset Runs view. Deferred: per-call nested generation/span
 * observations inside the live `eval:live` path.
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
  /** Push one run's aggregate scores (both% + first-try-vs-eventual lift) on a single trace. */
  pushScorecard: (card: Scorecard) => Promise<void>;
  /** Record the run as a dataset experiment (per-part trace + scores linked to its dataset item);
   *  resolves with the number of items successfully linked. */
  pushDatasetRun: (card: Scorecard) => Promise<number>;
  /** Flush spans + scores and shut down. */
  shutdown: () => Promise<void>;
}

const NOOP: Telemetry = {
  observePrompt: (_p, _metadata, run) => run(),
  registerSkill: () => Promise.resolve(),
  pushScorecard: () => Promise.resolve(),
  pushDatasetRun: () => Promise.resolve(0),
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
    pushScorecard: async (card) => {
      // One trace per run carrying the aggregate scores, so Langfuse trends both%/lift across
      // skill versions. Strictly best-effort — a telemetry failure never affects the eval output.
      // The callback is sync (update + enqueue scores), so startActiveObservation returns a
      // non-Promise and isn't awaited; client.flush() below delivers the scores.
      try {
        startActiveObservation('eval-run', (obs) => {
          obs.update({
            input: {
              model: card.model,
              judgeModel: card.judgeModel,
              brepjsVersion: card.brepjsVersion,
            },
            output: { prompts: card.results.length },
            metadata: {
              date: card.date,
              skillVersion: card.skillVersion,
              schemaVersion: SCHEMA_VERSION,
              units: 'mm',
            },
          });
          for (const s of runScores(card)) {
            try {
              client.score.create({
                traceId: obs.traceId,
                name: s.name,
                value: s.value,
                dataType: 'NUMERIC',
              });
            } catch {
              // best-effort — a single score failure must not break the run push.
            }
          }
        });
        await client.flush();
      } catch (e) {
        console.warn(`langfuse: pushScorecard failed (${(e as Error).message.split('\n')[0]})`);
      }
    },
    pushDatasetRun: async (card) => {
      // Record the run as a Langfuse dataset experiment so per-part scores compare across skill
      // versions natively (the lift view). Each result links its own trace to the matching
      // brepjs-playground dataset item (item id === example id) under one run name = the skill
      // version. Best-effort + isolated per item: corpus drift (a result whose id has no dataset
      // item) only warns and skips, so one missing item never aborts the rest of the run.
      const runName = card.skillVersion ?? `${card.model}-${card.date}`;
      let linked = 0;
      for (const r of card.results) {
        try {
          await startActiveObservation(r.id, async (obs) => {
            obs.update({
              metadata: { runName, category: r.category, skillVersion: card.skillVersion },
            });
            attachScores(client, obs.traceId, r);
            await client.api.datasetRunItems.create({
              runName,
              runDescription: `brepjs-verify eval — ${card.model} ${card.date}`,
              datasetItemId: r.id,
              traceId: obs.traceId,
              metadata: { skillVersion: card.skillVersion, brepjsVersion: card.brepjsVersion },
            });
          });
          linked++;
        } catch (e) {
          console.warn(
            `langfuse: dataset-run link failed for ${r.id} (${(e as Error).message.split('\n')[0]})`
          );
        }
      }
      return linked;
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

/** Queue the part's per-item scores on its trace (best-effort; shared with the dataset-run path). */
function attachScores(client: LangfuseClient, traceId: string, r: EvalResult): void {
  for (const s of itemScores(r)) {
    try {
      client.score.create({ traceId, name: s.name, value: s.value, dataType: 'NUMERIC' });
    } catch {
      // best-effort — never let a score failure break the eval.
    }
  }
}
