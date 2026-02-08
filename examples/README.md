# Examples

Complete workflow examples demonstrating brepjs capabilities, ordered from beginner to advanced.

## Running Examples

All examples auto-initialize the WASM kernel via `_setup.ts` — just run them directly:

```bash
# Install dependencies (from the repo root)
npm install

# Run any example
npm run example examples/hello-world.ts
npm run example examples/basic-primitives.ts
npm run example examples/mechanical-part.ts
```

Each example imports `'./_setup.js'` as its first import, which calls `opencascade()` and `initFromOC()` via top-level await. You don't need to write any initialization code yourself.

## Beginner

### [hello-world.ts](./hello-world.ts)

**Start here.** Create a box, measure it, export it — the absolute minimum brepjs program.

**Concepts:** `makeBox`, `measureVolume`, `exportSTEP`, `unwrap`

### [basic-primitives.ts](./basic-primitives.ts)

Create primitive shapes (box, cylinder, sphere) and combine them with boolean operations.

**Concepts:** primitives, `fuseShape`, `cutShape`, `intersectShape`, `Result` handling with `isOk`

## Intermediate

### [mechanical-part.ts](./mechanical-part.ts)

Build a bracket with 4 mounting holes and a center slot. Generates SVG technical drawings (front and top views).

**Concepts:** batch booleans with `cutAll`, `translateShape`, `drawProjection`, SVG output

**Visual output:** `examples/output/bracket-front.svg`, `examples/output/bracket-top.svg`

### [2d-to-3d.ts](./2d-to-3d.ts)

Sketch a 2D profile and extrude it to a 3D solid. Exports the 2D profile as SVG.

**Concepts:** `drawRectangle`, `drawCircle`, `drawingCut`, `drawingToSketchOnPlane`, `sketchExtrude`, `toSVG`

**Visual output:** `examples/output/2d-profile.svg`

### [import-export.ts](./import-export.ts)

Load a STEP file, modify it, export in multiple formats.

**Concepts:** `importSTEP`, `exportSTEP`, `exportSTL`, `scaleShape`, `meshShape`

## Advanced

### [parametric-part.ts](./parametric-part.ts)

Build a configurable flanged pipe fitting with bolt holes. Shows how to wrap brepjs operations into a reusable parametric function.

**Concepts:** parametric design, `shellShape`, `filletShape`, `faceFinder`, `edgeFinder`, `rotateShape`

### [threejs-rendering.ts](./threejs-rendering.ts)

Convert brepjs shapes to mesh data for Three.js, then generate a standalone HTML file with an interactive 3D viewer.

**Concepts:** `meshShape`, `toBufferGeometryData`, Three.js integration, HTML generation

**Visual output:** `examples/output/threejs-part.html`

### [browser-viewer.ts](./browser-viewer.ts)

Self-contained browser example: builds a shape, meshes it, and generates a standalone HTML file with Three.js orbit controls, lighting, and a ground grid. No bundler required.

**Concepts:** `meshShape`, `toBufferGeometryData`, `describeShape`, standalone HTML viewer

**Visual output:** `examples/output/viewer.html`

### [text-engraving.ts](./text-engraving.ts)

Create a nameplate with engraved text (workflow demonstration).

**Concepts:** `loadFont`, `textBlueprints`, face sketching, subtractive engraving

## Visual Output

Several examples generate SVG and HTML files in `examples/output/`:

| Example                | Output File(s)                                         | Type |
| ---------------------- | ------------------------------------------------------ | ---- |
| `2d-to-3d.ts`          | `examples/output/2d-profile.svg`                       | SVG  |
| `mechanical-part.ts`   | `examples/output/bracket-front.svg`, `bracket-top.svg` | SVG  |
| `threejs-rendering.ts` | `examples/output/threejs-part.html`                    | HTML |
| `browser-viewer.ts`    | `examples/output/viewer.html`                          | HTML |

SVG files can be opened in any browser or image viewer. HTML files contain embedded Three.js viewers with orbit controls — just open them in a browser.

The `examples/output/` directory is git-ignored. Run the examples to generate the files.

## Common Patterns

### Error Handling

All fallible operations return `Result<T, BrepError>`:

```typescript
import { fuseShape, isOk, unwrap } from 'brepjs';

const result = fuseShape(shape1, shape2);

// Check before using
if (isOk(result)) {
  const fused = result.value;
}

// Or unwrap (throws on error)
const fused = unwrap(result);
```

### Memory Management

Use `using` for automatic cleanup of temporary shapes:

```typescript
{
  using tempShape = makeBox([10, 10, 10]);
  // tempShape automatically disposed at block end
}
```

See [Memory Management](../docs/memory-management.md) for details.

## Requirements

- Node.js 24+
- brepjs and brepjs-opencascade packages installed
