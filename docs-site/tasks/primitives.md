---
title: Primitives & Transforms
description: 'Boxes, cylinders, spheres, cones, tori, plus the transform vocabulary (translate, rotate, scale, mirror) that moves them around.'
---

# Primitives & Transforms

Every parametric part starts from primitives — boxes, cylinders, spheres, cones, tori — and gets to its final form by transforming and combining them. This chapter covers the primitives brepjs ships, the options each accepts, and the transform vocabulary that moves them around.

## The primitives

```typescript
import { box, cylinder, sphere, cone, torus, measureVolume, unwrap } from 'brepjs/quick';

box(30, 20, 10); // width × depth × height
cylinder(5, 20); // radius, height
sphere(8); // radius
cone(10, 5, 20); // base radius, top radius, height
torus(20, 3); // major radius, minor radius

console.log(unwrap(measureVolume(box(10, 10, 10)))); // 1000
```

All five return `ValidSolid` — a solid that has passed `BRepCheck`.

### `box(w, d, h, options?)`

A rectangular solid. By default the lower corner is at the origin and the box extends along positive X, Y, Z.

```typescript
import { box } from 'brepjs/quick';

box(30, 20, 10); // (0,0,0) to (30,20,10)
box(30, 20, 10, { centered: true }); // centred at origin
box(30, 20, 10, { at: [100, 0, 0] }); // lower corner at (100,0,0)
```

### `cylinder(r, h, options?)`

A cylindrical solid. Default axis is +Z, base at the origin.

```typescript
import { cylinder } from 'brepjs/quick';

cylinder(5, 20); // axis +Z
cylinder(5, 20, { axis: [1, 0, 0] }); // axis +X
cylinder(5, 20, { at: [10, 10, -2] }); // base at (10,10,-2)
```

### `sphere(r, options?)`

A spherical solid centred at the origin (or `at`).

```typescript
import { sphere } from 'brepjs/quick';

sphere(8);
sphere(8, { at: [0, 0, 10] });
```

### `cone(rBase, rTop, h, options?)`

A truncated cone. Pass `0` for `rTop` to get a full cone (point at top).

```typescript
import { cone } from 'brepjs/quick';

cone(10, 5, 20); // truncated
cone(10, 0, 20); // sharp point
```

### `torus(rMajor, rMinor, options?)`

A torus, axis +Z by default.

```typescript
import { torus } from 'brepjs/quick';

torus(20, 3); // ring of radius 20, tube radius 3
```

## Translate, rotate, scale

The three transforms. Each returns a new shape; nothing is mutated.

```typescript
import { translate, rotate, scale, box, measureVolume, unwrap } from 'brepjs/quick';

const b = box(10, 10, 10);

const moved = translate(b, [10, 0, 0]); // [dx, dy, dz]
const rotated = rotate(b, 45, { axis: [0, 0, 1], origin: [0, 0, 0] }); // degrees
const scaled = scale(b, 2); // uniform 2x
const stretched = scale(b, [2, 1, 1]); // per-axis

console.log(unwrap(measureVolume(scaled))); // 8000 (2³ × 1000)
console.log(unwrap(measureVolume(stretched))); // 2000
```

`rotate(shape, angleDegrees, { axis, origin })`. The axis defaults to `[0, 0, 1]`, origin to `[0, 0, 0]`.

`scale(shape, factor)` — uniform if `factor` is a number, per-axis if it's a `[sx, sy, sz]` tuple.

## Fluent transforms

The `shape()` wrapper exposes the same operations chainable, plus axis shortcuts:

```typescript
import { shape, box } from 'brepjs/quick';

const positioned = shape(box(10, 10, 10))
  .moveX(50) // translate([50,0,0])
  .moveZ(10) // translate([0,0,10])
  .rotateZ(45) // rotate(45, { axis: [0,0,1] })
  .scale(2).val;
```

The shortcuts — `.moveX/Y/Z`, `.rotateX/Y/Z` — exist because they are the most common transforms in practice. For arbitrary axes use `.translate([dx, dy, dz])` and `.rotate(angle, { axis })`.

## Constructing at a position

Rather than translate after the fact, most primitives accept `{ at: [x, y, z] }` to construct at a position. The two are equivalent:

```typescript
import { translate, cylinder } from 'brepjs/quick';

cylinder(5, 20, { at: [10, 10, -2] }); // construct at position
translate(cylinder(5, 20), [10, 10, -2]); // construct at origin then move
```

The `at` option is faster — it avoids one transform — but they produce identical geometry.

## Mirroring

`mirror(shape, plane)` reflects across a plane:

```typescript
import { box, mirror } from 'brepjs/quick';

const right = box(10, 10, 10, { at: [5, 0, 0] });
const left = mirror(right, 'YZ'); // reflect across the YZ plane

export default left;
```

Plane names: `'XY'`, `'YZ'`, `'XZ'`. For arbitrary planes pass a `Plane` value (origin + normal).

## Patterns: linear, circular

When you need many copies, the pattern operations are faster than fusing primitives manually:

```typescript
import { box, cylinder, fuseAll, cut, linearPattern, circularPattern, unwrap } from 'brepjs/quick';

const block = box(60, 60, 5);

// 4-by-4 grid of holes
const holes = unwrap(
  linearPattern(cylinder(2, 6), {
    count: [4, 4, 1],
    spacing: [12, 12, 0],
    origin: [12, 12, -1],
  })
);

const drilled = unwrap(cut(block, holes));
console.log('Drilled with linear pattern');

// 8 evenly-spaced features around an axis
const tab = box(2, 2, 8);
const ring = unwrap(
  circularPattern(tab, {
    count: 8,
    axis: [0, 0, 1],
    origin: [0, 0, 0],
  })
);
void ring;

export default drilled;
```

`linearPattern` distributes copies on a 3D grid; `circularPattern` distributes them around an axis.

## Tips

### Always set `at` on the cutting tool

When drilling through a block with `cut(block, hole)`, give the hole some overshoot so the boolean is unambiguous:

```typescript
import { box, cylinder, cut, unwrap } from 'brepjs/quick';

const block = box(20, 20, 10);
const hole = cylinder(5, 12, { at: [10, 10, -1] }); // -1 to +11 = +1 overshoot
const drilled = unwrap(cut(block, hole));

export default drilled;
```

`cylinder(5, 10, { at: [10, 10, 0] })` would have endpoints exactly on the block's faces — the boolean kernel can produce slivers near coincident geometry. A 1-unit overshoot is the cheap, reliable fix.

### Construct in millimetres (or whatever your unit is)

The kernel is unit-agnostic but assumes consistent units. Don't mix `box(0.05)` (50 micrometres? half a centimetre?) with `cylinder(2, 5)` (mm? cm?). Pick a unit and stay there.

### Centred construction

When you need a primitive centred at the origin:

```typescript
import { box, cylinder, translate, sphere } from 'brepjs/quick';

box(30, 20, 10, { centered: true }); // explicit option
translate(cylinder(5, 20), [0, 0, -10]); // translate manually
sphere(5); // already centred
```

## Next steps

- [Boolean Operations](./booleans) — `fuse`, `cut`, `intersect`, and the failure modes
- [Fillets & Chamfers](./fillets) — refining edges after primitives meet
- [2D Sketching](./sketching) — non-primitive profiles
