/**
 * Topology layer — shape hierarchy, casting, and construction helpers.
 */

// Eagerly wire up the circular dependency between cast.ts and shapes.ts
// so that cast() can construct Shape subclasses at runtime.
import * as shapesModule from './shapes.js';
import { initCast } from './cast.js';
initCast(shapesModule);

// Re-export everything from sub-modules
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
