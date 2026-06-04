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

## CLI reference

The `brepjs` bin (alias `brepjs-agent-verify`) is a multi-command CLI. `verify` is the default command, so `brepjs part.brep.ts` runs it directly.

| Command                  | What it does                                                                                                                                                                                                                            |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `brepjs verify <file>`   | Default command. Loads the part, runs deterministic checks, prints the JSON report. Flags: `--json <out>`, `--step <out>`, `--glb <out>`, `--snapshot <dir>`, `--serve`. Exits non-zero when the report is not `ok` (unless `--serve`). |
| `brepjs init <name>`     | Scaffolds a parameterized `<name>.brep.ts` + `tsconfig.json` + `README.md` into `./<name>` (or `--out <dir>`). Never overwrites existing files.                                                                                         |
| `brepjs watch <file>`    | Re-verifies on every save until Ctrl-C (debounced; watches the parent dir to survive editor rename-on-save).                                                                                                                            |
| `brepjs export <file>`   | Batch artifacts behind a validity gate: `--step`, `--glb`, `--stl`, or `--all`; `--out <dir>` (default `.`). Exits non-zero on failure.                                                                                                 |
| `brepjs measure <a> [b]` | Measurements for one part; with a second module, the distance between the two parts.                                                                                                                                                    |
| `brepjs diff <a> <b>`    | Compares the measurements of a baseline and a comparison module.                                                                                                                                                                        |
| `brepjs snapshot`        | Multi-view PNG capture — surfaced via `verify --snapshot <dir>`. Requires the optional `puppeteer`/Chrome dependency; degrades with a clear message when absent.                                                                        |
| `brepjs serve`           | Preview server with a `?dir=&file=` deep link — surfaced via `verify --serve`.                                                                                                                                                          |

Every command writes a single machine-readable JSON document to stdout; diagnostics (paths, kernel chatter, watch notices) go to stderr.

## Examples gallery

Few-shot examples live under `skill/examples/<name>.brep.ts`, each with a `<name>.expected.json` baseline. Grouped by category:

- **Primitives + booleans** — `mounting-bracket`, `flanged-coupler`, `transform-bracket`
- **2D sketch → solid** — `extruded-bracket` (extrude), `revolved-pulley` (revolve), `swept-gasket` (sweep)
- **Modifiers** — `rounded-block` (fillet), `chamfered-block` (chamfer), `hollow-enclosure` (shell)
- **Gridfinity primitives** — `gridfinity-baseplate`, `gridfinity-bin`, `gridfinity-divider`

## Eval / scorecard

`npm run eval` (`bench/run.ts`) replays every `skill/examples/*.brep.ts` with a sibling `*.expected.json` through the public `runPart` runtime, compares measured volume/area/validity/shape-type against the recorded baseline within each file's tolerance (default 0.5%), prints a PASS/FAIL scorecard, and exits non-zero on any regression. It is deterministic — no LLM or API key — so it runs in CI as the package's regression net. Refresh a baseline by re-recording the example's `*.expected.json` after an intentional geometry change.

## Programmatic API

```ts
import { runPart, runChecks, serializeReport } from 'brepjs-cad';

const { shape, report, step } = await runPart('part.brep.ts', { step: true });
console.log(serializeReport(report)); // { ok, shapeType, checks, measurements, errors }
```

## How verification works

Deterministic checks are the source of truth — validity brands (`validSolid`), `measureVolume`/`measureArea`, and bounding box — surfaced as a JSON report. Multi-view PNG snapshots are a diagnostic layer, never a substitute for a measurement. STEP is the primary, validated artifact; GLB/STL are derived previews.
