# Threads (RELIABLE via loft-through-sections)

> **Verified.** occt-wasm's `MakePipeShell` (the `sweep`/`twistExtrude` path) **cannot** sweep a
> helix — it throws `sweepPipeShell` regardless of profile framing, and `twistExtrude` makes twisted
> columns, not radial threads. The robust route (used by the OCCT bottle tutorial) is **`loft` /
> ThruSections through rotated tooth sections** — it avoids `MakePipeShell` entirely and builds a
> valid manifold thread. See the worked, baseline-tested `examples/threaded-rod.brep.ts`.

## Native `thread()` (when your brepjs has it)

brepjs ships a native `thread(options)` that does exactly the loft recipe below and returns the
helical ridge: `thread({ radius, pitch, height })` → fuse to a core (external) or `cut` from a bore
(`inward: true`, internal). Prefer it when available; the manual recipe is the fallback / how it works.

## The reliable build (external thread)

For `i` in `0..TURNS·SECTIONS_PER_TURN`, place the tooth cross-section at angle `θ = (i/SPT)·2π`,
height `z = pitch·θ/2π`, in the meridian (radial, axial) plane at that angle, then `loft` all
sections (`{ ruled: true }` for a clean faceted skin), and `fuse` to a core cylinder.

```ts
const pt = (u, v) => [R*cos(θ) + u*cos(θ), R*sin(θ) + u*sin(θ), z + v]; // u=radial, v=axial
const section = closedWire(wire([line(p1, apex), line(apex, p3), line(p3, p1)])); // V-tooth
// ... collect sections, then:
const ridge = loft(sections, { ruled: true });
return fuse(cylinder(R + 0.15, HEIGHT), ridge);
```

- **Profile:** an ISO-ish 60° V is a triangle of radial depth `≈0.6·pitch`, axial half-width
  `≈0.42·pitch`, with its base ~0.3 mm inside the core so the `fuse` is clean.
- **Smoothness:** `SECTIONS_PER_TURN ≈ 20` is a good faceting/speed tradeoff; raise for finer thread.
- **Internal thread:** build the same ridge at the major radius and **`cut`** it from a bored hole
  instead of fusing to a core.
- **Pitch** comes from the standard (M3=0.5, M4=0.7, M5=0.8, M6=1.0 coarse). External and internal
  threads of the same standard mate; the clearance between them is a printer-dependent heuristic
  (`references/fdm-conventions.md`) — tune with a coupon (a 3-turn stub + nut).

## Standard forms

Swap the section profile to change the form: ISO/UTS 60° V, trapezoidal 30°, ACME 29°, buttress 45°
(asymmetric), square (~0°). Same loft machinery, different tooth points.

## Still note

For *small fasteners*, a **heat-set insert or tapped clearance hole** is often more robust on FDM than
a printed thread (`references/mechanical-joints.md`). Reach for printed threads when the thread is the
feature (caps, jars, glands, lead screws) — and prefer the native `thread()` (above) over hand-rolling
the loft when your brepjs version has it.
