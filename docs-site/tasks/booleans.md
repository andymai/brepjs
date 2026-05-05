---
title: Boolean Operations
---

# Boolean Operations

The three boolean operations — fuse, cut, intersect — are how you combine primitives into real parts. They are also the operation most likely to fail in practice. This chapter covers all three, the multi-shape variants, and the failure modes you will hit eventually.

## The three operations

| Function          | Operation    | Meaning                  |
| ----------------- | ------------ | ------------------------ |
| `fuse(a, b)`      | Union        | Glue two shapes into one |
| `cut(a, b)`       | Subtraction  | Remove `b` from `a`      |
| `intersect(a, b)` | Intersection | Volume common to both    |

```typescript
import { box, cylinder, fuse, cut, intersect, measureVolume, unwrap } from 'brepjs/quick';

const a = box(20, 20, 20);
const b = cylinder(8, 30, { at: [10, 10, -5] });

const glued = unwrap(fuse(a, b));
const drilled = unwrap(cut(a, b));
const overlap = unwrap(intersect(a, b));

console.log({
  glued: measureVolume(glued).toFixed(2),
  drilled: measureVolume(drilled).toFixed(2),
  overlap: measureVolume(overlap).toFixed(2),
});
```

All three return `Result<Shape3D, BrepError>`.

## Multi-shape variants

For more than two operands, prefer the `*All` variants. They are faster than chaining and avoid a class of intermediate-result invalidity:

```typescript
import { box, sphere, cylinder, fuseAll, cutAll, unwrap } from 'brepjs/quick';

const base = box(40, 40, 5);

const fused = unwrap(fuseAll([box(10, 10, 10), sphere(5), cylinder(3, 8)]));
void fused;

const drilled = unwrap(
  cutAll(base, [
    cylinder(2, 8, { at: [10, 10, -1] }),
    cylinder(2, 8, { at: [30, 10, -1] }),
    cylinder(2, 8, { at: [10, 30, -1] }),
    cylinder(2, 8, { at: [30, 30, -1] }),
  ])
);
console.log('Drilled four holes');
```

`cutAll(base, tools)` cuts every tool from base in one operation. `fuseAll(shapes)` fuses everything in the list.

## With the fluent wrapper

```typescript
import { shape, box, cylinder } from 'brepjs/quick';

const part = shape(box(20, 20, 20))
  .cut(cylinder(5, 25, { at: [10, 10, -3] }))
  .fuse(cylinder(2, 30, { at: [10, 10, 0] })).val;
void part;
```

Each `.cut`, `.fuse`, `.intersect` chains; failures throw `BrepWrapperError`.

## Failure modes

Five categories cover most boolean failures:

### `BOOLEAN_NO_OVERLAP`

The two operands don't share volume.

```typescript
import { box, cut, isOk } from 'brepjs/quick';

const a = box(10, 10, 10);
const b = box(10, 10, 10, { at: [100, 0, 0] }); // far away
const result = cut(a, b);
console.log('Overlap?', isOk(result)); // true — cut returns a unchanged
```

`cut` with no overlap actually succeeds and returns `a` untouched in OpenCascade's semantics. `intersect` with no overlap returns an empty compound. `fuse` with no overlap returns a compound containing both shapes (a CompSolid). What "no overlap" means for your specific code depends on which operation you used.

When you want to _require_ overlap, check the result:

```typescript
import { box, cut, isOk, measureVolume, unwrap } from 'brepjs/quick';

const a = box(10, 10, 10);
const b = box(10, 10, 10, { at: [100, 0, 0] });
const result = cut(a, b);

if (isOk(result) && Math.abs(measureVolume(result.value) - measureVolume(a)) < 1e-6) {
  console.warn('Cut had no effect — operands did not overlap');
}
```

### `BOOLEAN_INVALID_INPUT`

One of the inputs failed `BRepCheck`. The kernel refuses to operate on invalid shapes. Heal first:

```typescript
import { autoHeal, fuse, isOk, unwrap, box, cylinder } from 'brepjs/quick';

const a = box(10, 10, 10);
const b = cylinder(5, 15);

let result = fuse(a, b);
if (!isOk(result) && result.error.code === 'BOOLEAN_INVALID_INPUT') {
  const aFixed = unwrap(autoHeal(a));
  const bFixed = unwrap(autoHeal(b));
  result = fuse(aFixed, bFixed);
}
void result;
```

### `BOOLEAN_NEAR_COINCIDENT`

The two operands have geometry that is _almost_ but not exactly coincident. The boolean produces slivers — tiny degenerate faces. Workarounds:

- **Add overshoot**: extend the cutting tool slightly past the boundary so coincidence becomes unambiguous overlap (the `cylinder(5, 12, { at: [..., -1] })` pattern).
- **Heal both** with a slightly enlarged tolerance: `autoHeal(s, { tolerance: 0.01 })`.
- **Restate the problem**: instead of `cut(a, b)` where `b` is exactly flush, use a pattern that makes the cut definitely interior.

### `BOOLEAN_AMBIGUOUS_RESULT`

The operation has multiple geometrically valid outcomes. Rare. Usually a sign that two operands touch each other tangentially (a sphere kissing a face). Restate by changing tolerances or adding overshoot.

### `KERNEL_INTERNAL_ERROR`

OpenCascade's `BRepAlgoAPI` died with an unrecoverable error. Treat as a programmer error in the inputs — usually the inputs were degenerate (zero volume, self-intersecting, etc.). File a bug if the inputs are clearly valid.

[Error Codes](../reference/errors) lists every code with detailed recovery patterns.

## Performance

Boolean cost roughly tracks (face count of A) × (face count of B). A box-on-box boolean is microseconds; a heavily-filleted swept assembly boolean can be seconds. Two heuristics:

- **Use the `All` variants** for multi-shape operations. Internally they batch the kernel calls and reduce redundant tolerance recomputation.
- **Order matters**: `cut(a, b)` traverses `b`'s topology against `a`'s. If `a` has 10 faces and `b` has 1000, prefer `cut(b_inverted, a_inverted)` if you can flip the semantics. Often you cannot, but it's worth knowing the order has cost implications.

## Common patterns

### Drill many holes — cut once

```typescript
import { box, cylinder, cut, fuseAll, unwrap } from 'brepjs/quick';

const block = box(40, 40, 10);
const tools = unwrap(
  fuseAll([
    cylinder(2, 12, { at: [10, 10, -1] }),
    cylinder(2, 12, { at: [30, 10, -1] }),
    cylinder(2, 12, { at: [10, 30, -1] }),
    cylinder(2, 12, { at: [30, 30, -1] }),
  ])
);
const part = unwrap(cut(block, tools));
console.log('Drilled four holes in one boolean');
```

Three potential boolean failures become one. If the holes don't overlap each other (the typical case) the cost is the same as four sequential cuts but in one kernel invocation.

### Mortise and tenon

```typescript
import { box, cut, fuse, unwrap } from 'brepjs/quick';

const part = box(40, 20, 10);
const tenon = box(8, 6, 4, { at: [16, 7, 10] }); // protrudes from top
const mortise = box(8.2, 6.2, 4.1, { at: [15.9, 6.9, -0.05] }); // through-cut

const withTenon = unwrap(fuse(part, tenon));
const withMortise = unwrap(cut(withTenon, mortise));
console.log('Built mortise and tenon');
```

Add tenons by `fuse`; remove mortises by `cut`. The slight oversize on the mortise (`8.2 × 6.2`) gives manufacturing clearance.

### Carve a label

```typescript
import { box, sketchCircle, cut, unwrap } from 'brepjs/quick';

const plate = box(40, 30, 5);
const labelSlot = sketchCircle(8).extrude(0.5).val; // 0.5mm deep
// position it:
// const positioned = translate(labelSlot, [20, 15, 4.5]);
// const engraved = unwrap(cut(plate, positioned));
void plate;
```

Shallow, broad cuts are how engraving works in B-Rep. The depth controls how deep the label sits.

## What never works in B-Rep booleans

These will fail or produce nonsense regardless of how you frame them:

- **Booleans across different units** — if `a` is in mm and `b` is in metres, the kernel treats them as the same scale. Make sure both inputs are in the same unit space.
- **Booleans on shapes with self-intersections** — `BRepCheck` will catch this; surface it via `autoHeal`.
- **Booleans on faces** (without converting to solids first) — `fuse(face, face)` doesn't make geometric sense. Convert to solids by extruding or building shells.
- **Booleans on shapes with very different tolerances** — the kernel uses the larger of the two and may treat distant geometry as coincident. Normalize first.

## Next steps

- [Fillets & Chamfers](./fillets) — refining the edges that appear after booleans
- [Healing & Sewing](../advanced/healing) — fixing inputs and outputs that don't pass `BRepCheck`
- [Error Codes](../reference/errors) — every boolean error and its recovery
