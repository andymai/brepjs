import type { GetPromptResult, Prompt } from '@modelcontextprotocol/sdk/types.js';

interface PromptDef extends Prompt {
  readonly render: (args: Readonly<Record<string, string>>) => string;
}

const PROMPTS: readonly PromptDef[] = [
  {
    name: 'inspect-building',
    title: 'Inspect a building',
    description:
      'Open a building model, summarize it by storey and category, and look at it: one view colored by category and a plan per storey.',
    arguments: [
      {
        name: 'path',
        description: 'The families program (.tsx/.ts) or .ifc file to open.',
        required: true,
      },
    ],
    render: ({ path }) =>
      [
        `Inspect the building model at ${path ?? ''} with the brep-mcp session tools.`,
        '',
        `1. Call open_model with path "${path ?? ''}". If it fails, report its diagnostics and stop.`,
        '2. Summarize the result: the element count, then the counts by storey and by category. Mention any diagnostics, especially UNKEYED_ELEMENTS and ELEMENT_GEOMETRY_FAILED.',
        '3. Call render_view with colorBy "category" and report the legend.',
        '4. For each storey in byStorey other than "(none)", call render_view with plan: { storey } and describe what the plan shows.',
        '5. Finish with a short summary: what the building contains, anything that failed to build, and anything that looks wrong in the pictures.',
      ].join('\n'),
  },
  {
    name: 'edit-and-verify',
    title: 'Edit and verify',
    description:
      "Make one change to an open model's program, rebuild, and check that the diff touches only the intended elements.",
    arguments: [
      { name: 'sessionId', description: 'The session from open_model.', required: true },
      { name: 'change', description: 'The change to make, in words.', required: true },
    ],
    render: ({ sessionId, change }) =>
      [
        `Make this change to session ${sessionId ?? ''}: ${change ?? ''}`,
        '',
        '1. Find the elements the change is about with query_elements, narrowing where until the breakdown matches what you expect, and read them with get_elements. Note the buildHash.',
        '2. Find where those elements are authored in the program source (search for their keys or the family props) and edit it with your file tools. Change nothing else.',
        `3. Call rebuild with sessionId "${sessionId ?? ''}". If ok is false, fix what it reports and rebuild again; the session keeps the last good build meanwhile.`,
        '4. Check the diff: every id in changed, added and removed should be one you meant to touch. Explain or undo anything else. If nextOffset is set, page through the rest with get_diff.',
        '5. Call render_view with highlight set to the changed ids and confirm the picture shows the change.',
        '6. Report what changed, with the prop before and after values and the volume and bounds deltas from the diff.',
      ].join('\n'),
  },
];

export function listPrompts(): Prompt[] {
  return PROMPTS.map(({ render: _render, ...prompt }) => prompt);
}

/** The prompt's messages, or undefined for an unknown name. Throws on a missing argument. */
export function getPrompt(
  name: string,
  args: Readonly<Record<string, string>> = {}
): GetPromptResult | undefined {
  const prompt = PROMPTS.find((p) => p.name === name);
  if (prompt === undefined) return undefined;
  const missing = (prompt.arguments ?? []).filter((a) => a.required && !args[a.name]);
  if (missing.length > 0) {
    throw new Error(`prompt '${name}' needs ${missing.map((a) => a.name).join(', ')}`);
  }
  return {
    ...(prompt.description !== undefined ? { description: prompt.description } : {}),
    messages: [{ role: 'user', content: { type: 'text', text: prompt.render(args) } }],
  };
}
