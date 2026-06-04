---
title: Authoring CAD with AI
description: 'brepjs-verify is an agent skill plus a verification CLI that turns natural-language part requirements into valid brepjs solids — type-checked, measured against intent, and snapshot-reviewed before handoff.'
---

# Authoring CAD with AI

[`brepjs-verify`](https://www.npmjs.com/package/brepjs-verify) lets an AI agent author parametric CAD in brepjs and **prove it is correct** before handing it off. An LLM can't see geometry — so it writes a `.brep.ts` part, runs it against a real OpenCascade kernel, and reads the deterministic report instead of guessing from how the code looks.

It ships as **two cooperating pieces**:

- **The skill** — a Claude Code plugin that teaches the agent the authoring loop (brief → author → verify → repair). It carries the API references, examples, and discipline. This is the _brain_.
- **The runtime** — the `brepjs-verify` CLI the skill drives. It loads the part on a real kernel, checks validity, measures volume/area/bounds, renders snapshots, and exports STEP. This is the _hands_.

You install both — they ride on two different rails because Claude Code discovers skills from plugins (a git marketplace), never from `node_modules`, while the runtime must live where your project's `brepjs` resolves.

## Why a verify loop

The kernel is the only honest judge of a B-Rep model. Code that reads correctly can still produce a non-manifold solid, a zero-volume shape, or a part that is valid but the wrong size. `brepjs-verify` collapses that uncertainty into a single machine-readable verdict:

- **Validity** — is it a real manifold solid with positive volume? (kernel `validSolid` brand)
- **Intent** — does it match the declared dimensions? (`measureVolume`/`measureArea`/bounds vs an `expected` block)
- **Shape** — does the render match the request? (multi-view PNG snapshots, for the agent or a human to review)

STEP is the validated primary deliverable; GLB/STL/snapshots are derived previews.

## Install — the skill (Claude Code plugin)

The skill is delivered through the brepjs plugin marketplace, which is just this git repo. Add the marketplace once, then install the plugin:

```
/plugin marketplace add andymai/brepjs
/plugin install brepjs-verify@brepjs
```

Claude Code now knows the authoring workflow and will invoke the CLI on your behalf. There is no npm step for the skill — plugins are not loaded from `node_modules`.

## Install — the runtime (npm)

Add the CLI to the project where you want parts verified:

```bash
npm i -D brepjs-verify
```

That's the whole install. `brepjs-verify` bundles its own `brepjs` + `occt-wasm`, so it runs in an empty directory with nothing else installed. **In an existing brepjs project** it automatically prefers your locally installed `brepjs` and kernel (via a Node module-resolution hook), so your verified parts bind to the exact version you ship — no version skew between what you verify and what you build.

The runtime initializes **occt-wasm** as its sole kernel (`OcctKernel.init()` + `registerKernel`), not the auto-detect fallback chain — so verification results are reproducible on one known engine.

You can also run it without installing, straight from npm:

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

Optionally declare intent with an `expected` block — the CLI asserts it, so you prove the part is the _right_ part, not merely a valid one:

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

## Next steps

- [The Verify Loop](./the-loop) — the author → verify → repair workflow and how to read the report
- [CLI Reference](./cli) — every subcommand, flag, and exit code
- [Examples](./examples) — the few-shot gallery the skill learns from
- [Eval & Scorecard](./eval) — the measurement flywheel that proves the skill
