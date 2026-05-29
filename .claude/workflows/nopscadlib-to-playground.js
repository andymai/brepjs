export const meta = {
  name: 'nopscadlib-to-playground',
  description:
    'Survey NopSCADlib (GPLv3, reference-only) and produce validated brepjs playground examples via clean-room reimplementation',
  whenToUse:
    'Generate brepjs playground examples inspired by NopSCADlib models. Requires the reference clone at tmp/nopscadlib (gitignored).',
  phases: [
    { title: 'Survey', detail: 'rank NopSCADlib models by translatability' },
    { title: 'Translate', detail: 'clean-room reimplement + eval/mesh-validate each model' },
    { title: 'Synthesize', detail: 'write nopscadExamples.ts + translation report' },
  ],
};

// ── Tunables (override via args) ──────────────────────────────────────────
// args: { limit?: number, ids?: string[], categories?: string[], dryRun?: boolean }
// Normalize defensively: args may arrive as an object, a JSON string, or be
// absent. A bare string that isn't JSON is ignored rather than throwing.
let OPTS = {};
if (args && typeof args === 'object') {
  OPTS = args;
} else if (typeof args === 'string' && args.trim()) {
  try {
    OPTS = JSON.parse(args);
  } catch {
    OPTS = {};
  }
}
log(`args received: ${JSON.stringify(args) ?? 'undefined'} → using ${JSON.stringify(OPTS)}`);

const LIMIT = OPTS.limit ?? 8;
const FORCED_IDS = OPTS.ids ?? null; // skip survey, translate exactly these scad paths
const CATEGORIES = OPTS.categories ?? ['vitamins', 'printed', 'utils'];
const DRY_RUN = OPTS.dryRun ?? false; // if true, synthesis writes a .preview file instead of the real module
const MAX_REPAIRS = 3;

const SRC = 'tmp/nopscadlib';
const CAND_DIR = 'tmp/candidates';
const MODULE_PATH = 'apps/playground/src/lib/nopscadExamples.ts';
const REPORT_PATH = 'tmp/nopscadlib-translation-report.md';

// ── Shared context every agent needs ──────────────────────────────────────
const LICENSE_RULES = `
LICENSING (load-bearing — non-negotiable):
NopSCADlib is GPLv3. brepjs is permissively licensed. You are doing a CLEAN-ROOM
REIMPLEMENTATION, never a port. That means:
- Study the model's GEOMETRY, DIMENSIONS, and INTENT, then write ORIGINAL brepjs code.
- Do NOT copy or transliterate OpenSCAD structure line-by-line. Different decomposition,
  different idioms. If your output reads like a mechanical translation of the .scad, redo it.
- Never paste OpenSCAD source or comments into the output.
- Every example's code MUST open with exactly this attribution line (adjust <model>):
  // Inspired by NopSCADlib's <model> (GPLv3) — independent brepjs reimplementation.
`;

const API_RULES = `
BREPJS PLAYGROUND AUTHORING RULES:
- The example is a self-contained ES module string. It imports ONLY from 'brepjs/quick'
  (and 'color' from 'brepjs/playground' if multiple colors are needed), and ends in
  'export default <shape | shape[]>'. No other imports, no shared helpers.
- 'brepjs/quick' exposes the full brepjs public API with auto-init. Prefer these building blocks:
  primitives: box, cylinder, sphere, cone, torus, polyhedron, polygon
  booleans:   cut, fuse, intersect, cutAll, fuseAll   (all return Result — wrap in unwrap(...))
  modifiers:  fillet, chamfer, shell, draft           (return Result — unwrap)
  sketch/sweep: sketchCircle, sketchRectangle, sketchRoundedRectangle, sketchPolygon,
                sketchLoft, loft, revolve, extrude, sweep
  transforms: translate, rotate (degrees), mirror, scale, compound
  finders:    edgeFinder(), faceFinder()  (e.g. edgeFinder().inDirection('Z').findAll(shape))
  patterns:   linearPattern, circularPattern, rectangularPattern  (for repeated features —
              prefer these over hand loops where they fit; verify the exact signature against
              apps/playground/src/types/brepjs-ambient.d.ts before relying on it)
  measure:    measureVolume, measureArea, measureBoundingBox
  utils:      unwrap, clone, convexHull
- OpenSCAD 'rotate_extrude' maps to revolve (profile sketch revolved about an axis);
  'linear_extrude' maps to extrude; 'hull' of round profiles maps well to convexHull or loft.
- For repeated features you can either use the pattern helpers above OR a plain JS loop that
  pushes shapes into an array and fuseAll/cutAll them (see the pegboard example). If a pattern
  helper's signature is uncertain, the explicit loop is the safe, always-valid fallback.
- box's 'at' option places the box CENTER at that point. cylinder(radius, height, { at }).
- rotate(shape, degrees, { axis, at }). Angles are DEGREES.
- Boolean/modifier ops return Result<T> — always unwrap(...) them. Use 'using' for any
  intermediate shape you measure-then-discard to avoid WASM leaks (see hill-tetrahedron-growth).

HOUSE STYLE (match examples in apps/playground/src/lib/examples.ts):
- Wrap the model in a parametric function with named params + sensible mm defaults, then
  'export default modelName(...)' with the defaults.
- Rich, dimension-annotated comments in the style of the 'pegboard' and 'mortise-tenon'
  examples: explain WHAT each block builds and WHY key dimensions are what they are.
- Self-contained: no TS-only constructs the worker's sucrase strip can't handle is fine
  (it strips types), but no external imports beyond the two allowed specifiers.
`;

const EXAMPLE_REFERENCE = `
A COMPLETE REFERENCE EXAMPLE (this is the exact shape/quality of output expected):

import { box, cutAll, cylinder, unwrap } from 'brepjs/quick';

// Parametric pegboard: any width × height, fixed 25 mm grid, 6 mm pegs.
function pegboard(cols: number, rows: number) {
  const pitch = 25;
  const padding = 12.5;
  const thickness = 6;
  const pegRadius = 3;
  const W = cols * pitch + padding * 2;
  const H = rows * pitch + padding * 2;
  const plate = box(W, H, thickness, { at: [-W / 2, -H / 2, 0] });
  const pegs = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const x = -W / 2 + padding + i * pitch + pitch / 2;
      const y = -H / 2 + padding + j * pitch + pitch / 2;
      pegs.push(cylinder(pegRadius, thickness + 2, { at: [x, y, -1] }));
    }
  }
  return unwrap(cutAll(plate, pegs));
}

export default pegboard(6, 4);
`;

// ── Schemas ───────────────────────────────────────────────────────────────
const SURVEY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['candidates'],
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['scadPath', 'modelName', 'score', 'primaryOps', 'rationale'],
        properties: {
          scadPath: {
            type: 'string',
            description: 'path relative to repo root, e.g. tmp/nopscadlib/printed/knob.scad',
          },
          modelName: { type: 'string', description: 'human label, e.g. "Adjuster knob"' },
          score: { type: 'number', description: '0-100 overall translatability+appeal score' },
          quickExpressible: {
            type: 'number',
            description: '0-100: buildable from the quick API without missing ops',
          },
          recognizable: {
            type: 'number',
            description: '0-100: visually recognizable as a real part',
          },
          selfContained: { type: 'number', description: '0-100: few NopSCADlib cross-module deps' },
          primaryOps: {
            type: 'array',
            items: { type: 'string' },
            description: 'key brepjs ops this would exercise',
          },
          rationale: { type: 'string' },
          risks: {
            type: 'string',
            description: 'what might not translate (threads, minkowski, etc.)',
          },
        },
      },
    },
  },
};

const TRANSLATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'label', 'description', 'code', 'status'],
  properties: {
    id: { type: 'string', description: 'kebab-case, prefixed nopscad-, e.g. nopscad-knob' },
    label: { type: 'string', description: 'command-palette label' },
    description: { type: 'string', description: 'one-line palette description' },
    code: {
      type: 'string',
      description: 'the full self-contained example source, attribution line first',
    },
    status: {
      type: 'string',
      enum: ['validated', 'failed'],
      description: 'validated only if eval+mesh passed',
    },
    validationOutput: {
      type: 'string',
      description: 'tail of the vitest run that proves pass/fail',
    },
    opsUsed: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string', description: 'fidelity caveats / simplifications made' },
  },
};

// ─────────────────────────────────────────────────────────────────────────
phase('Survey');

let ranked;
if (FORCED_IDS) {
  log(`Skipping survey — translating ${FORCED_IDS.length} forced model(s)`);
  ranked = FORCED_IDS.map((scadPath) => ({ scadPath, modelName: scadPath, score: 100 }));
} else {
  const surveys = await parallel(
    CATEGORIES.map(
      (cat) => () =>
        agent(
          `Survey NopSCADlib category "${cat}" for brepjs-translatable models.

The reference clone is at ${SRC}/${cat}/ (GPLv3 — read-only reference). List the *.scad
files there (use Bash: ls ${SRC}/${cat}/*.scad), then read the most promising ones.

Rank models that would make GOOD brepjs playground examples. Score each on:
  - quickExpressible: buildable from the brepjs quick API below WITHOUT missing operations.
    Heavily penalize anything needing threads, minkowski, text-on-surface, gears, or
    sub-millimeter swept profiles brepjs can't easily do.
  - recognizable: a viewer instantly recognizes the part (a knob, a fan, a foot, a bracket).
  - selfContained: minimal include/use of OTHER NopSCADlib modules.
Favor DIVERSE operations across your picks (don't return five boolean-only boxes).

Return up to 8 candidates for this category, best first.
${API_RULES}`,
          { label: `survey:${cat}`, phase: 'Survey', schema: SURVEY_SCHEMA }
        )
    )
  );

  const all = surveys
    .filter(Boolean)
    .flatMap((s) => s.candidates ?? [])
    .filter((c) => c && c.scadPath);
  // Dedup by scadPath, keep highest score.
  const byPath = new Map();
  for (const c of all) {
    const prev = byPath.get(c.scadPath);
    if (!prev || (c.score ?? 0) > (prev.score ?? 0)) byPath.set(c.scadPath, c);
  }
  ranked = [...byPath.values()].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  log(`Surveyed ${ranked.length} unique candidates across ${CATEGORIES.length} categories`);
}

const chosen = ranked.slice(0, LIMIT);
log(`Translating top ${chosen.length}: ${chosen.map((c) => c.modelName).join(', ')}`);

// ─────────────────────────────────────────────────────────────────────────
phase('Translate');

const translated = await parallel(
  chosen.map(
    (cand, i) => () =>
      agent(
        `Clean-room reimplement NopSCADlib model "${cand.modelName}" as a brepjs playground example.

Reference source (GPLv3, study geometry only — DO NOT port): ${cand.scadPath}
Read it now, plus any sibling it includes if you need a dimension. Then design ORIGINAL
brepjs code that reproduces the recognizable form and key parametric controls.

WORKFLOW YOU MUST FOLLOW:
1. Read the .scad and understand the geometry (body, features, holes, fillets/chamfers).
2. Write the example following the authoring + house-style rules below.
3. Write your candidate source to: ${CAND_DIR}/cand-${i}.ts   (use the Write tool; create ${CAND_DIR} via Bash mkdir -p first)
4. Validate it by running EXACTLY:
     CANDIDATE_FILE=${CAND_DIR}/cand-${i}.ts npx vitest run tests/validateCandidate.test.ts --reporter=dot
   This evaluates the example and meshes every returned shape against the real OCCT kernel.
5. If it FAILS (throws, empty mesh, or vitest non-zero): read the error, FIX the brepjs code
   (not the test), rewrite the candidate file, and re-run. Up to ${MAX_REPAIRS} repair attempts.
   Common failures: forgetting unwrap() on a Result; rotate axis/degrees mix-ups; a cut that
   misses; degenerate fillet radius; exporting a Result instead of a shape.
6. Return the FINAL validated source as 'code' with status 'validated'. If you exhaust repairs,
   return your best attempt with status 'failed' and put the error tail in validationOutput.

Set id to "nopscad-<short-kebab>" and write a crisp palette label + one-line description.
${LICENSE_RULES}
${API_RULES}
${EXAMPLE_REFERENCE}`,
        { label: `translate:${cand.modelName}`, phase: 'Translate', schema: TRANSLATE_SCHEMA }
      )
  )
);

const validated = translated.filter(Boolean).filter((t) => t.status === 'validated' && t.code);
const failed = translated.filter(Boolean).filter((t) => t.status !== 'validated');
log(`Validated ${validated.length}/${chosen.length}; ${failed.length} failed`);

// ─────────────────────────────────────────────────────────────────────────
phase('Synthesize');

if (validated.length === 0) {
  log('No validated examples — nothing to synthesize. Check the translation report.');
}

const synthesisResult = await agent(
  `Assemble the validated NopSCADlib-derived examples into the playground module and write a report.

VALIDATED EXAMPLES (JSON):
${JSON.stringify(
  validated.map(({ id, label, description, code, opsUsed, notes }) => ({
    id,
    label,
    description,
    code,
    opsUsed,
    notes,
  })),
  null,
  2
)}

FAILED (for the report only):
${JSON.stringify(
  failed.map(({ id, label, status, validationOutput, notes }) => ({
    id,
    label,
    status,
    validationOutput,
    notes,
  })),
  null,
  2
)}

TASKS:
1. ${DRY_RUN ? `DRY RUN: write the module to ${MODULE_PATH}.preview (do NOT overwrite the real module).` : `Write ${MODULE_PATH}.`}
   It must keep its existing header doc comment (read the current file first), import the
   Example type:  import type { Example } from './examples';
   and export:    export const NOPSCAD_EXAMPLES: readonly Example[] = [ ...one entry per validated example... ];
   Each entry is { id, label, description, code } where 'code' is the validated source as a
   template literal. PRESERVE the attribution line at the top of each code string. Keep entries
   in the order given. Do not alter the validated source otherwise.
2. After writing, run the regression test to prove the whole set still evals+meshes:
     TEST_KERNEL=occt npx vitest run tests/playgroundExamples.test.ts --reporter=dot
   Report the final pass/fail counts. If anything fails, fix the module assembly (escaping,
   backticks inside code) — NOT the validated logic — and re-run.
3. Write a markdown translation report to ${REPORT_PATH} covering: each accepted model
   (id, source .scad, ops exercised, fidelity caveats), each failed model with its reason,
   and a note that all examples are clean-room reimplementations of GPLv3 NopSCADlib models.

Return a short plain-text summary: count written, regression pass/fail, and any caveats.`,
  { label: 'synthesize', phase: 'Synthesize' }
);

return {
  surveyed: ranked.length,
  chosen: chosen.length,
  validated: validated.length,
  failed: failed.length,
  validatedIds: validated.map((v) => v.id),
  failedModels: failed.map((f) => f.label ?? f.id),
  synthesis: synthesisResult,
};
