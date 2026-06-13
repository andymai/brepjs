---
name: brepjs-verify
description: Use when authoring or editing parametric 3D CAD models in TypeScript with the brepjs library: turn natural-language part requirements into solids, then type-check, verify deterministically (validity + volume/area/bounds vs intent), and verify visually (multi-view snapshots) before handing off STEP/GLB artifacts.
---

# Authoring CAD with brepjs

You write a `.brep.ts` part; `brepjs-verify` runs it on a geometry kernel and reports what it measured. Judge the part by the report, not by how the code reads. Follow the loop below for every part.

Commands below use `npx -y brepjs-verify`; if you've installed the package, drop the `npx -y` and call `brepjs-verify` directly.

## The loop (every part, in order)

1. **Brief.** Convert the request to explicit params: dimensions (mm), datums, features, assumptions. Don't ask the user for JSON.
2. **Load only the reference you need** (index below), not all at once.
3. **Author `.brep.ts`**: `export default () => <shape>` with the short API (`box`, `cylinder`, `fuse`, `cut`, `fillet`, …), named consts at the top. Scaffold with `npx -y brepjs-verify init <name>`. Edit _source_, never generated artifacts.
4. **Declare intent.** Add an `expected` block from your brief, e.g. `export const expected = { volume: 24000, tolerancePct: 1 }`. Any of `volume`, `area`, `bounds` are optional; `tolerancePct` sets the match window. The CLI asserts it, catching a part that is valid but wrong-sized.
5. **Verify (type + geometry).** `npx -y brepjs-verify verify part.brep.ts --check --json report.json`. `--check` type-checks before running (catches wrong-API calls early); the JSON report is the source of truth. Iterate fast with `npx -y brepjs-verify watch part.brep.ts`.
6. **Verify visually.** Add `--snapshot shots/` for iso/front/top/right PNGs. Review against the brief. A visual concern is **not** a conclusion: convert it to a measurement ("hole looks off-center → check `bounds`"). Don't declare done without a snapshot.
7. **Repair the smallest responsible section** and re-run. Use the report's `hints` to guide the fix.
8. **Export + hand off.** `npx -y brepjs-verify verify part.brep.ts --step part.step` (STEP is the validated primary deliverable; GLB/STL are derived). Batch behind a validity gate with `npx -y brepjs-verify export part.brep.ts --all`. `--serve` prints a clickable preview link. Report the STEP path.

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
- **`checks`** = kernel validity (manifold solid, positive volume). A failed check means the geometry is broken, not wrong-sized.
- **`assertions`** = your declared intent vs reality. A failed assertion means valid-but-wrong (off dimensions).
- **`hints`** = actionable fix + next step keyed on the error code. Read these before guessing.
- **`errorInfos`** = the raw structured failures (`code` + `message`) the hints derive from (authoring, kernel, or export errors). Cite the `code` when repairing.
- Trust the JSON over the render. The render shows _shape_; the JSON shows dimensions and validity.

## Repair discipline

- Change the **smallest responsible section**, re-verify, repeat. Don't rewrite the whole part on one failure.
- Let the `code`/`hints` localize the cause (e.g. `INVALID_FILLET_RADIUS` → reduce radius vs local edge length; `*_NOT_3D` → you passed a 2D shape to a 3D op; `BOOLEAN_HAS_ERRORS` → inputs overlap-degenerate).
- A part that _runs_ but reports `ok:false` is wrong, not done. Treat it like a crash.

## Reliable scope (be honest)

- **Reliable first-try:** primitives, booleans (`fuse`/`cut`/`intersect`), 2D sketch → extrude, `fillet`/`chamfer`, `shell`/`offset`, transforms. Prefer these.
- **Advanced (verify carefully, expect iteration):** sweeps, lofts, revolves, multi-section, assemblies, text. They fail more often (degenerate profiles, self-intersection); lean harder on the report and small steps.

## Hard rules

- Edit source, not artifacts. STEP/STL/GLB derive from the `.brep.ts`.
- Booleans and `measureVolume`/`measureArea` return `Result`: unwrap and check the `Err` branch before chaining.
- `fillet`/`chamfer` need a valid solid (its signature is `fillet(solid, edges, radius)`). Verify validity first.
- `box(width, depth, height)`: 2nd arg is depth (Y), 3rd is height (Z); positioning option is `at`, not `origin`. Units mm.
- Author parts in an ESM context (the tool's default) so the kernel loads. A CommonJS project needs `"type": "module"` or a `.mts` file.

## Reference index (load only what the task needs)

- Getting started + kernel init → `references/getting-started.md`
- Primitives → `references/primitives.md`
- 2D sketching → extrude → `references/sketching-2d.md`
- Booleans → `references/booleans.md`
- Fillet/chamfer/shell/offset → `references/modifiers.md`
- Transforms → `references/transforms.md`
- Measurement + the verify loop → `references/measurement-validation.md`
- Export formats → `references/export.md`

Full symbol index: the library ships `docs/function-lookup.md`; consult it for anything not covered above.

## Examples index (read the closest one before authoring)

Each is a complete `skill/examples/<name>.brep.ts` with a sibling `<name>.expected.json` baseline (replayed by the `eval` harness).

- **Primitives + booleans:** `mounting-bracket` (base + upright web + bolt holes) · `flanged-coupler` (flange + cylinder + bore, chamfered) · `transform-bracket` (translate/rotate/mirror).
- **2D sketch → solid:** `extruded-bracket` (rounded plate + bolt holes) · `revolved-pulley` (V-groove revolved) · `swept-gasket` (frame swept along a spine).
- **Modifiers:** `rounded-block` (fillet) · `chamfered-block` (chamfer) · `hollow-enclosure` (filleted box, shelled).
- **Gridfinity:** `gridfinity-baseplate` · `gridfinity-bin` · `gridfinity-divider`.

## CLI subcommands (the `brepjs-verify` bin)

- `verify <file>` (default): report; flags `--check`, `--json`, `--step`, `--glb`, `--snapshot <dir>`, `--serve`.
- `init <name>`: scaffold `<name>.brep.ts` + `tsconfig.json`.
- `watch <file>`: re-verify on every save.
- `export <file>`: batch STEP/GLB/STL behind a validity gate (`--step`/`--glb`/`--stl`/`--all`).
- `measure <a> [b]`: measurements for one part, or distance between two.
- `diff <a> <b>`: compare two parts' measurements.
