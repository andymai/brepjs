/**
 * Topology layer — casting, construction helpers, and functional API.
 */

// ── Cast and topology utilities ──

export {
  cast,
  downcast,
  shapeType,
  iterTopo,
  asTopo,
  isShape3D,
  isWire,
  isCompSolid,
  deserializeShape,
  type TopoEntity,
  type GenericTopo,
} from './cast.js';

// ── Boolean operations (OOP layer) ──

export { applyGlue, type BooleanOperationOptions } from './shapeBooleans.js';

// ── Modifier helpers ──

export {
  isNumber,
  isChamferRadius,
  isFilletRadius,
  type ChamferRadius,
  type FilletRadius,
  type RadiusConfig,
} from './shapeModifiers.js';

// ── Re-export branded shape types from core ──

export type { AnyShape, Shape3D, CurveLike } from '../core/shapeTypes.js';

// ── Re-export domain types from functional modules ──

export type { CurveType } from '../core/definitionMaps.js';

export {
  makeLine,
  makeCircle,
  makeEllipse,
  makeHelix,
  makeThreePointArc,
  makeEllipseArc,
  makeBSplineApproximation,
  makeBezierCurve,
  makeTangentArc,
  assembleWire,
  makeFace,
  makeNewFaceWithinFace,
  makeNonPlanarFace,
  makeCylinder,
  makeSphere,
  makeCone,
  makeTorus,
  makeEllipsoid,
  makeBox,
  makeVertex,
  makeOffset,
  makeCompound,
  weldShellsAndFaces,
  makeSolid,
  addHolesInFace,
  makePolygon,
  type BSplineApproximationConfig,
} from './shapeHelpers.js';

// ── New functional API ──

export {
  cloneShape,
  serializeShape,
  getHashCode,
  isShapeNull,
  isSameShape,
  isEqualShape,
  simplifyShape,
  translateShape,
  rotateShape,
  mirrorShape,
  scaleShape,
  getEdges,
  getFaces,
  getWires,
  iterEdges,
  iterFaces,
  iterWires,
  getBounds,
  vertexPosition,
  type Bounds3D,
} from './shapeFns.js';

export {
  getCurveType,
  curveStartPoint,
  curveEndPoint,
  curvePointAt,
  curveTangentAt,
  curveLength,
  curveIsClosed,
  curveIsPeriodic,
  curvePeriod,
  getOrientation,
  flipOrientation,
  offsetWire2D,
} from './curveFns.js';

export {
  getSurfaceType,
  faceGeomType,
  faceOrientation,
  flipFaceOrientation,
  uvBounds,
  pointOnSurface,
  uvCoordinates,
  normalAt,
  faceCenter,
  outerWire,
  innerWires,
  type UVBounds,
} from './faceFns.js';

export {
  meshShape,
  meshShapeEdges,
  exportSTEP,
  exportSTL,
  type EdgeMesh,
  type MeshOptions,
} from './meshFns.js';

export {
  fuseShape,
  cutShape,
  intersectShape,
  sectionShape,
  type BooleanOptions,
} from './booleanFns.js';

export {
  toBufferGeometryData,
  toLineGeometryData,
  type BufferGeometryData,
  type LineGeometryData,
} from './threeHelpers.js';

export { thickenSurface } from './modifierFns.js';
