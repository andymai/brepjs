/**
 * Browser Viewer Example
 *
 * Builds a shape using the functional API, meshes it, and generates a
 * standalone HTML file with an embedded Three.js viewer. No bundler needed —
 * just open the output file in a browser.
 *
 * Run:  npm run example examples/browser-viewer.ts
 * Then: open examples/output/viewer.html in a browser
 */

import './_setup.js';
import { writeFileSync, mkdirSync } from 'node:fs';

import {
  makeBox,
  makeCylinder,
  cutShape,
  filletShape,
  edgeFinder,
  translateShape,
  meshShape,
  toBufferGeometryData,
  measureVolume,
  describeShape,
  unwrap,
} from 'brepjs';

// ── Build a shape: box with hole + fillets ────────────────────────────────

const box = makeBox([0, 0, 0], [40, 30, 20]);
const hole = translateShape(makeCylinder(6, 25), [20, 15, -2]);
const drilled = unwrap(cutShape(box, hole));
const verticalEdges = edgeFinder().inDirection('Z').findAll(drilled);
const part = unwrap(filletShape(drilled, verticalEdges, 2));

const desc = describeShape(part);
console.log(`Shape: ${desc.faceCount} faces, ${desc.edgeCount} edges`);
console.log(`Volume: ${measureVolume(part).toFixed(1)} mm³`);

// ── Mesh the shape ────────────────────────────────────────────────────────

const mesh = meshShape(part, { tolerance: 0.1, angularTolerance: 0.5 });
const bufferData = toBufferGeometryData(mesh);

console.log(`Mesh: ${mesh.vertices.length / 3} vertices, ${mesh.triangles.length / 3} triangles`);

// ── Encode mesh arrays as base64 for embedding ───────────────────────────

function float32ToBase64(arr: Float32Array): string {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString('base64');
}
function uint32ToBase64(arr: Uint32Array): string {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString('base64');
}

// ── Generate standalone HTML ─────────────────────────────────────────────

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>brepjs – Browser Viewer</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { overflow: hidden; background: #0f0f23; font-family: system-ui, sans-serif; }
    canvas { display: block; }
    #hud {
      position: absolute; top: 0; left: 0; right: 0;
      padding: 12px 16px;
      display: flex; justify-content: space-between; align-items: center;
      color: #aab;
      font-size: 13px;
      pointer-events: none;
    }
    #hud b { color: #dde; }
  </style>
</head>
<body>
  <div id="hud">
    <span><b>brepjs</b> · Browser Viewer</span>
    <span>${desc.faceCount} faces · ${mesh.triangles.length / 3} triangles · Drag to orbit · Scroll to zoom</span>
  </div>

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

    // ── Decode embedded mesh data ──────────────────────────────────────
    function b64ToF32(b64) {
      const bin = atob(b64);
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      return new Float32Array(buf.buffer);
    }
    function b64ToU32(b64) {
      const bin = atob(b64);
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      return new Uint32Array(buf.buffer);
    }

    const position = b64ToF32("${float32ToBase64(bufferData.position)}");
    const normal   = b64ToF32("${float32ToBase64(bufferData.normal)}");
    const index    = b64ToU32("${uint32ToBase64(bufferData.index)}");

    // ── Scene ──────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f0f23);

    const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 1000);
    camera.position.set(60, 45, 60);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(devicePixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    document.body.appendChild(renderer.domElement);

    // ── Lighting ───────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.3));

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
    keyLight.position.set(50, 80, 60);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x6688cc, 0.4);
    fillLight.position.set(-40, 20, -30);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.2);
    rimLight.position.set(0, -20, -40);
    scene.add(rimLight);

    // ── Geometry ───────────────────────────────────────────────────────
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const material = new THREE.MeshStandardMaterial({
      color: 0x4488cc,
      metalness: 0.35,
      roughness: 0.55,
    });
    const meshObj = new THREE.Mesh(geometry, material);

    // Center the part at the origin
    const center = new THREE.Vector3();
    geometry.boundingBox.getCenter(center);
    meshObj.position.sub(center);
    scene.add(meshObj);

    // Ground grid
    const grid = new THREE.GridHelper(100, 20, 0x333355, 0x222244);
    grid.position.y = -geometry.boundingSphere.radius * 0.8;
    scene.add(grid);

    // ── Controls ───────────────────────────────────────────────────────
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    // ── Render loop ───────────────────────────────────────────────────
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
const outPath = `${outDir}/viewer.html`;
writeFileSync(outPath, html);
console.log(`\nStandalone viewer written to ${outPath}`);
console.log('Open examples/output/viewer.html in a browser to see the 3D shape.');
