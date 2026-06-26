import { readFileSync } from 'node:fs';
import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { formatDigest, type MetricsDigest } from './metrics.js';

// Multimodal judge: given the rendered views of a generated part plus the original
// request + rubric, decide whether the geometry matches. Verdict is a structured
// output (messages.parse + Zod) so the score is a clean boolean, not parsed prose.

const JUDGE_SYSTEM = `You are a meticulous CAD reviewer. You are shown rendered views (iso / front / top / right, an xray pass that shows internal features — bores, cavities, shelled walls — through a translucent body, when the part has a bore an aimed section cut that opens it as a clean cross-section, and for a multi-body or bored part a marked view labelling each body B<index> (the same 0-based index the measured facts use, e.g. B0, B1) and each bore (H1, H2, …) at its location) of a 3D part a model produced from a natural-language request, along with the request and a rubric describing what a correct part must show. Use the xray and the section to confirm internal features and wall thickness the opaque views can't show, and cite the B#/H# labels when a feature is missing or wrong.

Judge ONLY whether the rendered geometry matches the request and rubric: the right features are present (holes, walls, grooves, fillets, slots), the overall shape is right, and proportions are roughly correct. Ignore color, lighting, camera, and exact dimensions you cannot measure from a render. Be strict about missing or wrong features — a bored hole that isn't there, a hollow part rendered solid, or the wrong overall form is a fail.

You may also be given "Measured facts" computed deterministically from the kernel (exact body count, which bodies sit apart vs touch/overlap, and the count of internal bores with their smallest radius). Treat these as ground truth the render cannot show, and reconcile them with what you see — if the facts report N bodies or B internal bores, confirm you see them (the xray view exposes bores). A reported interference is ambiguous on its own: decide from the request and image whether it is an intended assembly (e.g. an exploded view or a part that legitimately overlaps another) or an accidental collision. The bore count can over-report (a boss/seam cylinder is sometimes miscounted as a bore), so the IMAGE is decisive when the facts and what you see disagree about whether an internal hole exists. Also judge manufacturability: whether the part reads as a producible object (no zero-thickness walls, stray disconnected bodies, or self-colliding geometry the request did not ask for).

When a REFERENCE exemplar is shown — a known-good build of the SAME request, rendered the same way — additionally grade the candidate's quality RELATIVE to it: 'worse', 'on-par', or 'better' on form, proportion, feature fidelity, and finish (NOT on size/scale alone — a uniformly larger or smaller part of the same form is 'on-par'). \`pass\` stays the absolute floor (every required feature present + correct); \`quality\` is the gradient ABOVE the floor, so a part can pass yet be 'worse' (e.g. grotesque proportions, a barely-there wall, or a coarse approximation of a feature the reference renders cleanly). Set \`quality\` to null only when no reference is shown.

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
  quality: z
    .enum(['worse', 'on-par', 'better'])
    .nullable()
    .describe(
      "candidate quality RELATIVE to the reference exemplar (form/proportion/feature-fidelity/finish, NOT size); null when no reference is shown. A part can `pass` yet be 'worse'."
    ),
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
  /** Renders of a known-good exemplar of the SAME request. When present, the judge grades the
   * candidate's `quality` relative to it — the gradient above the absolute `pass` floor. */
  referencePngPaths?: readonly string[];
}

// One image content block per PNG (base64-inlined). Up to 8 views — the four orthographic shots, the
// xray internal pass, the aimed section, and the marked view. The xray/section reveal internals the
// opaque views can't; the marks let the judge reference features by id — all must reach the judge.
function toImages(paths: readonly string[]): Anthropic.ImageBlockParam[] {
  return paths.slice(0, 8).map((p) => ({
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: 'image/png' as const,
      data: readFileSync(p).toString('base64'),
    },
  }));
}

export async function judge(client: Anthropic, input: JudgeInput): Promise<Verdict> {
  const reference = input.referencePngPaths ?? [];
  // Label the candidate group, then (when present) the reference group, so the model never confuses
  // which renders it is grading — the relative `quality` axis depends on that separation.
  const content: Anthropic.ContentBlockParam[] = [
    { type: 'text', text: 'CANDIDATE part renders:' },
    ...toImages(input.pngPaths),
  ];
  if (reference.length > 0) {
    content.push(
      {
        type: 'text',
        text: 'REFERENCE exemplar renders (a known-good build of the SAME request — grade the candidate relative to this):',
      },
      ...toImages(reference)
    );
  }
  content.push({
    type: 'text',
    text:
      `Request:\n${input.prompt}\n\nRubric (must be satisfied):\n${input.rubric}\n\n` +
      (input.metrics ? `${formatDigest(input.metrics)}\n\n` : '') +
      (reference.length > 0
        ? `Does the candidate satisfy the request and rubric, and how does its quality compare to the reference?`
        : `Does the rendered part satisfy the request and rubric?`),
  });

  const response = await client.messages.parse(
    {
      model: input.model,
      max_tokens: 1024,
      // Frozen across every prompt → cache it (prefix match; verify via cache_read_input_tokens).
      system: [{ type: 'text', text: JUDGE_SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content }],
      output_config: { format: zodOutputFormat(VERDICT) },
    },
    { signal: AbortSignal.timeout(120_000) }
  );

  const verdict = response.parsed_output ?? {
    features: [],
    pass: false,
    quality: null,
    manufacturable: false,
    usedMetrics: false,
    reason: 'judge returned no parseable verdict',
  };
  // With no reference shown the relative grade is meaningless — force null so a spurious model
  // 'worse' can't block the loop's convergence (preserves the no-reference back-compat path).
  return reference.length === 0 ? { ...verdict, quality: null } : verdict;
}
