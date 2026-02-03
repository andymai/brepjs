# brepjs

[![CI](https://github.com/andymai/brepjs/actions/workflows/ci.yml/badge.svg)](https://github.com/andymai/brepjs/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/brepjs)](https://www.npmjs.com/package/brepjs)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)

Web CAD library built on OpenCascade with a layered architecture and kernel abstraction layer.

## Installation

```bash
npm install brepjs brepjs-opencascade
```

## Quick Start

```typescript
import opencascade from 'brepjs-opencascade';
import {
  setOC,
  makeBox,
  makeCylinder,
  castShape,
  fuseShapes,
  cutShape,
  translateShape,
  fnMeasureVolume,
  fnExportSTEP,
  unwrap,
} from 'brepjs';

// Initialize the WASM kernel
const oc = await opencascade();
setOC(oc);

// Create primitive shapes
const box = castShape(makeBox([0, 0, 0], [50, 30, 20]).wrapped);
const cylinder = castShape(makeCylinder(8, 25).translate([25, 15, -2]).wrapped);

// Boolean operations
const withHole = unwrap(cutShape(box, cylinder));

// Transform
const moved = translateShape(withHole, [100, 0, 0]);

// Measure
console.log('Volume:', fnMeasureVolume(moved), 'mm³');

// Export
const stepBlob = unwrap(fnExportSTEP(moved));
```

## Examples

See the [examples/](./examples/) directory for complete workflows:

- **[basic-primitives.ts](./examples/basic-primitives.ts)** — Create shapes and boolean operations
- **[mechanical-part.ts](./examples/mechanical-part.ts)** — Build a bracket with holes
- **[2d-to-3d.ts](./examples/2d-to-3d.ts)** — Sketch to extrusion workflow
- **[import-export.ts](./examples/import-export.ts)** — Load, modify, export files
- **[text-engraving.ts](./examples/text-engraving.ts)** — Engrave text on shapes

## Documentation

- **[Architecture](./docs/architecture.md)** — Layer diagram and module overview
- **[Performance](./docs/performance.md)** — Optimization best practices
- **[Memory Management](./docs/memory-management.md)** — Resource cleanup patterns
- **[Error Reference](./docs/errors.md)** — Error codes and recovery
- **[Compatibility](./docs/compatibility.md)** — Tested environments

## Architecture

Four-layer architecture with enforced import boundaries:

```
Layer 3: sketching/, text/, projection/     (High-level API)
Layer 2: topology/, operations/, 2d/, ...   (Domain)
Layer 1: core/                               (Types, memory, errors)
Layer 0: kernel/, utils/                     (WASM bindings)
```

See [docs/architecture.md](./docs/architecture.md) for the full diagram.

## API Styles

brepjs supports two API styles:

**Functional API (recommended):**
```typescript
const box = castShape(makeBox([0, 0, 0], [10, 10, 10]).wrapped);
const moved = translateShape(box, [5, 0, 0]); // Returns new shape
```

**Legacy class API:**
```typescript
const box = makeBox([10, 10, 10]);
box.translate([5, 0, 0]); // Mutates in place
```

## Development

```bash
npm install
npm run build        # Build library
npm run test         # Run tests
npm run typecheck    # Type check
npm run lint         # Lint
npm run bench        # Run benchmarks
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines.

## License

[Apache-2.0](./LICENSE)
