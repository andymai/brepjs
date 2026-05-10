---
title: Lofts, Sweeps, Revolves
description: 'Extrude, revolve, sweep, and loft turn 2D profiles into 3D solids. The four motion-based operations, with options and gotchas.'
---

# Lofts, Sweeps, Revolves

Three operations turn a 2D profile (or several) into a 3D solid by motion: extrude moves the profile linearly, revolve rotates it around an axis, sweep drags it along a path, loft interpolates between profiles. Combined with sketching, they cover everything that isn't a primitive boolean.

## Extrude — linear motion

The simplest case. A profile pushed along its normal:

```typescript
import { sketchRectangle, sketchCircle, measureVolume, unwrap } from 'brepjs/quick';

const block = sketchRectangle(30, 20).extrude(10);
const cyl = sketchCircle(10).extrude(20);

console.log('Block:', unwrap(measureVolume(block)).toFixed(2));
console.log('Cylinder:', unwrap(measureVolume(cyl)).toFixed(2));
```

The functional equivalent — `extrude(face, height)` — takes an `OrientedFace` and a distance:

```typescript
import { sketchCircle, extrude, unwrap } from 'brepjs/quick';

const profile = sketchCircle(10).face();
const cyl = unwrap(extrude(profile, 20));
export default cyl;
```

### Extrude with a vector

Pass a 3D vector to extrude in an arbitrary direction (not perpendicular to the sketch plane):

```typescript
import { sketchRectangle, extrudeAlong, unwrap } from 'brepjs/quick';

const profile = sketchRectangle(20, 10).face();
const slanted = unwrap(extrudeAlong(profile, [0, 5, 20])); // extrude along (0,5,20)
export default slanted;
```

The vector replaces the height — its length determines extrusion distance, its direction determines the axis.

### Tapered extrude

`extrude(face, height, { taper })` adds a draft angle. Common in moulded parts:

```typescript
import { sketchRectangle, extrude, unwrap } from 'brepjs/quick';

const profile = sketchRectangle(30, 20).face();
const tapered = unwrap(extrude(profile, 20, { taper: 5 })); // 5° draft
export default tapered;
```

Negative taper widens upward; positive narrows.

## Revolve — rotational motion

A 2D profile rotated around an axis — the basis of every wineglass, vase, axle, and spindle:

<!-- @run-test -->

```typescript
import { Sketcher } from 'brepjs/quick';

const goblet = new Sketcher('XZ')
  .movePointerTo([0, 0])
  .hLine(8) // base outer radius
  .vLine(1.5) // thin disc base
  .hLine(-6) // narrow into the stem (r=2)
  .vLine(20) // stem
  .hLine(8) // cup floor at r=10
  .tangentArc(4, 4) // quarter-arc rounding the cup base, ends tangent +Z
  .vLine(13) // straight cup wall up to r=14
  .hLine(-14) // close across the top
  .vLine(-38.5) // close down the axis
  .close()
  .revolve();
export default goblet;
```

The axis defaults to the sketch plane's vertical axis. The profile must lie entirely on one side of the axis — the kernel rejects profiles that cross.

### Partial revolves

By default, `revolve` sweeps 360°. For partial revolutions:

```typescript
import { Sketcher, revolve, unwrap } from 'brepjs/quick';

const profile = new Sketcher('XZ')
  .movePointerTo([5, 0])
  .lineTo([10, 0])
  .lineTo([10, 5])
  .lineTo([5, 5])
  .close()
  .face();

const halfRing = unwrap(revolve(profile, { angle: 180 })); // half-torus segment
export default halfRing;
```

`{ angle: degrees }` controls the sweep. Use this for hemisphere caps, pie slices, partial bushings.

### Revolves around an arbitrary axis

```typescript
import { Sketcher, revolve, unwrap } from 'brepjs/quick';

const profile = new Sketcher('XY')
  .movePointerTo([20, 0])
  .lineTo([22, 0])
  .lineTo([22, 5])
  .lineTo([20, 5])
  .close()
  .face();

const ring = unwrap(revolve(profile, { axis: { origin: [0, 0, 0], direction: [0, 0, 1] } }));
export default ring;
```

## Sweep — profile along a path

Drag a 2D profile along a 3D wire:

```typescript
import { sketchCircle, line, sweep, unwrap } from 'brepjs/quick';

const cross = sketchCircle(2).face(); // 2mm tube radius
const path = line([0, 0, 0], [0, 0, 50]); // 50mm straight up

const tube = unwrap(sweep(cross, path));
export default tube;
```

The path can be any 3D curve — straight, arced, helical, B-spline. The profile rides along it.

### Helical sweeps for threads and springs

Build a helix as the path, sweep a circle along it:

```typescript
import { sketchCircle, helix, sweep, unwrap } from 'brepjs/quick';

const profile = sketchCircle(0.5).face(); // thread cross-section
const path = helix({ pitch: 1.5, height: 30, radius: 5 });

const thread = unwrap(sweep(profile, path)); // bare helical coil
export default thread;
```

`helix({ pitch, height, radius })` returns a wire of the helical curve. Sweep a small circle along it and you get a thread — fuse it onto a shaft to make a screw (see _Threaded fastener_ below).

### Frenet vs auxiliary frame

When the path bends, the kernel has to decide how the profile orients itself. Two modes:

- **`'frenet'` (default)** — the profile rotates with the path's tangent and normal
- **`'auxiliary'`** — the profile's normal stays aligned with a fixed reference axis

Most parts work with the default. Specify `{ frame: 'auxiliary' }` when you need the profile to keep a constant up-direction (think extruded handrails).

## Loft — interpolation between profiles

A solid built by smoothly interpolating between two or more profiles:

<!-- @run-test -->

```typescript
import { sketchCircle, loft, unwrap } from 'brepjs/quick';

const base = sketchCircle(15); // narrow base
const rim = sketchCircle(35, { origin: [0, 0, 50] }); // wider rim, 50 mm up

const bowl = unwrap(loft([base.wire, rim.wire])); // flared truncated cone
export default bowl;
```

The loft passes through every input profile in order. Two parallel circles of different radii produce a flared, bowl-shaped solid — the canonical loft pattern. Hollow it with `shell` (see _Hollowing: shell_ below) to turn it into a usable cup. Profiles must be on parallel planes (or roughly so — non-coplanar lofting works but can produce twisted results).

> Note: `loft` takes `Wire[]`, hence the `.wire` on each sketch. The OO equivalent `sketch.loftWith(otherSketch, opts)` does that unwrapping for you.

### Multi-section lofts

<!-- @run-test -->

```typescript
import { sketchCircle, loft, unwrap } from 'brepjs/quick';

const sections = [
  sketchCircle(10).wire,
  sketchCircle(20, { origin: [0, 0, 30] }).wire,
  sketchCircle(5, { origin: [0, 0, 60] }).wire,
];

const vase = unwrap(loft(sections));
export default vase;
```

Three or more sections produces a smooth blend through every one. Useful for vases, ducts, ergonomic handles.

### Ruled vs smooth

`loft([a, b], { ruled: true })` builds a ruled surface (straight lines between corresponding points on the profiles). The default produces a smooth (B-spline) blend. Ruled is faster but visually angular — common in sheet-metal modelling.

## Hollowing: shell

After building a solid, hollow it out by removing one or more faces and offsetting the rest by a wall thickness:

<!-- @run-test -->

```typescript
import { sketchCircle, faceFinder, shell, unwrap } from 'brepjs/quick';

const closed = sketchCircle(20).extrude(40);
// Top face is the only one whose minimum distance from the origin is 40 (the cylinder's height).
const topFaces = faceFinder().atDistance(40, [0, 0, 0]).findAll(closed);
const cup = unwrap(shell(closed, topFaces, 2)); // 2mm wall, top open
export default cup;
```

`shell(solid, openFaces, thickness)`. The top face becomes the open mouth; everything else gains the wall thickness inward.

The fluent equivalent:

<!-- @run-test -->

```typescript
import { shape, sketchCircle } from 'brepjs/quick';

const cup = shape(sketchCircle(20).extrude(40)).shell(
  (f) => f.atDistance(40, [0, 0, 0]),
  2
).val;
export default cup;
```

## Common patterns

### Threaded fastener

```typescript
import { sketchCircle, helix, sweep, sketchRoundedRectangle, fuse, unwrap } from 'brepjs/quick';

const shaft = sketchCircle(3).extrude(20); // M6-ish, 20 mm long
const threadProfile = sketchCircle(0.75).face(); // ~12% of shaft dia
const threadPath = helix({ pitch: 1.5, height: 18, radius: 3 });
const thread = unwrap(sweep(threadProfile, threadPath));
const head = sketchRoundedRectangle(8, 8, 0.5).extrude(3).translate([0, 0, 20]);

const screw = unwrap(fuse(unwrap(fuse(shaft, thread)), head));
export default screw;
```

### Funnel (loft + revolve combined)

A funnel is two truncated cones — but easier as a revolved profile:

```typescript
import { Sketcher } from 'brepjs/quick';

const funnel = new Sketcher('XZ')
  .movePointerTo([15, 0])
  .lineTo([15, 1])
  .lineTo([3, 30])
  .lineTo([3, 50])
  .lineTo([2, 50])
  .lineTo([2, 30])
  .lineTo([14, 1])
  .lineTo([14, 0])
  .close()
  .revolve();
export default funnel;
```

A profile, two `lineTo`s, a revolve. Simpler than building two cones and fusing.

## When operations fail

| Failure                        | Cause                                                                    |
| ------------------------------ | ------------------------------------------------------------------------ |
| `EXTRUDE_INVALID_FACE`         | The face isn't `OrientedFace` — usually means the wire isn't closed      |
| `REVOLVE_AXIS_CROSSES_PROFILE` | The axis passes through the profile (would self-intersect)               |
| `SWEEP_PATH_INVALID`           | Path has self-intersections, sharp corners, or non-tangent meeting edges |
| `LOFT_PROFILE_MISMATCH`        | Profiles have very different topologies (e.g. one closed, one open)      |
| `SHELL_TOO_THICK`              | Wall thickness larger than the local geometry can support                |

[Error Codes](../reference/errors) covers each in detail.

## Next steps

- [Boolean Operations](./booleans) — combining the solids you build here
- [Fillets & Chamfers](./fillets) — refining the edges these operations create
- [Finders & Queries](./finders) — selecting features to extrude / shell / fillet on
