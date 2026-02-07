# Cheat Sheet

Single-page quick reference for the most common brepjs operations.

## Initialization

```typescript
// Quick start (auto-init, ESM only)
import { makeBox } from 'brepjs/quick';

// Standard (explicit init, works with CJS)
import opencascade from 'brepjs-opencascade';
import { initFromOC, makeBox } from 'brepjs';
const oc = await opencascade();
initFromOC(oc);
```

## Shape Creation

```typescript
import { makeBox, makeCylinder, makeSphere, makeCone, makeTorus } from 'brepjs';

const box = makeBox([0, 0, 0], [30, 20, 10]); // two corners
const cylinder = makeCylinder(5, 20); // radius, height
const sphere = makeSphere(8); // radius
const cone = makeCone(10, 3, 20); // r1, r2, height
const torus = makeTorus(20, 5); // major, minor
```

## Boolean Operations

```typescript
import { fuseShape, cutShape, intersectShape, unwrap } from 'brepjs';

const merged = unwrap(fuseShape(a, b)); // union
const drilled = unwrap(cutShape(a, b)); // subtraction
const common = unwrap(intersectShape(a, b)); // intersection
```

## Transforms

```typescript
import { translateShape, rotateShape, scaleShape, mirrorShape } from 'brepjs';

const moved = translateShape(shape, [10, 0, 0]);
const rotated = rotateShape(shape, 45, [0, 0, 0], [0, 0, 1]); // angle, center, axis
const scaled = scaleShape(shape, 2);
const flipped = mirrorShape(shape, [1, 0, 0]); // mirror across YZ plane
```

## Fillets and Chamfers

```typescript
import { filletShape, chamferShape, edgeFinder, getEdges, unwrap } from 'brepjs';

const rounded = unwrap(filletShape(solid, getEdges(solid), 2)); // all edges, 2mm radius
const vertEdges = edgeFinder().inDirection('Z').findAll(solid);
const selective = unwrap(filletShape(solid, vertEdges, 2)); // vertical edges only
const beveled = unwrap(chamferShape(solid, getEdges(solid), 1)); // all edges, 1mm
```

## Shell (Hollow Out)

```typescript
import { shellShape, faceFinder, unwrap } from 'brepjs';

const topFaces = faceFinder().parallelTo('Z').findAll(solid);
const hollowed = unwrap(shellShape(solid, topFaces, 1)); // 1mm wall thickness
```

## Measurement

```typescript
import { measureVolume, measureArea, measureLength, measureDistance } from 'brepjs';

const vol = measureVolume(solid); // mm³
const area = measureArea(face); // mm²
const len = measureLength(edge); // mm
const dist = measureDistance(shape1, shape2); // mm
```

## 2D to 3D

```typescript
import {
  drawRectangle,
  drawCircle,
  drawingCut,
  drawingToSketchOnPlane,
  sketchExtrude,
} from 'brepjs';

const profile = drawingCut(drawRectangle(50, 30), drawCircle(8).translate([25, 15]));
const sketch = drawingToSketchOnPlane(profile, 'XY');
const solid = sketchExtrude(sketch, 20);
```

## Export and Import

```typescript
import { exportSTEP, exportSTL, importSTEP, meshShape, unwrap, isOk } from 'brepjs';

const step = unwrap(exportSTEP(solid)); // Blob
const stl = unwrap(exportSTL(solid)); // Blob
const imported = await importSTEP(stepBlob); // Result<AnyShape>

const mesh = meshShape(solid, { tolerance: 0.1 });
// mesh.vertices, mesh.triangles, mesh.normals
```

## Memory Management

```typescript
import { withScope, localGC } from 'brepjs';

// Option 1: using syntax (TS 5.9+, preferred)
{
  using temp = makeBox([0, 0, 0], [10, 10, 10]);
}

// Option 2: withScope (deterministic, returns result)
const result = withScope((scope) => {
  const temp = scope.register(makeCylinder(5, 10));
  return unwrap(cutShape(box, temp)); // returned value survives
});

// Option 3: localGC (try/finally)
const [register, cleanup] = localGC();
try {
  register(makeCylinder(5, 10));
} finally {
  cleanup();
}
```

## Error Handling

```typescript
import { cutShape, isOk, unwrap, match } from 'brepjs';

const result = cutShape(a, b);

// Quick: unwrap (throws on error)
const solid = unwrap(result);

// Safe: check first
if (isOk(result)) {
  use(result.value);
}

// Pattern match
match(result, { ok: (s) => render(s), err: (e) => log(e.message) });
```

## Which API?

**Start with the functional API** (`makeBox`, `fuseShape`, `filletShape`) — it covers 90% of use cases. Use the **Drawing API** for complex 2D profiles, and the **Sketcher** for interactive step-by-step sketching.

## More

- **[Zero to Shape](./zero-to-shape.md)** — 60-second first-shape tutorial
- **[Getting Started](./getting-started.md)** — Full walkthrough
- **[Which API?](./which-api.md)** — Detailed API comparison
- **[Memory Management](./memory-management.md)** — Full patterns for WASM cleanup
- **[Error Reference](./errors.md)** — All error codes and recovery
- **[Examples](../examples/)** — 9 runnable examples
