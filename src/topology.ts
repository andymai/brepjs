/**
 * brepjs/topology — Shape creation, transforms, booleans, modifiers, meshing, and healing.
 *
 * @example
 * ```typescript
 * import { makeBox, fuseShape, filletShape, meshShape } from 'brepjs/topology';
 * ```
 */

// ── Shape creation ──

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
} from './topology/index.js';

// ── Shape functions ──

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
  getVertices,
  iterEdges,
  iterFaces,
  iterWires,
  iterVertices,
  getBounds,
  vertexPosition,
  describeShape,
  type Bounds3D,
  type ShapeDescription,
} from './topology/shapeFns.js';

// ── Boolean operations ──

export {
  fuseShape,
  cutShape,
  intersectShape,
  sectionShape,
  splitShape,
  sliceShape,
  fuseAll,
  cutAll,
  type BooleanOptions,
} from './topology/booleanFns.js';

// ── Modifiers ──

export {
  thickenSurface,
  filletShape,
  chamferShape,
  shellShape,
  offsetShape,
} from './topology/modifierFns.js';

export { chamferDistAngleShape } from './topology/chamferAngleFns.js';

// ── Curves ──

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
  interpolateCurve,
  approximateCurve,
  type InterpolateCurveOptions,
  type ApproximateCurveOptions,
} from './topology/curveFns.js';

// ── Faces ──

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
  classifyPointOnFace,
  outerWire,
  innerWires,
  projectPointOnFace,
  type UVBounds,
  type PointProjectionResult,
} from './topology/faceFns.js';

// ── Adjacency ──

export {
  facesOfEdge,
  edgesOfFace,
  wiresOfFace,
  verticesOfEdge,
  adjacentFaces,
  sharedEdges,
} from './topology/adjacencyFns.js';

// ── Meshing and export ──

export {
  meshShape,
  meshShapeEdges,
  exportSTEP,
  exportSTL,
  exportIGES,
  type ShapeMesh,
  type EdgeMesh,
  type MeshOptions,
} from './topology/meshFns.js';

export { clearMeshCache, createMeshCache, type MeshCacheContext } from './topology/meshCache.js';

// ── Three.js integration ──

export {
  toBufferGeometryData,
  toLineGeometryData,
  toGroupedBufferGeometryData,
  type BufferGeometryData,
  type LineGeometryData,
  type GroupedBufferGeometryData,
  type BufferGeometryGroup,
} from './topology/threeHelpers.js';

// ── Healing ──

export {
  isShapeValid,
  healSolid,
  healFace,
  healWire,
  healShape,
  autoHeal,
  type HealingReport,
  type AutoHealOptions,
  type HealingStepDiagnostic,
} from './topology/healingFns.js';

// ── Pipe ──

export { pipe, type ShapePipe } from './topology/pipeFns.js';

// ── Cast ──

export {
  cast,
  downcast,
  shapeType,
  iterTopo,
  asTopo,
  isCompSolid,
  deserializeShape,
  type TopoEntity,
  type GenericTopo,
} from './topology/index.js';
