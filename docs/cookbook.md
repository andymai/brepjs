# Cookbook: Common CAD Workflows

Practical recipes for common CAD tasks using brepjs. All examples use the canonical `shape()` wrapper and `brepjs/quick` for simplicity.

## Prerequisites

```typescript
import { box, cylinder, sphere, shape /* ... */ } from 'brepjs/quick';
```

---

## 1. Box with Rounded Corners and Hole

**Task:** Create a 30×20×10mm box with 2mm rounded corners and a centered 5mm hole through the top.

```typescript
import { box, cylinder, shape } from 'brepjs/quick';

const part = shape(box(30, 20, 10))
  .fillet(2) // Round all edges
  .cut(cylinder(2.5, 15, { at: [15, 10, 5] })).val; // Drill centered hole

console.log('Volume:', shape(part).volume(), 'mm³');
```

**Key concepts:** Fluent chaining, filleting all edges, centered drilling with `at` parameter.

---

## 2. Import STL and Measure Properties

**Task:** Load an STL file, measure its volume and surface area, then export to STEP.

```typescript
import { importSTL, shape, exportSTEP, unwrap } from 'brepjs/quick';

// Import the mesh
const meshResult = await importSTL(stlBlob);
const mesh = unwrap(meshResult);

// Measure properties
const volume = shape(mesh).volume();
const area = shape(mesh).area();

console.log(`Volume: ${volume.toFixed(2)} mm³`);
console.log(`Surface area: ${area.toFixed(2)} mm²`);

// Export to STEP for CAD software
const stepBlob = unwrap(exportSTEP(mesh));
```

**Key concepts:** Import/export, measurement functions, Result unwrapping.

---

## 3. Parametric Bracket

**Task:** Create a configurable bracket with mounting holes.

```typescript
import { box, cylinder, shape } from 'brepjs/quick';

function bracket(width: number, height: number, thickness: number, holeRadius: number) {
  const base = shape(box(width, thickness, height));

  // Add mounting holes at each corner
  const hole1 = cylinder(holeRadius, thickness + 1, { at: [5, 0, 5] });
  const hole2 = cylinder(holeRadius, thickness + 1, { at: [width - 5, 0, 5] });
  const hole3 = cylinder(holeRadius, thickness + 1, { at: [5, 0, height - 5] });
  const hole4 = cylinder(holeRadius, thickness + 1, { at: [width - 5, 0, height - 5] });

  return base
    .cut(hole1)
    .cut(hole2)
    .cut(hole3)
    .cut(hole4)
    .fillet((e) => e.inDirection('Z'), 2).val; // Round vertical edges
}

const myBracket = bracket(50, 40, 5, 2);
```

**Key concepts:** Parametric design, multiple cuts, selective filleting with finders.

---

## 4. Export to Multiple Formats

**Task:** Create a shape and export to STEP, STL, and GLTF.

```typescript
import { box, shape, exportSTEP, exportSTL, exportGltf, unwrap } from 'brepjs/quick';

const part = shape(box(20, 20, 20)).fillet(2).val;

// Export to different formats
const stepBlob = unwrap(exportSTEP(part));
const stlBlob = unwrap(exportSTL(part));
const gltfBlob = unwrap(exportGltf(part));

// Save to files (Node.js)
import { writeFileSync } from 'fs';
writeFileSync('part.step', await stepBlob.arrayBuffer());
writeFileSync('part.stl', await stlBlob.arrayBuffer());
writeFileSync('part.gltf', await gltfBlob.text());
```

**Key concepts:** Multi-format export, file I/O in Node.js.

---

## 5. Linear and Circular Patterns

**Task:** Create a grid of cylinders and a circular pattern of holes.

```typescript
import { cylinder, box, shape, linearPattern, circularPattern } from 'brepjs/quick';

// Linear pattern: 3×3 grid of cylinders
const pin = cylinder(2, 10);
const pins = linearPattern(pin, { count: [3, 3, 1], spacing: [10, 10, 0] });

// Circular pattern: 6 holes around a center
const baseDisc = cylinder(30, 5);
const hole = cylinder(3, 6, { at: [20, 0, 0] });
const holes = circularPattern(hole, 6, { axis: [0, 0, 1], at: [0, 0, 0] });

const plate = shape(baseDisc).cutAll(holes).val;
```

**Key concepts:** Patterns for repetition, `cutAll()` for batch operations.

---

## 6. Selective Fillets and Chamfers

**Task:** Round specific edges and chamfer others using finders.

```typescript
import { box, shape } from 'brepjs/quick';

const part = shape(box(30, 20, 10))
  .fillet((e) => e.inDirection('Z'), 2) // Round vertical edges
  .chamfer((e) => e.inDirection('X'), 1).val; // Chamfer X-direction edges
```

**Key concepts:** Finder callbacks for selective edge operations.

---

## 7. Combine Multiple Shapes with Booleans

**Task:** Create a complex part from multiple primitive operations.

```typescript
import { box, cylinder, sphere, shape } from 'brepjs/quick';

const body = box(40, 30, 20);
const cutout = cylinder(8, 25, { at: [20, 15, 0] });
const fillet = sphere(5, { at: [5, 5, 5] });

const part = shape(body)
  .cut(cutout) // Subtract cylinder
  .fuse(fillet) // Add fillet sphere
  .fillet((e) => e.parallel([0, 0, 1]), 2).val; // Round parallel edges
```

**Key concepts:** Boolean operations (cut, fuse), edge filtering with `parallel()`.

---

## 8. Simple Assembly with Transforms

**Task:** Create an assembly of multiple positioned parts.

```typescript
import { box, cylinder, shape } from 'brepjs/quick';

// Base plate
const base = box(100, 100, 5);

// Create 4 posts at corners
const post = cylinder(5, 30);
const posts = [
  shape(post).translate([10, 10, 5]).val,
  shape(post).translate([90, 10, 5]).val,
  shape(post).translate([10, 90, 5]).val,
  shape(post).translate([90, 90, 5]).val,
];

// Combine into single solid (optional)
const assembly = shape(base).fuseAll(posts).val;
```

**Key concepts:** Transforms (translate), combining multiple parts with `fuseAll()`.

---

## 9. Measure Distances and Check Interference

**Task:** Measure distance between two shapes and check if they interfere.

```typescript
import { box, sphere, measureDistance, checkInterference } from 'brepjs/quick';

const box1 = box(20, 20, 20);
const box2 = shape(box(20, 20, 20)).translate([25, 0, 0]).val;

// Measure minimum distance between shapes
const distance = measureDistance(box1, box2);
console.log('Distance:', distance, 'mm');

// Check for interference (overlap)
const interference = checkInterference(box1, box2);
if (interference.hasInterference) {
  console.log('Shapes overlap!');
  console.log('Min distance:', interference.minDistance);
}
```

**Key concepts:** Measurement functions, interference checking for clash detection.

---

## 10. Create 2D Profile and Extrude

**Task:** Sketch a 2D profile and extrude it to 3D.

```typescript
import { sketchCircle, sketchRectangle, shape } from 'brepjs/quick';

// Create a circular profile
const profile = sketchCircle(10);
const cylinder = shape(profile.face()).extrude(30).val;

// Or use the built-in shortcut
const quickCylinder = sketchCircle(10).extrude(30);
```

**Key concepts:** Sketching, face extraction, extrusion.

---

## 11. Box with Rounded Rectangle Profile

**Task:** Create a box with rounded corners by sketching and extruding.

```typescript
import { sketchRoundedRectangle } from 'brepjs/quick';

const roundedBox = sketchRoundedRectangle(50, 30, 5).extrude(20);
```

**Key concepts:** Canned sketches for common 2D shapes.

---

## 12. Hollow Shell with Removed Face

**Task:** Create a hollow container by shelling with one face removed.

```typescript
import { box, shape, faceFinder } from 'brepjs/quick';

const hollow = shape(box(30, 30, 30)).shell((f) => f.inDirection('Z').max(), 2).val; // Remove top face, 2mm wall thickness

console.log('Volume (hollow):', shape(hollow).volume());
```

**Key concepts:** Shelling, face finding with `inDirection().max()`.

---

## 13. Loft Between Two Profiles

**Task:** Create a smooth transition between two different cross-sections.

```typescript
import { sketchCircle, sketchRectangle, loft, unwrap } from 'brepjs/quick';

const bottom = sketchCircle(10).wires();
const top = sketchRectangle(15, 15, { at: [0, 0, 50] }).wires();

const lofted = unwrap(loft([bottom, top]));
```

**Key concepts:** Lofting, wire extraction from sketches.

---

## 14. Revolve a Profile Around an Axis

**Task:** Create a vase by revolving a 2D profile.

```typescript
import { Sketcher, shape } from 'brepjs/quick';

// Sketch a vase profile (half-section)
const profile = new Sketcher('XZ')
  .movePointerTo([5, 0])
  .lineTo([5, 10])
  .lineTo([8, 20])
  .lineTo([6, 30])
  .lineTo([0, 30])
  .lineTo([0, 0])
  .close();

// Revolve around Z axis
const vase = shape(profile.face()).revolve(360, { axis: [0, 0, 1] }).val;
```

**Key concepts:** Custom sketching, revolution operation.

---

## 15. Mesh for 3D Rendering

**Task:** Generate triangle mesh data for WebGL/Three.js rendering.

```typescript
import { box, shape, toBufferGeometryData } from 'brepjs/quick';

const part = shape(box(20, 20, 20)).fillet(2).val;

// Generate mesh with tolerance
const mesh = shape(part).mesh({ tolerance: 0.1 });

// Convert to Three.js-compatible format
const bufferData = toBufferGeometryData(mesh);

// Use with Three.js BufferGeometry
// geometry.setAttribute('position', new Float32Array(bufferData.position));
// geometry.setAttribute('normal', new Float32Array(bufferData.normal));
// geometry.setIndex(new Uint32Array(bufferData.index));
```

**Key concepts:** Meshing for rendering, tolerance control, Three.js integration.

---

## 16. Text Engraving on Surface

**Task:** Engrave text onto a box face.

```typescript
import { box, shape, text2D, unwrap } from 'brepjs/quick';

// Create base box
const base = box(100, 50, 10);

// Generate text as 2D wire
const textWire = unwrap(text2D('BREPJS', { fontSize: 12, font: 'Arial' }));

// Position and extrude text to create cutting tool
const textSolid = shape(textWire).extrude(3).translate([25, 20, 7]).val; // Position on top face

// Engrave by cutting
const engraved = shape(base).cut(textSolid).val;
```

**Key concepts:** Text generation, 2D to 3D extrusion, surface engraving.

---

## 17. Rectangular Pattern (Grid)

**Task:** Create a grid pattern of holes across a surface.

```typescript
import { box, cylinder, shape, rectangularPattern } from 'brepjs/quick';

const plate = box(100, 80, 5);
const hole = cylinder(3, 10, { at: [10, 10, 0] });

// Create 5×4 grid with 20mm spacing
const pattern = rectangularPattern(hole, {
  xCount: 5,
  yCount: 4,
  xSpacing: 20,
  ySpacing: 20,
});

// Cut all holes at once
const perforatedPlate = shape(plate).cutAll(pattern).val;
```

**Key concepts:** Rectangular patterns, batch boolean operations with `cutAll`.

---

## 18. Sweep Profile Along Path

**Task:** Sweep a circular profile along a curved path to create a pipe or handrail.

```typescript
import { circle, arc, shape, unwrap } from 'brepjs/quick';

// Create circular profile (10mm diameter)
const profile = unwrap(circle(5));

// Create curved path (quarter circle arc)
const path = unwrap(arc([0, 0, 0], [50, 0, 50], [50, 50, 50]));

// Sweep profile along path
const pipe = unwrap(shape(profile).sweep(path));

console.log('Pipe volume:', shape(pipe).volume());
```

**Key concepts:** Sweep operations, wire-to-wire sweeping, curved path following.

---

## 19. Mirror and Join for Symmetry

**Task:** Create half a shape, then mirror and fuse for perfect symmetry.

```typescript
import { box, cylinder, shape } from 'brepjs/quick';

// Create half of a symmetric part
const half = shape(box(20, 30, 10))
  .cut(cylinder(5, 15, { at: [10, 10, 5] }))
  .fillet((e) => e.inDirection('X').max(), 3).val;

// Mirror and join to create full symmetric part
const full = shape(half).mirrorJoin({ normal: [1, 0, 0], origin: [20, 0, 0] }).val;

console.log('Full volume:', shape(full).volume());
```

**Key concepts:** Mirror operations, `mirrorJoin` for automatic symmetry, selective filleting.

---

## 20. Complex Assembly with Multiple Parts

**Task:** Build an assembly with multiple positioned components.

```typescript
import { box, cylinder, sphere, shape } from 'brepjs/quick';

// Base plate
const base = shape(box(100, 100, 5)).fillet(2).val;

// Mounting posts (4 corners)
const post = cylinder(3, 20);
const posts = [
  shape(post).translate([10, 10, 5]).val,
  shape(post).translate([90, 10, 5]).val,
  shape(post).translate([10, 90, 5]).val,
  shape(post).translate([90, 90, 5]).val,
];

// Top cover
const cover = shape(box(80, 80, 3))
  .translate([10, 10, 25])
  .fillet(1).val;

// Center sphere decoration
const decoration = shape(sphere(8)).translate([50, 50, 28]).val;

// Combine all parts (optional - can keep separate for visualization)
const assembly = shape(base).fuse(posts[0]).fuse(posts[1]).fuse(posts[2]).fuse(posts[3]).val;

// Or export parts separately for multi-part assemblies
// exportSTEP(base, { filename: 'base.step' });
// exportSTEP(posts, { filename: 'posts.step' });
```

**Key concepts:** Multi-part assemblies, component positioning with `translate`, optional fusion.

---

## Tips for Success

1. **Always use the wrapper** — `shape().cut().fillet()` is cleaner than `unwrap(fillet(unwrap(cut(...))))`
2. **Use finders for selective operations** — `(e) => e.inDirection('Z')` is more maintainable than selecting edges manually
3. **Measure early, measure often** — Use `.volume()`, `.area()`, `measureDistance()` to verify your design
4. **Export often** — Save intermediate results to STEP for visual inspection in CAD software
5. **Start simple, then refine** — Build your shape step-by-step, testing each operation

## Next Steps

- **[Getting Started](./getting-started.md)** — Full tutorial from installation to export
- **[Which API?](./which-api.md)** — Understand when to use different API styles
- **[Examples](../examples/)** — More complex, runnable examples
- **[API Reference](../llms.txt)** — Complete function reference
