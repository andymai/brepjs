# brepjs

CAD modeling for JavaScript. Build 3D geometry with code.

[![npm](https://img.shields.io/npm/v/brepjs)](https://www.npmjs.com/package/brepjs)
[![CI](https://github.com/andymai/brepjs/actions/workflows/ci.yml/badge.svg)](https://github.com/andymai/brepjs/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-AGPL_3.0-blue.svg)](./LICENSE)

**[Docs](https://andymai.github.io/brepjs/)** · **[Cheat Sheet](./docs/cheat-sheet.md)** · **[Getting Started](./docs/getting-started.md)**

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

Most CAD libraries for the web are mesh-based — they work with triangles, not real geometry. brepjs gives you boundary representation (B-Rep) modeling with a pluggable geometry kernel. Exact booleans, fillets, and export to formats real CAD software can open.

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

**Modeling** — `box`, `cylinder`, `sphere`, `cone`, `torus`, `ellipsoid`, `polyhedron` plus `extrude`, `revolve`, `loft`, `sweep` from 2D sketches

**Booleans** — `fuse`, `cut`, `intersect`, `section`, `split`, `slice` with batch variants `fuseAll`, `cutAll`

**Modifiers** — `fillet`, `chamfer`, `shell`, `offset`, `thicken`, `resize`. Accepts `ShapeFinder` directly

**Transforms** — `translate`, `rotate`, `mirror`, `scale`, `applyMatrix`, `composeTransforms`, `transformCopy`

**Sketching** — `draw`, `drawRectangle`, `drawCircle`, `Sketcher`, `sketchCircle`, `sketchHelix` for 2D-to-3D workflows

**Queries** — `edgeFinder`, `faceFinder`, `wireFinder`, `vertexFinder` with composable filters like `.inDirection('Z')`, `.ofCurveType('CIRCLE')`, `.ofLength(10)`

**Measurement** — `measureVolume`, `measureArea`, `measureLength`, `measureDistance`, `checkInterference`

**Import/Export** — STEP, STL, glTF/GLB, DXF (import + export), 3MF, OBJ, SVG (import). Assembly export with colors and names via `exportAssemblySTEP`

**Advanced Geometry** — `hull`, `minkowski`, `fill`, `roof`, `surfaceFromGrid`

**Colors** — Per-shape colors that propagate through booleans and modifiers

**Rendering** — `mesh` and `toBufferGeometryData` for Three.js / WebGL integration

**Text** — `loadFont`, `drawText`, `sketchText`, `textMetrics`

**Healing** — `autoHeal`, `healSolid`, `healFace`, `isValid` for fixing imported geometry

**Patterns** — `linearPattern`, `circularPattern` for arraying shapes

**Assemblies** — `createAssemblyNode`, `addChild`, `walkAssembly`, `collectShapes`, assembly mates

**Face Tracking** — Face origin tracking and face tags across boolean operations

**Workers** — `createWorkerClient`, `createWorkerHandler` for off-main-thread operations

**History** — `createHistory`, `addStep`, `undoLast`, `replayHistory` for parametric undo/replay

## Common Patterns

### Memory cleanup

WASM objects aren't garbage-collected. Use `using` (TS 5.9+) or `DisposalScope` for deterministic cleanup:

```typescript
import { box, cylinder, cut, unwrap, DisposalScope } from 'brepjs/quick';

// Option 1: using keyword — auto-disposed at block end
{
  using temp = box(10, 10, 10);
  using hole = cylinder(3, 15);
  const result = unwrap(cut(temp, hole));
  // temp and hole freed here; result survives
}

// Option 2: DisposalScope — deterministic cleanup
function buildPart() {
  using scope = new DisposalScope();
  const b = scope.register(box(10, 10, 10));
  const hole = scope.register(cylinder(3, 15));
  return unwrap(cut(b, hole)); // b and hole freed when scope exits
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

### Custom geometry kernel

brepjs is kernel-agnostic — you can register alternative geometry kernels at runtime:

```typescript
import { registerKernel, withKernel, box } from 'brepjs';

registerKernel('my-kernel', myAdapter);
const result = box(10, 10, 10); // uses your kernel
```

The kernel abstraction layer in `src/kernel/` ensures brepjs code never touches kernel internals directly. See the [Custom Kernel Guide](docs/kernel-swap.md) for writing your own `KernelAdapter`.

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
import { sketchCircle, draw, drawRectangle, drawCircle } from 'brepjs/sketching';
import { createAssemblyNode } from 'brepjs/operations';
import { createWorkerClient } from 'brepjs/worker';
import { Result, isOk, unwrap } from 'brepjs/result';
import { toVec3, vecAdd, vecNormalize } from 'brepjs/vectors';
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
- [Zero to Shape](./docs/zero-to-shape.md) — First shape in 60 seconds
- [Getting Started](./docs/getting-started.md) — Install to first part
- [B-Rep Concepts](./docs/concepts.md) — Vertices, edges, faces, solids
- [Cheat Sheet](./docs/cheat-sheet.md) — Single-page reference for common operations
- [Cookbook](./docs/cookbook.md) — Practical recipes for common CAD workflows
- [Which API?](./docs/which-api.md) — Sketcher vs functional vs Drawing
- [Function Lookup](./docs/function-lookup.md) — Alphabetical index of every export
- [Memory Management](./docs/memory-management.md) — Resource cleanup patterns
- [Error Reference](./docs/errors.md) — Error codes and recovery
- [Architecture](./docs/architecture.md) — Layer diagram and module overview
- [Performance](./docs/performance.md) — Optimization tips
- [Compatibility](./docs/compatibility.md) — Tested environments

## Packages

| Package                                                                | Description                    |
| ---------------------------------------------------------------------- | ------------------------------ |
| [brepjs](https://www.npmjs.com/package/brepjs)                         | Core library                   |
| [brepjs-opencascade](https://www.npmjs.com/package/brepjs-opencascade) | Default geometry kernel (WASM) |

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

[AGPL-3.0-only](./LICENSE)
