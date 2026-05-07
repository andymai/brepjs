---
title: Coming from Three.js (mesh modeling)
---

# Coming from Three.js (mesh modeling)

If you've tried to do CAD in [Three.js](https://threejs.org/) — building parts with `THREE.BoxGeometry` and `three-csg-ts` for booleans — you've hit walls. CSG on meshes is unreliable for anything past simple shapes, fillets don't exist, measurements are approximate, and STEP export is impossible. brepjs is the precision layer above Three.js: model in B-Rep, render in Three.js. This chapter is the conceptual shift and the practical pipeline.

## The realisation

Three.js is a **renderer**. Its geometry classes (`BoxGeometry`, `SphereGeometry`, `BufferGeometry`) describe what to display, not what to model. You can do CSG on meshes, but the operations approximate — they accumulate error, produce slivers, and fail unpredictably on near-coincident geometry.

brepjs is a **modeller**. It produces exact B-Rep shapes that you can boolean reliably, fillet, measure, export to industry CAD formats, and _then_ mesh for Three.js to render.

The combination is the standard CAD-on-the-web stack:

```
brepjs:    parameters → B-Rep shape (exact)
              ↓ shape(s).mesh(...)
              ↓ toBufferGeometryData(m)
Three.js:  BufferGeometry → render
```

Two libraries, one role each.

## What you'll stop doing

| Three.js workflow                                      | brepjs equivalent                                                           |
| ------------------------------------------------------ | --------------------------------------------------------------------------- |
| `new THREE.BoxGeometry(w, h, d)` for modelling         | `box(w, d, h)` for modelling, then mesh into `BufferGeometry` for rendering |
| `three-csg-ts` for booleans                            | `fuse`, `cut`, `intersect`                                                  |
| Custom shaders to fake fillets                         | `fillet(s, edges, r)`                                                       |
| `BufferGeometryUtils.mergeBufferGeometries` for unions | `fuseAll([a, b, c])`                                                        |
| Hand-tuned ray traversal for measurement               | `measureVolume`, `measureArea`, `distanceTo`                                |
| Approximate STL export from `BufferGeometry`           | `exportSTEP`, `exportSTL` directly from B-Rep                               |

Three.js stays in the picture — for rendering, controls, materials, lights, post-processing. The modelling moves to brepjs.

## Concept-by-concept

### Mesh vs. B-Rep

A `BoxGeometry` is 12 triangles. A brepjs `box` is 6 planar surfaces, 12 line edges, 8 vertices, exact. The brepjs box can be `cut` with a cylinder and the resulting hole is exactly cylindrical — not 12-sided. See [B-Rep vs Mesh](../concepts/brep-vs-mesh).

### Booleans

three-csg-ts:

<!-- @no-test -->

```typescript
import { CSG } from 'three-csg-ts';
import * as THREE from 'three';

declare const a: THREE.Mesh;
declare const b: THREE.Mesh;

const result = CSG.fromMesh(a).subtract(CSG.fromMesh(b));
const mesh = CSG.toMesh(result, a.matrix, a.material);
```

brepjs:

```typescript
import { box, cylinder, cut, unwrap, shape, toBufferGeometryData } from 'brepjs/quick';

const a = box(20, 20, 20);
const b = cylinder(8, 30);

const result = unwrap(cut(a, b));

// To render in Three.js, mesh the result:
const data = toBufferGeometryData(shape(result).mesh({ tolerance: 0.1 }));
console.log('Triangles after exact cut:', data.index.length / 3);

export default result;
```

The brepjs version produces an exact cylindrical hole. The three-csg-ts version produces a polygonal approximation that looks fine until you fillet, measure, or export to STEP.

### Fillets

Three.js has no fillet operation. People work around it by hand-modelling chamfered geometry, using `RoundedBoxGeometry`, or shader tricks that fake the visual.

brepjs:

```typescript
import { box, edgeFinder, fillet, unwrap } from 'brepjs/quick';

const b = box(30, 20, 10);
const verticals = edgeFinder().inDirection('Z').findAll(b);
const filleted = unwrap(fillet(b, verticals, 2));
console.log('Filleted with 2mm radius');

export default filleted;
```

Real fillets, on real edges. See [Fillets & Chamfers](../tasks/fillets).

### Measurement

`THREE.Box3.expandByObject` gives you a bounding box; for volume or surface area you'd integrate triangles yourself. brepjs:

```typescript
import { sphere, measureVolume, measureArea } from 'brepjs/quick';

const s = sphere(10);
console.log('Volume:', measureVolume(s).toFixed(4)); // 4188.7902 (exact)
console.log('Area:', measureArea(s).toFixed(4)); // 1256.6371 (exact)
```

Exact mathematical values, not Riemann sums.

### Export to CAD formats

Three.js exporters (`STLExporter`, `GLTFExporter`) work on triangle data — STL out is fine. STEP / IGES export from triangles is impossible.

brepjs exports STEP from B-Rep:

```typescript
import { box, exportSTEP, unwrap } from 'brepjs/quick';

const part = box(30, 20, 10);
const step = unwrap(exportSTEP(part));
console.log('STEP size:', step.size, 'bytes');

export default part;
```

The output round-trips with SolidWorks, Fusion 360, FreeCAD, OnShape — every desktop CAD tool.

## The integration pattern

Build with brepjs, render with Three.js. Once per shape change, mesh and feed Three.js a `BufferGeometry`:

<!-- @no-test -->

```typescript
import * as THREE from 'three';
import { box, cylinder, cut, shape, toBufferGeometryData, unwrap } from 'brepjs/quick';

// 1. Model in brepjs (exact)
const part = unwrap(cut(box(30, 20, 10), cylinder(5, 15, { at: [15, 10, -2] })));

// 2. Mesh once (cache this; don't re-mesh every frame)
const data = toBufferGeometryData(shape(part).mesh({ tolerance: 0.1 }));

// 3. Hand to Three.js
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(data.position, 3));
geo.setAttribute('normal', new THREE.BufferAttribute(data.normal, 3));
geo.setIndex(new THREE.BufferAttribute(data.index, 1));

const material = new THREE.MeshStandardMaterial({ color: 0xc0c0c0 });
const mesh = new THREE.Mesh(geo, material);

declare const scene: THREE.Scene;
scene.add(mesh);
```

[Three.js Integration](../integration/threejs) covers the full pipeline; [React Three Fiber](../integration/r3f) covers the same flow declaratively.

## When you genuinely need a mesh

Some workflows are fundamentally mesh-based:

- **Sculpting** — pushing vertices around. B-Rep can't express most sculpted forms.
- **Real-time CSG** at hundreds of operations per second. B-Rep is too slow.
- **Procedural terrain / heightmaps.** B-Rep would explode in face count.
- **Voxel art / Minecraft-style.** Mesh territory.

For these, stay in Three.js (or use Manifold for fast manifold-mesh booleans). brepjs is built for parametric mechanical parts, not organic forms.

## When the line is fuzzy

If you're building parts that have _some_ curved organic surfaces but mostly mechanical features, brepjs is still the right answer. NURBS surfaces and B-spline surfaces handle most "smooth blob" shapes; lofts and sweeps handle most transitions. The cases brepjs genuinely doesn't fit are pure organic modelling (characters, terrain, sculpted forms).

## Migration approach

For an existing Three.js + CSG codebase:

1. Replace `THREE.*Geometry` instantiations (when used for modelling, not rendering) with brepjs primitives.
2. Replace `three-csg-ts` calls with `fuse` / `cut` / `intersect`.
3. Mesh the brepjs results to feed back to Three.js.
4. Add fillets, shells, and measurements where you previously avoided them.
5. Add STEP export — this is the killer feature most users didn't know they wanted.

The integration is incremental — start with one part, prove the pipeline, expand.

## Next steps

- [Three.js Integration](../integration/threejs) — the full B-Rep → render pipeline
- [Boolean Operations](../tasks/booleans) — exact booleans you can rely on
- [Why brepjs](../introduction/why-brepjs) — the broader case for B-Rep modelling on the web
