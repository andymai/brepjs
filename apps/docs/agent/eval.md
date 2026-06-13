---
title: Eval & Scorecard
description: 'How brepjs-verify measures itself: a deterministic replay that gates CI, plus an opt-in live eval that sends natural-language prompts to a model under the deployed skill and scores validity + visual intent.'
---

# Eval & Scorecard

`brepjs-verify` measures itself two ways: a **deterministic replay** that runs in CI, and an opt-in **live eval** that exercises the deployed skill against a model. Both catch regressions as brepjs and the kernel change.

## Deterministic eval (CI gate)

```bash
npm run eval
```

`bench/run.ts` replays every `skill/examples/*.brep.ts` through the public `runPart` runtime and compares the measured volume / area / validity / shape-type against the recorded `*.expected.json` baseline, within each file's tolerance (default 0.5%). It prints a PASS/FAIL scorecard and exits non-zero on any regression.

It is fully deterministic (**no LLM, no API key**), so it runs in CI as the package's regression net. Refresh a baseline by re-recording the example's `*.expected.json` after an _intentional_ geometry change; an unintentional change surfaces as a failure.

## Live eval (`eval:live`)

The live eval measures the skill, not only the geometry. It sends ~18 natural-language part prompts (`bench/prompts.ts`) to a model using the **deployed `SKILL.md` as the system prompt**, so it measures what an agent sees, then verifies each generated part two ways:

- **Auto (objective):** `runPart --check` → a valid solid with any pinned dimensions inside tolerance.
- **Judge (intent):** a multimodal Claude call evaluates the rendered iso/front/top/right snapshots against the request and its rubric.

```bash
ANTHROPIC_API_KEY=sk-... npm run eval:live -w brepjs-verify              # opus by default
ANTHROPIC_API_KEY=sk-... npm run eval:live -w brepjs-verify -- --model claude-sonnet-4-6
#   --only <id|category>   run a subset      --keep   keep the generated parts
```

The scorecard reports per-category `valid` / `judge` / `both` rates and stamps the model + **resolved brepjs version** + date, so trend lines never mix kernel versions.

`eval:live` is **opt-in and billed**: it makes real API calls, so it does not run in CI; the deterministic replay above is the CI gate. Snapshots (and therefore the judge) need `puppeteer`/Chrome; without them the run scores on auto-verify alone and notes the skipped judge.

## Why it stamps the brepjs version

The runtime pins `brepjs` with a caret range, and geometry measurements are floating-point: a kernel bump can shift a volume by a small amount. Stamping the resolved version on every scorecard keeps trend lines comparable instead of silently mixing engine versions across runs.

## Next steps

- [Examples](./examples): the corpus the deterministic eval replays
- [The Verify Loop](./the-loop): the per-part workflow the eval runs across the corpus
