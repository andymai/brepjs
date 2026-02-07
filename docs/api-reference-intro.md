# brepjs API Reference

Web CAD library built on OpenCascade with a layered architecture and kernel abstraction layer.

## Sub-path Modules

brepjs organizes its API into focused sub-path imports to reduce autocomplete noise:

| Sub-path                                           | Description                                                      |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| [`brepjs`](./modules/index.html)                   | Full API — all symbols re-exported                               |
| [`brepjs/core`](./modules/core.html)               | Result type, errors, vectors, planes, branded shape types        |
| [`brepjs/topology`](./modules/topology.html)       | Primitives, booleans, modifiers, curves, faces, meshing, healing |
| [`brepjs/operations`](./modules/operations.html)   | Extrude, loft, sweep, patterns, assemblies, history              |
| [`brepjs/2d`](./modules/2d.html)                   | Blueprints, 2D curves, 2D booleans                               |
| [`brepjs/sketching`](./modules/sketching.html)     | Sketcher, Drawing, sketch-to-shape operations                    |
| [`brepjs/query`](./modules/query.html)             | Edge, face, wire, vertex finders                                 |
| [`brepjs/measurement`](./modules/measurement.html) | Volume, area, length, distance, curvature                        |
| [`brepjs/io`](./modules/io.html)                   | STEP, STL, IGES, OBJ, glTF, DXF, 3MF, SVG                        |
| [`brepjs/worker`](./modules/worker.html)           | Web Worker protocol and client                                   |

## Guides

- [Getting Started](https://github.com/andymai/brepjs/blob/main/docs/getting-started.md) — Installation, WASM setup, first shape
- [Which API?](https://github.com/andymai/brepjs/blob/main/docs/which-api.md) — Choosing between Sketcher, functional API, Drawing
- [Function Lookup Table](https://github.com/andymai/brepjs/blob/main/docs/function-lookup.md) — Find any symbol and its sub-path
- [Error Reference](https://github.com/andymai/brepjs/blob/main/docs/errors.md) — All error codes with recovery suggestions
- [Memory Management](https://github.com/andymai/brepjs/blob/main/docs/memory-management.md) — WASM cleanup patterns

## Quick Example

```typescript
import { makeBox, fuseShape, filletShape, unwrap, edgeFinder } from 'brepjs/topology';
import { makeCylinder } from 'brepjs/topology';

const box = makeBox([0, 0, 0], [30, 20, 10]);
const cyl = makeCylinder(5, 15, [15, 10, -2]);
const fused = unwrap(fuseShape(box, cyl));
const filleted = unwrap(filletShape(fused, edgeFinder().inDirection('Z').findAll(fused), 2));
```
