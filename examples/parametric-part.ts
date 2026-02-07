/**
 * Parametric Part Example
 *
 * Demonstrates building a configurable mechanical part with parameters.
 * Shows how to compose multiple brepjs operations into a reusable function.
 *
 * This is a flanged pipe fitting with bolt holes — a common real-world
 * CAD pattern that combines extrusion, booleans, finders, fillets, and shelling.
 */

import './_setup.js';
import {
  makeBox,
  makeCylinder,
  fuseShape,
  cutShape,
  shellShape,
  filletShape,
  faceFinder,
  edgeFinder,
  rotateShape,
  measureVolume,
  exportSTEP,
  unwrap,
  isOk,
  type Shape3D,
} from 'brepjs';

/** Parameters for the flanged pipe. */
interface PipeParams {
  /** Inner radius of the pipe bore (mm). */
  boreRadius: number;
  /** Outer radius of the pipe tube (mm). */
  tubeRadius: number;
  /** Length of the pipe (mm). */
  length: number;
  /** Radius of the flanges (mm). */
  flangeRadius: number;
  /** Thickness of each flange (mm). */
  flangeThickness: number;
  /** Wall thickness when hollowed (mm). */
  wallThickness: number;
  /** Fillet radius at tube-to-flange transitions (mm). */
  filletRadius: number;
  /** Number of bolt holes per flange. */
  boltCount: number;
  /** Radius of each bolt hole (mm). */
  boltRadius: number;
  /** Radial distance of bolt holes from center (mm). */
  boltCircleRadius: number;
}

function buildFlangedPipe(params: PipeParams): Shape3D {
  const {
    tubeRadius,
    length,
    flangeRadius,
    flangeThickness,
    wallThickness,
    filletRadius,
    boltCount,
    boltRadius,
    boltCircleRadius,
  } = params;

  // Main tube
  const tube = makeCylinder(tubeRadius, length);

  // Flanges at both ends
  const bottomFlange = makeCylinder(flangeRadius, flangeThickness);
  const topFlange = makeCylinder(flangeRadius, flangeThickness, [0, 0, length - flangeThickness]);
  const body = unwrap(fuseShape(unwrap(fuseShape(tube, bottomFlange)), topFlange));

  // Hollow out: remove the top face, shell to wall thickness
  const topFaces = faceFinder().parallelTo('Z').atDistance(length, [0, 0, 0]).findAll(body);
  const hollowed = unwrap(shellShape(body, topFaces, wallThickness));

  // Fillet the tube-to-flange transition edges
  const transitionEdges = edgeFinder()
    .ofCurveType('CIRCLE')
    .ofLength(2 * Math.PI * tubeRadius, 0.1)
    .findAll(hollowed);
  let result: Shape3D = hollowed;
  if (transitionEdges.length > 0) {
    const filletResult = filletShape(hollowed, transitionEdges, filletRadius);
    if (isOk(filletResult)) {
      result = filletResult.value;
    }
  }

  // Bolt holes in bottom flange
  for (let i = 0; i < boltCount; i++) {
    const angle = (360 / boltCount) * i;
    const hole = rotateShape(
      makeCylinder(boltRadius, flangeThickness + 4, [boltCircleRadius, 0, -2]),
      angle,
      [0, 0, 0],
      [0, 0, 1]
    );
    result = unwrap(cutShape(result, hole));
  }

  // Bolt holes in top flange
  for (let i = 0; i < boltCount; i++) {
    const angle = (360 / boltCount) * i;
    const hole = rotateShape(
      makeCylinder(boltRadius, flangeThickness + 4, [boltCircleRadius, 0, length - flangeThickness - 2]),
      angle,
      [0, 0, 0],
      [0, 0, 1]
    );
    result = unwrap(cutShape(result, hole));
  }

  return result;
}

// ─── Build two size variants ────────────────────────────────────

const smallPipe = buildFlangedPipe({
  boreRadius: 10,
  tubeRadius: 15,
  length: 80,
  flangeRadius: 25,
  flangeThickness: 5,
  wallThickness: 2,
  filletRadius: 2,
  boltCount: 4,
  boltRadius: 2.5,
  boltCircleRadius: 20,
});

const largePipe = buildFlangedPipe({
  boreRadius: 20,
  tubeRadius: 30,
  length: 120,
  flangeRadius: 50,
  flangeThickness: 8,
  wallThickness: 3,
  filletRadius: 4,
  boltCount: 8,
  boltRadius: 4,
  boltCircleRadius: 40,
});

console.log('Small pipe volume:', measureVolume(smallPipe).toFixed(1), 'mm³');
console.log('Large pipe volume:', measureVolume(largePipe).toFixed(1), 'mm³');

const stepResult = exportSTEP(smallPipe);
if (isOk(stepResult)) {
  console.log('Exported small pipe:', stepResult.value.size, 'bytes');
}
