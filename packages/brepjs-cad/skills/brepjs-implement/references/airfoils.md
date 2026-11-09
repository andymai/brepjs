# Swept blades & airfoils (fans, props, impellers, twisted vanes)

The reason a "twisted impeller" / "swept fan" comes out looking like thin flat fins is **two mistakes**,
not one: a **flat rectangle** section, and extruding it **along the axis** instead of **radially**. A
convincing blade needs all three of: a **cambered** (curved) airfoil section, a **radial** span from hub
to tip, and a **pitch twist** along that span. `twistAngle` alone on a flat paddle is not enough.

## The recipe (verified — builds `ok:true`, reads as a real impeller)

```ts
import { draw, cylinder, fuse, fuseAll, cut, circularPattern, unwrap } from 'brepjs';

const R_HUB = 8,
  R_TIP = 28,
  SPAN = R_TIP - R_HUB;
const CHORD = 18,
  CAMBER = 3.2,
  THICK = 1.6,
  PITCH = 38; // PITCH = root→tip twist, degrees
const N = 7;

// 1. CAMBERED thin-plate airfoil section. The upper surface bulges (camber + half-thickness),
//    the lower returns with (camber − half-thickness): a thin crescent, not a flat strip.
const section = () =>
  draw([-CHORD / 2, 0])
    .sagittaArcTo([CHORD / 2, 0], CAMBER + THICK / 2) // upper surface
    .sagittaArcTo([-CHORD / 2, 0], -(CAMBER - THICK / 2)) // lower surface back to the leading edge
    .close();

// 2. One blade: sketch the section in the plane PERPENDICULAR to the span (YZ → extrudes +X) at the
//    hub radius, then extrude RADIALLY by SPAN with a pitch twist. Camber + twist = a swept airfoil.
const blade = () =>
  section()
    .sketchOnPlane('YZ', R_HUB) // scalar origin = offset R_HUB along the plane normal (+X)
    .extrude(SPAN, { twistAngle: PITCH, origin: [0, 0] });

export default () => {
  const hub = cylinder(R_HUB + 1, 22, { at: [0, 0, -11] });
  const blades = unwrap(circularPattern(blade(), [0, 0, 1], N)); // N blades around the fan axis
  const impeller = unwrap(fuse(hub, blades));
  // optional duct/shroud — a ring with a little tip clearance over R_TIP
  const ring = unwrap(
    cut(
      cylinder(R_TIP + 3, 26, { at: [0, 0, -13] }),
      cylinder(R_TIP + 0.5, 30, { at: [0, 0, -15] })
    )
  );
  return unwrap(fuseAll([impeller, ring], { unsafe: true }));
};
```

## Notes

- **Span direction sets the fan type.** Extruding the section **radially** (`sketchOnPlane('YZ', R_HUB)`
  → +X) gives an **axial** fan / propeller (blades reach out to a shroud). Extruding **up the axis** (+Z)
  gives the barber-pole of fins that reads wrong — that's the common mistake.
- **Camber is what makes it an airfoil.** Drop the camber (set both sagittas to ±THICK/2) and you get a
  flat twisted plate again. Keep `CAMBER` ≈ 15–25 % of `CHORD`.
- **Pitch twist:** ~25–45° root→tip for a fan/prop. More twist = more aggressive blade.
- The result is a multi-body `Compound` (`ok:true`, valid) — fine, per the booleans rule; don't chase a
  single `Solid` unless something downstream needs one.
- For a **centrifugal** impeller instead, sweep the cambered sections backward in the XY plane and stack
  them; for **turbine/stator vanes**, the same section + radial extrude with little or no twist.
