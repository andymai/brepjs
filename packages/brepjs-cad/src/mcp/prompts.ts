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
        `1. Call compare_models with from "${from ?? ''}" and to "${to ?? ''}". While nextOffset is set, page through the rest with offset, passing fromBuild and toBuild from the first page's from.buildHash and to.buildHash.`,
        `2. Read the added and changed elements with get_elements on session ${to ?? ''}, and the removed ones on session ${from ?? ''}, with fields [] to get their names and categories.`,
        '3. Summarize by category: what was added, removed and changed, and for changes, which props, psets or quantities moved and by how much.',
        `4. Call render_view on session ${to ?? ''} with highlight set to the added and changed ids, and describe where in the building the changes are.`,
      ].join('\n'),
  },
  {
    name: 'ifc-review',
    title: 'Review an IFC file',
    description:
      "Open an IFC file, check it, look at what fails, and raise each problem as a BCF issue the file's author can open in their own tool.",
    arguments: [
      { name: 'path', description: 'The .ifc file to review.', required: true },
      { name: 'outPath', description: 'The .bcf file to write the issues to.', required: true },
      {
        name: 'author',
        description: 'Who the issues are from, usually an email address (optional).',
        required: false,
      },
    ],
    render: ({ path, outPath, author }) =>
      [
        `Review the IFC file at ${path ?? ''} and raise its problems as BCF issues in ${outPath ?? ''}.`,
        '',
        `1. Call open_model with path "${path ?? ''}". If it fails, report its diagnostics and stop. Note the element counts and any build diagnostics.`,
        '2. Call validate_model on the session. While nextOffset is set, page through the rest with offset.',
        '3. Group the findings by code. For each group, read the elements it names with get_elements and render_view them with highlight, so you know what the problem is and where it is.',
        `4. For each problem worth raising, call create_issue with outPath "${outPath ?? ''}", a title that names the problem, a description with the code, the message and what should change, elements set to the ids it concerns, priority "High" for errors and "Normal" for warnings, and labels set to the check${author ? `, and author "${author}"` : ''}. Raise one issue per problem, not one per finding: a code on several elements is one issue unless they need separate fixes. A model-wide finding with no element (missing georeferencing, say) is one issue with no elements.`,
        '5. Report the issues raised, with their titles and element counts, the findings you chose not to raise and why, and the path of the BCF file.',
      ].join('\n'),
  },
  {
    name: 'model-check',
    title: 'Check and fix a model',
    description:
      'Check a families model the way its IFC export will be checked, fix what the program can fix, and work through BCF issues raised on it.',
    arguments: [
      { name: 'sessionId', description: 'The families session from open_model.', required: true },
      {
        name: 'issues',
        description: 'A .bcf file of issues raised on its last export (optional).',
        required: false,
      },
    ],
    render: ({ sessionId, issues }) =>
      [
        `Check the model in session ${sessionId ?? ''} and fix what you can in its program.`,
        '',
        `1. Call validate_model with sessionId "${sessionId ?? ''}" and minSeverity "warning". While nextOffset is set, page through the rest with offset.`,
        ...(issues
          ? [
              `2. Call export_ifc so the session knows its GlobalIds, then read_issues with path "${issues}" and sessionId "${sessionId ?? ''}". While nextOffset is set, page through the rest with offset. Take the topics whose status is not closed or resolved; each viewpoint's selection gives the ids it concerns, and a list with componentsTotal is cut short, so read that topic again with topic set to its guid for all of them.`,
            ]
          : ['2. (No issues file was given.)']),
        "3. For each finding or issue on an element, read it with get_elements: its source field is the file and line that author it. Decide the fix from the finding's code and message, or the issue's description and comments.",
        `4. Make the fixes in the program, then call rebuild with sessionId "${sessionId ?? ''}". Check that the diff touches only the elements you meant to change, and render_view them with highlight.`,
        '5. Call validate_model again and repeat until no error remains that the program can fix.',
        '6. Report each finding and issue with what you changed (file and line, value before and after), and list the ones you left open and why.',
      ].join('\n'),
  },
  {
    name: 'export-deliverables',
    title: 'Export deliverables',
    description:
      'Check a families model and write its handover set: a validated IFC file, COBie sheets, a DXF and SVG plan per storey, and schedule CSVs.',
    arguments: [
      { name: 'sessionId', description: 'The families session from open_model.', required: true },
      { name: 'outDir', description: 'The directory to write everything to.', required: true },
    ],
    render: ({ sessionId, outDir }) =>
      [
        `Write the deliverables for session ${sessionId ?? ''} to ${outDir ?? ''}.`,
        '',
        `1. Call validate_model with sessionId "${sessionId ?? ''}" and minSeverity "error", paging with offset while nextOffset is set. If any error remains, report the errors and stop: a deliverable set should not ship a model that fails its checks.`,
        `2. Call export_ifc with outPath "${outDir ?? ''}/model.ifc". Note the project it used and pass the same project to export_cobie.`,
        `3. Call export_cobie with outDir "${outDir ?? ''}/cobie".`,
        `4. Call query_elements with where: { category: "storey" }. For each storey, call plan_view with outPath "${outDir ?? ''}/plans/<storey>.dxf", then again with "${outDir ?? ''}/plans/<storey>.svg", using the storey's name with spaces replaced by dashes.`,
        `5. Call list_schedulable_fields, then schedule each main category (walls, slabs, doors, windows, spaces: whichever the model has) with its name, storey and quantity fields, grouped by storey, to "${outDir ?? ''}/schedules/<category>.csv".`,
        '6. Report every file written with its path, the warnings validate_model and export_ifc returned, and anything that was skipped.',
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
