---
name: brepjs-verify
description: Use when authoring or editing parametric 3D CAD models in TypeScript with the brepjs library — turning natural-language part requirements into solids, then type-checking, verifying deterministically (validity + volume/area/bounds vs intent), and visually (multi-view snapshots) before handing off STEP/GLB artifacts.
---

# Authoring CAD with brepjs

You write a `.brep.ts` part; the `brepjs-verify` CLI runs it against a real geometry kernel and tells you the truth. Never judge a part by how the code reads — judge it by the report. The loop below is the job.

Commands below use `npx -y brepjs-verify`; if you've installed the package, drop the `npx -y` and call `brepjs-verify` directly.

## The loop (every part, in order)

1. **Brief.** Convert the request to explicit params: dimensions (mm), datums, features, assumptions. Don't ask the user for JSON.
2. **Load only the reference you need** (index below) — not all at once.
3. **Author `.brep.ts`** — `export default () => <shape>` with the short API (`box`, `cylinder`, `fuse`, `cut`, `fillet`, …), named consts at the top. Scaffold with `npx -y brepjs-verify init <name>`. Edit _source_, never generated artifacts.
4. **Declare intent.** Add an `expected` block from your brief, e.g. `export const expected = { volume: 24000, tolerancePct: 1 }`. Any of `volume`, `area`, `bounds` are optional; `tolerancePct` sets the match window. Bounds shape is exactly `bounds: { xMin, xMax, yMin, yMax, zMin, zMax }` (declare any subset) — **not** `{ min, max }` or `{ x, y, z }` (a wrong shape is reported as `EXPECTED_UNKNOWN_KEY`, not silently ignored). The CLI asserts it — this is how you prove the part is the _right_ part, not just a valid one. **Prefer `bounds`** (read straight off your datums/params) over a hand-computed `volume`: multi-feature volume arithmetic is easy to get wrong, and a wrong number fails a _correct_ part. To assert volume, run once and copy the report's measured value.
5. **Verify (type + geometry).** `npx -y brepjs-verify verify part.brep.ts --check --json report.json`. `--check` type-checks before running (catches wrong-API calls early); the JSON report is the source of truth. Iterate fast with `npx -y brepjs-verify watch part.brep.ts`.
6. **Verify visually.** Add `--snapshot shots/` for iso/front/top/right PNGs — each has the bbox size (`W × D × H`) burned in, so you can read scale from the image. Review against the brief. A visual concern is **not** a conclusion — convert it to a measurement ("hole looks off-center → check `bounds`"). Don't declare done without a snapshot.
7. **Repair the smallest responsible section** and re-run. Use the report's `hints` to guide the fix.
8. **Export + hand off.** `npx -y brepjs-verify verify part.brep.ts --step part.step` (STEP is the validated primary deliverable; GLB/STL are derived). Batch behind a validity gate with `npx -y brepjs-verify export part.brep.ts --all`. `--serve` prints a clickable link to an interactive inspector (view presets, solid/wire/x-ray, face picking, section plane, measurements panel) for the human to eyeball — report that URL. In an interactive terminal it also opens the browser; under agent/CI runs (non-TTY) auto-open is suppressed automatically, so you normally don't need `--no-open` (pass it to be explicit). Report the STEP path.

## Reading the report (this is the source of truth)

```jsonc
{
  "ok": false,                       // true only if valid AND every assertion passes
  "shapeType": "Solid",
  "checks": [{ "name": "isValidSolid", "passed": false }],
  "measurements": { "volume": …, "area": …, "bounds": {…} },
  "assertions": [{ "name": "volume", "expected": 24000, "actual": 31200, "passed": false }],
  "hints":  [{ "code": "FILLET_NO_EDGES", "fix": "…", "nextStep": "…" }],
  "errorInfos": [{ "code": "…", "message": "…" }]
}
```

- **`ok`** is the verdict. `false` → not done. With an `expected` block, `ok` also requires every assertion to pass.
- **`checks`** = kernel validity (manifold solid, positive volume). A failed check means the geometry is broken, not just wrong-sized.
- **`assertions`** = your declared intent vs reality. A failed assertion means valid-but-wrong (off dimensions).
- **`hints`** = actionable fix + next step keyed on the error code. Read these before guessing.
- **`errorInfos`** = the raw structured failures (`code` + `message`) the hints derive from — authoring, kernel, or export errors. Cite the `code` when repairing.
- Trust this JSON over the rendered image. The render confirms _shape_; the JSON confirms _correctness_.

## Repair discipline

- Change the **smallest responsible section**, re-verify, repeat. Don't rewrite the whole part on one failure.
- Let the `code`/`hints` localize the cause (e.g. `INVALID_FILLET_RADIUS` → reduce radius vs local edge length; `*_NOT_3D` → you passed a 2D shape to a 3D op; `BOOLEAN_HAS_ERRORS` → inputs overlap-degenerate).
- A part that _runs_ but reports `ok:false` is wrong, not done — same as a crash.

## Reliable scope (be honest)

- **Reliable first-try:** primitives, booleans (`fuse`/`cut`/`intersect`), `compound` (group many bodies into an assembly — no boolean cost), 2D sketch → extrude, `fillet`/`chamfer`, `shell`/`offset`, transforms. Prefer these.
- **Advanced — verify extra carefully, expect iteration:** sweeps, lofts, revolves, multi-section, welded assemblies (`fuseAll`), text. They fail more often (degenerate profiles, self-intersection); lean harder on the report and small steps.
- **Assemblies (furniture, kits, many parts):** reach for `compound([...])`, not `fuseAll` — faster, and each part stays distinct. Only `fuseAll` when you truly need one watertight solid (and use `{ unsafe: true }` over `Shape3D[]`). Color the GLB preview with `export const materials`. See `references/booleans.md`.

## Hard rules

- Edit source, not artifacts. STEP/STL/GLB derive from the `.brep.ts`.
- Booleans and `measureVolume`/`measureArea` return `Result` — unwrap and check the `Err` branch before chaining.
- `fillet`/`chamfer` need a valid solid (its signature is `fillet(solid, edges, radius)`). Verify validity first.
- **Select edges/faces — don't fillet/chamfer everything.** `fillet(solid, radius)` (no edge list) rounds EVERY edge and frequently fails (`FILLET_FAILED`). Pass an edge list: `edgeFinder().inDirection('Z').findAll(solid)`. Note `inDirection` matches BOTH ± orientations — discriminate a single face/edge by position with `.when(f => getBounds(f).zMax > t)`. (See `references/modifiers.md`.)
- **`revolve` angle is in RADIANS** (full turn = `Math.PI * 2`, not `360`). Build a revolve profile with `polygon(points3D)`, not `draw().close().sketchOnPlane('XZ').face()` — the latter fails `--check` (`sketchOnPlane` is typed `SketchInterface | Sketches` and `.face()` isn't on both). (See `references/sketching-2d.md`.)
- `box(width, depth, height)`: 2nd arg is depth (Y), 3rd is height (Z); positioning option is `at`, not `origin`. Units mm.
- **Parts may be `async`** — `export default async () => {…}` is awaited, so you can `await loadFont(...)` (required before any `sketchText`/`drawText`) or `await importSTEP(...)` inside. `--check` type-checks Node built-ins, so a part may `import { readFile } from 'node:fs/promises'` to load a font/STEP file from disk.
- **Pattern angles are DEGREES** (`circularPattern`/`rectangularPattern` `fullAngle`, default 360) — _unlike_ `revolve` (radians). brepjs is not uniform; check the unit per op.
- Author parts in an ESM context (the tool's default) so the kernel loads — a CommonJS project needs `"type": "module"` or a `.mts` file.

## Reference index (progressive — load only what the task needs)

- Getting started + kernel init → `references/getting-started.md`
- Primitives → `references/primitives.md`
- 2D sketching → extrude → `references/sketching-2d.md`
- Booleans → `references/booleans.md`
- Fillet/chamfer/shell/offset → `references/modifiers.md`
- Transforms → `references/transforms.md`
- Measurement + the verify loop → `references/measurement-validation.md`
- Export formats → `references/export.md`

**Full API reference (backstop):** for any symbol, signature, or option not covered by the curated references above, consult brepjs's complete `llms-full.txt` — every export with signatures and examples. It ships bundled in the package at `reference/llms-full.txt`, and is online at <https://github.com/andymai/brepjs/blob/main/llms-full.txt>. Reach for it before guessing an API; the curated references are a fast path, not the whole surface.

## Examples index (few-shot — read the closest one before authoring)

Each is a complete `skill/examples/<name>.brep.ts` with a sibling `<name>.expected.json` baseline (replayed by the `eval` harness).

- **Primitives + booleans:** `mounting-bracket` (base + upright web + bolt holes) · `flanged-coupler` (flange + cylinder + bore, chamfered) · `transform-bracket` (translate/rotate/mirror).
- **2D sketch → solid:** `extruded-bracket` (rounded plate + bolt holes) · `revolved-pulley` (V-groove revolved) · `swept-gasket` (frame swept along a spine).
- **Modifiers:** `rounded-block` (fillet) · `chamfered-block` (chamfer) · `hollow-enclosure` (filleted box, shelled).
- **Gridfinity:** `gridfinity-baseplate` · `gridfinity-bin` · `gridfinity-divider`.

## CLI subcommands (the `brepjs-verify` bin)

- `verify <file>` (default) — report; flags `--check`, `--json`, `--step`, `--glb`, `--snapshot <dir>`, `--serve`, `--no-open` (with `--serve`, never auto-open the browser).
- `init <name>` — scaffold `<name>.brep.ts` + `tsconfig.json`.
- `watch <file>` — re-verify on every save.
- `export <file>` — batch STEP/GLB/STL behind a validity gate (`--step`/`--glb`/`--stl`/`--all`).
- `measure <a> [b]` — measurements for one part, or distance between two.
- `diff <a> <b>` — compare two parts' measurements.
