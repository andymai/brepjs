/**
 * Barrel re-export — keeps `import { ... } from './shapeHelpers.js'` working
 * after the split into focused modules.
 */

// ── Curve construction ──
export {
  makeLine,
  makeCircle,
  makeEllipse,
  makeHelix,
  makeThreePointArc,
  makeEllipseArc,
  makeBSplineApproximation,
  type BSplineApproximationOptions,
  makeBezierCurve,
  makeTangentArc,
  assembleWire,
} from './curveBuilders.js';

// ── Surface / face construction ──
export {
  makeFace,
  makeNewFaceWithinFace,
  makeNonPlanarFace,
  addHolesInFace,
  makePolygon,
} from './surfaceBuilders.js';

// ── Solid and primitive construction ──
export {
  makeCylinder,
  makeSphere,
  makeCone,
  makeTorus,
  makeEllipsoid,
  makeBox,
  makeVertex,
  makeOffset,
  makeCompound,
  makeSolid,
} from './solidBuilders.js';

// ── Shape assembly utilities ──
export { weldShellsAndFaces } from './shapeUtils.js';
