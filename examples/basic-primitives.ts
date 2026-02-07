/**
 * Basic Primitives Example
 *
 * Demonstrates creating primitive shapes and performing boolean operations.
 */

import {
  makeBox,
  makeCylinder,
  makeSphere,
  fuseShapes,
  cutShape,
  intersectShapes,
  measureVolume,
  exportSTEP,
  unwrap,
  isOk,
} from 'brepjs';

async function main() {
  // Create basic primitives — constructors return branded types directly
  const box = makeBox([0, 0, 0], [20, 20, 20]);
  const cylinder = makeCylinder(5, 30);
  const sphere = makeSphere(8);

  console.log('Created primitives:');
  console.log(`  Box volume: ${measureVolume(box).toFixed(1)} mm³`);
  console.log(`  Cylinder volume: ${measureVolume(cylinder).toFixed(1)} mm³`);
  console.log(`  Sphere volume: ${measureVolume(sphere).toFixed(1)} mm³`);

  // Boolean operations

  // 1. Fuse: Combine two shapes
  const fusedResult = fuseShapes(box, cylinder);
  if (isOk(fusedResult)) {
    console.log(`\nFused (box + cylinder): ${measureVolume(fusedResult.value).toFixed(1)} mm³`);
  }

  // 2. Cut: Subtract one shape from another
  const cutResult = cutShape(box, sphere);
  if (isOk(cutResult)) {
    console.log(`Cut (box - sphere): ${measureVolume(cutResult.value).toFixed(1)} mm³`);
  }

  // 3. Intersect: Common volume of two shapes
  const intersectResult = intersectShapes(box, sphere);
  if (isOk(intersectResult)) {
    console.log(
      `Intersect (box ∩ sphere): ${measureVolume(intersectResult.value).toFixed(1)} mm³`
    );
  }

  // Export to STEP
  const stepResult = exportSTEP(unwrap(fusedResult));
  if (isOk(stepResult)) {
    console.log(`\nExported STEP file (${stepResult.value.size} bytes)`);
  }
}

main().catch(console.error);
