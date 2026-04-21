/* v8 ignore file -- brepkit WASM kernel not available in OCCT test suite */
/**
 * BrepkitAdapter — KernelAdapter implementation backed by brepkit's WASM kernel.
 *
 * brepkit is an arena-based B-Rep kernel compiled to WASM via wasm-bindgen.
 * All geometry is identified by u32 handles into the arena. This adapter wraps
 * those handles in {@link BrepkitHandle} objects so they can flow through
 * brepjs's kernel-agnostic API as opaque `KernelShape` / `KernelType` values.
 *
 * ## Lifecycle
 *
 * ```ts
 * import init, { BrepKernel } from 'brepkit-wasm';
 * import { BrepkitAdapter } from './brepkitAdapter.js';
 * import { registerKernel } from './index.js';
 *
 * await init();
 * const kernel = new BrepKernel();
 * registerKernel('brepkit', new BrepkitAdapter(kernel));
 * ```
 *
 * ## Memory model
 *
 * brepkit uses arena allocation — entities are never individually freed.
 * `dispose()` is intentionally a no-op on individual handles. Call
 * `BrepKernel.free()` (wasm-bindgen destructor) to release the entire arena.
 *
 * @module
 */

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
import type { BulkMeasurement } from '@/kernel/interfaces/measureOps.js';
import type { TransformEntry } from '@/kernel/interfaces/transformOps.js';
import type { BrepkitKernel } from './brepkitWasmTypes.js';
import type { Curve2dHandle, BBox2dHandle } from '@/kernel/kernel2dTypes.js';
import {
  makeVertex as _makeVertex,
  makeEdge as _makeEdge,
  makeWire as _makeWire,
  makeFace as _makeFace,
  makeBox as _makeBox,
  makeRectangle as _makeRectangle,
  makeCylinder as _makeCylinder,
  makeSphere as _makeSphere,
  makeCone as _makeCone,
  makeTorus as _makeTorus,
  makeEllipsoid as _makeEllipsoid,
  makeLineEdge as _makeLineEdge,
  makeCircleEdge as _makeCircleEdge,
  makeCircleArc as _makeCircleArc,
  makeArcEdge as _makeArcEdge,
  makeEllipseEdge as _makeEllipseEdge,
  makeEllipseArc as _makeEllipseArc,
  makeBezierEdge as _makeBezierEdge,
  makeTangentArc as _makeTangentArc,
  makeHelixWire as _makeHelixWire,
  makeWireFromMixed as _makeWireFromMixed,
  makeCompound as _makeCompound,
  makeBoxFromCorners as _makeBoxFromCorners,
  solidFromShell as _solidFromShell,
  makeNonPlanarFace as _makeNonPlanarFace,
  addHolesInFace as _addHolesInFace,
  removeHolesFromFace as _removeHolesFromFace,
  makeFaceOnSurface as _makeFaceOnSurface,
  bsplineSurface as _bsplineSurface,
  triangulatedSurface as _triangulatedSurface,
  buildTriFace as _buildTriFace,
  sewAndSolidify as _sewAndSolidify,
  interpolatePoints as _interpolatePoints,
  approximatePoints as _approximatePoints,
  createPoint3d as _createPoint3d,
  createDirection3d as _createDirection3d,
  createVector3d as _createVector3d,
  createAxis1 as _createAxis1,
  createAxis2 as _createAxis2,
  createAxis3 as _createAxis3,
} from './constructionOps.js';
import {
  fuse as _fuse,
  cut as _cut,
  intersect as _intersect,
  section as _section,
  fuseAll as _fuseAll,
  cutAll as _cutAll,
  split as _split,
  meshBoolean as _meshBoolean,
  checkBoolean as _checkBoolean,
  hull as _hull,
  hullFromPoints as _hullFromPoints,
  buildSolidFromFaces as _buildSolidFromFaces,
} from './booleanOps.js';
import {
  extrude as _extrude,
  revolve as _revolve,
  revolveVec as _revolveVec,
  loft as _loft,
  sweep as _sweep,
  simplePipe as _simplePipe,
  helicalSweep as _helicalSweep,
  sweepWithOptions as _sweepWithOptions,
  sweepPipeShell as _sweepPipeShell,
  loftAdvanced as _loftAdvanced,
  buildExtrusionLaw as _buildExtrusionLaw,
  draftPrism as _draftPrism,
} from './sweepOps.js';
import {
  fillet as _fillet,
  chamfer as _chamfer,
  chamferDistAngle as _chamferDistAngle,
  shell as _shell,
  thicken as _thicken,
  offset as _offset,
  filletVariable as _filletVariable,
  draft as _draft,
  defeature as _defeature,
  offsetWire2D as _offsetWire2D,
  simplify as _simplify,
  reverseShape as _reverseShape,
} from './modifierOps.js';
import {
  transform as _transform,
  translate as _translate,
  rotate as _rotate,
  mirror as _mirror,
  scale as _scale,
  generalTransform as _generalTransform,
  generalTransformNonOrthogonal as _generalTransformNonOrthogonal,
  positionOnCurve as _positionOnCurve,
  linearPattern as _linearPattern,
  circularPattern as _circularPattern,
  gridPattern as _gridPattern,
} from './transformOps.js';
import {
  sketchNew as _sketchNew,
  sketchAddPoint as _sketchAddPoint,
  sketchAddConstraint as _sketchAddConstraint,
  sketchSolve as _sketchSolve,
  sketchAddArc as _sketchAddArc,
  sketchDof as _sketchDof,
} from './sketchOps.js';
import {
  isValid as _isValid,
  isValidStrict as _isValidStrict,
  healSolid as _healSolid,
  healFace as _healFace,
  healWire as _healWire,
  mergeCoincidentVertices as _mergeCoincidentVertices,
  removeDegenerateEdges as _removeDegenerateEdges,
  fixFaceOrientations as _fixFaceOrientations,
  fixShape as _fixShape,
  fixSelfIntersection as _fixSelfIntersection,
  validationDetails as _validationDetails,
} from './repairOps.js';
import {
  exportSTEP as _exportSTEP,
  exportSTL as _exportSTL,
  importSTEP as _importSTEP,
  importSTL as _importSTL,
  exportIGES as _exportIGES,
  importIGES as _importIGES,
  exportSTEPAssembly as _exportSTEPAssembly,
  export3MF as _export3MF,
  exportGLB as _exportGLB,
  exportOBJ as _exportOBJ,
  exportPLY as _exportPLY,
  import3MF as _import3MF,
  importOBJ as _importOBJ,
  importGLB as _importGLB,
  toBREP as _toBREP,
  fromBREP as _fromBREP,
  createXCAFDocument as _createXCAFDocument,
  writeXCAFToSTEP as _writeXCAFToSTEP,
  exportSTEPConfigured as _exportSTEPConfigured,
} from './ioOps.js';
import {
  mesh as _mesh,
  meshEdges as _meshEdges,
  hasTriangulation as _hasTriangulation,
  meshShape as _meshShape,
} from './meshOps.js';
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
  curvePointAtParam as _curvePointAtParam,
  curveIsClosed as _curveIsClosed,
  curveIsPeriodic as _curveIsPeriodic,
  curvePeriod as _curvePeriod,
  curveType as _curveType,
  curveDegreeElevate as _curveDegreeElevate,
  curveKnotInsert as _curveKnotInsert,
  curveKnotRemove as _curveKnotRemove,
  curveSplit as _curveSplit,
  approximateSurfaceLspia as _approximateSurfaceLspia,
  untrimFace as _untrimFace,
  createCurveAdaptor as _createCurveAdaptor,
  getBezierPenultimatePole as _getBezierPenultimatePole,
  getSurfaceCylinderData as _getSurfaceCylinderData,
  reverseSurfaceU as _reverseSurfaceU,
  classifyPointOnFace as _classifyPointOnFace,
  classifyPointRobust as _classifyPointRobust,
  classifyPointWinding as _classifyPointWinding,
  detectSmallFeatures as _detectSmallFeatures,
  recognizeFeatures as _recognizeFeatures,
  projectEdges as _projectEdges,
} from './geometryOps.js';
import {
  iterShapes as _iterShapes,
  iterShapeList as _iterShapeList,
  shapeType as _shapeType,
  isSame as _isSame,
  isEqual as _isEqual,
  downcast as _downcast,
  hashCode as _hashCode,
  isNull as _isNull,
  shapeOrientation as _shapeOrientation,
  edgeToFaceMap as _edgeToFaceMap,
  sharedEdges as _sharedEdges,
  adjacentFaces as _adjacentFaces,
  sew as _sew,
} from './topologyOps.js';
import {
  volume as _volume,
  area as _area,
  length as _length,
  centerOfMass as _centerOfMass,
  linearCenterOfMass as _linearCenterOfMass,
  boundingBox as _boundingBox,
  distance as _distance,
  surfaceCurvature as _surfaceCurvature,
  surfaceCenterOfMass as _surfaceCenterOfMass,
  createDistanceQuery as _createDistanceQuery,
} from './measureOps.js';
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
  applyComposedTransformWithHistory as _applyComposedTransformWithHistory,
  composeTransform as _composeTransform,
} from './evolutionOps.js';
import {
  createPoint2d as _createPoint2d,
  createDirection2d as _createDirection2d,
  createVector2d as _createVector2d,
  createAxis2d as _createAxis2d,
  wrapCurve2dHandle as _wrapCurve2dHandle,
  createCurve2dAdaptor as _createCurve2dAdaptor,
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

// ---------------------------------------------------------------------------
// BrepkitAdapter
// ---------------------------------------------------------------------------

/**
 * Implements brepjs's {@link KernelAdapter} using brepkit's WASM `BrepKernel`.
 *
 * All 162 KernelAdapter 3D methods and 47 Kernel2DCapability methods are
 * implemented. See ADR-0006 Appendix A for behavioral differences vs OCCT.
 *
 * Unwired brepkit-wasm capabilities (v0.10.1):
 * - bk.classifyPointOnFace() — trim-aware point classification (future brepkit PR)
 * - bk.shapeToShapeDistance() — shape-to-shape distance (future brepkit PR)
 * - bk.intersectCurves2d() — 2D curve intersection (future brepkit PR)
 */

/**
 * Resolve a callback-style draft angle to a uniform number.
 * brepkit only supports a single angle per draft call.
 */
function resolveUniformAngle(
  faces: KernelShape[],
  angleDeg: number | ((face: KernelShape) => number)
): number {
  if (typeof angleDeg !== 'function') return angleDeg;
  let uniform: number | undefined;
  for (const face of faces) {
    let angle: number;
    try {
      angle = angleDeg(face);
    } catch {
      throw new Error(
        'brepkit does not support variable draft with multiple distinct angles. ' +
          'Use the OCCT kernel for per-face angle variation, or use a uniform angle.'
      );
    }
    if (uniform === undefined) {
      uniform = angle;
    } else if (angle !== uniform) {
      throw new Error(
        'brepkit does not support variable draft with multiple distinct angles. ' +
          'Use the OCCT kernel for per-face angle variation, or use a uniform angle.'
      );
    }
  }
  if (uniform === undefined) throw new Error('draft: no faces provided');
  return uniform;
}

export class BrepkitAdapter implements KernelAdapter {
  readonly oc: KernelInstance;
  readonly kernelId = 'brepkit';

  /** The underlying brepkit WASM kernel instance (typed). */
  private readonly bk: BrepkitKernel;

  constructor(brepkitKernel: KernelInstance) {
    this.bk = brepkitKernel as BrepkitKernel;
    // `oc` is the escape hatch — expose the raw kernel for advanced usage
    this.oc = brepkitKernel;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Boolean operations
  // ═══════════════════════════════════════════════════════════════════════

  fuse(shape: KernelShape, tool: KernelShape, _options?: BooleanOptions): KernelShape {
    return _fuse(this.bk, shape, tool, _options);
  }

  cut(shape: KernelShape, tool: KernelShape, _options?: BooleanOptions): KernelShape {
    return _cut(this.bk, shape, tool, _options);
  }

  intersect(shape: KernelShape, tool: KernelShape, _options?: BooleanOptions): KernelShape {
    return _intersect(this.bk, shape, tool, _options);
  }

  section(shape: KernelShape, plane: KernelShape, _approximation?: boolean): KernelShape {
    return _section(this.bk, shape, plane, _approximation);
  }

  fuseAll(shapes: KernelShape[], options?: BooleanOptions): KernelShape {
    return _fuseAll(this.bk, shapes, options);
  }

  cutAll(shape: KernelShape, tools: KernelShape[], options?: BooleanOptions): KernelShape {
    return _cutAll(this.bk, shape, tools, options);
  }

  split(shape: KernelShape, tools: KernelShape[]): KernelShape {
    return _split(this.bk, shape, tools);
  }

  checkBoolean(shape: KernelShape, tool: KernelShape, op: BooleanOpType): CheckBooleanResult {
    return _checkBoolean(this.bk, shape, tool, op, (s) => this.isValid(s));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Convex hull
  // ═══════════════════════════════════════════════════════════════════════

  hull(shapes: KernelShape[], _tolerance: number): KernelShape {
    return _hull(this.bk, shapes, _tolerance);
  }

  hullFromPoints(
    points: Array<{ x: number; y: number; z: number }>,
    _tolerance: number
  ): KernelShape {
    return _hullFromPoints(this.bk, points, _tolerance);
  }

  buildSolidFromFaces(
    points: Array<{ x: number; y: number; z: number }>,
    faces: Array<readonly [number, number, number]>,
    _tolerance: number
  ): KernelShape {
    return _buildSolidFromFaces(this.bk, points, faces, _tolerance);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Shape construction
  // ═══════════════════════════════════════════════════════════════════════

  makeVertex(x: number, y: number, z: number): KernelShape {
    return _makeVertex(this.bk, x, y, z);
  }

  makeEdge(curve: KernelType, start?: number, end?: number): KernelShape {
    return _makeEdge(this.bk, curve, start, end);
  }

  makeWire(edges: KernelShape[]): KernelShape {
    return _makeWire(this.bk, edges);
  }

  makeFace(wire: KernelShape, _planar?: boolean): KernelShape {
    return _makeFace(this.bk, wire, _planar);
  }

  makeBox(width: number, height: number, depth: number): KernelShape {
    return _makeBox(this.bk, width, height, depth);
  }

  makeRectangle(width: number, height: number): KernelShape {
    return _makeRectangle(this.bk, width, height);
  }

  makeCylinder(
    radius: number,
    height: number,
    center?: [number, number, number],
    direction?: [number, number, number]
  ): KernelShape {
    return _makeCylinder(this.bk, radius, height, center, direction);
  }

  makeSphere(radius: number, center?: [number, number, number]): KernelShape {
    return _makeSphere(this.bk, radius, center);
  }

  makeCone(
    radius1: number,
    radius2: number,
    height: number,
    center?: [number, number, number],
    direction?: [number, number, number]
  ): KernelShape {
    return _makeCone(this.bk, radius1, radius2, height, center, direction);
  }

  makeTorus(
    majorRadius: number,
    minorRadius: number,
    center?: [number, number, number],
    direction?: [number, number, number]
  ): KernelShape {
    return _makeTorus(this.bk, majorRadius, minorRadius, center, direction);
  }

  makeEllipsoid(aLength: number, bLength: number, cLength: number): KernelShape {
    return _makeEllipsoid(this.bk, aLength, bLength, cLength);
  }

  makeLineEdge(p1: [number, number, number], p2: [number, number, number]): KernelShape {
    return _makeLineEdge(this.bk, p1, p2);
  }

  makeCircleEdge(
    center: [number, number, number],
    normal: [number, number, number],
    radius: number
  ): KernelShape {
    return _makeCircleEdge(this.bk, center, normal, radius);
  }

  makeCircleArc(
    center: [number, number, number],
    normal: [number, number, number],
    radius: number,
    startAngle: number,
    endAngle: number
  ): KernelShape {
    return _makeCircleArc(this.bk, center, normal, radius, startAngle, endAngle);
  }

  makeArcEdge(
    p1: [number, number, number],
    p2: [number, number, number],
    p3: [number, number, number]
  ): KernelShape {
    return _makeArcEdge(this.bk, p1, p2, p3);
  }

  makeEllipseEdge(
    center: [number, number, number],
    normal: [number, number, number],
    majorRadius: number,
    minorRadius: number,
    xDir?: [number, number, number]
  ): KernelShape {
    return _makeEllipseEdge(this.bk, center, normal, majorRadius, minorRadius, xDir);
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
      this.bk,
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
    return _makeBezierEdge(this.bk, points);
  }

  makeTangentArc(
    startPoint: [number, number, number],
    startTangent: [number, number, number],
    endPoint: [number, number, number]
  ): KernelShape {
    return _makeTangentArc(this.bk, startPoint, startTangent, endPoint);
  }

  makeHelixWire(
    pitch: number,
    height: number,
    radius: number,
    center?: [number, number, number],
    _direction?: [number, number, number],
    leftHanded?: boolean
  ): KernelShape {
    return _makeHelixWire(this.bk, pitch, height, radius, center, _direction, leftHanded);
  }

  makeWireFromMixed(items: KernelShape[]): KernelShape {
    return _makeWireFromMixed(this.bk, items);
  }

  makeCompound(shapes: KernelShape[]): KernelShape {
    return _makeCompound(this.bk, shapes);
  }

  makeBoxFromCorners(p1: [number, number, number], p2: [number, number, number]): KernelShape {
    return _makeBoxFromCorners(this.bk, p1, p2);
  }

  solidFromShell(shell: KernelShape): KernelShape {
    return _solidFromShell(this.bk, shell);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Extrusion / sweep / loft / revolution
  // ═══════════════════════════════════════════════════════════════════════

  extrude(face: KernelShape, direction: [number, number, number], length: number): KernelShape {
    return _extrude(this.bk, face, direction, length);
  }

  revolve(shape: KernelShape, axis: KernelType, angle: number): KernelShape {
    return _revolve(this.bk, shape, axis, angle);
  }

  revolveVec(
    shape: KernelShape,
    center: [number, number, number],
    direction: [number, number, number],
    angle: number
  ): KernelShape {
    return _revolveVec(this.bk, shape, center, direction, angle);
  }

  loft(
    wires: KernelShape[],
    _ruled?: boolean,
    _startShape?: KernelShape,
    _endShape?: KernelShape
  ): KernelShape {
    return _loft(this.bk, wires, _ruled, _startShape, _endShape);
  }

  sweep(wire: KernelShape, spine: KernelShape, options?: { transitionMode?: number }): KernelShape {
    return _sweep(this.bk, wire, spine, options);
  }

  simplePipe(profile: KernelShape, spine: KernelShape): KernelShape {
    return _simplePipe(this.bk, profile, spine);
  }

  helicalSweep(
    profile: KernelShape,
    axisOrigin: [number, number, number],
    axisDirection: [number, number, number],
    radius: number,
    pitch: number,
    turns: number
  ): KernelShape {
    return _helicalSweep(this.bk, profile, axisOrigin, axisDirection, radius, pitch, turns);
  }

  sweepWithOptions(
    profile: KernelShape,
    pathEdge: KernelShape,
    contactMode: string,
    scaleValues: number[],
    segments: number
  ): KernelShape {
    return _sweepWithOptions(this.bk, profile, pathEdge, contactMode, scaleValues, segments);
  }

  sweepPipeShell(
    profile: KernelShape,
    spine: KernelShape,
    options?: Record<string, unknown>
  ): KernelShape | { shape: KernelShape; firstShape: KernelShape; lastShape: KernelShape } {
    return _sweepPipeShell(this.bk, profile, spine, options);
  }

  loftAdvanced(
    wires: KernelShape[],
    options?: {
      solid?: boolean;
      ruled?: boolean;
      startVertex?: KernelShape;
      endVertex?: KernelShape;
      tolerance?: number;
    }
  ): KernelShape {
    return _loftAdvanced(this.bk, wires, options);
  }

  buildExtrusionLaw(profile: 'linear' | 's-curve', length: number, endFactor: number): KernelType {
    return _buildExtrusionLaw(this.bk, profile, length, endFactor);
  }

  draftPrism(
    shape: KernelShape,
    face: KernelShape,
    _baseFace: KernelShape,
    height: number | null,
    _angleDeg: number,
    fuse: boolean
  ): KernelShape {
    return _draftPrism(this.bk, shape, face, _baseFace, height, _angleDeg, fuse);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Modification
  // ═══════════════════════════════════════════════════════════════════════

  fillet(
    shape: KernelShape,
    edges: KernelShape[],
    radius: number | [number, number] | ((edge: KernelShape) => number | [number, number])
  ): KernelShape {
    return _fillet(this.bk, shape, edges, radius);
  }

  chamfer(
    shape: KernelShape,
    edges: KernelShape[],
    distance: number | [number, number] | ((edge: KernelShape) => number | [number, number])
  ): KernelShape {
    return _chamfer(this.bk, shape, edges, distance);
  }

  chamferDistAngle(
    shape: KernelShape,
    edges: KernelShape[],
    distance: number,
    angleDeg: number
  ): KernelShape {
    return _chamferDistAngle(this.bk, shape, edges, distance, angleDeg);
  }

  shell(
    shape: KernelShape,
    faces: KernelShape[],
    thickness: number,
    tolerance?: number
  ): KernelShape {
    return _shell(this.bk, shape, faces, thickness, tolerance);
  }

  thicken(shape: KernelShape, thickness: number): KernelShape {
    return _thicken(this.bk, shape, thickness);
  }

  offset(shape: KernelShape, distance: number, tolerance?: number): KernelShape {
    return _offset(this.bk, shape, distance, tolerance);
  }

  filletVariable(shape: KernelShape, spec: string): KernelShape {
    return _filletVariable(this.bk, shape, spec);
  }

  draft(
    shape: KernelShape,
    faces: KernelShape[],
    pullDirection: [number, number, number],
    neutralPlane: [number, number, number],
    angleDeg: number | ((face: KernelShape) => number)
  ): KernelShape {
    return _draft(
      this.bk,
      shape,
      faces,
      pullDirection,
      neutralPlane,
      resolveUniformAngle(faces, angleDeg)
    );
  }

  defeature(shape: KernelShape, faces: KernelShape[]): KernelShape {
    return _defeature(this.bk, shape, faces);
  }

  simplify(shape: KernelShape): KernelShape {
    return _simplify(this.bk, shape);
  }

  reverseShape(shape: KernelShape): KernelShape {
    return _reverseShape(this.bk, shape);
  }

  offsetWire2D(
    wire: KernelShape,
    offset: number,
    _joinType?: number | 'arc' | 'intersection' | 'tangent'
  ): KernelShape {
    return _offsetWire2D(this.bk, wire, offset, _joinType);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Transforms
  // ═══════════════════════════════════════════════════════════════════════

  transform(shape: KernelShape, trsf: KernelType): KernelShape {
    return _transform(this.bk, shape, trsf);
  }

  translate(shape: KernelShape, x: number, y: number, z: number): KernelShape {
    return _translate(this.bk, shape, x, y, z);
  }

  rotate(
    shape: KernelShape,
    angle: number,
    axis?: readonly [number, number, number],
    center?: readonly [number, number, number]
  ): KernelShape {
    return _rotate(this.bk, shape, angle, axis, center);
  }

  mirror(
    shape: KernelShape,
    origin: readonly [number, number, number],
    normal: readonly [number, number, number]
  ): KernelShape {
    return _mirror(this.bk, shape, origin, normal);
  }

  scale(
    shape: KernelShape,
    center: readonly [number, number, number],
    factor: number
  ): KernelShape {
    return _scale(this.bk, shape, center, factor);
  }

  transformBatch(entries: TransformEntry[]): KernelShape[] {
    return entries.map((e) => {
      switch (e.type) {
        case 'translate':
          return this.translate(e.shape, e.x, e.y, e.z);
        case 'rotate':
          return this.rotate(e.shape, e.angle, [...e.axis], [...e.center]);
        case 'scale':
          return this.scale(e.shape, [...e.center], e.factor);
        case 'mirror':
          return this.mirror(e.shape, [...e.origin], [...e.normal]);
      }
    });
  }

  generalTransform(
    shape: KernelShape,
    linear: readonly [number, number, number, number, number, number, number, number, number],
    translation: readonly [number, number, number],
    _isOrthogonal: boolean
  ): KernelShape {
    return _generalTransform(this.bk, shape, linear, translation, _isOrthogonal);
  }

  generalTransformNonOrthogonal(
    shape: KernelShape,
    linear: readonly [number, number, number, number, number, number, number, number, number],
    translation: readonly [number, number, number]
  ): KernelShape {
    return _generalTransformNonOrthogonal(this.bk, shape, linear, translation);
  }

  positionOnCurve(shape: KernelShape, spine: KernelShape, param: number): KernelShape {
    return _positionOnCurve(this.bk, shape, spine, param);
  }

  linearPattern(
    shape: KernelShape,
    direction: [number, number, number],
    spacing: number,
    count: number
  ): KernelShape[] {
    return _linearPattern(this.bk, shape, direction, spacing, count);
  }

  circularPattern(
    shape: KernelShape,
    center: [number, number, number],
    axis: [number, number, number],
    angleStep: number,
    count: number
  ): KernelShape[] {
    return _circularPattern(this.bk, shape, center, axis, angleStep, count);
  }

  gridPattern(
    shape: KernelShape,
    directionX: [number, number, number],
    directionY: [number, number, number],
    spacingX: number,
    spacingY: number,
    countX: number,
    countY: number
  ): KernelShape {
    return _gridPattern(this.bk, shape, directionX, directionY, spacingX, spacingY, countX, countY);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Operations with shape evolution tracking
  // ═══════════════════════════════════════════════════════════════════════

  translateWithHistory(
    shape: KernelShape,
    x: number,
    y: number,
    z: number,
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult {
    return _translateWithHistory(this.bk, shape, x, y, z, inputFaceHashes, hashUpperBound);
  }

  rotateWithHistory(
    shape: KernelShape,
    angle: number,
    inputFaceHashes: number[],
    hashUpperBound: number,
    axis?: readonly [number, number, number],
    center?: readonly [number, number, number]
  ): OperationResult {
    return _rotateWithHistory(this.bk, shape, angle, inputFaceHashes, hashUpperBound, axis, center);
  }

  mirrorWithHistory(
    shape: KernelShape,
    origin: readonly [number, number, number],
    normal: readonly [number, number, number],
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult {
    return _mirrorWithHistory(this.bk, shape, origin, normal, inputFaceHashes, hashUpperBound);
  }

  scaleWithHistory(
    shape: KernelShape,
    center: readonly [number, number, number],
    factor: number,
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult {
    return _scaleWithHistory(this.bk, shape, center, factor, inputFaceHashes, hashUpperBound);
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
      this.bk,
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
    return _fuseWithHistory(this.bk, shape, tool, inputFaceHashes, hashUpperBound, options);
  }

  cutWithHistory(
    shape: KernelShape,
    tool: KernelShape,
    inputFaceHashes: number[],
    hashUpperBound: number,
    options?: BooleanOptions
  ): DiagnosticOperationResult {
    return _cutWithHistory(this.bk, shape, tool, inputFaceHashes, hashUpperBound, options);
  }

  intersectWithHistory(
    shape: KernelShape,
    tool: KernelShape,
    inputFaceHashes: number[],
    hashUpperBound: number,
    options?: BooleanOptions
  ): DiagnosticOperationResult {
    return _intersectWithHistory(this.bk, shape, tool, inputFaceHashes, hashUpperBound, options);
  }

  filletWithHistory(
    shape: KernelShape,
    edges: KernelShape[],
    radius: number | [number, number] | ((edge: KernelShape) => number | [number, number]),
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult {
    return _filletWithHistory(this.bk, shape, edges, radius, inputFaceHashes, hashUpperBound);
  }

  chamferWithHistory(
    shape: KernelShape,
    edges: KernelShape[],
    distance: number | [number, number] | ((edge: KernelShape) => number | [number, number]),
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult {
    return _chamferWithHistory(this.bk, shape, edges, distance, inputFaceHashes, hashUpperBound);
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
      this.bk,
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
    return _thickenWithHistory(this.bk, shape, thickness, inputFaceHashes, hashUpperBound);
  }

  offsetWithHistory(
    shape: KernelShape,
    distance: number,
    inputFaceHashes: number[],
    hashUpperBound: number,
    tolerance?: number
  ): OperationResult {
    return _offsetWithHistory(this.bk, shape, distance, inputFaceHashes, hashUpperBound, tolerance);
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
      this.bk,
      shape,
      faces,
      pullDirection,
      neutralPlane,
      resolveUniformAngle(faces, angleDeg),
      inputFaceHashes,
      hashUpperBound
    );
  }

  applyComposedTransformWithHistory(
    shape: KernelShape,
    transformHandle: KernelType,
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult {
    return _applyComposedTransformWithHistory(
      this.bk,
      shape,
      transformHandle,
      inputFaceHashes,
      hashUpperBound
    );
  }

  composeTransform(
    ops: Array<
      | { type: 'translate'; x: number; y: number; z: number }
      | {
          type: 'rotate';
          angle: number;
          axis?: readonly [number, number, number];
          center?: readonly [number, number, number];
        }
    >
  ): { handle: KernelType; dispose: () => void } {
    return _composeTransform(this.bk, ops);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Meshing
  // ═══════════════════════════════════════════════════════════════════════

  mesh(shape: KernelShape, options: MeshOptions): KernelMeshResult {
    return _mesh(this.bk, shape, options);
  }

  meshEdges(shape: KernelShape, tolerance: number, angularTolerance: number): KernelEdgeMeshResult {
    return _meshEdges(this.bk, shape, tolerance, angularTolerance);
  }

  hasTriangulation(_shape: KernelShape): boolean {
    return _hasTriangulation(this.bk, _shape);
  }

  meshShape(_shape: KernelShape, _tolerance: number, _angularTolerance: number): void {
    _meshShape(this.bk, _shape, _tolerance, _angularTolerance);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // File I/O
  // ═══════════════════════════════════════════════════════════════════════

  exportSTEP(shapes: KernelShape[]): string {
    return _exportSTEP(this.bk, shapes);
  }

  exportSTL(shape: KernelShape, binary?: boolean): string | ArrayBuffer {
    return _exportSTL(this.bk, shape, binary);
  }

  importSTEP(data: string | ArrayBuffer): KernelShape[] {
    return _importSTEP(this.bk, data);
  }

  importSTL(data: string | ArrayBuffer): KernelShape {
    return _importSTL(this.bk, data);
  }

  exportIGES(shapes: KernelShape[]): string {
    return _exportIGES(this.bk, shapes);
  }

  importIGES(data: string | ArrayBuffer): KernelShape[] {
    return _importIGES(this.bk, data);
  }

  exportSTEPAssembly(parts: StepAssemblyPart[], _options?: { unit?: string }): string {
    return _exportSTEPAssembly(this.bk, parts, _options);
  }

  export3MF(shape: KernelShape, tolerance: number): ArrayBuffer {
    return _export3MF(this.bk, shape, tolerance);
  }

  exportGLB(shape: KernelShape, tolerance: number): ArrayBuffer {
    return _exportGLB(this.bk, shape, tolerance);
  }

  exportOBJ(shape: KernelShape, tolerance: number): ArrayBuffer {
    return _exportOBJ(this.bk, shape, tolerance);
  }

  exportPLY(shape: KernelShape, tolerance: number): ArrayBuffer {
    return _exportPLY(this.bk, shape, tolerance);
  }

  import3MF(data: ArrayBuffer): KernelShape[] {
    return _import3MF(this.bk, data);
  }

  importOBJ(data: ArrayBuffer): KernelShape {
    return _importOBJ(this.bk, data);
  }

  importGLB(data: ArrayBuffer): KernelShape {
    return _importGLB(this.bk, data);
  }

  toBREP(shape: KernelShape): string {
    return _toBREP(this.bk, shape);
  }

  fromBREP(data: string): KernelShape {
    return _fromBREP(this.bk, data);
  }

  createXCAFDocument(
    shapes: Array<{ shape: KernelShape; name: string; color?: [number, number, number, number] }>
  ): KernelType {
    return _createXCAFDocument(this.bk, shapes);
  }

  writeXCAFToSTEP(doc: KernelType, _options?: { unit?: string; modelUnit?: string }): string {
    return _writeXCAFToSTEP(this.bk, doc, _options);
  }

  exportSTEPConfigured(
    shapes: Array<{ shape: KernelShape; name?: string; color?: [number, number, number, number] }>,
    _options?: { unit?: string; modelUnit?: string; schema?: number }
  ): string {
    return _exportSTEPConfigured(this.bk, shapes, _options);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Measurement
  // ═══════════════════════════════════════════════════════════════════════

  volume(shape: KernelShape): number {
    return _volume(this.bk, shape);
  }

  area(shape: KernelShape): number {
    return _area(this.bk, shape);
  }

  length(shape: KernelShape): number {
    return _length(this.bk, shape);
  }

  centerOfMass(shape: KernelShape): [number, number, number] {
    return _centerOfMass(this.bk, shape);
  }

  linearCenterOfMass(shape: KernelShape): [number, number, number] {
    return _linearCenterOfMass(this.bk, shape);
  }

  boundingBox(shape: KernelShape): {
    min: [number, number, number];
    max: [number, number, number];
  } {
    return _boundingBox(this.bk, shape);
  }

  measureBulk(shape: KernelShape, includeLinear = false): BulkMeasurement {
    const h = shape as { type: ShapeType };
    // brepkit length() throws for non-linear shapes; guard to edge/wire/face.
    // OCCT LinearProperties returns edge-length sum even for solids — intentional divergence.
    const canMeasureLength = h.type === 'edge' || h.type === 'wire' || h.type === 'face';
    return {
      volume: this.volume(shape),
      area: this.area(shape),
      length: includeLinear && canMeasureLength ? this.length(shape) : 0,
      centerOfMass: this.centerOfMass(shape),
      boundingBox: this.boundingBox(shape),
    };
  }

  distance(shape1: KernelShape, shape2: KernelShape): DistanceResult {
    return _distance(this.bk, shape1, shape2);
  }

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
    return _surfaceCurvature(this.bk, face, u, v);
  }

  surfaceCenterOfMass(face: KernelShape): [number, number, number] {
    return _surfaceCenterOfMass(this.bk, face);
  }

  createDistanceQuery(referenceShape: KernelShape): {
    distanceTo(shape: KernelShape): {
      value: number;
      point1: [number, number, number];
      point2: [number, number, number];
    };
    dispose(): void;
  } {
    return _createDistanceQuery(this.bk, referenceShape);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Topology introspection
  // ═══════════════════════════════════════════════════════════════════════

  iterShapes(shape: KernelShape, type: ShapeType): KernelShape[] {
    return _iterShapes(this.bk, shape, type);
  }

  iterShapeList(list: KernelShape, callback: (item: KernelShape) => void): void {
    _iterShapeList(this.bk, list, callback);
  }

  shapeType(shape: KernelShape): ShapeType {
    return _shapeType(this.bk, shape);
  }

  isSame(a: KernelShape, b: KernelShape): boolean {
    return _isSame(this.bk, a, b);
  }

  isEqual(a: KernelShape, b: KernelShape): boolean {
    return _isEqual(this.bk, a, b);
  }

  downcast(shape: KernelShape, _type?: ShapeType): KernelShape {
    return _downcast(this.bk, shape, _type);
  }

  hashCode(shape: KernelShape, upperBound: number): number {
    return _hashCode(this.bk, shape, upperBound);
  }

  isNull(shape: KernelShape): boolean {
    return _isNull(this.bk, shape);
  }

  shapeOrientation(shape: KernelShape): ShapeOrientation {
    return _shapeOrientation(this.bk, shape);
  }

  edgeToFaceMap(shape: KernelShape): string {
    return _edgeToFaceMap(this.bk, shape);
  }

  sharedEdges(faceA: KernelShape, faceB: KernelShape): KernelShape[] {
    return _sharedEdges(this.bk, faceA, faceB);
  }

  adjacentFaces(shape: KernelShape, face: KernelShape): KernelShape[] {
    return _adjacentFaces(this.bk, shape, face);
  }

  sew(shapes: KernelShape[], tolerance?: number): KernelShape {
    return _sew(this.bk, shapes, tolerance);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Geometry queries
  // ═══════════════════════════════════════════════════════════════════════

  vertexPosition(vertex: KernelShape): [number, number, number] {
    return _vertexPosition(this.bk, vertex);
  }

  surfaceType(face: KernelShape): SurfaceType {
    return _surfaceType(this.bk, face);
  }

  uvBounds(face: KernelShape): { uMin: number; uMax: number; vMin: number; vMax: number } {
    return _uvBounds(this.bk, face);
  }

  outerWire(face: KernelShape): KernelShape {
    return _outerWire(this.bk, face);
  }

  surfaceNormal(face: KernelShape, u: number, v: number): [number, number, number] {
    return _surfaceNormal(this.bk, face, u, v);
  }

  pointOnSurface(face: KernelShape, u: number, v: number): [number, number, number] {
    return _pointOnSurface(this.bk, face, u, v);
  }

  uvFromPoint(face: KernelShape, point: [number, number, number]): [number, number] | null {
    return _uvFromPoint(this.bk, face, point);
  }

  projectPointOnFace(face: KernelShape, point: [number, number, number]): [number, number, number] {
    return _projectPointOnFace(this.bk, face, point);
  }

  curveTangent(
    shape: KernelShape,
    param: number
  ): { point: [number, number, number]; tangent: [number, number, number] } {
    return _curveTangent(this.bk, shape, param);
  }

  curveParameters(shape: KernelShape): [number, number] {
    return _curveParameters(this.bk, shape);
  }

  curvePointAtParam(shape: KernelShape, param: number): [number, number, number] {
    return _curvePointAtParam(this.bk, shape, param);
  }

  curveIsClosed(shape: KernelShape): boolean {
    return _curveIsClosed(this.bk, shape);
  }

  curveIsPeriodic(shape: KernelShape): boolean {
    return _curveIsPeriodic(this.bk, shape);
  }

  curvePeriod(shape: KernelShape): number {
    return _curvePeriod(this.bk, shape);
  }

  curveType(shape: KernelShape): string {
    return _curveType(this.bk, shape);
  }

  curveDegreeElevate(edge: KernelShape, elevateBy: number): KernelShape {
    return _curveDegreeElevate(this.bk, edge, elevateBy);
  }

  curveKnotInsert(edge: KernelShape, knot: number, times: number): KernelShape {
    return _curveKnotInsert(this.bk, edge, knot, times);
  }

  curveKnotRemove(edge: KernelShape, knot: number, tolerance: number): KernelShape {
    return _curveKnotRemove(this.bk, edge, knot, tolerance);
  }

  curveSplit(edge: KernelShape, param: number): [KernelShape, KernelShape] {
    return _curveSplit(this.bk, edge, param);
  }

  approximateSurfaceLspia(
    coords: number[],
    rows: number,
    cols: number,
    degreeU: number,
    degreeV: number,
    numCpsU: number,
    numCpsV: number,
    tolerance: number,
    maxIterations: number
  ): KernelShape {
    return _approximateSurfaceLspia(
      this.bk,
      coords,
      rows,
      cols,
      degreeU,
      degreeV,
      numCpsU,
      numCpsV,
      tolerance,
      maxIterations
    );
  }

  untrimFace(face: KernelShape, samplesPerCurve: number, interiorSamples: number): KernelShape {
    return _untrimFace(this.bk, face, samplesPerCurve, interiorSamples);
  }

  createCurveAdaptor(shape: KernelShape): KernelType {
    return _createCurveAdaptor(this.bk, shape);
  }

  getBezierPenultimatePole(edge: KernelShape): [number, number, number] | null {
    return _getBezierPenultimatePole(this.bk, edge);
  }

  getSurfaceCylinderData(surface: KernelType): { radius: number; isDirect: boolean } | null {
    return _getSurfaceCylinderData(this.bk, surface);
  }

  reverseSurfaceU(surface: KernelType): KernelType {
    return _reverseSurfaceU(this.bk, surface);
  }

  classifyPointOnFace(
    face: KernelShape,
    u: number,
    v: number,
    tolerance?: number
  ): 'in' | 'on' | 'out' {
    return _classifyPointOnFace(this.bk, face, u, v, tolerance);
  }

  classifyPointRobust(
    shape: KernelShape,
    point: [number, number, number],
    tolerance: number
  ): string {
    return _classifyPointRobust(this.bk, shape, point, tolerance);
  }

  classifyPointWinding(
    shape: KernelShape,
    point: [number, number, number],
    tolerance: number
  ): string {
    return _classifyPointWinding(this.bk, shape, point, tolerance);
  }

  detectSmallFeatures(shape: KernelShape, areaThreshold: number, tolerance: number): KernelShape[] {
    return _detectSmallFeatures(this.bk, shape, areaThreshold, tolerance);
  }

  recognizeFeatures(shape: KernelShape, tolerance: number): string {
    return _recognizeFeatures(this.bk, shape, tolerance);
  }

  projectEdges(
    shape: KernelShape,
    _cameraOrigin: [number, number, number],
    _cameraDirection: [number, number, number],
    _cameraXAxis?: [number, number, number]
  ): {
    visible: { outline: KernelShape; smooth: KernelShape; sharp: KernelShape };
    hidden: { outline: KernelShape; smooth: KernelShape; sharp: KernelShape };
  } {
    return _projectEdges(this.bk, shape, _cameraOrigin, _cameraDirection, _cameraXAxis);
  }

  getNurbsCurveData(_edge: KernelShape): NurbsCurveData | null {
    return null; // NURBS introspection not supported by brepkit
  }

  getNurbsSurfaceData(_face: KernelShape): NurbsSurfaceData | null {
    return null; // NURBS introspection not supported by brepkit
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Validation / repair
  // ═══════════════════════════════════════════════════════════════════════

  isValid(shape: KernelShape): boolean {
    return _isValid(this.bk, shape);
  }

  isValidStrict(shape: KernelShape): boolean {
    return _isValidStrict(this.bk, shape);
  }

  healSolid(shape: KernelShape): KernelShape | null {
    return _healSolid(this.bk, shape);
  }

  healFace(shape: KernelShape): KernelShape {
    return _healFace(this.bk, shape);
  }

  healWire(wire: KernelShape, _face?: KernelShape): KernelShape {
    return _healWire(this.bk, wire, _face);
  }

  fixShape(shape: KernelShape): KernelShape {
    return _fixShape(this.bk, shape);
  }

  fixSelfIntersection(wire: KernelShape): KernelShape {
    return _fixSelfIntersection(this.bk, wire);
  }

  mergeCoincidentVertices(shape: KernelShape, tolerance: number): number {
    return _mergeCoincidentVertices(this.bk, shape, tolerance);
  }

  removeDegenerateEdges(shape: KernelShape, tolerance: number): number {
    return _removeDegenerateEdges(this.bk, shape, tolerance);
  }

  fixFaceOrientations(shape: KernelShape): number {
    return _fixFaceOrientations(this.bk, shape);
  }

  validationDetails(shape: KernelShape): string | null {
    return _validationDetails(this.bk, shape);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Surface construction
  // ═══════════════════════════════════════════════════════════════════════

  makeNonPlanarFace(wire: KernelShape): KernelShape {
    return _makeNonPlanarFace(this.bk, wire);
  }

  addHolesInFace(face: KernelShape, holeWires: KernelShape[]): KernelShape {
    return _addHolesInFace(this.bk, face, holeWires);
  }

  removeHolesFromFace(face: KernelShape): KernelShape {
    return _removeHolesFromFace(this.bk, face);
  }

  makeFaceOnSurface(_surface: KernelType, wire: KernelShape): KernelShape {
    return _makeFaceOnSurface(this.bk, _surface, wire);
  }

  bsplineSurface(points: [number, number, number][], rows: number, cols: number): KernelShape {
    return _bsplineSurface(this.bk, points, rows, cols);
  }

  triangulatedSurface(points: [number, number, number][], rows: number, cols: number): KernelShape {
    return _triangulatedSurface(this.bk, points, rows, cols);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Mesh sewing -> solid
  // ═══════════════════════════════════════════════════════════════════════

  buildTriFace(
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number]
  ): KernelShape | null {
    return _buildTriFace(this.bk, a, b, c);
  }

  sewAndSolidify(faces: KernelShape[], tolerance: number): KernelShape {
    return _sewAndSolidify(this.bk, faces, tolerance);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Curve construction
  // ═══════════════════════════════════════════════════════════════════════

  interpolatePoints(
    points: [number, number, number][],
    options?: { periodic?: boolean; tolerance?: number }
  ): KernelShape {
    return _interpolatePoints(this.bk, points, options);
  }

  approximatePoints(
    points: [number, number, number][],
    options?: {
      tolerance?: number;
      degMin?: number;
      degMax?: number;
      smoothing?: [number, number, number] | null;
    }
  ): KernelShape {
    return _approximatePoints(this.bk, points, options);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 3D geometry primitive factories
  // ═══════════════════════════════════════════════════════════════════════

  createPoint3d(x: number, y: number, z: number): KernelType {
    return _createPoint3d(this.bk, x, y, z);
  }

  createDirection3d(x: number, y: number, z: number): KernelType {
    return _createDirection3d(this.bk, x, y, z);
  }

  createVector3d(x: number, y: number, z: number): KernelType {
    return _createVector3d(this.bk, x, y, z);
  }

  createAxis1(cx: number, cy: number, cz: number, dx: number, dy: number, dz: number): KernelType {
    return _createAxis1(this.bk, cx, cy, cz, dx, dy, dz);
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
    return _createAxis2(this.bk, ox, oy, oz, zx, zy, zz, xx, xy, xz);
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
    return _createAxis3(this.bk, ox, oy, oz, zx, zy, zz, xx, xy, xz);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Mesh boolean
  // ═══════════════════════════════════════════════════════════════════════

  meshBoolean(
    positionsA: number[],
    indicesA: number[],
    positionsB: number[],
    indicesB: number[],
    op: string,
    tolerance: number
  ): KernelMeshResult {
    return _meshBoolean(this.bk, positionsA, indicesA, positionsB, indicesB, op, tolerance);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Constraint sketch solver (brepkit-only capability)
  // ═══════════════════════════════════════════════════════════════════════

  sketchNew(): number {
    return _sketchNew(this.bk);
  }

  sketchAddPoint(sketch: number, x: number, y: number, fixed: boolean): number {
    return _sketchAddPoint(this.bk, sketch, x, y, fixed);
  }

  sketchAddArc(sketch: number, centerIdx: number, startIdx: number, endIdx: number): number {
    return _sketchAddArc(this.bk, sketch, centerIdx, startIdx, endIdx);
  }

  sketchAddConstraint(sketch: number, constraintJson: string): void {
    _sketchAddConstraint(this.bk, sketch, constraintJson);
  }

  sketchSolve(sketch: number, maxIterations: number, tolerance: number): string {
    return _sketchSolve(this.bk, sketch, maxIterations, tolerance);
  }

  sketchDof(sketch: number): string {
    return _sketchDof(this.bk, sketch);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Dispose / checkpointing
  // ═══════════════════════════════════════════════════════════════════════

  checkpoint(): number {
    return this.bk.checkpoint();
  }

  checkpointCount(): number {
    return this.bk.checkpointCount();
  }

  restoreCheckpoint(cp: number): void {
    this.bk.restore(cp);
  }

  discardCheckpoint(cp: number): void {
    this.bk.discardCheckpoint(cp);
  }

  dispose(_handle: { delete(): void }): void {
    // Arena-based: individual handles are not freed.
    // Call brepkitKernel.free() to release the entire arena.
  }

  executeBatch(json: string): string {
    return this.bk.executeBatch(json);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Kernel2DCapability — delegates to kernel2dOps.ts
  // ═══════════════════════════════════════════════════════════════════════

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
  wrapCurve2dHandle(handle: KernelType): Curve2dHandle {
    return _wrapCurve2dHandle(handle);
  }
  createCurve2dAdaptor(handle: Curve2dHandle): KernelType {
    return _createCurve2dAdaptor(handle);
  }

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
    sx: number,
    sy: number,
    tx: number,
    ty: number,
    ex: number,
    ey: number
  ): Curve2dHandle {
    return _makeArc2dTangent(sx, sy, tx, ty, ex, ey);
  }
  makeEllipse2d(
    cx: number,
    cy: number,
    major: number,
    minor: number,
    xDirX?: number,
    xDirY?: number,
    sense?: boolean
  ): Curve2dHandle {
    return _makeEllipse2d(cx, cy, major, minor, xDirX, xDirY, sense);
  }
  makeEllipseArc2d(
    cx: number,
    cy: number,
    major: number,
    minor: number,
    start: number,
    end: number,
    xDirX?: number,
    xDirY?: number,
    sense?: boolean
  ): Curve2dHandle {
    return _makeEllipseArc2d(cx, cy, major, minor, start, end, xDirX, xDirY, sense);
  }
  makeBezier2d(points: [number, number][]): Curve2dHandle {
    return _makeBezier2d(points);
  }
  makeBSpline2d(points: [number, number][], _options?: Record<string, unknown>): Curve2dHandle {
    return _makeBSpline2d(points, _options);
  }

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

  trimCurve2d(curve: Curve2dHandle, start: number, end: number): Curve2dHandle {
    return _trimCurve2d(curve, start, end);
  }
  reverseCurve2d(_curve: Curve2dHandle): void {
    _reverseCurve2d(_curve);
  }
  copyCurve2d(curve: Curve2dHandle): Curve2dHandle {
    return _copyCurve2d(curve);
  }
  offsetCurve2d(curve: Curve2dHandle, offset: number): Curve2dHandle {
    return _offsetCurve2d(curve, offset);
  }

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
    ox: number,
    oy: number,
    dx: number,
    dy: number
  ): Curve2dHandle {
    return _mirrorCurve2dAcrossAxis(curve, ox, oy, dx, dy);
  }
  affinityTransform2d(
    curve: Curve2dHandle,
    ox: number,
    oy: number,
    dx: number,
    dy: number,
    ratio: number
  ): Curve2dHandle {
    return _affinityTransform2d(curve, ox, oy, dx, dy, ratio);
  }

  createIdentityGTrsf2d(): KernelType {
    return _createIdentityGTrsf2d();
  }
  createAffinityGTrsf2d(ox: number, oy: number, dx: number, dy: number, ratio: number): KernelType {
    return _createAffinityGTrsf2d(ox, oy, dx, dy, ratio);
  }
  createTranslationGTrsf2d(dx: number, dy: number): KernelType {
    return _createTranslationGTrsf2d(dx, dy);
  }
  createMirrorGTrsf2d(
    cx: number,
    cy: number,
    mode: 'point' | 'axis',
    ox?: number,
    oy?: number,
    dx?: number,
    dy?: number
  ): KernelType {
    return _createMirrorGTrsf2d(cx, cy, mode, ox, oy, dx, dy);
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
    p1s: number,
    p1e: number,
    p2s: number,
    p2e: number
  ): number {
    return _distanceBetweenCurves2d(c1, c2, p1s, p1e, p2s, p2e);
  }

  approximateCurve2dAsBSpline(
    curve: Curve2dHandle,
    tol: number,
    cont: 'C0' | 'C1' | 'C2' | 'C3',
    maxSeg: number
  ): Curve2dHandle {
    return _approximateCurve2dAsBSpline(curve, tol, cont, maxSeg);
  }
  decomposeBSpline2dToBeziers(curve: Curve2dHandle): Curve2dHandle[] {
    return _decomposeBSpline2dToBeziers(curve);
  }

  createBoundingBox2d(): BBox2dHandle {
    return _createBoundingBox2d();
  }
  addCurveToBBox2d(bbox: BBox2dHandle, curve: Curve2dHandle, tol: number): void {
    _addCurveToBBox2d(bbox, curve, tol);
  }
  getBBox2dBounds(bbox: BBox2dHandle): { xMin: number; yMin: number; xMax: number; yMax: number } {
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

  getCurve2dCircleData(
    curve: Curve2dHandle
  ): { cx: number; cy: number; radius: number; isDirect: boolean } | null {
    return _getCurve2dCircleData(curve);
  }
  getCurve2dEllipseData(
    curve: Curve2dHandle
  ): { majorRadius: number; minorRadius: number; xAxisAngle: number; isDirect: boolean } | null {
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

  serializeCurve2d(curve: Curve2dHandle): string {
    return _serializeCurve2d(curve);
  }
  deserializeCurve2d(data: string): Curve2dHandle {
    return _deserializeCurve2d(data);
  }

  splitCurve2d(curve: Curve2dHandle, params: number[]): Curve2dHandle[] {
    return _splitCurve2d(curve, params);
  }

  liftCurve2dToPlane(
    curve: Curve2dHandle,
    origin: [number, number, number],
    planeZ: [number, number, number],
    planeX: [number, number, number]
  ): KernelShape {
    return _liftCurve2dToPlane(this.bk, curve, origin, planeZ, planeX);
  }
  buildEdgeOnSurface(curve: Curve2dHandle, surface: KernelType): KernelShape {
    return _buildEdgeOnSurface(this.bk, curve, surface);
  }
  extractSurfaceFromFace(face: KernelShape): KernelType {
    return _extractSurfaceFromFace(face);
  }
  extractCurve2dFromEdge(edge: KernelShape, face: KernelShape): Curve2dHandle {
    return _extractCurve2dFromEdge(this.bk, edge, face);
  }
  buildCurves3d(_wire: KernelShape): void {
    _buildCurves3d(_wire);
  }
  fixWireOnFace(wire: KernelShape, _face: KernelShape, _tolerance: number): KernelShape {
    return _fixWireOnFace(wire, _face, _tolerance);
  }
  fillSurface(wires: KernelShape[], _options?: Record<string, unknown>): KernelShape {
    return _fillSurface(this.bk, wires, _options);
  }
}
