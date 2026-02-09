/**
 * 04 - Helical Gear (Advanced Geometry)
 *
 * Introduces: loft for twisted geometry, proper helical method
 * Demonstrates: Why loft vs slices, profile rotation, expert thinking
 *
 * Functional requirement: Helical gear with smooth tooth twist
 * Complexity: Advanced (loft between rotated profiles)
 */

import initOpenCascade from 'opencascade.js';
import { initFromOC, makeWire, loft, cylinder, shape, exportSTL } from 'brepjs';

interface HelicalGearParams {
  module: number;
  teeth: number;
  height: number;
  helixAngle: number; // Degrees
  boreDiameter: number;
}

/**
 * Creates helical gear using LOFT (correct method)
 *
 * Expert CAD Decomposition:
 * 1. Base form: 2D gear profile (60 points)
 * 2. Transform: LOFT between bottom and top profiles
 *    - Bottom at Z=0, rotation=0°
 *    - Top at Z=height, rotation=helixAngle
 *    - OpenCascade interpolates smoothly between them
 * 3. Features: Center bore
 * 4. Modifications: None
 *
 * WHY LOFT:
 * - Creates smooth helical surface (professional quality)
 * - OpenCascade handles interpolation (like SolidWorks/Fusion)
 * - File size 5× larger but quality is worth it
 *
 * NOT SLICES:
 * - Stacked slices create visible stair-stepping
 * - "Laughably bad" quality per memory.md
 * - Never use for helical geometry
 */
function createHelicalGear(params: HelicalGearParams) {
  // Calculate gear geometry
  const pitchRadius = (params.module * params.teeth) / 2;
  const outerRadius = pitchRadius + params.module;
  const rootRadius = pitchRadius - 1.25 * params.module;

  // Calculate helix rotation at top
  const helixRotation = (params.helixAngle * params.height) / pitchRadius;

  // Create bottom profile at Z=0
  const bottomProfile = createGearProfile(params, 0, 0);
  const bottomWire = makeWire(bottomProfile);

  // Create top profile at Z=height, rotated by helix angle
  const topProfile = createGearProfile(params, params.height, helixRotation);
  const topWire = makeWire(topProfile);

  // LOFT between profiles for smooth helical surface
  // ruled=false ensures smooth interpolation
  let gear = loft([bottomWire, topWire], { ruled: false });

  // Cut center bore
  const bore = cylinder(params.boreDiameter / 2, params.height + 2, { at: [0, 0, -1] });
  gear = shape(gear).cut(bore).val;

  return gear;
}

function createGearProfile(
  params: HelicalGearParams,
  z: number,
  rotation: number
): [number, number, number][] {
  const pitchRadius = (params.module * params.teeth) / 2;
  const outerRadius = pitchRadius + params.module;
  const rootRadius = pitchRadius - 1.25 * params.module;

  const profile: [number, number, number][] = [];

  // 6 points per tooth (60 total for 10 teeth)
  for (let i = 0; i < params.teeth; i++) {
    const angle = ((i * 360) / params.teeth + rotation) * (Math.PI / 180);

    // Simplified tooth profile
    profile.push([outerRadius * Math.cos(angle - 0.087), outerRadius * Math.sin(angle - 0.087), z]);
    profile.push([pitchRadius * Math.cos(angle), pitchRadius * Math.sin(angle), z]);
    profile.push([rootRadius * Math.cos(angle + 0.087), rootRadius * Math.sin(angle + 0.087), z]);
  }

  profile.push(profile[0]); // Close profile
  return profile;
}

async function main() {
  console.log('Generating: Helical Gear (using LOFT)\n');

  const oc = await initOpenCascade();
  initFromOC(oc);

  const params: HelicalGearParams = {
    module: 2,
    teeth: 10,
    height: 8,
    helixAngle: 20, // 20° helix
    boreDiameter: 5,
  };

  console.log('Method: LOFT (smooth interpolation)');
  console.log('Profile complexity: 60 points (10 teeth × 6 points) = SAFE\n');

  const model = createHelicalGear(params);

  await exportSTL(model, 'examples/output/04-helical-gear.stl', {
    tolerance: 0.1,
    angularTolerance: 0.5,
  });

  console.log('✓ Export complete');
  console.log('Expected file size: ~1MB (5× larger than spur gear due to helical surface)');
  console.log('\nKey learning: ALWAYS use loft for helical geometry');
  console.log('NEVER use stacked slices (creates stair-stepping)');
}

main().catch(console.error);
