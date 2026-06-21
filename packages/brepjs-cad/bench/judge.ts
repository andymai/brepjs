import { readFileSync } from 'node:fs';
import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { formatDigest, type MetricsDigest } from './metrics.js';

// Multimodal judge: given the rendered views of a generated part plus the original
// request + rubric, decide whether the geometry matches. Verdict is a structured
// output (messages.parse + Zod) so the score is a clean boolean, not parsed prose.

const JUDGE_SYSTEM = `You are a meticulous CAD reviewer. You are shown rendered views (iso / front / top / right, plus an xray pass that shows internal features — bores, cavities, shelled walls — through a translucent body) of a 3D part a model produced from a natural-language request, along with the request and a rubric describing what a correct part must show. Use the xray to confirm internal features the opaque views can't show.

Judge ONLY whether the rendered geometry matches the request and rubric: the right features are present (holes, walls, grooves, fillets, slots), the overall shape is right, and proportions are roughly correct. Ignore color, lighting, camera, and exact dimensions you cannot measure from a render. Be strict about missing or wrong features — a bored hole that isn't there, a hollow part rendered solid, or the wrong overall form is a fail.

You may also be given "Measured facts" computed deterministically from the kernel (exact body count, and which bodies sit apart vs touch/overlap). Treat these as ground truth the render cannot show, and reconcile them with what you see — if the facts report N bodies, confirm you see N. A reported interference is ambiguous on its own: decide from the request and image whether it is an intended assembly (e.g. an exploded view or a part that legitimately overlaps another) or an accidental collision. Also judge manufacturability: whether the part reads as a producible object (no zero-thickness walls, stray disconnected bodies, or self-colliding geometry the request did not ask for).

Work in this order. FIRST decompose the request into its named features — the holes, bores, walls, bodies, blades, teeth, slots, fillets, etc. it implies — and grade EACH one for \`present\` (legible in the render) and \`correct\` (right count / form / proportion, not faked or distorted), reconciling any count against the measured facts. THEN set \`pass\` true only if every feature the request requires is present and correct; base \`reason\` on the decisive feature(s), naming any that are missing or wrong. Decomposing first guards against a "looks roughly right" pass and against hallucinating features that aren't there.`;

const VERDICT = z.object({
  features: z
    .array(
      z.object({
        name: z
          .string()
          .describe(
            'a feature the request implies, e.g. "motor bore", "ring of twisted blades", "4 corner holes"'
          ),
        present: z.boolean().describe('present and legible in the render'),
        correct: z
          .boolean()
          .describe('right count / form / proportion — false if wrong-count, distorted, or faked'),
      })
    )
    .describe(
      'decompose the request into its named features and grade EACH before the overall verdict'
    ),
  pass: z
    .boolean()
    .describe('true only if every feature the request requires is present and correct'),
  manufacturable: z
    .boolean()
    .describe(
      'true if the part reads as producible; false for zero-thickness walls, stray/colliding bodies, or other unmanufacturable geometry the request did not ask for'
    ),
  usedMetrics: z
    .boolean()
    .describe(
      'true if the measured facts (body count / relations) changed your verdict versus the images alone'
    ),
  reason: z
    .string()
    .describe('one sentence citing the deciding feature(s), naming any missing or wrong'),
});
export type Verdict = z.infer<typeof VERDICT>;

/** The features the judge marked missing or incorrect — actionable specifics for the retry/heal loop. */
export function missingFeatures(v: Verdict): string[] {
  return v.features.filter((f) => !f.present || !f.correct).map((f) => f.name);
}

export interface JudgeInput {
  prompt: string;
  rubric: string;
  pngPaths: readonly string[];
  model: string;
  /** Deterministic metrics the render can't show; rendered into the user message as ground truth. */
  metrics?: MetricsDigest;
}

export async function judge(client: Anthropic, input: JudgeInput): Promise<Verdict> {
  // Up to 6 views — the four orthographic shots plus the xray internal pass (and any extra recipe
  // shot). The xray reveals bores/cavities the opaque views can't, so it must reach the judge.
  const images = input.pngPaths.slice(0, 6).map((p) => ({
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
      features: [],
      pass: false,
      manufacturable: false,
      usedMetrics: false,
      reason: 'judge returned no parseable verdict',
    }
  );
}
