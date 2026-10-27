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
        "2. Open the file and line in each element's source field from get_elements (without one, search the program for its key) and edit it with your file tools. Change nothing else.",
        `3. Call rebuild with sessionId "${sessionId ?? ''}". If ok is false, fix what it reports and rebuild again; the session keeps the last good build meanwhile.`,
        '4. Check the diff: every id in changed, added and removed should be one you meant to touch. Explain or undo anything else. If nextOffset is set, page through the rest with get_diff.',
        '5. Call render_view with highlight set to the changed ids and confirm the picture shows the change.',
        '6. Report what changed, with the prop before and after values and the volume and bounds deltas from the diff.',
      ].join('\n'),
  },
  {
    name: 'quantity-takeoff',
    title: 'Quantity takeoff',
    description:
      'Schedule the quantities of one category of elements, totalled per storey, optionally written to CSV.',
    arguments: [
      { name: 'sessionId', description: 'The session from open_model.', required: true },
      {
        name: 'category',
        description: 'The category to take off, e.g. wall or SLAB.',
        required: true,
      },
      { name: 'outPath', description: 'Where to write the CSV (optional).', required: false },
    ],
    render: ({ sessionId, category, outPath }) =>
      [
        `Take off the ${category ?? ''} quantities in session ${sessionId ?? ''}.`,
        '',
        `1. Call list_schedulable_fields with where: { category: "${category ?? ''}" }. Pick the quantity fields that matter (lengths, areas, volumes), plus name and storey.`,
        `2. Call schedule with those fields, groupBy ["storey"] and sortBy ["storey"]${outPath ? `, and outPath "${outPath}"` : ''}.`,
        '3. Report the totals per storey and overall with their units (the units field), and name the fields whose count is below matched: those elements have no value for them.',
      ].join('\n'),
  },
  {
    name: 'compare-revisions',
    title: 'Compare revisions',
    description:
      'Compare two open models, such as two revisions of an IFC file, summarize what changed, and show it.',
    arguments: [
      { name: 'from', description: 'The earlier session.', required: true },
      { name: 'to', description: 'The later session.', required: true },
    ],
    render: ({ from, to }) =>
      [
        `Compare session ${from ?? ''} (earlier) with session ${to ?? ''} (later).`,
        '',
        `1. Call compare_models with from "${from ?? ''}" and to "${to ?? ''}". Page through the rest with offset while nextOffset is set.`,
        `2. Read the added and changed elements with get_elements on session ${to ?? ''}, and the removed ones on session ${from ?? ''}, with fields [] to get their names and categories.`,
        '3. Summarize by category: what was added, removed and changed, and for changes, which props, psets or quantities moved and by how much.',
        `4. Call render_view on session ${to ?? ''} with highlight set to the added and changed ids, and describe where in the building the changes are.`,
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
