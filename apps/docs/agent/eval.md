---
title: Eval & Scorecard
description: 'How brepjs-cad measures itself: a deterministic replay that gates CI, plus an opt-in live eval scoring model prompts on validity and visual intent.'
---

# Eval & Scorecard

`brepjs-cad` measures itself two ways: a **deterministic replay** that runs in CI, and an opt-in **live eval** that exercises the deployed skill against a model. Both catch regressions as brepjs and the kernel change.

## Deterministic eval (CI gate)

```bash
npm run eval
```

`bench/run.ts` replays every `skills/implement/examples/*.brep.ts` through the public `runPart` runtime and compares the measured volume / area / validity / shape-type against the recorded `*.expected.json` baseline, within each file's tolerance (default 0.5%). It prints a PASS/FAIL scorecard and exits non-zero on any regression.

It is fully deterministic (**no LLM, no API key**), so it runs in CI as the package's regression net. Refresh a baseline by re-recording the example's `*.expected.json` after an _intentional_ geometry change; an unintentional change surfaces as a failure.

## Live eval (`eval:live`)

The live eval measures the skill, not only the geometry. It sends ~18 natural-language part prompts (`bench/prompts.ts`) to a model using the **deployed `SKILL.md` as the system prompt**, so it measures what an agent sees, then verifies each generated part two ways:

- **Auto (objective):** `runPart --check` → a valid solid with any pinned dimensions inside tolerance.
- **Judge (intent):** a multimodal Claude call evaluates the rendered iso/front/top/right snapshots against the request and its rubric.

```bash
ANTHROPIC_API_KEY=sk-... npm run eval:live -w brepjs-cad              # opus by default
ANTHROPIC_API_KEY=sk-... npm run eval:live -w brepjs-cad -- --model claude-sonnet-4-6
#   --only <id|category>   run a subset      --keep   keep the generated parts
```

The scorecard reports per-category `valid` / `judge` / `both` rates and stamps the model + **resolved brepjs version** + date, so trend lines never mix kernel versions.

`eval:live` is **opt-in and billed**: it makes real API calls, so it does not run in CI; the deterministic replay above is the CI gate. Snapshots (and therefore the judge) need `puppeteer`/Chrome; without them the run scores on auto-verify alone and notes the skipped judge.

## Why it stamps the brepjs version

The runtime pins `brepjs` with a caret range, and geometry measurements are floating-point: a kernel bump can shift a volume by a small amount. Stamping the resolved version on every scorecard keeps trend lines comparable instead of silently mixing engine versions across runs.

## Claude Code eval (`eval:claude`)

```bash
npm run eval:claude -w brepjs-cad                  # Sonnet authors, Opus judge
npm run eval:claude -w brepjs-cad -- --only gt2-pulley,o-ring --concurrency 2
```

`bench/claudeEval.ts` runs the 46 `basics` and `mechanical` playground examples through the Claude Code CLI, so it uses a Claude subscription instead of an API key. Each example's description is the whole request. The author session works in a fresh project with packed `brepjs` and `brepjs-cad` installed, the plugin copied outside the repo, and reads of the repo denied, so the example's own code stays hidden. A separate judge session then compares the author's renders with the hand-written example's, blind to which is which, following `bench/blind-judge.md`. A part passes the judge when it reads as a designed object and is preferred over the example or tied with it.

### Results: 2026-10-28

Authors on Sonnet 5.5, judge on Opus 5.5, brepjs 20.12.0, brepjs-cad 0.191.0:

|                                                     | Parts    |
| --------------------------------------------------- | -------- |
| Valid on the first `brep verify`                    | 31 of 46 |
| Valid after the author's verify loop                | 46 of 46 |
| Judged at least as good as the hand-written example | 35 of 46 |

Of the 15 parts that failed their first verify, 12 failed on a TypeScript error from `--check`. The 11 judge misses are mostly intricate features, such as Gridfinity sockets and a D-sub shroud, that the judge rated partial next to the example. An audit of the author transcripts found three contaminated first passes: two authors had read another author's finished part, and the gridfinity-bin author had read the implement skill's own gridfinity-bin example. We re-ran those three parts alone, with that example hidden, and the table reports the re-runs: the two judge passes became misses, and gridfinity-bin again passed its first verify and missed the judge. The harness now flags any author that reads another part's files or its own part's skill example, blocks relative paths out of its folder, and hides that example. The corpus is the example gallery the implement skill is tuned against, so these numbers describe parts like those, not arbitrary requests. Per-part results with the judge's reasons are in [`bench/results/2026-10-28-claude-sonnet-5-5.txt`](https://github.com/andymai/brepjs/blob/main/packages/brepjs-cad/bench/results/2026-10-28-claude-sonnet-5-5.txt).

## Next steps

- [Examples](./examples): the corpus the deterministic eval replays
- [The Verify Loop](./the-loop): the per-part workflow the eval runs across the corpus
