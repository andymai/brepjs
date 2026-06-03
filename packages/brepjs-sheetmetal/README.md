# brepjs-sheetmetal

> Experimental, unpublished satellite package.

A sheet-metal CAD domain for [brepjs](https://github.com/andymai/brepjs). It authors parametric
sheet-metal parts (flange/bend features), auto-miters corners, folds to 3D, and unfolds to a flat
pattern for fabrication.

Pipeline: **author part → auto-miter corners → fold to 3D → unfold to flat pattern → export DXF/STEP/GLB + bend report.**

## Scope

Straight (cylindrical) bends, authoring our own parts (not unfolding foreign solids). The bend model is
K-factor based by default, with optional **shop bend tables** (see below) for parts that develop per a
press-brake's measured allowance/deduction values.

- Bend allowance: `BA = (π/180)·|angle|·(R + K·T)`, or interpolated from a referenced bend table.
- Defaults: units are mm; K-factor `0.44`; inner radius `= thickness`.

Authoring supports arbitrary bend trees: flanges off any of the four base edges, **chained
flange-off-flange** bends (U-channels, Z-profiles, box walls), **up/down** fold direction, and
**partial/offset** flanges (more than one flange per edge). Closed profiles (tubes/boxes) author a seam
edge that the unfold leaves uncut as a `SEAM_CUT`, flattening into a valid connected pattern.

## Status

| Area            | State                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------- |
| Authoring       | 4-edge flanges, chained bends, up/down, partial/offset flanges, closed-box seams            |
| Unfold          | recursive BFS tree-walk → rectilinear-union flat pattern + bend lines + developed area      |
| Fold            | `FlatInput` region-tree → 3D part (inverse of unfold); round-trips `unfold(fold)`           |
| Reliefs         | bend reliefs (slots at partial-flange bend-line ends), corner reliefs (notch at a corner)   |
| Cutouts         | holes / slots (rect + obround) / polygons punched on the base or a folded flange            |
| Tabs / joints   | additive edge tabs, self-fixturing tab-and-slot joints (tab + matching mating slot)         |
| Form features   | louvers (3-side cut + formed flap), embosses / dimples (round raised / recessed forms)      |
| Contour flange  | open line/arc profile swept along a base edge (multi-bend section); EXACT development       |
| Lofted flange   | ruled transition between two open profiles; triangulated development (exact if developable) |
| Hems            | edge folded back ~180°+ (closed / open / teardrop / rolled); EXACT development              |
| Jogs            | two opposite bends stepping a flat by a Z-offset (joggle); EXACT development                |
| Bend tables     | shop allowance/deduction tables, angle-linear + thickness×radius-bilinear interp, clamp-warn |
| Miter / outputs | auto corner-miter, multi-layer DXF (incl. FORM layer), JSON bend report, warnings           |
| API             | functional `*Fns` → short-named `api.ts` → fluent `sheetMetal()` facade                     |

`fold(input: FlatInput)` folds a flat pattern back up into a 3D part — the inverse of `unfold`. A
`FlatInput` is a region-tree (a base rectangle plus child fold regions, each with a fold line, angle,
direction, and bend rule), the inverse of the unfold layout. `patternToFlatInput(pattern, { thickness,
ruleFor })` recovers that region-tree from the **2D flat-pattern geometry alone** — the developed outline
wire and bend-line edges — reading real coordinates back out with the public `getEdges` / `curveStartPoint`
/ `curveEndPoint` readers; only the bend rule (which a flat pattern cannot encode) is a supplied input.
`partToFlatInput(part)` chains `unfold` → `patternToFlatInput`, so `fold(partToFlatInput(part))` round-trips
volume, validity, and bend/flange counts through the 2D geometry — making the round-trip a genuine,
non-circular oracle. Fold reuses the forward authoring bend geometry wholesale (no duplicated bend math),
and rides SEAM_CUT / MIN_RADIUS warnings inside the Ok payload.

## Reliefs

Multi-bend parts tear or collide at corners unless material is relieved. Reliefs are recorded features
(like corner miters): cut from the folded 3D solid and replayed by `unfold` as 2D notches subtracted from
the developed outline (so they ride in the DXF `OUTLINE` layer and shrink `developedArea`).

- `addBendRelief(part, flangeId, spec?)` cuts a slot at each **mid-edge end** of a partial/offset flange's
  bend line — the ends that don't reach the parent-edge endpoint, where the parent material would tear.
  `autoBendReliefs(part, spec?)` adds one to every partial-span flange (full-span flanges are skipped).
- `cornerRelief(part, flangeIdA, flangeIdB, spec?)` cuts a square notch centred on the shared corner of two
  adjacent flanges — the notch alternative to a 45° miter. The square side is `spec.width` when given, else
  the depth clearance. It records the corner as resolved, so the `COLLISION` warning the un-relieved corner
  raised goes away.

A `ReliefSpec` is `{ shape: 'rectangular' | 'obround'; width?; depth? }`. Defaults: `width ≈ thickness`,
`depth ≈ developedLength(bend) + thickness`. `obround` records the rounded-slot intent; the developed notch
and 3D cut are rectangular for both shapes in this version. Reliefs round-trip through `fold` via a
`FoldRegion.bendRelief` field; the strict geometric round-trip oracle (`partToFlatInput → fold`) skips
relief'd parts because a notched outline is not a plain rectangle the parser can re-derive (same as mitered
parts).

## Cutouts

Holes, slots, and polygon cutouts are 2D features punched through a flat region's thickness. They survive
fold/unfold: each appears in the 3D solid, in the flat pattern (`FlatPattern.holes`, one closed wire per
cutout), and in the DXF (a `CUTOUT` layer). The outer outline is unchanged — cutouts are interior loops.

A `CutoutSpec` names the `region` (a flange id, or `'base'`/`'root'` for the base flat) and places the
feature in that region's **local** frame: `(0, 0)` is the region's near corner, `+x` runs along the region's
`u` axis and `+y` along its `v` axis. The discriminated union is `hole` (`{ x, y, diameter }`), `slot`
(`{ x, y, length, width, angleDeg?, round? }` — `round` makes the ends semicircular/obround), or `polygon`
(`{ points: [x, y][] }`).

- `addCutout(part, spec)` / `addHole(part, region, x, y, diameter)` / `addSlot(part, region, opts)` /
  `addPolygonCutout(part, region, points)` cut the feature through the sheet on the **correct face**: the 2D
  profile is built in region-local coords, then placed via the region's world frame (origin/u/v/n), so a
  hole authored on a folded flange lands on the flange face, not the base plane. Rejects a feature outside
  the region (`CUTOUT_OUT_OF_BOUNDS`) and guards a valid, single-bodied result (`CUTOUT_SEVERED_SOLID`).
- `unfold` emits the matching developed loop at the cutout's flat-pattern location (mapped through the same
  region's developed frame) and drops `developedArea` by the cutout areas.

Cutouts round-trip through `fold` via `FoldRegion.cutouts` (and `FlatInput.baseCutouts` for the base):
`partToFlatInput(part)` carries the region-local specs across, so `fold(partToFlatInput(part))` reproduces a
cutout'd part's volume. Unlike notched reliefs, cutouts don't change the outer outline, so a cutout'd part
still round-trips through the strict outline oracle.

## Tabs and tab-and-slot joints

A **tab** is the additive counterpart of a cutout: a rectangular protrusion of material extending
**outward** from a flat region's edge. `addTab(part, { region, side, offset, width, length })` builds the
tab as a region-local rectangle just past the chosen `side`, places it on the correct folded face via the
region's world frame, extrudes it through the sheet thickness and **fuses** it on — so the volume rises by
`width · length · thickness`. The same rectangle is mapped through the region's developed frame and recorded
as a `TabFeature`, so `unfold` **extends the outer outline** by the protrusion and grows `developedArea` by
the tab area. Guards a valid, single-bodied result (`TAB_INVALID_SOLID`) and rejects a tab overhanging its
edge (`TAB_OUT_OF_BOUNDS`).

`tabAndSlot(part, tab, { region, x, y, clearance? })` is the headline self-locating joint: it fuses a tab on
one region **and** punches a matching **slot cutout** on the mating region, sized so the tab's cross-section
(`width × thickness`) inserts into the slot. The slot is `tab.width + clearance` long by `thickness +
clearance` wide — always strictly larger than the tab cross-section, so the joint mates (clearance defaults
to `0.1` mm). Use it to make boxes/enclosures that self-fixture before welding.

Tabs ride through `fold` via `FoldRegion.tabs` / `FlatInput.baseTabs`, so `fold` re-fuses them and a tab'd
part folds back into the same volume. Like cutouts and forms, a tab carries its region-local spec, so
`partToFlatInput` re-attaches it onto the recovered region and `fold(partToFlatInput(part))` round-trips a
tab'd part's volume through the strict oracle. Although a tab protrudes the outer outline, the parser
recovers the base/flange rectangles from the bend lines and the unprotruded edges, so the protrusion does
not corrupt region recovery (a tab on an unmappable region fails loudly with `TAB_REGION_UNMAPPED` rather
than being silently dropped).

## Form features (louvers, embosses, dimples)

Form features are **locally formed** — they neither remove nor add net material, so the developed **outline
and area are unchanged**; the flat pattern instead carries the fabrication markers on a `FORM` DXF layer.

- `louver(part, { region, x, y, length, width, height, direction? })` — a vent cut on three sides with the
  flap formed up along the hinge. In the **flat pattern** it emits the three cut sides as an **open** cut
  path in `FlatPattern.formCuts` (the fabricator cuts three of the footprint's four sides — all but the
  hinge) plus the hinge fold line in `FlatPattern.formHinges`, so a fabricator cuts the U and folds the flap
  about the uncut hinge. The cut path is emitted as an open LWPOLYLINE on the DXF `FORM` layer (not a closed
  rectangle, which would drop the flap out).
- `emboss(part, { region, x, y, diameter, height, kind: 'emboss' | 'dimple' })` — a round local form, raised
  (`emboss`) or recessed (`dimple`). The footprint circle is emitted as a marker (`FlatPattern.formMarkers`).

**3D fidelity (simplified, documented).** The public CSG-only API makes true sheet forming (bending the flap
continuous with the parent, or stretch-forming a spherical cap) impractical, so the 3D representations are
deliberately simplified while keeping a **valid single solid** — the flat pattern is the fabrication-critical
output:

- _Louver_: the vent opening (`length × width`) is cut fully through the sheet, and the formed flap is
  represented as a thin plate hinged on one side and tilted up to `height`, fused at the hinge so the result
  stays one body. (True forming keeps the flap material continuous with the parent.)
- _Emboss_: a short cylinder fused onto the formed face (raised by `height`). _Dimple_: a shallow cylinder
  recess cut into the formed face (recessed by `height`, never through — rejected if `height ≥ thickness`).
  The flat-topped round approximates a true spherical/conical form so the solid stays valid.

Forms ride through `fold` via `FoldRegion.forms` / `FlatInput.baseForms`. Because they are material-neutral
they don't change the outline, so a **formed part still round-trips** through the strict outline oracle
(`partToFlatInput` carries the region-local form specs across, exactly as it does for cutouts).

## Contour & lofted/ruled transition flanges

Two profile-driven flanges extend authoring beyond single straight bends:

- `contourFlange(part, { id, side, profile, rule?, offset?, width? })` — an **open 2D profile** (alternating
  `{ kind: 'line', length }` flats and `{ kind: 'arc', radius, angleDeg, direction }` bends) swept along a
  straight base edge into a multi-bend cross-section (a return, a hat/top-hat, a J). Each arc becomes a
  recorded `BendFeature` (id `contour::<flange>::<n>`) and chains frame-to-frame exactly as flange-off-flange
  bends do. The **development is EXACT**: the developed strip length is the sum of each segment's developed
  length (lines: `length`; arcs: the canonical `developedLength` = `(π/180)·|angle|·(R + K·T)`). The unfold
  lays the strip out straight along the base edge with one bend line per arc at its exact cumulative
  arc-length offset.
- `loftedFlange(part, { id, profileA, profileB, height, thickness? })` — a **ruled transition** between two
  parallel open profiles (`profileA` at z=0, `profileB` at z=`height`, equal vertex counts), thickened to a
  valid solid by triangulating each quad of the ruled surface and extruding each triangle. The
  **development is by triangulation** — the standard sheet-metal transition development: each quad is split
  along a diagonal into two triangles laid out flat preserving their true 3D edge lengths. For a genuinely
  **developable** transition (planar quads / single-curvature) this is **exact to tolerance**; for a
  non-developable (twisted) transition it is an **approximation**, and the unfold emits a
  `DEVELOPMENT_APPROXIMATE` warning (inside the `Ok` payload). The triangulated boundary is emitted as a
  valid closed wire in `FlatPattern.loftedDevelopments`.

Both flanges have **non-rectilinear** developments, so — like miters and tabs — they sit outside the strict
`patternToFlatInput` outline oracle: verification leans on developed-length/area invariants and solid
validity rather than a fold round-trip. The contour flange's developed strip still joins the rectilinear
outline union; the lofted flange's triangulated blank is a separate developed boundary.

## Hems & jogs

Hems and jogs are multi-bend edge features built on the same frame-to-frame profile chainer as the contour
flange, so their developments are **EXACT** (Σ segment developed lengths, via the table-aware
`developedLength`). Both attach to any flat **region** — the base (`'base'`/`'root'`) or a named flange —
edge, record their curl/step sub-bends as `hem::<id>::<n>` / `jog::<id>::<n>` `BendFeature`s (skipped by the
feature-tree spanning walk, like `contour::` bends), and lay their developed strip out straight along the
region edge with one bend line per sub-bend.

- `hem(part, { region, side, type, length?, radius?, gap?, offset?, width?, rule? })` folds a region edge
  back onto its parent. Four `type`s set the curl angle and the gap:
  - **`closed`** — a tight ~180° fold, the return flat against the parent. The curl radius is inflated by a
    small **HAIR** clearance (0.05 mm) so the fused solid stays valid (a true zero-gap fold makes the curl's
    inner cylinder coincide with the parent face → a self-touching, non-manifold solid). `length` is the
    return-leg length (must be ≥ one thickness).
  - **`open`** — a ~180° fold with a clear `gap` (default = `radius`) between the return and the parent; the
    curl radius is sized from the gap, so its developed curl length is the exact 180° allowance at that radius.
  - **`teardrop`** — a >180° (~210°) curl leaving a small teardrop opening, then a short return.
  - **`rolled`** — a full ~270° circular roll (a curled / safe edge); no flat return.

  The curl is split into ≤120° sub-arcs (the bend-patch wedge degenerates at ≥180°), each a recorded
  sub-bend; the bend allowance is linear in angle, so Σ sub-arc allowances == the single-curl allowance. The
  **developed length** is Σ curl allowances + the return length, laid out straight past the edge.
- `jog(part, { region, side, position, offsetHeight, angle?, runOut?, radius?, offset?, width?, rule? })`
  steps a flat by `offsetHeight` perpendicular to its plane with **two opposite bends** (`+θ` then `−θ`,
  `angle` default 45°), then continues parallel. The connecting step run is solved so the two arcs' rise plus
  the step rise equals `offsetHeight` exactly — the resulting run-out bottom face sits exactly `offsetHeight`
  above the base bottom face (verified by measurement, not just construction). The flat carries the **two
  bend lines** (one `up`, one `down`); the **developed length** is `position + 2·allowance + stepRun +
  runOut`. `offsetHeight` must exceed the bends' own rise `(T + 2R)(1 − cos θ)`, else the jog is rejected.

Like the contour/lofted flanges, hems and jogs have non-rectilinear developments and so sit outside the
strict `partToFlatInput → fold` round-trip oracle; verification leans on developed-length invariants, the
measured jog offset, and solid validity.

## Nesting

`nest(patterns, { sheet, margin?, spacing?, allowRotation? })` arranges a set of developed flat patterns onto
stock sheets to reduce waste, returning `Result<NestResult>` (`{ sheets, unplaced, warnings }`). Each sheet
carries its `placements` (`{ patternIndex, x, y, rotationDeg }`, where `rotationDeg` is `0` or `90`) and a
`utilization`. `nestToDXF(result, patterns, sheetIndex)` then emits one fabrication-ready, multi-layer DXF per
sheet, translating and rotating every placed pattern (outline + bend lines + holes + forms) onto the sheet via
the same bounding boxes the packer used.

> **Scope — bounding-box nesting only.** This packs each part as its axis-aligned **outline bounding box**, so
> parts do **not** interlock: a concave or L-shaped part reserves its full rectangular footprint and leaves the
> in-bbox waste unused. True-shape **no-fit-polygon (NFP)** nesting — where parts nest into each other's
> concavities — is the planned follow-up. Treat the reported utilization as a conservative lower bound on what
> NFP nesting could achieve.

- **Algorithm.** A shelf (level) packing heuristic. Parts are sorted largest-first (by bbox height, then area)
  and placed left-to-right into horizontal shelves; a new shelf opens below when the current row fills, and a
  **new sheet** opens when the next shelf would overflow the usable height. Placements stay inside the usable
  area `[margin, sheet − margin]` and are separated by at least `spacing`.
- **Rotation.** With `allowRotation`, each part is tried at both `0°` and `90°` and the orientation that fits
  (or packs shorter) is kept — letting a tall part fit a short sheet.
- **Unplaceable parts.** A part larger than the usable sheet even rotated is reported in `unplaced` with a
  warning; it is never dropped silently and never loops.
- **Utilization.** Σ placed part **bounding-box** areas ÷ usable-sheet area, in `(0, 1]`. Inter-part spacing
  gaps and intra-bbox waste are not credited, so it is a conservative material-use measure.

```ts
const patterns = parts.map((p) => unfold(p).value.pattern);
const nested = nest(patterns, { sheet: { width: 1250, height: 2500 }, margin: 5, spacing: 3, allowRotation: true });
// nested.value.sheets.length, nested.value.sheets[i].utilization, nested.value.unplaced
const dxf = nestToDXF(nested.value, patterns, 0); // fabrication-ready DXF for sheet 0
```

## Foreign-solid import & unfold

`unfoldSolid(solid, { kFactor? })` (fluent: `fromSolid(solid).unfold()`) flattens an **arbitrary imported
sheet-metal solid that has no feature tree** by detecting its geometry numerically — the reverse of the
authored path. It reads only the B-rep:

- **Classify faces** by surface type: planar faces are panel faces, cylindrical faces are bend faces. Any
  other surface type (cone, sphere, spline, …) is reported `UNSUPPORTED_FACE` and skipped (the unfold never
  silently invents a flat for an unrecognised face).
- **Pair flats**: the two large parallel planar faces of a panel, a sheet thickness apart, are the
  mid-surface flat. Thickness is detected as the smallest opposed-planar-pair gap.
- **Fit bends**: `fitCylinder(face)` recovers a bend's axis + radius + swept angle from sampled points and
  normals. The axis direction is the common perpendicular of the sampled normals (every cylinder normal is
  ⟂ the axis), recovered as the sign-aligned average of cross products of non-parallel normal pairs; the
  axis line and radius come from a least-squares circle fit of the points projected onto the plane ⟂ axis;
  the radius is the mean point-to-axis distance. A fit whose residual exceeds tolerance is rejected (warned).
  Recovery is high-precision — radius and axis of a known `cylinder()` primitive are recovered to ~1e-6.
- **Build the bend graph** (flats = nodes; a bend connects the two flats it shares edges with), take a
  spanning tree from a root flat, and turn non-tree bends into seam cuts (`SEAM_CUT`, warned).
- **Unfold** by walking the tree, replacing each cylindrical region with a developed strip of length
  `developedLength(angle, thickness, { innerRadius, kFactor })`. Because a foreign solid carries no material
  K-factor, the default is the **mid-surface neutral axis (K = 0.5)**; pass `{ kFactor }` to match a known
  material. Bend direction (up/down) is read from the cylinder centre relative to the parent flat.

**Supported class**: roughly-uniform-thickness solids whose panels are **planar** and whose bends are
**cylindrical** (straight bends). Outside this class the unfold **warns rather than mis-unfolding** —
non-uniform thickness, conical/spline bend faces, non-manifold / non-sheet topology, and faces that don't
fit a cylinder within tolerance all surface as warnings inside the `Ok` payload (or a clear `Err` when no
sheet-metal structure is detected at all, e.g. a bare sphere). The detection is validated by an oracle:
author a part, take only its `.solid`, run `unfoldSolid`, and confirm the detected unfold reproduces the
authored unfold's developed area, bend count, flat count, and total flat bbox (single bend, L-bracket,
U-channel) — reading only the solid, never the feature tree.

## Bend tables

By default a bend develops by the K-factor formula `BA = (π/180)·|angle|·(R + K·T)`. A `BendRule` may
instead reference a **shop bend table** by id (`rule.bendTableRef`), in which case the developed length is
**interpolated from the table** — linear in bend angle, bilinear across thickness × inner radius (with
nearest-radius substitution for sparse one-radius-per-gauge tables), clamping to the nearest tabulated
entry outside the table's range (and emitting a `MIN_RADIUS` unfold warning rather than extrapolating).

A table is `{ id, kind: 'allowance' | 'deduction', rows: { thickness, radius, angleDeg, value }[] }`. An
`allowance` table tabulates the developed arc length directly; a `deduction` table tabulates the bend
deduction and is converted on lookup via the outside-setback relation `OSSB = (R+T)·tan(θ/2)`,
`BD = 2·OSSB − BA` ⇒ `BA = 2·OSSB − BD` (for a 90° bend, `OSSB = R+T`).

Resolution precedence at the single resolution point (`resolveBendAllowance`, which `developedLength`
delegates to): **(1) `bendTableRef` table → (2) explicit `rule.allowance` override → (3) K-factor formula**.
Parts with no `bendTableRef` are byte-for-byte unchanged. Two starter air-bend tables ship auto-registered
on first access — `steel-airbend` (mild steel) and `aluminum-airbend` (5052-H32) — with published 90°
allowances scaled across {30, 60, 90, 120}° (sources: SheetMetal.Me charts, Machinery's Handbook 29th ed.).

```ts
import { registerBendTable, author, unfold } from 'brepjs-sheetmetal';

registerBendTable({
  id: 'my-shop-steel',
  kind: 'allowance',
  rows: [{ thickness: 1.52, radius: 1.5, angleDeg: 90, value: 3.63 }],
});

const part = author({
  thickness: 1.52,
  base: { length: 40, width: 40 },
  flanges: [{ id: 'fx', length: 18, angleDeg: 90, side: 'xmax', rule: { innerRadius: 1.5, kFactor: 0.44, bendTableRef: 'my-shop-steel' } }],
});
// unfold(part.value) now develops the bend at BA = 3.63 mm (the table), not (π/2)·(R + K·T).
```

## Design

All geometry for **authored** parts is computed analytically from the feature tree — bend axis, radius, and
angle are known inputs recorded on each `BendFeature`, so the unfold reads the tree rather than
reverse-engineering the B-rep. The **foreign-solid** path (`unfoldSolid`) is the exception: it detects bend
geometry numerically from the public surface queries (no recorded tree). No kernel/WASM changes are required
for either path.

## Usage

```ts
import { MATERIALS, getMaterial } from 'brepjs-sheetmetal';

const steel = getMaterial('steel-16ga');
```

All public operations return `Result<T>` (from `brepjs`); non-fatal warnings travel inside the `Ok` payload.

## Snapshot harness

A standalone visual harness lives in `harness/snapshot.ts`. It imports
`brepjs-sheetmetal` directly (no playground dependency), builds a set of demos —
the headline L-bracket with a mitered corner, a tray, reliefs, a cutout panel, a
**tab-and-slot box** (self-locating corner joint), and a **louvered panel** (vent
flaps + emboss/dimple) — then renders each folded 3D part next to its developed
flat pattern as a single side-by-side SVG and also writes the folded solid as STEP.
It also runs a **nesting** demo (a handful of parts bbox-packed onto one sheet),
printing the sheet count + utilization and writing the nested sheet as DXF + SVG.

```bash
npm run snapshot --workspace=brepjs-sheetmetal
# writes harness/out/bracket.svg  (folded isometric wireframe + flat pattern)
#        harness/out/bracket.step (folded solid)
```

The folded view is an isometric edge-wireframe projection of the kernel mesh, so
the harness runs as a plain `tsx` script wherever the WASM kernel runs — no
headless browser or GPU required. Output lands in `harness/out/` (gitignored).

## Development

```bash
npm run typecheck --workspace=brepjs-sheetmetal
npm run lint --workspace=brepjs-sheetmetal
npm run build --workspace=brepjs-sheetmetal
npm run test --workspace=brepjs-sheetmetal
npx tsc -p packages/brepjs-sheetmetal/harness/tsconfig.json   # typecheck the harness
```
