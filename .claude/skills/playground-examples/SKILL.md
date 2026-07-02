---
name: playground-examples
description: This skill should be used when adding, editing, or fixing an example in apps/playground — when a task says "add a playground example", "example fails check:examples", "playgroundExamples.test.ts is failing", "regenerate ambient types", "generate-types", "example thumbnail is missing", "run npm run thumbs", "example renders wrong / blank viewer", "example works in tests but breaks in the browser", or when a new example needs to pass its three gates (types, geometry, thumbnail) before merge.
---

# Playground examples

Add or fix an example in `apps/playground` and clear its three gates: types, geometry, thumbnail. Every example is a self-contained code string that (1) type-checks against the editor's ambient types, (2) evaluates and meshes against the OCCT kernel in the root test suite, and (3) ships a committed `.webp` thumbnail. Miss any one and CI or the gallery breaks.

For bulk import from an OpenSCAD reference library, use the `/scad-to-playground` workflow instead — it encodes the same validate→render→repair loop for many examples at once. This skill is the manual, single-example counterpart.

## Example anatomy

An example is an `Example { id, label, description, code }` (`apps/playground/src/lib/examples/types.ts`). Examples live in category files and are aggregated by a barrel:

| File                                             | Category    | Notes                                        |
| ------------------------------------------------ | ----------- | -------------------------------------------- |
| `apps/playground/src/lib/examples/basics.ts`     | Basics      | Calibration for house comment style          |
| `apps/playground/src/lib/examples/mechanical.ts` | Mechanical  | Largest set                                  |
| `apps/playground/src/lib/examples/sheetMetal.ts` | Sheet Metal | imports `brepjs-sheetmetal`                  |
| `apps/playground/src/lib/examples/bim.ts`        | BIM         | imports `brepjs-bim`, uses top-level `await` |
| `apps/playground/src/lib/examples/index.ts`      | barrel      | builds `CATEGORIES` + flat `EXAMPLES`        |

To add an example: append an `Example` to the appropriate category array. To add a new category: create a file exporting an `Example[]`, then register it in `CATEGORIES` (`index.ts`).

### Code-string rules (hard constraints)

The `code` field becomes the Monaco editor buffer verbatim AND is executed by both the browser worker and the root test harness. It must obey (`types.ts`):

- **Self-contained.** No shared helpers, no imports of other examples, no TS-only constructs the harness's sucrase strip can't handle (`transforms: ['typescript']`, `tests/helpers/playgroundExampleEval.ts`).
- **Named imports only, from the recognized specifiers.** The eval harness rewrites only the `import { … } from '<spec>'` form for these specifiers: `brepjs`, `brepjs/quick`, `brepjs/playground`, `brepjs-sheetmetal`, `brepjs-bim` (`playgroundExampleEval.ts`). Namespace (`import * as`) and default imports are NOT rewritten and will fail at runtime. Prefer `'brepjs/quick'`.
- **Ends in `export default <shape | shape[]>`.** Return one shape or an array; an array renders each shape. The harness turns `export default` into `return` (`playgroundExampleEval.ts`).
- **`color()` / `present()` come from `'brepjs/playground'`**, not published API. `color(shape, css)` tags a color; `present(shape, { dxf, ifc, bimTree, overlay2d })` attaches downloadable artifacts. Both are stripped back to the shape before meshing (`playgroundExampleEval.ts, 108-113`).
- **`unwrap()` finishing ops — never `x.ok ? x.value : base`.** See Gate 2; the silent-fallback ban is enforced by regex.

### Comment style

Match `basics.ts`: one punchy header line, aligned trailing dimension comments, terse one-line section notes. Example from `basics.ts`:

```
const drilled = unwrap(cut(box(30, 20, 10), cylinder(5, 15, { at: [15, 10, -2] })));
```

Keep comments concise — they are read in a small Monaco pane. Avoid multi-line walls of prose.

## The three gates

### Gate 1 — types (`check:examples`)

```
cd apps/playground && npm run check:examples
```

`apps/playground/scripts/checkExamples.ts` type-checks every example's `code` against the generated ambient `.d.ts` files (`src/types/brepjs-ambient.d.ts`, `-sheetmetal-`, `-bim-`), wrapped into `declare module` blocks by the same `buildBrepjsModuleDts` the Monaco editor uses, with the editor's compiler options (ES2022, moduleResolution Bundler, strict, skipLibCheck). Passing == "no red squiggles in the editor". It also checks the docs landing hero snippet `docs-hero:PLAYGROUND_PROGRAM` extracted from `apps/docs/.vitepress/theme/components/CodeCadHero.vue` — if that template literal is renamed or moved, the script exits 1 with a pointed message.

On failure, decide the cause:

| Symptom                                                 | Cause               | Fix                                                                                                     |
| ------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------- |
| Error on an API the example uses                        | Example bug         | Fix the `code` string                                                                                   |
| Method/type exists in `src` but not the ambient `.d.ts` | Stale ambient types | Rebuild the package(s), run `npm run generate-types`, commit the regenerated `src/types/*-ambient.d.ts` |
| "Could not find PLAYGROUND_PROGRAM"                     | Hero literal moved  | Restore the literal or update the `PLAYGROUND_PROGRAM` regex in `checkExamples.ts`                      |

Regenerating types: `generate-ambient-types.ts` reads each package's built `node_modules/<pkg>/dist/index.d.ts` (build the package first), and deliberately excludes the experimental `implicit/` modules (`EXCLUDED_MODULE_RE = /(^|\/)implicit\//`, generator lines 60-64) because they re-export core primitives aliased as `sdfCylinder` etc. that would otherwise overwrite the real `cylinder`/`box`/`cone`. Satellite packages re-emit their brepjs-sourced names as a top-of-file `import type { … } from 'brepjs'` that resolves against the sibling `declare module 'brepjs'` at consumption time — leave that mechanism intact. See kernel-abstraction and companion-packages skills for package build order.

Where it runs in CI: the playground `build` script is `tsc -b && npm run check:examples && vite build` (`package.json:11`), executed by the `playground-build` job (`.github/workflows/ci.yml:119`), path-gated on `apps/playground/**`. CI builds `brepjs`, `brepjs-bim`, `brepjs-sheetmetal` before building the playground.

### Gate 2 — geometry (`tests/playgroundExamples.test.ts`)

```
npx vitest run --project occt-wasm tests/playgroundExamples.test.ts
```

Run from the repo root. This lives in `tests/`, so it is part of the root suite and needs no dist build — root vitest aliases `brepjs`, `brepjs-sheetmetal`, `brepjs-bim` to live `src` (`vitest.config.ts`). Pre-commit's changed-file run (`vitest run --project occt-wasm --changed`) picks it up when an example file changes, because vitest `--changed` follows the import graph into `apps/playground/src/lib/examples/`.

Four assertion families (`tests/playgroundExamples.test.ts`):

1. **Unique `id` and `label`** across all examples (lines 20-25).
2. **Evals + meshes**: each example produces `shapeCount > 0` and `totalVertices > 0` (lines 27-33).
3. **No silent finishing-op fallback**: the regex `/(\.ok\s*\?[^:]*:|isOk\s*\([^)]*\)\s*\?[^:]*:)/` must not match — patterns like `x.ok ? x.value : base` or `isOk(x) ? unwrap(x) : base` are banned (lines 40-48). A swallowed fillet/chamfer failure makes a no-op pass the mesh check while shipping an unfinished part. Use `unwrap()` so failures throw and get caught. See result-error-handling.
4. **Connected-body check** for a hard-coded assembly list `CONNECTED_BODY_EXAMPLES` (universal-joint, geneva-drive, bench-vise, scotch-yoke, three-jaw-chuck, worm-gear-drive, lines 55-62): each exported body must have `getSolids().length === 1`. A disjoint compound still meshes but detaches on STEP/GLB export. **When adding a multi-body mechanism/assembly example, add its id to this list.**

If geometry is wrong (see debugging-geometry for the full triage): common example pitfalls are `revolve()` of a profile whose edge touches the axis (degenerate), features added where they should be cut (inverted boolean), and the silent-fallback pattern above.

### Gate 3 — thumbnail (committed `.webp`)

Each example needs a committed `apps/playground/public/example-thumbs/<id>.webp` (58 static thumbnails committed today; a further 46 optional `.turntable.webp` files also live here), consumed by `ExampleGallery.tsx`. Generating one requires a running dev server:

```
cd apps/playground
(npm run dev > tmp/pg.log 2>&1 &) ; sleep 6
PORT_URL=$(grep -oE 'http://localhost:[0-9]+' tmp/pg.log | head -1)
npm run thumbs "$PORT_URL" <example-id>
```

Vite may pick a non-5173 port if one is busy — always sniff the actual URL from the log, don't hardcode. `npm run thumbs` (`shootExamples.ts --thumbs`) frames the model (Iso preset, Fit, grid off) and writes a centred square WebP. Commit `public/example-thumbs/<id>.webp`.

Optional companion: `npm run turntables "$PORT_URL" <id>` writes an animated `<id>.turntable.webp` (needs `img2webp` or `ffmpeg` on PATH and the DEV-only `window.__brepjsOrbit` hook). The gallery lazy-loads it on hover and remembers 404s, so a missing turntable is tolerated — many examples ship only the static webp.

Visual-repair loop: `npm run shoot "$PORT_URL" tmp/shots <id>` writes a full-page PNG; Read it to confirm the shape looks right, edit the `code`, re-run Gate 2, re-shoot. A shape can pass eval+mesh yet render off-centre, floating, or degenerate — the screenshot is the only thing that catches that.

## Symptom → cause → fix

| Symptom                                                   | Cause                                                                                                            | Fix                                                                                                                                                                                |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gates green, browser shows blank/broken viewer            | Stale companion `dist` (worker lazy-imports `brepjs-bim`/`brepjs-sheetmetal` from their built `dist`, not `src`) | `build:deps` runs on `predev`/`prebuild` and auto-heals; restart a long-running dev server after editing `brepjs-bim`/`brepjs-sheetmetal`/`brepjs-viewer`. See companion-packages. |
| Namespace/default import fails at runtime but type-checks | Harness only rewrites `import { … } from` form                                                                   | Convert to named imports                                                                                                                                                           |
| Example edit not lint/format-checked locally              | Playground app code is outside root lint/typecheck/lint-staged                                                   | Its own gates are `tsc -b` + `check:examples` + `vite build` in the path-gated `playground-build` CI job                                                                           |
| Thumbnail command fails to connect                        | Wrong port                                                                                                       | Sniff the port from the dev-server log                                                                                                                                             |
| `check:examples` fails on the hero snippet                | Hero literal moved in `CodeCadHero.vue`                                                                          | Keep `PLAYGROUND_PROGRAM` intact or update `checkExamples.ts`                                                                                                                      |

Note: the production `playground-smoke` workflow only checks the deployed engine boots; it does NOT verify examples. Gate 2 is the sole guard that each example runs.

## Checklist for a new example

1. Add the `Example` to the right category file (or register a new category in `index.ts`).
2. `cd apps/playground && npm run check:examples` — types green.
3. `npx vitest run --project occt-wasm tests/playgroundExamples.test.ts` — geometry green (add multi-body assemblies to `CONNECTED_BODY_EXAMPLES`).
4. Start dev server, `npm run thumbs "$URL" <id>`, commit `public/example-thumbs/<id>.webp`.
5. Optional: `npm run shoot "$URL" tmp/shots <id>` + Read the PNG to confirm framing.

## Additional resources

The in-code file headers are the authoritative depth and stay current with the code; read them rather than a restatement:

- `apps/playground/src/lib/examples/types.ts` — authoring rules
- `apps/playground/scripts/checkExamples.ts` — Gate 1
- `tests/playgroundExamples.test.ts` + `tests/helpers/playgroundExampleEval.ts` — Gate 2 + eval harness mechanics
- `apps/playground/scripts/shootExamples.ts` — Gate 3, audit and turntable modes
- `apps/playground/scripts/generate-ambient-types.ts` + `apps/playground/src/lib/ambientModule.ts` — the editor type surface
- `.claude/workflows/scad-to-playground.js` — bulk-import automation precedent

Sibling skills: `debugging-geometry` (wrong/empty geometry), `result-error-handling` (`unwrap` vs fallback), `companion-packages` (dist build order, stale-dist trap), `quality-gates` and `ci-triage` (gate/CI mechanics).
