# Examples

Workflow examples demonstrating brepjs capabilities, ordered from beginner to advanced. Each example builds on patterns proven in production CAD applications (gridfinity bin generation).

## Running Examples

All examples auto-initialize the WASM kernel via `_setup.ts` — just run them directly:

```bash
# Install dependencies (from the repo root)
npm install

# Run any example
npm run example examples/mounting-block.ts
npm run example examples/pen-cup.ts
npm run example examples/compartment-tray.ts
```

Each example imports `'./_setup.js'` as its first import, which calls `opencascade()` and `initFromOC()` via top-level await. You don't need to write any initialization code yourself.

## Beginner

### [mounting-block.ts](./mounting-block.ts) — Game Die

A six-sided die: rounded cube with spherical dot indentations on all six faces. Demonstrates batch boolean cuts with `cutAll`.

**Concepts:** `box`, `sphere`, `fillet`, `cutAll`, `shape()` builder

## Intermediate

### [shelf-bracket.ts](./shelf-bracket.ts) — Spur Gear

A spur gear with teeth around the perimeter and a center bore. Shows circular patterning with `rotate` and batch fusion with `fuseAll`.

**Concepts:** `cylinder`, `box`, `rotate`, `fuseAll`, `cut`

### [pen-cup.ts](./pen-cup.ts) — Pen Cup

A container with rounded corners, hollowed using the shell operation. Mirrors the gridfinity bin pattern: sketch → extrude → shell → fillet.

**Concepts:** `sketchRoundedRectangle`, `.extrude()`, `shell`, `faceFinder`, `fillet`

## Advanced

### [lofted-vase.ts](./lofted-vase.ts) — Lofted Vase

A vase shaped by lofting through circular cross-sections at different heights, then shelled to thin walls. Uses the same multi-section loft technique as gridfinity socket profiles.

**Concepts:** `sketchCircle`, `.loftWith()`, `shell`, `faceFinder`

### [compartment-tray.ts](./compartment-tray.ts) — Compartment Tray

A storage tray with dividers and drain holes. Demonstrates the full gridfinity pattern: extrude → shell → batch fuse dividers (`fuseAll`) → clip to inner boundary (`intersect`) → batch cut holes (`cutAll`).

**Concepts:** `sketchRoundedRectangle`, `shell`, `fuseAll`, `intersect`, `cutAll`, `faceFinder`

## Common Patterns

### Error Handling

All fallible operations return `Result<T, BrepError>`:

```typescript
import { fuse, isOk, unwrap } from 'brepjs';

const result = fuse(shape1, shape2);

// Check before using
if (isOk(result)) {
  const fused = result.value;
}

// Or unwrap (throws on error)
const fused = unwrap(result);
```

### shape() Builder

The `shape()` wrapper provides fluent chaining that auto-unwraps results:

```typescript
import { box, cylinder, shape } from 'brepjs';

const result = shape(box(60, 40, 12))
  .cut(cylinder(3, 20))
  .fillet(2).val;
```

### Shell Pattern (from Gridfinity)

The shell operation hollows a solid by removing specified faces:

```typescript
import { sketchRoundedRectangle, shell, faceFinder, unwrap } from 'brepjs';

let solid = sketchRoundedRectangle(50, 35, 8).extrude(80);
const topFaces = faceFinder().parallelTo('Z').atDistance(80, [0, 0, 0]).findAll(solid);
solid = unwrap(shell(solid, topFaces, 2)); // 2mm walls
```

### Batch Booleans (from Gridfinity)

Use `fuseAll` and `cutAll` for multiple operations in a single pass:

```typescript
import { fuseAll, cutAll, unwrap } from 'brepjs';

const combined = unwrap(fuseAll([base, wall1, wall2, wall3]));
const withHoles = unwrap(cutAll(combined, [hole1, hole2, hole3]));
```

### Clipping to Rounded Boundaries (from Gridfinity)

Use `intersect` to trim features that would protrude through curved walls:

```typescript
import { fuseAll, intersect, sketchRoundedRectangle, unwrap } from 'brepjs';

const dividers = unwrap(fuseAll([wall1, wall2]));
const innerBound = sketchRoundedRectangle(innerW, innerD, innerR).extrude(h);
const clipped = unwrap(intersect(dividers, innerBound));
```

## Requirements

- Node.js 24+
- brepjs and brepjs-opencascade packages installed
