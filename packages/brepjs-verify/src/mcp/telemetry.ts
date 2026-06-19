/**
 * Optional Langfuse tracing for MCP `run_program` executions — a strictly best-effort side channel,
 * exactly like the `BREPJS_RUN_RECORD_PATH` JSONL record. The @langfuse / OpenTelemetry packages are
 * NOT runtime dependencies of the shipped MCP: they are *dynamically* imported, and only when the
 * `LANGFUSE_*` keys are present. So the server never hard-requires telemetry — no keys (or the deps
 * simply absent in a published install) → {@link traceRun} is a silent no-op. It never throws.
 */

import { buildRunRecord } from '../sandbox/runRecord.js';
import type { RunProgramResult } from '../sandbox/runProgram.js';

interface Tracer {
  trace: (code: string, result: RunProgramResult) => Promise<void>;
}

// Single lazily-initialised tracer for the server's lifetime (cached promise — the OTel SDK + client
// are started once, on the first traced run, not per call).
let tracerPromise: Promise<Tracer | null> | undefined;

async function initTracer(): Promise<Tracer | null> {
  if (!process.env['LANGFUSE_PUBLIC_KEY'] || !process.env['LANGFUSE_SECRET_KEY']) return null;
  try {
    const [{ NodeSDK }, otel, { startActiveObservation }, { LangfuseClient }] = await Promise.all([
      import('@opentelemetry/sdk-node'),
      import('@langfuse/otel'),
      import('@langfuse/tracing'),
      import('@langfuse/client'),
    ]);
    const processor = new otel.LangfuseSpanProcessor();
    const sdk = new NodeSDK({ spanProcessors: [processor] });
    sdk.start();
    const client = new LangfuseClient();
    return {
      trace: async (code, result) => {
        const rec = buildRunRecord(code, result);
        // Sync callback → startActiveObservation returns a non-Promise (not awaited); the span ends
        // synchronously and the explicit flush below delivers it + the score.
        startActiveObservation('run_program', (obs) => {
          obs.update({
            input: { code },
            output: { outcome: rec.outcome, ok: rec.ok, measurements: rec.measurements },
            metadata: { source: 'mcp', resultHash: rec.resultHash },
          });
          try {
            client.score.create({
              traceId: obs.traceId,
              name: 'ok',
              value: rec.ok ? 1 : 0,
              dataType: 'NUMERIC',
            });
          } catch {
            // best-effort — a score failure must never affect the run.
          }
        });
        // Per-call flush: the MCP server is long-running and may be killed without a clean shutdown,
        // so deliver each run's span + score now rather than rely on batch/exit flushing. Settled so
        // a flush hiccup (or a processor without forceFlush) can't reject.
        await Promise.allSettled([processor.forceFlush(), client.flush()]);
      },
    };
  } catch (e) {
    // Optional deps absent or init failed → telemetry stays off; the MCP is unaffected.
    console.warn(`langfuse: MCP tracing unavailable (${(e as Error).message.split('\n')[0]})`);
    return null;
  }
}

/**
 * Trace one `run_program` execution to Langfuse (best-effort; no-op without the `LANGFUSE_*` keys or
 * the optional telemetry deps). Never throws — callers fire-and-forget it as a side channel.
 */
export async function traceRun(code: string, result: RunProgramResult): Promise<void> {
  try {
    const tracer = await (tracerPromise ??= initTracer());
    await tracer?.trace(code, result);
  } catch (e) {
    console.warn(`langfuse: traceRun failed (${(e as Error).message.split('\n')[0]})`);
  }
}
