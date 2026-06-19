---
name: brepjs-verify
description: Use when authoring, editing, or debugging parametric 3D CAD with the brepjs TypeScript library — turning a natural-language part request into a solid, working in a .brep.ts file, running brepjs-verify, exporting STEP/GLB/STL, or fixing a brepjs part that's invalid, the wrong size, or doesn't look designed.
---

# Authoring CAD with brepjs

You write a `.brep.ts` part; the `brepjs-verify` CLI runs it on a geometry kernel and reports what it measured. Judge the part by the report, not by how the code reads. Follow the loop below for every part.

Commands below use `npx -y brepjs-verify`; if you've installed the package, drop the `npx -y` and call `brepjs-verify` directly.

## The loop (every part, in order)

1. **Brief.** Convert the request to explicit params: dimensions (mm), datums, features, assumptions. Don't ask the user for JSON.
2. **Load only the reference you need** (index below), not all at once.
3. **Author `.brep.ts`**: `export default () => <shape>` with the short API (`box`, `cylinder`, `fuse`, `cut`, `fillet`, …), named consts at the top. Scaffold with `npx -y brepjs-verify init <name>`. Edit _source_, never generated artifacts.
4. **Declare intent.** Add an `expected` block from your brief, e.g. `export const expected = { volume: 24000, tolerancePct: 1 }`. Any of `volume`, `area`, `bounds` are optional; `tolerancePct` sets the match window. Bounds shape is exactly `bounds: { xMin, xMax, yMin, yMax, zMin, zMax }` (declare any subset), **not** `{ min, max }` or `{ x, y, z }` (a wrong shape is reported as `EXPECTED_UNKNOWN_KEY`, not silently ignored). The CLI asserts it, catching a part that is valid but wrong-sized. **Prefer `bounds`** (read straight off your datums/params) over a hand-computed `volume`: multi-feature volume arithmetic is easy to get wrong, and a wrong number fails a _correct_ part. To assert volume, run once and copy the report's measured value.
5. **Verify (type + geometry).** `npx -y brepjs-verify verify part.brep.ts --check --json report.json`. `--check` type-checks before running (catches wrong-API calls early); the JSON report is the source of truth. Iterate fast with `npx -y brepjs-verify watch part.brep.ts`.
6. **Verify visually.** Add `--snapshot shots/` for iso/front/top/right PNGs; each has the bbox size (`W × D × H`) burned in, so you can read scale from the image. Review against the brief. A visual concern is **not** a conclusion: convert a _dimensional_ one to a measurement ("hole looks off-center → check `bounds`"); a _design-quality_ one ("looks lumpy / glued-from-primitives") goes to the polish pass (step 8). Don't declare done without a snapshot.
7. **Repair the smallest responsible section** and re-run. Use the report's `hints` to guide the fix.
8. **Polish pass** — when the part should look _designed_, not merely valid (products, toys, mechanisms, anything a human eyeballs). A lumpy stack of overlapping primitives still reports `ok:true`, so validity never catches it. Render iso + a detail view and critique: manufactured, or glued-from-primitives? Fix the worst offender — a primitive-blob (two solids doing one feature's job), a mismatched cap, raw sharp rims — prefer **additive** detail (fins, gussets, lightening holes, grooves, a flush rounded end) over the failure-prone `fillet`/`chamfer` ops, re-verify (`ok` stays true), re-render. See `references/design-polish.md`. Skip for purely functional/internal parts.
9. **Export + hand off.** `npx -y brepjs-verify verify part.brep.ts --step part.step` (STEP is the validated primary deliverable; GLB/STL are derived). Batch behind a validity gate with `npx -y brepjs-verify export part.brep.ts --all`. `--serve` prints a clickable link to an interactive inspector (view presets, solid/wire/x-ray, face picking, section plane, measurements panel) for the human to eyeball; report that URL. In an interactive terminal it also opens the browser; under agent/CI runs (non-TTY) auto-open is suppressed automatically, so you normally don't need `--no-open` (pass it to be explicit). Report the STEP path.

## Reading the report

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
- **`shapeType: 'Compound'` is normal for a single body.** A `cut`, a `fillet`, or a chain of cuts often reports the result as `Compound` even though it's one watertight solid — that's fine as long as `ok:true` and the validity checks (`manifold`, `allBodiesValid`) pass. Only a _loose_ `Compound` from a failed `fuse` of merely-touching solids is the problem (`references/booleans.md`); don't retry a valid part just because it isn't labelled `Solid`.
- **`assertions`** = your declared intent vs reality. A failed assertion means valid-but-wrong (off dimensions).
- **`hints`** = actionable fix + next step keyed on the error code. Read these before guessing.
- **`errorInfos`** = the raw structured failures (`code` + `message`) the hints derive from (authoring, kernel, or export errors). Cite the `code` when repairing.
- Trust this JSON over the rendered image. The render confirms _shape_; the JSON confirms _correctness_.

## Repair discipline

- Change the **smallest responsible section**, re-verify, repeat. Don't rewrite the whole part on one failure.
- Let the `code`/`hints` localize the cause (e.g. `INVALID_FILLET_RADIUS` → reduce radius vs local edge length; `*_NOT_3D` → you passed a 2D shape to a 3D op; `BOOLEAN_HAS_ERRORS` → inputs overlap-degenerate).
- A part that _runs_ but reports `ok:false` is wrong, not done. Treat it like a crash.

## Reliable scope (be honest)

- **Reliable first-try:** primitives, booleans (`fuse`/`cut`/`intersect`), `compound` (group many bodies into an assembly, no boolean cost), 2D sketch → extrude, `fillet`, `shell`/`offset`, transforms. Prefer these. (`chamfer` is the exception — it fails far more often than `fillet`; see Hard rules.)
- **Advanced (verify carefully, expect iteration):** sweeps, lofts, revolves, multi-section, welded assemblies (`fuseAll`), text. They fail more often (degenerate profiles, self-intersection); lean harder on the report and small steps.
- **Assemblies (furniture, kits, many parts):** reach for `compound([...])`, not `fuseAll`: faster, and each part stays distinct. Only `fuseAll` when you truly need one watertight solid (and use `{ unsafe: true }` over `Shape3D[]`). Color the GLB preview with `export const materials`. See `references/booleans.md`.
- **Mechanisms (anything that moves — hinge, slider, gear, crank, linkage):** a part-by-part valid assembly can still **jam or not move**, and the kernel won't catch it. Sweep the drive parameter (crank angle, etc.) and assert parts never interpenetrate (`intersect` volume ≈ 0) AND the driven element travels its intended distance. Don't claim a mechanism works from a single rendered pose. See `references/assemblies-motion.md`.

## Hard rules

- Edit source, not artifacts. STEP/STL/GLB derive from the `.brep.ts`.
- **Import every function you call.** brepjs has no globals — every op (`box`, `cut`, `fuse`, `fillet`, `shell`, `compound`, `edgeFinder`, `faceFinder`, `getBounds`, `translate`, `unwrap`, …) is a named export from `'brepjs'`. Before finishing, re-scan the body and confirm every called name is in your `import { … } from 'brepjs'` line: a used-but-unimported symbol is `TS2304: Cannot find name` and fails `--check` before any geometry runs — the #1 first-attempt failure.
- Booleans and `measureVolume`/`measureArea` return `Result`: unwrap and check the `Err` branch before chaining. `TS2322: Result<X> is not assignable to X` (or `… not assignable to Shapeable`) means a `Result`-returning op (`cut`/`fuse`/`fillet`/`chamfer`/`shell`/…) was assigned or passed without `unwrap()` — wrap it: `unwrap(cut(...))`.
- **`fuse` welds only where solids overlap**: bodies that merely touch on a coplanar face/ring may return a loose `Compound` (`ok:true`, not one watertight solid). Overlap the operands + `fuseAll(shapes, { unsafe: true })` for a weld; use `compound` for a distinct-bodies assembly. (See `references/booleans.md`.)
- `fillet`/`chamfer` need a valid solid (its signature is `fillet(solid, edges, radius)`). Verify validity first.
- **Select edges/faces; don't fillet/chamfer everything.** `fillet(solid, radius)` (no edge list) rounds EVERY edge and frequently fails (`FILLET_FAILED`). Pass an edge list: `edgeFinder().inDirection('Z').findAll(solid)`. Note `inDirection` matches BOTH ± orientations; discriminate a single face/edge by position with `.when(f => getBounds(f).zMax > t)` — `getBounds` is its own import from `'brepjs'`. (See `references/modifiers.md`.)
- **`chamfer` is kernel-fragile: `CHAMFER_FAILED` is common even with a correct edge list** (small or adjacent faces, edges meeting other features). Prefer `fillet` (much more robust), model the bevel additively (a `cut` with an angled tool), or drop it. On `CHAMFER_FAILED`, switch to `fillet` or remove the chamfer — re-running the same chamfer rarely helps.
- **`revolve` angle is in RADIANS** (full turn = `Math.PI * 2`, not `360`). Build a revolve profile with `polygon(points3D)`, not `draw().close().sketchOnPlane('XZ').face()`: the latter fails `--check` (`sketchOnPlane` is typed `SketchInterface | Sketches` and `.face()` isn't on both). (See `references/sketching-2d.md`.)
- `box(width, depth, height)`: 2nd arg is depth (Y), 3rd is height (Z). Units mm. **`at` sets the geometric CENTER, not a corner**: bare `box(w,d,h)` is corner-at-origin (`[0,w]×[0,d]×[0,h]`), `{ centered: true }` centers on the origin, `{ at: [x,y,z] }` centers there. `cylinder`/`cone` `at` is the **base** center; `sphere` `at` is its center. Modelling `at` as a corner ships valid-but-misplaced parts.
- **No half-sphere primitive:** build a hemisphere/dome by clipping a full `sphere` to a half-space with `intersect` (a `box` over the half you want), then `fuse`/`cut` — fusing a whole sphere bulges past the cap face. See the `dome-cap` example.
- **Parts may be `async`**: `export default async () => {…}` is awaited, so you can `await loadFont(...)` (required before any `sketchText`/`drawText`) or `await importSTEP(...)` inside. `--check` type-checks Node built-ins, so a part may `import { readFile } from 'node:fs/promises'` to load a font/STEP file from disk.
- **Pattern angles are DEGREES** (`circularPattern`/`rectangularPattern` `fullAngle`, default 360), _unlike_ `revolve` (radians). brepjs is not uniform; check the unit per op.
- Author parts in an ESM context (the tool's default) so the kernel loads. A CommonJS project needs `"type": "module"` or a `.mts` file.

## Reference index (progressive: load only what the task needs)

- Getting started + kernel init → `references/getting-started.md`
- Primitives → `references/primitives.md`
- 2D sketching → extrude → `references/sketching-2d.md`
- Booleans → `references/booleans.md`
- Assemblies & motion (validate mechanisms move without colliding) → `references/assemblies-motion.md`
- Fillet/chamfer/shell/offset → `references/modifiers.md`
- Design polish (make parts look engineered, not assembled-from-primitives) → `references/design-polish.md`
- Transforms → `references/transforms.md`
- Measurement + the verify loop → `references/measurement-validation.md`
- Export formats → `references/export.md`

_Maker recipes & conventions (load when the request matches):_

- FDM defaults — fastener clearance holes, walls, clearance heuristics, design-for-printing → `references/fdm-conventions.md`
- Mechanical joints — snap-fit clips, press-fits/crush-ribs, heat-set inserts → `references/mechanical-joints.md`
- Gridfinity spec (42 mm grid, magnets, stacking) → `references/gridfinity.md`
- Gears (spur **reliable** via polygon→extrude; helical/bevel advanced) → `references/gears.md`
- Threads (**reliable** via loft-through-sections; `MakePipeShell` can't) → `references/threads.md`

**Full API reference (backstop):** for any symbol, signature, or option not covered by the curated references above, consult brepjs's complete `llms-full.txt`, which lists every export with signatures and examples. It ships bundled in the package at `reference/llms-full.txt`, and is online at <https://github.com/andymai/brepjs/blob/main/llms-full.txt>. Reach for it before guessing an API; the curated references are a fast path, not the whole surface.

## Examples index (few-shot: read the closest one before authoring)

Each is a complete `skill/examples/<name>.brep.ts` with a sibling `<name>.expected.json` baseline (replayed by the `eval` harness).

- **Primitives + booleans:** `mounting-bracket` (base + upright web + bolt holes) · `flanged-coupler` (flange + cylinder + bore, chamfered) · `transform-bracket` (translate/rotate/mirror) · `dome-cap` (cylinder + clipped-sphere hemisphere).
- **2D sketch → solid:** `extruded-bracket` (rounded plate + bolt holes) · `revolved-pulley` (V-groove revolved) · `swept-gasket` (frame swept along a spine).
- **Modifiers:** `rounded-block` (fillet) · `chamfered-block` (chamfer — API shape only; `chamfer` is fragile, see Hard rules) · `hollow-enclosure` (filleted box, shelled).
- **Mechanical:** `spur-gear` (involute spur gear — all teeth as one `polygon` → `extrude`, BOSL2-faithful math) · `threaded-rod` (external thread — `loft` through rotated sections).
- **Gridfinity:** `gridfinity-baseplate` · `gridfinity-bin` · `gridfinity-divider`.

## CLI subcommands (the `brepjs-verify` bin)

- `verify <file>` (default): report; flags `--check`, `--json`, `--step`, `--glb`, `--snapshot <dir>`, `--serve`, `--no-open` (with `--serve`, never auto-open the browser).
- `init <name>`: scaffold `<name>.brep.ts` + `tsconfig.json`.
- `watch <file>`: re-verify on every save.
- `export <file>`: batch STEP/GLB/STL behind a validity gate (`--step`/`--glb`/`--stl`/`--all`).
- `measure <a> [b]`: measurements for one part, or distance between two.
- `diff <a> <b>`: compare two parts' measurements.
