# Which API Should I Use?

brepjs offers several API styles. This guide helps you choose the right one for your use case.

> **Recommended starting point:** The **functional API** (`makeBox`, `fuseShape`, `filletShape`) covers the vast majority of use cases and is the simplest to learn. Start there unless you have a specific reason to use the Sketcher or Drawing API.

## Quick decision

| If you want to...                 | Use                                              |
| --------------------------------- | ------------------------------------------------ |
| Create shapes from scratch        | **Sketcher** or **primitives** (`makeBox`)       |
| Combine/modify shapes             | **Functional API** (`fuseShape`, `filletShape`)  |
| Draw 2D profiles                  | **Drawing API** (`drawRectangle`, `drawCircle`)  |
| Build parametric/composable parts | **Functional API** with `pipe()` or `pipeline()` |
| Query shape features              | **Finders** (`edgeFinder()`, `faceFinder()`)     |
| Import/export files               | **IO functions** (`importSTEP`, `exportSTEP`)    |

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

Best for: **composing operations**, parametric design, and pipeline-style code.

```typescript
import {
  makeBox,
  makeCylinder,
  cutShape,
  filletShape,
  edgeFinder,
  translateShape,
  unwrap,
} from 'brepjs';

const box = makeBox([0, 0, 0], [30, 20, 10]);
const hole = translateShape(makeCylinder(5, 15), [15, 10, -2]);
const drilled = unwrap(cutShape(box, hole));
const vertEdges = edgeFinder().inDirection('Z').findAll(drilled);
const filleted = unwrap(filletShape(drilled, vertEdges, 2));
```

**When to use:** You're modifying shapes (booleans, transforms, fillets, shells), building parametric parts with functions, or chaining operations.

### Pipeline style

For complex multi-step operations, `pipe()` provides a fluent functional chain:

```typescript
import { pipe, makeBox, cutShape, filletShape } from 'brepjs';

const result = pipe(makeBox([0, 0, 0], [30, 20, 10]))
  .fuse(makeCylinder(5, 15))
  .fillet(2, (e) => e.inDirection('Z'))
  .done();
```

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
import { makeBox, fuseShape, filletShape } from 'brepjs';

// Import from focused sub-paths:
import { makeBox, fuseShape, filletShape } from 'brepjs/topology';
import { extrudeFace, linearPattern } from 'brepjs/operations';
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

Example: Looking for `filletShape`? Check the lookup table → `brepjs/topology`.

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
