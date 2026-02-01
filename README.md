# brepjs

Web CAD library built on OpenCascade. API-compatible replacement for [replicad](https://replicad.xyz) with improved layered architecture and a kernel abstraction layer.

## Installation

```bash
npm install brepjs brepjs-opencascade
```

## Usage

```typescript
import opencascade from 'brepjs-opencascade';
import { setOC, draw, drawRoundedRectangle } from 'brepjs';

// Initialize the WASM kernel
const oc = await opencascade();
setOC(oc);

// Create a shape
const box = draw()
  .hLine(50)
  .vLine(30)
  .hLine(-50)
  .close()
  .sketchOnPlane()
  .extrude(10);
```

## Architecture

Four-layer architecture with enforced import boundaries:

| Layer | Directories | Imports from |
|-------|------------|--------------|
| 0 | `kernel/`, `utils/` | External only |
| 1 | `core/` | Layers 0 |
| 2 | `topology/`, `operations/`, `2d/`, `query/`, `measurement/`, `io/` | Layers 0-2 |
| 3 | `sketching/`, `text/`, `projection/` | Layers 0-3 |

## Development

```bash
npm install
npm run build
npm run test
npm run typecheck
npm run lint
```

## License

MIT
