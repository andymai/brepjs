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

export { applyGlue } from './shapeBooleans.js';

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

// ── Functional API ──

export {
  getHashCode,
  isSameShape,
  isEqualShape,
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

export { exportSTEP, exportSTL, type EdgeMesh, type MeshOptions } from './meshFns.js';

export { fuseAll, cutAll, type BooleanOptions } from './booleanFns.js';

export {
  toBufferGeometryData,
  toLineGeometryData,
  type BufferGeometryData,
  type LineGeometryData,
} from './threeHelpers.js';
