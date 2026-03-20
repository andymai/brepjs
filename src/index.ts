/**
 * brepjs — Public API
 */

// ── Layer 0: kernel / utils ──

export {
  init,
  initFromOC,
  prewarm,
  getKernel,
  registerKernel,
  withKernel,
  BrepkitAdapter,
} from './kernel/index.js';
export type {
  KernelAdapter,
  BrepkitHandle,
  SurfaceType,
  ShapeOrientation,
  ShapeType,
  // Kernel sub-interfaces (ADR-0007)
  KernelBooleanOps,
  KernelBuilderOps,
  KernelCore,
  KernelCurveOps,
  KernelEvolutionOps,
  KernelIOOps,
  KernelMeasureOps,
  KernelMeshOps,
  KernelModifierOps,
  KernelPrimitiveOps,
  KernelRepairOps,
  KernelSurfaceOps,
  KernelSweepOps,
  KernelTopologyOps,
  KernelTransformOps,
} from './kernel/index.js';
export { supportsProjection, supportsConstraintSketch } from './kernel/index.js';
export type { ProjectionCapability, ConstraintSketchCapability } from './kernel/index.js';

// ── Result type ──

export {
  ok,
  err,
  OK,
  isOk,
  isErr,
  map,
  mapBoth,
  mapErr,
  andThen,
  flatMap,
  flatten,
  unwrap,
  unwrapOr,
  unwrapOrElse,
  unwrapErr,
  match,
  collect,
  or,
  orElse,
  zip as zipResults,
  all,
  tap,
  tapErr,
  fromNullable,
  tryCatch,
  tryCatchAsync,
  pipeline,
  type Result,
  type Ok,
  type Err,
  type Unit,
  type ResultPipeline,
} from './core/result.js';

export { kernelCall, kernelCallRaw, kernelCallScoped } from './core/kernelCall.js';

export {
  type BrepError,
  type BrepErrorKind,
  BrepErrorCode,
  kernelError,
  validationError,
  typeCastError,
  sketcherStateError,
  moduleInitError,
  computationError,
  ioError,
  queryError,
  unsupportedError,
  bug,
  BrepBugError,
} from './core/errors.js';

// ── Layer 1: core ──

export { DEG2RAD, RAD2DEG, HASH_CODE_MAX } from './core/constants.js';

export { type Deletable } from './core/disposal.js';

export { makePlane } from './core/planeOps.js';

export type { CurveType } from './core/typeDiscriminants.js';

// ── Layer 2: topology (via barrel) ──

export {
  // cast.ts
  cast,
  downcast,
  shapeType,
  iterTopo,
  asTopo,
  isCompSolid,
  deserializeShape,
  type TopoEntity,
  type GenericTopo,
  // shapeBooleans.ts
  applyGlue,
  // shapeModifiers.ts
  isNumber,
  isChamferRadius,
  isFilletRadius,
  type ChamferRadius,
  type RadiusOptions,
} from './topology/index.js';

// ── Layer 2: operations ──

export { type AssemblyExporter, createAssembly } from './operations/exporters.js';

// ── Layer 2: 2d ──

export { type Point2D, type BoundingBox2d, type Curve2D } from './2d/lib/index.js';

export type { default as Blueprint } from './2d/blueprints/blueprint.js';
export type { default as CompoundBlueprint } from './2d/blueprints/compoundBlueprint.js';
export type { default as Blueprints } from './2d/blueprints/blueprints.js';
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
  createCompoundBlueprint,
  // Utilities - clean 2D aliases
  getBounds2D,
  getOrientation2D,
  isInside2D,
  toSVGPathD,
  // Transforms - clean 2D aliases
  translate2D,
  rotate2D,
  scale2D,
  mirror2D,
  stretch2D,
  // Sketching - clean 2D aliases
  sketchOnPlane2D,
  sketchOnFace2D,
} from './2d/blueprints/blueprintFns.js';

// ── Layer 2: query ──

export { getSingleFace, type SingleFace } from './query/helpers.js';

// ── Layer 2: io ──

export { exportOBJ } from './io/objExportFns.js';

export {
  exportGltf,
  exportGlb,
  type GltfMaterial,
  type GltfExportOptions,
} from './io/gltfExportFns.js';
export {
  exportDXF,
  blueprintToDXF,
  type DXFEntity,
  type DXFExportOptions,
} from './io/dxfExportFns.js';

export {
  exportThreeMF,
  type ThreeMFExportOptions,
  type ThreeMFMaterial,
} from './io/threemfExportFns.js';

export { importSVGPathD, importSVG, type SVGImportOptions } from './io/svgImportFns.js';

// ── Layer 3: sketching ──

export type { default as Sketcher } from './sketching/sketcher.js';
export type {
  default as FaceSketcher,
  BaseSketcher2d,
  BlueprintSketcher,
} from './sketching/sketcher2d.js';
export type { GenericSketcher, SplineOptions } from './sketching/sketcherlib.js';
export type { SketchInterface } from './sketching/sketchLib.js';

export { default as Sketch } from './sketching/sketch.js';
export { default as CompoundSketch } from './sketching/compoundSketch.js';
export { default as Sketches } from './sketching/sketches.js';

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

export type { Drawing, DrawingPen } from './sketching/draw.js';
export {
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
  deserializeDrawing,
} from './sketching/draw.js';

export { drawProjection, drawFaceOutline } from './sketching/draw3d.js';

export type { DrawingInterface, SketchData } from './2d/blueprints/lib.js';

// ── Layer 3: sketching (functional) ──

export {
  sketchExtrude,
  sketchRevolve,
  sketchLoft,
  sketchSweep,
  sketchFace,
  sketchWires,
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

export {
  loadFont,
  getFont,
  textBlueprints,
  sketchText,
  textMetrics,
  fontMetrics,
  type TextMetricsResult,
  type FontMetricsResult,
} from './text/textBlueprints.js';

// ── Layer 3: projection ──

export {
  isProjectionPlane,
  type ProjectionPlane,
  type CubeFace,
} from './projection/projectionPlanes.js';

export { makeProjectedEdges } from './projection/makeProjectedEdges.js';

// ═══════════════════════════════════════════════════════════════════════════
// FUNCTIONAL API — Vec3 tuples, branded types, standalone functions
// ═══════════════════════════════════════════════════════════════════════════

// ── Core types ──

export type {
  Vec3,
  Vec2,
  PointInput,
  Direction as DirectionInput,
  Matrix4x4,
  MatrixTransform,
  MatrixInput,
} from './core/types.js';

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
  toKernelVec,
  fromKernelVec,
  fromKernelPnt,
  fromKernelDir,
  withKernelVec,
  withKernelPnt,
  withKernelDir,
} from './core/kernelBoundary.js';

// ── Branded shape types ──

export type {
  Dimension,
  ShapeKind,
  Vertex,
  Edge,
  Wire,
  Face,
  Shell,
  Solid,
  CompSolid,
  Compound,
  AnyShape,
  Shape1D,
  Shape3D,
  UnknownDimShape,
  // Curve adaptor
  CurveLike,
  // Topological validity types (ADR-0005)
  ClosedWire,
  OrientedFace,
  ManifoldShell,
  ValidSolid,
} from './core/shapeTypes.js';

export {
  castShape,
  castShape3D,
  getShapeKind,
  createVertex,
  createEdge,
  createWire,
  createFace,
  createShell,
  createSolid,
  createCompound,
  isVertex,
  isEdge,
  isWire,
  isFace,
  isShell,
  isSolid,
  isCompound,
  isShape3D,
  isShape1D,
  is3D,
  is2D,
  as3D,
  as2D,
  // Topological validity guards & smart constructors (ADR-0005)
  isClosedWire,
  isOrientedFace,
  isManifoldShell,
  isValidSolid,
  closedWire,
  orientedFace,
  manifoldShell,
  validSolid,
} from './core/shapeTypes.js';

export type { DimensionError, RequireDimension, SameDimension } from './core/dimensionTypes.js';

// ── Disposal / resource management ──

export type { ShapeHandle, KernelHandle, DisposalStats } from './core/disposal.js';

export {
  createHandle,
  createKernelHandle,
  DisposalScope,
  withScope,
  withScopeResult,
  withScopeResultAsync,
  isLive,
  getDisposalStats,
  resetDisposalStats,
} from './core/disposal.js';

// ── Plane types ──

export type { Plane, PlaneName, PlaneInput } from './core/planeTypes.js';

export {
  createPlane,
  createNamedPlane,
  resolvePlane,
  translatePlane,
  pivotPlane,
} from './core/planeOps.js';

// ── Shape functions (topology) ──

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
  setShapeOrigin,
  getFaceOrigins,
  resize,
  type Bounds3D,
  type ShapeDescription,
} from './topology/shapeFns.js';

export {
  tagFaces,
  findFacesByTag,
  getFaceTags,
  setTagMetadata,
  getTagMetadata,
} from './topology/metadata/faceTagFns.js';

export {
  colorFaces,
  colorShape,
  getFaceColor,
  getShapeColor,
} from './topology/metadata/colorFns.js';
export type { Color, ColorInput } from './topology/metadata/colorFns.js';

export { chamferDistAngle as chamferDistAngleShape } from './topology/chamferAngleFns.js';

export {
  facesOfEdge,
  edgesOfFace,
  wiresOfFace,
  verticesOfEdge,
  adjacentFaces,
  sharedEdges,
} from './topology/adjacencyFns.js';

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
  removeHolesFromFace,
  projectPointOnFace,
  type UVBounds,
  type PointProjectionResult,
} from './topology/faceFns.js';

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

// ── Boolean operations (functional) ──

export { fuseAll, cutAll, type BooleanOptions } from './topology/booleanFns.js';

export {
  surfaceFromGrid,
  surfaceFromImage,
  type SurfaceFromGridOptions,
  type SurfaceFromImageOptions,
} from './topology/surfaceFns.js';

export { hull, type HullOptions } from './topology/hullFns.js';

export { convexHull } from './operations/convexHullFns.js';

export { minkowski, type MinkowskiOptions } from './topology/minkowskiFns.js';

export { polyhedron, type PolyhedronOptions } from './topology/polyhedronFns.js';

// (modifiers available via public API: fillet, chamfer, shell, offset, thicken)

// ── Healing (functional) ──

export {
  healSolid,
  healFace,
  healWire,
  autoHeal,
  type HealingReport,
  type AutoHealOptions,
  type HealingStepDiagnostic,
} from './topology/healingFns.js';

// ── Operations (functional) ──

export {
  sweep,
  supportExtrude,
  complexExtrude,
  twistExtrude,
  type SweepOptions,
  type ExtrusionProfile,
} from './operations/extrudeFns.js';

export {
  multiSectionSweep,
  type SweepSectionConfig,
  type MultiSweepOptions,
} from './operations/multiSweepFns.js';

export { guidedSweep, type GuidedSweepOptions } from './operations/guidedSweepFns.js';

export { roof, type RoofOptions } from './operations/roofFns.js';

export {
  computeStraightSkeleton,
  type SkPoint2D,
  type SkeletonNode,
  type SkeletonFace,
  type StraightSkeleton,
} from './operations/straightSkeleton.js';

export {
  exportAssemblySTEP,
  type ShapeOptions,
  type SupportedUnit,
} from './operations/exporterFns.js';

export { linearPattern, circularPattern } from './operations/patternFns.js';

export {
  createAssemblyNode,
  addChild,
  removeChild,
  updateNode,
  findNode,
  walkAssembly,
  countNodes,
  collectShapes,
  type AssemblyNode,
  type AssemblyNodeOptions,
} from './operations/assemblyFns.js';

export {
  addMate,
  solveAssembly,
  type MateConstraint,
  type MateEntity,
  type AssemblySolveResult,
} from './operations/mateFns.js';

export {
  createHistory,
  addStep,
  undoLast,
  findStep,
  getShape as getHistoryShape,
  stepCount,
  stepsFrom,
  registerShape,
  createRegistry,
  registerOperation,
  replayHistory,
  replayFrom,
  modifyStep,
  serializeHistory,
  deserializeHistory,
  type OperationStep,
  type ModelHistory,
  type SerializedHistory,
  type OperationFn,
  type OperationRegistry as HistoryOperationRegistry,
} from './operations/historyFns.js';

// ── Measurement (functional) ──

export {
  measureVolume,
  measureArea,
  measureLength,
  measureDistance,
  measureDistanceProps,
  createDistanceQuery,
  measureVolumeProps,
  measureSurfaceProps,
  measureLinearProps,
  type PhysicalProps,
  type VolumeProps,
  type SurfaceProps,
  type LinearProps,
  type DistanceProps,
  measureCurvatureAt,
  measureCurvatureAtMid,
  type CurvatureResult,
} from './measurement/measureFns.js';

export {
  checkInterference,
  checkAllInterferences,
  type InterferenceResult,
  type InterferencePair,
} from './measurement/interferenceFns.js';

// ── Import (functional) ──

export { importSTEP, importSTL, importIGES } from './io/importFns.js';
export { importDXF } from './io/dxfImportFns.js';
export { importOBJ } from './io/objImportFns.js';
export { importThreeMF } from './io/threemfImportFns.js';
export { importGLB } from './io/gltfImportFns.js';
export type { DXFImportOptions } from './io/dxfImportFns.js';

// ── Query (functional, immutable finders) ──

export {
  edgeFinder,
  faceFinder,
  wireFinder,
  vertexFinder,
  cornerFinder,
  type EdgeFinderFn,
  type FaceFinderFn,
  type WireFinderFn,
  type VertexFinderFn,
  type CornerFinderFn,
  type CornerFilter,
  type ShapeFinder,
} from './query/finderFns.js';

// ── Projection (functional) ──

export {
  createCamera,
  cameraLookAt,
  cameraFromPlane,
  projectEdges,
  type Camera,
} from './projection/cameraFns.js';

// ── Worker protocol ──

export {
  type WorkerRequest,
  type InitRequest,
  type OperationRequest,
  type DisposeRequest,
  type WorkerResponse,
  type SuccessResponse,
  type ErrorResponse,
  isInitRequest,
  isOperationRequest,
  isDisposeRequest,
  isSuccessResponse,
  isErrorResponse,
  type PendingTask,
  type TaskQueue,
  createTaskQueue,
  enqueueTask,
  dequeueTask,
  pendingCount,
  isQueueEmpty,
  rejectAll,
  createWorkerClient,
  createOperationRegistry,
  registerHandler,
  createWorkerHandler,
  type WorkerClient,
  type WorkerClientOptions,
  type WorkerResult,
  type OperationHandler,
  type OperationRegistry,
} from './worker/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// CLEAN API — Short names, Shapeable<T>, options objects, shape() wrapper
// ═══════════════════════════════════════════════════════════════════════════

// ── API types ──

export type {
  Shapeable,
  WrappedMarker,
  FinderFn,
  FilletRadius,
  ChamferDistance,
  DraftAngle,
  DraftOptions,
  DrawingLike,
  DrillOptions,
  PocketOptions,
  BossOptions,
  MirrorJoinOptions,
  RectangularPatternOptions,
} from './topology/apiTypes.js';

export { resolve, resolve3D } from './topology/apiTypes.js';

// ── Primitives (clean names) ──

export {
  // Solids
  box,
  cylinder,
  sphere,
  cone,
  torus,
  ellipsoid,
  // Curves
  line,
  circle,
  ellipse,
  helix,
  threePointArc,
  ellipseArc,
  bsplineApprox,
  bezier,
  tangentArc,
  // Topology constructors
  wire,
  wireLoop,
  face,
  filledFace,
  subFace,
  polygon,
  vertex,
  compound,
  solid,
  offsetFace,
  sewShells,
  addHoles,
  // Types
  type BoxOptions,
  type CylinderOptions,
  type SphereOptions,
  type ConeOptions,
  type TorusOptions,
  type EllipsoidOptions,
  type CircleOptions,
  type EllipseOptions,
  type HelixOptions,
  type EllipseArcOptions,
} from './topology/primitiveFns.js';

export { fill } from './topology/surfaceBuilders.js';

// ── Transforms, booleans, modifiers, utilities (clean names) ──

export {
  // Transforms
  translate,
  rotate,
  mirror,
  scale,
  clone,
  applyMatrix,
  composeTransforms,
  transformCopy,
  type TransformOp,
  type ComposedTransform,
  // Booleans
  fuse,
  cut,
  intersect,
  section,
  sectionToFace,
  split,
  slice,
  // Modifiers
  fillet,
  chamfer,
  shell,
  offset,
  thicken,
  draft,
  // Utilities
  heal,
  simplify,
  mesh,
  meshEdges,
  describe,
  toBREP,
  fromBREP,
  isValid,
  isEmpty,
  // Types
  type RotateOptions,
  type MirrorOptions,
  type ScaleOptions,
} from './topology/api.js';

// ── 3D operations (clean names) ──

export {
  extrude,
  revolve,
  loft,
  type RevolveOptions,
  type LoftOptions as CleanLoftOptions,
  type SweepOptions as CleanSweepOptions,
} from './operations/api.js';

// ── Compound operations ──

export {
  drill,
  pocket,
  boss,
  mirrorJoin,
  rectangularPattern,
} from './operations/compoundOpsFns.js';

// ── shape() wrapper ──

export {
  shape,
  BrepWrapperError,
  type Wrapped,
  type Wrapped3D,
  type WrappedCurve,
  type WrappedFace,
} from './topology/wrapperFns.js';
