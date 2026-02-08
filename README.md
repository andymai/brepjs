# brepjs

[![CI](https://github.com/andymai/brepjs/actions/workflows/ci.yml/badge.svg)](https://github.com/andymai/brepjs/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/brepjs)](https://www.npmjs.com/package/brepjs)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)

A CAD library for JavaScript and TypeScript, powered by [OpenCascade](https://dev.opencascade.org/). Create 3D solid models in the browser or Node.js — sketch 2D profiles, extrude/revolve/loft/sweep them into solids, apply booleans and fillets, query topology, and export to STEP, STL, glTF, and more.

## Install

```bash
npm install brepjs brepjs-opencascade
```

## Quick Start

The fastest way to get going — `brepjs/quick` auto-initializes the WASM kernel:

```typescript
import { box, cut, cylinder, unwrap, exportSTEP } from 'brepjs/quick';

const b = box(30, 20, 10);
const hole = cylinder(5, 15, { at: [15, 10, -2] });
const part = unwrap(cut(b, hole));
const step = unwrap(exportSTEP(part));
```

> `brepjs/quick` uses top-level await, so it requires ESM. For CJS or more control, use the standard setup:

```typescript
import opencascade from 'brepjs-opencascade';
import { initFromOC } from 'brepjs';

const oc = await opencascade();
initFromOC(oc);
```

## A Real Example

Build a box, drill a hole, fillet the edges, and export:

```typescript
import { box, cylinder, cut, fillet, edgeFinder, exportSTEP, unwrap } from 'brepjs/quick';

const b = box(30, 20, 10);
const hole = cylinder(5, 15, { at: [15, 10, -2] });
const drilled = unwrap(cut(b, hole));

// Fillet the vertical edges
const edges = edgeFinder().inDirection('Z').findAll(drilled);
const part = unwrap(fillet(drilled, edges, 1.5));

const step = unwrap(exportSTEP(part));
```

Build a parametric flanged pipe with bolt holes:

```typescript
import {
  cylinder, fuse, cut, shell, fillet, rotate,
  faceFinder, edgeFinder, measureVolume, unwrap,
} from 'brepjs/quick';

// Tube + flanges
const tube = cylinder(15, 100);
const body = unwrap(fuse(unwrap(fuse(tube, cylinder(30, 5))), cylinder(30, 5, { at: [0, 0, 95] })));

// Hollow out
const topFaces = faceFinder().parallelTo('XY').atDistance(100, [0, 0, 0]).findAll(body);
const hollowed = unwrap(shell(body, topFaces, 2));

// Fillet tube-to-flange transitions
const filletEdges = edgeFinder().ofCurveType('CIRCLE').ofLength(2 * Math.PI * 15).findAll(hollowed);
let result = unwrap(fillet(hollowed, filletEdges, 3));

// Bolt holes
for (let i = 0; i < 6; i++) {
  const angle = 60 * i;
  const hole = rotate(cylinder(3, 10, { at: [22, 0, -2] }), angle, { axis: [0, 0, 1] });
  result = unwrap(cut(result, hole));
}

console.log('Volume:', measureVolume(result), 'mm³');
```

## What You Can Do

**Shape creation**
- Primitives: `box`, `cylinder`, `sphere`, `cone`, `torus`, `ellipsoid`
- Low-level: `line`, `circle`, `wire`, `face`, `polygon`, `solid`, `compound`
- 2D sketching: `draw`, `drawRectangle`, `drawCircle`, `drawPolysides`, `drawText`
- 3D sketching: `Sketcher`, `sketchCircle`, `sketchRectangle`, `sketchHelix`

**Operations**
- Booleans: `fuse`, `cut`, `intersect`, `section`, `split`, `slice`, `fuseAll`, `cutAll`
- Transforms: `translate`, `rotate`, `mirror`, `scale`
- Modifiers: `fillet`, `chamfer`, `shell`, `offset`, `thicken`
- 3D from 2D: `extrude`, `revolve`, `loft`, `sweep`
- Patterns: `linearPattern`, `circularPattern`

**Queries and measurement**
- Finders: `edgeFinder`, `faceFinder`, `wireFinder`, `vertexFinder`, `cornerFinder`
- Topology: `getEdges`, `getFaces`, `getWires`, `getVertices`, `adjacentFaces`, `sharedEdges`
- Measurement: `measureVolume`, `measureArea`, `measureLength`, `measureDistance`
- Interference: `checkInterference`, `checkAllInterferences`

**Import / Export**
- STEP, STL, IGES, glTF/GLB, DXF, 3MF, OBJ, SVG
- Assembly export with colors and names: `exportAssemblySTEP`
- Mesh for rendering: `mesh`, `meshEdges`, `toBufferGeometryData`
- 2D projection: `drawProjection` for technical drawings

**Other**
- Text: `loadFont`, `drawText`, `sketchText`, `textBlueprints`
- Healing: `autoHeal`, `healSolid`, `healFace`, `isValid`
- Assemblies: `createAssemblyNode`, `addChild`, `walkAssembly`, `collectShapes`
- Parametric history: `createHistory`, `addStep`, `undoLast`, `replayHistory`
- Web workers: `createWorkerClient`, `createWorkerHandler`

## Examples

The [`examples/`](./examples/) directory has runnable scripts:

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

## Imports

Import everything from the top level:

```typescript
import { box, translate, fuse, exportSTEP } from 'brepjs';
```

Or use sub-path imports for smaller bundles:

```typescript
import { box, fuse, fillet } from 'brepjs/topology';
import { importSTEP, exportSTEP } from 'brepjs/io';
import { measureVolume } from 'brepjs/measurement';
import { edgeFinder, faceFinder } from 'brepjs/query';
import { sketchCircle, draw } from 'brepjs/sketching';
import { createAssemblyNode } from 'brepjs/operations';
```

## Error Handling

Operations that can fail return a `Result` instead of throwing:

```typescript
const result = fuse(a, b);

if (isOk(result)) {
  const fused = result.value;
}

// Or throw on failure
const fused = unwrap(fuse(a, b));
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

- [API Reference](https://andymai.github.io/brepjs/) — Searchable TypeDoc reference
- [Getting Started](./docs/getting-started.md) — Install to first part
- [B-Rep Concepts](./docs/concepts.md) — Vertices, edges, faces, solids
- [Cheat Sheet](./docs/cheat-sheet.md) — Single-page reference for common operations
- [Which API?](./docs/which-api.md) — Sketcher vs functional vs Drawing
- [Function Lookup](./docs/function-lookup.md) — Alphabetical index of every export
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
