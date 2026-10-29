---
title: Healing & Sewing
description: 'Imported STEP and IGES rarely arrive perfectly valid. autoHeal, sew, and the diagnostics that find gaps before you build on top.'
---

# Healing & Sewing

Imported shapes (STEP from a designer, IGES from an old part library, STL from a 3D scan) almost never arrive perfectly valid. They have gaps between adjacent faces, edges with the wrong precision, vertices that don't quite match. brepjs's healing operations fix these. Read this chapter before you ship anything that imports STEP from third parties.

## What "healing" actually means

OpenCascade ships a tool called `ShapeFix_Shape` that runs a battery of repair passes:

1. **Fix wires**: close gaps between consecutive edges, drop tiny edges, reorder edges to be connected.
2. **Fix face boundaries**: orient outer wires CCW and inner wires CW; ensure the face's natural orientation matches.
3. **Sew shells**: find adjacent faces with shared boundaries that aren't connected at the topology level, and stitch them together.
4. **Fix tolerances**: propagate sub-shape tolerances correctly to parent shapes.
5. **Remove micro-features**: drop edges, faces, and slivers below a configurable size threshold.

brepjs wraps this as `fixShape`; `autoHeal` runs the shape-level fixers (`ShapeFix_Solid`, `ShapeFix_Face`, `ShapeFix_Wire`) plus optional sewing. There are also lower-level operations (`sewShells`, `solidFromShell`) when you need finer control.

## `autoHeal`: the workhorse

```typescript
import { box, autoHeal, unwrap } from 'brepjs/quick';

declare const importedShape: import('brepjs').Shape3D;

const { shape: ready, report } = unwrap(autoHeal(importedShape));
console.log('Healed shape ready for operations:', report.isValid);
void ready;
void box(1, 1, 1); // keep import live
```

`autoHeal` runs all repair passes with sane defaults, returns `Result<{ shape, report }, BrepError>`. Call it on every imported shape before any boolean / fillet / measurement.

### Tuning tolerance

```typescript
import { autoHeal, unwrap } from 'brepjs/quick';

declare const imported: import('brepjs').Shape3D;

// Conservative - only sew gaps below 0.001 mm
const tight = unwrap(autoHeal(imported, { sewTolerance: 0.001 })).shape;

// Aggressive - close gaps up to 0.05 mm (typical for STEP from low-precision sources)
const loose = unwrap(autoHeal(imported, { sewTolerance: 0.05 })).shape;
void tight;
void loose;
```

Without `sewTolerance`, `autoHeal` skips the sewing step. Pass it for STL imports, scanned data, or known-rough sources. If you go too high you'll start fusing details that were supposed to be separate; if too low the heal won't fix the issues you imported with.

### The short-circuit gotcha

If the input is already valid, `autoHeal` does nothing; it returns the input unchanged with `report.alreadyValid = true`:

<!-- @no-test -->

```typescript
import { autoHeal, unwrap, box } from 'brepjs/quick';

const valid = box(10, 10, 10);
const result = unwrap(autoHeal(valid));
// result.shape === valid (the same handle). No sewing, no fixing happened.
console.log('Valid box healed (noop):', valid === result.shape, result.report.alreadyValid);
```

This is a performance optimization (there's nothing to do), but it means you cannot use `autoHeal` to "force a recheck". For that, see `isValid` below.

## `isValid` and the healing report: what's actually wrong

When `autoHeal` doesn't fix what you expected, check `isValid` and read the healing report:

<!-- @no-test -->

```typescript
import { autoHeal, isValid, unwrap } from 'brepjs/quick';

declare const someShape: import('brepjs').Shape3D;

console.log('Valid:', isValid(someShape));
const { report } = unwrap(autoHeal(someShape));
console.log('Valid after heal:', report.isValid);
console.log('Steps:', report.steps);
// report.diagnostics is an array of { name, attempted, succeeded, detail? }
// name: 'sew', 'healSolid', 'healFace', 'healWire', 'finalValidation', etc.
```

`isValid` runs the kernel's validity check (`BRepCheck_Analyzer` on OCCT) and returns a boolean. The report records which repair steps ran and whether each one succeeded.

## Lower-level operations

### `sewShells`: connect adjacent faces

When you have a collection of faces that _should_ be a closed shell but aren't (the most common output of low-precision STL imports):

<!-- @no-test -->

```typescript
import { sewShells, unwrap } from 'brepjs/quick';

declare const facesOrShells: Array<import('brepjs').Face | import('brepjs').Shell>;

const sewn = unwrap(sewShells(facesOrShells));
// sewn is a connected shell; Err if the pieces don't weld into one.
void sewn;
```

`sewShells` takes a collection of faces or shells and stitches them where their boundaries meet. Use it after STL import, after combining custom-built faces, or after any boolean that produced disconnected pieces. To sew with an explicit tolerance, pass `sewTolerance` to `autoHeal`.

### `solidFromShell`: make a shell into a solid

If you have a sewn closed shell and need a `ValidSolid`:

<!-- @no-test -->

```typescript
import { solidFromShell, unwrap } from 'brepjs/quick';

declare const closedShell: import('brepjs').Shell;

const solid = unwrap(solidFromShell(closedShell));
void solid;
```

The shell must be closed: every edge shared by exactly two faces. `solidFromShell` returns an `Err` if the result is not a solid or fails the validity check.

## Standard healing pipeline

For an unknown imported shape, this is the safe order:

<!-- @no-test -->

```typescript
import {
  autoHeal,
  isValid,
  isShape3D,
  sewShells,
  solidFromShell,
  getFaces,
  unwrap,
} from 'brepjs/quick';

declare const imported: import('brepjs').Shape3D;

// 1. Always autoHeal first - handles 90% of cases.
let s = unwrap(autoHeal(imported, { sewTolerance: 0.01 })).shape;

// 2. If still invalid, the faces may not be connected.
if (!isValid(s) && isShape3D(s)) {
  // 3. Sew the faces into one shell and close it into a solid.
  const shell = unwrap(sewShells(getFaces(s)));
  s = unwrap(solidFromShell(shell));
}

// 4. Now `s` should be valid for downstream operations.
void s;
```

In practice 95% of imports finish at step 1.

## Exception: don't heal when you shouldn't

There are cases where you want to _preserve_ features that healing would destroy:

- **Embossed text** with very thin features. Healing may erase serifs and dots.
- **Bend reliefs** in sheet metal. Tiny intentional gaps are part of the design.
- **Lattice structures**. Each strut is a thin feature.

For these, set `sewTolerance` very small (e.g. `1e-5`) or skip healing entirely. `BRepCheck` may still pass even on non-healed input if the geometry is locally valid.

## Performance

Healing is one of the most expensive brepjs operations. For a complex assembly imported from a third-party CAD tool, expect hundreds of milliseconds to several seconds. Two strategies:

- **Heal once, save the healed version**: serialize via `toBREP` after healing and re-load with `fromBREP` next time. BREP is faster to parse than STEP and the healed shape doesn't need re-healing.
- **Heal in a worker**: combine with [Web Workers](./workers) so the main thread stays unblocked.

## Summary

- Run `autoHeal` on **every** imported shape before further operations.
- Use `isValid` and the `autoHeal` report to diagnose what's wrong when `autoHeal` doesn't fix it.
- For finer control, drop down to `sewShells`, `solidFromShell`, `fixShape`.
- Healing is expensive; cache the healed result, or do it in a worker.

## Next steps

- [Tolerance and Validity](../concepts/tolerance): what `BRepCheck` actually validates
- [Import & Export](../tasks/import-export): the operations that create the shapes you'll heal
- [Performance](./performance): when healing dominates your runtime
