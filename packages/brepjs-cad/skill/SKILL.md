---
name: brepjs-cad
description: Use when authoring or editing parametric 3D CAD models in TypeScript with the brepjs library — generating solids from natural-language part requirements, then verifying them deterministically (volume/area/validity) and visually (multi-view snapshots) before handing off STEP/GLB artifacts.
---

# Authoring CAD with brepjs

## Workflow (follow in order)

1. **Classify the task** — new part, edit existing part, assembly, or measurement-only.
2. **Write a CAD brief** — convert prose to explicit params: dimensions (mm), datums, features, assumptions. Do NOT ask the user for JSON.
3. **Load only the references you need** — see the index below; do not read all at once.
4. **Author a `.brep.ts` module** — `export default () => <shape>` using the short API (`box`, `cylinder`, `fuse`, `cut`, `fillet`, …). Parameterize with named consts at the top. Edit _source_, never generated artifacts. To scaffold from scratch: `npx brepjs init <name>` writes a parameterized `<name>.brep.ts` + `tsconfig.json`.
5. **Verify deterministically** — `npx brepjs part.brep.ts --json report.json`. Treat the JSON (validity brands + volume/area/bounds) as the source of truth. During iteration, `npx brepjs watch part.brep.ts` re-verifies on every save.
6. **Verify visually** — add `--snapshot shots/` for iso/front/top/right PNGs. Review against the brief. A visual concern is NOT a conclusion: convert it to a measurement ("hole looks off-center → check bounds"). Never skip the snapshot for confidence.
7. **Repair the smallest responsible section** of source and re-run.
8. **Export the primary artifact + hand off** — `npx brepjs part.brep.ts --step part.step` writes STEP (the primary, validated deliverable); GLB/STL are derived previews. Batch multiple formats behind a validity gate with `npx brepjs export part.brep.ts --all`. For a human handoff, `--serve` prints a clickable preview link. Report the STEP path (and link).

## Hard rules

- Edit source, not artifacts. STEP/STL/GLB derive from the `.brep.ts`.
- `measureVolume`/`measureArea` return `Result<number>` — handle the `Err` branch.
- Booleans (`fuse`/`cut`/`intersect`) return `Result` — unwrap and check before chaining.
- `fillet`/`chamfer` require a valid solid — verify validity first.
- `box(width, depth, height)`: 2nd arg is depth (Y), 3rd is height (Z). Positioning option is `at`, not `origin`. Units are mm.

## Reference index (progressive — load only what the task needs)

- Getting started + kernel init → `references/getting-started.md`
- Primitives → `references/primitives.md`
- 2D sketching → extrude → `references/sketching-2d.md`
- Booleans → `references/booleans.md`
- Fillet/chamfer/shell/offset → `references/modifiers.md`
- Transforms → `references/transforms.md`
- Measurement + the verify loop → `references/measurement-validation.md`
- Export formats → `references/export.md`

Full symbol index: the library ships `docs/function-lookup.md` (463 symbols) — consult it for anything not covered above.

## Examples index (pattern-match against these — read the closest one before authoring)

Each entry is a complete `skill/examples/<name>.brep.ts` with a sibling `<name>.expected.json` baseline (replayed by the `eval` harness). Load the one nearest the task as a few-shot.

**Primitives + booleans**

- `mounting-bracket` — L-shaped bracket: base plate fused to an upright web with bolt holes.
- `flanged-coupler` — boxed flange fused to a cylinder, chamfered, with a center bore.
- `transform-bracket` — translate / rotate / mirror placing duplicated features.

**2D sketch → solid**

- `extruded-bracket` — rounded-corner mounting plate with two bolt holes (sketch → extrude → cut).
- `revolved-pulley` — V-groove pulley revolved from a 2D XZ profile about Z.
- `swept-gasket` — rectangular gasket frame swept along a rounded-rectangle spine.

**Modifiers (fillet / chamfer / shell)**

- `rounded-block` — canonical fillet: a block with every edge rounded.
- `chamfered-block` — canonical chamfer: a block with every edge chamfered.
- `hollow-enclosure` — filleted box shelled to a thin wall (open top).

**Gridfinity primitives**

- `gridfinity-baseplate` — simplified faithful baseplate.
- `gridfinity-bin` — simplified faithful bin.
- `gridfinity-divider` — simplified faithful divider / insert.

## CLI subcommands (the `brepjs` bin)

- `brepjs verify <file>` (default) — deterministic report; `--json`, `--step`, `--glb`, `--snapshot <dir>`, `--serve`.
- `brepjs init <name>` — scaffold a parameterized `<name>.brep.ts` + `tsconfig.json`.
- `brepjs watch <file>` — re-verify on every save until Ctrl-C.
- `brepjs export <file>` — batch STEP/GLB/STL behind a validity gate (`--step`/`--glb`/`--stl`/`--all`).
- `brepjs measure <a> [b]` — measurements for one part, or distance between two.
- `brepjs diff <a> <b>` — compare two parts' measurements.
