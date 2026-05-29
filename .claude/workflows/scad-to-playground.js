export const meta = {
  name: 'scad-to-playground',
  description:
    'Survey an OpenSCAD reference library and produce validated brepjs playground examples via clean-room reimplementation',
  whenToUse:
    'Generate brepjs playground examples from an OpenSCAD reference library. Requires the reference clone at tmp/scad-reference (gitignored).',
  phases: [
    { title: 'Survey', detail: 'rank reference models by translatability' },
    { title: 'Translate', detail: 'clean-room reimplement + eval/mesh-validate each model' },
    { title: 'Synthesize', detail: 'append to examples/mechanical.ts + translation report' },
    { title: 'Audit', detail: 'screenshot each example + AI vision gate on resemblance' },
    { title: 'Repair', detail: 'fix examples that render wrong, then re-audit' },
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

const SRC = 'tmp/scad-reference';
const CAND_DIR = 'tmp/candidates';
const MODULE_PATH = 'apps/playground/src/lib/examples/mechanical.ts';
const REPORT_PATH = 'tmp/scad-translation-report.md';

// ── Shared context every agent needs ──────────────────────────────────────
const LICENSE_RULES = `
CLEAN-ROOM REIMPLEMENTATION (load-bearing — non-negotiable):
The reference library may be GPL-licensed; brepjs is permissively licensed. You are doing a
CLEAN-ROOM REIMPLEMENTATION from functional geometry, never a port. That means:
- Study the model's GEOMETRY, DIMENSIONS, and INTENT, then write ORIGINAL brepjs code.
- Do NOT copy or transliterate OpenSCAD structure line-by-line. Different decomposition,
  different idioms. If your output reads like a mechanical translation of the .scad, redo it.
- Never paste OpenSCAD source or comments into the output. Build from dimensions, not text.
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
- FINDER METHODS ARE LIMITED. The ONLY methods that exist are:
    edgeFinder(): inDirection(dir, angle?), parallelTo(dir), ofCurveType(type),
                  ofLength(len, tol?), atDistance(dist, point?), then .find(shape) / .findAll(shape)
    faceFinder(): inDirection(dir, angle?), parallelTo(dir), ofSurfaceType(type),
                  ofArea(area, tol?), atDistance(dist, point?), then .find(shape) / .findAll(shape)
  THERE IS NO inPlane, ofSurface, inBox, atPosition, onPlane, or containsPoint. Do not invent
  finder methods — a wrong method name throws "X is not a function" and your defensive try/catch
  won't catch it (it throws while BUILDING the finder, before the op runs). To fillet the top
  rim of a cylinder, the robust route is NOT a finder — intersect with a large sphere, or
  fillet ALL edges (edgeFinder().findAll(shape)) when that's acceptable.
- OpenSCAD 'rotate_extrude' maps to revolve — BUT revolve() of a profile whose points TOUCH the
  axis (x=0) is degenerate and only sweeps a partial arc. Build rounded/turned posts from
  primitives instead (cylinder ∩ sphere for a domed top, cylinder + fillet, cone for a taper).
  'linear_extrude' maps to extrude; 'hull' of round profiles maps to convexHull or loft.
- For repeated features use the pattern helpers above OR a plain JS loop that pushes shapes into
  an array and fuseAll/cutAll them. If a pattern helper's signature is uncertain, the explicit
  loop is the safe, always-valid fallback.
- 'at' IS THE CENTRE of the primitive, NOT an OpenSCAD-style corner. box(w, d, h, { at }) centres
  the box at that point; cylinder(r, h, { at }) puts its base centre there. To centre a plate on
  the origin use { at: [0, 0, h/2] } — NEVER { at: [-w/2, -d/2, 0] } (that shoves it into a
  corner so other origin-centred parts float off to the side; this was the #1 bug last run).
- rotate(shape, degrees, { axis, at }). Angles are DEGREES.
- Boolean/modifier ops return Result<T> — always unwrap(...) them. Do NOT wrap a finishing op in
  isOk()/.ok with a fallback to the pre-op shape — that silently ships an unfinished part and the
  regression suite bans it. Use 'using' for any intermediate shape you measure-then-discard.

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

// Parametric pegboard: any cols × rows, fixed 25 mm grid, 6 mm pegs.
// NOTE the placement idiom: the plate is centred on the origin with
// { at: [0, 0, thickness/2] }, and every peg is positioned about the origin
// too — so all parts share one coordinate frame and nothing floats off-centre.
function pegboard(cols: number, rows: number) {
  const pitch = 25;
  const padding = 12.5;
  const thickness = 6;
  const pegRadius = 3;
  const W = cols * pitch + padding * 2;
  const H = rows * pitch + padding * 2;
  // Plate centred on the origin (at = CENTRE of the box).
  const plate = box(W, H, thickness, { at: [0, 0, thickness / 2] });
  const pegs = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      // Peg centres laid out symmetrically about the origin.
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
            description: 'path relative to repo root, e.g. tmp/scad-reference/printed/knob.scad',
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
          selfContained: {
            type: 'number',
            description: '0-100: few cross-module deps in the reference',
          },
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
    id: { type: 'string', description: 'short kebab-case, no source prefix, e.g. knob, fan-guard' },
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

const SYNTH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['writtenIds', 'regressionPassed'],
  properties: {
    writtenIds: {
      type: 'array',
      items: { type: 'string' },
      description:
        'exact example ids actually written into the module (only those that survived assembly + regression)',
    },
    regressionPassed: { type: 'boolean' },
    summary: { type: 'string', description: 'counts + any caveats' },
  },
};

const AUDIT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdicts'],
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'looksRight', 'issues'],
        properties: {
          id: { type: 'string' },
          looksRight: {
            type: 'boolean',
            description:
              'true only if the render clearly resembles the real part with no obvious defect',
          },
          issues: {
            type: 'string',
            description:
              'concrete visual problems: off-centre/floating parts, missing promised features, degenerate/partial geometry, blank viewport. Empty if looksRight.',
          },
        },
      },
    },
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
          `Survey reference-library category "${cat}" for brepjs-translatable models.

The reference clone is at ${SRC}/${cat}/ (GPLv3 — read-only reference). List the *.scad
files there (use Bash: ls ${SRC}/${cat}/*.scad), then read the most promising ones.

Rank models that would make GOOD brepjs playground examples. Score each on:
  - quickExpressible: buildable from the brepjs quick API below WITHOUT missing operations.
    Heavily penalize anything needing threads, minkowski, text-on-surface, gears, or
    sub-millimeter swept profiles brepjs can't easily do.
  - recognizable: a viewer instantly recognizes the part (a knob, a fan, a foot, a bracket).
  - selfContained: minimal include/use of OTHER reference modules.
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
        `Clean-room reimplement reference model "${cand.modelName}" as a brepjs playground example.

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

Set id to a short kebab-case slug with no source prefix (e.g. "fan-guard", "knob")
and write a crisp palette label + one-line description.
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
  `Assemble the validated examples into the playground module and write a report.

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
1. ${DRY_RUN ? `DRY RUN: write the module to ${MODULE_PATH}.preview (do NOT touch the real module).` : `APPEND your entries to the existing ${MODULE_PATH}.`}
   Read the current file first. It already has a header doc comment, the import
   \`import type { Example } from './types';\`, and exports
   \`export const MECHANICAL_EXAMPLES: readonly Example[] = [ ... ];\`. Insert your new
   entries INSIDE that existing array (before its closing \`];\`) — do not create a
   second export, change the export name, or drop the entries already there.
   Each entry is { id, label, description, code } where 'code' is the validated source as a
   template literal. PRESERVE the attribution line at the top of each code string. Keep new
   entries in the order given. Do not alter any existing entry or the validated source.
2. After writing, run the regression test to prove the whole set still evals+meshes:
     TEST_KERNEL=occt npx vitest run tests/playgroundExamples.test.ts --reporter=dot
   Report the final pass/fail counts. If anything fails, fix the module assembly (escaping,
   backticks inside code) — NOT the validated logic — and re-run.
3. Write a markdown translation report to ${REPORT_PATH} covering: each accepted model
   (id, source .scad, ops exercised, fidelity caveats), each failed model with its reason,
   and a note that all examples are clean-room reimplementations built from reference dimensions.

Return the EXACT list of example ids you actually wrote into the module (some
validated candidates may be dropped here if assembly or the regression run
rejects them — report only what survived), the regression pass/fail, and caveats.`,
  { label: 'synthesize', phase: 'Synthesize', schema: SYNTH_SCHEMA }
);

// What synthesis actually committed to the module — the source of truth for the
// audit, NOT the in-memory `validated` list (they can diverge when synthesis
// drops a candidate during assembly).
const writtenIds = (synthesisResult?.writtenIds ?? validated.map((v) => v.id)).filter(Boolean);

// ─────────────────────────────────────────────────────────────────────────
// Visual audit — a shape can pass eval+mesh yet render wrong (off-centre,
// floating, degenerate, missing a promised feature). Screenshot every
// integrated example and have a vision agent judge resemblance. In dryRun the
// module isn't written, so skip — there's nothing live to shoot.
phase('Audit');

let auditResult = null;
let repairResult = null;

if (!DRY_RUN && writtenIds.length > 0) {
  // Audit ONLY what synthesis actually wrote to the module — looking up each
  // id's description from the validated set where available.
  const descById = new Map(validated.map((v) => [v.id, v.description]));
  const auditIds = writtenIds;
  // One agent owns the dev-server lifecycle so the port stays live across all
  // shots, then judges each PNG it captured.
  auditResult = await agent(
    `Visually audit the freshly-integrated playground examples. A shape can pass
the eval+mesh test yet still render wrong — your job is to catch that.

STEPS:
1. Start the playground dev server in the background and capture its URL:
     cd apps/playground && (npm run dev > /tmp/pg-audit.log 2>&1 &) ; sleep 6 ; grep -oE 'http://localhost:[0-9]+' /tmp/pg-audit.log | head -1
   (Vite may pick a non-5173 port if one is busy — use whatever it prints.)
2. Screenshot the audited examples into tmp/shots:
     cd apps/playground && npm run shoot <THAT_URL> tmp/shots ${auditIds.join(' ')}
   Each writes apps/playground/tmp/shots/<id>.png.
3. For EACH id below, Read its PNG (apps/playground/tmp/shots/<id>.png) and judge:
   does the 3D render in the right-hand viewport clearly look like the described
   real-world part, with no obvious defect? Compare against each example's
   description and the part it's named after. Flag: parts floating away from each
   other, geometry off to one side instead of centred, only a partial/wedge
   slice of what should be a full revolve, a blank/empty viewport, or a feature
   the code comments promise (e.g. screw holes, flutes) that isn't visible.
4. Return a verdict per id. Set looksRight=false with concrete issues for any
   defect; the workflow will route those to repair.

Examples to audit (id — description):
${auditIds.map((id) => `  ${id} — ${descById.get(id) ?? '(see the entry in the module)'}`).join('\n')}

Kill the dev server when done (pkill -f 'vite' for the playground, or the bg job).`,
    { label: 'audit', phase: 'Audit', schema: AUDIT_SCHEMA }
  );

  const flagged = (auditResult?.verdicts ?? []).filter((v) => v && v.looksRight === false);
  log(`Audit: ${flagged.length}/${auditIds.length} examples flagged as rendering wrong`);

  // ───────────────────────────────────────────────────────────────────────
  phase('Repair');

  if (flagged.length > 0) {
    repairResult = await parallel(
      flagged.map((v) => () => {
        return agent(
          `Fix the playground example "${v.id}" so it RENDERS correctly. It passes the
eval+mesh test but the visual audit flagged it:

  ISSUE: ${v.issues}
  DESCRIPTION (what it should look like): ${descById.get(v.id) ?? '(read the entry in the module)'}

It lives in ${MODULE_PATH} as the entry with id '${v.id}'. Edit ONLY that entry's
\`code\`. Common root causes seen in this codebase:
- box/cylinder/cone 'at' is the shape CENTRE, not an OpenSCAD-style corner. A
  frame at { at: [-w/2,-w/2,0] } lands in a corner while other parts sit at the
  origin → things look offset/floating. Centre everything on the origin.
- revolve() of a polygon profile that TOUCHES the axis is degenerate and sweeps
  only a partial arc → rebuild from primitives (cylinder ∩ sphere, fillet, etc.).
- features 'added' as bumps when they should be 'cut' (or vice-versa).
- a finishing op silently failing — don't reintroduce isOk()/.ok fallbacks.

WORKFLOW:
1. Edit the entry's code in ${MODULE_PATH}.
2. Re-validate: TEST_KERNEL=occt npx vitest run tests/playgroundExamples.test.ts --reporter=dot
3. Re-screenshot just this one (reuse the running server if up, else start it as
   the audit step did): cd apps/playground && npm run shoot <URL> tmp/shots ${v.id}
4. Read apps/playground/tmp/shots/${v.id}.png and confirm the issue is resolved.
   Repeat up to ${MAX_REPAIRS} times. If you cannot fix it, say so plainly.

Return a one-line status: fixed / still-broken, and what you changed.`,
          { label: `repair:${v.id}`, phase: 'Repair' }
        );
      })
    );
  }
}

return {
  surveyed: ranked.length,
  chosen: chosen.length,
  validated: validated.length,
  failed: failed.length,
  validatedIds: validated.map((v) => v.id),
  failedModels: failed.map((f) => f.label ?? f.id),
  synthesis: synthesisResult,
  audit: auditResult,
  repaired: repairResult,
};
