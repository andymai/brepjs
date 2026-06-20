import { readFileSync } from 'node:fs';
import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

// Multimodal judge: given the rendered views of a generated part plus the original
// request + rubric, decide whether the geometry matches. Verdict is a structured
// output (messages.parse + Zod) so the score is a clean boolean, not parsed prose.

const JUDGE_SYSTEM = `You are a meticulous CAD reviewer. You are shown rendered views (iso / front / top / right) of a 3D part a model produced from a natural-language request, along with the request and a rubric describing what a correct part must show.

Judge ONLY whether the rendered geometry matches the request and rubric: the right features are present (holes, walls, grooves, fillets, slots), the overall shape is right, and proportions are roughly correct. Ignore color, lighting, camera, and exact dimensions you cannot measure from a render. Be strict about missing or wrong features — a bored hole that isn't there, a hollow part rendered solid, or the wrong overall form is a fail.`;

const VERDICT = z.object({
  pass: z.boolean().describe('true only if the rendered part matches the request and rubric'),
  reason: z.string().describe('one sentence citing the deciding feature(s)'),
});
export type Verdict = z.infer<typeof VERDICT>;

export interface JudgeInput {
  prompt: string;
  rubric: string;
  pngPaths: readonly string[];
  model: string;
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
              text: `Request:\n${input.prompt}\n\nRubric (must be satisfied):\n${input.rubric}\n\nDoes the rendered part satisfy the request and rubric?`,
            },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(VERDICT) },
    },
    { signal: AbortSignal.timeout(120_000) }
  );

  return response.parsed_output ?? { pass: false, reason: 'judge returned no parseable verdict' };
}
