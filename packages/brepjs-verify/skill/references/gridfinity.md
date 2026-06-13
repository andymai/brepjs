# Gridfinity — the spec (so you can generate any bin/baseplate, not copy an example)

Gridfinity is an open-source modular grid storage system. Build parts to this spec parametrically;
the skill ships worked examples (`gridfinity-baseplate`, `gridfinity-bin`, `gridfinity-divider`).

## Core dimensions

- **Grid unit:** 42 × 42 mm. A part is `GRID_X × GRID_Y` cells.
- **Clearance:** bins are ~0.5 mm under the cell so they drop into a baseplate (`42 − 0.5 = 41.5`
  footprint per cell, typical).
- **Height unit ("U"):** 7 mm. Bin height = base + `n × 7 mm`.
- **Base / foot profile:** ~5 mm tall stacking foot with a chamfered lip that mates the baseplate
  cradle (and lets bins stack). Magnet/screw holes sit in the foot.
- **Magnet holes:** Ø6 mm × 2 mm deep, one in **each of the four corners** of every unit cell.
- **Screw holes (optional):** M3, concentric with the magnet holes, for bolting down.

## Notes

- The spec is a community "work in progress" — treat exact lip geometry as the example encodes it,
  and keep the 42 mm grid / 7 mm U / Ø6×2 magnets as the load-bearing invariants.
- Generate feet by tiling one foot block per cell on the 42 mm grid (`fuseAll`/`compound`), hollow
  the body from the top, add the stacking lip, then drill magnet pockets up from below — see
  `gridfinity-bin.brep.ts`.
