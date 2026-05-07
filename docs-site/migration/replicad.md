---
title: Coming from Replicad
description: 'Coming from Replicad — both wrap OpenCascade. What is the same, what differs, and the search-and-replace map for working code.'
---

# Coming from Replicad

[Replicad](https://replicad.xyz/) and brepjs are siblings: both wrap OpenCascade WASM and target code-first CAD in JavaScript. If you have working Replicad code, switching to brepjs is mostly a search-and-replace plus a couple of pattern shifts. This chapter is the cheat sheet.

## What's the same

- The kernel is OpenCascade in both libraries — same precision, same tolerances, same booleans, same fillets.
- 2D drawing → sketch → extrude is the canonical shape-building flow.
- STEP / STL / glTF export.
- Web-first, ESM-first, browser-friendly.

## What's different

- **Branded types and validity types.** brepjs distinguishes `Edge`, `Wire`, `Face` at the type level, and stamps `ClosedWire`, `OrientedFace`, `ValidSolid` on shapes proven to satisfy invariants. Replicad treats most shapes as a single `Shape` type.
- **`Result<T, BrepError>`** for fallible operations. brepjs returns `Result` from booleans, fillets, imports, exports — Replicad throws.
- **Two API styles.** Functional (`fuse(a, b)`, `fillet(s, edges, r)`) is the canonical surface; the fluent `shape()` wrapper provides a chainable view that matches Replicad's `.fuse().fillet()` style.
- **Pluggable kernel.** brepjs supports OpenCascade and brepkit (Rust-based) behind one API; Replicad is OpenCascade-only.

## Function-by-function map

### Primitives

| Replicad               | brepjs                             |
| ---------------------- | ---------------------------------- |
| `makeBox(w, d, h)`     | `box(w, d, h)`                     |
| `makeCylinder(r, h)`   | `cylinder(r, h)`                   |
| `makeSphere(r)`        | `sphere(r)`                        |
| `makeCone(r1, r2, h)`  | `cone(r1, r2, h)`                  |
| `makeBaseBox(w, d, h)` | `box(w, d, h, { centered: true })` |

### 2D drawing

| Replicad                        | brepjs                          |
| ------------------------------- | ------------------------------- |
| `drawCircle(r)`                 | `drawCircle(r)`                 |
| `drawRectangle(w, h)`           | `drawRectangle(w, h)`           |
| `drawRoundedRectangle(w, h, r)` | `drawRoundedRectangle(w, h, r)` |
| `drawing.cut(other)`            | `drawingCut(a, b)`              |
| `drawing.fuse(other)`           | `drawingFuse(a, b)`             |
| `drawing.fillet(r)`             | `drawingFillet(d, r)`           |

### Sketching

| Replicad                                | brepjs                                  |
| --------------------------------------- | --------------------------------------- |
| `sketchCircle(r)`                       | `sketchCircle(r)`                       |
| `sketchRectangle(w, h)`                 | `sketchRectangle(w, h)`                 |
| `new Sketcher('XY').movePointerTo(...)` | `new Sketcher('XY').movePointerTo(...)` |
| `sketcher.lineTo([x, y])`               | `sketcher.lineTo([x, y])`               |
| `sketcher.tangentArcTo([x, y])`         | `sketcher.tangentArcTo([x, y])`         |
| `sketcher.close()`                      | `sketcher.close()`                      |
| `sketcher.extrude(h)`                   | `sketcher.extrude(h)`                   |
| `drawing.sketchOnPlane('XY')`           | `drawingToSketchOnPlane(d, 'XY')`       |

### Booleans

| Replicad                      | brepjs                                                     |
| ----------------------------- | ---------------------------------------------------------- |
| `a.fuse(b)` (throws on error) | `unwrap(fuse(a, b))` _or_ `shape(a).fuse(b).val`           |
| `a.cut(b)`                    | `unwrap(cut(a, b))` _or_ `shape(a).cut(b).val`             |
| `a.intersect(b)`              | `unwrap(intersect(a, b))` _or_ `shape(a).intersect(b).val` |

### Refinement

| Replicad                       | brepjs                                               |
| ------------------------------ | ---------------------------------------------------- |
| `shape.fillet(r, edgeFinder)`  | `shape(s).fillet((e) => e.inDirection('Z'), r).val`  |
| `shape.chamfer(d, edgeFinder)` | `shape(s).chamfer((e) => e.inDirection('Z'), d).val` |
| `shape.shell(t, faceFinder)`   | `shape(s).shell((f) => f.inDirection('Z'), t).val`   |

### Finders

| Replicad                                  | brepjs                                |
| ----------------------------------------- | ------------------------------------- |
| `new EdgeFinder().inDirection('Z')`       | `edgeFinder().inDirection('Z')`       |
| `new FaceFinder().ofSurfaceType('PLANE')` | `faceFinder().ofSurfaceType('PLANE')` |
| `.find(shape)`                            | `.findAll(shape)` (returns array)     |

### Export / import

| Replicad                           | brepjs                                           |
| ---------------------------------- | ------------------------------------------------ |
| `shape.toSTEP()` (returns Promise) | `unwrap(exportSTEP(s))` (returns `Result<Blob>`) |
| `shape.toSTL()`                    | `unwrap(exportSTL(s))`                           |
| `importSTEP(blob)`                 | `unwrap(await importSTEP(blob))`                 |

## Two pattern shifts to internalize

### Shift 1: `Result` instead of throws

Replicad:

<!-- @no-test -->

```typescript
import { makeBox, makeCylinder } from 'replicad';

try {
  const part = makeBox(20, 20, 20).cut(makeCylinder(5, 25));
  // …
} catch (e) {
  console.error('Cut failed', e);
}
```

brepjs:

```typescript
import { box, cylinder, cut, isOk } from 'brepjs/quick';

const result = cut(box(20, 20, 20), cylinder(5, 25));
if (isOk(result)) {
  console.log('Cut succeeded');
} else {
  console.error('Cut failed:', result.error.code, result.error.suggestion);
}
```

Or use the wrapper to keep the throwing style:

```typescript
import { shape, box, cylinder, BrepWrapperError } from 'brepjs/quick';

try {
  const part = shape(box(20, 20, 20)).cut(cylinder(5, 25)).val;
  void part;
} catch (e) {
  if (e instanceof BrepWrapperError) {
    console.error('Cut failed:', e.code, e.suggestion);
  }
}
```

### Shift 2: type guards on imported shapes

Replicad:

<!-- @no-test -->

```typescript
import { Sketcher } from 'replicad';

const wire = new Sketcher('XY').movePointerTo([0, 0]).lineTo([10, 0]).lineTo([10, 10]).close();
const face = wire.face();
const solid = face.extrude(5);
```

brepjs:

```typescript
import { Sketcher } from 'brepjs/quick';

const part = new Sketcher('XY')
  .movePointerTo([0, 0])
  .lineTo([10, 0])
  .lineTo([10, 10])
  .close()
  .extrude(5);

export default part;
```

The chain is similar but each step's input type is checked at compile time. `extrude` requires `OrientedFace`, which `close()` guarantees by construction. If you build a wire and try to skip `close()`, the compiler catches it.

For shapes from outside (STEP imports, deserialized data), use the type guards:

<!-- @no-test -->

```typescript
import { isClosedWire, face, unwrap } from 'brepjs/quick';

declare const someWire: import('brepjs').Wire;

if (isClosedWire(someWire)) {
  const f = unwrap(face(someWire)); // Now type-safe.
  void f;
}
```

## What you'll miss (that we'll add)

- **Replicad's workbench.** brepjs has [a similar playground](/playground). Same idea, slightly different UI.
- **Some operation names.** `revolution` → `revolve`. `loft` is the same. `pipe` → `sweep`.
- **Replicad's higher-order helpers.** Some niche helpers (e.g. `genericSweep`) don't have direct brepjs equivalents — usually composing two operations covers the case.

## When to keep Replicad

If you're not running into Replicad's pain points (silent failures, runtime topology errors), there's no urgent reason to switch. brepjs's pitch is: **type safety catches a class of bugs Replicad ships to runtime**. If your codebase has had several "this should not have happened" issues from boolean failures or invalid wires reaching `extrude`, brepjs's branded types will catch them.

## Migration approach

For a moderate codebase:

1. Add brepjs alongside Replicad. They can coexist — different imports.
2. Pick one module (one part / one feature) and migrate it. Use the function map above.
3. Embrace `Result` — change error-handling sites to use `isOk` or the wrapper.
4. Add validity-type assertions at boundaries (where shapes enter/leave your code).
5. Repeat for the next module.

A search-and-replace (replacing Replicad's class methods with brepjs's functional forms) gets you most of the way; the type system catches the rest.

## Next steps

- [Cheat Sheet](../getting-started/cheat-sheet) — the brepjs API at a glance
- [Result and Errors](../concepts/result) — handling fallible operations
- [Types That Prove Geometry Is Valid](../concepts/types) — the differentiator
