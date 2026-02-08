# Which API Should I Use?

> **TL;DR:** Use the **fluent wrapper** (`shape().cut().fillet()`) for 3D operations and the **Sketcher** for 2D profiles. That's it — these two APIs cover 95% of use cases.

## Start Here: The Two APIs You Need

### For 3D: Use the Fluent Wrapper

```typescript
import { shape, box, cylinder } from 'brepjs';

// Everything you need — clean, chainable, type-safe
const bracket = shape(box(30, 20, 10))
  .cut(cylinder(5, 15, { at: [15, 10, -2] }))
  .fillet((e) => e.inDirection('Z'), 2).val; // Extract the final shape
```

### For 2D: Use the Sketcher

```typescript
import { Sketcher, sketchCircle } from 'brepjs';

// Build 2D profiles and extrude them
const cylinder = sketchCircle(10).extrude(20);
const roundedBox = sketchRoundedRectangle(30, 20, 3).extrude(10);
```

**That's the core API.** If you're just getting started, stick with these two patterns. They provide everything you need for typical CAD workflows.

---

## Quick Reference

| If you want to...                 | Use                                           |
| --------------------------------- | --------------------------------------------- |
| Create 3D primitives              | `box()`, `cylinder()`, `sphere()`             |
| Combine/modify shapes             | **Fluent wrapper** (`shape().cut().fillet()`) |
| Create 2D profiles                | **Sketcher** (`sketchCircle`, `sketchRect`)   |
| Build parametric/composable parts | **Fluent wrapper**                            |
| Query shape features              | **Finders** (`edgeFinder()`, `faceFinder()`)  |
| Import/export files               | **IO functions** (`importSTEP`, `exportSTEP`) |

## Fluent Wrapper Details

The `shape()` wrapper is the **canonical API** for brepjs. It wraps any shape and provides a fluent, chainable interface.

**Key benefits:**

- **No `unwrap()` calls** — automatically handles `Result` types and throws `BrepWrapperError` on failure
- **Type-safe chaining** — each method returns the appropriate wrapper type (3D, Face, Edge, Wire)
- **Cleaner finder integration** — use callbacks directly: `.fillet((e) => e.inDirection('Z'), 2)`
- **Axis shortcuts** — `.moveX(10)`, `.rotateZ(45)` for common transforms
- **Built-in methods** — `.volume()`, `.area()`, `.mesh()`, `.toBREP()` without separate imports

**Example with multiple operations:**

```typescript
import { shape, box, cylinder } from 'brepjs';

const bracket = shape(box(30, 20, 10))
  .cut(cylinder(5, 15, { at: [15, 10, -2] }))
  .fillet((e) => e.inDirection('Z'), 2)
  .translate([10, 0, 0]).val; // Extract the final shape
```

**Available wrapper types:**

| Wrapper Type   | Shape Types  | Additional Methods                           |
| -------------- | ------------ | -------------------------------------------- |
| `Wrapped3D<T>` | Solid, Shell | Booleans, fillets, shell, offset, patterns   |
| `WrappedFace`  | Face         | `extrude()`, `revolve()`, `normalAt()`       |
| `WrappedCurve` | Edge, Wire   | `length()`, `sweep()`, curve introspection   |
| `Wrapped<T>`   | Any shape    | Transforms, bounds, describe, mesh, validate |

## Sketcher Details

The Sketcher provides a builder pattern for creating 2D profiles and extruding them to 3D.

**Interactive sketching:**

```typescript
import { Sketcher } from 'brepjs';

// Build profiles line-by-line
const box = new Sketcher('XY')
  .movePointerTo([0, 0])
  .lineTo([20, 0])
  .lineTo([20, 10])
  .lineTo([0, 10])
  .close()
  .extrude(5);
```

**Canned shapes (recommended for common profiles):**

```typescript
import { sketchCircle, sketchRoundedRectangle } from 'brepjs';

const cylinder = sketchCircle(10).extrude(20);
const roundedBox = sketchRoundedRectangle(30, 20, 3).extrude(10);
```

The Sketcher handles the sketch-to-3D conversion automatically, making it perfect for profiles that get extruded, revolved, or swept.

---

## Advanced: Alternative API Styles

The fluent wrapper and Sketcher cover 95% of use cases. However, brepjs also provides alternative API styles for specific scenarios.

### Functional API (for explicit error handling)

The functional API uses standalone functions and returns `Result<T>` types for explicit error handling.

```typescript
import { box, cylinder, cut, fillet, edgeFinder, translate, unwrap } from 'brepjs';

const myBox = box([0, 0, 0], [30, 20, 10]);
const hole = translate(cylinder(5, 15), [15, 10, -2]);
const drilled = unwrap(cut(myBox, hole));
const vertEdges = edgeFinder().inDirection('Z').findAll(drilled);
const filleted = unwrap(fillet(drilled, vertEdges, 2));
```

**Use this when:**

- You need to check `Result` at each step for custom error recovery
- You're building reusable utility functions that operate on shapes
- You prefer explicit, functional programming style

**Trade-off:** Requires `unwrap()` calls and manual error handling. The fluent wrapper handles this automatically with cleaner syntax.

### Drawing API (for 2D boolean operations)

The Drawing API provides 2D geometry operations (booleans, fillets, chamfers) before extrusion.

```typescript
import {
  drawRectangle,
  drawCircle,
  drawingCut,
  drawingFillet,
  drawingToSketchOnPlane,
  sketchExtrude,
} from 'brepjs';

const plate = drawRectangle(50, 30);
const hole = drawCircle(8).translate([25, 15]);
const profile = drawingCut(plate, hole);
const rounded = drawingFillet(profile, 3);

const sketch = drawingToSketchOnPlane(rounded, 'XY');
const part = sketchExtrude(sketch, 10);
```

**Use this when:** You need 2D boolean operations or advanced 2D features before converting to 3D.

**Note:** For most 2D profiles, the Sketcher is simpler. Use the Drawing API only when you need 2D booleans or complex 2D operations.

---

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
