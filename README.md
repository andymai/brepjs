# brepjs

[![CI](https://github.com/andymai/brepjs/actions/workflows/ci.yml/badge.svg)](https://github.com/andymai/brepjs/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/brepjs)](https://www.npmjs.com/package/brepjs)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)

A CAD library for JavaScript and TypeScript, built on [OpenCascade](https://dev.opencascade.org/). Create 3D solid models in the browser or Node.js — boxes, cylinders, booleans, fillets, shelling, STEP/STL export — using a functional API.

## Install

```bash
npm install brepjs brepjs-opencascade
```

## Hello World

```typescript
import opencascade from 'brepjs-opencascade';
import { initFromOC, makeBox, measureVolume, exportSTEP, unwrap } from 'brepjs';

const oc = await opencascade();
initFromOC(oc);

const box = makeBox([0, 0, 0], [30, 20, 10]);
console.log('Volume:', measureVolume(box), 'mm³'); // 6000

const step = unwrap(exportSTEP(box));
```

## A More Realistic Example

Cut a hole through a box, fillet the edges, and export it:

```typescript
import {
  makeBox, makeCylinder, cutShape,
  filletShape, edgeFinder, translateShape,
  exportSTEP, unwrap,
} from 'brepjs';

// Create a box with a cylindrical hole
const box = makeBox([0, 0, 0], [30, 20, 10]);
const hole = translateShape(makeCylinder(5, 15), [15, 10, -2]);
const drilled = unwrap(cutShape(box, hole));

// Fillet the vertical edges
const edges = edgeFinder().inDirection('Z').findAll(drilled);
const part = unwrap(filletShape(drilled, edges, 1.5));

// Export
const step = unwrap(exportSTEP(part));
```

## What You Can Do

- **Primitives** — `makeBox`, `makeCylinder`, `makeSphere`, `makeCone`, `makeTorus`
- **Booleans** — `fuseShape`, `cutShape`, `intersectShape`, `cutAll`
- **Transforms** — `translateShape`, `rotateShape`, `scaleShape`, `mirrorShape`
- **Modifications** — `filletShape`, `chamferShape`, `shellShape`
- **2D to 3D** — sketch profiles with `drawRectangle`, `drawCircle`, extrude with `sketchExtrude`
- **Queries** — `faceFinder`, `edgeFinder` for selecting geometry by type, direction, position
- **Measurement** — `measureVolume`, `measureArea`, `measureLength`
- **Import/Export** — `importSTEP`, `exportSTEP`, `exportSTL`
- **Rendering** — `meshShape` + `toBufferGeometryData` for Three.js / WebGL
- **Text** — `loadFont`, `textBlueprints` for engraving text on shapes

## Examples

The [`examples/`](./examples/) directory has complete, runnable scripts:

```bash
npm run example examples/hello-world.ts
```

| Example | What it does |
|---|---|
| [hello-world.ts](./examples/hello-world.ts) | Create a box, measure it, export it |
| [basic-primitives.ts](./examples/basic-primitives.ts) | Primitives and boolean operations |
| [mechanical-part.ts](./examples/mechanical-part.ts) | Bracket with holes, slots, and SVG drawings |
| [2d-to-3d.ts](./examples/2d-to-3d.ts) | Sketch a profile, extrude to 3D |
| [parametric-part.ts](./examples/parametric-part.ts) | Configurable flanged pipe fitting |
| [threejs-rendering.ts](./examples/threejs-rendering.ts) | Generate mesh data for Three.js |
| [browser-viewer.ts](./examples/browser-viewer.ts) | Standalone HTML viewer with orbit controls |
| [import-export.ts](./examples/import-export.ts) | Load, modify, and re-export STEP files |
| [text-engraving.ts](./examples/text-engraving.ts) | Engrave text on a solid shape |

## How Imports Work

Import everything from the top level:

```typescript
import { makeBox, translateShape } from 'brepjs';
```

Or use sub-path imports for smaller bundles:

```typescript
import { makeBox, fuseShape, filletShape } from 'brepjs/topology';
import { importSTEP, exportSTEP } from 'brepjs/io';
import { measureVolume } from 'brepjs/measurement';
```

## Error Handling

Operations that can fail return a `Result` type instead of throwing:

```typescript
import { fuseShape, isOk, unwrap } from 'brepjs';

const result = fuseShape(a, b);

if (isOk(result)) {
  const fused = result.value;
}

// Or throw on failure
const fused = unwrap(fuseShape(a, b));
```

## Architecture

Four layers with enforced import boundaries (imports flow downward only):

```
Layer 3  sketching/, text/, projection/   High-level API
Layer 2  topology/, operations/, 2d/ ...  Domain logic
Layer 1  core/                            Types, memory, errors
Layer 0  kernel/, utils/                  WASM bindings
```

See [docs/architecture.md](./docs/architecture.md) for details.

## Documentation

- [Getting Started](./docs/getting-started.md) — Install to first part
- [B-Rep Concepts](./docs/concepts.md) — Vertices, edges, faces, solids
- [Which API?](./docs/which-api.md) — Sketcher vs functional vs Drawing
- [Memory Management](./docs/memory-management.md) — Resource cleanup patterns
- [Error Reference](./docs/errors.md) — Error codes and recovery
- [Performance](./docs/performance.md) — Optimization tips
- [Compatibility](./docs/compatibility.md) — Tested environments

## Projects Using brepjs

- [Gridfinity Layout Tool](https://github.com/andymai/gridfinity-layout-tool) — Web-based layout generator for Gridfinity storage systems

## Development

```bash
npm install
npm run build        # Build library (ES + CJS)
npm run test         # Run tests
npm run typecheck    # TypeScript strict check
npm run lint         # ESLint
npm run format:check # Prettier
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

[Apache-2.0](./LICENSE)
