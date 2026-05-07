# Getting Started

Build your first 3D part, from `npm install` to exported STEP file.

## Prerequisites

- Node.js 20+ (or a modern browser with WASM support)
- TypeScript 5.9+ (recommended, for `using` syntax and strict branded types)

## Step 1: Install

```bash
npm install brepjs brepjs-opencascade
```

`brepjs` is the API layer. `brepjs-opencascade` provides the default WASM geometry kernel.

Two alternative kernels are also supported: `brepkit-wasm` and `occt-wasm`. See [Custom Kernel Guide](./kernel-swap.md) for details.

## Step 2: Initialize

Three ways to start - pick whichever fits your setup:

**Auto-init: `brepjs/quick` (zero config)**

```typescript
import { box, cylinder, shape } from 'brepjs/quick';

const b = box(30, 20, 10); // just works - WASM init happens via top-level await
```

Best for: scripts, quick prototypes, any ESM environment that supports top-level await.

**Auto-detect: `init()` (one-liner)**

```typescript
import { init, box, cylinder, shape } from 'brepjs';

await init(); // auto-detects brepjs-opencascade or brepkit-wasm
const b = box(30, 20, 10);
```

Best for: apps where you control the async startup flow. `init()` is idempotent and returns the kernel ID (`'occt'` or `'brepkit'`).

**Manual init: `initFromOC()`**

```typescript
import opencascade from 'brepjs-opencascade';
import { initFromOC, box, cylinder, shape } from 'brepjs';

const oc = await opencascade();
initFromOC(oc); // call once, then all brepjs functions are ready

const b = box(30, 20, 10);
```

Best for: apps that need a loading indicator, explicit error handling, lazy initialization, or environments without top-level await (older bundlers, some test frameworks).

All three paths expose the same API - the only difference is who calls the kernel init. All examples below work with any import style.

## Step 3: Create shapes with primitives

```typescript
const b = box(30, 20, 10); // width, depth, height
const cyl = cylinder(5, 20); // radius, height
const sph = sphere(8); // radius
```

`box`, `cylinder`, and `sphere` return `ValidSolid` - a branded type representing a watertight 3D shape that passes BRepCheck validation. All primitives are available from both `brepjs/quick` and `brepjs`.

WASM objects aren't garbage-collected. In loops or long-running apps, use `using` for automatic cleanup:

```typescript
{
  using temp = box(10, 10, 10);
} // cleaned up at block end
```

See [Memory Management](./memory-management.md) for full patterns.

## Step 4: Combine shapes with the fluent wrapper

The `shape()` wrapper provides a fluent, chainable API:

```typescript
import { shape } from 'brepjs';

// Wrap the box and cut a cylindrical hole through it
const withHole = shape(b).cut(cyl).val;
```

Each operation returns a new wrapped shape, so you can chain freely:

```typescript
const part = shape(box(30, 20, 10))
  .cut(cylinder(5, 15))
  .fillet((e) => e.inDirection('Z'), 2)
  .translate([10, 0, 0]).val; // .val extracts the final shape
```

The wrapper automatically unwraps `Result` types and throws `BrepWrapperError` on failure. For explicit error handling at each step, use the functional API:

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

Transforms return new shapes - nothing is mutated:

```typescript
// Wrapper style - chain operations fluently
const moved = shape(withHole)
  .translate([100, 0, 0])
  .rotate(45, { axis: [0, 0, 1] }) // degrees, options
  .scale(2).val; // uniform scale

// Or use axis shortcuts
const positioned = shape(withHole).moveX(100).rotateZ(45).val;
```

Functional API alternative:

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

Measurement functions return plain numbers - they never fail on valid shapes.

## Step 7: Export

Export functions return `Result<Blob>`. `unwrap()` extracts the value or throws on error. It's fine for scripts and examples; in production code prefer `isOk()` or `match()` (see [Error handling](#error-handling-patterns)).

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

Vite handles WASM loading automatically. For other bundlers, you may need to configure WASM file serving - see [Compatibility](./compatibility.md) for details.

> **SSR frameworks (Next.js, Nuxt, Remix):** brepjs requires WASM, which doesn't run during server-side rendering. Use a dynamic import in a client-only component:
>
> ```typescript
> // Next.js example
> import dynamic from 'next/dynamic';
>
> const BrepViewer = dynamic(() => import('./BrepViewer'), { ssr: false });
> ```
>
> See [Compatibility - No SSR Support](./compatibility.md#3-no-ssr-support) for patterns.

Try the [interactive playground](https://docs.brepjs.dev/playground) for live experimentation.

## The 2D → 3D workflow

For more complex profiles, sketch in 2D first, then extrude to 3D:

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

Round or bevel edges on a solid using finder callbacks:

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

brepjs uses a `Result<T, BrepError>` type for all fallible operations. Two styles:

**Wrapper style** - throws on failure:

```typescript
import { shape, box, cylinder, BrepWrapperError } from 'brepjs';

try {
  const part = shape(box(10, 10, 10))
    .cut(cylinder(5, 15))
    .fillet(2).val;
} catch (error) {
  if (error instanceof BrepWrapperError) {
    console.error(error.code, error.message);
  }
}
```

**Functional API** - explicit `Result` handling:

```typescript
import { cut, isOk } from 'brepjs';

const result = cut(b, cyl);
if (isOk(result)) {
  doSomething(result.value);
} else {
  console.error(result.error.code, result.error.message);
}
```

The wrapper is more concise for most use cases. Use the functional API when you need fine-grained control at each step. See [Error Reference](./errors.md) for all error codes and recovery patterns.

## Type safety: validity types

brepjs uses phantom types to catch modeling errors at compile time. The key chain: `wireLoop → face → extrude`.

```typescript
import { line, wireLoop, face, extrude, unwrap } from 'brepjs/quick';

const cw = unwrap(
  wireLoop([
    line([0, 0, 0], [10, 0, 0]),
    line([10, 0, 0], [10, 10, 0]),
    line([10, 10, 0], [0, 10, 0]),
    line([0, 10, 0], [0, 0, 0]),
  ])
); // ClosedWire

const f = unwrap(face(cw)); // face() requires ClosedWire → OrientedFace
const s = unwrap(extrude(f, 10)); // extrude() requires OrientedFace → Solid
```

See [B-Rep Concepts](./concepts.md#validity-types) for how validity types work - `ClosedWire`, `OrientedFace`, `ValidSolid`, smart constructors, and type guards.

---

## Advanced: Browser Loading Indicator

When using `initFromOC()` (from Step 2), you can show a loading indicator while the WASM kernel downloads. (`init()` and `brepjs/quick` handle this automatically.)

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

    const b = box(10, 10, 10);
    console.log('Initialized! Volume:', shape(b).volume());
  } catch (err) {
    loader.textContent = 'Failed to load CAD kernel: ' + err.message;
  }
}

initCAD();
```

`initFromOC()` only needs to be called once per application lifetime.

---

## Troubleshooting

### "Cannot read properties of undefined" on first API call

If using manual init (not `brepjs/quick`), make sure you've called `init()` or `initFromOC()` before using any shape functions. See [Step 2: Initialize](#step-2-initialize) above.

### Boolean operation returns an error

Boolean operations (`fuse`, `cut`, `intersect`) can fail when shapes don't overlap, are invalid, or have degenerate geometry. Try:

1. **Read the suggestion** - `result.error.suggestion` provides actionable recovery advice specific to the failure
2. **Check shapes overlap** - `cut(a, b)` requires `b` to intersect `a`
3. **Heal inputs first** - `unwrap(autoHeal(shape))` fixes minor geometry issues
4. **Check the error code** - `result.error.code` tells you exactly what failed (see [Error Reference](./errors.md))

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

You need TypeScript 5.9+ and `"lib": ["ES2022", "ESNext.Disposable"]` in your tsconfig.json. If you can't upgrade, use `DisposalScope` instead - see [Memory Management](./memory-management.md).

## Next steps

- **[Three.js Integration](./threejs-integration.md)** - Render shapes in the browser with Three.js
- **[Which API?](./which-api.md)** - Choose between Sketcher, functional API, and Drawing API
- **[B-Rep Concepts](./concepts.md)** - Understand the geometry model (vertices, edges, faces, solids)
- **[Memory Management](./memory-management.md)** - How to clean up WASM objects
- **[llms.txt](../llms.txt)** - Full API reference (great for AI-assisted development)
