---
title: Authoring CAD with AI
description: 'Let an AI agent author parametric CAD in brepjs and check it against intent — type-checks, measures dimensions, and renders snapshots before handing off STEP.'
---

# Authoring CAD with AI

Ask for a part in plain English. The agent writes it, runs it on a CAD kernel, and checks the result before handing it back.

```
   "a 40×20×10 mm bracket with two M4 holes"
                  │  agent writes bracket.brep.ts and runs
                  ▼  it on an OpenCascade kernel
   ────────────────────────────────────────────────────
   ✓ valid solid       ✓ volume ≈ 7,750 mm³ (within 1%)
   ✓ snapshots rendered    →  bracket.step ready to hand off
```

An LLM can't see geometry. Code that reads correctly can still produce a solid that is broken, empty, or the wrong size, and the model has no way to notice. [`brepjs-cad`](https://www.npmjs.com/package/brepjs-cad) closes that gap: the agent writes the part, runs it against the kernel, and reads back what the kernel measured instead of judging the code by eye.

## What it checks

Every part gets three independent verdicts:

- **Validity**: is it a manifold solid with positive volume? (the kernel's `validSolid` brand)
- **Intent**: does it match the dimensions you asked for? (`measureVolume` / `measureArea` / bounds vs an `expected` block)
- **Shape**: does it look like the request? (multi-view PNG snapshots, for the agent or you to review)

STEP is the validated deliverable; GLB, STL, and snapshots are derived previews.

## What you install

`brepjs-cad` is two parts that work together:

- **The skill** teaches the agent the workflow (brief → author → verify → repair) and carries the API references and examples it draws on.
- **The runtime** is the CLI the skill drives. It loads your part on a kernel, checks validity, measures volume / area / bounds, renders snapshots, and exports STEP.

They install separately because Claude Code loads skills from plugins (a git marketplace), while the runtime has to live wherever your project's `brepjs` resolves. You install both once.

### Install the skill (Claude Code plugin)

The skill ships through the brepjs plugin marketplace, which is this git repo. Add the marketplace once, then install the plugin:

```
/plugin marketplace add andymai/brepjs
/plugin install brepjs@brepjs
```

Claude Code now knows the workflow and will run the CLI for you. There is no npm step for the skill; plugins aren't loaded from `node_modules`.

### Install the runtime (npm)

Add the CLI to the project where you want parts verified:

```bash
npm i -D brepjs-cad
```

That's the whole install. `brepjs-cad` bundles its own `brepjs` + `occt-wasm`, so it runs in an empty directory with nothing else set up. **In an existing brepjs project** it automatically prefers your locally installed `brepjs` and kernel (via a Node module-resolution hook), so your verified parts bind to the exact version you ship. There is no drift between what you verify and what you build.

It runs **occt-wasm** as its only kernel, rather than the auto-detect fallback chain, so verification results are reproducible on one known engine.

Prefer not to install anything? Run it straight from npm:

```bash
npx -y -p brepjs-cad brep part.brep.ts
```

## The `.brep.ts` contract

A model is a TypeScript module whose **default export is a zero-argument function** returning a shape (or a `Result<shape>`):

<!-- @no-test -->

```ts
// bracket.brep.ts
import { box } from 'brepjs';

export default () => box(40, 20, 10, { centered: true });
```

Declare intent with an `expected` block and the CLI asserts it, so you confirm the part is the _right_ part, not only a valid one:

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
npx -y -p brepjs-cad brep init bracket

# author bracket/bracket.brep.ts, then verify (type-check + geometry) and write the report
npx -y -p brepjs-cad brep verify bracket/bracket.brep.ts --check --json report.json

# review it visually, then export the validated STEP
npx -y -p brepjs-cad brep verify bracket/bracket.brep.ts --snapshot shots/
npx -y -p brepjs-cad brep verify bracket/bracket.brep.ts --step bracket.step
```

The command exits non-zero whenever the report is not `ok`, so it drops straight into CI or an agent loop.

## Next steps

- [The Verify Loop](./the-loop): the author → verify → repair workflow and how to read the report
- [CLI Reference](./cli): every subcommand, flag, and exit code
- [Examples](./examples): the example gallery the skill draws on
- [Eval & Scorecard](./eval): how the skill measures itself
