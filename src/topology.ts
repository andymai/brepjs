/**
 * brepjs/topology — Shape creation, transforms, booleans, modifiers, meshing, and healing.
 *
 * @example
 * ```typescript
 * import { box, fuse, fillet, mesh } from 'brepjs/topology';
 * ```
 */

// ── Shape functions ──

export {
  getHashCode,
  isSameShape,
  isEqualShape,
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
  invalidateShapeCache,
  type Bounds3D,
  type ShapeDescription,
} from './topology/shapeFns.js';

// ── Primitives ──

export {
  box,
  cylinder,
  sphere,
  cone,
  torus,
  ellipsoid,
  line,
  circle,
  ellipse,
  helix,
  threePointArc,
  ellipseArc,
  bsplineApprox,
  bezier,
  tangentArc,
  wire,
  wireLoop,
  face,
  filledFace,
  subFace,
  polygon,
  vertex,
  compound,
  solid,
  sewShells,
  offsetFace,
  addHoles,
  type CylinderOptions,
  type SphereOptions,
  type ConeOptions,
  type TorusOptions,
  type CircleOptions,
  type HelixOptions,
  type EllipseArcOptions,
  type BSplineApproximationOptions,
} from './topology/primitiveFns.js';

// ── Boolean operations ──

export { fuseAll, cutAll, type BooleanOptions } from './topology/booleanFns.js';

export { chamferDistAngle as chamferDistAngleShape } from './topology/chamferAngleFns.js';

export { variableFillet, type VariableFilletRadius } from './topology/modifierFns.js';

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

// ── Positioning ──

export { positionOnCurve } from './topology/positionFns.js';

// ── Healing ──

export {
  healSolid,
  healFace,
  healWire,
  autoHeal,
  fixShape,
  solidFromShell,
  fixSelfIntersection,
  type HealingReport,
  type AutoHealOptions,
  type HealingStepDiagnostic,
} from './topology/healingFns.js';

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
