import { readFileSync } from 'node:fs';
import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { formatDigest, type MetricsDigest } from './metrics.js';

// Multimodal judge: given the rendered views of a generated part plus the original
// request + rubric, decide whether the geometry matches. Verdict is a structured
// output (messages.parse + Zod) so the score is a clean boolean, not parsed prose.

const JUDGE_SYSTEM = `You are a meticulous CAD reviewer. You are shown rendered views (iso / front / top / right) of a 3D part a model produced from a natural-language request, along with the request and a rubric describing what a correct part must show.

Judge ONLY whether the rendered geometry matches the request and rubric: the right features are present (holes, walls, grooves, fillets, slots), the overall shape is right, and proportions are roughly correct. Ignore color, lighting, camera, and exact dimensions you cannot measure from a render. Be strict about missing or wrong features — a bored hole that isn't there, a hollow part rendered solid, or the wrong overall form is a fail.

You may also be given "Measured facts" computed deterministically from the kernel (exact body count, and which bodies sit apart vs touch/overlap). Treat these as ground truth the render cannot show, and reconcile them with what you see — if the facts report N bodies, confirm you see N. A reported interference is ambiguous on its own: decide from the request and image whether it is an intended assembly (e.g. an exploded view or a part that legitimately overlaps another) or an accidental collision. Also judge manufacturability: whether the part reads as a producible object (no zero-thickness walls, stray disconnected bodies, or self-colliding geometry the request did not ask for).`;

const VERDICT = z.object({
  pass: z.boolean().describe('true only if the rendered part matches the request and rubric'),
  manufacturable: z
    .boolean()
    .describe('true if the part reads as producible; false for zero-thickness walls, stray/colliding bodies, or other unmanufacturable geometry the request did not ask for'),
  usedMetrics: z
    .boolean()
    .describe('true if the measured facts (body count / relations) changed your verdict versus the images alone'),
  reason: z.string().describe('one sentence citing the deciding feature(s)'),
});
export type Verdict = z.infer<typeof VERDICT>;

export interface JudgeInput {
  prompt: string;
  rubric: string;
  pngPaths: readonly string[];
  model: string;
  /** Deterministic metrics the render can't show; rendered into the user message as ground truth. */
  metrics?: MetricsDigest;
}

export async function judge(client: Anthropic, input: JudgeInput): Promise<Verdict> {
  const images = input.pngPaths.slice(0, 4).map((p) => ({
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: 'image/png' as const,
      data: readFileSync(p).toString('base64'),
    },
  }));

  const response = await client.messages.parse(
    {
      model: input.model,
      max_tokens: 1024,
      // Frozen across every prompt → cache it (prefix match; verify via cache_read_input_tokens).
      system: [{ type: 'text', text: JUDGE_SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [
        {
          role: 'user',
          content: [
            ...images,
            {
              type: 'text',
              text:
                `Request:\n${input.prompt}\n\nRubric (must be satisfied):\n${input.rubric}\n\n` +
                (input.metrics ? `${formatDigest(input.metrics)}\n\n` : '') +
                `Does the rendered part satisfy the request and rubric?`,
            },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(VERDICT) },
    },
    { signal: AbortSignal.timeout(120_000) }
  );

  return (
    response.parsed_output ?? {
      pass: false,
      manufacturable: false,
      usedMetrics: false,
      reason: 'judge returned no parseable verdict',
    }
  );
}
