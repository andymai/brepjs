# brepjs-cad

Agent skill + verify/preview tooling for authoring parametric CAD with [brepjs](https://github.com/andymai/brepjs).

It ships as **two cooperating pieces on two rails** — install both.

## 1. The skill (Claude Code plugin)

Teaches an agent the authoring workflow. Delivered via the brepjs marketplace (git), **not** npm — Claude Code discovers skills from plugins, never from `node_modules`:

```
/plugin marketplace add andymai/brepjs
/plugin install brepjs-cad@brepjs
```

## 2. The runtime (npm)

The CLI the skill invokes. Install it in **your** project, where `brepjs` + the WASM kernel resolve (Node module resolution is project-local, so the runtime can't live in the plugin dir):

```
npm i -D brepjs-cad brepjs occt-wasm
```

## The `.brep.ts` contract

A model is a module whose default export is a zero-arg function returning a shape (or a `Result<shape>`):

```ts
// bracket.brep.ts
import { box } from 'brepjs';
export default () => box(40, 20, 10, { centered: true });
```

## Usage

```
npx brepjs part.brep.ts --step part.step --json report.json   # primary STEP + deterministic report
npx brepjs part.brep.ts --snapshot shots/                     # iso/front/top/right PNGs
npx brepjs part.brep.ts --serve                               # clickable preview link (renders the real STEP)
```

`--snapshot`/`--serve` use the bundled viewer (shipped under `viewer/dist`, including the OCCT WASM). The viewer is read-only display + screenshot in v1.

## Programmatic API

```ts
import { runPart, runChecks, serializeReport } from 'brepjs-cad';

const { shape, report, step } = await runPart('part.brep.ts', { step: true });
console.log(serializeReport(report)); // { ok, shapeType, checks, measurements, errors }
```

## How verification works

Deterministic checks are the source of truth — validity brands (`validSolid`), `measureVolume`/`measureArea`, and bounding box — surfaced as a JSON report. Multi-view PNG snapshots are a diagnostic layer, never a substitute for a measurement. STEP is the primary, validated artifact; GLB/STL are derived previews.
