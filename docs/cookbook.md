# Cookbook

20 recipes for common CAD workflows. All examples use `shape()` and `brepjs/quick`.

```typescript
import { box, cylinder, sphere, shape /* ... */ } from 'brepjs/quick';
```

---

## 1. Box with Rounded Corners and Hole

A 30×20×10mm box with 2mm rounded corners and a centered hole.

```typescript
import { box, cylinder, shape } from 'brepjs/quick';

const part = shape(box(30, 20, 10))
  .fillet(2)
  .cut(cylinder(2.5, 15, { at: [15, 10, 5] })).val;

console.log('Volume:', shape(part).volume(), 'mm³');
```

---

## 2. Import STL and Measure Properties

Load an STL, measure it, re-export as STEP.

```typescript
import { importSTL, shape, exportSTEP, unwrap } from 'brepjs/quick';

const mesh = unwrap(await importSTL(stlBlob));

console.log(`Volume: ${shape(mesh).volume().toFixed(2)} mm³`);
console.log(`Surface area: ${shape(mesh).area().toFixed(2)} mm²`);

const stepBlob = unwrap(exportSTEP(mesh));
```

---

## 3. Parametric Bracket

A configurable bracket with mounting holes at each corner.

```typescript
import { box, cylinder, shape } from 'brepjs/quick';

function bracket(width: number, height: number, thickness: number, holeRadius: number) {
  const base = shape(box(width, thickness, height));

  const hole1 = cylinder(holeRadius, thickness + 1, { at: [5, 0, 5] });
  const hole2 = cylinder(holeRadius, thickness + 1, { at: [width - 5, 0, 5] });
  const hole3 = cylinder(holeRadius, thickness + 1, { at: [5, 0, height - 5] });
  const hole4 = cylinder(holeRadius, thickness + 1, { at: [width - 5, 0, height - 5] });

  return base
    .cut(hole1)
    .cut(hole2)
    .cut(hole3)
    .cut(hole4)
    .fillet((e) => e.inDirection('Z'), 2).val;
}

const myBracket = bracket(50, 40, 5, 2);
```

---

## 4. Export to Multiple Formats

One shape, three formats.

```typescript
import { box, shape, exportSTEP, exportSTL, exportGltf, unwrap } from 'brepjs/quick';

const part = shape(box(20, 20, 20)).fillet(2).val;

const stepBlob = unwrap(exportSTEP(part));
const stlBlob = unwrap(exportSTL(part));
const gltfBlob = unwrap(exportGltf(part));

// Save to files (Node.js)
import { writeFileSync } from 'fs';
writeFileSync('part.step', await stepBlob.arrayBuffer());
writeFileSync('part.stl', await stlBlob.arrayBuffer());
writeFileSync('part.gltf', await gltfBlob.text());
```

---

## 5. Linear and Circular Patterns

A 3×3 pin grid and a disc with 6 evenly-spaced holes.

```typescript
import { cylinder, box, shape, linearPattern, circularPattern } from 'brepjs/quick';

const pin = cylinder(2, 10);
const pins = linearPattern(pin, { count: [3, 3, 1], spacing: [10, 10, 0] });

const baseDisc = cylinder(30, 5);
const hole = cylinder(3, 6, { at: [20, 0, 0] });
const holes = circularPattern(hole, 6, { axis: [0, 0, 1], at: [0, 0, 0] });

const plate = shape(baseDisc).cutAll(holes).val;
```

---

## 6. Selective Fillets and Chamfers

Round the vertical edges, chamfer the horizontal ones.

```typescript
import { box, shape } from 'brepjs/quick';

const part = shape(box(30, 20, 10))
  .fillet((e) => e.inDirection('Z'), 2)
  .chamfer((e) => e.inDirection('X'), 1).val;
```

---

## 7. Combine Multiple Shapes with Booleans

Cut a cylinder, fuse a sphere, fillet the result.

```typescript
import { box, cylinder, sphere, shape } from 'brepjs/quick';

const body = box(40, 30, 20);
const cutout = cylinder(8, 25, { at: [20, 15, 0] });
const fillet = sphere(5, { at: [5, 5, 5] });

const part = shape(body)
  .cut(cutout)
  .fuse(fillet)
  .fillet((e) => e.parallel([0, 0, 1]), 2).val;
```

---

## 8. Simple Assembly with Transforms

A base plate with four corner posts, fused into one solid.

```typescript
import { box, cylinder, shape } from 'brepjs/quick';

const base = box(100, 100, 5);

const post = cylinder(5, 30);
const posts = [
  shape(post).translate([10, 10, 5]).val,
  shape(post).translate([90, 10, 5]).val,
  shape(post).translate([10, 90, 5]).val,
  shape(post).translate([90, 90, 5]).val,
];

const assembly = shape(base).fuseAll(posts).val;
```

---

## 9. Measure Distances and Check Interference

Two boxes — how far apart are they? Do they clash?

```typescript
import { box, sphere, measureDistance, checkInterference } from 'brepjs/quick';

const box1 = box(20, 20, 20);
const box2 = shape(box(20, 20, 20)).translate([25, 0, 0]).val;

const distance = measureDistance(box1, box2);
console.log('Distance:', distance, 'mm');

const interference = checkInterference(box1, box2);
if (interference.hasInterference) {
  console.log('Shapes overlap!');
}
```

---

## 10. Create 2D Profile and Extrude

Sketch a circle, extrude it to a cylinder.

```typescript
import { sketchCircle, sketchRectangle, shape } from 'brepjs/quick';

const profile = sketchCircle(10);
const cylinder = shape(profile.face()).extrude(30).val;

// Or use the shortcut
const quickCylinder = sketchCircle(10).extrude(30);
```

---

## 11. Box with Rounded Rectangle Profile

One-liner: sketch a rounded rectangle and extrude.

```typescript
import { sketchRoundedRectangle } from 'brepjs/quick';

const roundedBox = sketchRoundedRectangle(50, 30, 5).extrude(20);
```

---

## 12. Hollow Shell with Removed Face

Remove the top face and hollow out a box.

```typescript
import { box, shape, faceFinder } from 'brepjs/quick';

const hollow = shape(box(30, 30, 30)).shell((f) => f.inDirection('Z').max(), 2).val;

console.log('Volume (hollow):', shape(hollow).volume());
```

---

## 13. Loft Between Two Profiles

Smooth transition from a circle to a square.

```typescript
import { sketchCircle, sketchRectangle, loft, unwrap } from 'brepjs/quick';

const bottom = sketchCircle(10).wires();
const top = sketchRectangle(15, 15, { at: [0, 0, 50] }).wires();

const lofted = unwrap(loft([bottom, top]));
```

---

## 14. Revolve a Profile Around an Axis

A vase from a half-section profile revolved 360°.

```typescript
import { Sketcher, shape } from 'brepjs/quick';

const profile = new Sketcher('XZ')
  .movePointerTo([5, 0])
  .lineTo([5, 10])
  .lineTo([8, 20])
  .lineTo([6, 30])
  .lineTo([0, 30])
  .lineTo([0, 0])
  .close();

const vase = shape(profile.face()).revolve(360, { axis: [0, 0, 1] }).val;
```

---

## 15. Mesh for 3D Rendering

Triangle mesh data for Three.js / WebGL.

```typescript
import { box, shape, toBufferGeometryData } from 'brepjs/quick';

const part = shape(box(20, 20, 20)).fillet(2).val;

const mesh = shape(part).mesh({ tolerance: 0.1 });
const bufferData = toBufferGeometryData(mesh);

// geometry.setAttribute('position', new Float32Array(bufferData.position));
// geometry.setAttribute('normal', new Float32Array(bufferData.normal));
// geometry.setIndex(new Uint32Array(bufferData.index));
```

---

## 16. Text Engraving on Surface

Engrave text into a box face by extruding and cutting.

```typescript
import { box, shape, text2D, unwrap } from 'brepjs/quick';

const base = box(100, 50, 10);
const textWire = unwrap(text2D('BREPJS', { fontSize: 12, font: 'Arial' }));
const textSolid = shape(textWire).extrude(3).translate([25, 20, 7]).val;

const engraved = shape(base).cut(textSolid).val;
```

---

## 17. Rectangular Pattern (Grid)

Perforate a plate with a 5×4 grid of holes.

```typescript
import { box, cylinder, shape, rectangularPattern } from 'brepjs/quick';

const plate = box(100, 80, 5);
const hole = cylinder(3, 10, { at: [10, 10, 0] });

const pattern = rectangularPattern(hole, {
  xCount: 5,
  yCount: 4,
  xSpacing: 20,
  ySpacing: 20,
});

const perforatedPlate = shape(plate).cutAll(pattern).val;
```

---

## 18. Sweep Profile Along Path

A pipe: sweep a circle along a curved path.

```typescript
import { circle, arc, shape, unwrap } from 'brepjs/quick';

const profile = unwrap(circle(5));
const path = unwrap(arc([0, 0, 0], [50, 0, 50], [50, 50, 50]));

const pipe = unwrap(shape(profile).sweep(path));
console.log('Pipe volume:', shape(pipe).volume());
```

---

## 19. Mirror and Join for Symmetry

Build one half, mirror it, fuse for perfect symmetry.

```typescript
import { box, cylinder, shape } from 'brepjs/quick';

const half = shape(box(20, 30, 10))
  .cut(cylinder(5, 15, { at: [10, 10, 5] }))
  .fillet((e) => e.inDirection('X').max(), 3).val;

const full = shape(half).mirrorJoin({ normal: [1, 0, 0], origin: [20, 0, 0] }).val;
console.log('Full volume:', shape(full).volume());
```

---

## 20. Complex Assembly with Multiple Parts

Base plate, corner posts, top cover, center decoration.

```typescript
import { box, cylinder, sphere, shape } from 'brepjs/quick';

const base = shape(box(100, 100, 5)).fillet(2).val;

const post = cylinder(3, 20);
const posts = [
  shape(post).translate([10, 10, 5]).val,
  shape(post).translate([90, 10, 5]).val,
  shape(post).translate([10, 90, 5]).val,
  shape(post).translate([90, 90, 5]).val,
];

const cover = shape(box(80, 80, 3))
  .translate([10, 10, 25])
  .fillet(1).val;

const decoration = shape(sphere(8)).translate([50, 50, 28]).val;

const assembly = shape(base).fuse(posts[0]).fuse(posts[1]).fuse(posts[2]).fuse(posts[3]).val;
```

---

### 21. Three.js Integration

Render a brepjs shape in Three.js — mesh + edge wireframe:

```typescript
import * as THREE from 'three';
import {
  box,
  cylinder,
  shape,
  toBufferGeometryData,
  meshEdges,
  toLineGeometryData,
} from 'brepjs/quick';

const part = shape(box(30, 20, 10))
  .cut(cylinder(4, 15, { at: [15, 10, -2] }))
  .fillet((e) => e.inDirection('Z'), 2).val;

// Mesh
const m = shape(part).mesh({ tolerance: 0.1 });
const data = toBufferGeometryData(m);
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.position, 3));
geometry.setAttribute('normal', new THREE.Float32BufferAttribute(data.normal, 3));
geometry.setIndex(new THREE.BufferAttribute(data.index, 1));

// Edge wireframe (true B-Rep edges, not mesh-based)
const edgeMesh = meshEdges(part, { tolerance: 0.1 });
const lineData = toLineGeometryData(edgeMesh);
const edgeGeometry = new THREE.BufferGeometry();
edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(lineData.position, 3));
```

For per-face colors, dynamic re-meshing, material recommendations, and a full scene setup, see the **[Three.js Integration Guide](./threejs-integration.md)**.

---

## Tips

1. **Use the wrapper** — `shape().cut().fillet()` beats `unwrap(fillet(unwrap(cut(...))))`
2. **Use finders** — `(e) => e.inDirection('Z')` is more maintainable than manual edge selection
3. **Measure often** — `.volume()`, `.area()`, `measureDistance()` catch mistakes early
4. **Export often** — save intermediate STEP files for visual inspection in CAD software

## Next Steps

- **[Getting Started](./getting-started.md)** — Full tutorial from installation to export
- **[Three.js Integration](./threejs-integration.md)** — Render shapes in the browser
- **[Which API?](./which-api.md)** — When to use each API style
- **[Function Lookup](./function-lookup.md)** — Alphabetical index of every export
