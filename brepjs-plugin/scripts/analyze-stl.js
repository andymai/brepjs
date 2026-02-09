#!/usr/bin/env node
/**
 * STL Analysis Script
 * Analyzes STL mesh quality and dimensions using Three.js
 */

import { readFileSync } from 'fs';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { BufferGeometry, Vector3 } from 'three';

// Parse command line arguments
const stlPath = process.argv[2];

if (!stlPath) {
  console.error('Usage: node analyze-stl.js <file.stl>');
  process.exit(1);
}

try {
  // Read STL file
  const stlBuffer = readFileSync(stlPath);

  // Detect format (ASCII vs binary)
  const isAscii = stlBuffer.toString('utf-8', 0, 5) === 'solid';
  const format = isAscii ? 'ASCII' : 'Binary';

  // Load with Three.js STLLoader
  const loader = new STLLoader();
  const geometry = loader.parse(stlBuffer.buffer);

  // Compute bounding box
  geometry.computeBoundingBox();
  const bbox = geometry.boundingBox;

  const dimensions = {
    x: bbox.max.x - bbox.min.x,
    y: bbox.max.y - bbox.min.y,
    z: bbox.max.z - bbox.min.z,
  };

  const center = {
    x: (bbox.max.x + bbox.min.x) / 2,
    y: (bbox.max.y + bbox.min.y) / 2,
    z: (bbox.max.z + bbox.min.z) / 2,
  };

  // Estimate volume using signed tetrahedron volumes
  let volume = 0;
  const positions = geometry.attributes.position;
  const triangleCount = positions.count / 3;

  for (let i = 0; i < positions.count; i += 3) {
    const v1 = new Vector3(
      positions.getX(i),
      positions.getY(i),
      positions.getZ(i)
    );
    const v2 = new Vector3(
      positions.getX(i + 1),
      positions.getY(i + 1),
      positions.getZ(i + 1)
    );
    const v3 = new Vector3(
      positions.getX(i + 2),
      positions.getY(i + 2),
      positions.getZ(i + 2)
    );

    // Signed volume of tetrahedron (origin, v1, v2, v3)
    const tetraVolume = v1.dot(new Vector3().crossVectors(v2, v3)) / 6;
    volume += tetraVolume;
  }
  volume = Math.abs(volume);

  // Calculate edge length statistics
  const edges = [];
  let nanCount = 0;

  for (let i = 0; i < positions.count; i += 3) {
    const v1 = new Vector3(
      positions.getX(i),
      positions.getY(i),
      positions.getZ(i)
    );
    const v2 = new Vector3(
      positions.getX(i + 1),
      positions.getY(i + 1),
      positions.getZ(i + 1)
    );
    const v3 = new Vector3(
      positions.getX(i + 2),
      positions.getY(i + 2),
      positions.getZ(i + 2)
    );

    // Check for NaN
    if (
      isNaN(v1.x) || isNaN(v1.y) || isNaN(v1.z) ||
      isNaN(v2.x) || isNaN(v2.y) || isNaN(v2.z) ||
      isNaN(v3.x) || isNaN(v3.y) || isNaN(v3.z)
    ) {
      nanCount++;
      continue;
    }

    // Calculate edge lengths
    edges.push(v1.distanceTo(v2));
    edges.push(v2.distanceTo(v3));
    edges.push(v3.distanceTo(v1));
  }

  const minEdge = Math.min(...edges);
  const maxEdge = Math.max(...edges);
  const avgEdge = edges.reduce((a, b) => a + b, 0) / edges.length;

  // Detect degenerate triangles (edges > 50mm)
  const degenerateCount = edges.filter((e) => e > 50).length / 3;

  // Calculate aspect ratios (max edge / min edge per triangle)
  const aspectRatios = [];
  for (let i = 0; i < edges.length; i += 3) {
    const triangleEdges = [edges[i], edges[i + 1], edges[i + 2]];
    const minE = Math.min(...triangleEdges);
    const maxE = Math.max(...triangleEdges);
    if (minE > 0) {
      aspectRatios.push(maxE / minE);
    }
  }
  const maxAspectRatio = Math.max(...aspectRatios);

  // Generate ASCII preview (side view - XZ plane)
  const asciiWidth = 60;
  const asciiHeight = 20;
  const grid = Array(asciiHeight)
    .fill(null)
    .map(() => Array(asciiWidth).fill(' '));

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);

    const gridX = Math.floor(
      ((x - bbox.min.x) / dimensions.x) * (asciiWidth - 1)
    );
    const gridY = Math.floor(
      ((z - bbox.min.z) / dimensions.z) * (asciiHeight - 1)
    );

    if (gridX >= 0 && gridX < asciiWidth && gridY >= 0 && gridY < asciiHeight) {
      grid[asciiHeight - 1 - gridY][gridX] = '⬤';
    }
  }

  // Determine quality status
  let geometryStatus = '✓ PASS';
  let meshStatus = '✓ PASS';
  let overallStatus = '✓ MODEL VALID AND READY';

  const issues = [];

  if (volume < 1e-9) {
    geometryStatus = '❌ FAIL';
    overallStatus = '❌ VALIDATION FAILED';
    issues.push('Zero volume detected');
  }

  if (dimensions.x < 0.1 || dimensions.y < 0.1 || dimensions.z < 0.1) {
    geometryStatus = '❌ FAIL';
    overallStatus = '❌ VALIDATION FAILED';
    issues.push('Dimension collapse detected');
  }

  if (nanCount > 0) {
    meshStatus = '❌ FAIL';
    overallStatus = '❌ VALIDATION FAILED';
    issues.push(`${nanCount} NaN vertices detected`);
  }

  if (degenerateCount > 5) {
    meshStatus = '❌ FAIL';
    overallStatus = '❌ VALIDATION FAILED';
    issues.push(`${degenerateCount} degenerate triangles`);
  } else if (degenerateCount > 0) {
    meshStatus = '⚠️ WARN';
    if (overallStatus === '✓ MODEL VALID AND READY') {
      overallStatus = '⚠️ ISSUES DETECTED';
    }
    issues.push(`${degenerateCount} degenerate triangles (minor)`);
  }

  if (maxAspectRatio > 10) {
    meshStatus = meshStatus === '❌ FAIL' ? '❌ FAIL' : '⚠️ WARN';
    if (overallStatus === '✓ MODEL VALID AND READY') {
      overallStatus = '⚠️ ISSUES DETECTED';
    }
    issues.push(`High aspect ratio: ${maxAspectRatio.toFixed(1)}:1`);
  }

  // Print report
  console.log('=== VALIDATION REPORT ===\n');

  console.log(`File: ${stlPath}`);
  console.log(`Size: ${(stlBuffer.length / 1024).toFixed(1)} KB`);
  console.log(`Format: ${format} STL\n`);

  console.log(`Geometry: ${geometryStatus}`);
  console.log(`  Valid: ${geometryStatus.includes('PASS')}`);
  console.log(
    `  Dimensions: ${dimensions.x.toFixed(1)} × ${dimensions.y.toFixed(1)} × ${dimensions.z.toFixed(1)} mm`
  );
  console.log(`  Volume: ${volume.toFixed(1)} mm³`);
  console.log(
    `  Center: (${center.x.toFixed(1)}, ${center.y.toFixed(1)}, ${center.z.toFixed(1)})\n`
  );

  console.log(`Mesh Quality: ${meshStatus}`);
  console.log(`  Triangles: ${triangleCount.toLocaleString()}`);
  console.log(
    `  Edge lengths: ${minEdge.toFixed(2)}mm - ${maxEdge.toFixed(2)}mm (avg ${avgEdge.toFixed(2)}mm)`
  );
  if (degenerateCount > 0) {
    console.log(`  Degenerate triangles: ${degenerateCount}`);
  }
  if (maxAspectRatio > 5) {
    console.log(`  Max aspect ratio: ${maxAspectRatio.toFixed(1)}:1`);
  }
  if (nanCount > 0) {
    console.log(`  NaN vertices: ${nanCount}`);
  }
  console.log();

  console.log('ASCII Preview (side view):');
  for (const row of grid) {
    console.log(row.join(''));
  }
  console.log();

  console.log(`Overall: ${overallStatus}`);

  if (issues.length > 0) {
    console.log('\nIssues:');
    issues.forEach((issue) => console.log(`  - ${issue}`));
  }

  // Exit with appropriate code
  if (overallStatus.includes('FAILED')) {
    process.exit(1);
  } else if (overallStatus.includes('ISSUES')) {
    process.exit(0); // Non-blocking warning
  } else {
    process.exit(0);
  }
} catch (error) {
  console.error('❌ STL analysis failed:', error.message);
  process.exit(1);
}
