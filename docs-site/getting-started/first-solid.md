---
title: Your First Solid
description: 'Build a 30×20×10 mm block with a hole, fillet the vertical edges, export to STEP — six type-checked operations end to end.'
---

# Your First Solid

Build a part from scratch: a 30×20×10 mm block with a 5 mm hole, vertical edges filleted, exported to STEP. Six operations, all type-checked, runnable in the playground.

## The full program

```typescript
import {
  box,
  cylinder,
  cut,
  fillet,
  edgeFinder,
  exportSTEP,
  measureVolume,
  unwrap,
} from 'brepjs/quick';

const block = box(30, 20, 10);
const hole = cylinder(5, 15, { at: [15, 10, -2] });

const drilled = unwrap(cut(block, hole));
const verticalEdges = edgeFinder().inDirection('Z').findAll(drilled);
const part = unwrap(fillet(drilled, verticalEdges, 1.5));

console.log('Volume:', measureVolume(part).toFixed(2), 'mm³');

const step = unwrap(exportSTEP(part));
console.log('STEP file size:', step.size, 'bytes');

export default part;
```

That is the canonical brepjs flow: primitives → booleans → query → refinement → measurement → export.

## What just happened

### Step 1: primitives

```typescript
import { box, cylinder } from 'brepjs/quick';

const block = box(30, 20, 10);
const hole = cylinder(5, 15, { at: [15, 10, -2] });
```

`box(width, depth, height)` returns a `ValidSolid` — a 30×20×10 mm rectangular solid centred at the origin's lower corner. `cylinder(radius, height, { at })` returns a `ValidSolid` 5 mm radius, 15 mm tall, with its base centre at `[15, 10, -2]` so it pokes through the block.

The `at` option translates the primitive at construction time. You can also `translate(cylinder(5, 15), [15, 10, -2])` after the fact — the result is identical.

### Step 2: boolean

```typescript
import { box, cylinder, cut, unwrap } from 'brepjs/quick';
const drilled = unwrap(cut(box(30, 20, 10), cylinder(5, 15, { at: [15, 10, -2] })));
```

`cut(a, b)` removes `b` from `a`. It returns `Result<Shape3D, BrepError>` — the operation can fail, for instance if `b` doesn't intersect `a`. `unwrap()` extracts the value or throws on error; in production code you'd use `isOk()` or `match()` instead. See [Result and Errors](../concepts/result).

### Step 3: query

```typescript
import { box, edgeFinder } from 'brepjs/quick';
const verticalEdges = edgeFinder()
  .inDirection('Z')
  .findAll(box(30, 20, 10));
```

Finders are how you select features after the fact. `edgeFinder()` starts a query, `.inDirection('Z')` filters to edges aligned with the Z axis, `.findAll(shape)` runs it. Returns an array of `Edge` handles — empty if nothing matched.

[Finders & Queries](../tasks/finders) covers the full filter vocabulary.

### Step 4: refinement

```typescript
import { box, cylinder, cut, fillet, edgeFinder, unwrap } from 'brepjs/quick';
const drilled = unwrap(cut(box(30, 20, 10), cylinder(5, 15, { at: [15, 10, -2] })));
const part = unwrap(fillet(drilled, edgeFinder().inDirection('Z').findAll(drilled), 1.5));
```

`fillet(shape, edges, radius)` rounds the listed edges. Like all fallible operations it returns `Result`. The same pattern works for `chamfer` (bevels) and `shell` (hollows out a solid by removing faces).

### Step 5: measure

```typescript
import { box, measureVolume } from 'brepjs/quick';
console.log('Volume:', measureVolume(box(10, 10, 10)).toFixed(2), 'mm³');
```

Measurement functions never fail on valid shapes — they return plain numbers. `measureVolume`, `measureArea`, `measureLength` are the most common; see [Measurement](../tasks/measurement) for the full set.

### Step 6: export

```typescript
import { box, exportSTEP, unwrap } from 'brepjs/quick';
const step = unwrap(exportSTEP(box(10, 10, 10)));
```

`exportSTEP` returns `Result<Blob>`. The blob is a STEP file ready to save (in Node, write to disk; in the browser, trigger a download via an `<a>` tag). brepjs ships exporters for STEP, STL, BREP, IGES, glTF, DXF, 3MF, OBJ, and SVG — see [Import & Export](../tasks/import-export).

## The fluent equivalent

The same program with the `shape()` wrapper:

```typescript
import { box, cylinder, shape, exportSTEP, unwrap } from 'brepjs/quick';

const part = shape(box(30, 20, 10))
  .cut(cylinder(5, 15, { at: [15, 10, -2] }))
  .fillet((e) => e.inDirection('Z'), 1.5).val;

console.log('Volume:', shape(part).volume().toFixed(2), 'mm³');
const step = unwrap(exportSTEP(part));

export default part;
```

The wrapper auto-unwraps `Result`s and throws `BrepWrapperError` on failure. Each operation returns a typed wrapper (`Wrapped3D`, `WrappedFace`, etc.) so `.fillet`, `.shell`, `.translate`, `.volume` are all available without separate imports. Use `.val` at the end to extract the underlying shape.

The functional API and the wrapper produce the same geometry. Pick whichever feels right — the [Cheat Sheet](./cheat-sheet) shows both side by side.

## Common variations

### Drill multiple holes

```typescript
import { box, cylinder, fuseAll, cut, unwrap } from 'brepjs/quick';

const block = box(40, 40, 10);
const holes = unwrap(
  fuseAll([
    cylinder(2, 12, { at: [10, 10, -1] }),
    cylinder(2, 12, { at: [30, 10, -1] }),
    cylinder(2, 12, { at: [10, 30, -1] }),
    cylinder(2, 12, { at: [30, 30, -1] }),
  ])
);
const part = unwrap(cut(block, holes));

export default part;
```

Boolean-fuse the holes first, then cut once. Three booleans become two — faster and avoids a class of failure modes when the cuts overlap.

### Sketch-then-extrude profiles

```typescript
import { sketchRoundedRectangle } from 'brepjs/quick';

const part = sketchRoundedRectangle(40, 30, 5).extrude(15);

export default part;
```

For shapes you cannot build from primitive booleans, sketch the cross-section in 2D and extrude. See [2D Sketching](../tasks/sketching).

### Save the STEP file (Node)

<!-- @no-test -->

```typescript
import { writeFileSync } from 'node:fs';
import { box, exportSTEP, unwrap } from 'brepjs/quick';

const part = box(30, 20, 10);
const step = unwrap(exportSTEP(part));
writeFileSync('part.step', new Uint8Array(await step.arrayBuffer()));
```

In the browser, trigger a download:

<!-- @no-test -->

```typescript
declare const step: Blob;
const url = URL.createObjectURL(step);
const a = document.createElement('a');
a.href = url;
a.download = 'part.step';
a.click();
URL.revokeObjectURL(url);
```

## When operations fail

The two ways failure surfaces:

1. **Functional API**: `Result<T, BrepError>`. Check with `isOk(result)` and read `result.error.code` / `result.error.suggestion`.
2. **Wrapper**: a thrown `BrepWrapperError` carrying the same fields.

The most common failures and their typical causes:

| Failure                  | Likely cause                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| `BOOLEAN_NO_OVERLAP`     | The two operands don't share volume. `cut(a, b)` requires `b` ⊆ `a` (at least partially).           |
| `FILLET_TOO_LARGE`       | The radius is bigger than the local edge geometry can support. Try a smaller radius or fewer edges. |
| `INVALID_SHAPE`          | One of your inputs failed `BRepCheck`. Run `autoHeal(shape)` first.                                 |
| `KERNEL_NOT_INITIALIZED` | You called a brepjs function before `init()` / `initFromOC` resolved.                               |

[Error Codes](../reference/errors) lists every code with recovery patterns.

## Next steps

- [Cheat Sheet](./cheat-sheet) — single-page reference for the full API
- [Boolean Operations](../tasks/booleans) — fuse, cut, intersect, and the failure modes
- [Fillets & Chamfers](../tasks/fillets) — when fillets fail and how to fix them
- [Memory Management](../advanced/memory) — `using` and DisposalScope for long-running apps
