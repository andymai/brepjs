/**
 * Three.js Rendering Example
 *
 * Shows how to convert brepjs shapes into mesh data suitable for Three.js
 * or any other WebGL renderer. The mesh contains vertices, normals, and
 * triangle indices — everything you need for rendering.
 *
 * This example generates the mesh data and prints a summary. In a real
 * application, you would pass these arrays to your renderer.
 */

import {
  makeBox,
  makeCylinder,
  cutShape,
  filletShape,
  translateShape,
  edgeFinder,
  meshShape,
  unwrap,
} from 'brepjs';

// Build a shape: box with a cylindrical hole and filleted edges
const box = makeBox([0, 0, 0], [30, 20, 10]);
const hole = translateShape(makeCylinder(5, 15), [15, 10, -2]);
const drilled = unwrap(cutShape(box, hole));
const part = unwrap(filletShape(drilled, 1.5, (e) => e.inDirection('Z')));

// Generate mesh data for rendering
// linearDeflection controls mesh quality (smaller = finer mesh)
const mesh = meshShape(part, { linearDeflection: 0.1 });

console.log('Mesh generated:');
console.log(`  Vertices:  ${mesh.vertices.length / 3}`);
console.log(`  Triangles: ${mesh.faces.length / 3}`);
console.log(`  Normals:   ${mesh.normals.length / 3}`);

// ─── How to use with Three.js ───────────────────────────────────
//
// import * as THREE from 'three';
//
// const geometry = new THREE.BufferGeometry();
// geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.vertices, 3));
// geometry.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.normals, 3));
// geometry.setIndex(Array.from(mesh.faces));
//
// const material = new THREE.MeshStandardMaterial({ color: 0x4488cc });
// const meshObj = new THREE.Mesh(geometry, material);
// scene.add(meshObj);
//
// ─── How to use with any WebGL renderer ─────────────────────────
//
// mesh.vertices  → Float32Array of [x,y,z, x,y,z, ...] positions
// mesh.normals   → Float32Array of [nx,ny,nz, ...] per-vertex normals
// mesh.faces     → Uint32Array of [i0,i1,i2, ...] triangle indices
//
// These arrays are ready for GPU upload as vertex/index buffers.

// Print a sample of the vertex data
console.log('\nFirst 3 vertices:');
for (let i = 0; i < 3; i++) {
  const x = mesh.vertices[i * 3]?.toFixed(2);
  const y = mesh.vertices[i * 3 + 1]?.toFixed(2);
  const z = mesh.vertices[i * 3 + 2]?.toFixed(2);
  console.log(`  [${x}, ${y}, ${z}]`);
}
