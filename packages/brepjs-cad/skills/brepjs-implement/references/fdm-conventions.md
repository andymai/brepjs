# FDM conventions — baked-in maker defaults (and which "numbers" are NOT standards)

Use these when a maker request omits dimensions. Two kinds of values live here: **standards**
(safe to bake in) and **heuristics** (printer/material/nozzle-dependent — never present as fact).

## Standards — safe defaults

**Fastener clearance holes (ISO 273 "normal"), through-holes for the screw to pass:**

| Screw | Clearance hole Ø | Counterbore (socket head) Ø × depth |
| ----- | ---------------- | ----------------------------------- |
| M2    | 2.4 mm           | 4.0 × 2.0                           |
| M2.5  | 2.9 mm           | 5.0 × 2.5                           |
| M3    | 3.4 mm           | 6.0 × 3.0                           |
| M4    | 4.5 mm           | 8.0 × 4.0                           |
| M5    | 5.5 mm           | 10.0 × 5.0                          |
| M6    | 6.6 mm           | 11.0 × 6.0                          |

- **Small plastic enclosure wall:** 2.0–3.0 mm. Absolute min printable wall ≈ 2× nozzle (0.8 mm at
  a 0.4 mm nozzle), but use ≥1.5–2 mm for any part under load.
- **Cosmetic fillet/round:** 1.0–3.0 mm. **Functional fillet at a load path:** size to the load, not looks.
- **STEP is the primary validated artifact;** STL/3MF are derived for slicing.

## Heuristics — printer-dependent, label them as such

Generic "FDM clearance = N mm" figures are **not standards** (commonly-cited sliding/running-fit
numbers do not survive scrutiny). Clearance depends on nozzle, material shrinkage, and calibration.

- **Find it empirically:** emit a small **tolerance test coupon** (a row of pins/holes at stepped
  clearances) and let the user pick the fit. This is the honest move — see the `coupon` pattern in
  any mechanism build.
- **Reasonable STARTING points to then verify** (diametral): press/no-gap ~0, snug/index ~0.15–0.2,
  free-sliding ~0.4–0.5. State these as starting points, not answers.
- **Press-fit (vetted heuristic):** add **0.2 mm vertical crush ribs** along the full mating length
  (no taper = one-time press-fit). See `references/mechanical-joints.md`.

## Design-for-printing geometry (reduces/eliminates supports)

- **Chamfer, don't fillet, downward-facing hole exits and overhangs** — a 45° chamfer bridges
  cleanly without supports; a fillet there sags.
- **45° rule:** overhangs steeper than ~45° from vertical want support; design them out with
  chamfers or by orienting the part.
- **Holes print slightly undersized** (elephant-foot + flow); for a press-fit pin, model the hole at
  nominal and tune via the coupon.
