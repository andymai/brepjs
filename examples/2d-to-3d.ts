/**
 * 2D to 3D Workflow Example
 *
 * Creates a 2D sketch and extrudes it to a 3D solid.
 */

import {
  draw,
  drawRectangle,
  drawCircle,
  drawingToSketchOnPlane,
  drawingCut,
  sketchExtrude,
  measureVolume,
  exportSTEP,
  unwrap,
  isOk,
} from 'brepjs';

async function main() {
  // Create a 2D profile using the drawing API

  // Outer rectangle (50mm x 30mm)
  const outer = drawRectangle(50, 30);

  // Inner cutout circles (two 8mm diameter holes)
  const hole1 = drawCircle(4).translate([12, 15]);
  const hole2 = drawCircle(4).translate([38, 15]);

  // Combine: outer rectangle with holes cut out
  const profileWithHoles = drawingCut(outer, hole1);
  const finalProfile = drawingCut(profileWithHoles, hole2);

  console.log('2D profile created with holes');

  // Convert drawing to sketch on XY plane
  const sketch = drawingToSketchOnPlane(finalProfile, 'XY');

  // Extrude the sketch to create a 3D solid (20mm height)
  const extrudeResult = sketchExtrude(sketch, { height: 20 });

  if (!isOk(extrudeResult)) {
    console.error('Extrude failed:', extrudeResult.error);
    return;
  }

  const solid = extrudeResult.value;

  // Measure the result
  const volume = measureVolume(solid);
  console.log(`\n3D solid created:`);
  console.log(`  Height: 20 mm`);
  console.log(`  Volume: ${volume.toFixed(1)} mm³`);

  // Calculate theoretical volume for verification
  const rectArea = 50 * 30;
  const holeArea = Math.PI * 4 * 4 * 2; // Two circles
  const theoreticalVolume = (rectArea - holeArea) * 20;
  console.log(`  Expected volume: ${theoreticalVolume.toFixed(1)} mm³`);

  // Export
  const stepResult = exportSTEP(solid);
  if (isOk(stepResult)) {
    console.log(`  STEP file: ${stepResult.value.size} bytes`);
  }
}

main().catch(console.error);
