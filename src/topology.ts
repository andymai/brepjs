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
  type Bounds3D,
  type ShapeDescription,
} from './topology/shapeFns.js';

// ── Boolean operations ──

export { fuseAll, cutAll, type BooleanOptions } from './topology/booleanFns.js';

export { chamferDistAngle as chamferDistAngleShape } from './topology/chamferAngleFns.js';

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

// ── Healing ──

export {
  healSolid,
  healFace,
  healWire,
  autoHeal,
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
