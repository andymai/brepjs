/**
 * Import/Export Example
 *
 * Demonstrates loading STEP files, modifying shapes, and exporting.
 */

import {
  makeBox,
  castShape,
  fnImportSTEP,
  fnExportSTEP,
  fnExportSTL,
  translateShape,
  scaleShape,
  fnMeasureVolume,
  meshShape,
  isOk,
  unwrap,
} from 'brepjs';

async function main() {
  // Create a sample shape to export
  const originalBox = castShape(makeBox([0, 0, 0], [50, 30, 20]).wrapped);
  console.log('Original shape volume:', fnMeasureVolume(originalBox).toFixed(1), 'mm³');

  // Export to STEP
  const stepBlob = unwrap(fnExportSTEP(originalBox));
  console.log('\nExported to STEP:', stepBlob.size, 'bytes');

  // Import the STEP file back
  const importResult = await fnImportSTEP(stepBlob);
  if (!isOk(importResult)) {
    console.error('Import failed:', importResult.error);
    return;
  }

  const importedShape = importResult.value;
  console.log('Imported shape volume:', fnMeasureVolume(importedShape).toFixed(1), 'mm³');

  // Modify the imported shape
  // 1. Scale by 2x
  const scaled = scaleShape(importedShape, 2);
  console.log('\nScaled 2x volume:', fnMeasureVolume(scaled).toFixed(1), 'mm³');

  // 2. Translate to new position
  const translated = translateShape(scaled, [100, 0, 0]);
  console.log('Translated to [100, 0, 0]');

  // Export to STL for 3D printing
  const stlResult = fnExportSTL(translated);
  if (isOk(stlResult)) {
    console.log('\nExported to STL:', stlResult.value.size, 'bytes');
  }

  // Generate mesh for visualization
  const mesh = meshShape(translated, { linearDeflection: 0.1 });
  console.log('\nMesh generated:');
  console.log('  Vertices:', mesh.vertices.length / 3);
  console.log('  Triangles:', mesh.faces.length / 3);
  console.log('  Normals:', mesh.normals.length / 3);
}

main().catch(console.error);
