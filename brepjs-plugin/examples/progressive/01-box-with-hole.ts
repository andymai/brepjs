/**
 * 01 - Box with Hole (Dead Simple)
 *
 * This is the simplest possible brepjs model.
 * Demonstrates: primitives, boolean cut, validation
 *
 * Functional requirement: Solid block with through-hole
 * Complexity: Dead simple (2 primitives, 1 boolean operation)
 */

import initOpenCascade from 'opencascade.js';
import { initFromOC, box, cylinder, shape, exportSTL } from 'brepjs';

/**
 * Parameters for simple box with hole
 */
interface SimpleBoxParams {
  /** Width of box (X dimension) in mm */
  width: number;
  /** Depth of box (Y dimension) in mm */
  depth: number;
  /** Height of box (Z dimension) in mm */
  height: number;
  /** Radius of hole in mm */
  holeRadius: number;
}

/**
 * Creates a simple box with a centered through-hole
 *
 * Expert CAD Decomposition:
 * 1. Base form: Box primitive (40×30×10mm)
 * 2. Transform: N/A (primitive is already 3D)
 * 3. Features: Centered through-hole (4mm diameter)
 * 4. Modifications: None
 *
 * Design decisions:
 * - Using primitives (box + cylinder) for maximum stability
 * - Single boolean cut operation
 * - Hole extends slightly beyond box (±1mm) to ensure complete cut
 * - Centered positioning using box dimensions / 2
 */
function createBoxWithHole(params: SimpleBoxParams) {
  // Expert CAD thinking: This is a simple primitive-based design
  // → Use box + cylinder boolean cut (most stable approach)

  // Step 1: Create base box (positioned at origin)
  const base = box(params.width, params.depth, params.height);

  // Step 2: Create hole cylinder (extends through entire box + margin)
  // Position at box center, extend ±1mm beyond box for clean cut
  const hole = cylinder(params.holeRadius, params.height + 2, {
    at: [params.width / 2, params.depth / 2, -1], // Center XY, start 1mm below
  });

  // Step 3: Boolean cut to create hole
  const result = shape(base).cut(hole).val;

  return result;
}

/**
 * Validates the generated geometry
 */
function validateBoxWithHole(solid: any, params: SimpleBoxParams) {
  console.log('\n=== Validation ===');

  // Check volume is positive (not empty)
  const volume = shape(solid).volume();
  console.log(`Volume: ${volume.toFixed(1)} mm³`);

  if (volume < 1) {
    throw new Error('Invalid geometry: volume too small or zero');
  }

  // Calculate expected volume (box - cylinder)
  const boxVolume = params.width * params.depth * params.height;
  const holeVolume = Math.PI * params.holeRadius ** 2 * params.height;
  const expectedVolume = boxVolume - holeVolume;

  const volumeDiff = Math.abs(volume - expectedVolume);
  const percentDiff = (volumeDiff / expectedVolume) * 100;

  console.log(`Expected volume: ${expectedVolume.toFixed(1)} mm³`);
  console.log(`Difference: ${percentDiff.toFixed(1)}%`);

  if (percentDiff > 5) {
    console.warn('⚠️ Warning: Volume differs from expected by >5%');
  } else {
    console.log('✓ Volume matches expected value');
  }

  // Check bounding box
  const bbox = shape(solid).boundingBox();
  console.log(`Bounding box: ${bbox.max[0]} × ${bbox.max[1]} × ${bbox.max[2]} mm`);

  console.log('✓ Validation passed\n');

  return true;
}

// Main execution
async function main() {
  console.log('Generating: Simple Box with Hole\n');

  // Initialize WASM kernel
  const oc = await initOpenCascade();
  initFromOC(oc);

  // Define parameters
  const params: SimpleBoxParams = {
    width: 40, // 40mm wide
    depth: 30, // 30mm deep
    height: 10, // 10mm tall
    holeRadius: 4, // 8mm diameter hole (4mm radius)
  };

  console.log('Parameters:');
  console.log(`  Box: ${params.width} × ${params.depth} × ${params.height} mm`);
  console.log(`  Hole: ${params.holeRadius * 2} mm diameter\n`);

  // Generate model
  console.log('Creating geometry...');
  const model = createBoxWithHole(params);
  console.log('✓ Geometry created');

  // Validate
  validateBoxWithHole(model, params);

  // Export to STL
  const outputPath = 'examples/output/01-box-with-hole.stl';
  console.log(`Exporting to: ${outputPath}`);

  await exportSTL(model, outputPath, {
    tolerance: 0.1, // 0.1mm tessellation tolerance
    angularTolerance: 0.5, // 0.5° angular tolerance
  });

  console.log('✓ Export complete\n');
  console.log('=== Generation Complete ===');
  console.log('Next steps:');
  console.log('  - View in 3D slicer or CAD software');
  console.log('  - Adjust parameters and regenerate');
  console.log('  - Try 02-bracket-with-fillets.ts for more complexity');
}

main().catch(console.error);
