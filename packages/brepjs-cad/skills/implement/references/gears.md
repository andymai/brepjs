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

## Build + verify

1. One tooth profile in 2D (involute sampled points, or a trapezoid approximation).
2. `circularPattern` it `N×` around the axis; union to the root-circle blank.
3. Extrude (spur) or sweep with a twist law (helical); mirror-stack for herringbone.
4. **Verify meshing with `references/assemblies-motion.md`:** place two gears at the correct centre
   distance (`m·(N1+N2)/2`), rotate one, and assert the teeth interpenetrate ~0 through a full turn.
   A gear pair is "done" only when it sweeps without jamming.
