---
title: Fillets & Chamfers
---

# Fillets & Chamfers

A **fillet** rounds an edge with a circular arc. A **chamfer** bevels it with a flat. Both are edge-refinement operations: pick the edges, pick the size, get a new shape. brepjs ships them as fallible operations because they are — fillets fail more often than booleans, and the failure modes are surprising.

## The basic shape

```typescript
import { box, edgeFinder, fillet, chamfer, unwrap } from 'brepjs/quick';

const b = box(30, 20, 10);
const verticals = edgeFinder().inDirection('Z').findAll(b);

const filleted = unwrap(fillet(b, verticals, 2));
const beveled = unwrap(chamfer(b, verticals, 1));

console.log('Filleted vertical edges with 2 mm radius');
void beveled;

export default filleted;
```

`fillet(shape, edges, radius)` and `chamfer(shape, edges, distance)`. Both return `Result<Shape3D, BrepError>`.

## Selecting edges

You almost never want to fillet _every_ edge. Use a finder to pick the ones you mean:

```typescript
import { box, edgeFinder, fillet, unwrap } from 'brepjs/quick';

const b = box(30, 20, 10);

// All vertical edges
const verticals = edgeFinder().inDirection('Z').findAll(b);

// All edges of a specific length
const longEdges = edgeFinder().withLength({ min: 25 }).findAll(b);

// Specific curve type
const arcEdges = edgeFinder().ofCurveType('CIRCLE').findAll(b);

// Combine filters
const verticalsLongerThan10 = edgeFinder().inDirection('Z').withLength({ min: 10 }).findAll(b);

const filleted = unwrap(fillet(b, verticals, 2));
console.log('Filleted', verticals.length, 'edges');
console.log({
  longEdges: longEdges.length,
  arcEdges: arcEdges.length,
  verticalsLongerThan10: verticalsLongerThan10.length,
});
```

`edgeFinder()` filters chain — see [Finders & Queries](./finders) for the full vocabulary.

## With the fluent wrapper

The wrapper accepts a finder callback inline:

```typescript
import { shape, box } from 'brepjs/quick';

const filleted = shape(box(30, 20, 10))
  .fillet((e) => e.inDirection('Z'), 2)
  .chamfer((e) => e.inDirection('X'), 0.5).val;

export default filleted;
```

The callback receives an `EdgeFinder` you chain filters on. The wrapper internally calls `findAll` and passes the result to the kernel.

## Fillet all edges

When you really do want every edge filleted (a soft-blob aesthetic):

```typescript
import { shape, box } from 'brepjs/quick';

const blob = shape(box(20, 20, 20)).fillet(2).val;
console.log('All edges filleted');

export default blob;
```

`shape(s).fillet(radius)` (no finder) applies to every edge. The functional equivalent: `fillet(s, edgeFinder().findAll(s), radius)`.

## Variable-radius fillets

When you want different radii on different edges:

```typescript
import { box, edgeFinder, fillet, unwrap } from 'brepjs/quick';

let b: import('brepjs').Shape3D = box(30, 20, 10);
const verticals = edgeFinder().inDirection('Z').findAll(b);
const horizontals = edgeFinder().inDirection('X').findAll(b);

b = unwrap(fillet(b, verticals, 3));
// Re-find on the new shape — old handles refer to the old shape.
const newHorizontals = edgeFinder().inDirection('X').findAll(b);
b = unwrap(fillet(b, newHorizontals, 1));

console.log('Verticals at r=3, horizontals at r=1');
```

Edge handles are bound to the shape they were found on. Filleting consumes the input shape and returns a new one — old handles no longer apply. Always re-find after each operation.

## Failure modes

### `FILLET_TOO_LARGE`

The radius is bigger than the geometry around the edge can support. A box 10mm thick cannot have a 6mm fillet on its corner — the fillet would leave no flat region. The kernel detects this:

```typescript
import { box, edgeFinder, fillet, isOk } from 'brepjs/quick';

const thin = box(10, 10, 1); // 1mm thick
const result = fillet(thin, edgeFinder().findAll(thin), 0.6); // ~larger than safe
if (!isOk(result) && result.error.code === 'FILLET_TOO_LARGE') {
  console.warn(result.error.suggestion);
}
```

Fix: smaller radius, or fewer edges.

### `FILLET_INVALID_EDGE`

The selected edge has a curvature or geometry the fillet algorithm can't handle. Common with imported geometry — sharp creases, non-tangent meeting edges, edges shorter than the fillet radius.

Workarounds:

- Heal the input first (`autoHeal`)
- Skip that edge (refine the finder)
- Use `chamfer` instead — it has fewer requirements

### `FILLET_AMBIGUOUS_PROPAGATION`

When you fillet an edge that meets multiple other edges at a vertex, the fillet has to decide whether to propagate to those edges. Sometimes the answer is ambiguous and OpenCascade refuses. Workaround: select all the edges that should propagate explicitly, in the same `fillet()` call.

## Order matters

Two ways to fillet several groups of edges, only one works reliably:

```typescript
// WRONG — fillet operations interact in unobvious ways
import { box, edgeFinder, fillet, unwrap } from 'brepjs/quick';
let b: import('brepjs').Shape3D = box(20, 20, 20);
b = unwrap(fillet(b, edgeFinder().inDirection('Z').findAll(b), 3));
// The edges in 'X' have moved/transformed — re-find:
b = unwrap(fillet(b, edgeFinder().inDirection('X').findAll(b), 3));
console.log('Filleted in two passes');
```

The two-pass version works only because we re-find edges after the first pass. The simpler approach: fillet all the edges you want at once, with the same radius:

```typescript
import { box, edgeFinder, fillet, unwrap } from 'brepjs/quick';

const b = box(20, 20, 20);
const allTargetEdges = [
  ...edgeFinder().inDirection('Z').findAll(b),
  ...edgeFinder().inDirection('X').findAll(b),
];
const filleted = unwrap(fillet(b, allTargetEdges, 3));
console.log('One-pass fillet');

export default filleted;
```

For different radii, two passes are unavoidable — just re-find edges after each.

## Tip: chamfer is more forgiving

Chamfer fails less often than fillet. When fillet fails on imported geometry, try chamfer with the same distance — it bevels rather than blends and tolerates more curvature variation.

```typescript
import { box, edgeFinder, fillet, chamfer, isOk, unwrap } from 'brepjs/quick';

const part = box(20, 20, 20);
const edges = edgeFinder().inDirection('Z').findAll(part);

const filleted = fillet(part, edges, 1.5);
const refined = isOk(filleted) ? filleted.value : unwrap(chamfer(part, edges, 1.5)); // fallback
console.log('Refined edges (fillet-or-chamfer)');

export default refined;
```

A `fillet ?? chamfer` fallback can hide some classes of import-related failures without sacrificing visual quality.

## Common recipes

### Soften every external corner

```typescript
import { shape, box, cylinder } from 'brepjs/quick';

const drilled = shape(box(40, 30, 15))
  .cut(cylinder(5, 20, { at: [20, 15, -3] }))
  .fillet(1.5).val;

export default drilled;
```

A small uniform fillet (1–2 mm on a 30 mm part) reads as "manufactured to spec" without becoming the dominant visual feature.

### Round only the rim of a bowl

```typescript
import { shape, sketchCircle, edgeFinder } from 'brepjs/quick';

const bowl = sketchCircle(30).extrude(40);
const rounded = shape(bowl)
  .shell((f) => f.inDirection('Z'), 2) // hollow it
  .fillet((e) => e.inDirection('Z').withLength({ max: 200 }), 2).val;

export default rounded;
```

Find the top circular edge with a length filter; fillet only that.

### Add manufacturing draft

`chamfer` with very small distances simulates the slight bevel that injection-moulded parts get to release from the mould:

```typescript
import { shape, box } from 'brepjs/quick';

const part = shape(box(30, 20, 10)).chamfer((e) => e.inDirection('Z'), 0.3).val;

export default part;
```

## Next steps

- [Finders & Queries](./finders) — selecting the exact edges you want
- [Healing & Sewing](../advanced/healing) — when fillets fail on imports
- [Boolean Operations](./booleans) — the operation that creates the edges fillets refine
