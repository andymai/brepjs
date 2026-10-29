---
title: CLI Reference
description: 'Every brep subcommand (verify, init, watch, preview, export, measure, diff, snapshot), flag, and exit code, plus the MCP server and troubleshooting.'
---

# CLI Reference

The `brep` bin is a multi-command CLI. `verify` is the default command, so `brep part.brep.ts` runs it directly. Every command except `snapshot` (which prints the PNG paths) writes a single machine-readable JSON document to **stdout**; diagnostics (paths, kernel chatter, watch notices) go to **stderr**. Commands exit non-zero when the report is not `ok`, so they work in CI and agent loops.

Prefix any command with `npx -y -p brepjs-cad` to run without installing.

## Commands

| Command                | What it does                                                                                                                                                                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `brep verify <file>`   | **Default command.** Loads the part, runs deterministic checks, prints the JSON report. Flags: `--check`, `--json <out>`, `--step <out>`, `--glb <out>`, `--snapshot <dir>`, `--serve`.                                                                  |
| `brep init <name>`     | Scaffolds a parameterized `<name>.brep.ts` + `tsconfig.json` + `README.md` into `./<name>` (or `--out <dir>`). Never overwrites existing files.                                                                                                          |
| `brep watch <file>`    | Re-verifies on every save until Ctrl-C (debounced; watches the project tree, from the nearest `package.json`/`tsconfig.json`, to survive editor rename-on-save).                                                                                         |
| `brep preview <file>`  | Element-aware live viewer for a model module (families element tree, resolved tree, or plain shape). `--watch` re-evaluates on save; `--write-only` (CI), `--glb <out>`, `--json <out>`, `--port <n>`, `--no-open`.                                      |
| `brep export <file>`   | Batch artifacts behind a validity gate: `--step`, `--glb`, `--stl`, or `--all`; `--3dm` writes an element-aware Rhino file (optional `rhino3dm` install; not combinable with the other formats); `--out <dir>` (default `.`). Exits non-zero on failure. |
| `brep measure <a> [b]` | Measurements for one part; with a second module, the distance between the two parts.                                                                                                                                                                     |
| `brep diff <a> <b>`    | Compares the measurements of a baseline and a comparison module.                                                                                                                                                                                         |
| `brep snapshot <file>` | Multi-view PNG capture (`--out <dir>`, `--label <tag>`), also available via `verify --snapshot <dir>`. Needs the optional `puppeteer`/Chrome dependency.                                                                                                 |

## `verify` flags

| Flag                   | Effect                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--check`              | Run a TypeScript type-check **before** executing the part. Type errors are surfaced as `TYPECHECK` error infos and the part is not run; wrong-API calls never reach the kernel.                                                                                                                                                                                                           |
| `--json <out>`         | Write the full JSON report to a file (in addition to stdout).                                                                                                                                                                                                                                                                                                                             |
| `--step <out>`         | Export STEP. It is written even when the report is not `ok`, so check `ok` before handing it off (`brep export` is the validity-gated path). STEP is the validated primary deliverable.                                                                                                                                                                                                   |
| `--glb <out>`          | Export a derived GLB mesh preview. (`--stl` lives on the `export` command, not `verify`.)                                                                                                                                                                                                                                                                                                 |
| `--snapshot <dir>`     | Render iso / front / top / right PNGs into `<dir>` (needs `puppeteer`).                                                                                                                                                                                                                                                                                                                   |
| `--serve`              | After a passing verify, start a preview server and print a clickable `?dir=&file=` link rendering the real STEP; it stays running until Ctrl-C. Only serves when the report is `ok`; a failing report still exits non-zero. In an interactive terminal it also opens your default browser (skipped when the server is reused, under CI, on non-TTY/agent runs, or with no Linux display). |
| `--no-open`            | With `--serve`, never auto-open the browser; print the URL only.                                                                                                                                                                                                                                                                                                                          |
| `--metrics`            | Add deterministic manufacturability metrics (per-body breakdown, body interference, bores) to the report. Slower; `--snapshot` turns it on.                                                                                                                                                                                                                                               |
| `--expect-code <code>` | Exit 0 only if the report carries this error code. For known-bad fixtures and evals.                                                                                                                                                                                                                                                                                                      |
| `--expect-invalid`     | Exit 0 only if the report is not `ok`. For known-bad fixtures.                                                                                                                                                                                                                                                                                                                            |

## Common invocations

```bash
# primary STEP + deterministic report, type-checked first
npx -y -p brepjs-cad brep part.brep.ts --check --step part.step --json report.json

# multi-view PNGs for visual review
npx -y -p brepjs-cad brep part.brep.ts --snapshot shots/

# live re-verify while you edit
npx -y -p brepjs-cad brep watch part.brep.ts

# clickable preview (renders the real STEP), opens your browser
npx -y -p brepjs-cad brep part.brep.ts --serve
# or print the URL without opening a browser
npx -y -p brepjs-cad brep part.brep.ts --serve --no-open

# batch every artifact behind a validity gate
npx -y -p brepjs-cad brep export part.brep.ts --all --out dist/
```

## The `expected` contract

Declare intended dimensions in the part and the CLI turns them into assertions. The report's `ok` is `true` only when the part is valid **and** every assertion passes within tolerance.

<!-- @no-test -->

```ts
import { box } from 'brepjs';

// All fields optional. tolerancePct (default 0.5) is a percent of the expected value for
// volume and area, and of the part's largest extent for each bounds field.
// Values below match a centered 40×20×10 box: 8000 mm³, 2800 mm², bounds ±20/±10/±5.
export const expected = {
  volume: 8000,
  area: 2800,
  bounds: { xMin: -20, xMax: 20, yMin: -10, yMax: 10, zMin: -5, zMax: 5 },
  tolerancePct: 1,
};
export default () => box(40, 20, 10, { centered: true });
```

Each declared field appears in `report.assertions` as `{ name, expected, actual, passed }`. `volume` and `area` each produce one assertion; every declared `bounds` edge produces its own (named `bounds.xMin`, `bounds.xMax`, …).

## Snapshots & the preview server

`--snapshot` and `--serve` use the bundled viewer (shipped with the package, including the OCCT WASM) and render the **real exported STEP**, not a code preview. Snapshots require the optional `puppeteer`/Chrome dependency; when it is absent the CLI prints a message naming the missing dependency, skips `--snapshot`, still writes the JSON report, and exits non-zero. The viewer is read-only display + screenshot.

`--serve` prints the viewer URL and, in an interactive terminal, opens it in your default browser. Auto-open is skipped when it would be unwanted (a reused server where a tab already exists, CI, a non-TTY/piped session such as an agent run, or Linux with no display server), and `--no-open` always suppresses it. Agents get the URL without a browser launching.

## MCP server

The package ships a second bin, `brep-mcp`: a stdio [MCP](https://modelcontextprotocol.io) server that exposes the verify substrate to MCP-capable agents (Claude Code, Claude Desktop, any MCP client) directly, without spawning the CLI. For single parts it provides:

| Tool          | Input                                    | Returns                                                                                                                                                                                                                    |
| ------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `run_program` | `{ code: string, timeoutMs?: number }`   | Runs the `.brep.ts` source in an isolated, timeout/OOM-bounded sandbox and returns the verification report (validity, measurements, topology) as JSON. `isError` is set when the part fails checks, times out, or crashes. |
| `export_part` | `{ code, outDir, formats?, timeoutMs? }` | Builds the part in the sandbox and writes STEP, GLB and STL files to `outDir`.                                                                                                                                             |

It's the _build → verify_ step of [the loop](./the-loop.md) as a single call: the agent sends part source and gets back the deterministic report, in a separate process so a runaway part can't hang the agent. Register it with Claude Code:

```bash
claude mcp add brep -- npx -y --package brepjs-cad brep-mcp
```

Geometry never leaves your machine; the server runs locally as a child process over stdio.

### BIM sessions

For buildings, the server can also hold a model open. `open_model` builds a [families](../families/overview) program or imports an `.ifc` file into a session; the agent then queries elements by key path or GlobalId, edits the program, and `rebuild` reports exactly what each edit changed. Sessions can also render pictures and export validated IFC. [BIM over MCP](./bim-mcp) walks through an edit and lists every session tool.

## Troubleshooting

**`cannot load TypeScript part … (ESM)`**: Author parts in an ESM context. Node strips types natively (requires Node 24+) but only under ESM, so a part in a CommonJS project fails. Fix: set `"type": "module"` in `package.json`, or rename the part to `.mts`. A transpiler fallback is intentionally not used; it would load `brepjs` in a separate module realm and hand the part an uninitialized kernel.

**`kernel not initialized` / version skew**: The runtime prefers your project-local `brepjs` + `occt-wasm` when present, else its own bundled copies, routing both the tool and the part through one instance. Keep `brepjs` and `occt-wasm` in the same project as the part so the resolve hook version-matches them.

**Snapshots / judge skipped**: Install `puppeteer` (it fetches Chromium on first use) to enable `--snapshot` and the live-eval visual judge. Without it, verification still runs on measurements alone.

**Node version**: Native TypeScript type-stripping for `.brep.ts` requires Node 24+. Older Node needs the part precompiled to `.mjs`.

## Next steps

- [The Verify Loop](./the-loop): how to use these commands as a workflow
- [Eval & Scorecard](./eval): how the skill measures itself
