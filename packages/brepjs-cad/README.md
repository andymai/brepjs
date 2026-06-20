# brepjs-cad

A brainstorm → design → author → verify → polish **pipeline** for authoring parametric CAD with [brepjs](https://github.com/andymai/brepjs), plus the `brep` CLI that runs each part on a real geometry kernel and reports what it measured.

It ships as **two cooperating pieces on two rails**; install both.

## 1. The skills (Claude Code plugin)

Five composable, individually-improvable skills — **`brepjs:brainstorm`** (scope a request into a spec) → **`brepjs:design`** (decompose it into a build sequence) → **`brepjs:implement`** (author the `.brep.ts`) → **`brepjs:verify`** (judge it by the report) → **`brepjs:polish`** (make it look designed, then export) — plus a wait-gated **`/brepjs:cad`** command that drives the whole pipeline and `brepjs-implementer`/`verifier`/`polisher` worker agents it fans out to. The geometry-producing skills self-heal via `/heal-skill <target>`. Each skill also auto-triggers standalone. Delivered via the brepjs marketplace (git), **not** npm — Claude Code discovers skills from plugins, never from `node_modules`:

```
/plugin marketplace add andymai/brepjs
/plugin install brepjs@brepjs
```

## 2. The runtime (npm)

The CLI the skill invokes. Install it in **your** project, where `brepjs` + the WASM kernel resolve (Node module resolution is project-local, so the runtime can't live in the plugin dir):

```
npm i -D brepjs-cad brepjs occt-wasm
```

## API reference

The package bundles brepjs's full API reference for offline/agent use: the complete export surface with signatures and examples:

- `reference/llms-full.txt`: every export, full signatures (the deep reference)
- `reference/llms.txt`: the same content as a quicker index

Point your agent at `node_modules/brepjs-cad/reference/llms-full.txt` for anything the skill's curated references don't cover.

## The `.brep.ts` contract

A model is a module whose default export is a zero-arg function returning a shape (or a `Result<shape>`):

```ts
// bracket.brep.ts
import { box } from 'brepjs';
export default () => box(40, 20, 10, { centered: true });
```

## Usage

```
npx -y -p brepjs-cad brep part.brep.ts --step part.step --json report.json   # primary STEP + deterministic report
npx -y -p brepjs-cad brep part.brep.ts --snapshot shots/                     # iso/front/top/right PNGs
npx -y -p brepjs-cad brep part.brep.ts --serve                               # preview server + opens the viewer in your browser
npx -y -p brepjs-cad brep part.brep.ts --serve --no-open                     # preview server; just print the URL (no browser)
```

`--snapshot`/`--serve` use the bundled viewer (shipped under `viewer/dist`, including the OCCT WASM). The `--serve` link is interactive: a toolbar offers view presets + fit, solid/wireframe/x-ray modes, edge/grid toggles, a turntable, click-to-inspect face picking, a section/clipping plane, a measurements panel, and an in-browser PNG screenshot. `--snapshot` loads the same page with `ui=0` to suppress the toolbar, and burns the bounding-box size into each PNG (`dims=1`) so the agent can read scale from the image.

`--serve` prints the viewer URL and, in an interactive terminal, opens it in your default browser. Auto-open is skipped when it would be unwanted: when the server is reused (a tab is already open), under CI, when output is piped (non-TTY, e.g. agent runs), or on Linux with no display server. Pass `--no-open` to always suppress it.

## CLI reference

The `brep` bin is a multi-command CLI. `verify` is the default command, so `brep part.brep.ts` runs it directly.

| Command                  | What it does                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `brep verify <files...>` | Default command. Loads the part, runs deterministic checks, prints the JSON report. Flags: `--check`, `--json <out\|->`, `--step <out>`, `--glb <out>`, `--snapshot <dir>`, `--serve`, `--no-open`, `--expect-code <CODE>` / `--expect-invalid` (assert a known-bad part fails the right way — for fixtures/eval). Multiple files or a quoted glob → a validity-only JSON array. Exits non-zero when not `ok` (unless `--serve`). |
| `brep init <name>`       | Scaffolds a parameterized `<name>.brep.ts` + `tsconfig.json` + `README.md` into `./<name>` (or `--out <dir>`). Never overwrites existing files.                                                                                                                                                                                                                                                                                   |
| `brep watch <file>`      | Re-verifies on every save until Ctrl-C (debounced; watches the parent dir to survive editor rename-on-save).                                                                                                                                                                                                                                                                                                                      |
| `brep export <file>`     | Batch artifacts behind a validity gate: `--step`, `--glb`, `--stl`, or `--all`; `--out <dir>` (default `.`). Exits non-zero on failure.                                                                                                                                                                                                                                                                                           |
| `brep measure <a> [b]`   | Measurements for one part; with a second module, the distance between the two parts.                                                                                                                                                                                                                                                                                                                                              |
| `brep diff <a> <b>`      | Compares the measurements of a baseline and a comparison module.                                                                                                                                                                                                                                                                                                                                                                  |
| `brep snapshot <file>`   | Standalone multi-view PNG capture (no report assertions): `--out <dir>`, `--label <tag>` (subfolder, for pre/post A/B pairing). Renders on a private ephemeral server so parallel snapshots don't contend. Requires the optional `puppeteer`/Chrome dependency; degrades with a clear message when absent. (Also available inline via `verify --snapshot <dir>`.)                                                                 |
| `brep serve`             | Preview server with a `?dir=&file=` deep link, surfaced via `verify --serve`. Auto-opens the browser in an interactive terminal (suppressed under CI / non-TTY / no display, or with `--no-open`).                                                                                                                                                                                                                                |

Every command writes a single machine-readable JSON document to stdout; diagnostics (paths, kernel chatter, watch notices) go to stderr.

## MCP server

`brep-mcp` is a stdio [MCP](https://modelcontextprotocol.io) server that exposes the verify substrate to MCP-capable agents (Claude Code, Claude Desktop, any MCP client). It currently provides one tool:

| Tool          | Input                                  | Returns                                                                                                                                                                                                                               |
| ------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `run_program` | `{ code: string, timeoutMs?: number }` | Executes the brepjs `.brep.ts` source in an isolated, timeout/OOM-bounded sandbox and returns the verification report (validity, measurements, topology) as JSON. `isError` is set when the part fails checks, times out, or crashes. |

This is the closed _build → verify_ loop as a single call: the agent sends part source, gets back the deterministic report. The program runs in a separate process with a wall-clock timeout and a memory cap, so a runaway part can't hang the agent.

### Connect (local build)

Build the package, then register the server by absolute path. Run both commands from the package root (`packages/brepjs-cad`), where `dist/` is emitted. `$(pwd)` is resolved by your shell at that location:

```bash
npm run build   # emits dist/mcp/server.js
claude mcp add brep -- node "$(pwd)/dist/mcp/server.js"
```

Once the package is published to npm, the same server is available without a local build:

```bash
claude mcp add brep -- npx -y --package brepjs-cad brep-mcp
```

The server runs locally as a child process of your agent (stdio); geometry never leaves your machine.

## Examples gallery

Few-shot examples live under `skills/implement/examples/<name>.brep.ts`, each with a `<name>.expected.json` baseline. Grouped by category:

- **Primitives + booleans**: `mounting-bracket`, `flanged-coupler`, `transform-bracket`
- **2D sketch → solid**: `extruded-bracket` (extrude), `revolved-pulley` (revolve), `swept-gasket` (sweep)
- **Modifiers**: `rounded-block` (fillet), `chamfered-block` (chamfer), `hollow-enclosure` (shell)
- **Gridfinity primitives**: `gridfinity-baseplate`, `gridfinity-bin`, `gridfinity-divider`

## Eval / scorecard

`npm run eval` (`bench/run.ts`) replays every `skills/implement/examples/*.brep.ts` with a sibling `*.expected.json` through the public `runPart` runtime, compares measured volume/area/validity/shape-type against the recorded baseline within each file's tolerance (default 0.5%), prints a PASS/FAIL scorecard, and exits non-zero on any regression. It is deterministic (no LLM or API key) so it runs in CI as the package's regression net. Refresh a baseline by re-recording the example's `*.expected.json` after an intentional geometry change.

### Manual skill eval (`/eval-skill`)

The fast iteration loop — run on your Claude subscription, no API key, no billing. The `/eval-skill` slash command drives the same `bench/prompts.ts` corpus through the current Claude Code session: Claude authors each part from the **deployed `SKILL.md`**, runs `verify --check --snapshot`, judges the rendered snapshots against each prompt's rubric, emits the two-signal scorecard, and proposes SKILL.md fixes from the failures. This is the recommended way to answer "did my SKILL.md edit help?" — see `.claude/commands/eval-skill.md`.

### Live eval (`npm run eval:live`)

The **automated / isolated** counterpart to `/eval-skill` — opt-in and billed. An SDK harness sends the `bench/prompts.ts` prompts to a model with the **deployed `SKILL.md` as the system prompt** (so it measures the skill _in isolation_, not inside a Claude Code session), then verifies each generated part two ways:

- **Auto (objective):** `runPart --check` → valid solid + any pinned dims within tolerance.
- **Judge (intent):** a multimodal Claude call looks at the rendered iso/front/top/right snapshots and decides whether the part matches the request + rubric.

The scorecard reports per-category `valid` / `judge` / `both` rates and stamps the model + **resolved brepjs version** + date (so trend lines don't mix kernel versions).

```bash
ANTHROPIC_API_KEY=sk-... npm run eval:live -w brepjs-cad          # opus by default
ANTHROPIC_API_KEY=sk-... npm run eval:live -w brepjs-cad -- --model claude-sonnet-4-6
#   --only <id|category>   run a subset      --keep   keep the generated parts
```

Opt-in and **billed** (real API calls), so it does _not_ run in CI; the deterministic replay above is the CI gate. Snapshots (hence the judge) need `puppeteer`/Chrome; without them the run scores on auto-verify alone and notes the skipped judge.

## Programmatic API

```ts
import { runPart, runChecks, serializeReport } from 'brepjs-cad';

const { shape, report, step } = await runPart('part.brep.ts', { step: true });
console.log(serializeReport(report)); // { ok, shapeType, checks, measurements, errors }
```

## How verification works

Deterministic checks are the source of truth (validity brands (`validSolid`), `measureVolume`/`measureArea`, and bounding box) surfaced as a JSON report. Multi-view PNG snapshots are a diagnostic layer, never a substitute for a measurement. STEP is the primary, validated artifact; GLB/STL are derived previews.
