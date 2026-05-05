# brepjs

CAD modeling for JavaScript.

[![npm](https://img.shields.io/npm/v/brepjs)](https://www.npmjs.com/package/brepjs)
[![CI](https://github.com/andymai/brepjs/actions/workflows/ci.yml/badge.svg)](https://github.com/andymai/brepjs/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)

**[Getting Started](./docs/getting-started.md)** · **[Cheat Sheet](./docs/cheat-sheet.md)** · **[Docs](https://docs.brepjs.dev/)**

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

Neither had the type safety I wanted, so brepjs leans hard on it: branded types, `Result<T,E>`, phantom types that prove invariants at compile time. If it compiles, the geometry is valid. Best for parts defined by parameters (enclosures, brackets, fixtures, gridfinity bins) rather than organic sculpting.

## Status

Production-ready with the OpenCascade kernel. [brepkit](https://github.com/andymai/brepkit), a Rust-based kernel, is in active development as a faster replacement but not yet production-ready. The kernel abstraction layer means switching is a one-line change. See [benchmarks](./benchmarks/results/latest.md) for performance comparisons.

## Install

```bash
npm install brepjs brepjs-opencascade
```

`brepjs/quick` handles WASM init automatically via top-level await (ESM only). Other options:

```typescript
// Auto-detect kernel
import { init } from 'brepjs';
await init();

// Or manual setup
import opencascade from 'brepjs-opencascade';
import { initFromOC } from 'brepjs';
const oc = await opencascade();
initFromOC(oc);
```

## Architecture

```
Layer 3  sketching/, text/, projection/   High-level API
Layer 2  topology/, operations/, 2d/ ...  Domain logic
Layer 1  core/                            Types, memory, errors
Layer 0  kernel/, utils/                  WASM bindings
```

Imports flow downward only. Boundaries are enforced in CI.

## Documentation

The chapter-based guide is the recommended starting point:

- **[Why brepjs](https://docs.brepjs.dev/introduction/why-brepjs)** — what makes it different, who it's for
- **[Install & Initialize](https://docs.brepjs.dev/getting-started/install)** — three init styles, bundler notes
- **[Your First Solid](https://docs.brepjs.dev/getting-started/first-solid)** — the canonical drill-fillet-export workflow
- **[Cheat Sheet](https://docs.brepjs.dev/getting-started/cheat-sheet)** — single-page reference
- **[Core Concepts](https://docs.brepjs.dev/concepts/brep-vs-mesh)** — B-Rep, topology, types, kernels, tolerance
- **[Common Tasks](https://docs.brepjs.dev/tasks/booleans)** — booleans, fillets, sketching, lofts, sweeps, finders, measurement, IO
- **[Three.js Integration](https://docs.brepjs.dev/integration/threejs)** — meshing and rendering
- **[Migration](https://docs.brepjs.dev/migration/replicad)** — coming from Replicad, OpenSCAD, or Three.js
- **[Extending brepjs](https://docs.brepjs.dev/extending/architecture)** — custom kernels, custom operations, architecture
- **[Reference](https://docs.brepjs.dev/reference/glossary)** — glossary, function lookup, error codes, ADRs
- **[API Reference (TypeDoc)](https://andymai.github.io/brepjs/)** — searchable type-level reference

Legacy single-page docs in [./docs/](./docs/) remain available; the chapter site is the canonical location going forward.

## Projects Using brepjs

- [Gridfinity Layout Tool](https://github.com/andymai/gridfinity-layout-tool): Web-based layout generator for Gridfinity storage systems

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## License

[Apache-2.0](./LICENSE)
