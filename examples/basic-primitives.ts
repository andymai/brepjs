/**
 * Basic Primitives Example
 *
 * Demonstrates creating primitive shapes and performing boolean operations.
 */

import {
  makeBox,
  makeCylinder,
  makeSphere,
  castShape,
  fuseShapes,
  cutShape,
  intersectShapes,
  fnMeasureVolume,
  fnExportSTEP,
  unwrap,
  isOk,
} from 'brepjs';

async function main() {
  // Create basic primitives
  const box = castShape(makeBox([0, 0, 0], [20, 20, 20]).wrapped);
  const cylinder = castShape(makeCylinder(5, 30).wrapped);
  const sphere = castShape(makeSphere(8).wrapped);

  console.log('Created primitives:');
  console.log(`  Box volume: ${fnMeasureVolume(box).toFixed(1)} mm³`);
  console.log(`  Cylinder volume: ${fnMeasureVolume(cylinder).toFixed(1)} mm³`);
  console.log(`  Sphere volume: ${fnMeasureVolume(sphere).toFixed(1)} mm³`);

  // Boolean operations

  // 1. Fuse: Combine two shapes
  const fusedResult = fuseShapes(box, cylinder);
  if (isOk(fusedResult)) {
    console.log(`\nFused (box + cylinder): ${fnMeasureVolume(fusedResult.value).toFixed(1)} mm³`);
  }

  // 2. Cut: Subtract one shape from another
  const cutResult = cutShape(box, sphere);
  if (isOk(cutResult)) {
    console.log(`Cut (box - sphere): ${fnMeasureVolume(cutResult.value).toFixed(1)} mm³`);
  }

  // 3. Intersect: Common volume of two shapes
  const intersectResult = intersectShapes(box, sphere);
  if (isOk(intersectResult)) {
    console.log(
      `Intersect (box ∩ sphere): ${fnMeasureVolume(intersectResult.value).toFixed(1)} mm³`
    );
  }

  // Export to STEP
  const stepResult = fnExportSTEP(unwrap(fusedResult));
  if (isOk(stepResult)) {
    console.log(`\nExported STEP file (${stepResult.value.size} bytes)`);
  }
}

main().catch(console.error);
