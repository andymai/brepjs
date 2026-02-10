# brepjs

CAD modeling for JavaScript. Build 3D geometry with code.

[![npm](https://img.shields.io/npm/v/brepjs)](https://www.npmjs.com/package/brepjs)
[![CI](https://github.com/andymai/brepjs/actions/workflows/ci.yml/badge.svg)](https://github.com/andymai/brepjs/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)

**[Docs](https://andymai.github.io/brepjs/)** · **[Examples](./examples/)** · **[Cheat Sheet](./docs/cheat-sheet.md)** · **[Getting Started](./docs/getting-started.md)**

```typescript
import { box, cut, cylinder, fillet, edgeFinder, exportSTEP, unwrap } from 'brepjs/quick';

const b = box(30, 20, 10);
const hole = cylinder(5, 15, { at: [15, 10, -2] });
const drilled = unwrap(cut(b, hole));

const edges = edgeFinder().inDirection('Z').findAll(drilled);
const part = unwrap(fillet(drilled, edges, 1.5));

const step = unwrap(exportSTEP(part));
```

## Why brepjs?

Most CAD libraries for the web are mesh-based — they work with triangles, not real geometry. brepjs gives you boundary representation (B-Rep) modeling powered by OpenCascade's WASM build. That means exact geometry, proper booleans, fillets that actually work, and export to formats that real CAD software can open.

Use it for parametric modeling, 3D configurators, CAD file processing, or anywhere you need solid geometry in JavaScript.

## Install

```bash
npm install brepjs brepjs-opencascade
```

`brepjs/quick` auto-initializes the WASM kernel via top-level await (ESM only). For CJS or manual control:

```typescript
import opencascade from 'brepjs-opencascade';
import { initFromOC } from 'brepjs';

const oc = await opencascade();
initFromOC(oc);
```

## Features

**Modeling** — `box`, `cylinder`, `sphere`, `cone`, `torus`, `ellipsoid` plus `extrude`, `revolve`, `loft`, `sweep` from 2D sketches

**Booleans** — `fuse`, `cut`, `intersect`, `section`, `split`, `slice` with batch variants `fuseAll`, `cutAll`

**Modifiers** — `fillet`, `chamfer`, `shell`, `offset`, `thicken` on any solid

**Sketching** — `draw`, `drawRectangle`, `drawCircle`, `Sketcher`, `sketchCircle`, `sketchHelix` for 2D-to-3D workflows

**Queries** — `edgeFinder`, `faceFinder`, `wireFinder`, `vertexFinder` with composable filters like `.inDirection('Z')`, `.ofCurveType('CIRCLE')`, `.ofLength(10)`

**Measurement** — `measureVolume`, `measureArea`, `measureLength`, `measureDistance`, `checkInterference`

**Import/Export** — STEP, STL, IGES, glTF/GLB, DXF, 3MF, OBJ, SVG. Assembly export with colors and names via `exportAssemblySTEP`

**Rendering** — `mesh` and `toBufferGeometryData` for Three.js / WebGL integration

**Text** — `loadFont`, `drawText`, `sketchText` for text outlines and engraving

**Healing** — `autoHeal`, `healSolid`, `healFace`, `isValid` for fixing imported geometry

**Patterns** — `linearPattern`, `circularPattern` for arraying shapes

**Assemblies** — `createAssemblyNode`, `addChild`, `walkAssembly`, `collectShapes` for hierarchical models

**Workers** — `createWorkerClient`, `createWorkerHandler` for off-main-thread operations

**History** — `createHistory`, `addStep`, `undoLast`, `replayHistory` for parametric undo/replay

## A Larger Example

A flanged pipe with bolt holes — showing booleans, shelling, fillets, and finders:

```typescript
import {
  cylinder,
  fuse,
  cut,
  shell,
  fillet,
  rotate,
  faceFinder,
  edgeFinder,
  measureVolume,
  unwrap,
} from 'brepjs/quick';

// Tube + flanges
const tube = cylinder(15, 100);
const body = unwrap(fuse(unwrap(fuse(tube, cylinder(30, 5))), cylinder(30, 5, { at: [0, 0, 95] })));

// Hollow out — find top face, shell to 2mm walls
const topFaces = faceFinder().parallelTo('XY').atDistance(100, [0, 0, 0]).findAll(body);
const hollowed = unwrap(shell(body, topFaces, 2));

// Fillet the tube-to-flange transitions
const filletEdges = edgeFinder()
  .ofCurveType('CIRCLE')
  .ofLength(2 * Math.PI * 15)
  .findAll(hollowed);
let result = unwrap(fillet(hollowed, filletEdges, 3));

// Bolt holes around each flange
for (let i = 0; i < 6; i++) {
  const angle = 60 * i;
  const hole = rotate(cylinder(3, 10, { at: [22, 0, -2] }), angle, { axis: [0, 0, 1] });
  result = unwrap(cut(result, hole));
}

console.log('Volume:', measureVolume(result), 'mm³');
```

## Common Patterns

### Memory cleanup

WASM objects aren't garbage-collected. Use `using` (TS 5.9+) for automatic cleanup, or `gcWithScope()`/`localGC()` for explicit control:

```typescript
import { box, cylinder, cut, unwrap, gcWithScope, localGC } from 'brepjs/quick';

// Option 1: using keyword — auto-disposed at block end
{
  using temp = box(10, 10, 10);
  using hole = cylinder(3, 15);
  const result = unwrap(cut(temp, hole));
  // temp and hole freed here; result survives
}

// Option 2: gcWithScope — GC-based cleanup
function buildPart() {
  const r = gcWithScope();
  const b = r(box(10, 10, 10));
  const hole = r(cylinder(3, 15));
  return unwrap(cut(b, hole)); // b and hole cleaned up when r is GC'd
}

// Option 3: localGC — deterministic cleanup
const [register, cleanup] = localGC();
try {
  const b = register(box(10, 10, 10));
  return unwrap(cut(b, register(cylinder(3, 15))));
} finally {
  cleanup(); // immediate disposal
}
```

### Immutability

All operations return new shapes — the original is never modified:

```typescript
import { box, translate, rotate, measureVolume } from 'brepjs/quick';

const original = box(30, 20, 10);
const moved = translate(original, [100, 0, 0]);
const rotated = rotate(moved, 45, { axis: [0, 0, 1] });

// original is unchanged
console.log(measureVolume(original) === measureVolume(moved)); // true — same geometry, different position
```

### Chaining transforms

Apply translation then rotation (functional or wrapper style):

```typescript
import { box, translate, rotate, shape } from 'brepjs/quick';

// Functional — each call returns a new shape
const b = box(30, 20, 10);
const moved = translate(b, [50, 0, 0]);
const result = rotate(moved, 45, { axis: [0, 0, 1] });

// Wrapper — fluent chaining
const same = shape(box(30, 20, 10))
  .translate([50, 0, 0])
  .rotate(45, { axis: [0, 0, 1] }).val;
```

### 2D sketch to 3D extrusion

Draw a 2D profile, then extrude it to create a solid:

```typescript
import { drawRectangle, drawCircle, drawingCut, drawingToSketchOnPlane, shape } from 'brepjs/quick';

// Draw 2D rectangle with a hole
const profile = drawingCut(drawRectangle(50, 30), drawCircle(8).translate([25, 15]));

// Convert to sketch on XY plane, extrude 20mm
const sketch = drawingToSketchOnPlane(profile, 'XY');
const solid = shape(sketch.face()).extrude(20).val;

// Or use the sketch shortcut directly
import { sketchRectangle } from 'brepjs/quick';
const quickBox = sketchRectangle(50, 30).extrude(20);
```

### STEP import and export

Load a STEP file, modify it, and re-export:

```typescript
import { importSTEP, exportSTEP, shape, unwrap } from 'brepjs/quick';

// Import from Blob (e.g., from file input or fs.readFileSync)
const imported = unwrap(await importSTEP(stepBlob));

// Modify the imported shape
const modified = shape(imported).fillet(2).translate([0, 0, 10]).val;

// Export back to STEP
const outputBlob = unwrap(exportSTEP(modified));

// Save to disk (Node.js)
import { writeFileSync } from 'fs';
writeFileSync('output.step', Buffer.from(await outputBlob.arrayBuffer()));
```

### Custom WASM kernel

`initFromOC()` accepts any OpenCascade WASM instance, enabling custom builds:

```typescript
import { initFromOC, box } from 'brepjs';

// Standard build
import opencascade from 'brepjs-opencascade';
const oc = await opencascade();
initFromOC(oc);

// Or use a custom/alternative OpenCascade WASM build
import customOC from 'my-custom-opencascade';
const customKernel = await customOC({ locateFile: (f) => `/wasm/${f}` });
initFromOC(customKernel); // same API — any compatible OC instance works
```

The kernel abstraction layer in `src/kernel/` translates brepjs calls to OCCT operations, so any WASM build exposing the standard OpenCascade API is compatible.

### Parametric variations

Generate multiple part variations by iterating over dimensions:

```typescript
import { box, cylinder, cut, fillet, edgeFinder, unwrap, exportSTEP } from 'brepjs/quick';

function makeBracket(width: number, holeRadius: number) {
  const base = box(width, 20, 10);
  const hole = cylinder(holeRadius, 15, { at: [width / 2, 10, -2] });
  const drilled = unwrap(cut(base, hole));
  const edges = edgeFinder().inDirection('Z').findAll(drilled);
  return unwrap(fillet(drilled, edges, 1.5));
}

// Generate variants
for (const width of [30, 40, 50, 60]) {
  const part = makeBracket(width, width / 10);
  const step = unwrap(exportSTEP(part));
  console.log(`${width}mm bracket: ${step.size} bytes`);
}
```

## Examples

```bash
npm run example examples/hello-world.ts
```

| Example                                                 | What it does                                |
| ------------------------------------------------------- | ------------------------------------------- |
| [hello-world.ts](./examples/hello-world.ts)             | Create a box, measure it, export it         |
| [basic-primitives.ts](./examples/basic-primitives.ts)   | Primitives and boolean operations           |
| [mechanical-part.ts](./examples/mechanical-part.ts)     | Bracket with holes, slots, and SVG drawings |
| [2d-to-3d.ts](./examples/2d-to-3d.ts)                   | Sketch a profile, extrude to 3D             |
| [parametric-part.ts](./examples/parametric-part.ts)     | Configurable flanged pipe fitting           |
| [threejs-rendering.ts](./examples/threejs-rendering.ts) | Generate mesh data for Three.js             |
| [browser-viewer.ts](./examples/browser-viewer.ts)       | Standalone HTML viewer with orbit controls  |
| [import-export.ts](./examples/import-export.ts)         | Load, modify, and re-export STEP files      |
| [text-engraving.ts](./examples/text-engraving.ts)       | Engrave text on a solid shape               |

## Imports

Everything is available from the top level:

```typescript
import { box, translate, fuse, exportSTEP } from 'brepjs';
```

Sub-path imports for tree-shaking:

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

## Documentation

- [API Reference](https://andymai.github.io/brepjs/) — Searchable TypeDoc reference
- [Getting Started](./docs/getting-started.md) — Install to first part
- [B-Rep Concepts](./docs/concepts.md) — Vertices, edges, faces, solids
- [Cheat Sheet](./docs/cheat-sheet.md) — Single-page reference for common operations
- [Which API?](./docs/which-api.md) — Sketcher vs functional vs Drawing
- [Function Lookup](./docs/function-lookup.md) — Alphabetical index of every export
- [Memory Management](./docs/memory-management.md) — Resource cleanup patterns
- [Error Reference](./docs/errors.md) — Error codes and recovery
- [Architecture](./docs/architecture.md) — Layer diagram and module overview
- [Performance](./docs/performance.md) — Optimization tips
- [Compatibility](./docs/compatibility.md) — Tested environments

## Packages

| Package                                                                | Description            |
| ---------------------------------------------------------------------- | ---------------------- |
| [brepjs](https://www.npmjs.com/package/brepjs)                         | Core library           |
| [brepjs-opencascade](https://www.npmjs.com/package/brepjs-opencascade) | OpenCascade WASM build |

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
