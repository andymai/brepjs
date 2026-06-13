---
title: Tolerance and Validity
description: 'Every B-Rep shape has a tolerance below which two points are the same point. What that means, where it shows up, when to autoHeal.'
---

# Tolerance and Validity

Every B-Rep shape has a **tolerance**: a small distance below which the kernel treats two points as the same point and two surfaces as touching. Tolerance is fundamental: pick it too large and your shape's edges stop meeting; pick it too small and floating-point noise produces invalidity. This chapter explains what the tolerance is, how brepjs surfaces it, what `BRepCheck` validates, and when to call `autoHeal`.

## What tolerance means

When the kernel builds a face from a wire, it doesn't require the wire to close _exactly_; it requires it to close within a tolerance ε. Two adjacent edges share a vertex if their endpoints are within ε. Two adjacent faces share an edge if the edge curves are within ε along their length. The kernel uses tolerance everywhere: every operation, every check.

The default tolerance for OpenCascade is `1e-7` (0.0000001 mm). For most parametric parts at millimetre scale this is fine; floating-point precision is around `1e-15` for double-precision numbers, so tolerance can be much smaller than your geometry without running out of headroom. Working in micrometres or below changes the calculus.

## Where tolerance shows up

You typically don't set tolerance; operations propagate it from inputs to outputs, and the kernel adjusts as needed. The places where tolerance is exposed:

### Mesh tolerance

```typescript
import { shape, box } from 'brepjs/quick';

const b = box(10, 10, 10);
const m = shape(b).mesh({ tolerance: 0.01 }); // smaller = more triangles
console.log('Triangles:', m.indices.length / 3);
```

This is the **mesh** tolerance, not the geometric tolerance: how close the triangulation has to be to the exact surface. Smaller tolerance produces denser meshes. The default is reasonable for screen-size rendering; reduce it for closeup zoom or 3D printing.

### Boolean tolerance hints

The kernel will attempt to repair near-coincident geometry up to the larger of the two operand tolerances. If a boolean fails on shapes that "should" intersect but don't (because of slight misalignment), enlarging the tolerance via `autoHeal` is one fix.

### Healing tolerance

```typescript
import { autoHeal, unwrap, importSTEP } from 'brepjs/quick';

declare const stepBlob: Blob;
const imported = unwrap(await importSTEP(stepBlob));
const healed = unwrap(autoHeal(imported, { tolerance: 0.01 }));
void healed;
```

`autoHeal` runs OpenCascade's `ShapeFix_Shape` to close gaps, stitch faces, and fix orientation. The `tolerance` option controls how aggressive the gap-closing is. Default is sane for most CAD imports; increase it for STL or low-precision formats.

## What `BRepCheck` validates

When a primitive returns `ValidSolid`, that means the shape passed `BRepCheck`, OpenCascade's validity checker. Concretely, `BRepCheck` verifies:

| Check                   | Failure means                                                            |
| ----------------------- | ------------------------------------------------------------------------ |
| Wire closure            | The wire doesn't form a closed loop                                      |
| Edge ordering           | Edges in a wire are connected end-to-end                                 |
| Face orientation        | The face's normal is consistent across its surface                       |
| Shell closure           | All edges are shared by exactly two faces (the shell is watertight)      |
| Solid validity          | The solid has at least one outer shell, optional inner shells (cavities) |
| Self-intersection       | No surface crosses itself                                                |
| Tolerance compatibility | Sub-shape tolerances are propagated correctly to parents                 |

Most of these are invariants brepjs's [validity types](./types) encode at compile time: `ClosedWire`, `OrientedFace`, `ManifoldShell`, `ValidSolid`. The runtime check is performed when you build via a smart constructor (`closedWire(w)`, `closedShell(s)`); it asserts that the type-level claim is also true at runtime.

## When shapes go invalid

Three common situations:

### 1. Imported shapes from third-party formats

STEP, IGES, BREP, and especially STL imports often arrive with minor invalidity: gaps between adjacent faces, edges with the wrong precision, vertices that don't quite match. Always run `autoHeal` on imported shapes before using them in operations:

```typescript
import { importSTEP, autoHeal, unwrap } from 'brepjs/quick';

declare const stepBlob: Blob;
const raw = unwrap(await importSTEP(stepBlob));
const ready = unwrap(autoHeal(raw));
void ready;
```

### 2. Operations near coincident geometry

When two faces are _almost_ coplanar but not quite, the boolean kernel can produce slivers: tiny faces that aren't really there. The result still passes `BRepCheck` but is geometrically suspect. Running `autoHeal` afterwards consolidates them.

### 3. Bad parameter choices

A fillet larger than the local edge geometry can support produces an invalid surface. The fillet operation itself fails with `FILLET_TOO_LARGE`; if you persist (e.g. by trying via a different operation path), the result may pass `BRepCheck` while being subtly wrong. Always heed the `Result.error.code`.

## Reading a shape's tolerance

Each shape carries a current tolerance value at the kernel level. brepjs surfaces it through `getShapeTolerance`:

```typescript
import { box, getShapeTolerance } from 'brepjs/quick';

const b = box(10, 10, 10);
console.log('Tolerance:', getShapeTolerance(b)); // ~1e-7
```

For sub-shapes, the tolerance can vary across an edge or face; `getShapeTolerance` returns the maximum.

## `autoHeal` short-circuits valid shapes

A subtle but important behaviour: if you call `autoHeal` on a shape that already passes `BRepCheck`, the function short-circuits and returns the input unchanged, with `report.alreadyValid = true`. **No sew, heal, or fix diagnostics run.** This is a performance optimisation (there's nothing to do), but it means you can't use `autoHeal` to "force a recheck" of a valid shape.

To force a full re-validation:

<!-- @no-test -->

```typescript
import { brepCheck, autoHeal, unwrap } from 'brepjs/quick';

declare const someShape: import('brepjs').Shape3D;
const report = brepCheck(someShape);
if (!report.valid) {
  const healed = unwrap(autoHeal(someShape));
  void healed;
}
```

`brepCheck` runs `BRepCheck` and returns a structured report regardless of validity.

## When tolerance bites

Two scenarios that show up in real apps:

- **Sub-millimetre scale**: working in micrometres with default tolerance `1e-7` (which is now `1e-7` micrometres = `1e-13` of your unit). The kernel may treat distinct points as identical. Switch units to millimetres at construction time and scale at export.
- **Very large parts**: working at kilometre scale stresses tolerance the other way. `1e-7` mm relative to a kilometre is `1e-13` relative precision, fine for IEEE-754, but boolean operations on large coordinate values do lose precision. Translate the part near the origin, operate, translate back.

When in doubt: keep your geometry within ~10⁰ to 10⁴ in your chosen units, and tolerance takes care of itself.

## Next steps

- [Healing & Sewing](../advanced/healing): `autoHeal`, `sew`, manual repair workflows
- [Error Codes](../reference/errors): what `INVALID_SHAPE` and tolerance-related codes mean
- [Boolean Operations](../tasks/booleans): the operation most sensitive to tolerance
