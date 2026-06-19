---
description: Run the brepjs-verify skill eval in this Claude session — author the bench prompts, verify + render each, self-judge the renders, emit the two-signal scorecard, and propose SKILL.md fixes. No API key, runs on the subscription.
argument-hint: '[prompt-id | category | all]   (default: all)'
---

# brepjs-verify skill eval (manual loop)

Measure the deployed `SKILL.md` by running the bench prompt corpus through **this**
Claude Code session — you are both the author and the visual judge. No API key, no
billing. This is the manual counterpart to `npm run eval:live`, which drives the same
corpus via the SDK + Langfuse (billed; use that only when you want an _isolated_ or
_automated_ run). The point of this loop is not the score — it's the **findings**: turn
each failure into a concrete SKILL.md edit.

## Inputs

- `$ARGUMENTS` selects prompts: a prompt `id`, a `category`
  (`primitive|boolean|sketch|modifier|transform|gridfinity`), or `all` / empty for the
  whole corpus.
- **Corpus:** `packages/brepjs-verify/bench/prompts.ts` — each entry has `prompt`,
  `rubric`, and an optional `expected` (pinned dims).
- **Authoring contract:** `packages/brepjs-verify/skill/SKILL.md` — follow it exactly;
  that is the thing under test. Do **not** lean on outside brepjs knowledge the skill
  doesn't give you, or you measure yourself instead of the skill.

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

## The loop — per selected prompt, ≤ 3 attempts

1. **Brief.** Convert the request to explicit params (mm, datums, features) per SKILL.md
   step 1. Read the closest `skill/examples/*.brep.ts` before authoring.
2. **Author** `<id>.brep.ts` following SKILL.md: short API (`box`, `cylinder`, `fuse`,
   `cut`, `fillet`, `polygon`, `revolve`, …), `unwrap()` the `Result`-returning ops,
   `export default () => <shape>`.
3. **Verify + render** (one spawn):
   `node packages/brepjs-verify/dist/cli/main.js verify <id>.brep.ts --check --json <id>.report.json --snapshot <id>-shots/`
4. **Auto signal** (objective) from the report: `auto.pass` is true when `ok === true`
   and every pinned dim in the prompt's `expected` block is within tolerance. Compare
   bounds by **span/extent**, not absolute position — placement is unconstrained by the
   prompt (matches `checkAuto` in `bench/score.ts`). Volume is absolute.
5. **Judge signal** (intent): Read the snapshot PNGs (iso / front / top / right; each has
   its bbox `W × D × H` burned in) and grade against the prompt's `rubric` — does the
   rendered part match the request? Record `judge.pass` + a one-line reason.
6. **Repair.** If `auto.pass` is false, use the report's `hints` / `errorInfos` to fix the
   **smallest responsible section** and re-run (≤ 3 attempts total). Track the first
   attempt separately from the eventual one (that's the lift signal).

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

If `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` / `LANGFUSE_BASE_URL` are set and the user
wants trend history, offer to record the run (skill version + model + per-category both%)
so manual runs still accrue a trend over time.
