# Gears (RELIABLE for spur via polygon-extrude; involute is the target)

> **Verified.** A spur gear builds reliably on occt-wasm as **one closed `polygon` of all teeth →
> `extrude`** (no per-tooth booleans — those are slower and flakier). See the worked, baseline-tested
> `examples/spur-gear.brep.ts` (m=2, N=20, 20° PA → a valid 44 mm involute gear). Use that as the
> template. Helical/herringbone (sweep-with-twist) and bevel are still **advanced** — verify each.
> Exact involute flanks are the quality target, but approximate/trapezoidal flanks also mesh for
> maker use.

## The reliable build (spur)

Compute the involute points (math below), assemble **one tooth outline traced low→high angle**,
replicate it around all `N` teeth into a single closed loop, `polygon(points3D)` → `extrude`. Bore
the centre and add a hub/keyway with `cut` afterward.

## Involute math (ported from BOSL2 `gears.scad`)

- pitch radius `pr = m·N/2`; base radius `br = pr·cos(PA)`; outer `ra = pr + m`; root `rr = pr − 1.25m`.
- involute point at roll angle θ: `x = br·(cosθ + θ·sinθ)`, `y = br·(sinθ − θ·cosθ)`; θ runs 0 (base)
  → `θmax = √((ra/br)² − 1)` (tip). Half-tooth angular width at the pitch circle = `π/(2N)`; rotate
  each flank so its pitch point lands there.
- **The +angle flank must use the MIRRORED involute** (`[x, −y]`) with `offset = halfTooth + φpitch`,
  so the tooth NARROWS to its tip. The un-mirrored flank diverges → teeth wider at the tip (a
  **dovetail**) that jam instead of meshing — and a single such gear still passes `isValidSolid`.
- **Add a root fillet where `rr < br`** (i.e. `N` below ~42). A sharp radial root lets the mating
  tooth tip interfere below the base circle (~tens of mm³ even at the right phase). Use a circular
  fillet tangent to the flank at the base point, run to the shared space-centre point
  `rot([rr,0], π/N)` — adjacent fillets meet there (dedupe that vertex) and it undercuts to clear
  the tip. See `examples/spur-gear.brep.ts`.

## Meshing rules (get these wrong and the gears jam or skip)

Two gears mesh **only if they share the same module and the same pressure angle.**

- **Module `m` = pitch diameter / number of teeth.** It's the size unit; both gears must match.
- **Pressure angle:** **20° is the industry standard** (use it unless told otherwise).
- **Pitch diameter = `m · N`** (`N` = teeth). Addendum = `m`, dedendum = `1.25·m`,
  outer Ø = `m·(N+2)`, root Ø = `m·(N−2.5)`.

## Meshing-critical knobs

- **Number of teeth `N`** — fewer than ~17 undercut (weak roots) unless you add profile shift.
- **Profile shift** — shifts the tooth to eliminate undercut on low `N` while still meshing.
- **Backlash** — a small gap between mating teeth so they don't jam; FDM needs more than metal.
- **Clearance** — root gap so tips don't bottom out (≈ `m/4`).

## The family

- **Spur** (straight, simplest), **helical** (angled, quieter, axial thrust), **herringbone**
  (two opposite helices, cancels thrust — great for printed gear trains), **internal ring**, **rack**
  (straight → linear), **bevel** (intersecting shafts), **worm + worm gear** (high reduction, 90°).

## Worm + worm wheel (right-angle, high reduction)

A worm drive needs a real thread AND a wheel whose teeth are conjugate to it. A `circularPattern`
of box/slot cutters is **not** a worm wheel — the slots aren't conjugate, so the pair jams or skips
(it still passes `isValidSolid`, so the kernel won't catch it).

- **Worm** — a true single-start helicoid: loft rotated **trapezoidal (~20° flank, ACME-form)**
  cross-sections per `references/threads.md` (`thread()` is not in this build). Axial pitch = lead =
  `π·m` for a single start, so the worm advances exactly one wheel-tooth pitch per revolution.
- **Worm wheel** — the reliable, honest build is a **cylindrical involute HELICAL gear** of the
  _same module_, teeth helix-angled at the worm lead angle `λ = atan(lead / (π·d_worm))` (loft the
  involute tooth loop across the face with that small conjugate twist). Name it for what it is — a
  **cylindrical / non-throated** worm wheel (a legitimate crossed-helical drive), not a throated one.
  **Section type differs from the spur extrude:** `loft` takes `closedWire` sections (the tooth loop
  wrapped `closedWire(wire([...]))`), NOT the bare `polygon` Face the spur `extrude` uses — feeding a
  Face/polygon to `loft` is `TS2345`. Spur = `polygon` → `extrude`; helical = `closedWire` → `loft`.
- **Centre distance = `r_worm_pitch + r_wheel_pitch`** — place them there. Do **NOT** open it up to
  make the no-jam sweep pass: that's an air gap, not a mesh (see "Build + verify" step 4). A true
  throated/hobbed wheel (generate it by subtracting rotated copies of the worm from the blank) is
  conjugate but slow/advanced — reach for it only when a throated wheel is the explicit goal.
- **Relieve the tooth tips (the cylindrical-wheel jam).** At the _fixed_ centre distance, full-depth
  addenda make `r_wheel_tip + r_worm_crest > centre distance`, so the wheel tip collides the worm
  crest every revolution — a **geometric** jam no phase or sign choice fixes (don't chase phasing for
  it). Use stub/relieved addenda plus backlash so the two tip radii sum stays under the centre
  distance; the wheel tooth tip then rides in the thread groove instead of hitting the crest.
- Reduction = `N_wheel : starts`. Mount the wheel shaft so the frame **clears the wheel's rotation
  envelope** (radius `ra`): a support that crosses the wheel disk impales it and the wheel can't turn
  (check frame-vs-wheel interference, not just worm-vs-wheel).

## Rack (rotary → linear)

A rack is the involute of an infinite-radius gear, so its flanks **degenerate to straight lines**.

- **Rack teeth** — straight flanks inclined at the **pressure angle** (20°) to the pitch-line normal;
  tooth/space split at half the circular pitch (`π·m`); addendum `m` above the pitch line, dedendum
  `1.25m` below. One closed `polygon` → `extrude`, same machinery as a gear.
- **The mating pinion stays a normal involute gear** — straight radial pinion teeth do not mesh a rack.
- Mesh: the pinion pitch circle is tangent to the rack pitch line (pinion axis one pitch radius above
  it). Validate with the rack↔pinion kinematics in step 4.

## Internal ring gear (epicyclic / planetary)

A ring gear has **inward-pointing** involute teeth — build it as **`disc − external-cutter`**: an
annular disc minus a full external gear of the same `m`/PA, leaving the conjugate internal teeth.

- **Centre distance is a SUBTRACTION.** Planet↔ring spacing = `r_ring − r_planet` (every external
  pair _adds_ radii; the internal pair subtracts). For a planetary set the planets orbit at
  `r_sun + r_planet = r_ring − r_planet`, which forces `N_ring = N_sun + 2·N_planet`; ratio (ring
  fixed, carrier out) = `1 + N_ring/N_sun`.
- **The backlash ADJUSTMENT inverts** (the clearance itself stays positive — don't call it "negative
  backlash", which means an interference fit). Because the cutter is _subtracted_, an **oversized**
  cutter tooth leaves a _thinner_ ring tooth → more running clearance. So on an internal ring you add
  clearance by **fattening the cutter**, the inverse of an external gear (where you thin the tooth
  directly); a touch of extra addendum also deepens the ring valleys past the planet tip.

## Timing-belt pulleys (non-involute)

Belt pulleys (GT2, HTD, MXL, T) are **not** involute gears — the tooth is a shallow **curved trough**
fixed by the belt standard (GT2 = a circular-arc valley at 2 mm pitch), sized to the belt, not a
mating gear, so there is no meshing pair to validate. Model the trough (an arc or a cosine dip) per
the standard and use the same **one closed `polygon` → `extrude`** rim build; add flanges and a bored
hub with `cut`.

**Build the rim as a single-valued polar curve `r(angle)`**, sweeping angle monotonically `0 → 2π` and
emitting `[r·cosθ, r·sinθ]` — `r` rides the crest (land) radius and dips into the trough arc per tooth.
A per-tooth point list assembled from absolute arc endpoints can fold back past the crest (the trough
arc’s ends don’t land on the land radius), giving a self-intersecting loop that extrudes to a
`VALIDATION_FAILED` non-manifold solid. The monotonic-angle `r(angle)` curve cannot self-intersect.

## Build + verify

1. One tooth profile in 2D (involute sampled points, or a trapezoid/straight-rack approximation).
2. Replicate that point list around all `N` teeth (or along the rack) into **one closed `polygon`**
   → `extrude` — the verified reliable build above. Do **NOT** `circularPattern` separate per-tooth
   solids and union them, and do **NOT** cut tooth gaps with a patterned box/slot cutter: those are
   the slower/flakier per-tooth-boolean paths the one-polygon build exists to avoid, and a box cutter
   silently produces non-conjugate teeth. **Dedupe coincident consecutive points** in the computed
   loop (a tooth's trailing point is the next tooth's leading point) or `polygon` throws
   `makeLineEdge: construction failed` — see `references/sketching-2d.md`. After the boolean (bore /
   hub `cut`), don't gate your own guards on `isSolid()`/`shapeType` — a clean cut of an extruded
   gear often reports `Compound` while being one valid body; check `isValidSolid` / positive volume.
3. Bore the centre, add hub/keyway with `cut` (spur). Helical/worm-wheel = loft the tooth loop with a
   twist law; mirror-stack for herringbone.
4. **Verify meshing — and engagement, not just no-jam.** Place the pair at the correct relative
   position (per pair type below), sweep the drive parameter, and assert the teeth interpenetrate ~0
   through the motion (`references/assemblies-motion.md`). A non-jam sweep is necessary but **not
   sufficient** — a pair pulled too far apart also never collides. So also confirm real **contact**:
   the running clearance/backlash must be small (~0.1–0.25 mm), and pulling the driver away by the
   working depth (`2m`) must _break_ the contact. A pair is "done" only when it both meshes (contacts)
   and doesn't jam. For multi-body drives, also assert the **frame never intersects a moving part**.
   - **gear ↔ gear:** centre distance `m·(N1+N2)/2`; rotate both at the conjugate ratio `−N1/N2`.
   - **rack ↔ pinion:** pinion axis one pitch radius (`m·N/2`) above the rack pitch line; rotate the
     pinion by θ and translate the rack by `pitchRadius·θ` (**θ in radians** — the `assemblies-motion.md`
     template sweeps in degrees, so convert: `rackShift = pitchRadius·θ_deg·π/180`, else the rack
     crawls ~57× too slowly).
   - **worm ↔ wheel:** centre distance `r_worm_pitch + r_wheel_pitch`; rotate the worm by φ and the
     wheel by `φ/ratio` (`ratio = N_wheel / starts`).
   - **planet ↔ ring (internal):** spacing `r_ring − r_planet` (a subtraction); hold the carrier and
     rotate the planet in place by θ — the ring is fixed, so there is no second-body ratio. (sun ↔
     planet is a normal gear↔gear pair.)

   Mesh sweeps are **expensive** — `intersect` on two high-face-count involute gears is seconds per
   call, and a multi-mesh assembly (a planetary's sun+3-planet+ring) can blow the CLI timeout. Keep
   the involute sample count low and sweep **coarsely** (a few steps over one tooth pitch), not a
   fine full turn.

   Two start-pose details the sweep will flag if wrong: **phase** one member so a tooth seats in the
   other's space (not tooth-on-tooth — scan a half-pitch to find the seated phase), and get the
   **rolling sign** right (the driven member advances so the pitch surfaces roll without slipping;
   the opposite sign jams mid-tooth). A wrong phase or sign shows up as a large interpenetration that
   vanishes at the right one.
