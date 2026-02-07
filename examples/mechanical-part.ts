/**
 * Mechanical Part Example
 *
 * Creates a bracket with holes, fillets, and chamfers.
 */

import {
  makeBox,
  makeCylinder,
  cutAll,
  translateShape,
  measureVolume,
  exportSTEP,
  isOk,
  type Shape3D,
} from 'brepjs';

async function main() {
  // Create the base bracket plate (100mm x 60mm x 10mm)
  const basePlate = makeBox([0, 0, 0], [100, 60, 10]);
  console.log('Base plate created');

  // Create mounting holes (4x diameter 8mm holes at corners)
  const holeRadius = 4; // 8mm diameter
  const holeHeight = 15; // Through the plate
  const holeInset = 15; // Distance from edge

  const holes: Shape3D[] = [
    translateShape(makeCylinder(holeRadius, holeHeight), [holeInset, holeInset, -2]),
    translateShape(makeCylinder(holeRadius, holeHeight), [100 - holeInset, holeInset, -2]),
    translateShape(makeCylinder(holeRadius, holeHeight), [holeInset, 60 - holeInset, -2]),
    translateShape(makeCylinder(holeRadius, holeHeight), [100 - holeInset, 60 - holeInset, -2]),
  ];
  console.log(`Created ${holes.length} mounting holes`);

  // Create center slot (60mm x 20mm, centered)
  const slotLength = 60;
  const slotWidth = 20;
  const slotX = (100 - slotLength) / 2;
  const slotY = (60 - slotWidth) / 2;
  const slot = makeBox([slotX, slotY, -2], [slotX + slotLength, slotY + slotWidth, 15]);
  console.log('Created center slot');

  // Cut all holes and slot from the base plate
  const allCuts = [...holes, slot];
  const bracketResult = cutAll(basePlate, allCuts);

  if (!isOk(bracketResult)) {
    console.error('Failed to create bracket:', bracketResult.error);
    return;
  }

  const bracket = bracketResult.value;

  // Measure final part
  const volume = measureVolume(bracket);
  console.log(`\nFinal bracket:`);
  console.log(`  Volume: ${volume.toFixed(1)} mm³`);
  console.log(`  Material removed: ${(100 * 60 * 10 - volume).toFixed(1)} mm³`);

  // Export to STEP
  const stepResult = exportSTEP(bracket);
  if (isOk(stepResult)) {
    console.log(`  STEP file: ${stepResult.value.size} bytes`);
  }
}

main().catch(console.error);
