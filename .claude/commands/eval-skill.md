---
description: Run the brepjs-verify skill eval in this Claude session — re-author the playground examples from their descriptions, verify + render each, judge against the playground quality bar, emit the two-signal scorecard, and propose SKILL.md fixes. No API key, runs on the subscription.
argument-hint: '[basics | mechanical | <example-id> | all]   (default: all plain-brepjs examples)'
---

# brepjs-verify skill eval (manual loop)

Measure the deployed `SKILL.md` by re-authoring the **playground examples** — the quality
bar — from their descriptions through **this** Claude Code session: you author each part, and a
**blind judge subagent** grades it (you never grade your own output — see `bench/blind-judge.md`).
No API key, no billing. The point of this loop is not the
score — it's the **findings**: each playground part the skill can't reproduce _as a
designed object_ (not just a valid blob) is a concrete SKILL.md gap to close. (`npm run
eval:live` is the billed SDK counterpart; it still uses the legacy `bench/prompts.ts`.)

## Inputs

- **Corpus = the playground examples** (`apps/playground/src/lib/examples/`, aggregated by
  `index.ts` into `EXAMPLES`). These ARE the quality bar and grow over time — re-read the
  catalog each run so new examples are picked up automatically. Use the **`basics`** and
  **`mechanical`** categories (plain-brepjs designed parts); skip `bim` / `sheet-metal`
  (those need the brepjs-bim / brepjs-sheetmetal skills, not this one).
- Per example: the **prompt** is its `description` (the NL intent — all a real author
  gets); `label` names it. `$ARGUMENTS` selects a category (`basics` | `mechanical`), one
  example `id`, or `all` / empty for both plain-brepjs categories.
- **Quality reference:** the example's own `code` IS the bar. To render it for a
  side-by-side, adapt it to a `.brep.ts` — change `from 'brepjs/quick'` → `from 'brepjs'`
  and `export default <shape>` → `export default () => <shape>` — then `verify --check
--snapshot`. The author's part should read as designed as the reference, not just valid.
- **Authoring contract:** `packages/brepjs-verify/skill/SKILL.md` — follow it exactly;
  that is the thing under test. Do **not** show the author the reference `code`, or lean on
  outside brepjs knowledge the skill doesn't give you, or you measure yourself.

## Setup (once per session)

The visual judge needs rendered snapshots → the built CLI + viewer + Chrome. Build only
what's missing:

1. Root library — `test -f dist/index.js || npm run build`
2. Viewer — `test -d packages/brepjs-verify/viewer/dist || npm run build --workspace=brepjs-viewer`
3. CLI — `test -f packages/brepjs-verify/dist/cli/main.js || npm run build --workspace=brepjs-verify`
4. Chrome — `cd packages/brepjs-verify && npx puppeteer browsers install chrome`

If the viewer/Chrome can't be built, run **auto-only**: skip `--snapshot`, mark every
`judge:—`, and say so loudly in the scorecard (a built-but-unjudged part is a coverage
gap, not a pass).

Author parts into a scratch ESM dir so `import 'brepjs'` resolves and the kernel loads:
`mkdir -p /tmp/brepjs-eval && printf '{"type":"module"}\n' > /tmp/brepjs-eval/package.json`.

## The loop — per selected example, ≤ 4 attempts (designed parts need the polish pass)

1. **Brief.** Convert the example's `description` to explicit params (mm, datums, features)
   per SKILL.md step 1. Read the closest `skill/examples/*.brep.ts` first. Do **not** read
   the playground example's `code` — that's the answer key.
2. **Author** `<id>.brep.ts` following SKILL.md: short API, `unwrap()` the `Result`-ops,
   `export default () => <shape>`. Snapshot **serially** (the render server is a singleton
   on port 7373; concurrent `--snapshot` runs error out).
3. **Verify + render** (one spawn):
   `node packages/brepjs-verify/dist/cli/main.js verify <id>.brep.ts --check --json <id>.report.json --snapshot <id>-shots/`
4. **Auto signal** (objective): `auto.pass` is `ok === true` (a valid manifold solid /
   assembly). Playground descriptions rarely pin dims; if one does, check the bbox by
   **span/extent**, not absolute position (matches `checkAuto`).
5. **Judge signal** (the quality bar): grade with a **blind judge subagent**, not yourself.
   Render the **reference** (adapt the example's `code`: `brepjs/quick`→`brepjs`,
   `export default X`→`export default () => X`) and the author part, copy both to neutral
   `A`/`B` filenames (coin-flipped so neither role is fixed), and dispatch a judge never told
   which is whose: it returns which render better realizes the description as a **designed
   object** (right features, present and legible) or whether both are blobs. One judge,
   escalate to 3 on `tie-good`/low-confidence; decode against your private map, then record the `judge.pass` verdict with its reason.
   Full protocol: `bench/blind-judge.md`.
6. **Repair + polish.** If `auto.pass` is false, fix the smallest responsible section from
   the report `hints`. If valid but blobby, do the **polish pass** (SKILL.md step 8). ≤ 4
   attempts; track the first attempt vs the eventual (the lift signal).

## Scorecard

Emit in the canonical `formatScorecard` shape (`bench/score.ts`) so manual and
`eval:live` runs are comparable:

- Header: `model=<this session's model> brepjs=<version> <date> units=mm`.
- Per prompt: `valid | INVALID`, `judge:✓ | ✗ | —`, with failure lines / judge reason.
- Per category: `valid% judge% both% (n=)`, then a `TOTAL` row.
- `first-try both%` vs `eventual both%` + lift; then the failure-mode breakdown
  (which codes hit how often).
- If any built part went unjudged: `⚠ judge coverage` line (both% silently collapses to
  auto% for those).

## Findings — the payoff

After the scorecard, summarize where SKILL.md **succeeded** and where it **fell down**:
ambiguous guidance, a missing/contradictory API signature, an example that misleads, a
hard-rule that over- or under-warns. Propose concrete SKILL.md edits (and core-library
bugs if a verify report exposes one). Then ask whether to apply them.

## Optional — log to Langfuse

If the LANGFUSE\_\* keys are set, record the run so it trends over skill versions. Keys live in the
repo-root `.env` as `LANGFUSE_HOST` / `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY`; the SDK reads
`LANGFUSE_BASE_URL`, so bridge first or it silently hits EU cloud:
`set -a; . ./.env; set +a; export LANGFUSE_BASE_URL="${LANGFUSE_BASE_URL:-$LANGFUSE_HOST}"`.

Once per corpus change, sync the dataset: `npm run eval:dataset:sync -w brepjs-verify` (upserts the
playground examples into the `brepjs-playground` dataset, keyed by example id).

Write the scorecard as JSON matching `bench/score.ts` `Scorecard` — `{ model, brepjsVersion,
skillVersion, date, results: EvalResult[] }`, where each result's `id` **is the playground example
id** and carries `auto`, `judgePass`, and `firstTry` (so the lift is computed) — then push:
`npm run eval:push -w brepjs-verify -- <scorecard.json>`. It records two things, both no-op without
keys: (1) one `eval-run` trace with the aggregate scores (`both`, `first_try_both`, `eventual_both`,
`lift`), and (2) a dataset run on `brepjs-playground` — one trace per part, scored and linked to its
dataset item — so skill versions compare per part in the dataset Runs view. The run name is the
`skillVersion`.
