# Cheat Sheet

Single-page quick reference for the most common brepjs operations.

## Initialization

```typescript
// Quick start (auto-init, ESM only)
import { box } from 'brepjs/quick';

// Standard (explicit init, works with CJS)
import opencascade from 'brepjs-opencascade';
import { initFromOC, box } from 'brepjs';
const oc = await opencascade();
initFromOC(oc);
```

## Shape Creation

```typescript
import { box, cylinder, sphere, cone, torus } from 'brepjs';

const b = box(30, 20, 10); // width, depth, height
const cyl = cylinder(5, 20); // radius, height
const sph = sphere(8); // radius
const cn = cone(10, 3, 20); // r1, r2, height
const tor = torus(20, 5); // major, minor
```

## Boolean Operations

```typescript
import { shape } from 'brepjs';

const merged = shape(a).fuse(b).val; // union
const drilled = shape(a).cut(b).val; // subtraction
const common = shape(a).intersect(b).val; // intersection

// Batch operations
const cut3holes = shape(plate).cutAll([hole1, hole2, hole3]).val;
```

## Transforms

```typescript
import { shape } from 'brepjs';

const moved = shape(myShape).translate([10, 0, 0]).val;
const rotated = shape(myShape).rotate(45, { at: [0, 0, 0], axis: [0, 0, 1] }).val;
const scaled = shape(myShape).scale(2).val;
const flipped = shape(myShape).mirror({ normal: [1, 0, 0] }).val; // mirror across YZ plane

// Axis shortcuts
const positioned = shape(myShape).moveX(10).rotateZ(45).val;
```

## Fillets and Chamfers

```typescript
import { shape } from 'brepjs';

const rounded = shape(solid).fillet(2).val; // all edges, 2mm radius
const selective = shape(solid).fillet((e) => e.inDirection('Z'), 2).val; // vertical edges only
const beveled = shape(solid).chamfer((e) => e.inDirection('Z'), 1).val; // vertical edges, 1mm

// Variable radius filleting
const variable = shape(solid).fillet(
  (e) => e.inDirection('Z'),
  (edge) => (edge.length() > 50 ? 5 : 2)
).val;
```

## Shell (Hollow Out)

```typescript
import { shape } from 'brepjs';

const hollowed = shape(solid).shell((f) => f.parallelTo('Z'), 1).val; // remove top faces, 1mm wall thickness
```

## Measurement

```typescript
import { shape } from 'brepjs';

const vol = shape(solid).volume(); // mm³
const area = shape(face).area(); // mm²
const len = shape(edge).length(); // mm

// For distance between shapes, use the functional API
import { measureDistance } from 'brepjs';
const dist = measureDistance(shape1, shape2); // mm
```

## 2D to 3D

```typescript
import { drawRectangle, drawCircle, drawingCut, drawingToSketchOnPlane, shape } from 'brepjs';

const profile = drawingCut(drawRectangle(50, 30), drawCircle(8).translate([25, 15]));
const sketch = drawingToSketchOnPlane(profile, 'XY');
const solid = shape(sketch.face()).extrude(20).val;

// Or revolve around an axis
const revolved = shape(sketch.face()).revolve({ axis: [0, 1, 0], angle: 270 }).val;
```

## Export and Import

```typescript
import { exportSTEP, exportSTL, importSTEP, shape, unwrap, isOk } from 'brepjs';

// Export (use functional API for file formats)
const step = unwrap(exportSTEP(solid)); // Blob
const stl = unwrap(exportSTL(solid)); // Blob
const imported = await importSTEP(stepBlob); // Result<AnyShape>

// BREP serialization (use wrapper)
const brepString = shape(solid).toBREP();

// Meshing for rendering
const m = shape(solid).mesh({ tolerance: 0.1 });
// m.vertices, m.triangles, m.normals
```

## Memory Management

```typescript
import { withScope, localGC } from 'brepjs';

// Option 1: using syntax (TS 5.9+, preferred)
{
  using temp = box(10, 10, 10);
}

// Option 2: withScope (deterministic, returns result)
const result = withScope((scope) => {
  const temp = scope.register(cylinder(5, 10));
  return unwrap(cut(b, temp)); // returned value survives
});

// Option 3: localGC (try/finally)
const [register, cleanup] = localGC();
try {
  register(cylinder(5, 10));
} finally {
  cleanup();
}
```

## Error Handling

```typescript
import { shape, BrepWrapperError } from 'brepjs';

// Wrapper style - throws BrepWrapperError on failure
try {
  const part = shape(box).cut(hole).fillet(2).val;
  render(part);
} catch (error) {
  if (error instanceof BrepWrapperError) {
    console.error(error.code, error.message);
  }
}

// Functional API - returns Result<T> for explicit error handling
import { cut, isOk, unwrap, match } from 'brepjs';

const result = cut(a, b);
if (isOk(result)) {
  use(result.value);
} else {
  console.error(result.error.message);
}
```

## Which API?

**Start with the fluent wrapper** (`shape().cut().fillet()`) — it's the canonical brepjs API and provides the cleanest syntax. Use the **Drawing API** for complex 2D profiles, and the **Sketcher** for interactive step-by-step sketching. Only use the **functional API** when you need explicit `Result` handling at each step.

## More

- **[Zero to Shape](./zero-to-shape.md)** -- 60-second first-shape tutorial
- **[Getting Started](./getting-started.md)** -- Full walkthrough
- **[Which API?](./which-api.md)** -- Detailed API comparison
- **[Memory Management](./memory-management.md)** -- Full patterns for WASM cleanup
- **[Error Reference](./errors.md)** -- All error codes and recovery
- **[Examples](../examples/)** -- 9 runnable examples
