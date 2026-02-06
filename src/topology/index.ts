/**
 * Topology layer — shape hierarchy, casting, and construction helpers.
 *
 * Exports both legacy class-based API and new functional API.
 * New code should prefer the functional exports (shapeFns, curveFns, faceFns, etc.).
 */

// Eagerly wire up the circular dependency between cast.ts and shapes.ts
// so that cast() can construct Shape subclasses at runtime.
import * as shapesModule from './shapes.js';
import { initCast } from './cast.js';
initCast(shapesModule);

// ── Legacy class-based API (kept for backward compatibility) ──

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
  initCast,
  type TopoEntity,
  type GenericTopo,
} from './cast.js';

export {
  Shape,
  Vertex,
  Curve,
  _1DShape,
  _1DShape as LinearShape,
  Edge,
  Wire,
  Surface,
  Face,
  _3DShape,
  _3DShape as SolidShape,
  Shell,
  Solid,
  CompSolid,
  Compound,
  fuseAll,
  cutAll,
  buildCompound,
  buildCompoundOc,
  applyGlue,
  registerQueryModule,
  isNumber,
  isChamferRadius,
  isFilletRadius,
  type AnyShape,
  type Shape3D,
  type CurveLike,
  type ChamferRadius,
  type FilletRadius,
  type RadiusConfig,
  type FaceTriangulation,
  type ShapeMesh,
  type SurfaceType,
  type BooleanOperationOptions,
  type CurveType,
} from './shapes.js';

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
  compoundShapes,
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
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- re-export for backward compat
  triangulateFace,
  type UVBounds,
  type FaceTriangulation as FnFaceTriangulation,
  type SurfaceType as FnSurfaceType,
} from './faceFns.js';

export {
  meshShape,
  meshShapeEdges,
  exportSTEP,
  exportSTL,
  type ShapeMesh as FnShapeMesh,
  type EdgeMesh,
  type MeshOptions,
} from './meshFns.js';

export {
  fuseShapes,
  cutShape,
  intersectShapes,
  sectionShape,
  fuseAll as fnFuseAll,
  cutAll as fnCutAll,
  buildCompound as fnBuildCompound,
  type BooleanOptions,
} from './booleanFns.js';

export {
  toBufferGeometryData,
  toLineGeometryData,
  type BufferGeometryData,
  type LineGeometryData,
} from './threeHelpers.js';

export { thickenSurface } from './modifierFns.js';
