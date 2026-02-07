# Getting Started

> **Want the fastest possible start?** See [Zero to Shape](./zero-to-shape.md) — create your first shape in 60 seconds with `brepjs/quick`.

This guide walks you through creating your first 3D part with brepjs — from installation to exported STEP file.

## Prerequisites

- Node.js 20+ (or a modern browser with WASM support)
- TypeScript 5.9+ (recommended, for `using` syntax and strict branded types)

## Step 1: Install

```bash
npm install brepjs brepjs-opencascade
```

`brepjs` is the API layer. `brepjs-opencascade` provides the OpenCascade WASM kernel that does the actual geometry computation.

## Step 2: Initialize the WASM kernel

Before calling any brepjs function, you must initialize the OpenCascade kernel. This is an async operation that loads and compiles the WASM module:

```typescript
import opencascade from 'brepjs-opencascade';
import { initFromOC } from 'brepjs';

const oc = await opencascade();
initFromOC(oc);
```

This only needs to happen once per application lifetime. After `initFromOC()`, all brepjs functions are ready to use.

## Step 3: Create a shape

```typescript
import { makeBox } from 'brepjs';

const box = makeBox([0, 0, 0], [30, 20, 10]);
```

`makeBox` takes two corner points `[x, y, z]` and returns a `Solid` — a branded type representing a watertight 3D shape. Other primitives work the same way:

```typescript
import { makeCylinder, makeSphere } from 'brepjs';

const cylinder = makeCylinder(5, 20); // radius, height
const sphere = makeSphere(8); // radius
```

## Step 4: Combine shapes with booleans

Boolean operations combine shapes. They return `Result<Shape3D>` because the geometry kernel can fail on degenerate inputs:

```typescript
import { cutShape, unwrap } from 'brepjs';

// Cut a cylindrical hole through the box
const withHole = unwrap(cutShape(box, cylinder));
```

`unwrap()` extracts the value from a successful `Result`, or throws if it failed. For production code, use `isOk()` to check first:

```typescript
import { cutShape, isOk } from 'brepjs';

const result = cutShape(box, cylinder);
if (isOk(result)) {
  const solid = result.value; // Shape3D
} else {
  console.error(result.error.message);
}
```

The three boolean operations are:

| Function              | Operation    | Analogy       |
| --------------------- | ------------ | ------------- |
| `fuseShape(a,b)`      | Union        | Glue together |
| `cutShape(a,b)`       | Subtraction  | Drill a hole  |
| `intersectShape(a,b)` | Intersection | Common volume |

## Step 5: Transform

Transforms return new shapes (nothing is mutated):

```typescript
import { translateShape, rotateShape, scaleShape } from 'brepjs';

const moved = translateShape(withHole, [100, 0, 0]);
const rotated = rotateShape(moved, [0, 0, 1], 45); // axis, degrees
const scaled = scaleShape(moved, 2); // uniform scale
```

## Step 6: Measure

```typescript
import { measureVolume, measureArea } from 'brepjs';

console.log('Volume:', measureVolume(moved), 'mm³');
```

Measurement functions return plain numbers — they never fail on valid shapes.

## Step 7: Export

```typescript
import { exportSTEP, unwrap } from 'brepjs';

const stepBlob = unwrap(exportSTEP(moved));
// stepBlob is a Blob you can save to disk or send to a viewer
```

Other export formats: `exportSTL`, `exportGltf`, `exportOBJ`, `exportThreeMF`.

## Complete example

```typescript
import opencascade from 'brepjs-opencascade';
import {
  initFromOC,
  makeBox,
  makeCylinder,
  cutShape,
  translateShape,
  measureVolume,
  exportSTEP,
  unwrap,
} from 'brepjs';

// 1. Initialize
const oc = await opencascade();
initFromOC(oc);

// 2. Create a box with a cylindrical hole
const box = makeBox([0, 0, 0], [30, 20, 10]);
const hole = translateShape(makeCylinder(4, 15), [15, 10, -2]);
const part = unwrap(cutShape(box, hole));

// 3. Measure
console.log('Volume:', measureVolume(part).toFixed(1), 'mm³');

// 4. Export
const stepBlob = unwrap(exportSTEP(part));
console.log('STEP file:', stepBlob.size, 'bytes');
```

## Browser Setup

brepjs works in browsers with WASM support. The simplest way to get started is with [Vite](https://vite.dev):

```bash
npm create vite@latest my-cad-app -- --template vanilla-ts
cd my-cad-app
npm install brepjs brepjs-opencascade
```

In your `main.ts`:

```typescript
import opencascade from 'brepjs-opencascade';
import { initFromOC, makeBox, meshShape, toBufferGeometryData } from 'brepjs';

async function main() {
  // Load the WASM kernel — in a browser this fetches and compiles the .wasm file
  const oc = await opencascade();
  initFromOC(oc);

  // Now use brepjs as normal
  const box = makeBox([0, 0, 0], [10, 10, 10]);
  const mesh = meshShape(box, { tolerance: 0.1 });
  const bufferData = toBufferGeometryData(mesh);

  // Pass bufferData.position, .normal, .index to Three.js, Babylon.js, or raw WebGL
  console.log('Vertices:', bufferData.position.length / 3);
}

main();
```

Vite handles WASM loading automatically. For other bundlers, you may need to configure WASM file serving — see [Compatibility](./compatibility.md) for details.

For a complete working example that generates a standalone HTML viewer (no bundler needed), see [`examples/browser-viewer.ts`](../examples/browser-viewer.ts). You can also try the [interactive playground](https://brepjs.vercel.app) for live experimentation.

## The 2D → 3D workflow

For more complex profiles, sketch in 2D first, then extrude to 3D:

```typescript
import {
  drawRectangle,
  drawCircle,
  drawingCut,
  drawingToSketchOnPlane,
  sketchExtrude,
  unwrap,
} from 'brepjs';

// Draw a rectangle with a circular hole
const profile = drawingCut(drawRectangle(50, 30), drawCircle(8).translate([25, 15]));

// Project onto XY plane and extrude upward
const sketch = drawingToSketchOnPlane(profile, 'XY');
const solid = sketchExtrude(sketch, 20);
```

## Edge refinement: fillets and chamfers

Round or bevel edges on a solid:

```typescript
import { filletShape, chamferShape, edgeFinder, getEdges, unwrap } from 'brepjs';

// Fillet all edges with 2mm radius
const rounded = unwrap(filletShape(part, getEdges(part), 2));

// Fillet only vertical edges
const vertEdges = edgeFinder().inDirection('Z').findAll(part);
const selective = unwrap(filletShape(part, vertEdges, 2));

// Chamfer vertical edges
const chamferEdges = edgeFinder().inDirection('Z').findAll(part);
const beveled = unwrap(chamferShape(part, chamferEdges, 1));
```

## Error handling patterns

brepjs uses a `Result<T, BrepError>` type for all fallible operations. You have several ways to handle results:

```typescript
import { cutShape, isOk, unwrap, match } from 'brepjs';

const result = cutShape(box, cylinder);

// Pattern 1: Quick scripts — unwrap (throws on error)
const solid = unwrap(result);

// Pattern 2: Check and branch
if (isOk(result)) {
  doSomething(result.value);
} else {
  console.error(result.error.code, result.error.message);
}

// Pattern 3: Pattern matching
match(result, {
  ok: (solid) => render(solid),
  err: (error) => showError(error.message),
});
```

See [errors.md](./errors.md) for the full error code reference.

## Troubleshooting

### "Cannot read properties of undefined" on first API call

You forgot to initialize the WASM kernel. Every brepjs program must call `initFromOC()` before using any shape functions:

```typescript
const oc = await opencascade();
initFromOC(oc); // Must happen before makeBox, makeCylinder, etc.
```

### Boolean operation returns an error

Boolean operations (`fuseShape`, `cutShape`, `intersectShape`) can fail when shapes don't overlap, are invalid, or have degenerate geometry. Try:

1. **Check shapes overlap** — `cutShape(a, b)` requires `b` to intersect `a`
2. **Heal inputs first** — `unwrap(healSolid(shape))` fixes minor geometry issues
3. **Check the error** — `result.error.code` tells you exactly what failed (see [Error Reference](./errors.md))

### Memory keeps growing

WASM objects aren't garbage-collected like normal JS objects. Use `using` for automatic cleanup:

```typescript
{
  using temp = makeBox([0, 0, 0], [10, 10, 10]);
  // temp is automatically cleaned up at block end
}
```

See [Memory Management](./memory-management.md) for full patterns.

### TypeScript errors with `using` syntax

You need TypeScript 5.9+ and `"lib": ["ES2022", "ESNext.Disposable"]` in your tsconfig.json. If you can't upgrade, use `gcWithScope()` or `localGC()` instead — see [Memory Management](./memory-management.md).

## Next steps

- **[Which API?](./which-api.md)** — Choose between Sketcher, functional API, and Drawing API
- **[B-Rep Concepts](./concepts.md)** — Understand the geometry model (vertices, edges, faces, solids)
- **[Memory Management](./memory-management.md)** — How to clean up WASM objects
- **[Examples](../examples/)** — Complete workflow examples from beginner to advanced
- **[llms.txt](../llms.txt)** — Full API reference (great for AI-assisted development)
