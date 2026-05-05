---
title: Healing & Sewing
---

# Healing & Sewing

Imported shapes — STEP from a designer, IGES from an old part library, STL from a 3D scan — almost never arrive perfectly valid. They have gaps between adjacent faces, edges with the wrong precision, vertices that don't quite match. brepjs's healing operations fix these. Read this chapter before you ship anything that imports STEP from third parties.

## What "healing" actually means

OpenCascade ships a tool called `ShapeFix_Shape` that runs a battery of repair passes:

1. **Fix wires** — close gaps between consecutive edges, drop tiny edges, reorder edges to be connected.
2. **Fix face boundaries** — orient outer wires CCW and inner wires CW; ensure the face's natural orientation matches.
3. **Sew shells** — find adjacent faces with shared boundaries that aren't connected at the topology level, and stitch them together.
4. **Fix tolerances** — propagate sub-shape tolerances correctly to parent shapes.
5. **Remove micro-features** — drop edges, faces, and slivers below a configurable size threshold.

brepjs wraps this as `autoHeal`. There are also lower-level operations — `sew`, `closeShape`, `removeSlivers` — when you need finer control.

## `autoHeal` — the workhorse

```typescript
import { box, autoHeal, unwrap } from 'brepjs/quick';

declare const importedShape: import('brepjs').Shape3D;

const ready = unwrap(autoHeal(importedShape));
console.log('Healed shape ready for operations');
void ready;
void box(1, 1, 1); // keep import live
```

`autoHeal` runs all repair passes with sane defaults, returns `Result<Shape, BrepError>`. Call it on every imported shape before any boolean / fillet / measurement.

### Tuning tolerance

```typescript
import { autoHeal, unwrap } from 'brepjs/quick';

declare const imported: import('brepjs').Shape3D;

// Conservative — only repair gaps below 0.001 mm
const tight = unwrap(autoHeal(imported, { tolerance: 0.001 }));

// Aggressive — close gaps up to 0.05 mm (typical for STEP from low-precision sources)
const loose = unwrap(autoHeal(imported, { tolerance: 0.05 }));
void tight;
void loose;
```

The default tolerance is sane for typical STEP from modern CAD tools. Increase it for STL imports, scanned data, or known-rough sources. If you go too high you'll start fusing details that were supposed to be separate; if too low the heal won't fix the issues you imported with.

### The short-circuit gotcha

If the input is already valid, `autoHeal` does nothing — it returns the input unchanged with `report.alreadyValid = true`:

<!-- @no-test -->

```typescript
import { autoHeal, unwrap, box } from 'brepjs/quick';

const valid = box(10, 10, 10);
const result = unwrap(autoHeal(valid));
// result === valid (the same handle). No sewing, no fixing happened.
console.log('Valid box healed (noop):', valid === result);
```

This is a performance optimization — there's nothing to do — but it means you cannot use `autoHeal` to "force a recheck". For that, see `brepCheck` below.

## `brepCheck` — what's actually wrong

When `autoHeal` doesn't fix what you expected, run `brepCheck` to see the underlying validity report:

<!-- @no-test -->

```typescript
import { brepCheck } from 'brepjs/quick';

declare const someShape: import('brepjs').Shape3D;

const report = brepCheck(someShape);
console.log('Valid:', report.valid);
console.log('Issues:', report.issues);
// report.issues is an array of { kind, location, message }
// kind: 'WIRE_NOT_CLOSED', 'FACE_INTERSECTS_ITSELF', 'EDGE_BAD_CURVE', etc.
```

Each issue points to a sub-shape and a description. Useful for debugging — gives you a concrete reason to send back to the designer or look up in OpenCascade's docs.

## Lower-level operations

### `sew` — connect adjacent faces

When you have a collection of faces that _should_ be a closed shell but aren't (the most common output of low-precision STL imports):

<!-- @no-test -->

```typescript
import { sew, unwrap } from 'brepjs/quick';

declare const facesOrShells: import('brepjs').Shape3D[];

const sewn = unwrap(sew(facesOrShells, { tolerance: 0.01 }));
// sewn is a connected shell (or solid if it's closed).
void sewn;
```

`sew` takes a collection of faces or shells and stitches them where their boundaries are within tolerance. Use it after STL import, after combining custom-built faces, or after any boolean that produced disconnected pieces.

### `closeShape` — make a shell into a solid

If you have a sewn closed shell and need a `ValidSolid`:

<!-- @no-test -->

```typescript
import { closeShape, unwrap } from 'brepjs/quick';

declare const closedShell: import('brepjs').ManifoldShell;

const solid = unwrap(closeShape(closedShell));
void solid;
```

Requires the input to be a `ManifoldShell` — every edge shared by exactly two faces. The runtime check ensures this; the smart constructor `manifoldShell(s)` is the typical way to acquire one.

### `removeSlivers` — clean up tiny features

Booleans on near-coincident geometry sometimes produce sliver faces — degenerate features under a millimetre. `removeSlivers` drops them:

<!-- @no-test -->

```typescript
import { removeSlivers, unwrap } from 'brepjs/quick';

declare const problematicResult: import('brepjs').Shape3D;

const cleaned = unwrap(removeSlivers(problematicResult, { minArea: 0.01 }));
// Faces below minArea are removed; surrounding faces are extended/trimmed to fill in.
void cleaned;
```

Tune `minArea` to your problem. Too aggressive and you lose intentional small features (a 0.5 mm hole). Too conservative and slivers persist.

## Standard healing pipeline

For an unknown imported shape, this is the safe order:

<!-- @no-test -->

```typescript
import { autoHeal, brepCheck, sew, closeShape, removeSlivers, unwrap } from 'brepjs/quick';

declare const imported: import('brepjs').Shape3D;

// 1. Always autoHeal first — handles 90% of cases.
let s = unwrap(autoHeal(imported, { tolerance: 0.01 }));

// 2. If still invalid, check why.
const report = brepCheck(s);
if (!report.valid) {
  // 3. If it's a sewing issue (faces not connected), try sew.
  if (report.issues.some((i) => i.kind === 'SHELL_NOT_CLOSED')) {
    s = unwrap(sew([s], { tolerance: 0.05 }));
  }
  // 4. Slivers from coincident geometry?
  if (report.issues.some((i) => i.kind === 'FACE_TOO_SMALL')) {
    s = unwrap(removeSlivers(s, { minArea: 0.001 }));
  }
}

// 5. Now `s` should be valid for downstream operations.
void s;
```

In practice 95% of imports finish at step 1.

## Exception: don't heal when you shouldn't

There are cases where you want to _preserve_ features that healing would destroy:

- **Embossed text** with very thin features. Healing may erase serifs and dots.
- **Bend reliefs** in sheet metal. Tiny intentional gaps are part of the design.
- **Lattice structures**. Each strut is a thin feature.

For these, set `tolerance` very small (e.g. `1e-5`) or skip healing entirely. `BRepCheck` may still pass even on non-healed input if the geometry is locally valid.

## Performance

Healing is one of the most expensive brepjs operations. For a complex assembly imported from a third-party CAD tool, expect hundreds of milliseconds to several seconds. Two strategies:

- **Heal once, save the healed version**: serialize via `exportBREP` after healing and re-load `importBREP` next time. BREP is faster to parse than STEP and the healed shape doesn't need re-healing.
- **Heal in a worker**: combine with [Web Workers](./workers) so the main thread stays unblocked.

## Summary

- Run `autoHeal` on **every** imported shape before further operations.
- Use `brepCheck` to diagnose what's wrong when `autoHeal` doesn't fix it.
- For finer control, drop down to `sew`, `closeShape`, `removeSlivers`.
- Healing is expensive — cache the healed result, or do it in a worker.

## Next steps

- [Tolerance and Validity](../concepts/tolerance) — what `BRepCheck` actually validates
- [Import & Export](../tasks/import-export) — the operations that create the shapes you'll heal
- [Performance](./performance) — when healing dominates your runtime
