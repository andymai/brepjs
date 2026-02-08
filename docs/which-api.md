# Which API Should I Use?

brepjs offers several API styles. This guide helps you choose the right one for your use case.

> **Recommended starting point:** The **fluent wrapper** (`shape().cut().fillet()`) is the canonical brepjs API. It provides the cleanest syntax for most use cases. Use the **Sketcher** for interactive 2D profiles and the **Drawing API** for 2D geometry that needs booleans before extrusion.

## Quick decision

| If you want to...                 | Use                                             |
| --------------------------------- | ----------------------------------------------- |
| Create shapes from scratch        | **Sketcher** or **primitives** (`box`)          |
| Combine/modify shapes             | **Fluent wrapper** (`shape().cut().fillet()`)   |
| Draw 2D profiles                  | **Drawing API** (`drawRectangle`, `drawCircle`) |
| Build parametric/composable parts | **Fluent wrapper** or **functional API**        |
| Query shape features              | **Finders** (`edgeFinder()`, `faceFinder()`)    |
| Import/export files               | **IO functions** (`importSTEP`, `exportSTEP`)   |

## The Fluent Wrapper (recommended)

**Best for:** Most use cases — the wrapper provides the cleanest syntax for chaining operations.

The `shape()` wrapper is the **canonical API** for brepjs. It wraps any shape and provides a fluent, chainable interface:

```typescript
import { shape, box, cylinder } from 'brepjs';

// Create a part with operations chained fluently
const bracket = shape(box(30, 20, 10))
  .cut(cylinder(5, 15, { at: [15, 10, -2] }))
  .fillet((e) => e.inDirection('Z'), 2)
  .translate([10, 0, 0]).val; // .val extracts the final shape
```

**Key benefits:**

- **No `unwrap()` calls** — automatically handles `Result` types and throws `BrepWrapperError` on failure
- **Type-safe chaining** — each method returns the appropriate wrapper type (3D, Face, Edge, Wire)
- **Cleaner finder integration** — use callbacks directly: `.fillet((e) => e.inDirection('Z'), 2)`
- **Axis shortcuts** — `.moveX(10)`, `.rotateZ(45)` for common transforms
- **Built-in methods** — `.volume()`, `.area()`, `.mesh()`, `.toBREP()` without separate imports

**Available wrapper types:**

| Wrapper Type   | Shape Types  | Additional Methods                           |
| -------------- | ------------ | -------------------------------------------- |
| `Wrapped3D<T>` | Solid, Shell | Booleans, fillets, shell, offset, patterns   |
| `WrappedFace`  | Face         | `extrude()`, `revolve()`, `normalAt()`       |
| `WrappedCurve` | Edge, Wire   | `length()`, `sweep()`, curve introspection   |
| `Wrapped<T>`   | Any shape    | Transforms, bounds, describe, mesh, validate |

**When to use the functional API instead:**

- You need fine-grained `Result` handling at each operation
- You're building reusable utility functions that operate on shapes
- You prefer a more explicit, functional programming style

## The Sketcher (fluent chaining)

Best for: **interactive shape creation** where you're building geometry step by step.

```typescript
import { Sketcher, sketchRectangle } from 'brepjs';

// Fluent chaining — each method returns the sketcher
const box = new Sketcher('XY')
  .movePointerTo([0, 0])
  .lineTo([20, 0])
  .lineTo([20, 10])
  .lineTo([0, 10])
  .close()
  .extrude(5);

// Or use canned sketches for common shapes
const cylinder = sketchCircle(10).extrude(20);
const roundedBox = sketchRoundedRectangle(30, 20, 3).extrude(10);
```

**When to use:** You're creating profiles interactively (lines, arcs, splines) and want a builder pattern. The Sketcher handles the sketch-to-3D conversion for you.

## Functional API (standalone functions)

Best for: **building reusable utilities** and when you need explicit `Result` handling.

```typescript
import { box, cylinder, cut, fillet, edgeFinder, translate, unwrap } from 'brepjs';

const myBox = box([0, 0, 0], [30, 20, 10]);
const hole = translate(cylinder(5, 15), [15, 10, -2]);
const drilled = unwrap(cut(myBox, hole));
const vertEdges = edgeFinder().inDirection('Z').findAll(drilled);
const filleted = unwrap(fillet(drilled, vertEdges, 2));
```

**When to use:**

- You need to check `Result` at each step for fine-grained error handling
- You're building parametric functions that operate on shapes
- You prefer an explicit, functional programming style

**Why use the wrapper instead?** The functional API requires `unwrap()` calls and manual error handling. The wrapper does this automatically while providing the same operations in a more concise syntax.

## Drawing API (2D profiles)

Best for: **2D geometry** — profiles with booleans, fillets, chamfers — before extruding to 3D.

```typescript
import {
  drawRectangle,
  drawCircle,
  drawingCut,
  drawingFillet,
  drawingToSketchOnPlane,
  sketchExtrude,
  unwrap,
} from 'brepjs';

// Build a 2D profile
const plate = drawRectangle(50, 30);
const hole = drawCircle(8).translate([25, 15]);
const profile = drawingCut(plate, hole);
const rounded = drawingFillet(profile, 3);

// Extrude to 3D
const sketch = drawingToSketchOnPlane(rounded, 'XY');
const part = sketchExtrude(sketch, 10);
```

**When to use:** Your shape starts as a 2D outline that gets extruded, revolved, or swept into 3D.

## Sub-path imports

To reduce autocomplete noise, import from specific modules:

```typescript
// Instead of importing everything from 'brepjs':
import { box, fuse, fillet } from 'brepjs';

// Import from focused sub-paths:
import { box, fuse, fillet } from 'brepjs/topology';
import { extrude, linearPattern } from 'brepjs/operations';
import { drawRectangle, sketchExtrude } from 'brepjs/sketching';
import { edgeFinder, faceFinder } from 'brepjs/query';
import { importSTEP, exportSTEP } from 'brepjs/io';
import { measureVolume } from 'brepjs/measurement';
import { createBlueprint } from 'brepjs/2d';
import { ok, isOk, unwrap, type Result } from 'brepjs/core';
```

All sub-paths re-export a subset of the main `brepjs` entry. You can mix and match imports from the main entry and sub-paths.

## Finding functions

Not sure which sub-path exports a specific function?

- **[Function Lookup Table](function-lookup.md)** — Alphabetical index of all 400+ symbols with their sub-path
- **[Hosted API Reference](https://andymai.github.io/brepjs/)** — Searchable TypeDoc documentation

Example: Looking for `fillet`? Check the lookup table → `brepjs/topology`.

## Available sub-paths

| Sub-path             | Contents                                            |
| -------------------- | --------------------------------------------------- |
| `brepjs/core`        | Result type, errors, vectors, planes, branded types |
| `brepjs/topology`    | Primitives, booleans, modifiers, mesh, healing      |
| `brepjs/operations`  | Extrude, loft, sweep, patterns, assembly, history   |
| `brepjs/2d`          | Blueprints, 2D curves, 2D booleans                  |
| `brepjs/sketching`   | Sketcher, Drawing, sketch-to-shape operations       |
| `brepjs/query`       | Edge, face, wire, vertex, and corner finders        |
| `brepjs/measurement` | Volume, area, length, distance, curvature           |
| `brepjs/io`          | STEP, STL, IGES, OBJ, glTF, DXF, 3MF, SVG           |
| `brepjs/worker`      | Web Worker protocol and client                      |
