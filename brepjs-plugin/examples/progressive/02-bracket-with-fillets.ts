/**
 * 02 - Bracket with Fillets (Adding Complexity)
 *
 * Introduces: filleting, edge finders, parametric interfaces
 * Demonstrates: selective edge modification, sketch→extrude workflow
 *
 * Functional requirement: L-shaped bracket for mounting, with stress-relief fillets
 * Complexity: Moderate (2D profile, extrusion, filleting)
 */

import initOpenCascade from 'opencascade.js';
import { initFromOC, box, cylinder, shape, exportSTL } from 'brepjs';

interface BracketParams {
  /** Base width (X) in mm */
  baseWidth: number;
  /** Base depth (Y) in mm */
  baseDepth: number;
  /** Wall height (Z) in mm */
  wallHeight: number;
  /** Wall thickness in mm */
  thickness: number;
  /** Mounting hole diameter in mm */
  holeSize: number;
  /** Fillet radius for stress relief in mm */
  filletRadius: number;
}

/**
 * Creates L-shaped mounting bracket
 *
 * Expert CAD Decomposition:
 * 1. Base form: Two box primitives (base + wall)
 * 2. Transform: Position wall perpendicular to base
 * 3. Features: 4 mounting holes (2 in base, 2 in wall)
 * 4. Modifications: Fillet inside corner (stress relief)
 */
function createBracket(params: BracketParams) {
  // Expert CAD thinking: L-shaped bracket is two perpendicular boxes
  // → Use primitives + boolean union + filleting

  // Base plate
  const base = box(params.baseWidth, params.baseDepth, params.thickness);

  // Vertical wall (positioned at back edge of base)
  const wall = box(
    params.baseWidth,
    params.thickness,
    params.wallHeight,
    { at: [0, params.baseDepth - params.thickness, params.thickness] }
  );

  // Union base and wall
  let bracket = shape(base).fuse(wall).val;

  // Add mounting holes
  const holeRadius = params.holeSize / 2;

  // Base holes (2 holes near front edge)
  const baseHole1 = cylinder(holeRadius, params.thickness + 2, {
    at: [params.baseWidth * 0.2, params.baseDepth * 0.3, -1],
  });
  const baseHole2 = cylinder(holeRadius, params.thickness + 2, {
    at: [params.baseWidth * 0.8, params.baseDepth * 0.3, -1],
  });

  // Wall holes (2 holes in vertical wall)
  const wallHole1 = cylinder(holeRadius, params.thickness + 2, {
    at: [params.baseWidth * 0.2, params.baseDepth - params.thickness / 2, params.wallHeight * 0.5],
    direction: [0, 1, 0], // Horizontal through wall
  });
  const wallHole2 = cylinder(holeRadius, params.thickness + 2, {
    at: [params.baseWidth * 0.8, params.baseDepth - params.thickness / 2, params.wallHeight * 0.5],
    direction: [0, 1, 0],
  });

  // Cut all holes
  bracket = shape(bracket)
    .cut(baseHole1)
    .cut(baseHole2)
    .cut(wallHole1)
    .cut(wallHole2)
    .val;

  // Fillet inside corner (stress relief)
  const edges = shape(bracket).edges();
  // Find horizontal edge where base meets wall (inside corner)
  const cornerEdges = edges.filter((edge) => {
    const center = shape(edge).center();
    return (
      Math.abs(center[2] - params.thickness) < 0.1 && // Z = thickness height
      Math.abs(center[1] - (params.baseDepth - params.thickness)) < 0.1 // Y = wall position
    );
  });

  if (cornerEdges.length > 0) {
    bracket = shape(bracket).fillet(params.filletRadius, cornerEdges).val;
  }

  return bracket;
}

async function main() {
  console.log('Generating: Bracket with Fillets\n');

  const oc = await initOpenCascade();
  initFromOC(oc);

  const params: BracketParams = {
    baseWidth: 60,
    baseDepth: 40,
    wallHeight: 50,
    thickness: 4,
    holeSize: 5, // M5 mounting holes
    filletRadius: 3,
  };

  const model = createBracket(params);
  await exportSTL(model, 'examples/output/02-bracket-with-fillets.stl', {
    tolerance: 0.1,
    angularTolerance: 0.5,
  });

  console.log('✓ Export complete');
  console.log('Next: Try 03-gear-pair.ts for functional mechanical components');
}

main().catch(console.error);
