# Mechanical joints — snap-fits, press-fits, heat-set bosses

Reliable on a brep kernel (box/cylinder/cut geometry). Clearance values are printer-dependent
heuristics (see `references/fdm-conventions.md`) — verify with a coupon, don't present as standards.

## Snap-fit cantilever clip

A flexing beam with a hook that catches an undercut/ledge on the mating part.

- **Taper the hook** (trapezoidal: thicker at the root, thinner at the tip) rather than a straight
  rectangular hook — it distributes bending stress instead of concentrating it at the base.
- **Longer beam → lower base stress** (for a given deflection, peak stress falls with beam length).
- **Lower engagement height (how far the hook overlaps the ledge) → lower stress AND lower
  insertion/removal force.** Tune engagement to the grip you want.
- **Lead-in chamfer** on the hook's insertion face so it cams over the ledge; a steeper retention
  face on the back makes it harder to pull out.
- **Verify:** in the assembled pose, the deflected beam must clear its mating undercut — check with
  an `intersect`-volume test (see `references/assemblies-motion.md`).

## Press-fit / interference fit

For a shaft-in-hole that should hold by friction.

- **0.2 mm vertical crush ribs along the full mating length, no taper → a true (one-time)
  press-fit.** The ribs deform on insertion and take up tolerance.
- **Crush ribs around the circumference → a transition fit** (locates but slides).
- Repeated assembly/disassembly wears the interference down — design ribs for one good seat, or use
  a snap-fit/fastener for anything cycled.

## Heat-set insert boss

A brass insert melted into a printed boss to give reusable metal threads (best for screws on FDM —
more reliable than printed threads for small fasteners).

- Model a **cylindrical boss** around the hole. Boss OD ≈ 2× the hole Ø (enough wall for the insert
  to bite without splitting).
- **Hole Ø = the insert's own spec** (each insert series differs — read its datasheet; do not bake a
  single clearance number).
- Add a **lead-in chamfer** at the top of the hole so the heated insert starts straight.
- Keep the boss height ≥ the insert length; leave a small relief pocket below for displaced plastic.

## Captive joints (toys / kid-safe)

Prefer geometry that traps a part by assembly order/enclosure over small separate pins. See the
captivity discussion in `references/assemblies-motion.md`.
