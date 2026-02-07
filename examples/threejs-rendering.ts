/**
 * Three.js Rendering Example
 *
 * Shows how to convert brepjs shapes into mesh data suitable for Three.js
 * or any other WebGL renderer, then generates a standalone HTML file you
 * can open in a browser to see the rendered 3D shape.
 *
 * Run:  npm run example examples/threejs-rendering.ts
 * Then: open examples/output/threejs-part.html in a browser
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import {
  makeBox,
  makeCylinder,
  cutShape,
  filletShape,
  translateShape,
  meshShape,
  toBufferGeometryData,
  unwrap,
} from 'brepjs';

// Build a shape: box with a cylindrical hole and filleted edges
const box = makeBox([0, 0, 0], [30, 20, 10]);
const hole = translateShape(makeCylinder(5, 15), [15, 10, -2]);
const drilled = unwrap(cutShape(box, hole));
const part = unwrap(filletShape(drilled, 1.5, (e) => e.inDirection('Z')));

// Generate mesh data for rendering
// tolerance controls mesh quality (smaller = finer mesh)
const mesh = meshShape(part, { tolerance: 0.1, angularTolerance: 0.5 });

console.log('Mesh generated:');
console.log(`  Vertices:  ${mesh.vertices.length / 3}`);
console.log(`  Triangles: ${mesh.triangles.length / 3}`);
console.log(`  Normals:   ${mesh.normals.length / 3}`);

// Convert to Three.js-ready buffer data
const bufferData = toBufferGeometryData(mesh);
console.log('\nBuffer geometry data:');
console.log(`  position: Float32Array(${bufferData.position.length})`);
console.log(`  normal:   Float32Array(${bufferData.normal.length})`);
console.log(`  index:    Uint32Array(${bufferData.index.length})`);

// Print a sample of the vertex data
console.log('\nFirst 3 vertices:');
for (let i = 0; i < 3; i++) {
  const x = mesh.vertices[i * 3]?.toFixed(2);
  const y = mesh.vertices[i * 3 + 1]?.toFixed(2);
  const z = mesh.vertices[i * 3 + 2]?.toFixed(2);
  console.log(`  [${x}, ${y}, ${z}]`);
}

// ─── Generate a standalone HTML file with Three.js viewer ──────────────────

// Encode mesh arrays as base64 for embedding in HTML
function float32ToBase64(arr: Float32Array): string {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString('base64');
}
function uint32ToBase64(arr: Uint32Array): string {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString('base64');
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>brepjs – Three.js Rendering</title>
  <style>
    body { margin: 0; overflow: hidden; background: #1a1a2e; }
    canvas { display: block; }
    #info {
      position: absolute; top: 10px; left: 10px;
      color: #ccc; font: 14px/1.4 system-ui, sans-serif;
    }
  </style>
</head>
<body>
  <div id="info">brepjs → Three.js · Drag to orbit · Scroll to zoom</div>
  <script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.171.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.171.0/examples/jsm/"
    }
  }
  </script>
  <script type="module">
    import * as THREE from 'three';
    import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

    // ── Decode embedded mesh data ────────────────────────────────────────
    function base64ToFloat32(b64) {
      const bin = atob(b64);
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      return new Float32Array(buf.buffer);
    }
    function base64ToUint32(b64) {
      const bin = atob(b64);
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      return new Uint32Array(buf.buffer);
    }

    const position = base64ToFloat32("${float32ToBase64(bufferData.position)}");
    const normal   = base64ToFloat32("${float32ToBase64(bufferData.normal)}");
    const index    = base64ToUint32("${uint32ToBase64(bufferData.index)}");

    // ── Scene setup ──────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);

    const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 1000);
    camera.position.set(40, 30, 40);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(devicePixelRatio);
    document.body.appendChild(renderer.domElement);

    // ── Lighting ─────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(50, 80, 60);
    scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0x8888ff, 0.3);
    fillLight.position.set(-30, -10, -20);
    scene.add(fillLight);

    // ── Mesh ─────────────────────────────────────────────────────────────
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    geometry.setIndex(new THREE.BufferAttribute(index, 1));

    const material = new THREE.MeshStandardMaterial({
      color: 0x4488cc,
      metalness: 0.3,
      roughness: 0.6,
    });
    const meshObj = new THREE.Mesh(geometry, material);

    // Center the geometry
    geometry.computeBoundingBox();
    const center = new THREE.Vector3();
    geometry.boundingBox.getCenter(center);
    meshObj.position.sub(center);

    scene.add(meshObj);

    // ── Controls ─────────────────────────────────────────────────────────
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // ── Render loop ──────────────────────────────────────────────────────
    function animate() {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    addEventListener('resize', () => {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    });
  </script>
</body>
</html>`;

const outDir = 'examples/output';
mkdirSync(outDir, { recursive: true });
const outPath = `${outDir}/threejs-part.html`;
writeFileSync(outPath, html);
console.log(`\nHTML viewer written to ${outPath}`);
console.log('Open it in a browser to see the rendered 3D shape.');
