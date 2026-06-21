---
description: Autonomously self-heal a brepjs-cad pipeline skill from its own eval — `/heal-skill <target>` for implement (clean-room authors + auto/judge), verify (precision/recall over known-bad fixtures), or polish (pre/post design judge). Diagnose against the real source, fix the skill, RED→GREEN re-verify, ship a PR. Sub-only ($0 incremental), drives end-to-end without asking.
argument-hint: '<target: implement | verify | polish>  [scope]   (default: implement hardest)'
---

# brepjs-cad skill self-heal loop

Drive **eval → diagnose → fix → RED→GREEN verify → ship** end-to-end so a skill heals from its own
signal. The autonomous sibling of `/eval-skill` (which measures + _proposes_ fixes). **Self-heal,
don't ask first** — when the sweep surfaces a gap, run the whole loop.

## Targets

The geometry-producing skills each have an automated signal — pick one with the first argument
(default `implement`). Brainstorm/design are text-only and are reviewed via the `skill-reviewer`
agent + `bench/specFixtures.ts`, not healed here.

- **implement** — heals `skills/implement/SKILL.md`. Fan out **clean-room subagent authors** (each
  reads only the implement skill + its references) over the corpus; signal = `auto` (valid +
  declared dims) + blind visual judge. The full procedure below is this target.
- **verify** — heals `skills/verify/SKILL.md` (and, if the gap is in code, the `HINT_TABLE` in
  `src/verify/report.ts` **with a matching `tests/report.test.ts` case**). Signal =
  `npm run eval:verify -w brepjs-cad` (`bench/verifyEval.ts`): precision over the good corpus +
  recall over the known-bad fixtures (`bench/mutate.ts`). RED→GREEN = a missed code in the recall
  table flips to PASS because the verifier now emits/explains it. Recall is a lower bound (only the
  mutate.ts codes) — say so; add a fixture when a new code appears.
- **polish** — heals `skills/polish/SKILL.md`. Corpus = the implement heal's first-valid parts
  (fallback: the 16 `skills/implement/examples`). Signal = the pre/post protocol in
  `bench/blind-judge-polish.md`: render pre → run polish → render post; a heal is confirmed only if
  post is **still valid** AND the blind judge prefers post AND the change is attributable to a
  named polish rule.

The procedure below details the **implement** target; for **verify**/**polish**, substitute the
signal above and the same diagnose → fix → RED→GREEN → ship discipline.

## Scope & cost

- **Corpus = the playground examples** (`apps/playground/src/lib/examples/`, `basics` +
  `mechanical`; skip `bim`/`sheet-metal`). Re-read the catalog each run so new examples are
  picked up. `$ARGUMENTS` scopes it; default `hardest` = the advanced-op parts (lofts, sweeps,
  revolves, threads, chamfers, multi-body assemblies) — that's where gaps hide, and a clean
  sweep there means the reliable core is fine.
- **Sub-only, $0 incremental.** Clean-room subagents are flat-rate. Do **NOT** run the billed
  `eval:live` CI or push to Langfuse routinely (the `brepjs judge` evaluator bills Anthropic per
  item). Langfuse stays opt-in.

## 0. Pre-flight (once)

Build only what's missing: root lib (`test -f dist/index.js || npm run build`), CLI
(`--workspace=brepjs-cad`), snapshot viewer (`packages/brepjs-cad/viewer/dist`, from the
**brepjs-cad** build — NOT `brepjs-viewer`; rebuild if missing **or stale**, since a dist older than
`viewer/src` throws `globalThis.__setScene is not a function` and silently fails every `--snapshot`:
`[ -f packages/brepjs-cad/viewer/dist/index.html ] && [ -z "$(find packages/brepjs-cad/viewer/src -newer packages/brepjs-cad/viewer/dist/index.html)" ] || (cd packages/brepjs-cad && npx vite build --config viewer/vite.config.ts)`), Chrome
(`cd packages/brepjs-cad && npx puppeteer browsers install chrome`). Scratch ESM dir:
`mkdir -p /tmp/brepjs-eval && printf '{"type":"module"}\n' > /tmp/brepjs-eval/package.json`.
**Smoke-test the harness** before fanning out: author a trivial `box` part and `verify --check`;
all N authors share the one assumption that bare `import 'brepjs'` resolves + the kernel loads, so
prove it with a 3-line part first (turns an N-way silent failure into a 5-second check).

## 1. Signal — clean-room author fan-out (the auto signal)

One **general-purpose subagent per example**, dispatched in parallel batches. Each subagent:

- Reads ONLY `packages/brepjs-cad/skills/implement/SKILL.md` + its references/examples + the bundled
  `reference/llms-full.txt`. **MUST NOT** read anything under `apps/playground/**` (the answer
  key) or lean on remembered brepjs API — that measures the model, not the skill.
- Gets the example's `description` as the whole prompt (+ `id`/`label`).
- Authors `/tmp/brepjs-eval/<id>.brep.ts`, runs `verify <id>.brep.ts --check --json <id>.report.json`
  **with NO `--snapshot`** (the render server is a singleton on :7373; concurrent snapshots crash —
  rendering is the main session's job, step 2). Iterates ≤4 attempts.
- Reports a terse fixed shape: `FIRST_TRY_OK`, `FIRST_TRY_CODES` (normalized — `TS2304`,
  `CHAMFER_FAILED`, `EXPECTED_ASSERTION_FAILED`, `TYPECHECK`+`TSxxxx`, …), the verbatim first
  error, `EVENTUAL_OK`, `ATTEMPTS`, a **causal field** (what tripped it; did the skill's prose
  carry or fail it), `SKILL_GAP` (did a rule mislead/omit/contradict — name it), and `FINAL_CODE`.

## 2. Judge — blind subagent (the design signal)

**Don't grade your own loop's output** — you authored the heal, so you're a conflicted judge. Hand
the design signal to a **blind judge subagent** (full protocol: `bench/blind-judge.md`): render the
author part AND the playground reference serially, strip the labels to neutral `A`/`B` filenames
(coin-flipped per part), and a judge that never saw the heal or which render is whose returns the
verdict — you only render, shuffle, decode, aggregate. One judge per part, escalate to a panel of 3
on `tie-good`/`confidence:low` (`tie-blob` re-renders instead — see `bench/blind-judge.md`). Note: clean-room authors stop at `ok:true` with no `--snapshot`, skipping
the polish pass (SKILL.md authoring step 8), so this measures _first-valid_ design quality — call
that out.

## 3. Diagnose — verify before healing

Tally the first-try failure-mode distribution; the dominant normalized code is the gap. **Clean-room
agents misattribute citations** — turn every claimed gap into ground truth: grep the actual
`src/**/*.ts` + shipped `dist/**/*.d.ts` (and the references) before touching the skill. A
doc-vs-type **contradiction** (the skill tells you to write code that won't compile) is the worst
class and a must-fix; an omission is lower-severity. **Never heal a phantom.**

## 4. Fix — surgical SKILL.md prose

Edit the canonical `packages/brepjs-cad/skills/implement/SKILL.md` (+ its `references/*.md`) in the house
style: terse, failure-mode-keyed, cite the error code. The fix must live in **prose** (the real
eval author is prompt-only — file-only example fixes don't transfer). If a bundled reference
(`llms-full.txt`/`llms.txt`) is itself wrong, fix it **and grep everywhere** — root `llms.txt` +
root `llms-full.txt` + their build-synced bundled copies under `packages/brepjs-cad/reference/`
(it hides in 4 places). Don't leave a self-referential cross-link that your own fix falsifies.

## 5. Verify — RED→GREEN (writing-skills TDD)

Re-run the **failing** clean-room authors against the patched skill. Each failure must flip to a
clean pass **and be causally attributable** — the author now does the right thing _because_ of the
new rule (it imports the symbol, omits the derived bound, passes `'Z'`), quoting it. A pass for an
unrelated reason isn't a verified heal. Add a deterministic micro-test where one is cleaner than an
agent (e.g. a typed-vs-untyped `--check` pair).

## 6. Ship

Branch first (**never commit on `main`**), conventional commit (`fix(brepjs-cad): …`), push over
SSH (sandboxed is fine), open the PR with `gh` — only the `gh pr create`/`api`/`merge` calls need
the **unsandboxed** shell (`dangerouslyDisableSandbox`), so scope the disable to those. Monitor
CI; when Greptile posts, **verify each finding before complying** (receiving-code-review — don't
perform agreement), fix to **5/5**, then squash-merge on green + 5/5 (the standing flow). Multiple
**independent, each-RED→GREEN-verified** heals in one PR is fine; **defer single-incident findings**
(let them earn a fix by recurring) and list them. Clean up the branch after merge.

## Scorecard & honesty

Emit the two-signal scorecard in the `formatScorecard` shape (see `/eval-skill`): header
(`model … brepjs … skill=brepjs-cad@<ver> … units=mm`), per-part `valid|INVALID` + `judge:✓|✗|—`,
per-category + TOTAL, `first-try both%` vs `eventual both%` + lift, and the failure-mode breakdown.
**No silent caps:** if you swept a subset (`hardest`) or judged a sample, say so loudly — first-try%
is then a lower bound, and unjudged-but-valid parts are a coverage gap (`judge:—`), not a pass.
