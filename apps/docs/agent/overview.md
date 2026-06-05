---
title: Authoring CAD with AI
description: 'brepjs-verify lets an AI agent author parametric CAD in brepjs and prove it is correct — type-checked, measured against intent, and snapshot-reviewed — before handing off STEP.'
---

# Authoring CAD with AI

Ask for a part in plain English. The agent writes it, runs it on a real CAD kernel, and proves it is correct before handing it back.

```
   "a 40×20×10 mm bracket with two M4 holes"
                  │  agent writes bracket.brep.ts and runs
                  ▼  it on a real OpenCascade kernel
   ────────────────────────────────────────────────────
   ✓ valid solid       ✓ volume ≈ 7,750 mm³ (within 1%)
   ✓ snapshots rendered    →  bracket.step ready to hand off
```

An LLM can't see geometry. Code that reads correctly can still produce a solid that is broken, empty, or simply the wrong size — and the model has no way to notice. [`brepjs-verify`](https://www.npmjs.com/package/brepjs-verify) takes the guesswork out: the agent writes the part, runs it against a real kernel, and reads back what the kernel actually measured instead of judging the code by eye.

## What it checks

Every part gets three independent verdicts, so a pass means more than "the code ran":

- **Validity** — is it a real manifold solid with positive volume? (the kernel's `validSolid` brand)
- **Intent** — does it match the dimensions you asked for? (`measureVolume` / `measureArea` / bounds vs an `expected` block)
- **Shape** — does it actually look like the request? (multi-view PNG snapshots, for the agent or you to review)

STEP is the validated deliverable; GLB, STL, and snapshots are derived previews.

## What you install

`brepjs-verify` is two parts that work together:

- **The skill** teaches the agent the workflow — brief → author → verify → repair — and carries the API references and examples it learns from.
- **The runtime** is the CLI the skill drives. It loads your part on a real kernel, checks validity, measures volume / area / bounds, renders snapshots, and exports STEP.

They install separately because Claude Code loads skills from plugins (a git marketplace), while the runtime has to live wherever your project's `brepjs` resolves. You install both once and never think about it again.

### Install the skill (Claude Code plugin)

The skill ships through the brepjs plugin marketplace — which is just this git repo. Add the marketplace once, then install the plugin:

```
/plugin marketplace add andymai/brepjs
/plugin install brepjs-verify@brepjs
```

Claude Code now knows the workflow and will run the CLI for you. There is no npm step for the skill — plugins aren't loaded from `node_modules`.

### Install the runtime (npm)

Add the CLI to the project where you want parts verified:

```bash
npm i -D brepjs-verify
```

That's the whole install. `brepjs-verify` bundles its own `brepjs` + `occt-wasm`, so it runs in an empty directory with nothing else set up. **In an existing brepjs project** it automatically prefers your locally installed `brepjs` and kernel (via a Node module-resolution hook), so your verified parts bind to the exact version you ship — no drift between what you verify and what you build.

It runs **occt-wasm** as its only kernel, rather than the auto-detect fallback chain, so verification results are reproducible on one known engine.

Prefer not to install anything? Run it straight from npm:

```bash
npx -y brepjs-verify part.brep.ts
```

## The `.brep.ts` contract

A model is a TypeScript module whose **default export is a zero-argument function** returning a shape (or a `Result<shape>`):

<!-- @no-test -->

```ts
// bracket.brep.ts
import { box } from 'brepjs';

export default () => box(40, 20, 10, { centered: true });
```

Declare intent with an `expected` block and the CLI asserts it — so you prove the part is the _right_ part, not just a valid one:

<!-- @no-test -->

```ts
// bracket.brep.ts
import { box } from 'brepjs';

export const expected = { volume: 8000, tolerancePct: 1 };
export default () => box(40, 20, 10, { centered: true });
```

Author parts in an ESM context (the CLI's default). A CommonJS project needs `"type": "module"` in `package.json`, or name the file `.mts`.

## Quickstart

```bash
# scaffold a parameterized part
npx -y brepjs-verify init bracket

# author bracket/bracket.brep.ts, then verify (type-check + geometry) and write the report
npx -y brepjs-verify verify bracket/bracket.brep.ts --check --json report.json

# review it visually, then export the validated STEP
npx -y brepjs-verify verify bracket/bracket.brep.ts --snapshot shots/
npx -y brepjs-verify verify bracket/bracket.brep.ts --step bracket.step
```

The command exits non-zero whenever the report is not `ok`, so it drops straight into CI or an agent loop.

## Why I built this

I write CAD as code, but I can't trust an agent to write it blind — and neither can the agent. Geometry that reads fine on the page is constantly wrong in ways only the kernel can see: a boolean that didn't overlap, a fillet that collapsed a face, a part that's valid but 3 mm too tall. So I gave the agent the one thing it was missing: a way to run the part, measure it, look at it, and find out the truth before claiming it's done. That loop is the whole idea — the rest is plumbing.

## Next steps

- [The Verify Loop](./the-loop) — the author → verify → repair workflow and how to read the report
- [CLI Reference](./cli) — every subcommand, flag, and exit code
- [Examples](./examples) — the example gallery the skill learns from
- [Eval & Scorecard](./eval) — how the skill measures itself and stays honest
