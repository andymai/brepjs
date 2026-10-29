---
title: Lofts, Sweeps, Revolves
description: 'Extrude, revolve, sweep, and loft turn 2D profiles into 3D solids. The four motion-based operations, with options and gotchas.'
---

# Lofts, Sweeps, Revolves

Four operations turn a 2D profile (or several) into a 3D solid by motion: extrude moves the profile linearly, revolve rotates it around an axis, sweep drags it along a path, loft interpolates between profiles. Combined with sketching, they cover everything that isn't a primitive boolean.

## Extrude: linear motion

The simplest case. A profile pushed along its normal:

```typescript
import { sketchRectangle, sketchCircle, measureVolume, unwrap } from 'brepjs/quick';

const block = sketchRectangle(30, 20).extrude(10);
const cyl = sketchCircle(10).extrude(20);

console.log('Block:', unwrap(measureVolume(block)).toFixed(2));
console.log('Cylinder:', unwrap(measureVolume(cyl)).toFixed(2));
```

The functional equivalent, `extrude(face, height)`, takes an `OrientedFace` and a distance (a number extrudes along +Z):

```typescript
import { sketchCircle, extrude, unwrap } from 'brepjs/quick';

const profile = sketchCircle(10).face();
const cyl = unwrap(extrude(profile, 20));
export default cyl;
```

### Extrude with a vector

Pass a 3D vector to extrude in an arbitrary direction (not perpendicular to the sketch plane):

```typescript
import { sketchRectangle, extrude, unwrap } from 'brepjs/quick';

const profile = sketchRectangle(20, 10).face();
const slanted = unwrap(extrude(profile, [0, 5, 20])); // extrude along (0,5,20)
export default slanted;
```

The vector replaces the height: its length determines extrusion distance, its direction determines the axis.

### Tapered extrude

A sketch's `.extrude(height, { extrusionProfile })` scales the profile along the extrusion. Common in moulded parts:

```typescript
import { sketchRectangle } from 'brepjs/quick';

const tapered = sketchRectangle(30, 20).extrude(20, {
  extrusionProfile: { profile: 'linear', endFactor: 0.8 }, // top is 80% of the base
});
export default tapered;
```

An `endFactor` below 1 narrows upward; above 1 widens. To tilt existing faces by a draft angle instead, use `draft()`.

## Revolve: rotational motion

A 2D profile rotated around an axis: the basis of every wineglass, vase, axle, and spindle:

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

The axis defaults to the global Z axis through the sketch origin. The profile must lie entirely on one side of the axis; the kernel rejects profiles that cross.

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

const halfRing = unwrap(revolve(profile, { angle: Math.PI })); // half-torus segment
export default halfRing;
```

`{ angle: radians }` controls the sweep. Use this for hemisphere caps, pie slices, partial bushings.

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

const ring = unwrap(revolve(profile, { at: [0, 0, 0], axis: [0, 1, 0] })); // pivot point + axis direction
export default ring;
```

## Sweep: profile along a path

Drag a 2D profile along a 3D wire:

<!-- @run-test -->

```typescript
import { sketchCircle, line, wire, sweep, unwrap } from 'brepjs/quick';

const cross = sketchCircle(2).wire; // 2 mm tube cross-section (closed wire)
const path = unwrap(wire([line([0, 0, 0], [0, 0, 50])])); // 50 mm straight up

const tube = unwrap(sweep(cross, path));
export default tube;
```

`sweep` takes a closed wire (the profile) and a wire (the spine). `line(p1, p2)` returns an `Edge`, so we wrap it with `wire([...])` to promote it to a `Wire`. The path can be any 3D wire: straight, arced, helical, B-spline. The profile rides along it.

### Helical sweeps for threads and springs

Build a helix as the path, sweep a circle along it:

<!-- @run-test -->

```typescript
import { sketchCircle, helix, sweep, unwrap } from 'brepjs/quick';

const profile = sketchCircle(0.5).wire; // thread cross-section (closed wire)
const path = helix(1.5, 30, 5); // pitch, height, radius

const thread = unwrap(sweep(profile, path)); // bare helical coil
export default thread;
```

`helix(pitch, height, radius)` returns a wire of the helical curve. Sweep a small circle along it and you get a thread; fuse it onto a shaft to make a screw (see _Threaded fastener_ below).

### Frenet vs auxiliary frame

When the path bends, the kernel has to decide how the profile orients itself. The third argument to `sweep` picks the mode:

- **Default (`frenet: false`)**: a corrected Frenet frame that keeps the profile from flipping along the path
- **`{ frenet: true }`**: the profile rotates with the path's tangent and normal
- **`{ auxiliarySpine }`**: a second wire controls how the profile twists along the path

Most parts work with the default. Pass `auxiliarySpine` when you need explicit control over the profile's orientation.

## Loft: interpolation between profiles

A solid built by smoothly interpolating between two or more profiles:

<!-- @run-test -->

```typescript
import { sketchCircle, loft, unwrap } from 'brepjs/quick';

const base = sketchCircle(15); // narrow base
const rim = sketchCircle(35, { origin: [0, 0, 50] }); // wider rim, 50 mm up

const bowl = unwrap(loft([base.wire, rim.wire])); // flared truncated cone
export default bowl;
```

The loft passes through every input profile in order. Two parallel circles of different radii produce a flared, bowl-shaped solid: the canonical loft pattern. Hollow it with `shell` (see _Hollowing: shell_ below) to turn it into a usable cup. Profiles must be on parallel planes (or roughly so; non-coplanar lofting works but can produce twisted results).

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

Three or more sections pass through every one. With the default ruled loft each span is straight; pass `{ ruled: false }` for a smooth blend. Useful for vases, ducts, ergonomic handles.

### Ruled vs smooth

By default (`ruled: true`), `loft` builds a ruled surface (straight lines between corresponding points on the profiles). `loft([a, b], { ruled: false })` produces a smooth (B-spline) blend. Ruled is faster but visually angular, common in sheet-metal modelling.

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

const cup = shape(sketchCircle(20).extrude(40)).shell((f) => f.atDistance(40, [0, 0, 0]), 2).val;
export default cup;
```

## Common patterns

### Threaded fastener

<!-- @run-test -->

```typescript
import {
  sketchCircle,
  helix,
  sweep,
  sketchRoundedRectangle,
  fuse,
  translate,
  unwrap,
} from 'brepjs/quick';

const shaft = sketchCircle(3).extrude(20); // M6-ish, 20 mm long
const threadProfile = sketchCircle(0.75).wire; // ~12% of shaft dia
const threadPath = helix(1.5, 18, 3); // pitch, height, radius
const thread = unwrap(sweep(threadProfile, threadPath));
const head = translate(sketchRoundedRectangle(8, 8, 0.5).extrude(3), [0, 0, 20]);

const screw = unwrap(fuse(unwrap(fuse(shaft, thread)), head));
export default screw;
```

### Funnel (loft + revolve combined)

A funnel is two truncated cones, but easier as a revolved profile:

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

| Failure                                    | Cause                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `EXTRUDE_ZERO_VECTOR`                      | The extrusion height or vector has zero length                                              |
| `EXTRUDE_FAILED` / `REVOLVE_FAILED`        | The kernel couldn't build the solid from the face                                           |
| `SWEEP_NOT_3D`                             | No solid came out: path has self-intersections, sharp corners, or non-tangent meeting edges |
| `LOFT_FAILED`                              | Profiles have very different topologies (e.g. one closed, one open)                         |
| `SHELL_NO_EFFECT` / `SHELL_INVALID_RESULT` | Wall thickness larger than the local geometry can support                                   |

See [Error Codes](../reference/errors) for reading and handling errors.

## Next steps

- [Boolean Operations](./booleans): combining the solids you build here
- [Fillets & Chamfers](./fillets): refining the edges these operations create
- [Finders & Queries](./finders): selecting features to extrude / shell / fillet on
