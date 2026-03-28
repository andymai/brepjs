import type {
  BooleanOpType,
  CheckBooleanResult,
  KernelAdapter,
  KernelMeshResult,
  KernelEdgeMeshResult,
  DistanceResult,
  OperationResult,
  DiagnosticOperationResult,
  KernelInstance,
  KernelShape,
  KernelType,
  BooleanOptions,
  ShapeType,
  SurfaceType,
  ShapeOrientation,
  MeshOptions,
  StepAssemblyPart,
  NurbsCurveData,
  NurbsSurfaceData,
} from '@/kernel/types.js';
import type { Kernel2DCapability, Curve2dHandle, BBox2dHandle } from '@/kernel/kernel2dTypes.js';
import {
  exportSTEP as _exportSTEP,
  exportSTL as _exportSTL,
  importSTEP as _importSTEP,
  importSTL as _importSTL,
  exportIGES as _exportIGES,
  importIGES as _importIGES,
} from './ioOps.js';
import {
  volume as _volume,
  area as _area,
  length as _length,
  centerOfMass as _centerOfMass,
  linearCenterOfMass as _linearCenterOfMass,
  boundingBox as _boundingBox,
  distance as _distance,
  classifyPointOnFace as _classifyPointOnFace,
  measureBulk as _measureBulk,
} from './measureOps.js';
import type { BulkMeasurement } from '@/kernel/interfaces/measureOps.js';
import {
  transform as _transform,
  translate as _translate,
  rotate as _rotate,
  mirror as _mirror,
  scale as _scale,
  generalTransform as _generalTransform,
  simplify as _simplify,
  transformBatch as _transformBatch,
} from './transformOps.js';
import type { TransformEntry } from '@/kernel/interfaces/transformOps.js';
import {
  fuse as _fuse,
  cut as _cut,
  intersect as _intersect,
  section as _section,
  fuseAll as _fuseAll,
  cutAll as _cutAll,
  split as _split,
  checkBoolean as _checkBoolean,
} from './booleanOps.js';
import { executeBooleanPipeline } from './booleanPipelineOps.js';
import { mesh as _mesh, meshEdges as _meshEdges } from './meshOps.js';
import {
  iterShapes as _iterShapes,
  iterShapeList as _iterShapeList,
  shapeType as _shapeType,
  isSame as _isSame,
  isEqual as _isEqual,
  isValid as _isValid,
  sew as _sew,
} from './topologyOps.js';
import {
  makeVertex as _makeVertex,
  makeEdge as _makeEdge,
  makeWire as _makeWire,
  makeFace as _makeFace,
  makeBox as _makeBox,
  makeCylinder as _makeCylinder,
  makeSphere as _makeSphere,
  makeCone as _makeCone,
  makeTorus as _makeTorus,
  makeTriFace as _makeTriFace,
  makeWireFromMixed as _makeWireFromMixed,
} from './constructorOps.js';
import {
  extrude as _extrude,
  revolve as _revolve,
  loft as _loft,
  sweep as _sweep,
  simplePipe as _simplePipe,
  loftBatch as _loftBatch,
  extrudeBatch as _extrudeBatch,
} from './sweepOps.js';
import type { LoftBatchEntry, ExtrudeBatchEntry } from './sweepOps.js';
import {
  healSolid as _healSolid,
  healFace as _healFace,
  healWire as _healWire,
} from './healingOps.js';
import {
  fillet as _fillet,
  chamfer as _chamfer,
  chamferDistAngle as _chamferDistAngle,
  shell as _shell,
  thicken as _thicken,
  offset as _offset,
  offsetWire2D as _offsetWire2D,
  shellBatch as _shellBatch,
  filletBatch as _filletBatch,
} from './modifierOps.js';
import type { ShellBatchEntry, FilletBatchEntry } from './modifierOps.js';
import {
  interpolatePoints as _interpolatePoints,
  approximatePoints as _approximatePoints,
} from './curveOps.js';
import {
  hull as _hull,
  hullFromPoints as _hullFromPoints,
  buildSolidFromFaces as _buildSolidFromFaces,
} from './hullOps.js';
import {
  vertexPosition as _vertexPosition,
  surfaceType as _surfaceType,
  uvBounds as _uvBounds,
  outerWire as _outerWire,
  surfaceNormal as _surfaceNormal,
  pointOnSurface as _pointOnSurface,
  uvFromPoint as _uvFromPoint,
  projectPointOnFace as _projectPointOnFace,
  curveTangent as _curveTangent,
  curveParameters as _curveParameters,
  shapeOrientation as _shapeOrientation,
  downcast as _downcast,
  hashCode as _hashCode,
  isNull as _isNull,
  hasTriangulation as _hasTriangulation,
  meshShape as _meshShape,
  getBezierPenultimatePole as _getBezierPenultimatePole,
  createCurveAdaptor as _createCurveAdaptor,
  reverseShape as _reverseShape,
  curvePointAtParam as _curvePointAtParam,
  curveIsClosed as _curveIsClosed,
  curveIsPeriodic as _curveIsPeriodic,
  curvePeriod as _curvePeriod,
  curveType as _curveType,
  getSurfaceCylinderData as _getSurfaceCylinderData,
  reverseSurfaceU as _reverseSurfaceU,
} from './geometryQueryOps.js';
import {
  getNurbsCurveData as _getNurbsCurveData,
  getNurbsSurfaceData as _getNurbsSurfaceData,
} from './nurbsQueryOps.js';
import {
  wrapString as _wrapString,
  wrapColorRGBA as _wrapColorRGBA,
  configureStepUnits as _configureStepUnits,
  configureStepWriter as _configureStepWriter,
} from './exportOps.js';
import {
  makeLineEdge as _makeLineEdge,
  makeCircleEdge as _makeCircleEdge,
  makeCircleArc as _makeCircleArc,
  makeArcEdge as _makeArcEdge,
  makeEllipseEdge as _makeEllipseEdge,
  makeEllipseArc as _makeEllipseArc,
  makeBezierEdge as _makeBezierEdge,
  makeTangentArc as _makeTangentArc,
  makeHelixWire as _makeHelixWire,
  makeCompound as _makeCompound,
  makeBoxFromCorners as _makeBoxFromCorners,
  solidFromShell as _solidFromShell,
  makeEllipsoidSolid as _makeEllipsoidSolid,
  toBREP as _toBREP,
  fromBREP as _fromBREP,
  exportSTEPAssembly as _exportSTEPAssembly,
  dispose as _dispose,
  makeRectangle as _makeRectangle,
  createPoint3d as _createPoint3d,
  createDirection3d as _createDirection3d,
  createVector3d as _createVector3d,
  createAxis1 as _createAxis1,
  createAxis2 as _createAxis2,
  createAxis3 as _createAxis3,
} from './extendedConstructorOps.js';
import {
  wrapCurve2dHandle as _wrapCurve2dHandle,
  createCurve2dAdaptor as _createCurve2dAdaptor,
  createPoint2d as _createPoint2d,
  createDirection2d as _createDirection2d,
  createVector2d as _createVector2d,
  createAxis2d as _createAxis2d,
  makeLine2d as _makeLine2d,
  makeCircle2d as _makeCircle2d,
  makeArc2dThreePoints as _makeArc2dThreePoints,
  makeArc2dTangent as _makeArc2dTangent,
  makeEllipse2d as _makeEllipse2d,
  makeEllipseArc2d as _makeEllipseArc2d,
  makeBezier2d as _makeBezier2d,
  makeBSpline2d as _makeBSpline2d,
  evaluateCurve2d as _evaluateCurve2d,
  evaluateCurve2dD1 as _evaluateCurve2dD1,
  getCurve2dBounds as _getCurve2dBounds,
  getCurve2dType as _getCurve2dType,
  trimCurve2d as _trimCurve2d,
  reverseCurve2d as _reverseCurve2d,
  copyCurve2d as _copyCurve2d,
  offsetCurve2d as _offsetCurve2d,
  translateCurve2d as _translateCurve2d,
  rotateCurve2d as _rotateCurve2d,
  scaleCurve2d as _scaleCurve2d,
  mirrorCurve2dAtPoint as _mirrorCurve2dAtPoint,
  mirrorCurve2dAcrossAxis as _mirrorCurve2dAcrossAxis,
  affinityTransform2d as _affinityTransform2d,
  createIdentityGTrsf2d as _createIdentityGTrsf2d,
  createAffinityGTrsf2d as _createAffinityGTrsf2d,
  createTranslationGTrsf2d as _createTranslationGTrsf2d,
  createMirrorGTrsf2d as _createMirrorGTrsf2d,
  createRotationGTrsf2d as _createRotationGTrsf2d,
  createScaleGTrsf2d as _createScaleGTrsf2d,
  setGTrsf2dTranslationPart as _setGTrsf2dTranslationPart,
  multiplyGTrsf2d as _multiplyGTrsf2d,
  transformCurve2dGeneral as _transformCurve2dGeneral,
  intersectCurves2d as _intersectCurves2d,
  projectPointOnCurve2d as _projectPointOnCurve2d,
  distanceBetweenCurves2d as _distanceBetweenCurves2d,
  approximateCurve2dAsBSpline as _approximateCurve2dAsBSpline,
  decomposeBSpline2dToBeziers as _decomposeBSpline2dToBeziers,
  createBoundingBox2d as _createBoundingBox2d,
  addCurveToBBox2d as _addCurveToBBox2d,
  getBBox2dBounds as _getBBox2dBounds,
  mergeBBox2d as _mergeBBox2d,
  isBBox2dOut as _isBBox2dOut,
  isBBox2dOutPoint as _isBBox2dOutPoint,
  getCurve2dCircleData as _getCurve2dCircleData,
  getCurve2dEllipseData as _getCurve2dEllipseData,
  getCurve2dBezierPoles as _getCurve2dBezierPoles,
  getCurve2dBezierDegree as _getCurve2dBezierDegree,
  getCurve2dBSplineData as _getCurve2dBSplineData,
  serializeCurve2d as _serializeCurve2d,
  deserializeCurve2d as _deserializeCurve2d,
  splitCurve2d as _splitCurve2d,
  liftCurve2dToPlane as _liftCurve2dToPlane,
  buildEdgeOnSurface as _buildEdgeOnSurface,
  extractSurfaceFromFace as _extractSurfaceFromFace,
  extractCurve2dFromEdge as _extractCurve2dFromEdge,
  buildCurves3d as _buildCurves3d,
  fixWireOnFace as _fixWireOnFace,
  fillSurface as _fillSurface,
} from './kernel2dOps.js';
import {
  composeTransform as _composeTransform,
  applyComposedTransformWithHistory as _applyComposedTransformWithHistory,
  sweepPipeShell as _sweepPipeShell,
  loftAdvanced as _loftAdvanced,
  buildExtrusionLaw as _buildExtrusionLaw,
  revolveVec as _revolveVec,
  positionOnCurve as _positionOnCurve,
  linearPattern as _linearPattern,
  circularPattern as _circularPattern,
  makeNonPlanarFace as _makeNonPlanarFace,
  addHolesInFace as _addHolesInFace,
  removeHolesFromFace as _removeHolesFromFace,
  makeFaceOnSurface as _makeFaceOnSurface,
  bsplineSurface as _bsplineSurface,
  triangulatedSurface as _triangulatedSurface,
  sewAndSolidify as _sewAndSolidify,
  fixShape as _fixShape,
  fixSelfIntersection as _fixSelfIntersection,
  surfaceCurvature as _surfaceCurvature,
  surfaceCenterOfMass as _surfaceCenterOfMass,
  createDistanceQuery as _createDistanceQuery,
  projectEdges as _projectEdges,
  draftPrism as _draftPrism,
  exportSTEPConfigured as _exportSTEPConfigured,
  generalTransformNonOrthogonal as _generalTransformNonOrthogonal,
  createXCAFDocument as _createXCAFDocument,
  writeXCAFToSTEP as _writeXCAFToSTEP,
} from './advancedOps.js';
import {
  translateWithHistory as _translateWithHistory,
  rotateWithHistory as _rotateWithHistory,
  mirrorWithHistory as _mirrorWithHistory,
  scaleWithHistory as _scaleWithHistory,
  generalTransformWithHistory as _generalTransformWithHistory,
  fuseWithHistory as _fuseWithHistory,
  cutWithHistory as _cutWithHistory,
  intersectWithHistory as _intersectWithHistory,
  filletWithHistory as _filletWithHistory,
  chamferWithHistory as _chamferWithHistory,
  shellWithHistory as _shellWithHistory,
  thickenWithHistory as _thickenWithHistory,
  offsetWithHistory as _offsetWithHistory,
  draftWithHistory as _draftWithHistory,
} from './historyOps.js';

/**
 * Default implementation of KernelAdapter.
 */
export class DefaultAdapter implements KernelAdapter, Kernel2DCapability {
  readonly oc: KernelInstance;
  readonly kernelId = 'occt';

  constructor(oc: KernelInstance) {
    this.oc = oc;
  }

  // --- Boolean operations (delegates to booleanOps.ts) ---

  fuse(shape: KernelShape, tool: KernelShape, options: BooleanOptions = {}): KernelShape {
    return _fuse(this.oc, shape, tool, options);
  }

  cut(shape: KernelShape, tool: KernelShape, options: BooleanOptions = {}): KernelShape {
    return _cut(this.oc, shape, tool, options);
  }

  intersect(shape: KernelShape, tool: KernelShape, options: BooleanOptions = {}): KernelShape {
    return _intersect(this.oc, shape, tool, options);
  }

  section(shape: KernelShape, plane: KernelShape, approximation = true): KernelShape {
    return _section(this.oc, shape, plane, approximation);
  }

  fuseAll(shapes: KernelShape[], options: BooleanOptions = {}): KernelShape {
    return _fuseAll(this.oc, shapes, options);
  }

  cutAll(shape: KernelShape, tools: KernelShape[], options: BooleanOptions = {}): KernelShape {
    return _cutAll(this.oc, shape, tools, options);
  }

  checkBoolean(shape: KernelShape, tool: KernelShape, op: BooleanOpType): CheckBooleanResult {
    return _checkBoolean(this.oc, shape, tool, op, (s) => this.isValid(s));
  }

  // --- Convex hull ---

  hull(shapes: KernelShape[], tolerance: number): KernelShape {
    return _hull(this.oc, shapes, tolerance);
  }

  hullFromPoints(
    points: Array<{ x: number; y: number; z: number }>,
    tolerance: number
  ): KernelShape {
    return _hullFromPoints(
      this.oc,
      points.map((p) => ({ x: p.x, y: p.y, z: p.z })),
      tolerance
    );
  }

  buildSolidFromFaces(
    points: Array<{ x: number; y: number; z: number }>,
    faces: Array<readonly [number, number, number]>,
    tolerance: number
  ): KernelShape {
    return _buildSolidFromFaces(
      this.oc,
      points.map((p) => ({ x: p.x, y: p.y, z: p.z })),
      faces,
      tolerance
    );
  }

  // --- Shape construction (delegates to constructorOps.ts) ---

  makeVertex(x: number, y: number, z: number): KernelShape {
    return _makeVertex(this.oc, x, y, z);
  }

  makeEdge(curve: KernelType, start?: number, end?: number): KernelShape {
    return _makeEdge(this.oc, curve, start, end);
  }

  makeWire(edges: KernelShape[]): KernelShape {
    return _makeWire(this.oc, edges);
  }

  makeWireFromMixed(items: KernelShape[]): KernelShape {
    return _makeWireFromMixed(this.oc, items);
  }

  makeFace(wire: KernelShape, planar = true): KernelShape {
    return _makeFace(this.oc, wire, planar);
  }

  makeBox(width: number, height: number, depth: number): KernelShape {
    return _makeBox(this.oc, width, height, depth);
  }

  makeCylinder(
    radius: number,
    height: number,
    center: [number, number, number] = [0, 0, 0],
    direction: [number, number, number] = [0, 0, 1]
  ): KernelShape {
    return _makeCylinder(this.oc, radius, height, center, direction);
  }

  makeSphere(radius: number, center: [number, number, number] = [0, 0, 0]): KernelShape {
    return _makeSphere(this.oc, radius, center);
  }

  makeCone(
    radius1: number,
    radius2: number,
    height: number,
    center: [number, number, number] = [0, 0, 0],
    direction: [number, number, number] = [0, 0, 1]
  ): KernelShape {
    return _makeCone(this.oc, radius1, radius2, height, center, direction);
  }

  makeTorus(
    majorRadius: number,
    minorRadius: number,
    center: [number, number, number] = [0, 0, 0],
    direction: [number, number, number] = [0, 0, 1]
  ): KernelShape {
    return _makeTorus(this.oc, majorRadius, minorRadius, center, direction);
  }

  makeEllipsoid(aLength: number, bLength: number, cLength: number): KernelShape {
    return _makeEllipsoidSolid(this.oc, aLength, bLength, cLength);
  }

  // --- Extended construction (delegates to extendedConstructorOps.ts) ---

  makeLineEdge(p1: [number, number, number], p2: [number, number, number]): KernelShape {
    return _makeLineEdge(this.oc, p1, p2);
  }

  makeCircleEdge(
    center: [number, number, number],
    normal: [number, number, number],
    radius: number
  ): KernelShape {
    return _makeCircleEdge(this.oc, center, normal, radius);
  }

  makeCircleArc(
    center: [number, number, number],
    normal: [number, number, number],
    radius: number,
    startAngle: number,
    endAngle: number
  ): KernelShape {
    return _makeCircleArc(this.oc, center, normal, radius, startAngle, endAngle);
  }

  makeArcEdge(
    p1: [number, number, number],
    p2: [number, number, number],
    p3: [number, number, number]
  ): KernelShape {
    return _makeArcEdge(this.oc, p1, p2, p3);
  }

  makeEllipseEdge(
    center: [number, number, number],
    normal: [number, number, number],
    majorRadius: number,
    minorRadius: number,
    xDir?: [number, number, number]
  ): KernelShape {
    return _makeEllipseEdge(this.oc, center, normal, majorRadius, minorRadius, xDir);
  }

  makeEllipseArc(
    center: [number, number, number],
    normal: [number, number, number],
    majorRadius: number,
    minorRadius: number,
    startAngle: number,
    endAngle: number,
    xDir?: [number, number, number]
  ): KernelShape {
    return _makeEllipseArc(
      this.oc,
      center,
      normal,
      majorRadius,
      minorRadius,
      startAngle,
      endAngle,
      xDir
    );
  }

  makeBezierEdge(points: [number, number, number][]): KernelShape {
    return _makeBezierEdge(this.oc, points);
  }

  makeTangentArc(
    startPoint: [number, number, number],
    startTangent: [number, number, number],
    endPoint: [number, number, number]
  ): KernelShape {
    return _makeTangentArc(this.oc, startPoint, startTangent, endPoint);
  }

  makeHelixWire(
    pitch: number,
    height: number,
    radius: number,
    center: [number, number, number] = [0, 0, 0],
    direction: [number, number, number] = [0, 0, 1],
    leftHanded = false
  ): KernelShape {
    return _makeHelixWire(this.oc, pitch, height, radius, center, direction, leftHanded);
  }

  makeCompound(shapes: KernelShape[]): KernelShape {
    return _makeCompound(this.oc, shapes);
  }

  makeBoxFromCorners(p1: [number, number, number], p2: [number, number, number]): KernelShape {
    return _makeBoxFromCorners(this.oc, p1, p2);
  }

  makeRectangle(width: number, height: number): KernelShape {
    return _makeRectangle(this.oc, width, height);
  }

  solidFromShell(shell: KernelShape): KernelShape {
    return _solidFromShell(this.oc, shell);
  }

  // --- Extrusion / sweep / loft / revolution (delegates to sweepOps.ts) ---

  extrude(face: KernelShape, direction: [number, number, number], length: number): KernelShape {
    return _extrude(this.oc, face, direction, length);
  }

  revolve(shape: KernelShape, axis: KernelType, angle: number): KernelShape {
    return _revolve(this.oc, shape, axis, angle);
  }

  loft(
    wires: KernelShape[],
    ruled = false,
    startShape?: KernelShape,
    endShape?: KernelShape
  ): KernelShape {
    return _loft(this.oc, wires, ruled, startShape, endShape);
  }

  sweep(
    wire: KernelShape,
    spine: KernelShape,
    options: { transitionMode?: number } = {}
  ): KernelShape {
    return _sweep(this.oc, wire, spine, options);
  }

  simplePipe(profile: KernelShape, spine: KernelShape): KernelShape {
    return _simplePipe(this.oc, profile, spine);
  }

  loftBatch(entries: ReadonlyArray<LoftBatchEntry>): KernelShape[] {
    return _loftBatch(this.oc, entries);
  }

  extrudeBatch(entries: ReadonlyArray<ExtrudeBatchEntry>): KernelShape[] {
    return _extrudeBatch(this.oc, entries);
  }

  // --- Modification (delegates to modifierOps.ts) ---

  fillet(
    shape: KernelShape,
    edges: KernelShape[],
    radius: number | [number, number] | ((edge: KernelShape) => number | [number, number])
  ): KernelShape {
    return _fillet(this.oc, shape, edges, radius);
  }

  chamfer(
    shape: KernelShape,
    edges: KernelShape[],
    distance: number | [number, number] | ((edge: KernelShape) => number | [number, number])
  ): KernelShape {
    return _chamfer(this.oc, shape, edges, distance);
  }

  chamferDistAngle(
    shape: KernelShape,
    edges: KernelShape[],
    distance: number,
    angleDeg: number
  ): KernelShape {
    return _chamferDistAngle(this.oc, shape, edges, distance, angleDeg);
  }

  shell(
    shape: KernelShape,
    faces: KernelShape[],
    thickness: number,
    tolerance = 1e-3
  ): KernelShape {
    return _shell(this.oc, shape, faces, thickness, tolerance);
  }

  thicken(shape: KernelShape, thickness: number): KernelShape {
    return _thicken(this.oc, shape, thickness);
  }

  offset(shape: KernelShape, distance: number, tolerance = 1e-6): KernelShape {
    return _offset(this.oc, shape, distance, tolerance);
  }

  shellBatch(entries: ReadonlyArray<ShellBatchEntry>): KernelShape[] {
    return _shellBatch(this.oc, entries);
  }

  filletBatch(entries: ReadonlyArray<FilletBatchEntry>): KernelShape[] {
    return _filletBatch(this.oc, entries);
  }

  // --- Transforms (delegates to transformOps.ts) ---

  transform(shape: KernelShape, trsf: KernelType): KernelShape {
    return _transform(this.oc, shape, trsf);
  }

  translate(shape: KernelShape, x: number, y: number, z: number): KernelShape {
    return _translate(this.oc, shape, x, y, z);
  }

  rotate(
    shape: KernelShape,
    angle: number,
    axis: [number, number, number] = [0, 0, 1],
    center: [number, number, number] = [0, 0, 0]
  ): KernelShape {
    return _rotate(this.oc, shape, angle, axis, center);
  }

  mirror(
    shape: KernelShape,
    origin: [number, number, number],
    normal: [number, number, number]
  ): KernelShape {
    return _mirror(this.oc, shape, origin, normal);
  }

  scale(shape: KernelShape, center: [number, number, number], factor: number): KernelShape {
    return _scale(this.oc, shape, center, factor);
  }

  transformBatch(entries: TransformEntry[]): KernelShape[] {
    return _transformBatch(this.oc, entries);
  }

  generalTransform(
    shape: KernelShape,
    linear: readonly [number, number, number, number, number, number, number, number, number],
    translation: readonly [number, number, number],
    isOrthogonal: boolean
  ): KernelShape {
    return _generalTransform(this.oc, shape, linear, translation, isOrthogonal);
  }

  generalTransformNonOrthogonal(
    shape: KernelShape,
    linear: readonly [number, number, number, number, number, number, number, number, number],
    translation: readonly [number, number, number]
  ): KernelShape {
    return _generalTransformNonOrthogonal(this.oc, shape, linear, translation);
  }

  // --- Meshing (delegates to meshOps.ts) ---

  mesh(shape: KernelShape, options: MeshOptions): KernelMeshResult {
    return _mesh(this.oc, shape, options);
  }

  meshEdges(shape: KernelShape, tolerance: number, angularTolerance: number): KernelEdgeMeshResult {
    return _meshEdges(this.oc, shape, tolerance, angularTolerance);
  }

  // --- File I/O (delegates to ioOps.ts) ---

  exportSTEP(shapes: KernelShape[]): string {
    return _exportSTEP(this.oc, shapes);
  }

  exportSTL(shape: KernelShape, binary = false): string | ArrayBuffer {
    return _exportSTL(this.oc, shape, binary);
  }

  importSTEP(data: string | ArrayBuffer): KernelShape[] {
    return _importSTEP(this.oc, data);
  }

  importSTL(data: string | ArrayBuffer): KernelShape {
    return _importSTL(this.oc, data);
  }

  exportIGES(shapes: KernelShape[]): string {
    return _exportIGES(this.oc, shapes);
  }

  importIGES(data: string | ArrayBuffer): KernelShape[] {
    return _importIGES(this.oc, data);
  }

  exportSTEPAssembly(parts: StepAssemblyPart[], options: { unit?: string } = {}): string {
    return _exportSTEPAssembly(this.oc, parts, options);
  }

  // --- Measurement (delegates to measureOps.ts) ---

  volume(shape: KernelShape): number {
    return _volume(this.oc, shape);
  }

  area(shape: KernelShape): number {
    return _area(this.oc, shape);
  }

  length(shape: KernelShape): number {
    return _length(this.oc, shape);
  }

  centerOfMass(shape: KernelShape): [number, number, number] {
    return _centerOfMass(this.oc, shape);
  }

  linearCenterOfMass(shape: KernelShape): [number, number, number] {
    return _linearCenterOfMass(this.oc, shape);
  }

  boundingBox(shape: KernelShape): {
    min: [number, number, number];
    max: [number, number, number];
  } {
    return _boundingBox(this.oc, shape);
  }

  measureBulk(shape: KernelShape, includeLinear?: boolean): BulkMeasurement {
    return _measureBulk(this.oc, shape, includeLinear);
  }

  // --- Topology introspection ---

  iterShapes(shape: KernelShape, type: ShapeType): KernelShape[] {
    return _iterShapes(this.oc, shape, type);
  }

  iterShapeList(list: KernelShape, callback: (item: KernelShape) => void): void {
    _iterShapeList(this.oc, list, callback);
  }

  shapeType(shape: KernelShape): ShapeType {
    return _shapeType(this.oc, shape);
  }

  isSame(a: KernelShape, b: KernelShape): boolean {
    return _isSame(a, b);
  }

  isEqual(a: KernelShape, b: KernelShape): boolean {
    return _isEqual(a, b);
  }

  downcast(shape: KernelShape, type?: ShapeType): KernelShape {
    return _downcast(this.oc, shape, type);
  }

  hashCode(shape: KernelShape, upperBound: number): number {
    return _hashCode(this.oc, shape, upperBound);
  }

  isNull(shape: KernelShape): boolean {
    return _isNull(this.oc, shape);
  }

  shapeOrientation(shape: KernelShape): ShapeOrientation {
    return _shapeOrientation(this.oc, shape);
  }

  reverseShape(shape: KernelShape): KernelShape {
    return _reverseShape(this.oc, shape);
  }

  // --- Geometry queries: vertex ---

  vertexPosition(vertex: KernelShape): [number, number, number] {
    return _vertexPosition(this.oc, vertex);
  }

  // --- Geometry queries: face / surface ---

  surfaceType(face: KernelShape): SurfaceType {
    return _surfaceType(this.oc, face);
  }

  uvBounds(face: KernelShape): { uMin: number; uMax: number; vMin: number; vMax: number } {
    return _uvBounds(this.oc, face);
  }

  outerWire(face: KernelShape): KernelShape {
    return _outerWire(this.oc, face);
  }

  surfaceNormal(face: KernelShape, u: number, v: number): [number, number, number] {
    return _surfaceNormal(this.oc, face, u, v);
  }

  pointOnSurface(face: KernelShape, u: number, v: number): [number, number, number] {
    return _pointOnSurface(this.oc, face, u, v);
  }

  uvFromPoint(face: KernelShape, point: [number, number, number]): [number, number] | null {
    return _uvFromPoint(this.oc, face, point);
  }

  projectPointOnFace(face: KernelShape, point: [number, number, number]): [number, number, number] {
    return _projectPointOnFace(this.oc, face, point);
  }

  // --- Geometry queries: edge / curve ---

  curveTangent(
    shape: KernelShape,
    param: number
  ): { point: [number, number, number]; tangent: [number, number, number] } {
    return _curveTangent(this.oc, shape, param);
  }

  curveParameters(shape: KernelShape): [number, number] {
    return _curveParameters(this.oc, shape);
  }

  curvePointAtParam(shape: KernelShape, param: number): [number, number, number] {
    return _curvePointAtParam(this.oc, shape, param);
  }

  curveIsClosed(shape: KernelShape): boolean {
    return _curveIsClosed(this.oc, shape);
  }

  curveIsPeriodic(shape: KernelShape): boolean {
    return _curveIsPeriodic(this.oc, shape);
  }

  curvePeriod(shape: KernelShape): number {
    return _curvePeriod(this.oc, shape);
  }

  curveType(shape: KernelShape): string {
    return _curveType(this.oc, shape);
  }

  getSurfaceCylinderData(surface: KernelType): { radius: number; isDirect: boolean } | null {
    return _getSurfaceCylinderData(this.oc, surface);
  }

  reverseSurfaceU(surface: KernelType): KernelType {
    return _reverseSurfaceU(this.oc, surface);
  }

  // --- NURBS introspection ---

  getNurbsCurveData(edge: KernelShape): NurbsCurveData | null {
    return _getNurbsCurveData(this.oc, edge);
  }

  getNurbsSurfaceData(face: KernelShape): NurbsSurfaceData | null {
    return _getNurbsSurfaceData(this.oc, face);
  }

  // --- Simplification ---

  simplify(shape: KernelShape): KernelShape {
    return _simplify(this.oc, shape);
  }

  // --- Validation & repair ---

  isValid(shape: KernelShape): boolean {
    return _isValid(this.oc, shape);
  }

  sew(shapes: KernelShape[], tolerance = 1e-6): KernelShape {
    return _sew(this.oc, shapes, tolerance);
  }

  healSolid(shape: KernelShape): KernelShape | null {
    return _healSolid(this.oc, shape);
  }

  healFace(shape: KernelShape): KernelShape {
    return _healFace(this.oc, shape);
  }

  healWire(wire: KernelShape, face?: KernelShape): KernelShape {
    return _healWire(this.oc, wire, face);
  }

  // --- 2D offset ---

  offsetWire2D(
    wire: KernelShape,
    offset: number,
    joinType?: number | 'arc' | 'intersection' | 'tangent'
  ): KernelShape {
    return _offsetWire2D(this.oc, wire, offset, joinType);
  }

  // --- Distance ---

  distance(shape1: KernelShape, shape2: KernelShape): DistanceResult {
    return _distance(this.oc, shape1, shape2);
  }

  // --- Classification ---

  classifyPointOnFace(
    face: KernelShape,
    u: number,
    v: number,
    tolerance = 1e-6
  ): 'in' | 'on' | 'out' {
    return _classifyPointOnFace(this.oc, face, u, v, tolerance);
  }

  // --- Splitting ---

  split(shape: KernelShape, tools: KernelShape[]): KernelShape {
    return _split(this.oc, shape, tools);
  }

  // --- Curve construction ---

  interpolatePoints(
    points: [number, number, number][],
    options: { periodic?: boolean; tolerance?: number } = {}
  ): KernelShape {
    return _interpolatePoints(this.oc, points, options);
  }

  approximatePoints(
    points: [number, number, number][],
    options: {
      tolerance?: number;
      degMin?: number;
      degMax?: number;
      smoothing?: [number, number, number] | null;
    } = {}
  ): KernelShape {
    return _approximatePoints(this.oc, points, options);
  }

  // --- Serialization ---

  toBREP(shape: KernelShape): string {
    return _toBREP(this.oc, shape);
  }

  fromBREP(data: string): KernelShape {
    return _fromBREP(this.oc, data);
  }

  // --- Mesh preparation ---

  hasTriangulation(shape: KernelShape): boolean {
    return _hasTriangulation(this.oc, shape);
  }

  meshShape(shape: KernelShape, tolerance: number, angularTolerance: number): void {
    _meshShape(this.oc, shape, tolerance, angularTolerance);
  }

  // --- Operations with shape evolution tracking ---

  translateWithHistory(
    shape: KernelShape,
    x: number,
    y: number,
    z: number,
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult {
    return _translateWithHistory(this.oc, shape, x, y, z, inputFaceHashes, hashUpperBound);
  }

  rotateWithHistory(
    shape: KernelShape,
    angle: number,
    inputFaceHashes: number[],
    hashUpperBound: number,
    axis?: [number, number, number],
    center?: [number, number, number]
  ): OperationResult {
    return _rotateWithHistory(this.oc, shape, angle, inputFaceHashes, hashUpperBound, axis, center);
  }

  mirrorWithHistory(
    shape: KernelShape,
    origin: [number, number, number],
    normal: [number, number, number],
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult {
    return _mirrorWithHistory(this.oc, shape, origin, normal, inputFaceHashes, hashUpperBound);
  }

  scaleWithHistory(
    shape: KernelShape,
    center: [number, number, number],
    factor: number,
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult {
    return _scaleWithHistory(this.oc, shape, center, factor, inputFaceHashes, hashUpperBound);
  }

  generalTransformWithHistory(
    shape: KernelShape,
    linear: readonly [number, number, number, number, number, number, number, number, number],
    translation: readonly [number, number, number],
    isOrthogonal: boolean,
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult {
    return _generalTransformWithHistory(
      this.oc,
      shape,
      linear,
      translation,
      isOrthogonal,
      inputFaceHashes,
      hashUpperBound
    );
  }

  fuseWithHistory(
    shape: KernelShape,
    tool: KernelShape,
    inputFaceHashes: number[],
    hashUpperBound: number,
    options?: BooleanOptions
  ): DiagnosticOperationResult {
    return _fuseWithHistory(this.oc, shape, tool, inputFaceHashes, hashUpperBound, options);
  }

  cutWithHistory(
    shape: KernelShape,
    tool: KernelShape,
    inputFaceHashes: number[],
    hashUpperBound: number,
    options?: BooleanOptions
  ): DiagnosticOperationResult {
    return _cutWithHistory(this.oc, shape, tool, inputFaceHashes, hashUpperBound, options);
  }

  intersectWithHistory(
    shape: KernelShape,
    tool: KernelShape,
    inputFaceHashes: number[],
    hashUpperBound: number,
    options?: BooleanOptions
  ): DiagnosticOperationResult {
    return _intersectWithHistory(this.oc, shape, tool, inputFaceHashes, hashUpperBound, options);
  }

  filletWithHistory(
    shape: KernelShape,
    edges: KernelShape[],
    radius: number | [number, number] | ((edge: KernelShape) => number | [number, number]),
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult {
    return _filletWithHistory(this.oc, shape, edges, radius, inputFaceHashes, hashUpperBound);
  }

  chamferWithHistory(
    shape: KernelShape,
    edges: KernelShape[],
    distance: number | [number, number] | ((edge: KernelShape) => number | [number, number]),
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult {
    return _chamferWithHistory(this.oc, shape, edges, distance, inputFaceHashes, hashUpperBound);
  }

  shellWithHistory(
    shape: KernelShape,
    faces: KernelShape[],
    thickness: number,
    inputFaceHashes: number[],
    hashUpperBound: number,
    tolerance?: number
  ): OperationResult {
    return _shellWithHistory(
      this.oc,
      shape,
      faces,
      thickness,
      inputFaceHashes,
      hashUpperBound,
      tolerance
    );
  }

  thickenWithHistory(
    shape: KernelShape,
    thickness: number,
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult {
    return _thickenWithHistory(this.oc, shape, thickness, inputFaceHashes, hashUpperBound);
  }

  offsetWithHistory(
    shape: KernelShape,
    distance: number,
    inputFaceHashes: number[],
    hashUpperBound: number,
    tolerance?: number
  ): OperationResult {
    return _offsetWithHistory(this.oc, shape, distance, inputFaceHashes, hashUpperBound, tolerance);
  }

  draftWithHistory(
    shape: KernelShape,
    faces: KernelShape[],
    pullDirection: [number, number, number],
    neutralPlane: [number, number, number],
    angleDeg: number | ((face: KernelShape) => number),
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult {
    return _draftWithHistory(
      this.oc,
      shape,
      faces,
      pullDirection,
      neutralPlane,
      angleDeg,
      inputFaceHashes,
      hashUpperBound
    );
  }

  // --- Composed transforms (delegates to advancedOps.ts) ---

  composeTransform(
    ops: Array<
      | { type: 'translate'; x: number; y: number; z: number }
      | {
          type: 'rotate';
          angle: number;
          axis?: [number, number, number];
          center?: [number, number, number];
        }
    >
  ): { handle: KernelType; dispose: () => void } {
    return _composeTransform(this.oc, ops);
  }

  applyComposedTransformWithHistory(
    shape: KernelShape,
    transformHandle: KernelType,
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult {
    return _applyComposedTransformWithHistory(
      this.oc,
      shape,
      transformHandle,
      inputFaceHashes,
      hashUpperBound
    );
  }

  // --- Advanced sweep/loft (delegates to advancedOps.ts) ---

  sweepPipeShell(
    profile: KernelShape,
    spine: KernelShape,
    options: {
      transitionMode?: 'transformed' | 'round' | 'right';
      auxiliary?: KernelShape;
      law?: KernelType;
      contact?: boolean;
      correction?: boolean;
      frenet?: boolean;
      support?: KernelType;
      shellMode?: boolean;
      tolerance?: number;
      boundTolerance?: number;
      angularTolerance?: number;
      maxDegree?: number;
      maxSegments?: number;
    } = {}
  ): KernelShape | { shape: KernelShape; firstShape: KernelShape; lastShape: KernelShape } {
    return _sweepPipeShell(this.oc, profile, spine, options);
  }

  loftAdvanced(
    wires: KernelShape[],
    options: {
      solid?: boolean;
      ruled?: boolean;
      tolerance?: number;
      startVertex?: KernelShape;
      endVertex?: KernelShape;
    } = {}
  ): KernelShape {
    return _loftAdvanced(this.oc, wires, options);
  }

  buildExtrusionLaw(profile: 'linear' | 's-curve', length: number, endFactor: number): KernelType {
    return _buildExtrusionLaw(this.oc, profile, length, endFactor);
  }

  revolveVec(
    shape: KernelShape,
    center: [number, number, number],
    direction: [number, number, number],
    angle: number
  ): KernelShape {
    return _revolveVec(this.oc, shape, center, direction, angle);
  }

  // --- Curve positioning (delegates to advancedOps.ts) ---

  positionOnCurve(shape: KernelShape, spine: KernelShape, param: number): KernelShape {
    return _positionOnCurve(this.oc, shape, spine, param);
  }

  // --- Pattern generation (delegates to advancedOps.ts) ---

  linearPattern(
    shape: KernelShape,
    direction: [number, number, number],
    spacing: number,
    count: number
  ): KernelShape[] {
    return _linearPattern(this.oc, shape, direction, spacing, count);
  }

  circularPattern(
    shape: KernelShape,
    center: [number, number, number],
    axis: [number, number, number],
    angleStep: number,
    count: number
  ): KernelShape[] {
    return _circularPattern(this.oc, shape, center, axis, angleStep, count);
  }

  // --- Surface construction (delegates to advancedOps.ts) ---

  makeNonPlanarFace(wire: KernelShape): KernelShape {
    return _makeNonPlanarFace(this.oc, wire);
  }

  addHolesInFace(face: KernelShape, holeWires: KernelShape[]): KernelShape {
    return _addHolesInFace(this.oc, face, holeWires);
  }

  removeHolesFromFace(face: KernelShape): KernelShape {
    return _removeHolesFromFace(this.oc, face);
  }

  makeFaceOnSurface(surface: KernelType, wire: KernelShape): KernelShape {
    return _makeFaceOnSurface(this.oc, surface, wire);
  }

  bsplineSurface(points: [number, number, number][], rows: number, cols: number): KernelShape {
    return _bsplineSurface(this.oc, points, rows, cols);
  }

  triangulatedSurface(points: [number, number, number][], rows: number, cols: number): KernelShape {
    return _triangulatedSurface(this.oc, points, rows, cols);
  }

  // --- Tri face builder (delegates to constructorOps.ts) ---

  buildTriFace(
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number]
  ): KernelShape | null {
    return _makeTriFace(this.oc, a, b, c);
  }

  // --- Mesh sewing -> solid (delegates to advancedOps.ts) ---

  sewAndSolidify(faces: KernelShape[], tolerance: number): KernelShape {
    return _sewAndSolidify(this.oc, faces, tolerance);
  }

  // --- Repair (delegates to advancedOps.ts) ---

  fixShape(shape: KernelShape): KernelShape {
    return _fixShape(this.oc, shape);
  }

  fixSelfIntersection(wire: KernelShape): KernelShape {
    return _fixSelfIntersection(this.oc, wire);
  }

  // --- Measurement (delegates to advancedOps.ts) ---

  surfaceCurvature(
    face: KernelShape,
    u: number,
    v: number
  ): {
    gaussian: number;
    mean: number;
    max: number;
    min: number;
    maxDirection: [number, number, number];
    minDirection: [number, number, number];
  } {
    return _surfaceCurvature(this.oc, face, u, v);
  }

  surfaceCenterOfMass(face: KernelShape): [number, number, number] {
    return _surfaceCenterOfMass(this.oc, face);
  }

  createDistanceQuery(referenceShape: KernelShape): {
    distanceTo(shape: KernelShape): {
      value: number;
      point1: [number, number, number];
      point2: [number, number, number];
    };
    dispose(): void;
  } {
    return _createDistanceQuery(this.oc, referenceShape);
  }

  // --- Projection (delegates to advancedOps.ts) ---

  projectEdges(
    shape: KernelShape,
    cameraOrigin: [number, number, number],
    cameraDirection: [number, number, number],
    cameraXAxis?: [number, number, number]
  ): {
    visible: { outline: KernelShape; smooth: KernelShape; sharp: KernelShape };
    hidden: { outline: KernelShape; smooth: KernelShape; sharp: KernelShape };
  } {
    return _projectEdges(this.oc, shape, cameraOrigin, cameraDirection, cameraXAxis);
  }

  // --- Draft (delegates to advancedOps.ts) ---

  draftPrism(
    shape: KernelShape,
    face: KernelShape,
    baseFace: KernelShape,
    height: number | null,
    angleDeg: number,
    fuse: boolean
  ): KernelShape {
    return _draftPrism(this.oc, shape, face, baseFace, height, angleDeg, fuse);
  }

  // --- XCAF document (delegates to advancedOps.ts) ---

  createXCAFDocument(
    shapes: Array<{
      shape: KernelShape;
      name: string;
      color?: [number, number, number, number];
    }>
  ): KernelType {
    return _createXCAFDocument(this.oc, shapes);
  }

  writeXCAFToSTEP(doc: KernelType, options: { unit?: string; modelUnit?: string } = {}): string {
    return _writeXCAFToSTEP(this.oc, doc, options);
  }

  // --- Export configured (delegates to advancedOps.ts) ---

  exportSTEPConfigured(
    shapes: Array<{
      shape: KernelShape;
      name?: string;
      color?: [number, number, number, number];
    }>,
    options: { unit?: string; modelUnit?: string; schema?: number } = {}
  ): string {
    return _exportSTEPConfigured(this.oc, shapes, options);
  }

  // --- 2D Handle wrapping (delegates to kernel2dOps.ts) ---

  wrapCurve2dHandle(handle: KernelType): Curve2dHandle {
    return _wrapCurve2dHandle(handle);
  }

  createCurve2dAdaptor(handle: Curve2dHandle): KernelType {
    return _createCurve2dAdaptor(handle);
  }

  // --- 2D Point/Vector factories (delegates to kernel2dOps.ts) ---

  createPoint2d(x: number, y: number): KernelType {
    return _createPoint2d(x, y);
  }

  createDirection2d(x: number, y: number): KernelType {
    return _createDirection2d(x, y);
  }

  createVector2d(x: number, y: number): KernelType {
    return _createVector2d(x, y);
  }

  createAxis2d(px: number, py: number, dx: number, dy: number): KernelType {
    return _createAxis2d(px, py, dx, dy);
  }

  // --- 2D Curve construction (delegates to kernel2dOps.ts) ---

  makeLine2d(x1: number, y1: number, x2: number, y2: number): Curve2dHandle {
    return _makeLine2d(x1, y1, x2, y2);
  }

  makeCircle2d(cx: number, cy: number, radius: number, sense?: boolean): Curve2dHandle {
    return _makeCircle2d(cx, cy, radius, sense);
  }

  makeArc2dThreePoints(
    x1: number,
    y1: number,
    xm: number,
    ym: number,
    x2: number,
    y2: number
  ): Curve2dHandle {
    return _makeArc2dThreePoints(x1, y1, xm, ym, x2, y2);
  }

  makeArc2dTangent(
    startX: number,
    startY: number,
    tangentX: number,
    tangentY: number,
    endX: number,
    endY: number
  ): Curve2dHandle {
    return _makeArc2dTangent(startX, startY, tangentX, tangentY, endX, endY);
  }

  makeEllipse2d(
    cx: number,
    cy: number,
    majorRadius: number,
    minorRadius: number,
    xDirX?: number,
    xDirY?: number,
    sense?: boolean
  ): Curve2dHandle {
    return _makeEllipse2d(cx, cy, majorRadius, minorRadius, xDirX, xDirY, sense);
  }

  makeEllipseArc2d(
    cx: number,
    cy: number,
    majorRadius: number,
    minorRadius: number,
    startAngle: number,
    endAngle: number,
    xDirX?: number,
    xDirY?: number,
    sense?: boolean
  ): Curve2dHandle {
    return _makeEllipseArc2d(
      cx,
      cy,
      majorRadius,
      minorRadius,
      startAngle,
      endAngle,
      xDirX,
      xDirY,
      sense
    );
  }

  makeBezier2d(points: [number, number][]): Curve2dHandle {
    return _makeBezier2d(points);
  }

  makeBSpline2d(
    points: [number, number][],
    options?: {
      degMin?: number;
      degMax?: number;
      continuity?: 'C0' | 'C1' | 'C2' | 'C3';
      tolerance?: number;
      smoothing?: [number, number, number] | null;
    }
  ): Curve2dHandle {
    return _makeBSpline2d(points, options);
  }

  // --- 2D Curve queries (delegates to kernel2dOps.ts) ---

  evaluateCurve2d(curve: Curve2dHandle, param: number): [number, number] {
    return _evaluateCurve2d(curve, param);
  }

  evaluateCurve2dD1(
    curve: Curve2dHandle,
    param: number
  ): { point: [number, number]; tangent: [number, number] } {
    return _evaluateCurve2dD1(curve, param);
  }

  getCurve2dBounds(curve: Curve2dHandle): { first: number; last: number } {
    return _getCurve2dBounds(curve);
  }

  getCurve2dType(curve: Curve2dHandle): string {
    return _getCurve2dType(curve);
  }

  // --- 2D Curve modification (delegates to kernel2dOps.ts) ---

  trimCurve2d(curve: Curve2dHandle, start: number, end: number): Curve2dHandle {
    return _trimCurve2d(curve, start, end);
  }

  reverseCurve2d(curve: Curve2dHandle): void {
    _reverseCurve2d(curve);
  }

  copyCurve2d(curve: Curve2dHandle): Curve2dHandle {
    return _copyCurve2d(curve);
  }

  offsetCurve2d(curve: Curve2dHandle, offset: number): Curve2dHandle {
    return _offsetCurve2d(curve, offset);
  }

  // --- 2D Transformations (delegates to kernel2dOps.ts) ---

  translateCurve2d(curve: Curve2dHandle, dx: number, dy: number): Curve2dHandle {
    return _translateCurve2d(curve, dx, dy);
  }

  rotateCurve2d(curve: Curve2dHandle, angle: number, cx: number, cy: number): Curve2dHandle {
    return _rotateCurve2d(curve, angle, cx, cy);
  }

  scaleCurve2d(curve: Curve2dHandle, factor: number, cx: number, cy: number): Curve2dHandle {
    return _scaleCurve2d(curve, factor, cx, cy);
  }

  mirrorCurve2dAtPoint(curve: Curve2dHandle, cx: number, cy: number): Curve2dHandle {
    return _mirrorCurve2dAtPoint(curve, cx, cy);
  }

  mirrorCurve2dAcrossAxis(
    curve: Curve2dHandle,
    originX: number,
    originY: number,
    dirX: number,
    dirY: number
  ): Curve2dHandle {
    return _mirrorCurve2dAcrossAxis(curve, originX, originY, dirX, dirY);
  }

  affinityTransform2d(
    curve: Curve2dHandle,
    axisOriginX: number,
    axisOriginY: number,
    axisDirX: number,
    axisDirY: number,
    ratio: number
  ): Curve2dHandle {
    return _affinityTransform2d(curve, axisOriginX, axisOriginY, axisDirX, axisDirY, ratio);
  }

  // --- 2D General transforms (gp_GTrsf2d) (delegates to kernel2dOps.ts) ---

  createIdentityGTrsf2d(): KernelType {
    return _createIdentityGTrsf2d();
  }

  createAffinityGTrsf2d(
    originX: number,
    originY: number,
    dirX: number,
    dirY: number,
    ratio: number
  ): KernelType {
    return _createAffinityGTrsf2d(originX, originY, dirX, dirY, ratio);
  }

  createTranslationGTrsf2d(dx: number, dy: number): KernelType {
    return _createTranslationGTrsf2d(dx, dy);
  }

  createMirrorGTrsf2d(
    cx: number,
    cy: number,
    mode: 'point' | 'axis',
    originX?: number,
    originY?: number,
    dirX?: number,
    dirY?: number
  ): KernelType {
    return _createMirrorGTrsf2d(cx, cy, mode, originX, originY, dirX, dirY);
  }

  createRotationGTrsf2d(angle: number, cx: number, cy: number): KernelType {
    return _createRotationGTrsf2d(angle, cx, cy);
  }

  createScaleGTrsf2d(factor: number, cx: number, cy: number): KernelType {
    return _createScaleGTrsf2d(factor, cx, cy);
  }

  setGTrsf2dTranslationPart(gtrsf: KernelType, dx: number, dy: number): void {
    _setGTrsf2dTranslationPart(gtrsf, dx, dy);
  }

  multiplyGTrsf2d(base: KernelType, other: KernelType): void {
    _multiplyGTrsf2d(base, other);
  }

  transformCurve2dGeneral(curve: Curve2dHandle, gtrsf: KernelType): Curve2dHandle {
    return _transformCurve2dGeneral(curve, gtrsf);
  }

  // --- 2D Intersection & distance (delegates to kernel2dOps.ts) ---

  intersectCurves2d(
    c1: Curve2dHandle,
    c2: Curve2dHandle,
    tolerance: number
  ): { points: [number, number][]; segments: Curve2dHandle[] } {
    return _intersectCurves2d(c1, c2, tolerance);
  }

  projectPointOnCurve2d(
    curve: Curve2dHandle,
    x: number,
    y: number
  ): { param: number; distance: number } | null {
    return _projectPointOnCurve2d(curve, x, y);
  }

  distanceBetweenCurves2d(
    c1: Curve2dHandle,
    c2: Curve2dHandle,
    p1Start: number,
    p1End: number,
    p2Start: number,
    p2End: number
  ): number {
    return _distanceBetweenCurves2d(c1, c2, p1Start, p1End, p2Start, p2End);
  }

  // --- 2D Approximation (delegates to kernel2dOps.ts) ---

  approximateCurve2dAsBSpline(
    curve: Curve2dHandle,
    tolerance: number,
    continuity: 'C0' | 'C1' | 'C2' | 'C3',
    maxSegments: number
  ): Curve2dHandle {
    return _approximateCurve2dAsBSpline(curve, tolerance, continuity, maxSegments);
  }

  decomposeBSpline2dToBeziers(curve: Curve2dHandle): Curve2dHandle[] {
    return _decomposeBSpline2dToBeziers(curve);
  }

  // --- 2D Bounding box (delegates to kernel2dOps.ts) ---

  createBoundingBox2d(): BBox2dHandle {
    return _createBoundingBox2d();
  }

  addCurveToBBox2d(bbox: BBox2dHandle, curve: Curve2dHandle, tolerance: number): void {
    _addCurveToBBox2d(bbox, curve, tolerance);
  }

  getBBox2dBounds(bbox: BBox2dHandle): {
    xMin: number;
    yMin: number;
    xMax: number;
    yMax: number;
  } {
    return _getBBox2dBounds(bbox);
  }

  mergeBBox2d(target: BBox2dHandle, other: BBox2dHandle): void {
    _mergeBBox2d(target, other);
  }

  isBBox2dOut(a: BBox2dHandle, b: BBox2dHandle): boolean {
    return _isBBox2dOut(a, b);
  }

  isBBox2dOutPoint(bbox: BBox2dHandle, x: number, y: number): boolean {
    return _isBBox2dOutPoint(bbox, x, y);
  }

  // --- 2D Type extraction (delegates to kernel2dOps.ts) ---

  getCurve2dCircleData(curve: Curve2dHandle): {
    cx: number;
    cy: number;
    radius: number;
    isDirect: boolean;
  } | null {
    return _getCurve2dCircleData(curve);
  }

  getCurve2dEllipseData(curve: Curve2dHandle): {
    majorRadius: number;
    minorRadius: number;
    xAxisAngle: number;
    isDirect: boolean;
  } | null {
    return _getCurve2dEllipseData(curve);
  }

  getCurve2dBezierPoles(curve: Curve2dHandle): [number, number][] | null {
    return _getCurve2dBezierPoles(curve);
  }

  getCurve2dBezierDegree(curve: Curve2dHandle): number | null {
    return _getCurve2dBezierDegree(curve);
  }

  getCurve2dBSplineData(curve: Curve2dHandle): {
    poles: [number, number][];
    knots: number[];
    multiplicities: number[];
    degree: number;
    isPeriodic: boolean;
  } | null {
    return _getCurve2dBSplineData(curve);
  }

  // --- 2D Serialization (delegates to kernel2dOps.ts) ---

  serializeCurve2d(curve: Curve2dHandle): string {
    return _serializeCurve2d(curve);
  }

  deserializeCurve2d(data: string): Curve2dHandle {
    return _deserializeCurve2d(data);
  }

  // --- 2D Curve splitting (delegates to kernel2dOps.ts) ---

  splitCurve2d(curve: Curve2dHandle, params: number[]): Curve2dHandle[] {
    return _splitCurve2d(curve, params);
  }

  // --- 2D -> 3D projection (delegates to kernel2dOps.ts) ---

  liftCurve2dToPlane(
    curve: Curve2dHandle,
    planeOrigin: [number, number, number],
    planeZ: [number, number, number],
    planeX: [number, number, number]
  ): KernelShape {
    return _liftCurve2dToPlane(this.oc, curve, planeOrigin, planeZ, planeX);
  }

  buildEdgeOnSurface(curve: Curve2dHandle, surface: KernelType): KernelShape {
    return _buildEdgeOnSurface(this.oc, curve, surface);
  }

  extractSurfaceFromFace(face: KernelShape): KernelType {
    return _extractSurfaceFromFace(this.oc, face);
  }

  extractCurve2dFromEdge(edge: KernelShape, face: KernelShape): Curve2dHandle {
    return _extractCurve2dFromEdge(this.oc, edge, face);
  }

  buildCurves3d(wire: KernelShape): void {
    _buildCurves3d(this.oc, wire);
  }

  fixWireOnFace(wire: KernelShape, face: KernelShape, tolerance: number): KernelShape {
    return _fixWireOnFace(this.oc, wire, face, tolerance);
  }

  // --- Surface filling (delegates to kernel2dOps.ts) ---

  fillSurface(
    wires: KernelShape[],
    options?: {
      order?: number;
      nbPtsOnCur?: number;
      nbIter?: number;
      tol3d?: number;
      tol2d?: number;
      maxDeg?: number;
      maxSeg?: number;
    }
  ): KernelShape {
    return _fillSurface(this.oc, wires, options);
  }

  // --- Bezier pole extraction (3D) ---

  // --- Export helpers ---

  wrapString(str: string): KernelType {
    return _wrapString(this.oc, str);
  }

  wrapColor(red: number, green: number, blue: number, alpha: number): KernelType {
    return _wrapColorRGBA(this.oc, red, green, blue, alpha);
  }

  configureStepUnits(unit: string | undefined, modelUnit: string | undefined): void {
    _configureStepUnits(this.oc, unit, modelUnit);
  }

  configureStepWriter(writer: KernelType): void {
    _configureStepWriter(this.oc, writer);
  }

  createCurveAdaptor(shape: KernelShape): KernelType {
    return _createCurveAdaptor(this.oc, shape);
  }

  getBezierPenultimatePole(edge: KernelShape): [number, number, number] | null {
    return _getBezierPenultimatePole(this.oc, edge);
  }

  // --- 3D Geometry primitive factories ---

  createPoint3d(x: number, y: number, z: number): KernelType {
    return _createPoint3d(this.oc, x, y, z);
  }

  createDirection3d(x: number, y: number, z: number): KernelType {
    return _createDirection3d(this.oc, x, y, z);
  }

  createVector3d(x: number, y: number, z: number): KernelType {
    return _createVector3d(this.oc, x, y, z);
  }

  createAxis1(cx: number, cy: number, cz: number, dx: number, dy: number, dz: number): KernelType {
    return _createAxis1(this.oc, cx, cy, cz, dx, dy, dz);
  }

  createAxis2(
    ox: number,
    oy: number,
    oz: number,
    zx: number,
    zy: number,
    zz: number,
    xx?: number,
    xy?: number,
    xz?: number
  ): KernelType {
    return _createAxis2(this.oc, ox, oy, oz, zx, zy, zz, xx, xy, xz);
  }

  createAxis3(
    ox: number,
    oy: number,
    oz: number,
    zx: number,
    zy: number,
    zz: number,
    xx?: number,
    xy?: number,
    xz?: number
  ): KernelType {
    return _createAxis3(this.oc, ox, oy, oz, zx, zy, zz, xx, xy, xz);
  }

  // --- Unsupported brepkit-only methods ---

  export3MF(_shape: KernelShape, _tolerance: number): ArrayBuffer {
    throw new Error('export3MF is only available with the brepkit kernel');
  }

  exportGLB(_shape: KernelShape, _tolerance: number): ArrayBuffer {
    throw new Error('exportGLB is only available with the brepkit kernel');
  }

  exportOBJ(_shape: KernelShape, _tolerance: number): ArrayBuffer {
    throw new Error('exportOBJ is only available with the brepkit kernel');
  }

  exportPLY(_shape: KernelShape, _tolerance: number): ArrayBuffer {
    throw new Error('exportPLY is only available with the brepkit kernel');
  }

  import3MF(_data: ArrayBuffer): KernelShape[] {
    throw new Error('import3MF is only available with the brepkit kernel');
  }

  importOBJ(_data: ArrayBuffer): KernelShape {
    throw new Error('importOBJ is only available with the brepkit kernel');
  }

  importGLB(_data: ArrayBuffer): KernelShape {
    throw new Error('importGLB is only available with the brepkit kernel');
  }

  filletVariable(_shape: KernelShape, _spec: string): KernelShape {
    throw new Error('filletVariable is only available with the brepkit kernel');
  }

  helicalSweep(
    _profile: KernelShape,
    _axisOrigin: [number, number, number],
    _axisDirection: [number, number, number],
    _radius: number,
    _pitch: number,
    _turns: number
  ): KernelShape {
    throw new Error('helicalSweep is only available with the brepkit kernel');
  }

  sweepWithOptions(
    _profile: KernelShape,
    _pathEdge: KernelShape,
    _contactMode: string,
    _scaleValues: number[],
    _segments: number
  ): KernelShape {
    throw new Error('sweepWithOptions is only available with the brepkit kernel');
  }

  draft(
    shape: KernelShape,
    faces: KernelShape[],
    pullDirection: [number, number, number],
    neutralPlane: [number, number, number],
    angleDeg: number | ((face: KernelShape) => number)
  ): KernelShape {
    return _draftWithHistory(this.oc, shape, faces, pullDirection, neutralPlane, angleDeg, [], 1)
      .shape;
  }

  defeature(_shape: KernelShape, _faces: KernelShape[]): KernelShape {
    throw new Error('defeature is only available with the brepkit kernel');
  }

  detectSmallFeatures(
    _shape: KernelShape,
    _areaThreshold: number,
    _tolerance: number
  ): KernelShape[] {
    throw new Error('detectSmallFeatures is only available with the brepkit kernel');
  }

  recognizeFeatures(_shape: KernelShape, _tolerance: number): string {
    throw new Error('recognizeFeatures is only available with the brepkit kernel');
  }

  meshBoolean(
    _positionsA: number[],
    _indicesA: number[],
    _positionsB: number[],
    _indicesB: number[],
    _op: string,
    _tolerance: number
  ): KernelMeshResult {
    throw new Error('meshBoolean is only available with the brepkit kernel');
  }

  booleanPipeline(
    base: KernelShape,
    steps: ReadonlyArray<{ op: 'fuse' | 'cut' | 'intersect'; tool: KernelShape }>,
    options?: { glueMode?: number | undefined; fuzzyValue?: number | undefined }
  ): KernelShape | null {
    return executeBooleanPipeline(this.oc, base, steps, options);
  }

  edgeToFaceMap(_shape: KernelShape): string {
    throw new Error('edgeToFaceMap is only available with the brepkit kernel');
  }

  sharedEdges(_faceA: KernelShape, _faceB: KernelShape): KernelShape[] {
    throw new Error('sharedEdges is only available with the brepkit kernel');
  }

  adjacentFaces(_shape: KernelShape, _face: KernelShape): KernelShape[] {
    throw new Error('adjacentFaces is only available with the brepkit kernel');
  }

  curveDegreeElevate(_edge: KernelShape, _elevateBy: number): KernelShape {
    throw new Error('curveDegreeElevate is only available with the brepkit kernel');
  }

  curveKnotInsert(_edge: KernelShape, _knot: number, _times: number): KernelShape {
    throw new Error('curveKnotInsert is only available with the brepkit kernel');
  }

  curveKnotRemove(_edge: KernelShape, _knot: number, _tolerance: number): KernelShape {
    throw new Error('curveKnotRemove is only available with the brepkit kernel');
  }

  curveSplit(_edge: KernelShape, _param: number): [KernelShape, KernelShape] {
    throw new Error('curveSplit is only available with the brepkit kernel');
  }

  approximateSurfaceLspia(
    _coords: number[],
    _rows: number,
    _cols: number,
    _degreeU: number,
    _degreeV: number,
    _numCpsU: number,
    _numCpsV: number,
    _tolerance: number,
    _maxIterations: number
  ): KernelShape {
    throw new Error('approximateSurfaceLspia is only available with the brepkit kernel');
  }

  untrimFace(_face: KernelShape, _samplesPerCurve: number, _interiorSamples: number): KernelShape {
    throw new Error('untrimFace is only available with the brepkit kernel');
  }

  mergeCoincidentVertices(_shape: KernelShape, _tolerance: number): number {
    throw new Error('mergeCoincidentVertices is only available with the brepkit kernel');
  }

  removeDegenerateEdges(_shape: KernelShape, _tolerance: number): number {
    throw new Error('removeDegenerateEdges is only available with the brepkit kernel');
  }

  fixFaceOrientations(_shape: KernelShape): number {
    throw new Error('fixFaceOrientations is only available with the brepkit kernel');
  }

  classifyPointRobust(
    _shape: KernelShape,
    _point: [number, number, number],
    _tolerance: number
  ): string {
    throw new Error('classifyPointRobust is only available with the brepkit kernel');
  }

  classifyPointWinding(
    _shape: KernelShape,
    _point: [number, number, number],
    _tolerance: number
  ): string {
    throw new Error('classifyPointWinding is only available with the brepkit kernel');
  }

  executeBatch(_json: string): string {
    throw new Error('executeBatch is only available with the brepkit kernel');
  }

  checkpoint(): number {
    throw new Error('checkpoint is only available with the brepkit kernel');
  }

  checkpointCount(): number {
    throw new Error('checkpointCount is only available with the brepkit kernel');
  }

  restoreCheckpoint(_cp: number): void {
    throw new Error('restoreCheckpoint is only available with the brepkit kernel');
  }

  discardCheckpoint(_cp: number): void {
    throw new Error('discardCheckpoint is only available with the brepkit kernel');
  }

  // --- Dispose ---

  dispose(handle: { delete(): void }): void {
    _dispose(this.oc, handle);
  }
}
