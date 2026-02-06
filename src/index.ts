/**
 * brepjs — Public API
 */

// ── Layer 0: kernel / utils ──

export { setOC, getOC } from './oclib.js';

// ── Result type ──

export {
  ok,
  err,
  OK,
  isOk,
  isErr,
  map,
  mapErr,
  andThen,
  flatMap,
  unwrap,
  unwrapOr,
  unwrapOrElse,
  unwrapErr,
  match,
  collect,
  tryCatch,
  tryCatchAsync,
  type Result,
  type Ok,
  type Err,
  type Unit,
} from './core/result.js';

export {
  type BrepError,
  type BrepErrorKind,
  BrepErrorCode,
  occtError,
  validationError,
  typeCastError,
  sketcherStateError,
  moduleInitError,
  computationError,
  ioError,
  queryError,
  bug,
  BrepBugError,
} from './core/errors.js';

// ── Layer 1: core ──

export { DEG2RAD, RAD2DEG, HASH_CODE_MAX } from './core/constants.js';

export {
  WrappingObj,
  gcWithScope,
  gcWithObject,
  localGC,
  type Deletable,
  // Deprecated aliases — use gcWithScope and gcWithObject instead
  GCWithScope,
  GCWithObject,
} from './core/memory.js';

// Legacy type exports (kept for compatibility)
export {
  makeDirection,
  isPoint,
  type Point,
  type PlaneName,
  type SimplePoint,
} from './core/geometry.js';

export {
  makePlane,
  makePlaneFromFace,
  rotate,
  translate,
  mirror,
  scale,
} from './core/geometryHelpers.js';

export { findCurveType } from './core/definitionMaps.js';
export type { CurveType } from './core/definitionMaps.js';

// ── Layer 2: topology (via barrel — includes initCast wiring) ──

export {
  // cast.ts
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
  // shapes.ts
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
  // shapeHelpers.ts
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
} from './topology/index.js';

// ── Layer 2: operations ──

export {
  basicFaceExtrusion,
  revolution,
  genericSweep,
  complexExtrude,
  twistExtrude,
  supportExtrude,
  type GenericSweepConfig,
  type ExtrusionProfile,
} from './operations/extrude.js';

export { loft, type LoftConfig } from './operations/loft.js';

export {
  AssemblyExporter,
  createAssembly,
  exportSTEP,
  type ShapeConfig,
  type SupportedUnit,
} from './operations/exporters.js';

export { fuseAllShapes, cutAllShapes } from './operations/batchBooleans.js';

// ── Layer 2: 2d ──

export { type Point2D, BoundingBox2d, Curve2D, axis2d } from './2d/lib/index.js';

export { default as Blueprint } from './2d/blueprints/Blueprint.js';
export { default as CompoundBlueprint } from './2d/blueprints/CompoundBlueprint.js';
export { default as Blueprints } from './2d/blueprints/Blueprints.js';
export { organiseBlueprints } from './2d/blueprints/lib.js';
export { polysidesBlueprint, roundedRectangleBlueprint } from './2d/blueprints/cannedBlueprints.js';
export {
  fuseBlueprints,
  cutBlueprints,
  intersectBlueprints,
} from './2d/blueprints/booleanOperations.js';
export { fuse2D, cut2D, intersect2D, type Shape2D } from './2d/blueprints/boolean2D.js';
export type { ScaleMode } from './2d/curves.js';

// ── Layer 2: 2d (functional) ──

export {
  reverseCurve,
  curve2dBoundingBox,
  curve2dFirstPoint,
  curve2dLastPoint,
  curve2dSplitAt,
  curve2dParameter,
  curve2dTangentAt,
  curve2dIsOnCurve,
  curve2dDistanceFrom,
} from './2d/lib/curve2dFns.js';

export {
  createBlueprint,
  blueprintBoundingBox,
  blueprintOrientation,
  translateBlueprint,
  rotateBlueprint,
  scaleBlueprint,
  mirrorBlueprint,
  stretchBlueprint,
  blueprintToSVGPathD,
  blueprintIsInside,
  sketchBlueprintOnPlane,
  sketchBlueprintOnFace,
} from './2d/blueprints/blueprintFns.js';

export {
  fuseBlueprint2D,
  cutBlueprint2D,
  intersectBlueprint2D,
} from './2d/blueprints/boolean2dFns.js';

// ── Layer 2: query ──

export { EdgeFinder } from './query/edgeFinder.js';
export { FaceFinder } from './query/faceFinder.js';
export { CornerFinder, type Corner } from './query/cornerFinder.js';
export { getSingleFace, type SingleFace } from './query/helpers.js';
export { combineFinderFilters, type FilterFcn } from './query/index.js';

// ── Layer 2: measurement ──

export {
  measureVolume,
  measureArea,
  measureLength,
  measureDistanceBetween,
  measureShapeSurfaceProperties,
  measureShapeLinearProperties,
  measureShapeVolumeProperties,
  DistanceTool,
  VolumePhysicalProperties,
  SurfacePhysicalProperties,
  LinearPhysicalProperties,
  DistanceQuery,
} from './measurement/measureShape.js';

// ── Layer 2: io ──

export { importSTEP, importSTL } from './io/importers.js';
export { exportOBJ } from './io/objExportFns.js';

// ── Layer 3: sketching ──

import Sketcher from './sketching/Sketcher.js';
import FaceSketcher, { BaseSketcher2d, BlueprintSketcher } from './sketching/Sketcher2d.js';
import { type GenericSketcher, type SplineConfig } from './sketching/sketcherlib.js';

export { Sketcher, FaceSketcher, BaseSketcher2d, BlueprintSketcher };
export type { GenericSketcher, SplineConfig };
export type { SketchInterface } from './sketching/sketchLib.js';

export { default as Sketch } from './sketching/Sketch.js';
export { default as CompoundSketch } from './sketching/CompoundSketch.js';
export { default as Sketches } from './sketching/Sketches.js';

export {
  sketchCircle,
  sketchRectangle,
  sketchRoundedRectangle,
  sketchPolysides,
  sketchEllipse,
  polysideInnerRadius,
  sketchFaceOffset,
  sketchParametricFunction,
  sketchHelix,
} from './sketching/cannedSketches.js';

export { makeBaseBox } from './sketching/shortcuts.js';

export {
  Drawing,
  DrawingPen,
  draw,
  drawRoundedRectangle,
  drawRectangle,
  drawSingleCircle,
  drawSingleEllipse,
  drawCircle,
  drawEllipse,
  drawPolysides,
  drawText,
  drawPointsInterpolation,
  drawParametricFunction,
  drawProjection,
  drawFaceOutline,
  deserializeDrawing,
} from './sketching/draw.js';

export type { DrawingInterface, SketchData } from './2d/blueprints/lib.js';

// ── Layer 3: sketching (functional) ──

export {
  sketchExtrude,
  sketchRevolve,
  sketchLoft,
  sketchSweep,
  sketchFace as fnSketchFace,
  sketchWires as fnSketchWires,
  compoundSketchExtrude,
  compoundSketchRevolve,
  compoundSketchFace,
  compoundSketchLoft,
} from './sketching/sketchFns.js';

export {
  drawingToSketchOnPlane,
  drawingFuse,
  drawingCut,
  drawingIntersect,
  drawingFillet,
  drawingChamfer,
  translateDrawing,
  rotateDrawing,
  scaleDrawing,
  mirrorDrawing,
} from './sketching/drawFns.js';

// ── Layer 3: text ──

export { loadFont, getFont, textBlueprints, sketchText } from './text/textBlueprints.js';

// ── Layer 3: projection ──

export {
  ProjectionCamera,
  lookFromPlane,
  isProjectionPlane,
  type ProjectionPlane,
  type CubeFace,
} from './projection/ProjectionCamera.js';

export { makeProjectedEdges } from './projection/makeProjectedEdges.js';

// ═══════════════════════════════════════════════════════════════════════════
// NEW FUNCTIONAL API — Vec3 tuples, branded types, standalone functions
// ═══════════════════════════════════════════════════════════════════════════

// ── Core types ──

export type { Vec3, Vec2, PointInput, Direction as DirectionInput } from './core/types.js';

export { toVec3, toVec2, resolveDirection } from './core/types.js';

export {
  vecAdd,
  vecSub,
  vecScale,
  vecNegate,
  vecDot,
  vecCross,
  vecLength,
  vecLengthSq,
  vecDistance,
  vecNormalize,
  vecEquals,
  vecIsZero,
  vecAngle,
  vecProjectToPlane,
  vecRotate,
  vecRepr,
} from './core/vecOps.js';

export {
  toOcVec,
  fromOcVec,
  fromOcPnt,
  fromOcDir,
  withOcVec,
  withOcPnt,
  withOcDir,
} from './core/occtBoundary.js';

// ── Branded shape types ──

export type {
  ShapeKind,
  Vertex as FnVertex,
  Edge as FnEdge,
  Wire as FnWire,
  Face as FnFace,
  Shell as FnShell,
  Solid as FnSolid,
  CompSolid as FnCompSolid,
  Compound as FnCompound,
  AnyShape as FnAnyShape,
  Shape1D as FnShape1D,
  Shape3D as FnShape3D,
} from './core/shapeTypes.js';

export {
  castShape,
  getShapeKind,
  createVertex as fnCreateVertex,
  createEdge as fnCreateEdge,
  createWire as fnCreateWire,
  createFace as fnCreateFace,
  createShell as fnCreateShell,
  createSolid as fnCreateSolid,
  createCompound as fnCreateCompound,
  isVertex as fnIsVertex,
  isEdge as fnIsEdge,
  isWire as fnIsWire,
  isFace as fnIsFace,
  isShell as fnIsShell,
  isSolid as fnIsSolid,
  isCompound as fnIsCompound,
  isShape3D as fnIsShape3D,
  isShape1D as fnIsShape1D,
} from './core/shapeTypes.js';

// ── Disposal / resource management ──

export type { ShapeHandle, OcHandle } from './core/disposal.js';

export { createHandle, createOcHandle, DisposalScope, withScope } from './core/disposal.js';

// ── Plane types ──

export type { Plane as FnPlane, PlaneName as FnPlaneName, PlaneInput } from './core/planeTypes.js';

export {
  createPlane,
  createNamedPlane as fnCreateNamedPlane,
  resolvePlane,
  translatePlane,
  pivotPlane,
} from './core/planeOps.js';

// ── Shape functions (topology) ──

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
} from './topology/shapeFns.js';

export { chamferDistAngleShape } from './topology/chamferAngleFns.js';

export {
  getCurveType as fnGetCurveType,
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
} from './topology/curveFns.js';

export {
  getSurfaceType,
  faceGeomType,
  faceOrientation,
  flipFaceOrientation,
  uvBounds,
  pointOnSurface as fnPointOnSurface,
  uvCoordinates as fnUvCoordinates,
  normalAt as fnNormalAt,
  faceCenter,
  outerWire as fnOuterWire,
  innerWires as fnInnerWires,
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- re-export for backward compat
  triangulateFace,
  type UVBounds,
} from './topology/faceFns.js';

// ── Meshing and export ──

export {
  meshShape,
  meshShapeEdges,
  exportSTEP as fnExportSTEP,
  exportSTL as fnExportSTL,
  type ShapeMesh as FnShapeMesh,
  type EdgeMesh,
  type MeshOptions,
} from './topology/meshFns.js';

export { clearMeshCache } from './topology/meshCache.js';
// eslint-disable-next-line @typescript-eslint/no-deprecated -- Public API, kept for backward compatibility
export { setMeshCacheSize } from './topology/meshCache.js';

// ── Three.js integration ──

export {
  toBufferGeometryData,
  toLineGeometryData,
  type BufferGeometryData,
  type LineGeometryData,
} from './topology/threeHelpers.js';

// ── Boolean operations (functional) ──

export {
  fuseShapes,
  cutShape,
  intersectShapes,
  sectionShape,
  fuseAll as fnFuseAll,
  cutAll as fnCutAll,
  buildCompound as fnBuildCompound,
  type BooleanOptions,
} from './topology/booleanFns.js';

// ── Modifier operations (functional) ──

export { thickenSurface } from './topology/modifierFns.js';

// ── Operations (functional) ──

export {
  extrudeFace,
  revolveFace,
  sweep,
  supportExtrude as fnSupportExtrude,
  complexExtrude as fnComplexExtrude,
  twistExtrude as fnTwistExtrude,
  type SweepConfig,
  type ExtrusionProfile as FnExtrusionProfile,
} from './operations/extrudeFns.js';

export { loftWires, type LoftConfig as FnLoftConfig } from './operations/loftFns.js';

export {
  exportAssemblySTEP,
  type ShapeConfig as FnShapeConfig,
  type SupportedUnit as FnSupportedUnit,
} from './operations/exporterFns.js';

export { linearPattern, circularPattern } from './operations/patternFns.js';

// ── Measurement (functional) ──

export {
  measureVolume as fnMeasureVolume,
  measureArea as fnMeasureArea,
  measureLength as fnMeasureLength,
  measureDistance,
  createDistanceQuery,
  measureVolumeProps,
  measureSurfaceProps,
  measureLinearProps,
  type PhysicalProps,
} from './measurement/measureFns.js';

// ── Import (functional) ──

export { importSTEP as fnImportSTEP, importSTL as fnImportSTL } from './io/importFns.js';

// ── Query (functional, immutable finders) ──

export {
  edgeFinder,
  faceFinder,
  wireFinder,
  type EdgeFinderFn,
  type FaceFinderFn,
  type WireFinderFn,
  type ShapeFinder,
} from './query/finderFns.js';

// ── Projection (functional) ──

export {
  createCamera,
  cameraLookAt,
  cameraFromPlane,
  cameraToProjectionCamera,
  projectEdges,
  type Camera,
} from './projection/cameraFns.js';
