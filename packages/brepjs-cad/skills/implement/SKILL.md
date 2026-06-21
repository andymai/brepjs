---
name: implement
description: Use when authoring or editing a brepjs `.brep.ts` part — writing the geometry with the functional API (box, cylinder, fuse, cut, fillet, sketch→extrude…), declaring an `expected` block, and following the hard rules (import every function, unwrap Results, select edges, coordinate semantics). This is the authoring step; pair it with brepjs:verify to check the result.
version: 0.1.0
---

# Author a brepjs part

You write a `.brep.ts` part; the `brep` CLI runs it on a geometry kernel and reports what it
measured. Judge the part by the report (see `brepjs:verify`), not by how the code reads. This skill
is **self-contained** — everything needed to author correctly is here or in `references/`.

The CLI ships in the `brepjs-cad` package as `brep`. Installed: `brep verify part.brep.ts …`.
Otherwise: `npx -y -p brepjs-cad brep verify …`.

## Authoring contract

- `export default () => <shape>` (or `async () => {…}` to `await loadFont`/`importSTEP`).
- Short functional API (`box`, `cylinder`, `fuse`, `cut`, `fillet`, …), named consts at the top.
- Scaffold with `brep init <name>`. **Edit source, never generated artifacts** (STEP/STL/GLB derive
  from the `.brep.ts`).

## Choose the operation (reliability tiers)

Prefer ops that succeed first-try; lean on the report and small steps for advanced ops. Full table:
**`references/operation-tiers.md`**. In short: primitives, booleans, `compound`, sketch→extrude,
`fillet`, `shell`/`offset`, transforms are reliable; sweeps/lofts/revolves/`fuseAll`/text are
advanced; `chamfer` is the fragile exception (prefer `fillet`).

## Declare intent — the `expected` block

Add `export const expected = { … }` from the brief; the CLI asserts it, catching valid-but-wrong
sizing. The **only** authorable keys are `volume`, `area`, `bounds`, `tolerancePct` (each optional;
`tolerancePct` sets the match window) — `TOP_LEVEL_KEYS` in `src/verify/expected.ts:45`. Bounds
shape is exactly `{ xMin, xMax, yMin, yMax, zMin, zMax }` (any subset) — **not** `{ min, max }` or
`{ x, y, z }` (a wrong shape reports `EXPECTED_UNKNOWN_KEY`). **`shapeType` is report-only, not
authorable**: the report tells you whether the part measured as a `solid`/`compound`/etc., but
putting `shapeType` (or any other field) in `expected` also reports `EXPECTED_UNKNOWN_KEY` — assert
the body count or shape via `volume`/`bounds`, never a `shapeType` key.

**Prefer `bounds`** over a hand-computed `volume` (a wrong number fails a _correct_ part). Predict
only extents you **place directly** — a footprint, where each body sits, the flat face of a body you
placed there — these read off your datums and catch a dropped/misplaced body. An extent **governed by a
rotation, a part's orientation, a proud sub-feature, a half-space clip, or the outer top/bottom of a
deep multi-body stack** is not a datum: bound it generously or measure-first (run once, copy the
report's measured value). That last one is the #1 `EXPECTED_ASSERTION_FAILED` on assemblies — a
stack's extreme z is usually crowned by a rounded/proud feature (a carrier hub, a ball cap) and sums
every body's placement error, so **measure it; don't hand-add the stack**. A flat lid-on-base height
you place is fine; the moment a curved or proud sub-feature defines the extreme, it's governed. This
was the #1 first-try failure across the corpus (rotated handles, articulated yokes, flange discs,
clipped balls): when an operand is **rotated**, a **disc/sphere** crowns an axis, or a cut **clips** an
extreme, measure that one axis — don't predict it.

A **`chamfer`/`fillet` only REMOVES material** — it never grows the bounding box. A beveled or rounded
outer corner keeps the original face plane as its bound, so the extent stays at the un-chamfered face:
predict `xMin = 0` for a corner chamfered at `x = 0`, never `xMin = -chamfer`.

## Hard rules

- **Import every function you call.** No globals — every op is a named export from `'brepjs'`. A
  used-but-unimported symbol is `TS2304: Cannot find name` and fails `--check` before geometry runs
  (the #1 first-attempt failure). Re-scan the body before finishing.
- **Transforms are free functions, shape-first** — `translate(shape, [x,y,z])`, `rotate(shape, deg, { axis })`,
  `mirror`, `scale` (angles in **degrees**), the same shape-first form as booleans. They are NOT methods:
  `shape.translate(...)` is `TS2339: Property 'translate' does not exist`. Placing assembly parts needs
  these even when the brief doesn't shout "transform". (`references/transforms.md`.)
- **Unwrap Results.** Booleans and `measureVolume`/`measureArea` return `Result`: `unwrap(cut(...))`
  and check the `Err` branch before chaining. `TS2322: Result<X> is not assignable to X` (on an
  assignment/return) — or **`TS2345`** when you feed an un-unwrapped `Result` straight into another
  op's argument (e.g. `fuse(a, cut(b, c))`) — means an op (`cut`/`fuse`/`fillet`/`chamfer`/`shell`/…)
  was used without `unwrap()`. Unwrap at every step, not just the last.
- **`fuse` welds only where solids overlap.** Bodies merely touching on a coplanar face/ring may
  return a loose `Compound` (`ok:true`, not one watertight solid). Overlap the operands +
  `fuseAll(shapes, { unsafe: true })` to weld; use `compound` for a distinct-bodies assembly.
  (`references/booleans.md`.) **But a `Compound` result is NOT a failure to chase:** even genuinely
  overlapping operands often fuse to `shapeType:Compound` (`ok:true`, correct geometry) rather than a
  single `Solid` — and that's fine, because `shapeType` is report-only/non-authorable and
  bounds/volume/validity still pass. Don't burn attempts trying to force a `Solid`; only do so (and
  then only worry) when a **downstream `fillet`/`shell`/`offset`** needs a `ValidSolid` (next rule).
  The report's `notes` flags a **multi-body Compound and its solid count** — if a part you meant as
  ONE piece comes back as N bodies, the weld failed (overlap + `fuseAll` unsafe); a count matching a
  deliberate assembly is fine.
- **`fillet`/`chamfer`/`shell`/`offset` need a `ValidSolid`.** Primitives already are one and
  booleans preserve it, so a primitive-rooted chain feeds them directly. A shape from a 2D-sketch
  `.extrude()`/`.revolve()` (or `loft`/`sweep`) is typed `Shape3D`; passing it to these ops is
  `TS2345`. Lift in two steps: `if (!isSolid(x)) throw …; const solid = unwrap(validSolid(x));`. Or
  build the prism from a primitive when you know you'll `fillet`/`shell` it. (`references/modifiers.md`.)
- **A loose-`Compound` boolean can't be lifted to `ValidSolid` — fix the boolean, don't lift.** When
  `fuse`/`fuseAll` only touch (don't overlap) they return a `Compound` (`ok:true`), and `isSolid`
  returns `false` on it (`shapeType()==='compound'`, not `'solid'` — `src/core/shapeTypes.ts:248`).
  There is **no lift** from a multi-body `Compound` to a `ValidSolid`: `validSolid()` needs one
  `Solid`, so `if (!isSolid(x)) throw …` just throws, and feeding the Compound onward
  `KERNEL_FAILED`s. Make the operands actually overlap and `fuseAll(shapes, { unsafe: true })` so the
  weld yields a single solid **first**, then `fillet`/`shell`. (`references/booleans.md`.)
- **Select edges/faces; don't fillet/chamfer everything.** `fillet(solid, radius)` with no edge
  list rounds EVERY edge and frequently `FILLET_FAILED`s. Pass `edgeFinder().inDirection('Z').findAll(solid)`.
  `inDirection` matches BOTH ± orientations; discriminate by position with
  `.when(f => getBounds(f).zMax > t)` (`getBounds` is its own import). Finders take a **direction**
  (`'X'`/`'Y'`/`'Z'`/`Vec3`), never a plane: a top face is `faceFinder().inDirection('Z')`;
  **`parallelTo('XY')` fails `--check`** — use `'Z'`. (`references/modifiers.md`.)
- **`chamfer` is kernel-fragile.** `CHAMFER_FAILED` is common even with a correct edge list. Prefer
  `fillet`, model the bevel additively (`cut` with an angled tool), or drop it. Re-running the same
  chamfer rarely helps.
- **A _through_ hole/slot/mortise needs a tool proud of BOTH faces.** Size the cutting
  `cylinder`/`box` LONGER than the body and place it so it pokes out each end (e.g. height = wall + 2,
  positioned past both faces) — a tool flush with or short of a face leaves a **blind pocket**, not a
  through feature, and `--check` can't catch it (the part is still valid). The brief word "through"
  (or "bore", "passage") is the cue. Confirm it actually passes through with the `section`/xray view,
  not just the exterior.
- **`revolve` angle is RADIANS** (`Math.PI * 2` = full turn). Build a revolve profile with
  `polygon(points3D)`, not `draw().close().sketchOnPlane('XZ').face()` (fails `--check`).
  (`references/sketching-2d.md`.)
- **`box(width, depth, height)`** — depth is Y, height is Z, mm. **`at` sets the geometric CENTER**:
  bare `box(w,d,h)` is corner-at-origin, `{ centered: true }` centers on origin, `{ at:[x,y,z] }`
  centers there. `cylinder`/`cone` `at` is the **base** center; `sphere` `at` is its center.
- **No half-sphere primitive:** clip a full `sphere` to a half-space with `intersect` (a `box` over
  the half you want). Fusing a whole sphere bulges past a cap face. See the `dome-cap` example.
- **Pattern angles are DEGREES** (`circularPattern`/`rectangularPattern` `fullAngle`), _unlike_
  `revolve` (radians). Check the unit per op.
- **Parts may be `async`**: `export default async () => {…}` is awaited — `await loadFont(...)`
  (required before any `sketchText`/`drawText`) or `await importSTEP(...)`. `--check` type-checks
  Node built-ins, so a part may `import { readFile } from 'node:fs/promises'`.
- Author in ESM (the tool's default) so the kernel loads.

## Reference index (load only what the task needs)

`references/getting-started.md` · `primitives.md` · `sketching-2d.md` · `booleans.md` ·
`modifiers.md` · `transforms.md` · `measurement-validation.md` · `assemblies-motion.md` ·
`operation-tiers.md`. Maker recipes: `fdm-conventions.md` · `mechanical-joints.md` ·
`gridfinity.md` · `gears.md` · `threads.md`. **Backstop:** any symbol not covered →
`reference/llms-full.txt` (every export with signatures), bundled in the package.

## Examples index (read the closest before authoring)

Each is a complete `examples/<name>.brep.ts` + `<name>.expected.json` baseline.

- **Primitives + booleans:** `mounting-bracket` · `flanged-coupler` · `transform-bracket` · `dome-cap`.
- **2D sketch → solid:** `extruded-bracket` · `revolved-pulley` · `swept-gasket`.
- **Modifiers:** `rounded-block` (fillet) · `chamfered-block` (API shape only; chamfer is fragile) ·
  `hollow-enclosure` (shelled).
- **Mechanical:** `spur-gear` (polygon→extrude, BOSL2-faithful) · `threaded-rod` (loft sections).
- **Gridfinity:** `gridfinity-baseplate` · `gridfinity-bin` · `gridfinity-divider`.
