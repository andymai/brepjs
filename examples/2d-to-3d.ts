/**
 * 2D to 3D Workflow Example
 *
 * Creates a 2D sketch and extrudes it to a 3D solid.
 * Also generates an SVG preview of the 2D profile in examples/output/.
 *
 * Run:  npm run example examples/2d-to-3d.ts
 */

import './_setup.js';
import { writeFileSync, mkdirSync } from 'node:fs';

import {
  drawRectangle,
  drawCircle,
  drawingToSketchOnPlane,
  drawingCut,
  sketchExtrude,
  measureVolume,
  exportSTEP,
  isOk,
} from 'brepjs';

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

// ── Export 2D profile as SVG ───────────────────────────────────────────
const svgContent = finalProfile.toSVG(2);
const outDir = 'examples/output';
mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/2d-profile.svg`, svgContent);
console.log(`SVG preview written to ${outDir}/2d-profile.svg`);

// Convert drawing to sketch on XY plane
const sketch = drawingToSketchOnPlane(finalProfile, 'XY');

// Extrude the sketch to create a 3D solid (20mm height)
const solid = sketchExtrude(sketch, 20);

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
