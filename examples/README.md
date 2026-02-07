# Examples

Complete workflow examples demonstrating brepjs capabilities, ordered from beginner to advanced.

## Running Examples

```bash
# Install dependencies (from the repo root)
npm install

# Run any example
npm run example examples/hello-world.ts
npm run example examples/basic-primitives.ts
npm run example examples/mechanical-part.ts
```

## Beginner

### [hello-world.ts](./hello-world.ts)

**Start here.** Create a box, measure it, export it — the absolute minimum brepjs program.

**Concepts:** `makeBox`, `measureVolume`, `exportSTEP`, `unwrap`

### [basic-primitives.ts](./basic-primitives.ts)

Create primitive shapes (box, cylinder, sphere) and combine them with boolean operations.

**Concepts:** primitives, `fuseShapes`, `cutShape`, `intersectShapes`, `Result` handling with `isOk`

## Intermediate

### [mechanical-part.ts](./mechanical-part.ts)

Build a bracket with 4 mounting holes and a center slot.

**Concepts:** batch booleans with `cutAll`, `translateShape`, material removal calculation

### [2d-to-3d.ts](./2d-to-3d.ts)

Sketch a 2D profile and extrude it to a 3D solid.

**Concepts:** `drawRectangle`, `drawCircle`, `drawingCut`, `drawingToSketchOnPlane`, `sketchExtrude`

### [import-export.ts](./import-export.ts)

Load a STEP file, modify it, export in multiple formats.

**Concepts:** `importSTEP`, `exportSTEP`, `exportSTL`, `scaleShape`, `meshShape`

## Advanced

### [parametric-part.ts](./parametric-part.ts)

Build a configurable flanged pipe fitting with bolt holes. Shows how to wrap brepjs operations into a reusable parametric function.

**Concepts:** parametric design, `shellShape`, `filletShape`, `faceFinder`, `edgeFinder`, `rotateShape`

### [threejs-rendering.ts](./threejs-rendering.ts)

Convert brepjs shapes to mesh data for Three.js or any WebGL renderer.

**Concepts:** `meshShape`, vertex/normal/index buffers, Three.js integration pattern

### [text-engraving.ts](./text-engraving.ts)

Create a nameplate with engraved text (workflow demonstration).

**Concepts:** `loadFont`, `textBlueprints`, face sketching, subtractive engraving

## Common Patterns

### Error Handling

All fallible operations return `Result<T, BrepError>`:

```typescript
import { fuseShapes, isOk, unwrap } from 'brepjs';

const result = fuseShapes(shape1, shape2);

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

- Node.js 20+
- brepjs and brepjs-opencascade packages installed
