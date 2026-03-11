# Three.js Integration

Render brepjs shapes in the browser with Three.js. This guide builds up progressively: basic mesh, edge wireframe overlay, per-face colors, and dynamic re-meshing.

All examples use Three.js r175+ ESM imports and `brepjs/quick` for auto-initialization.

```bash
npm install three brepjs brepjs-opencascade
npm install -D @types/three
```

## Basic Mesh

The shortest path from brepjs shape to Three.js scene:

```typescript
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { box, cylinder, shape, toBufferGeometryData } from 'brepjs/quick';

// 1. Create a shape
const part = shape(box(30, 20, 10))
  .cut(cylinder(4, 15, { at: [15, 10, -2] }))
  .fillet((e) => e.inDirection('Z'), 2).val;

// 2. Tessellate to triangle mesh
const m = shape(part).mesh({ tolerance: 0.1 });

// 3. Convert to Three.js BufferGeometry
const data = toBufferGeometryData(m);
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.position, 3));
geometry.setAttribute('normal', new THREE.Float32BufferAttribute(data.normal, 3));
geometry.setIndex(new THREE.BufferAttribute(data.index, 1));

// 4. Create scene
const scene = new THREE.Scene();
scene.background = new THREE.Color('#f0f0f0');

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(50, -50, 40);
camera.up.set(0, 0, 1);
camera.lookAt(15, 10, 5);

// 5. Lighting - hemisphere + two directionals gives a clean CAD look
scene.add(new THREE.HemisphereLight('#ffffff', '#b0b0b0', 0.65));
const keyLight = new THREE.DirectionalLight('#fff8f0', 0.85);
keyLight.position.set(-50, 60, 80);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight('#e0e8ff', 0.15);
fillLight.position.set(40, -40, 30);
scene.add(fillLight);

// 6. Add mesh with material
const material = new THREE.MeshStandardMaterial({
  color: '#4a90d9',
  roughness: 0.45,
  metalness: 0,
  side: THREE.DoubleSide,
  flatShading: false,
});

scene.add(new THREE.Mesh(geometry, material));

// 7. Renderer + controls
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(15, 10, 5);

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();
```

**Key points:**

- `toBufferGeometryData()` returns `{ position, normal, index }` as typed arrays - zero-copy, ready for `BufferAttribute`
- `tolerance` controls mesh density: `0.1` for interactive display, `0.01` for high quality, `0.5` for previews
- `camera.up.set(0, 0, 1)` - brepjs uses Z-up, matching CAD convention

## Edge Wireframe Overlay

B-Rep edges (the true topology boundaries) look much better than mesh-based wireframes. brepjs extracts them directly from the kernel:

```typescript
import { meshEdges, toLineGeometryData } from 'brepjs/quick';

// Extract B-Rep edge polylines
const edgeMesh = meshEdges(part, { tolerance: 0.1 });
const lineData = toLineGeometryData(edgeMesh);

const edgeGeometry = new THREE.BufferGeometry();
edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(lineData.position, 3));

const edges = new THREE.LineSegments(
  edgeGeometry,
  new THREE.LineBasicMaterial({ color: '#000000', depthTest: true })
);
edges.renderOrder = 1;
scene.add(edges);
```

To prevent z-fighting between the mesh surface and edge lines, add `polygonOffset` to the mesh material:

```typescript
const material = new THREE.MeshStandardMaterial({
  color: '#4a90d9',
  roughness: 0.45,
  metalness: 0,
  side: THREE.DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1,
});
```

**Why `meshEdges()` instead of Three.js `EdgesGeometry`?** `meshEdges()` returns the actual B-Rep topology edges - the seams where faces meet. Three.js `EdgesGeometry` uses an angle threshold on the triangle mesh, which misses smooth edges and adds false edges on curved surfaces. The B-Rep edges are the "real" edges.

## Per-Face Colors

Color individual faces by their origin - useful for visualizing which faces came from which boolean operation:

```typescript
import {
  box,
  cylinder,
  cut,
  fillet,
  edgeFinder,
  colorShape,
  colorFaces,
  faceFinder,
  mesh,
  toGroupedBufferGeometryData,
  unwrap,
} from 'brepjs/quick';

// Create shape with colors assigned before booleans
const b = colorShape(box(30, 20, 10), '#4a90d9');
const hole = colorShape(cylinder(4, 15, { at: [15, 10, -2] }), '#d94a4a');
const drilled = unwrap(cut(b, hole));

// Colors propagate through booleans - cut faces inherit the tool color
const edges = edgeFinder().inDirection('Z').findAll(drilled);
const part = unwrap(fillet(drilled, edges, 2));

// Mesh with face groups
const m = mesh(part, { tolerance: 0.1 });
const data = toGroupedBufferGeometryData(m);

// Build geometry with groups
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.position, 3));
geometry.setAttribute('normal', new THREE.Float32BufferAttribute(data.normal, 3));
geometry.setIndex(new THREE.BufferAttribute(data.index, 1));

for (const g of data.groups) {
  geometry.addGroup(g.start, g.count, g.materialIndex);
}

// One material per face group - use getFaceColor to read propagated colors
import { getFaceColor } from 'brepjs/quick';

const materials = data.groups.map((g) => {
  // Find the face in the shape to read its color
  const faces = faceFinder().find(part);
  const face = faces.find((f) => {
    const faceM = mesh(f, { tolerance: 0.1 });
    return faceM.faceGroups.length > 0 && faceM.faceGroups[0].faceId === g.faceId;
  });
  const color = face ? getFaceColor(part, face) : undefined;

  return new THREE.MeshStandardMaterial({
    color: color ? new THREE.Color(color[0], color[1], color[2]) : '#4a90d9',
    roughness: 0.45,
    metalness: 0,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
});

scene.add(new THREE.Mesh(geometry, materials));
```

**Simpler approach - color by face direction:**

If you don't need boolean-propagated colors, you can color faces by their normal direction using the face finder:

```typescript
import { faceFinder, colorFaces } from 'brepjs/quick';

const topFaces = faceFinder().inDirection('Z').findAll(part);
const sideFaces = faceFinder().perpendicular('Z').findAll(part);

colorFaces(part, topFaces, '#4a90d9');
colorFaces(part, sideFaces, '#6ab04c');
```

## Dynamic Re-Meshing

Update the Three.js geometry when brepjs parameters change - for example, a slider controlling fillet radius:

```typescript
import {
  box,
  cylinder,
  shape,
  fillet,
  edgeFinder,
  mesh,
  meshEdges,
  toBufferGeometryData,
  toLineGeometryData,
  unwrap,
} from 'brepjs/quick';

let currentGeometry: THREE.BufferGeometry | null = null;
let currentEdgeGeometry: THREE.BufferGeometry | null = null;
let meshObj: THREE.Mesh | null = null;
let edgeObj: THREE.LineSegments | null = null;

function rebuildShape(filletRadius: number) {
  // 1. Rebuild brepjs shape
  const b = box(30, 20, 10);
  const hole = cylinder(4, 15, { at: [15, 10, -2] });
  const drilled = shape(b).cut(hole).val;

  let part = drilled;
  if (filletRadius > 0) {
    const edges = edgeFinder().inDirection('Z').findAll(drilled);
    const result = fillet(drilled, edges, filletRadius);
    if (result.ok) part = result.value;
  }

  // 2. Re-tessellate
  const m = shape(part).mesh({ tolerance: 0.1 });
  const edgeMesh = meshEdges(part, { tolerance: 0.1 });

  // 3. Dispose old geometry
  currentGeometry?.dispose();
  currentEdgeGeometry?.dispose();

  // 4. Build new geometry
  const data = toBufferGeometryData(m);
  currentGeometry = new THREE.BufferGeometry();
  currentGeometry.setAttribute('position', new THREE.Float32BufferAttribute(data.position, 3));
  currentGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(data.normal, 3));
  currentGeometry.setIndex(new THREE.BufferAttribute(data.index, 1));

  const lineData = toLineGeometryData(edgeMesh);
  currentEdgeGeometry = new THREE.BufferGeometry();
  currentEdgeGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(lineData.position, 3)
  );

  // 5. Swap geometry on existing scene objects
  if (meshObj) meshObj.geometry = currentGeometry;
  if (edgeObj) edgeObj.geometry = currentEdgeGeometry;
}

// Initial build
rebuildShape(2);

// Wire up a slider
const slider = document.getElementById('fillet-slider') as HTMLInputElement;
slider.addEventListener('input', () => {
  rebuildShape(parseFloat(slider.value));
});
```

**Performance tips for dynamic updates:**

- **Debounce** slider input if the shape is complex - `requestAnimationFrame` or a 16ms throttle prevents queueing multiple rebuilds
- **Tolerance tradeoff** - use `tolerance: 0.5` during drag, switch to `0.1` on `pointerup` for final quality
- **Web Worker** - for complex shapes, run `mesh()` and `meshEdges()` in a Worker. The typed arrays are `Transferable`, so they cross the Worker boundary at zero copy cost. See brepjs's `createWorkerClient` / `createWorkerHandler` APIs
- **Cache** - `mesh()` and `meshEdges()` cache by shape identity + tolerance. If only the fillet radius changes, only the fillet result is re-meshed

## Material Reference

Recommended material properties for CAD-style rendering (from [Gridfinity Layout Tool](https://github.com/andymai/gridfinity-layout-tool)):

```typescript
// Solid mesh
const meshMaterial = new THREE.MeshStandardMaterial({
  color: '#d4d8dc',
  roughness: 0.45,
  metalness: 0,
  side: THREE.DoubleSide,
  emissive: '#d4d8dc',
  emissiveIntensity: 0.08,
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1,
});

// Edge wireframe
const edgeMaterial = new THREE.LineBasicMaterial({
  color: '#000000',
  depthTest: true,
});
```

The slight `emissive` glow prevents the dark side of the shape from going fully black, giving a more readable CAD visualization.

## Next Steps

- **[Getting Started](./getting-started.md)** - brepjs basics from install to export
- **[Cookbook](./cookbook.md)** - 20+ practical recipes
- **[Memory Management](./memory-management.md)** - WASM cleanup patterns (important for dynamic re-meshing)
- **[Performance](./performance.md)** - Mesh tolerance tuning and batch operations
