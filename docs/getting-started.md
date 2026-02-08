# Getting Started

This guide walks you through creating your first 3D part with brepjs — from installation to exported STEP file.

## Prerequisites

- Node.js 20+ (or a modern browser with WASM support)
- TypeScript 5.9+ (recommended, for `using` syntax and strict branded types)

## Step 1: Install

```bash
npm install brepjs brepjs-opencascade
```

`brepjs` is the API layer. `brepjs-opencascade` provides the OpenCascade WASM kernel that does the actual geometry computation.

## Step 2: Import from `brepjs/quick`

The easiest way to start is with `brepjs/quick`, which automatically initializes the WASM kernel for you:

```typescript
import { box, cylinder, shape } from 'brepjs/quick';

// The kernel is auto-initialized via top-level await
// You can start creating shapes immediately
const b = box(30, 20, 10);
```

That's it — no initialization ceremony required. The `brepjs/quick` entry point handles WASM setup automatically using top-level await.

> **Note:** If you need manual control over initialization (for example, in environments without top-level await support), see the [Advanced: Manual Initialization](#advanced-manual-initialization) section below.

## Step 3: Create shapes with primitives

```typescript
const b = box(30, 20, 10); // width, depth, height
const cyl = cylinder(5, 20); // radius, height
const sph = sphere(8); // radius
```

`box`, `cylinder`, and `sphere` return `Solid` — a branded type representing a watertight 3D shape. All primitives are available from `brepjs/quick`.

## Step 4: Combine shapes with the fluent wrapper

The easiest way to work with brepjs is the `shape()` wrapper. It provides a fluent, chainable API that automatically handles errors:

```typescript
import { shape } from 'brepjs';

// Wrap the box and cut a cylindrical hole through it
const withHole = shape(b).cut(cyl).val;
```

The wrapper returns a new wrapped shape after each operation, so you can chain multiple operations together:

```typescript
const part = shape(box(30, 20, 10))
  .cut(cylinder(5, 15))
  .fillet((e) => e.inDirection('Z'), 2)
  .translate([10, 0, 0]).val; // .val extracts the final shape
```

The wrapper automatically unwraps `Result` types and throws a `BrepWrapperError` if an operation fails. For production code where you need explicit error handling, use the functional API:

```typescript
import { cut, isOk } from 'brepjs';

const result = cut(b, cyl);
if (isOk(result)) {
  const solid = result.value; // Shape3D
} else {
  console.error(result.error.message);
}
```

The three boolean operations are:

| Function         | Operation    | Analogy       |
| ---------------- | ------------ | ------------- |
| `fuse(a,b)`      | Union        | Glue together |
| `cut(a,b)`       | Subtraction  | Drill a hole  |
| `intersect(a,b)` | Intersection | Common volume |

## Step 5: Transform

Transforms return new shapes (nothing is mutated). The wrapper makes chaining transforms easy:

```typescript
// Wrapper style - chain operations fluently
const moved = shape(withHole)
  .translate([100, 0, 0])
  .rotate(45, { axis: [0, 0, 1] }) // degrees, options
  .scale(2).val; // uniform scale

// Or use axis shortcuts
const positioned = shape(withHole).moveX(100).rotateZ(45).val;
```

You can also use the functional API if you prefer:

```typescript
import { translate, rotate, scale } from 'brepjs';

const moved = translate(withHole, [100, 0, 0]);
const rotated = rotate(moved, 45, { axis: [0, 0, 1] });
const scaled = scale(moved, 2);
```

## Step 6: Measure

```typescript
// Wrapper style - call measurement methods directly
console.log('Volume:', shape(moved).volume(), 'mm³');
console.log('Area:', shape(moved).area(), 'mm²');

// Or use the functional API
import { measureVolume, measureArea } from 'brepjs';
console.log('Volume:', measureVolume(moved), 'mm³');
```

Measurement functions return plain numbers — they never fail on valid shapes.

## Step 7: Export

Export functions return `Result<Blob>`. Use the functional API for exports:

```typescript
import { exportSTEP, unwrap } from 'brepjs';

const stepBlob = unwrap(exportSTEP(moved));
// stepBlob is a Blob you can save to disk or send to a viewer
```

Other export formats: `exportSTL`, `exportGltf`, `exportOBJ`, `exportThreeMF`.

The wrapper also provides `toBREP()` for serialization:

```typescript
const brepString = shape(moved).toBREP();
```

## Complete example

```typescript
import { box, cylinder, shape, exportSTEP, unwrap } from 'brepjs/quick';

// Create a box with a cylindrical hole using the fluent wrapper
const part = shape(box(30, 20, 10)).cut(cylinder(4, 15, { at: [15, 10, -2] })).val;

// Measure
console.log('Volume:', shape(part).volume().toFixed(1), 'mm³');

// Export
const stepBlob = unwrap(exportSTEP(part));
console.log('STEP file:', stepBlob.size, 'bytes');
```

**Alternative functional style:**

```typescript
import { box, cylinder, cut, translate, measureVolume, unwrap } from 'brepjs/quick';

const b = box(30, 20, 10);
const hole = translate(cylinder(4, 15), [15, 10, -2]);
const part = unwrap(cut(b, hole));
console.log('Volume:', measureVolume(part).toFixed(1), 'mm³');
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
import { box, shape, toBufferGeometryData } from 'brepjs/quick';

// brepjs/quick auto-initializes the WASM kernel
const b = box(10, 10, 10);
const m = shape(b).mesh({ tolerance: 0.1 });
const bufferData = toBufferGeometryData(m);

// Pass bufferData.position, .normal, .index to Three.js, Babylon.js, or raw WebGL
console.log('Vertices:', bufferData.position.length / 3);
```

Vite handles WASM loading automatically. For other bundlers, you may need to configure WASM file serving — see [Compatibility](./compatibility.md) for details.

> **Note:** For manual initialization control in browsers (useful for loading indicators or error handling), see [Advanced: Manual Initialization](#advanced-manual-initialization) below.

For a complete working example that generates a standalone HTML viewer (no bundler needed), see [`examples/browser-viewer.ts`](../examples/browser-viewer.ts). You can also try the [interactive playground](https://brepjs.vercel.app) for live experimentation.

## The 2D → 3D workflow

For more complex profiles, sketch in 2D first, then extrude to 3D. You can use the wrapper's `extrude()` method on faces:

```typescript
import { drawRectangle, drawCircle, drawingCut, drawingToSketchOnPlane, shape } from 'brepjs';

// Draw a rectangle with a circular hole
const profile = drawingCut(drawRectangle(50, 30), drawCircle(8).translate([25, 15]));

// Project onto XY plane and extrude upward using the wrapper
const sketch = drawingToSketchOnPlane(profile, 'XY');
const solid = shape(sketch.face()).extrude(20).val;
```

**Functional API alternative:**

```typescript
import { sketchExtrude, unwrap } from 'brepjs';

const solid = sketchExtrude(sketch, 20);
```

## Edge refinement: fillets and chamfers

Round or bevel edges on a solid. The wrapper makes this especially clean with finder callbacks:

```typescript
// Fillet all edges with 2mm radius
const rounded = shape(part).fillet(2).val;

// Fillet only vertical edges using a finder callback
const selective = shape(part).fillet((e) => e.inDirection('Z'), 2).val;

// Chamfer vertical edges
const beveled = shape(part).chamfer((e) => e.inDirection('Z'), 1).val;
```

**Functional API alternative:**

```typescript
import { fillet, chamfer, edgeFinder, unwrap } from 'brepjs';

const vertEdges = edgeFinder().inDirection('Z').findAll(part);
const selective = unwrap(fillet(part, vertEdges, 2));
const beveled = unwrap(chamfer(part, vertEdges, 1));
```

## Error handling patterns

brepjs uses a `Result<T, BrepError>` type for all fallible operations.

**Wrapper style** — throws `BrepWrapperError` on failure:

```typescript
import { shape, box, cylinder, BrepWrapperError } from 'brepjs';

try {
  const part = shape(box(10, 10, 10))
    .cut(cylinder(5, 15))
    .fillet(2).val;
  render(part);
} catch (error) {
  if (error instanceof BrepWrapperError) {
    console.error(error.code, error.message);
  }
}
```

**Functional API** — returns `Result<T>` for explicit error handling:

```typescript
import { cut, isOk, unwrap, match } from 'brepjs';

const result = cut(b, cyl);

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

**Which to use?** The wrapper is more concise for most use cases. Use the functional API when you need fine-grained control over error handling at each step.

See [errors.md](./errors.md) for the full error code reference.

---

## Advanced: Manual Initialization

Most users should use `brepjs/quick` for automatic initialization. However, if you need manual control over the WASM loading process (for example, to show a loading indicator, handle errors explicitly, or work in environments without top-level await support), you can initialize manually:

```typescript
import opencascade from 'brepjs-opencascade';
import { initFromOC, box, cylinder, shape } from 'brepjs';

async function main() {
  // Load and initialize the WASM kernel manually
  const oc = await opencascade();
  initFromOC(oc);

  // Now all brepjs functions are ready to use
  const part = shape(box(30, 20, 10)).cut(cylinder(5, 15)).val;
  console.log('Volume:', shape(part).volume());
}

main().catch(console.error);
```

**When to use manual initialization:**

- You want to show a loading indicator while the WASM kernel loads
- You need to handle initialization errors explicitly
- Your environment doesn't support top-level await (older bundlers, some test frameworks)
- You're dynamically loading brepjs on demand rather than at startup

**Browser example with loading indicator:**

```typescript
import opencascade from 'brepjs-opencascade';
import { initFromOC, box, shape } from 'brepjs';

async function initCAD() {
  const loader = document.getElementById('loader');
  loader.textContent = 'Loading CAD kernel...';

  try {
    const oc = await opencascade();
    initFromOC(oc);
    loader.remove();

    // Now ready to use brepjs
    const b = box(10, 10, 10);
    console.log('Initialized! Volume:', shape(b).volume());
  } catch (err) {
    loader.textContent = 'Failed to load CAD kernel: ' + err.message;
  }
}

initCAD();
```

**Note:** `initFromOC()` only needs to be called once per application lifetime. After initialization, all brepjs functions remain ready to use.

---

## Troubleshooting

### "Cannot read properties of undefined" on first API call

If using manual initialization (not `brepjs/quick`), make sure you've called `initFromOC()` before using any shape functions. See [Advanced: Manual Initialization](#advanced-manual-initialization) above.

### Boolean operation returns an error

Boolean operations (`fuse`, `cut`, `intersect`) can fail when shapes don't overlap, are invalid, or have degenerate geometry. Try:

1. **Check shapes overlap** — `cut(a, b)` requires `b` to intersect `a`
2. **Heal inputs first** — `unwrap(healSolid(shape))` fixes minor geometry issues
3. **Check the error** — `result.error.code` tells you exactly what failed (see [Error Reference](./errors.md))

### Memory keeps growing

WASM objects aren't garbage-collected like normal JS objects. Use `using` for automatic cleanup:

```typescript
{
  using temp = box(10, 10, 10);
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
