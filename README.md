# brepjs

CAD modeling for JavaScript.

[![npm](https://img.shields.io/npm/v/brepjs)](https://www.npmjs.com/package/brepjs)
[![CI](https://github.com/andymai/brepjs/actions/workflows/ci.yml/badge.svg)](https://github.com/andymai/brepjs/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-AGPL_3.0-blue.svg)](./LICENSE)

**[Getting Started](./docs/getting-started.md)** · **[Cheat Sheet](./docs/cheat-sheet.md)** · **[Docs](https://andymai.github.io/brepjs/)**

Shapes are exact mathematical boundaries - not triangle meshes - so booleans are precise, measurements are real, and you can export to STEP. TypeScript types prove the geometry is valid at compile time.

```typescript
// Drill a hole, fillet the vertical edges, export to STEP
import { box, cut, cylinder, fillet, edgeFinder, exportSTEP, unwrap } from 'brepjs/quick';

const b = box(30, 20, 10);
const hole = cylinder(5, 15, { at: [15, 10, -2] });
const drilled = unwrap(cut(b, hole));

const edges = edgeFinder().inDirection('Z').findAll(drilled);
const part = unwrap(fillet(drilled, edges, 1.5));

const step = unwrap(exportSTEP(part));
```

## Why?

brepjs grew out of the love and care I put into [gridfinitylayouttool.com](https://gridfinitylayouttool.com). I needed parametric CAD in the browser and I'm not a 3D modeler, but I know TypeScript. [OpenSCAD](https://openscad.org/) nailed code-first CAD but lives outside the JS ecosystem. [replicad](https://replicad.xyz/) proved OpenCascade works in JS but I kept hitting performance walls and fighting the API.

Neither had the type safety I wanted, so brepjs leans hard on it: branded types, `Result<T,E>`, phantom types that prove invariants at compile time. If it compiles, the geometry is valid.

## Status

Production-ready with the OpenCascade kernel. [brepkit](https://github.com/andymai/brepkit), a Rust-based kernel, is in active development as a faster replacement but not yet production-ready. The kernel abstraction layer means switching is a one-line change.

## Benchmarks

Median times, 5 iterations, Node.js on Linux x86_64. Full results in [`benchmarks/results/latest.md`](./benchmarks/results/latest.md).

### WASM bundle size

| Kernel                                                                 | Size                     |
| ---------------------------------------------------------------------- | ------------------------ |
| [brepjs-opencascade](https://www.npmjs.com/package/brepjs-opencascade) | 11 MB (~3.5 MB gzipped)  |
| [brepkit](https://github.com/andymai/brepkit) (Rust, in development)   | 1.8 MB (~600 KB gzipped) |

The WASM kernel loads asynchronously - browsers download ~3.5 MB gzipped, then instantiate quickly once downloaded. brepjs-opencascade is a heavily optimized custom build of OpenCascade: trimmed to only the classes brepjs needs, with custom C++ bulk-extraction classes (mesh, booleans, topology) that bypass the JS-WASM bridge for hot paths.

### Boolean operations

| Operation              | brepjs-opencascade | brepkit | Speedup |
| ---------------------- | ------------------ | ------- | ------- |
| fuse(box, box)         | 83.7 ms            | 5.7 ms  | 15x     |
| cut(box, cylinder)     | 123.8 ms           | 4.2 ms  | 29x     |
| intersect(box, sphere) | 107.1 ms           | 31.9 ms | 3.4x    |

### Primitives

| Operation    | brepjs-opencascade | brepkit | Speedup |
| ------------ | ------------------ | ------- | ------- |
| makeBox      | 5.9 ms             | 0.2 ms  | 25x     |
| makeCylinder | 2.3 ms             | 0.1 ms  | 16x     |
| makeSphere   | 1.4 ms             | 0.5 ms  | 3x      |

### End-to-end

| Operation              | brepjs-opencascade | brepkit | Speedup |
| ---------------------- | ------------------ | ------- | ------- |
| box + chamfer          | 7.8 ms             | 0.1 ms  | 70x     |
| box + fillet           | 8.1 ms             | 0.3 ms  | 28x     |
| multi-boolean model    | 52.0 ms            | 1.7 ms  | 31x     |
| mesh sphere (tol=0.01) | 61.3 ms            | 20.0 ms | 3x      |
| exportSTEP x10         | 19.2 ms            | 0.9 ms  | 21x     |

## What you can build

Code-as-CAD is great for parts defined by parameters: enclosures, brackets, fixtures, gridfinity bins. Less suited for organic sculpting. Good fits: parametric part generators, browser-based CAD tools, automated manufacturing pipelines, 3D printing workflows.

## Install

```bash
npm install brepjs brepjs-opencascade
```

`brepjs/quick` handles WASM init automatically via top-level await (ESM only). Manual setup:

```typescript
import opencascade from 'brepjs-opencascade';
import { initFromOC } from 'brepjs';

const oc = await opencascade();
initFromOC(oc);
```

## Features

**Modeling** - `box`, `cylinder`, `sphere`, `cone`, `torus`, `ellipsoid`, `polyhedron` plus `extrude`, `revolve`, `loft`, `sweep` from 2D sketches

**Booleans** - `fuse`, `cut`, `intersect`, `section`, `split`, `slice` with batch variants `fuseAll`, `cutAll`

**Modifiers** - `fillet`, `chamfer`, `shell`, `offset`, `thicken`, `resize`

**Transforms** - `translate`, `rotate`, `mirror`, `scale`, `applyMatrix`, `composeTransforms`, `transformCopy`

**Sketching** - `draw`, `drawRectangle`, `drawCircle`, `Sketcher`, `sketchCircle`, `sketchHelix` for 2D profiles and paths

**Queries** - `edgeFinder`, `faceFinder`, `wireFinder`, `vertexFinder` with composable filters like `.inDirection('Z')`, `.ofCurveType('CIRCLE')`, `.ofLength(10)`

**Measurement** - `measureVolume`, `measureArea`, `measureLength`, `measureDistance`, `checkInterference`

**Import/Export** - STEP, STL, glTF/GLB, DXF (import + export), 3MF, OBJ, SVG (import). Assembly export with colors and names via `exportAssemblySTEP`

**Advanced Geometry** - `hull`, `minkowski`, `fill`, `roof`, `surfaceFromGrid`

**Colors** - Per-shape colors that propagate through booleans and modifiers

**Rendering** - `mesh` and `toBufferGeometryData` for Three.js / WebGL integration

**Text** - `loadFont`, `drawText`, `sketchText`, `textMetrics`

**Healing** - `autoHeal`, `healSolid`, `healFace`, `isValid` for fixing imported geometry

**Patterns** - `linearPattern`, `circularPattern` for arraying shapes

**Assemblies** - `createAssemblyNode`, `addChild`, `addMate`, `walkAssembly`, `collectShapes`

**Face Tracking** - Face origin tracking and face tags across boolean operations

**Workers** - `createWorkerClient`, `createWorkerHandler` for off-main-thread operations

**History** - `createHistory`, `addStep`, `undoLast`, `replayHistory` for parametric undo/replay

**Error Handling** - `Result<T,E>` instead of exceptions. `isOk()`, `unwrap()`, `match()`

## Architecture

```
Layer 3  sketching/, text/, projection/   High-level API
Layer 2  topology/, operations/, 2d/ ...  Domain logic
Layer 1  core/                            Types, memory, errors
Layer 0  kernel/, utils/                  WASM bindings
```

Imports flow downward only. Boundaries are enforced in CI.

## Documentation

**Learn**

- [Getting Started](./docs/getting-started.md): Install, create shapes, export to STEP
- [B-Rep Concepts](./docs/concepts.md): Vertices, edges, faces, solids - and why they matter
- [Which API?](./docs/which-api.md): Fluent wrapper vs Sketcher vs functional

**Reference**

- [Cheat Sheet](./docs/cheat-sheet.md): Single-page quick reference
- [Cookbook](./docs/cookbook.md): 21 practical recipes for common CAD workflows
- [Three.js Integration](./docs/threejs-integration.md): Render brepjs shapes in the browser
- [Function Lookup](./docs/function-lookup.md): Alphabetical index of every export
- [Error Reference](./docs/errors.md): Error codes and recovery
- [API Reference](https://andymai.github.io/brepjs/): Searchable TypeDoc reference

**Advanced**

- [Memory Management](./docs/memory-management.md): WASM resource cleanup patterns
- [Performance](./docs/performance.md): Optimization tips
- [Custom Kernels](./docs/kernel-swap.md): Swap or write your own geometry kernel
- [Architecture](./docs/architecture.md): Layer diagram and module overview
- [Compatibility](./docs/compatibility.md): Tested environments

## Packages

| Package                                                                | Description                    |
| ---------------------------------------------------------------------- | ------------------------------ |
| [brepjs](https://www.npmjs.com/package/brepjs)                         | Core library                   |
| [brepjs-opencascade](https://www.npmjs.com/package/brepjs-opencascade) | Default geometry kernel (WASM) |

## Projects Using brepjs

- [Gridfinity Layout Tool](https://github.com/andymai/gridfinity-layout-tool): Web-based layout generator for Gridfinity storage systems

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

[AGPL-3.0-only](./LICENSE)
