---
title: Three.js
description: 'The CAD-on-the-web stack: model in brepjs, mesh, hand the buffer data to Three.js, render in a canvas. Materials, outlines, shadows.'
---

# Three.js

brepjs is the kernel; Three.js is the renderer. The combination is the standard CAD-on-the-web stack: model with brepjs, mesh, hand the buffer data to Three.js, render in a `<canvas>`. This chapter covers the conversion pipeline, the buffer format, materials, and shadow / outline patterns common in CAD UIs.

## The pipeline

```
brepjs Shape3D
   ↓ shape(s).mesh({ tolerance })
Mesh handle
   ↓ toBufferGeometryData(m)
{ position, normal, index } typed arrays
   ↓ feed into Three.js BufferGeometry
THREE.BufferGeometry
   ↓ THREE.Mesh(geometry, material)
Render
```

Two brepjs calls; everything below the typed arrays is plain Three.js.

## Minimal example

```typescript
import { box, shape, toBufferGeometryData } from 'brepjs/quick';

const part = box(20, 20, 20);
const m = shape(part).mesh({ tolerance: 0.1 });
const data = toBufferGeometryData(m);

console.log('Vertices:', data.position.length / 3);
console.log('Triangles:', data.index.length / 3);
console.log('Has normals:', data.normal.length === data.position.length);
```

The typed arrays are ready to assign to a `THREE.BufferGeometry`:

<!-- @no-test -->

```typescript
import * as THREE from 'three';
import { box, shape, toBufferGeometryData } from 'brepjs/quick';

const part = box(20, 20, 20);
const m = shape(part).mesh({ tolerance: 0.1 });
const data = toBufferGeometryData(m);

const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(data.position, 3));
geometry.setAttribute('normal', new THREE.BufferAttribute(data.normal, 3));
geometry.setIndex(new THREE.BufferAttribute(data.index, 1));

const material = new THREE.MeshStandardMaterial({
  color: 0xc0c0c0,
  metalness: 0.4,
  roughness: 0.6,
});
const mesh = new THREE.Mesh(geometry, material);
```

That's the entire bridge. Everything else is Three.js styling.

## A complete viewer

A scene that renders a brepjs part with orbit controls:

<!-- @no-test -->

```typescript
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { box, cylinder, shape, toBufferGeometryData, unwrap, cut } from 'brepjs/quick';

declare const canvas: HTMLCanvasElement;

// 1. Build the part
const part = unwrap(cut(box(30, 20, 10), cylinder(5, 15, { at: [15, 10, -2] })));
const meshHandle = shape(part).mesh({ tolerance: 0.05 });
const data = toBufferGeometryData(meshHandle);

// 2. Three.js scene
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(canvas.clientWidth, canvas.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeeeeee);

const camera = new THREE.PerspectiveCamera(50, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
camera.position.set(60, 60, 60);
camera.lookAt(0, 0, 0);

const controls = new OrbitControls(camera, canvas);

scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(50, 100, 50);
scene.add(dirLight);

// 3. Geometry & material
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(data.position, 3));
geometry.setAttribute('normal', new THREE.BufferAttribute(data.normal, 3));
geometry.setIndex(new THREE.BufferAttribute(data.index, 1));

const material = new THREE.MeshStandardMaterial({
  color: 0xc0c0c0,
  metalness: 0.4,
  roughness: 0.6,
});
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

// 4. Edge overlay (so you can see the topology)
const edges = new THREE.EdgesGeometry(geometry, 30); // angle threshold
const lineMaterial = new THREE.LineBasicMaterial({ color: 0x111111 });
scene.add(new THREE.LineSegments(edges, lineMaterial));

// 5. Render
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();
```

That's CAD-quality rendering in 50 lines.

## Tolerance choice

The mesh tolerance argument controls how close the triangulation has to be to the exact B-Rep surface. It's a quality / performance dial:

| Tolerance | Triangle count (typical 30 mm part) | Use case                                  |
| --------- | ----------------------------------- | ----------------------------------------- |
| 1.0       | tens                                | Thumbnail, far-camera                     |
| 0.1       | hundreds                            | Default screen rendering                  |
| 0.05      | thousands                           | Close-up, 3D printing                     |
| 0.01      | tens of thousands                   | Engineering visualisation, zoom-to-detail |
| 0.001     | hundreds of thousands               | Print at 0.1 mm nozzle                    |

Halving the tolerance roughly quadruples triangle count.

For interactive scenes, mesh once at moderate tolerance and don't re-mesh on every frame. Re-meshing is the most common "why is my Three.js scene slow" cause when brepjs is involved.

## Multiple parts

When you have several parts, mesh each separately and use a Three.js group:

<!-- @no-test -->

```typescript
import * as THREE from 'three';
import { box, sphere, cylinder, shape, toBufferGeometryData } from 'brepjs/quick';

const parts = [
  box(20, 20, 20),
  sphere(10, { at: [40, 0, 0] }),
  cylinder(5, 30, { at: [-25, 0, 0] }),
];

const group = new THREE.Group();
for (const part of parts) {
  const data = toBufferGeometryData(shape(part).mesh({ tolerance: 0.1 }));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(data.position, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(data.normal, 3));
  geo.setIndex(new THREE.BufferAttribute(data.index, 1));
  group.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xc0c0c0 })));
}
declare const scene: THREE.Scene;
scene.add(group);
```

Each part is independently selectable, transformable, and disposable on the Three.js side.

## Instancing repeated parts

"Multiple parts" meshes each part separately — right when the parts differ. When it's the _same_ part repeated (a bolt pattern, a gridfinity baseplate, a row of identical fins), don't mesh it N times. brepjs `instancedMesh()` meshes the source once and hands back one geometry plus a transform per placement; feed those to a single `THREE.InstancedMesh` — one GPU draw call for the whole grid:

<!-- @no-test -->

```typescript
import * as THREE from 'three';
import { box, instanceGrid, instancedMesh, toBufferGeometryData } from 'brepjs/quick';

const grid = instanceGrid(box(40, 40, 7), { cols: 6, rows: 4, pitchX: 42, pitchY: 42 });
const { geometry, instances } = instancedMesh(grid, { tolerance: 0.1 });

// One BufferGeometry from the single source mesh.
const data = toBufferGeometryData(geometry);
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(data.position, 3));
geo.setAttribute('normal', new THREE.BufferAttribute(data.normal, 3));
geo.setIndex(new THREE.BufferAttribute(data.index, 1));

const mesh = new THREE.InstancedMesh(
  geo,
  new THREE.MeshStandardMaterial({ color: 0xc0c0c0 }),
  instances.length
);
const m = new THREE.Matrix4();
instances.forEach(([r0, r1, r2, r3], i) => {
  // brepjs returns a row-major 4x4; THREE.Matrix4.set is row-major too.
  mesh.setMatrixAt(
    i,
    m.set(
      r0[0],
      r0[1],
      r0[2],
      r0[3],
      r1[0],
      r1[1],
      r1[2],
      r1[3],
      r2[0],
      r2[1],
      r2[2],
      r2[3],
      r3[0],
      r3[1],
      r3[2],
      r3[3]
    )
  );
});
mesh.instanceMatrix.needsUpdate = true;
mesh.computeBoundingSphere(); // setMatrixAt doesn't touch bounds — recompute so a far-placed grid isn't frustum-culled

declare const scene: THREE.Scene;
scene.add(mesh);
```

24 cells, one tessellation, one draw call. The `brepjs-viewer` package ships `buildInstancedMesh(meshData, placements)` if you'd rather not wire the matrices by hand.

## Edges as line overlays

The mesh smooths everything out. To see the actual B-Rep edges, overlay a line geometry. Two approaches:

### `EdgesGeometry` (Three.js built-in)

<!-- @no-test -->

```typescript
import * as THREE from 'three';

declare const geometry: THREE.BufferGeometry;
const edges = new THREE.EdgesGeometry(geometry, 30); // 30° feature angle
const lineMaterial = new THREE.LineBasicMaterial({ color: 0x111111 });
const lines = new THREE.LineSegments(edges, lineMaterial);
```

Quick, fully Three.js native, but only finds creases above the angle threshold; smooth filleted edges may disappear.

### brepjs edge meshing (kernel-side)

For exact B-Rep edges including small fillets:

<!-- @no-test -->

```typescript
import * as THREE from 'three';
import { edgeFinder, meshEdges, type Shape3D } from 'brepjs/quick';

declare const part: Shape3D;
const allEdges = edgeFinder().findAll(part);
const edgeData = meshEdges(allEdges, { tolerance: 0.05 }); // returns positions, indices

const lineGeo = new THREE.BufferGeometry();
lineGeo.setAttribute('position', new THREE.BufferAttribute(edgeData.position, 3));
lineGeo.setIndex(new THREE.BufferAttribute(edgeData.index, 1));

const lineMat = new THREE.LineBasicMaterial({ color: 0x111111 });
const lines = new THREE.LineSegments(lineGeo, lineMat);
```

Slower and more memory but visually perfect.

## Materials

Standard CAD-rendering looks:

| Look           | Material                                                                     |
| -------------- | ---------------------------------------------------------------------------- |
| Aluminum       | `MeshStandardMaterial({ color: 0xc0c0c0, metalness: 0.6, roughness: 0.4 })`  |
| Plastic ABS    | `MeshStandardMaterial({ color: 0x444444, metalness: 0, roughness: 0.8 })`    |
| Polished steel | `MeshStandardMaterial({ color: 0x888888, metalness: 0.95, roughness: 0.1 })` |
| Translucent    | `MeshPhysicalMaterial({ transmission: 0.5, roughness: 0, ior: 1.5 })`        |

Combine with a good environment map (e.g. `RGBELoader` HDRi) for realistic reflections.

## Performance pitfalls

- **Re-meshing every frame**: cache the mesh on the brepjs side; only re-mesh when the shape changes.
- **High-tolerance meshes for distant parts**: mesh at 1 mm tolerance for previews, only refine for the active selection.
- **Disposing the wrong thing**: dispose Three.js `BufferGeometry`, `Material`, `Mesh` separately when removing; Three.js does not auto-clean.
- **Forgetting brepjs disposal**: meshing allocates a brepjs-side handle. Use `using` or `withScope` to release it.

## Next steps

- [React Three Fiber](./r3f): the same pipeline expressed declaratively in React
- [Web Workers](../advanced/workers): meshing in a worker to keep the render thread cool
- [Vite, Next.js, Astro](./frameworks): bundler and framework specifics
