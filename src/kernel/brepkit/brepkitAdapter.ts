/* v8 ignore file -- brepkit WASM kernel not available in OCCT test suite */
/* eslint-disable @typescript-eslint/no-non-null-assertion -- remaining inline methods use WASM indices; will convert to per-line as methods are extracted to ops files */
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
import { syntheticCompounds } from './helpers.js';
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
// Handle types
// ---------------------------------------------------------------------------

/**
 * Typed wrapper around a brepkit u32 arena handle.
 *
 * brepjs passes these around as opaque `KernelShape`. The adapter extracts
 * the `.id` and `.type` when calling back into brepkit WASM.
 */
export interface BrepkitHandle {
  readonly __brepkit: true;
  readonly type: ShapeType;
  /** Raw u32 arena index. */
  readonly id: number;
  /** No-op — arena-based allocation doesn't free individual handles.
   *  Present for compatibility with OCCT's wasm-bindgen `.delete()` convention. */
  delete(): void;
  /** OCCT-compatible hash code derived from the arena handle id. */
  HashCode(upperBound: number): number;
  /** OCCT-compatible null check — brepkit handles are never null. */
  IsNull(): boolean;
}

/** Type guard: is this shape a brepkit handle? */
function isBrepkitHandle(shape: unknown): shape is BrepkitHandle {
  return (
    shape !== null &&
    shape !== undefined &&
    typeof shape === 'object' &&
    (shape as BrepkitHandle).__brepkit
  );
}

/** Shared no-op delete — one function instance for all handles. */
const noop = () => {};

function handle(type: ShapeType, id: number): BrepkitHandle {
  return {
    __brepkit: true,
    type,
    id,
    delete: noop,
    HashCode(upperBound: number) {
      return id % upperBound;
    },
    IsNull() {
      return false;
    },
  };
}

function solidHandle(id: number): BrepkitHandle {
  return handle('solid', id);
}
function faceHandle(id: number): BrepkitHandle {
  return handle('face', id);
}
function edgeHandle(id: number): BrepkitHandle {
  return handle('edge', id);
}
function wireHandle(id: number): BrepkitHandle {
  return handle('wire', id);
}
function shellHandle(id: number): BrepkitHandle {
  return handle('shell', id);
}
function compoundHandle(id: number): BrepkitHandle {
  const h = handle('compound', id);
  // Clean up JS-side synthetic compound storage on delete
  if (syntheticCompounds.has(id)) {
    return { ...h, delete: () => syntheticCompounds.delete(id) };
  }
  return h;
}
function vertexHandle(id: number): BrepkitHandle {
  return handle('vertex', id);
}

/** Extract the u32 id from a handle, with a type assertion. */
function unwrap(shape: KernelShape, expected?: ShapeType): number {
  if (!isBrepkitHandle(shape)) {
    throw new Error('brepkit: expected a BrepkitHandle, got ' + typeof shape);
  }
  if (expected && shape.type !== expected) {
    throw new Error(`brepkit: expected ${expected} handle, got ${shape.type}`);
  }
  return shape.id;
}

/** Convert a WASM Uint32Array of handles to a plain number[] for use with .map/.filter/.flatMap. */
function toArray(ids: Uint32Array): number[] {
  return Array.from(ids);
}

/** Unwrap a shape that must be a solid, with a descriptive error naming the method. */
function unwrapSolidOrThrow(shape: KernelShape, methodName: string): number {
  if (!isBrepkitHandle(shape)) {
    throw new Error('brepkit: expected a BrepkitHandle, got ' + typeof shape);
  }
  if (shape.type !== 'solid') {
    throw new Error(
      `brepkit: ${methodName} requires a solid, got ${shape.type}. ` +
        'Consider using makeCompound() to combine shapes first.'
    );
  }
  return shape.id;
}

/**
 * Extract solid ids from a shape. For solids, returns the id directly.
 * For compounds, attempts to extract child solids via getCompoundSolids.
 * Throws a descriptive error for other types.
 */
function unwrapSolidsForExport(
  bk: BrepkitKernel,
  shape: KernelShape,
  methodName: string
): number[] {
  if (!isBrepkitHandle(shape)) {
    throw new Error('brepkit: expected a BrepkitHandle, got ' + typeof shape);
  }
  if (shape.type === 'solid') {
    return [shape.id];
  }
  if (shape.type === 'compound') {
    const ids = toArray(bk.getCompoundSolids(shape.id));
    if (ids.length > 0) return ids;
    throw new Error(`brepkit: ${methodName} received a compound with no solids.`);
  }
  throw new Error(
    `brepkit: ${methodName} requires a solid or compound of solids, got ${shape.type}.`
  );
}

/** Euclidean distance between two 3D points. */
function dist3(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): number {
  const dx = x1 - x2,
    dy = y1 - y2,
    dz = z1 - z2;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Copy a WASM-backed Uint8Array into an independent ArrayBuffer. */
function copyWasmBytes(bytes: Uint8Array): ArrayBuffer {
  return (bytes.buffer as ArrayBuffer).slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

// ---------------------------------------------------------------------------
// Matrix helpers
// ---------------------------------------------------------------------------

/** Build a row-major 4×4 translation matrix. */
function translationMatrix(x: number, y: number, z: number): number[] {
  // prettier-ignore
  return [
    1, 0, 0, x,
    0, 1, 0, y,
    0, 0, 1, z,
    0, 0, 0, 1,
  ];
}

/** Build a row-major 4×4 rotation matrix (angle in degrees, optional axis/center). */
function rotationMatrix(
  angleDeg: number,
  axis: readonly [number, number, number] = [0, 0, 1],
  center: readonly [number, number, number] = [0, 0, 0]
): number[] {
  const rad = (angleDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const t = 1 - c;
  // Normalise axis
  const len = Math.sqrt(axis[0] ** 2 + axis[1] ** 2 + axis[2] ** 2);
  const [ux, uy, uz] = [axis[0] / len, axis[1] / len, axis[2] / len];

  // Rotation about arbitrary axis through origin
  const r00 = t * ux * ux + c;
  const r01 = t * ux * uy - s * uz;
  const r02 = t * ux * uz + s * uy;
  const r10 = t * uy * ux + s * uz;
  const r11 = t * uy * uy + c;
  const r12 = t * uy * uz - s * ux;
  const r20 = t * uz * ux - s * uy;
  const r21 = t * uz * uy + s * ux;
  const r22 = t * uz * uz + c;

  // If center is non-zero, conjugate: T(center) * R * T(-center)
  const [cx, cy, cz] = center;
  const tx = cx - (r00 * cx + r01 * cy + r02 * cz);
  const ty = cy - (r10 * cx + r11 * cy + r12 * cz);
  const tz = cz - (r20 * cx + r21 * cy + r22 * cz);

  // prettier-ignore
  return [
    r00, r01, r02, tx,
    r10, r11, r12, ty,
    r20, r21, r22, tz,
    0,   0,   0,   1,
  ];
}

/** Build a row-major 4×4 uniform scale matrix about a center point. */
function scaleMatrix(center: readonly [number, number, number], factor: number): number[] {
  const [cx, cy, cz] = center;
  const tx = cx * (1 - factor);
  const ty = cy * (1 - factor);
  const tz = cz * (1 - factor);
  // prettier-ignore
  return [
    factor, 0,      0,      tx,
    0,      factor, 0,      ty,
    0,      0,      factor, tz,
    0,      0,      0,      1,
  ];
}

/** Build a row-major 4×4 matrix from a 3×3 linear part + translation. */
function affineMatrix(
  linear: readonly number[],
  translation: readonly [number, number, number]
): number[] {
  // prettier-ignore
  return [
    linear[0]!, linear[1]!, linear[2]!, translation[0],
    linear[3]!, linear[4]!, linear[5]!, translation[1],
    linear[6]!, linear[7]!, linear[8]!, translation[2],
    0,          0,          0,          1,
  ];
}

/** Build a 4×4 reflection matrix for a plane defined by origin + normal. */
function mirrorMatrix(
  origin: readonly [number, number, number],
  normal: readonly [number, number, number]
): number[] {
  const [ox, oy, oz] = origin;
  const len = Math.sqrt(normal[0] ** 2 + normal[1] ** 2 + normal[2] ** 2);
  const nx = normal[0] / len;
  const ny = normal[1] / len;
  const nz = normal[2] / len;
  // Householder reflection: I - 2*n*n^T, translated to origin
  const d = 2 * (ox * nx + oy * ny + oz * nz);
  // prettier-ignore
  return [
    1 - 2*nx*nx,  -2*nx*ny,     -2*nx*nz,     d*nx,
    -2*ny*nx,     1 - 2*ny*ny,  -2*ny*nz,     d*ny,
    -2*nz*nx,     -2*nz*ny,     1 - 2*nz*nz,  d*nz,
    0,            0,            0,             1,
  ];
}

// ---------------------------------------------------------------------------
// Deflection defaults
// ---------------------------------------------------------------------------

/** Default tessellation deflection used when brepkit requires it but brepjs doesn't pass it. */
const DEFAULT_DEFLECTION = 0.01;

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

// ---------------------------------------------------------------------------
// One-time degradation warnings (ADR-0006 Phase 4)
// ---------------------------------------------------------------------------

const _warned = new Set<string>();

/** Emit a console.warn once per key per session. */
function warnOnce(key: string, message: string): void {
  if (_warned.has(key)) return;
  _warned.add(key);
  console.warn(`brepkit: ${message}`);
}

function mapStringTransition(mode: string): string | undefined {
  switch (mode) {
    case 'right':
      return 'rightCorner';
    case 'round':
      return 'roundCorner';
    case 'transformed':
      return 'rmf';
    default:
      return undefined;
  }
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
  // Convex hull (not yet implemented)
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

  // --- Extended construction ---

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
    if (tolerance !== undefined) {
      warnOnce(
        'offset-tolerance',
        'offset() tolerance parameter is not supported; brepkit uses its own internal tolerance.'
      );
    }
    const h = shape as BrepkitHandle;
    if (h.type === 'face') {
      // OCCT's BRepOffset_MakeOffset creates a solid from an offset face.
      // Use thicken (which creates a solid from a face + distance).
      const id = this.bk.thicken(h.id, distance);
      return solidHandle(id);
    }
    const id = this.bk.offsetSolid(unwrapSolidOrThrow(shape, 'offset'), distance);
    return solidHandle(id);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Transforms
  // ═══════════════════════════════════════════════════════════════════════

  transform(shape: KernelShape, trsf: KernelType): KernelShape {
    // trsf is expected to be a 4×4 row-major matrix array
    if (Array.isArray(trsf) && trsf.length === 16) {
      return this.applyMatrix(shape, trsf);
    }
    throw new Error('brepkit: transform expects a 16-element matrix array');
  }

  translate(shape: KernelShape, x: number, y: number, z: number): KernelShape {
    return this.applyMatrix(shape, translationMatrix(x, y, z));
  }

  rotate(
    shape: KernelShape,
    angle: number,
    axis?: readonly [number, number, number],
    center?: readonly [number, number, number]
  ): KernelShape {
    return this.applyMatrix(shape, rotationMatrix(angle, axis, center));
  }

  mirror(
    shape: KernelShape,
    origin: readonly [number, number, number],
    normal: readonly [number, number, number]
  ): KernelShape {
    const h = shape as BrepkitHandle;
    if (h.type === 'solid') {
      const id = this.bk.mirror(
        h.id,
        origin[0],
        origin[1],
        origin[2],
        normal[0],
        normal[1],
        normal[2]
      );
      return solidHandle(id);
    }
    // Non-solids: construct mirror reflection matrix and use applyMatrix
    return this.applyMatrix(shape, mirrorMatrix(origin, normal));
  }

  scale(
    shape: KernelShape,
    center: readonly [number, number, number],
    factor: number
  ): KernelShape {
    return this.applyMatrix(shape, scaleMatrix(center, factor));
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
    return this.applyMatrix(shape, affineMatrix(linear, translation));
  }

  generalTransformNonOrthogonal(
    shape: KernelShape,
    linear: readonly [number, number, number, number, number, number, number, number, number],
    translation: readonly [number, number, number]
  ): KernelShape {
    return this.applyMatrix(shape, affineMatrix(linear, translation));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Operations with shape evolution tracking
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Parse native brepkit evolution JSON and convert face IDs to hash-based
   * evolution that the brepjs propagation system expects.
   *
   * The native API returns:
   *   `{"solid": u32, "evolution": {"modified": {inputFaceId: [outputFaceIds]}, "generated": {}, "deleted": [faceIds]}}`
   *
   * We convert face IDs → hashes via `id % hashUpperBound`.
   */
  private parseNativeEvolution(json: string, hashUpperBound: number): OperationResult {
    const parsed = JSON.parse(json) as {
      solid: number;
      evolution: {
        modified: Record<string, number[]>;
        generated: Record<string, number[]>;
        deleted: number[];
      };
    };
    const evo = parsed.evolution;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard for external WASM JSON
    if (!evo || typeof evo.modified !== 'object' || typeof evo.generated !== 'object') {
      throw new Error('brepkit: invalid evolution JSON structure');
    }
    const resultShape = solidHandle(parsed.solid);

    const collectHashes = (entries: Record<string, number[]>): Map<number, number[]> => {
      const map = new Map<number, number[]>();
      for (const [inputId, outputIds] of Object.entries(entries)) {
        const inputHash = Number(inputId) % hashUpperBound;
        const outputHashes = outputIds.map((id) => id % hashUpperBound);
        const existing = map.get(inputHash);
        if (existing) {
          existing.push(...outputHashes);
        } else {
          map.set(inputHash, outputHashes);
        }
      }
      return map;
    };

    const modified = collectHashes(evo.modified);
    const generated = collectHashes(evo.generated);
    const deleted = new Set<number>();
    for (const id of evo.deleted) {
      deleted.add(id % hashUpperBound);
    }

    return { shape: resultShape, evolution: { modified, generated, deleted } };
  }

  /**
   * Build a ShapeEvolution by comparing input face hashes to output face hashes.
   *
   * For transforms: 1:1 mapping (modified = identity, no generated/deleted).
   * For booleans/modifiers: compare sets to detect changes, with geometric
   * fallback when hash matching fails (brepkit always creates new face IDs).
   */
  private buildEvolution(
    resultShape: KernelShape,
    inputFaceHashes: number[],
    hashUpperBound: number,
    isTransform: boolean,
    originalShape?: KernelShape
  ): OperationResult {
    const h = resultShape as BrepkitHandle;
    const modified = new Map<number, number[]>();
    const generated = new Map<number, number[]>();
    const deleted = new Set<number>();

    if (h.type === 'solid') {
      const outputFaces = toArray(this.bk.getSolidFaces(h.id));
      const outputHashes = outputFaces.map((fid) => fid % hashUpperBound);

      if (isTransform) {
        // Transforms: 1:1 mapping — each input face maps to the corresponding output face
        for (let i = 0; i < inputFaceHashes.length && i < outputHashes.length; i++) {
          modified.set(inputFaceHashes[i]!, [outputHashes[i]!]);
        }
      } else {
        // Boolean/modifier: compare face hash sets
        const inputSet = new Set(inputFaceHashes);

        // Check if any output hash matches an input hash
        let hasOverlap = false;
        for (const hash of outputHashes) {
          if (inputSet.has(hash)) {
            hasOverlap = true;
            break;
          }
        }

        if (hasOverlap) {
          // Hash-based matching (OCCT-like behavior)
          const outputSet = new Set(outputHashes);
          for (const hash of outputHashes) {
            if (inputSet.has(hash)) {
              modified.set(hash, [hash]);
            }
          }
          const newFaces = outputHashes.filter((fh) => !inputSet.has(fh));
          if (newFaces.length > 0 && inputFaceHashes.length > 0) {
            generated.set(inputFaceHashes[0]!, newFaces);
          }
          for (const hash of inputFaceHashes) {
            if (!outputSet.has(hash)) {
              deleted.add(hash);
            }
          }
        } else if (originalShape) {
          // No hash overlap — use geometric matching (normal + centroid)
          this.matchFacesGeometrically(
            originalShape,
            inputFaceHashes,
            outputFaces,
            hashUpperBound,
            modified,
            generated,
            deleted
          );
        } else {
          // No original shape available — positional fallback
          for (let i = 0; i < inputFaceHashes.length && i < outputHashes.length; i++) {
            modified.set(inputFaceHashes[i]!, [outputHashes[i]!]);
          }
          if (outputHashes.length > inputFaceHashes.length && inputFaceHashes.length > 0) {
            generated.set(inputFaceHashes[0]!, outputHashes.slice(inputFaceHashes.length));
          }
        }
      }
    }

    return { shape: resultShape, evolution: { modified, generated, deleted } };
  }

  /**
   * Chain an evolution map (modified or generated) through one step of a multi-step
   * boolean. For each entry, each previous output hash is resolved against this
   * step's evolution: if it was further modified, follow to the new outputs; if
   * deleted, drop it; otherwise keep it unchanged.
   *
   * Mutates `map` in-place and records each resolved prevOut in `intermediateOutputs`.
   * When `deleteOnEmpty` is provided, entries that reduce to no outputs are added to it.
   */
  private static chainEvolutionMap(
    map: Map<number, number[]>,
    stepModified: ReadonlyMap<number, readonly number[]>,
    stepDeleted: ReadonlySet<number>,
    intermediateOutputs: Set<number>,
    deleteOnEmpty?: Set<number>
  ): void {
    for (const [origKey, prevOutputs] of map) {
      const chainedOutputs: number[] = [];
      for (const prevOut of prevOutputs) {
        intermediateOutputs.add(prevOut);
        const nextOutputs = stepModified.get(prevOut);
        if (nextOutputs) {
          chainedOutputs.push(...nextOutputs);
        } else if (!stepDeleted.has(prevOut)) {
          chainedOutputs.push(prevOut);
        }
      }
      if (chainedOutputs.length > 0) {
        map.set(origKey, chainedOutputs);
      } else {
        map.delete(origKey);
        deleteOnEmpty?.add(origKey);
      }
    }
  }

  /** Squared Euclidean distance between two 3-component centroids. */
  private static centroidDistSq(a: [number, number, number], b: [number, number, number]): number {
    const dx = a[0] - b[0];
    const dy = a[1] - b[1];
    const dz = a[2] - b[2];
    return dx * dx + dy * dy + dz * dz;
  }

  /** Compute face centroid as the average of tessellation vertices. */
  private faceCentroidById(faceId: number): [number, number, number] {
    try {
      const pos = this.bk.tessellateFace(faceId, 1.0).positions;
      if (pos.length < 3) return [0, 0, 0];
      let cx = 0;
      let cy = 0;
      let cz = 0;
      const nVerts = pos.length / 3;
      for (let i = 0; i < pos.length; i += 3) {
        cx += pos[i]!;
        cy += pos[i + 1]!;
        cz += pos[i + 2]!;
      }
      return [cx / nVerts, cy / nVerts, cz / nVerts];
    } catch {
      return [0, 0, 0];
    }
  }

  /**
   * Match input→output faces geometrically using normal dot product and centroid distance.
   * Mirrors the algorithm in brepkit's `boolean_with_evolution`.
   */
  private matchFacesGeometrically(
    originalShape: KernelShape,
    inputFaceHashes: number[],
    outputFaceIds: number[],
    hashUpperBound: number,
    modified: Map<number, number[]>,
    generated: Map<number, number[]>,
    deleted: Set<number>
  ): void {
    const orig = originalShape as BrepkitHandle;
    if (orig.type !== 'solid') return;

    const inputFaceIds = toArray(this.bk.getSolidFaces(orig.id));
    const hashCount = Math.min(inputFaceIds.length, inputFaceHashes.length);

    // Snapshot input face signatures (skip faces where normal can't be computed)
    const inputSigs: {
      hash: number;
      normal: ArrayLike<number>;
      centroid: [number, number, number];
    }[] = [];
    for (let i = 0; i < hashCount; i++) {
      const fid = inputFaceIds[i]!;
      try {
        const normal = this.bk.getFaceNormal(fid);
        const centroid = this.faceCentroidById(fid);
        inputSigs.push({ hash: inputFaceHashes[i] ?? fid % hashUpperBound, normal, centroid });
      } catch {
        // Non-planar faces can't compute normal via getFaceNormal — skip
        inputSigs.push({
          hash: inputFaceHashes[i] ?? fid % hashUpperBound,
          normal: [0, 0, 0],
          centroid: this.faceCentroidById(fid),
        });
      }
    }

    // Snapshot output face signatures (skip faces where normal can't be computed)
    const outputSigs: {
      hash: number;
      normal: ArrayLike<number>;
      centroid: [number, number, number];
    }[] = [];
    for (const fid of outputFaceIds) {
      try {
        const normal = this.bk.getFaceNormal(fid);
        const centroid = this.faceCentroidById(fid);
        outputSigs.push({ hash: fid % hashUpperBound, normal, centroid });
      } catch {
        outputSigs.push({
          hash: fid % hashUpperBound,
          normal: [0, 0, 0],
          centroid: this.faceCentroidById(fid),
        });
      }
    }

    const NORMAL_THRESHOLD = 0.707; // cos(45°)
    const CENTROID_DIST_SQ_MAX = 100.0;
    const matchedInputIndices = new Set<number>();

    for (const out of outputSigs) {
      let bestScore = -Infinity;
      let bestIdx = -1;

      for (let i = 0; i < inputSigs.length; i++) {
        const inp = inputSigs[i]!;
        const dot =
          (out.normal[0] ?? 0) * (inp.normal[0] ?? 0) +
          (out.normal[1] ?? 0) * (inp.normal[1] ?? 0) +
          (out.normal[2] ?? 0) * (inp.normal[2] ?? 0);
        if (dot < NORMAL_THRESHOLD) continue;

        const distSq = BrepkitAdapter.centroidDistSq(out.centroid, inp.centroid);
        if (distSq > CENTROID_DIST_SQ_MAX) continue;

        const score = dot - distSq / CENTROID_DIST_SQ_MAX;
        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }

      if (bestIdx >= 0) {
        const bestInput = inputSigs[bestIdx]!;
        const existing = modified.get(bestInput.hash) ?? [];
        existing.push(out.hash);
        modified.set(bestInput.hash, existing);
        matchedInputIndices.add(bestIdx);
      } else {
        // Unmatched output → generated from nearest input
        let bestDistSq = Infinity;
        let nearestInput: (typeof inputSigs)[0] | undefined;
        for (const inp of inputSigs) {
          const distSq = BrepkitAdapter.centroidDistSq(out.centroid, inp.centroid);
          if (distSq < bestDistSq) {
            bestDistSq = distSq;
            nearestInput = inp;
          }
        }
        if (nearestInput) {
          const existing = generated.get(nearestInput.hash) ?? [];
          existing.push(out.hash);
          generated.set(nearestInput.hash, existing);
        }
      }
    }

    // Input faces not matched → deleted
    for (let i = 0; i < inputSigs.length; i++) {
      if (!matchedInputIndices.has(i)) {
        deleted.add(inputSigs[i]!.hash);
      }
    }
  }

  translateWithHistory(
    shape: KernelShape,
    x: number,
    y: number,
    z: number,
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult {
    return this.buildEvolution(
      this.translate(shape, x, y, z),
      inputFaceHashes,
      hashUpperBound,
      true
    );
  }

  rotateWithHistory(
    shape: KernelShape,
    angle: number,
    inputFaceHashes: number[],
    hashUpperBound: number,
    axis?: readonly [number, number, number],
    center?: readonly [number, number, number]
  ): OperationResult {
    // shapeFns.rotate() passes angle in radians; convert back to degrees
    // since this.rotate() expects degrees (it calls rotationMatrix which converts internally)
    const angleDeg = (angle * 180) / Math.PI;
    return this.buildEvolution(
      this.rotate(shape, angleDeg, axis, center),
      inputFaceHashes,
      hashUpperBound,
      true
    );
  }

  mirrorWithHistory(
    shape: KernelShape,
    origin: readonly [number, number, number],
    normal: readonly [number, number, number],
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult {
    return this.buildEvolution(
      this.mirror(shape, origin, normal),
      inputFaceHashes,
      hashUpperBound,
      true
    );
  }

  scaleWithHistory(
    shape: KernelShape,
    center: readonly [number, number, number],
    factor: number,
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult {
    return this.buildEvolution(
      this.scale(shape, center, factor),
      inputFaceHashes,
      hashUpperBound,
      true
    );
  }

  generalTransformWithHistory(
    shape: KernelShape,
    linear: readonly [number, number, number, number, number, number, number, number, number],
    translation: readonly [number, number, number],
    isOrthogonal: boolean,
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult {
    return this.buildEvolution(
      this.generalTransform(shape, linear, translation, isOrthogonal),
      inputFaceHashes,
      hashUpperBound,
      true
    );
  }

  private booleanWithHistoryImpl(
    shape: KernelShape,
    tool: KernelShape,
    inputFaceHashes: number[],
    hashUpperBound: number,
    options: BooleanOptions | undefined,
    nativeFn: (a: number, b: number) => string,
    fallbackFn: (s: KernelShape, t: KernelShape, o?: BooleanOptions) => KernelShape,
    _label: string
  ): DiagnosticOperationResult {
    const noDiagnostics = { hasErrors: false, hasWarnings: false, messages: [] } as const;
    const sh = shape as BrepkitHandle;
    const th = tool as BrepkitHandle;
    if (inputFaceHashes.length > 0 && sh.type === 'solid') {
      if (th.type === 'solid') {
        // Native *WithEvolution APIs require solid handles and do not accept
        // BooleanOptions (e.g. fuzzyValue). Options are silently ignored.
        const json = nativeFn(sh.id, th.id);
        return { ...this.parseNativeEvolution(json, hashUpperBound), diagnostics: noDiagnostics };
      }
      if (th.type === 'compound') {
        // Iteratively apply native evolution for each solid in the compound,
        // chaining evolution maps so that original input face hashes map to
        // final output face hashes (not intermediate ones).
        const childSolidIds: number[] = toArray(this.bk.getCompoundSolids(th.id));
        let currentShape: KernelShape = shape;
        const combinedModified = new Map<number, number[]>();
        const combinedGenerated = new Map<number, number[]>();
        const combinedDeleted = new Set<number>();
        const inputFaceHashSet = new Set(inputFaceHashes);
        for (const childId of childSolidIds) {
          const ch = currentShape as BrepkitHandle;
          if (ch.type !== 'solid') break;
          const json = nativeFn(ch.id, childId);
          const result = this.parseNativeEvolution(json, hashUpperBound);
          currentShape = result.shape;

          // Chain evolution: update existing combined entries to follow through
          // intermediate face hashes to final output hashes.
          // Track which face hashes were intermediate outputs (inputs to this
          // step) so we can skip them when merging new entries below.
          const intermediateOutputs = new Set<number>();

          // Chain combinedModified and combinedGenerated through this step.
          // Modified entries that reduce to no outputs become deleted.
          BrepkitAdapter.chainEvolutionMap(
            combinedModified,
            result.evolution.modified,
            result.evolution.deleted,
            intermediateOutputs,
            combinedDeleted
          );
          BrepkitAdapter.chainEvolutionMap(
            combinedGenerated,
            result.evolution.modified,
            result.evolution.deleted,
            intermediateOutputs
          );

          // Add new entries from this step that aren't already chained
          for (const [k, v] of result.evolution.modified) {
            if (!combinedModified.has(k) && !intermediateOutputs.has(k)) {
              combinedModified.set(k, [...v]);
            }
          }

          for (const [k, v] of result.evolution.generated) {
            if (!intermediateOutputs.has(k)) {
              const existing = combinedGenerated.get(k) ?? [];
              combinedGenerated.set(k, [...existing, ...v]);
            }
          }
          for (const d of result.evolution.deleted) {
            if (inputFaceHashSet.has(d)) {
              combinedDeleted.add(d);
            }
          }
        }
        return {
          shape: currentShape,
          evolution: {
            modified: combinedModified,
            generated: combinedGenerated,
            deleted: combinedDeleted,
          },
          diagnostics: noDiagnostics,
        };
      }
    }
    // Fallback: non-solid shapes or no face hashes
    const fallbackResult = fallbackFn(shape, tool, options);
    const evo = this.buildEvolution(fallbackResult, inputFaceHashes, hashUpperBound, false, shape);
    return { ...evo, diagnostics: noDiagnostics };
  }

  fuseWithHistory(
    shape: KernelShape,
    tool: KernelShape,
    inputFaceHashes: number[],
    hashUpperBound: number,
    options?: BooleanOptions
  ): DiagnosticOperationResult {
    return this.booleanWithHistoryImpl(
      shape,
      tool,
      inputFaceHashes,
      hashUpperBound,
      options,
      (a, b) => this.bk.fuseWithEvolution(a, b),
      (s, t, o) => this.fuse(s, t, o),
      'fuseWithHistory'
    );
  }

  cutWithHistory(
    shape: KernelShape,
    tool: KernelShape,
    inputFaceHashes: number[],
    hashUpperBound: number,
    options?: BooleanOptions
  ): DiagnosticOperationResult {
    return this.booleanWithHistoryImpl(
      shape,
      tool,
      inputFaceHashes,
      hashUpperBound,
      options,
      (a, b) => this.bk.cutWithEvolution(a, b),
      (s, t, o) => this.cut(s, t, o),
      'cutWithHistory'
    );
  }

  intersectWithHistory(
    shape: KernelShape,
    tool: KernelShape,
    inputFaceHashes: number[],
    hashUpperBound: number,
    options?: BooleanOptions
  ): DiagnosticOperationResult {
    return this.booleanWithHistoryImpl(
      shape,
      tool,
      inputFaceHashes,
      hashUpperBound,
      options,
      (a, b) => this.bk.intersectWithEvolution(a, b),
      (s, t, o) => this.intersect(s, t, o),
      'intersectWithHistory'
    );
  }

  filletWithHistory(
    shape: KernelShape,
    edges: KernelShape[],
    radius: number | [number, number] | ((edge: KernelShape) => number | [number, number]),
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult {
    return this.buildEvolution(
      this.fillet(shape, edges, radius),
      inputFaceHashes,
      hashUpperBound,
      false,
      shape
    );
  }

  chamferWithHistory(
    shape: KernelShape,
    edges: KernelShape[],
    distance: number | [number, number] | ((edge: KernelShape) => number | [number, number]),
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult {
    return this.buildEvolution(
      this.chamfer(shape, edges, distance),
      inputFaceHashes,
      hashUpperBound,
      false,
      shape
    );
  }

  shellWithHistory(
    shape: KernelShape,
    faces: KernelShape[],
    thickness: number,
    inputFaceHashes: number[],
    hashUpperBound: number,
    tolerance?: number
  ): OperationResult {
    return this.buildEvolution(
      this.shell(shape, faces, thickness, tolerance),
      inputFaceHashes,
      hashUpperBound,
      false,
      shape
    );
  }

  thickenWithHistory(
    shape: KernelShape,
    thickness: number,
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult {
    return this.buildEvolution(
      this.thicken(shape, thickness),
      inputFaceHashes,
      hashUpperBound,
      false,
      shape
    );
  }

  offsetWithHistory(
    shape: KernelShape,
    distance: number,
    inputFaceHashes: number[],
    hashUpperBound: number,
    tolerance?: number
  ): OperationResult {
    return this.buildEvolution(
      this.offset(shape, distance, tolerance),
      inputFaceHashes,
      hashUpperBound,
      false,
      shape
    );
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
    return this.buildEvolution(
      this.draft(shape, faces, pullDirection, neutralPlane, angleDeg),
      inputFaceHashes,
      hashUpperBound,
      false,
      shape
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Meshing
  // ═══════════════════════════════════════════════════════════════════════

  mesh(shape: KernelShape, options: MeshOptions): KernelMeshResult {
    if (options.angularTolerance > 0) {
      warnOnce(
        'mesh-angular',
        'mesh angularTolerance is not supported; only linear deflection is used.'
      );
    }
    const h = unwrap(shape);
    const bkHandle = shape as BrepkitHandle;
    const deflection = options.tolerance || DEFAULT_DEFLECTION;

    let result: KernelMeshResult;
    if (bkHandle.type === 'solid') {
      result = this.meshSolid(h, deflection, !!options.includeUVs);
    } else if (bkHandle.type === 'face') {
      // Note: meshSingleFace does not support real UVs yet (brepkit has no per-face UV API).
      // UVs will be zeroed out by the post-processing guard below when includeUVs is false.
      result = this.meshSingleFace(h, deflection, 0);
    } else {
      throw new Error(`brepkit: cannot mesh shape of type '${bkHandle.type}'`);
    }

    if (options.skipNormals) {
      result.normals = new Float32Array(0);
    }
    if (!options.includeUVs) {
      result.uvs = new Float32Array(0);
    }
    return result;
  }

  meshEdges(shape: KernelShape, tolerance: number, angularTolerance: number): KernelEdgeMeshResult {
    if (angularTolerance > 0) {
      warnOnce(
        'mesh-edges-angular',
        'meshEdges angularTolerance is not supported; only linear deflection is used.'
      );
    }
    const bkHandle = shape as BrepkitHandle;

    if (bkHandle.type !== 'solid') {
      return { lines: new Float32Array(0), edgeGroups: [] };
    }

    // Use meshEdgesAll (unfiltered) for OCCT parity — falls back to meshEdges if unavailable
    const edgeLines = this.bk.meshEdgesAll
      ? this.bk.meshEdgesAll(bkHandle.id, tolerance)
      : this.bk.meshEdges(bkHandle.id, tolerance);
    const positions = edgeLines.positions;
    const offsets = edgeLines.offsets;
    const edgeCount = edgeLines.edgeCount;

    const edgeGroups: Array<{ start: number; count: number; edgeHash: number }> = [];
    for (let i = 0; i < edgeCount; i++) {
      const startIdx = offsets[i]!;
      const endIdx = i + 1 < edgeCount ? offsets[i + 1]! : positions.length;
      const pointCount = (endIdx - startIdx) / 3;
      edgeGroups.push({ start: startIdx / 3, count: pointCount, edgeHash: i });
    }

    return {
      lines: new Float32Array(positions),
      edgeGroups,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // File I/O
  // ═══════════════════════════════════════════════════════════════════════

  exportSTEP(shapes: KernelShape[]): string {
    if (shapes.length === 0) return '';
    // brepkit exports one solid at a time — concatenate for multi-shape
    const parts: string[] = [];
    for (const shape of shapes) {
      const solidIds = unwrapSolidsForExport(this.bk, shape, 'exportSTEP');
      for (const sid of solidIds) {
        const bytes: Uint8Array = this.bk.exportStep(sid);
        parts.push(new TextDecoder().decode(bytes));
      }
    }
    return parts.join('\n');
  }

  exportSTL(shape: KernelShape, binary?: boolean): string | ArrayBuffer {
    const solidIds = unwrapSolidsForExport(this.bk, shape, 'exportSTL');
    // Use the first solid; STL format doesn't natively support multi-solid
    if (binary) {
      const bytes: Uint8Array = this.bk.exportStl(solidIds[0]!, DEFAULT_DEFLECTION);
      return bytes.buffer as ArrayBuffer;
    }
    const bytes: Uint8Array = this.bk.exportStlAscii(solidIds[0]!, DEFAULT_DEFLECTION);
    return new TextDecoder().decode(bytes);
  }

  importSTEP(data: string | ArrayBuffer): KernelShape[] {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
    return toArray(this.bk.importStep(bytes)).map(solidHandle);
  }

  importSTL(data: string | ArrayBuffer): KernelShape {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
    const id: number = this.bk.importStl(bytes);
    return solidHandle(id);
  }

  exportIGES(shapes: KernelShape[]): string {
    if (shapes.length === 0) return '';
    const parts: string[] = [];
    for (const shape of shapes) {
      const solidIds = unwrapSolidsForExport(this.bk, shape, 'exportIGES');
      for (const sid of solidIds) {
        const bytes: Uint8Array = this.bk.exportIges(sid);
        parts.push(new TextDecoder().decode(bytes));
      }
    }
    return parts.join('\n');
  }

  importIGES(data: string | ArrayBuffer): KernelShape[] {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
    return toArray(this.bk.importIges(bytes)).map(solidHandle);
  }

  exportSTEPAssembly(parts: StepAssemblyPart[], _options?: { unit?: string }): string {
    // brepkit doesn't support named/colored assembly export yet.
    // Fall back to exporting all shapes concatenated.
    if (parts.length === 0) return '';
    const shapes = parts.map((p) => p.shape);
    return this.exportSTEP(shapes);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Measurement
  // ═══════════════════════════════════════════════════════════════════════

  volume(shape: KernelShape): number {
    const h = shape as BrepkitHandle;
    if (h.type === 'solid') {
      return this.bk.volume(unwrap(shape), DEFAULT_DEFLECTION);
    }
    if (h.type === 'compound') {
      const solids = this.iterShapes(shape, 'solid');
      let total = 0;
      for (const s of solids) {
        total += this.bk.volume(unwrap(s), DEFAULT_DEFLECTION);
      }
      return total;
    }
    return 0;
  }

  area(shape: KernelShape): number {
    const h = shape as BrepkitHandle;
    if (h.type === 'face') {
      return this.bk.faceArea(unwrap(shape), DEFAULT_DEFLECTION);
    }
    if (h.type === 'solid') {
      return this.bk.surfaceArea(unwrap(shape), DEFAULT_DEFLECTION);
    }
    if (h.type === 'compound') {
      // Sum areas of all faces in the compound
      const faces = this.iterShapes(shape, 'face');
      let total = 0;
      for (const face of faces) {
        total += this.bk.faceArea(unwrap(face), DEFAULT_DEFLECTION);
      }
      return total;
    }
    return 0;
  }

  length(shape: KernelShape): number {
    const h = shape as BrepkitHandle;
    if (h.type === 'edge') {
      return this.bk.edgeLength(unwrap(shape));
    }
    // For faces, return perimeter
    if (h.type === 'face') {
      return this.bk.facePerimeter(unwrap(shape));
    }
    if (h.type === 'wire') {
      return this.bk.wireLength(h.id);
    }
    throw new Error('brepkit: length() requires an edge, wire, or face');
  }

  centerOfMass(shape: KernelShape): [number, number, number] {
    const h = shape as BrepkitHandle;
    if (h.type === 'solid') {
      const result = this.bk.centerOfMass(unwrap(shape), DEFAULT_DEFLECTION);
      return [result[0]!, result[1]!, result[2]!];
    }
    if (h.type === 'face') {
      // Evaluate surface at the center of the UV domain
      const domain = this.uvBounds(shape);
      const uMid = (domain.uMin + domain.uMax) / 2;
      const vMid = (domain.vMin + domain.vMax) / 2;
      return this.pointOnSurface(shape, uMid, vMid);
    }
    if (h.type === 'edge') {
      // Use midpoint of edge vertices
      const verts = this.bk.getEdgeVertices(h.id);
      return [
        (verts[0]! + verts[3]!) / 2,
        (verts[1]! + verts[4]!) / 2,
        (verts[2]! + verts[5]!) / 2,
      ];
    }
    if (h.type === 'vertex') {
      return this.vertexPosition(shape);
    }
    // Fallback for compounds, shells, wires: average vertex positions
    const vertices = this.iterShapes(shape, 'vertex');
    if (vertices.length > 0) {
      let sx = 0,
        sy = 0,
        sz = 0;
      for (const v of vertices) {
        const p = this.vertexPosition(v);
        sx += p[0];
        sy += p[1];
        sz += p[2];
      }
      return [sx / vertices.length, sy / vertices.length, sz / vertices.length];
    }
    return [0, 0, 0];
  }

  linearCenterOfMass(shape: KernelShape): [number, number, number] {
    // Average of edge endpoints (approximation for straight edges)
    const h = shape as BrepkitHandle;
    if (h.type === 'edge') {
      const verts = this.bk.getEdgeVertices(h.id);
      return [
        (verts[0]! + verts[3]!) / 2,
        (verts[1]! + verts[4]!) / 2,
        (verts[2]! + verts[5]!) / 2,
      ];
    }
    // For wires/solids, fall back to volumetric CoM
    return this.centerOfMass(shape);
  }

  boundingBox(shape: KernelShape): {
    min: [number, number, number];
    max: [number, number, number];
  } {
    const h = shape as BrepkitHandle;
    if (h.type === 'solid') {
      const bb = this.bk.boundingBox(unwrap(shape));
      return {
        min: [bb[0]!, bb[1]!, bb[2]!],
        max: [bb[3]!, bb[4]!, bb[5]!],
      };
    }
    if (h.type === 'vertex') {
      const pos = this.vertexPosition(shape);
      return { min: [...pos], max: [...pos] };
    }
    // For faces, edges, wires, compounds, shells: compute from vertex positions
    const vertices = this.iterShapes(shape, 'vertex');
    if (vertices.length === 0) {
      return { min: [0, 0, 0], max: [0, 0, 0] };
    }
    const first = this.vertexPosition(vertices[0]);
    let minX = first[0],
      minY = first[1],
      minZ = first[2];
    let maxX = first[0],
      maxY = first[1],
      maxZ = first[2];
    for (let i = 1; i < vertices.length; i++) {
      const p = this.vertexPosition(vertices[i]);
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
      if (p[2] < minZ) minZ = p[2];
      if (p[2] > maxZ) maxZ = p[2];
    }
    return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
  }

  measureBulk(shape: KernelShape, includeLinear = false): BulkMeasurement {
    const h = shape as BrepkitHandle;
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

  // ═══════════════════════════════════════════════════════════════════════
  // Topology introspection
  // ═══════════════════════════════════════════════════════════════════════

  iterShapes(shape: KernelShape, type: ShapeType): KernelShape[] {
    const h = unwrap(shape);
    const bkHandle = shape as BrepkitHandle;

    switch (bkHandle.type) {
      case 'compound': {
        // Check for JS-side synthetic compound first
        const children = syntheticCompounds.get(h);
        if (children) {
          // Return children matching the requested type, or recurse
          const results: KernelShape[] = [];
          for (const child of children) {
            if (child.type === type) {
              results.push(child);
            } else {
              results.push(...this.iterShapes(child, type));
            }
          }
          return results;
        }
        // Native compound → solid: direct children
        if (type === 'solid') {
          return toArray(this.bk.getCompoundSolids(h)).map(solidHandle);
        }
        // compound → face/edge/vertex/wire: recursive via solids
        if (type === 'face' || type === 'edge' || type === 'vertex' || type === 'wire') {
          const solids = toArray(this.bk.getCompoundSolids(h)).map(solidHandle);
          return solids.flatMap((s) => this.iterShapes(s, type));
        }
        return [];
      }

      case 'solid': {
        switch (type) {
          case 'face':
            return toArray(this.bk.getSolidFaces(h)).map(faceHandle);
          case 'edge':
            return toArray(this.bk.getSolidEdges(h)).map(edgeHandle);
          case 'vertex':
            return toArray(this.bk.getSolidVertices(h)).map(vertexHandle);
          case 'wire':
            return toArray(this.bk.getSolidFaces(h)).flatMap((faceId: number) =>
              toArray(this.bk.getFaceWires(faceId)).map(wireHandle)
            );
          default:
            return [];
        }
      }

      case 'shell': {
        if (type === 'face') {
          return toArray(this.bk.getShellFaces(h)).map(faceHandle);
        }
        if (type === 'edge' || type === 'vertex') {
          const faces = toArray(this.bk.getShellFaces(h)).map(faceHandle);
          const seen = new Set<number>();
          const results: KernelShape[] = [];
          for (const face of faces) {
            for (const child of this.iterShapes(face, type)) {
              const childId = unwrap(child);
              if (!seen.has(childId)) {
                seen.add(childId);
                results.push(child);
              }
            }
          }
          return results;
        }
        return [];
      }

      case 'face': {
        if (type === 'face') {
          return [shape]; // A face contains itself
        }
        if (type === 'edge') {
          return toArray(this.bk.getFaceEdges(h)).map(edgeHandle);
        }
        if (type === 'vertex') {
          return toArray(this.bk.getFaceVertices(h)).map(vertexHandle);
        }
        if (type === 'wire') {
          return toArray(this.bk.getFaceWires(h)).map(wireHandle);
        }
        return [];
      }

      case 'wire': {
        if (type === 'wire') {
          return [shape]; // A wire contains itself
        }
        if (type === 'edge') {
          return toArray(this.bk.getWireEdges(h)).map(edgeHandle);
        }
        if (type === 'vertex') {
          const edgeIds = toArray(this.bk.getWireEdges(h));
          // Deduplicate on coordinates — makeVertex allocates fresh arena IDs
          // so ID-based dedup would never match shared corners
          const seen = new Set<string>();
          const results: KernelShape[] = [];
          for (const eid of edgeIds) {
            const verts = this.bk.getEdgeVertices(eid);
            const coords = [
              [verts[0]!, verts[1]!, verts[2]!],
              [verts[3]!, verts[4]!, verts[5]!],
            ] as const;
            for (const [x, y, z] of coords) {
              const key = `${x},${y},${z}`;
              if (!seen.has(key)) {
                seen.add(key);
                results.push(vertexHandle(this.bk.makeVertex(x, y, z)));
              }
            }
          }
          return results;
        }
        return [];
      }

      case 'edge': {
        if (type === 'edge') {
          return [shape]; // An edge contains itself
        }
        if (type === 'vertex') {
          // getEdgeVertices returns coordinates, not arena IDs — each call to
          // makeVertex allocates a new arena entry (no stable vertex ID API yet)
          const verts = this.bk.getEdgeVertices(h);
          const v1 = this.bk.makeVertex(verts[0]!, verts[1]!, verts[2]!);
          const v2 = this.bk.makeVertex(verts[3]!, verts[4]!, verts[5]!);
          return [vertexHandle(v1), vertexHandle(v2)];
        }
        return [];
      }

      default:
        return [];
    }
  }

  iterShapeList(list: KernelShape, callback: (item: KernelShape) => void): void {
    // brepkit doesn't have TopTools_ListOfShape — treat as array of handles
    if (Array.isArray(list)) {
      for (const item of list) callback(item);
    }
  }

  shapeType(shape: KernelShape): ShapeType {
    if (isBrepkitHandle(shape)) return shape.type;
    throw new Error('brepkit: cannot determine shape type of non-brepkit handle');
  }

  isSame(a: KernelShape, b: KernelShape): boolean {
    return isBrepkitHandle(a) && isBrepkitHandle(b) && a.id === b.id && a.type === b.type;
  }

  isEqual(a: KernelShape, b: KernelShape): boolean {
    return this.isSame(a, b);
  }

  downcast(shape: KernelShape, _type?: ShapeType): KernelShape {
    return shape; // brepkit handles are already typed
  }

  hashCode(shape: KernelShape, upperBound: number): number {
    if (!isBrepkitHandle(shape)) return 0;
    // Spread handle id across the hash space
    return shape.id % upperBound;
  }

  isNull(shape: KernelShape): boolean {
    return !shape || !isBrepkitHandle(shape);
  }

  shapeOrientation(shape: KernelShape): ShapeOrientation {
    const h = unwrap(shape);
    const orient = this.bk.getShapeOrientation(h);
    return orient as ShapeOrientation;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Geometry queries: vertex
  // ═══════════════════════════════════════════════════════════════════════

  vertexPosition(vertex: KernelShape): [number, number, number] {
    const pos = this.bk.getVertexPosition(unwrap(vertex, 'vertex'));
    return [pos[0]!, pos[1]!, pos[2]!];
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Geometry queries: face / surface
  // ═══════════════════════════════════════════════════════════════════════

  surfaceType(face: KernelShape): SurfaceType {
    const typeStr: string = this.bk.getSurfaceType(unwrap(face, 'face'));
    return typeStr as SurfaceType;
  }

  uvBounds(face: KernelShape): { uMin: number; uMax: number; vMin: number; vMax: number } {
    const domain = this.bk.getSurfaceDomain(unwrap(face, 'face'));
    return { uMin: domain[0]!, uMax: domain[1]!, vMin: domain[2]!, vMax: domain[3]! };
  }

  outerWire(face: KernelShape): KernelShape {
    const id = this.bk.getFaceOuterWire(unwrap(face, 'face'));
    return wireHandle(id);
  }

  surfaceNormal(face: KernelShape, u: number, v: number): [number, number, number] {
    const n = this.bk.evaluateSurfaceNormal(unwrap(face, 'face'), u, v);
    return [n[0]!, n[1]!, n[2]!];
  }

  pointOnSurface(face: KernelShape, u: number, v: number): [number, number, number] {
    const p = this.bk.evaluateSurface(unwrap(face, 'face'), u, v);
    return [p[0]!, p[1]!, p[2]!];
  }

  uvFromPoint(face: KernelShape, point: [number, number, number]): [number, number] | null {
    try {
      const result = this.bk.projectPointOnSurface(
        unwrap(face, 'face'),
        point[0],
        point[1],
        point[2]
      );
      return [result[0]!, result[1]!];
    } catch (e: unknown) {
      console.warn('brepkit: uvFromPoint failed:', e);
      return null;
    }
  }

  projectPointOnFace(face: KernelShape, point: [number, number, number]): [number, number, number] {
    const result = this.bk.projectPointOnSurface(
      unwrap(face, 'face'),
      point[0],
      point[1],
      point[2]
    );
    return [result[2]!, result[3]!, result[4]!];
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Geometry queries: edge / curve
  // ═══════════════════════════════════════════════════════════════════════

  curveTangent(
    shape: KernelShape,
    param: number
  ): { point: [number, number, number]; tangent: [number, number, number] } {
    const h = shape as BrepkitHandle;
    let edgeId: number;
    let evalParam = param;

    if (h.type === 'wire') {
      // Walk edges to find the right one for the composite parameter
      const edgeIds: number[] = toArray(this.bk.getWireEdges(h.id));
      edgeId = edgeIds[edgeIds.length - 1]!; // fallback to last edge
      let cumulative = 0;
      for (const eid of edgeIds) {
        const p = this.bk.getEdgeCurveParameters(eid);
        const span = p[1]! - p[0]!;
        if (param <= cumulative + span || eid === edgeId) {
          edgeId = eid;
          evalParam = Math.min(p[0]! + (param - cumulative), p[1]!);
          break;
        }
        cumulative += span;
      }
    } else {
      edgeId = unwrap(shape, 'edge');
    }

    const result = this.bk.evaluateEdgeCurveD1(edgeId, evalParam);
    return {
      point: [result[0]!, result[1]!, result[2]!],
      tangent: [result[3]!, result[4]!, result[5]!],
    };
  }

  curveParameters(shape: KernelShape): [number, number] {
    const h = shape as BrepkitHandle;
    if (h.type === 'wire') {
      // For wires, compose a cumulative parameter range over all edges
      const edgeIds: number[] = toArray(this.bk.getWireEdges(h.id));
      if (edgeIds.length === 0) return [0, 0];
      let total = 0;
      for (const eid of edgeIds) {
        const p = this.bk.getEdgeCurveParameters(eid);
        total += p[1]! - p[0]!;
      }
      return [0, total];
    }
    const edgeId = unwrap(shape, 'edge');
    const params = this.bk.getEdgeCurveParameters(edgeId);
    return [params[0]!, params[1]!];
  }

  curvePointAtParam(shape: KernelShape, param: number): [number, number, number] {
    const h = shape as BrepkitHandle;
    if (h.type === 'wire') {
      // Walk edges to find the right one for the composite parameter
      const edgeIds: number[] = toArray(this.bk.getWireEdges(h.id));
      let cumulative = 0;
      for (const eid of edgeIds) {
        const p = this.bk.getEdgeCurveParameters(eid);
        const span = p[1]! - p[0]!;
        if (param <= cumulative + span || eid === edgeIds[edgeIds.length - 1]) {
          const localParam = p[0]! + (param - cumulative);
          const pt = this.bk.evaluateEdgeCurve(eid, Math.min(localParam, p[1]!));
          return [pt[0]!, pt[1]!, pt[2]!];
        }
        cumulative += span;
      }
      // Fallback: evaluate first edge at param
      const pt = this.bk.evaluateEdgeCurve(edgeIds[0]!, param);
      return [pt[0]!, pt[1]!, pt[2]!];
    }
    const edgeId = unwrap(shape, 'edge');
    const p = this.bk.evaluateEdgeCurve(edgeId, param);
    return [p[0]!, p[1]!, p[2]!];
  }

  curveIsClosed(shape: KernelShape): boolean {
    const h = shape as BrepkitHandle;
    if (h.type === 'wire') {
      // Collect all edge endpoints and check if they form a closed loop
      // (every endpoint appears an even number of times when edges connect)
      const edgeIds: number[] = toArray(this.bk.getWireEdges(h.id));
      if (edgeIds.length === 0) return false;

      // For a single-edge wire, check if edge start == edge end
      if (edgeIds.length === 1) {
        const verts = this.bk.getEdgeVertices(edgeIds[0]!);
        return dist3(verts[0]!, verts[1]!, verts[2]!, verts[3]!, verts[4]!, verts[5]!) < 1e-7;
      }

      // For multi-edge wires, collect all endpoints and check each has a partner
      const endpoints: Array<[number, number, number]> = [];
      for (const eid of edgeIds) {
        const verts = this.bk.getEdgeVertices(eid);
        endpoints.push([verts[0]!, verts[1]!, verts[2]!]);
        endpoints.push([verts[3]!, verts[4]!, verts[5]!]);
      }
      // Each vertex should appear exactly twice in a closed wire
      const unmatched: Array<[number, number, number]> = [];
      for (const pt of endpoints) {
        const matchIdx = unmatched.findIndex(
          (u) => dist3(u[0], u[1], u[2], pt[0], pt[1], pt[2]) < 1e-7
        );
        if (matchIdx >= 0) {
          unmatched.splice(matchIdx, 1);
        } else {
          unmatched.push(pt);
        }
      }
      return unmatched.length === 0;
    }
    // Check if edge start == end vertex
    const verts = this.bk.getEdgeVertices(unwrap(shape, 'edge'));
    return dist3(verts[0]!, verts[1]!, verts[2]!, verts[3]!, verts[4]!, verts[5]!) < 1e-7;
  }

  curveIsPeriodic(shape: KernelShape): boolean {
    // Periodic requires seamless parametric repetition. brepkit represents all
    // geometry as NURBS, so a closed single-edge curve (circle, ellipse, or
    // closed B-spline) is periodic. Multi-edge wires may be closed but not
    // periodic (e.g., a rectangular wire has C0 corners).
    const h = shape as BrepkitHandle;
    try {
      if (h.type === 'edge') return this.curveIsClosed(shape);
      if (h.type === 'wire') {
        const edgeIds: number[] = toArray(this.bk.getWireEdges(h.id));
        // Single-edge closed wire → periodic (e.g., circle)
        if (edgeIds.length === 1) return this.curveIsClosed(shape);
      }
    } catch {
      // not an edge/wire
    }
    return false;
  }

  curvePeriod(shape: KernelShape): number {
    try {
      if (this.curveIsPeriodic(shape)) {
        const bounds = this.curveParameters(shape);
        return bounds[1] - bounds[0];
      }
    } catch {
      // not an edge/wire
    }
    return 0;
  }

  curveType(shape: KernelShape): string {
    const h = shape as BrepkitHandle;
    // For wires, return the curve type of the first edge
    if (h.type === 'wire') {
      const edges = this.iterShapes(shape, 'edge');
      const first = edges[0];
      if (first) return this.bk.getEdgeCurveType(unwrap(first, 'edge'));
      return 'LINE';
    }
    return this.bk.getEdgeCurveType(unwrap(shape, 'edge'));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Simplification & repair
  // ═══════════════════════════════════════════════════════════════════════

  simplify(shape: KernelShape): KernelShape {
    // Run healing to merge coincident vertices and fix orientations
    if ((shape as BrepkitHandle).type === 'solid') {
      try {
        this.bk.healSolid(unwrap(shape));
      } catch (e: unknown) {
        // Healing can fail on complex topologies — return unchanged
        console.warn('brepkit: healing failed in simplify:', e);
      }
    }
    return shape;
  }

  isValid(shape: KernelShape): boolean {
    if (!isBrepkitHandle(shape)) return false;
    if (shape.type !== 'solid') return true;
    try {
      const errors: number = this.bk.validateSolidRelaxed(shape.id);
      return errors === 0;
    } catch (e: unknown) {
      console.warn('brepkit: isValid check failed:', e);
      return false;
    }
  }

  isValidStrict(shape: KernelShape): boolean {
    if (!isBrepkitHandle(shape)) return false;
    if (shape.type !== 'solid') return true;
    try {
      const errors: number = this.bk.validateSolid(shape.id);
      return errors === 0;
    } catch (e: unknown) {
      console.warn('brepkit: isValidStrict check failed:', e);
      return false;
    }
  }

  sew(shapes: KernelShape[], tolerance?: number): KernelShape {
    // Extract face IDs, expanding solids/shells to their constituent faces
    const faceIds: number[] = [];
    for (const s of shapes) {
      const h = s as BrepkitHandle;
      if (h.type === 'face') {
        faceIds.push(h.id);
      } else if (h.type === 'solid') {
        for (const fid of toArray(this.bk.getSolidFaces(h.id))) {
          faceIds.push(fid);
        }
      } else if (h.type === 'shell') {
        for (const fid of toArray(this.bk.getShellFaces(h.id))) {
          faceIds.push(fid);
        }
      }
    }
    const tol = tolerance ?? 1e-7;
    // brepkit's sew produces a solid directly. Return as shell handle so
    // callers expecting shell (weldShellsAndFaces) work. The solidFromShell
    // adapter method handles shell handles that are actually solid IDs.
    try {
      const id = this.bk.weldShellsAndFaces(faceIds, tol);
      return shellHandle(id);
    } catch (e: unknown) {
      console.warn('brepkit: weldShellsAndFaces failed, falling back to sewFaces:', e);
    }
    const id = this.bk.sewFaces(faceIds, tol);
    return shellHandle(id);
  }

  healSolid(shape: KernelShape): KernelShape | null {
    const h = shape as BrepkitHandle;
    if (h.type !== 'solid') {
      throw new Error(
        `brepkit: healSolid requires a solid, got ${h.type}. ` +
          'Consider using makeCompound() to combine shapes first.'
      );
    }
    try {
      // repairSolid is the comprehensive healer (0.4.3+), healSolid is the legacy in-place version
      const remaining = this.bk.repairSolid(unwrap(shape));
      if (remaining > 0) {
        console.warn(`brepkit: repairSolid left ${remaining} error(s) on solid.`);
      }
      return shape;
    } catch (e: unknown) {
      // Fall back to basic healSolid if repairSolid fails
      try {
        this.bk.healSolid(unwrap(shape));
        return shape;
      } catch (healErr: unknown) {
        console.warn(
          'brepkit: healSolid failed (repairSolid error:',
          e,
          ', healSolid error:',
          healErr,
          ')'
        );
        return null;
      }
    }
  }

  healFace(shape: KernelShape): KernelShape {
    return shape; // No-op: brepkit doesn't have face-level healing
  }

  healWire(wire: KernelShape, _face?: KernelShape): KernelShape {
    return wire; // No-op: brepkit doesn't have wire-level healing
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 2D offset
  // ═══════════════════════════════════════════════════════════════════════

  offsetWire2D(
    wire: KernelShape,
    offset: number,
    _joinType?: number | 'arc' | 'intersection' | 'tangent'
  ): KernelShape {
    // Collect wire vertex positions as 2D (XY) coordinates
    const edges = this.iterShapes(wire, 'edge');
    if (edges.length === 0) return wire;

    const coords2d: number[] = [];
    for (const edge of edges) {
      const verts = this.bk.getEdgeVertices(unwrap(edge, 'edge'));
      // Use start vertex of each edge (XY projection)
      coords2d.push(verts[0]!, verts[1]!);
    }
    if (coords2d.length < 6) return wire; // Need at least 3 vertices

    // Use brepkit's 2D polygon offset
    const result = this.bk.offsetPolygon2d(coords2d, offset, 1e-10);
    // Build new wire from offset points (as 3D with Z=0)
    const coords3d: number[] = [];
    for (let i = 0; i < result.length; i += 2) {
      coords3d.push(result[i]!, result[i + 1]!, 0);
    }
    const wireId: number = this.bk.makePolygonWire(coords3d);
    return wireHandle(wireId);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Distance
  // ═══════════════════════════════════════════════════════════════════════

  distance(shape1: KernelShape, shape2: KernelShape): DistanceResult {
    const h1 = shape1 as BrepkitHandle;
    const h2 = shape2 as BrepkitHandle;

    if (h1.type === 'solid' && h2.type === 'solid') {
      const buf = this.bk.solidToSolidDistance(h1.id, h2.id);
      return {
        value: buf[0]!,
        point1: [buf[1]!, buf[2]!, buf[3]!],
        point2: [buf[4]!, buf[5]!, buf[6]!],
      };
    }

    // Point to solid
    if (h1.type === 'vertex' && h2.type === 'solid') {
      const pos = this.bk.getVertexPosition(h1.id);
      const result = this.bk.pointToSolidDistance(pos[0]!, pos[1]!, pos[2]!, h2.id);
      return {
        value: result[0]!,
        point1: [pos[0]!, pos[1]!, pos[2]!],
        point2: [result[1]!, result[2]!, result[3]!],
      };
    }

    // Point-to-face distance
    if (h1.type === 'vertex' && h2.type === 'face') {
      const pos = this.bk.getVertexPosition(h1.id);
      const result = this.bk.pointToFaceDistance(pos[0]!, pos[1]!, pos[2]!, h2.id);
      return {
        value: result[0]!,
        point1: [pos[0]!, pos[1]!, pos[2]!],
        point2: [result[1]!, result[2]!, result[3]!],
      };
    }

    // Point-to-edge distance
    if (h1.type === 'vertex' && h2.type === 'edge') {
      const pos = this.bk.getVertexPosition(h1.id);
      const result = this.bk.pointToEdgeDistance(pos[0]!, pos[1]!, pos[2]!, h2.id);
      return {
        value: result[0]!,
        point1: [pos[0]!, pos[1]!, pos[2]!],
        point2: [result[1]!, result[2]!, result[3]!],
      };
    }

    // Fallback: use vertex positions for unsupported pairs
    const getPos = (s: BrepkitHandle): [number, number, number] => {
      if (s.type === 'vertex') {
        const p = this.bk.getVertexPosition(s.id);
        return [p[0]!, p[1]!, p[2]!];
      }
      // Use bounding box center as approximation
      if (s.type === 'solid') {
        const bb = this.bk.boundingBox(s.id);
        return [(bb[0]! + bb[3]!) / 2, (bb[1]! + bb[4]!) / 2, (bb[2]! + bb[5]!) / 2];
      }
      return [0, 0, 0];
    };
    const p1 = getPos(h1);
    const p2 = getPos(h2);
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const dz = p2[2] - p1[2];
    return { value: Math.sqrt(dx * dx + dy * dy + dz * dz), point1: p1, point2: p2 };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Classification
  // ═══════════════════════════════════════════════════════════════════════

  classifyPointOnFace(
    face: KernelShape,
    u: number,
    v: number,
    tolerance?: number
  ): 'in' | 'on' | 'out' {
    if (tolerance !== undefined) {
      warnOnce(
        'classify-tolerance',
        'classifyPointOnFace() tolerance parameter is not supported; brepkit uses domain-based classification.'
      );
    }
    // Evaluate the surface at (u,v) to get 3D point, then check if the
    // UV parameters are within the face's surface domain
    const faceId = unwrap(face, 'face');
    const domain = this.bk.getSurfaceDomain(faceId);
    // domain = [uMin, uMax, vMin, vMax]
    if (u < domain[0]! || u > domain[1]! || v < domain[2]! || v > domain[3]!) {
      return 'out';
    }
    return 'in';
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
  // Serialization
  // ═══════════════════════════════════════════════════════════════════════

  toBREP(shape: KernelShape): string {
    const h = shape as BrepkitHandle;
    if (h.type === 'solid') {
      return this.bk.toBREP(h.id);
    }
    // Non-solid shapes: fall back to STEP serialization
    warnOnce('brep-non-solid', 'toBREP for non-solid shapes uses STEP format.');
    return this.exportSTEP([shape]);
  }

  fromBREP(data: string): KernelShape {
    // Try native JSON round-trip if available and data is JSON
    if (typeof this.bk.fromBREP === 'function' && data.trimStart().startsWith('{')) {
      const id = this.bk.fromBREP(data);
      return solidHandle(id);
    }
    // Fallback to STEP import
    const shapes = this.importSTEP(data);
    const first = shapes[0];
    if (!first) throw new Error('brepkit: fromBREP produced no shapes');
    return first;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Mesh preparation
  // ═══════════════════════════════════════════════════════════════════════

  hasTriangulation(_shape: KernelShape): boolean {
    return false; // brepkit tessellates on demand
  }

  meshShape(_shape: KernelShape, _tolerance: number, _angularTolerance: number): void {
    // No-op: brepkit doesn't cache triangulation
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Composed transforms
  // ═══════════════════════════════════════════════════════════════════════

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
    // Benchmarked: JS matrix multiply is ~5x faster than bk.composeTransforms()
    // because the WASM boundary crossing cost exceeds the trivial 4×4 computation.
    let matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    for (const op of ops) {
      const m =
        op.type === 'translate'
          ? translationMatrix(op.x, op.y, op.z)
          : rotationMatrix(op.angle, op.axis, op.center);
      matrix = multiplyMatrices(m, matrix);
    }
    return { handle: matrix, dispose: () => {} };
  }

  applyComposedTransformWithHistory(
    shape: KernelShape,
    transformHandle: KernelType,
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult {
    const result = this.applyMatrix(shape, transformHandle as number[]);
    return this.buildEvolution(result, inputFaceHashes, hashUpperBound, true);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Advanced sweep/loft
  // ═══════════════════════════════════════════════════════════════════════

  sweepPipeShell(
    profile: KernelShape,
    spine: KernelShape,
    options?: Record<string, unknown>
  ): KernelShape | { shape: KernelShape; firstShape: KernelShape; lastShape: KernelShape } {
    const profileHandle = profile as BrepkitHandle;
    const faceId =
      profileHandle.type === 'wire'
        ? this.bk.makeFaceFromWire(profileHandle.id)
        : unwrap(profile, 'face');

    const shellMode = !!(options && options['shellMode']);

    const transitionMode = options?.['transitionMode'] as string | undefined;
    const contactMode = transitionMode ? mapStringTransition(transitionMode) : undefined;

    if (contactMode) {
      const spineHandle = spine as BrepkitHandle;
      if (spineHandle.type !== 'wire') {
        try {
          const edgeId = unwrap(spine, 'edge');
          const shape = solidHandle(
            this.bk.sweepWithOptions(faceId, edgeId, contactMode, [], 0, 'transformed')
          );
          if (shellMode) return { shape, firstShape: profile, lastShape: profile };
          return shape;
        } catch (e: unknown) {
          console.warn(
            'brepkit: sweepWithOptions failed, falling back to sweepSmooth/simplePipe:',
            e
          );
        }
      } else {
        const edges = this.iterShapes(spine, 'edge');
        if (edges.length === 1) {
          const first = edges[0];
          if (first) {
            try {
              const edgeId = unwrap(first, 'edge');
              const shape = solidHandle(
                this.bk.sweepWithOptions(faceId, edgeId, contactMode, [], 0, 'transformed')
              );
              if (shellMode) return { shape, firstShape: profile, lastShape: profile };
              return shape;
            } catch (e: unknown) {
              console.warn(
                'brepkit: sweepWithOptions failed, falling back to sweepSmooth/simplePipe:',
                e
              );
            }
          }
        } else {
          warnOnce(
            'sweepPipeShell-transition-multi-edge',
            'sweepPipeShell transition mode not supported for multi-edge wires; ignored.'
          );
        }
      }
    }

    const nurbsData = this.extractNurbsFromEdge(spine);
    if (nurbsData && nurbsData.degree > 1) {
      try {
        const id = this.bk.sweepSmooth(
          faceId,
          nurbsData.degree,
          nurbsData.knots,
          nurbsData.controlPoints,
          nurbsData.weights
        );
        const shape = solidHandle(id);
        if (shellMode) return { shape, firstShape: profile, lastShape: profile };
        return shape;
      } catch (e: unknown) {
        console.warn('brepkit: sweepSmooth failed, falling back to simplePipe:', e);
      }
    }
    const shape = this.simplePipe(profile, spine);
    if (shellMode) return { shape, firstShape: profile, lastShape: profile };
    return shape;
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
    // Build face IDs once and reuse across attempts to avoid leaking
    // WASM face handles from makeFaceFromWire on each failed path.
    const faceIds: number[] = wires.map((w) => {
      const h = w as BrepkitHandle;
      if (h.type === 'wire') return this.bk.makeFaceFromWire(h.id);
      return unwrap(w, 'face');
    });

    // Try the native loftWithOptions API which supports ruled, solid, tolerance
    try {
      const opts: Record<string, unknown> = {};
      if (options?.ruled !== undefined) opts['ruled'] = options.ruled;
      if (options?.solid !== undefined) opts['solid'] = options.solid;
      if (options?.tolerance !== undefined) opts['tolerance'] = options.tolerance;
      if (options?.startVertex) {
        const pos = this.bk.getVertexPosition(unwrap(options.startVertex, 'vertex'));
        opts['startPoint'] = [pos[0], pos[1], pos[2]];
      }
      if (options?.endVertex) {
        const pos = this.bk.getVertexPosition(unwrap(options.endVertex, 'vertex'));
        opts['endPoint'] = [pos[0], pos[1], pos[2]];
      }
      const id = this.bk.loftWithOptions(faceIds, JSON.stringify(opts));
      return solidHandle(id);
    } catch (e: unknown) {
      console.warn('brepkit: loftWithOptions failed, falling back to smooth/basic loft:', e);
    }

    if (!options?.ruled) {
      try {
        const id = this.bk.loftSmooth(faceIds);
        return solidHandle(id);
      } catch (e: unknown) {
        console.warn('brepkit: loftSmooth failed, falling back to basic loft:', e);
      }
    }
    return this.loft(wires);
  }

  buildExtrusionLaw(profile: 'linear' | 's-curve', length: number, endFactor: number): KernelType {
    // Return a law object that can be used by sweepPipeShell.
    // Trim returns a new law with narrowed domain — brepkit ignores trimming.
    const law = {
      type: 'extrusionLaw',
      profile,
      length,
      endFactor,
      Trim(_first: number, _last: number, _tol: number) {
        return law;
      },
      delete: noop,
    };
    return law;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Curve positioning & patterns
  // ═══════════════════════════════════════════════════════════════════════

  positionOnCurve(shape: KernelShape, spine: KernelShape, param: number): KernelShape {
    // Evaluate point and tangent on spine, build a Frenet frame transform
    const { point, tangent } = this.curveTangent(spine, param);
    // Build rotation from Z-axis to tangent direction
    const [tx, ty, tz] = tangent;
    const len = Math.sqrt(tx * tx + ty * ty + tz * tz);
    if (len < 1e-12) return this.translate(shape, point[0], point[1], point[2]);

    const nx = tx / len,
      ny = ty / len,
      nz = tz / len;
    // Rodrigues rotation from [0,0,1] to [nx,ny,nz]
    const dot = nz;
    let result = shape;
    if (Math.abs(dot + 1) < 1e-10) {
      result = this.rotate(result, 180, [1, 0, 0]);
    } else if (Math.abs(dot - 1) > 1e-10) {
      const axis: [number, number, number] = [-ny, nx, 0];
      const angleDeg = Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI);
      result = this.rotate(result, angleDeg, axis);
    }
    return this.translate(result, point[0], point[1], point[2]);
  }

  linearPattern(
    shape: KernelShape,
    direction: [number, number, number],
    spacing: number,
    count: number
  ): KernelShape[] {
    const results: KernelShape[] = [shape];
    for (let i = 1; i < count; i++) {
      const offset = spacing * i;
      results.push(
        this.translate(shape, direction[0] * offset, direction[1] * offset, direction[2] * offset)
      );
    }
    return results;
  }

  circularPattern(
    shape: KernelShape,
    center: [number, number, number],
    axis: [number, number, number],
    angleStep: number,
    count: number
  ): KernelShape[] {
    const results: KernelShape[] = [shape];
    for (let i = 1; i < count; i++) {
      results.push(this.rotate(shape, angleStep * i, axis, center));
    }
    return results;
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
    const id = this.bk.gridPattern(
      unwrapSolidOrThrow(shape, 'gridPattern'),
      directionX[0],
      directionX[1],
      directionX[2],
      directionY[0],
      directionY[1],
      directionY[2],
      spacingX,
      spacingY,
      countX,
      countY
    );
    return compoundHandle(id);
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
  // Repair
  // ═══════════════════════════════════════════════════════════════════════

  fixShape(shape: KernelShape): KernelShape {
    const h = shape as BrepkitHandle;
    if (h.type === 'solid') {
      this.bk.healSolid(h.id);
    }
    return shape;
  }

  fixSelfIntersection(wire: KernelShape): KernelShape {
    // Wire-level self-intersection fixing not yet available in brepkit
    return wire;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Measurement (advanced)
  // ═══════════════════════════════════════════════════════════════════════

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
    const fid = unwrap(face, 'face');
    // Native API: [k1, k2, d1x, d1y, d1z, d2x, d2y, d2z]
    const data: Float64Array = this.bk.measureCurvatureAtSurface(fid, u, v);
    if (data.length < 8) {
      throw new Error(
        `brepkit: measureCurvatureAtSurface returned ${data.length} values, expected 8`
      );
    }
    const k1 = data[0]!;
    const k2 = data[1]!;
    const gaussian = k1 * k2;
    const mean = (k1 + k2) / 2;
    return {
      gaussian,
      mean,
      max: Math.max(k1, k2),
      min: Math.min(k1, k2),
      maxDirection: [data[2]!, data[3]!, data[4]!],
      minDirection: [data[5]!, data[6]!, data[7]!],
    };
  }

  surfaceCenterOfMass(face: KernelShape): [number, number, number] {
    // Area-weighted centroid via tessellation
    const mesh = this.bk.tessellateFace(unwrap(face, 'face'), 0.1);
    const pos = mesh.positions;
    const idx = mesh.indices;
    let cx = 0,
      cy = 0,
      cz = 0,
      totalArea = 0;
    for (let t = 0; t < idx.length; t += 3) {
      const i0 = idx[t]! * 3,
        i1 = idx[t + 1]! * 3,
        i2 = idx[t + 2]! * 3;
      const tcx = (pos[i0]! + pos[i1]! + pos[i2]!) / 3;
      const tcy = (pos[i0 + 1]! + pos[i1 + 1]! + pos[i2 + 1]!) / 3;
      const tcz = (pos[i0 + 2]! + pos[i1 + 2]! + pos[i2 + 2]!) / 3;
      const ux = pos[i1]! - pos[i0]!,
        uy = pos[i1 + 1]! - pos[i0 + 1]!,
        uz = pos[i1 + 2]! - pos[i0 + 2]!;
      const vx = pos[i2]! - pos[i0]!,
        vy = pos[i2 + 1]! - pos[i0 + 1]!,
        vz = pos[i2 + 2]! - pos[i0 + 2]!;
      const area =
        0.5 *
        Math.sqrt((uy * vz - uz * vy) ** 2 + (uz * vx - ux * vz) ** 2 + (ux * vy - uy * vx) ** 2);
      cx += tcx * area;
      cy += tcy * area;
      cz += tcz * area;
      totalArea += area;
    }
    if (totalArea < 1e-30) return [0, 0, 0];
    return [cx / totalArea, cy / totalArea, cz / totalArea];
  }

  createDistanceQuery(referenceShape: KernelShape): {
    distanceTo(shape: KernelShape): {
      value: number;
      point1: [number, number, number];
      point2: [number, number, number];
    };
    dispose(): void;
  } {
    const distanceFn = (shape: KernelShape) => this.distance(referenceShape, shape);
    return {
      distanceTo(shape: KernelShape) {
        return distanceFn(shape);
      },
      dispose() {
        // No-op: arena-based
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Projection
  // ═══════════════════════════════════════════════════════════════════════

  projectEdges(
    shape: KernelShape,
    _cameraOrigin: [number, number, number],
    _cameraDirection: [number, number, number],
    _cameraXAxis?: [number, number, number]
  ): {
    visible: { outline: KernelShape; smooth: KernelShape; sharp: KernelShape };
    hidden: { outline: KernelShape; smooth: KernelShape; sharp: KernelShape };
  } {
    // Simplified: return all edges as visible outlines, no hidden line removal
    const edges = this.iterShapes(shape, 'edge');
    const emptyCompound = edges.length > 0 ? edges[0] : shape;
    return {
      visible: { outline: emptyCompound, smooth: emptyCompound, sharp: emptyCompound },
      hidden: { outline: emptyCompound, smooth: emptyCompound, sharp: emptyCompound },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Draft
  // ═══════════════════════════════════════════════════════════════════════

  draftPrism(
    shape: KernelShape,
    face: KernelShape,
    _baseFace: KernelShape,
    height: number | null,
    _angleDeg: number,
    fuse: boolean
  ): KernelShape {
    // brepkit has a draft operation that applies draft angle to faces
    // For draftPrism, we extrude with a draft angle
    if (height !== null) {
      // Extrude the face, then draft
      const normal = this.surfaceNormal(face, 0, 0);
      const extruded = this.extrude(face, normal, height);
      if (fuse) {
        return this.fuse(shape, extruded);
      }
      return extruded;
    }
    // Without height, just apply draft to the shape
    return shape;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // XCAF / configured export
  // ═══════════════════════════════════════════════════════════════════════

  createXCAFDocument(
    shapes: Array<{ shape: KernelShape; name: string; color?: [number, number, number, number] }>
  ): KernelType {
    // brepkit doesn't have XCAF — store as plain object for writeXCAFToSTEP
    return { __brepkit_xcaf: true, shapes, delete: noop };
  }

  writeXCAFToSTEP(doc: KernelType, _options?: { unit?: string; modelUnit?: string }): string {
    // Extract shapes from the XCAF document object and export as STEP
    if (doc && doc.__brepkit_xcaf && Array.isArray(doc.shapes)) {
      return this.exportSTEP(doc.shapes.map((s: { shape: KernelShape }) => s.shape));
    }
    return '';
  }

  exportSTEPConfigured(
    shapes: Array<{ shape: KernelShape; name?: string; color?: [number, number, number, number] }>,
    _options?: { unit?: string; modelUnit?: string; schema?: number }
  ): string {
    // Fall back to basic STEP export (no names/colors)
    return this.exportSTEP(shapes.map((s) => s.shape));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Export helpers
  // ═══════════════════════════════════════════════════════════════════════

  wrapString(str: string): KernelType {
    return str;
  }

  wrapColor(red: number, green: number, blue: number, alpha: number): KernelType {
    return [red, green, blue, alpha];
  }

  configureStepUnits(_unit: string | undefined, _modelUnit: string | undefined): void {
    // no-op
  }

  configureStepWriter(_writer: KernelType): void {
    // no-op
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Curve adaptor
  // ═══════════════════════════════════════════════════════════════════════

  createCurveAdaptor(shape: KernelShape): KernelType {
    // Return the edge handle itself — it can be used with curveTangent/curvePointAtParam
    return shape;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Bezier pole extraction
  // ═══════════════════════════════════════════════════════════════════════

  getBezierPenultimatePole(edge: KernelShape): [number, number, number] | null {
    const nurbsData = this.extractNurbsFromEdge(edge);
    if (!nurbsData || nurbsData.controlPoints.length < 6) return null;
    // Penultimate = second-to-last control point
    const n = nurbsData.controlPoints.length;
    return [
      nurbsData.controlPoints[n - 6]!,
      nurbsData.controlPoints[n - 5]!,
      nurbsData.controlPoints[n - 4]!,
    ];
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Surface geometry extraction
  // ═══════════════════════════════════════════════════════════════════════

  getSurfaceCylinderData(surface: KernelType): { radius: number; isDirect: boolean } | null {
    if (isBrepkitHandle(surface) && surface.type === 'face') {
      const faceId = surface.id;
      const params = JSON.parse(this.bk.getAnalyticSurfaceParams(faceId));
      if (params.type === 'cylinder') {
        return { radius: params.radius, isDirect: true };
      }
    }
    return null;
  }

  reverseSurfaceU(surface: KernelType): KernelType {
    return surface; // No-op: brepkit doesn't have separate surface handle direction
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 3D geometry primitive factories
  // ═══════════════════════════════════════════════════════════════════════

  createPoint3d(x: number, y: number, z: number): KernelType {
    return { x, y, z };
  }

  createDirection3d(x: number, y: number, z: number): KernelType {
    const len = Math.sqrt(x * x + y * y + z * z);
    return { x: x / len, y: y / len, z: z / len };
  }

  createVector3d(x: number, y: number, z: number): KernelType {
    return { x, y, z };
  }

  createAxis1(cx: number, cy: number, cz: number, dx: number, dy: number, dz: number): KernelType {
    return { origin: [cx, cy, cz], direction: [dx, dy, dz] };
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
    return {
      origin: [ox, oy, oz],
      z: [zx, zy, zz],
      x: xx !== undefined ? [xx, xy, xz] : undefined,
    };
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
    return {
      origin: [ox, oy, oz],
      z: [zx, zy, zz],
      x: xx !== undefined ? [xx, xy, xz] : undefined,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Shape reversal
  // ═══════════════════════════════════════════════════════════════════════

  reverseShape(shape: KernelShape): KernelShape {
    const h = shape as BrepkitHandle;
    const newId = this.bk.reverseShape(h.id);
    return handle(h.type, newId);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Dispose
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Create an arena checkpoint. Returns checkpoint index.
   * Use {@link restoreCheckpoint} to roll back or {@link discardCheckpoint} to keep.
   */
  checkpoint(): number {
    return this.bk.checkpoint();
  }

  /** Get the current number of active checkpoints. */
  checkpointCount(): number {
    return this.bk.checkpointCount();
  }

  /** Restore arena to a checkpoint, freeing all handles created after it. */
  restoreCheckpoint(cp: number): void {
    this.bk.restore(cp);
  }

  /** Discard a checkpoint without restoring (keep all handles). */
  discardCheckpoint(cp: number): void {
    this.bk.discardCheckpoint(cp);
  }

  dispose(_handle: { delete(): void }): void {
    // Arena-based: individual handles are not freed.
    // Call brepkitKernel.free() to release the entire arena.
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

  // ═══════════════════════════════════════════════════════════════════════
  // Private helpers
  // ═══════════════════════════════════════════════════════════════════════

  private applyMatrix(shape: KernelShape, matrix: number[]): KernelShape {
    const h = shape as BrepkitHandle;
    if (!isBrepkitHandle(shape)) {
      throw new Error('brepkit: applyMatrix requires a BrepkitHandle');
    }
    switch (h.type) {
      case 'solid': {
        const copy = this.bk.copySolid(h.id);
        this.bk.transformSolid(copy, matrix);
        return solidHandle(copy);
      }
      case 'face': {
        if (typeof this.bk.copyFace !== 'function' || typeof this.bk.transformFace !== 'function') {
          throw new Error(
            'brepkit: applyMatrix for faces requires copyFace/transformFace WASM exports'
          );
        }
        const copy = this.bk.copyFace(h.id);
        this.bk.transformFace(copy, matrix);
        return faceHandle(copy);
      }
      case 'wire': {
        if (typeof this.bk.copyWire !== 'function' || typeof this.bk.transformWire !== 'function') {
          throw new Error(
            'brepkit: applyMatrix for wires requires copyWire/transformWire WASM exports'
          );
        }
        const copy = this.bk.copyWire(h.id);
        this.bk.transformWire(copy, matrix);
        return wireHandle(copy);
      }
      case 'edge': {
        if (typeof this.bk.copyEdge !== 'function' || typeof this.bk.transformEdge !== 'function') {
          throw new Error(
            'brepkit: applyMatrix for edges requires copyEdge/transformEdge WASM exports'
          );
        }
        const copy = this.bk.copyEdge(h.id);
        this.bk.transformEdge(copy, matrix);
        return edgeHandle(copy);
      }
      default:
        throw new Error(`brepkit: applyMatrix does not support '${h.type}' shapes`);
    }
  }

  /** Tessellate a solid with per-face groups for brepjs mesh format. */
  private meshSolid(solidId: number, deflection: number, includeUVs: boolean): KernelMeshResult {
    try {
      return this.meshSolidGrouped(solidId, deflection, includeUVs);
    } catch (e: unknown) {
      console.warn(
        `brepkit: tessellateSolidGrouped failed (solidId=${solidId}), falling back to per-face:`,
        e
      );
      return this.meshSolidPerFace(solidId, deflection);
    }
  }

  /**
   * Batch tessellation via `tessellateSolidGrouped` — single WASM call for
   * all faces. Falls back to `meshSolidPerFace` on error.
   *
   * When `includeUVs` is true, makes an additional `tessellateSolidUV` call
   * to populate real surface parametrization coordinates.
   */
  private meshSolidGrouped(
    solidId: number,
    deflection: number,
    includeUVs: boolean
  ): KernelMeshResult {
    // Always use tessellateSolidGrouped for geometry + per-face group info.
    // When UVs are requested, additionally call tessellateSolidUV for the
    // UV array, with a length check to guard against tessellation divergence.
    const json = this.bk.tessellateSolidGrouped(solidId, deflection);
    const data: {
      positions: number[];
      normals: number[];
      indices: number[];
      faceOffsets: number[];
    } = JSON.parse(json);

    const faceIds = toArray(this.bk.getSolidFaces(solidId));
    const groupCount = data.faceOffsets.length - 1;
    if (groupCount !== faceIds.length) {
      throw new Error(
        `faceOffsets/faceIds length mismatch: ${groupCount} groups vs ${faceIds.length} faces`
      );
    }
    const faceGroups: Array<{ start: number; count: number; faceHash: number }> = [];
    for (let i = 0; i < data.faceOffsets.length - 1; i++) {
      const start = data.faceOffsets[i]!;
      const count = data.faceOffsets[i + 1]! - start;
      if (count === 0) continue; // degenerate face — skip
      faceGroups.push({
        start,
        count,
        faceHash: faceIds[i] ?? 0,
      });
    }

    // Fetch real UV coordinates when requested
    let uvs = new Float32Array(0);
    if (includeUVs) {
      const expectedUvLen = (data.positions.length / 3) * 2;
      try {
        const uvJson = this.bk.tessellateSolidUV(solidId, deflection);
        const uvData: { uvs: number[] } = JSON.parse(uvJson);
        if (uvData.uvs.length === expectedUvLen) {
          uvs = new Float32Array(uvData.uvs);
        } else {
          // Tessellation diverged — vertex counts don't match
          uvs = new Float32Array(expectedUvLen);
        }
      } catch {
        uvs = new Float32Array(expectedUvLen);
      }
    }

    return {
      vertices: new Float32Array(data.positions),
      normals: new Float32Array(data.normals),
      triangles: new Uint32Array(data.indices),
      uvs,
      faceGroups,
    };
  }

  /** Per-face tessellation fallback — N WASM calls, one per face. */
  private meshSolidPerFace(solidId: number, deflection: number): KernelMeshResult {
    const faceIds = toArray(this.bk.getSolidFaces(solidId));

    const allVertices: number[] = [];
    const allNormals: number[] = [];
    const allTriangles: number[] = [];
    const allUVs: number[] = [];
    const faceGroups: Array<{ start: number; count: number; faceHash: number }> = [];

    let vertexOffset = 0;

    for (const faceId of faceIds) {
      try {
        const faceMesh = this.bk.tessellateFace(faceId, deflection);
        const positions = faceMesh.positions;
        const normals = faceMesh.normals;
        const indices = faceMesh.indices;
        const vertCount = positions.length / 3;

        if (vertCount === 0) continue;

        const triStart = allTriangles.length;

        for (const v of positions) allVertices.push(v);
        for (const n of normals) allNormals.push(n);

        for (const idx of indices) {
          allTriangles.push(idx + vertexOffset);
        }

        for (let i = 0; i < vertCount; i++) {
          allUVs.push(0, 0);
        }

        faceGroups.push({
          start: triStart,
          count: indices.length,
          faceHash: faceId,
        });

        vertexOffset += vertCount;
      } catch (e: unknown) {
        console.warn(`brepkit: face tessellation failed (faceId=${faceId}):`, e);
      }
    }

    return {
      vertices: new Float32Array(allVertices),
      normals: new Float32Array(allNormals),
      triangles: new Uint32Array(allTriangles),
      uvs: new Float32Array(allUVs),
      faceGroups,
    };
  }

  /** Tessellate a single face and return brepjs mesh format. */
  private meshSingleFace(faceId: number, deflection: number, faceHash: number): KernelMeshResult {
    const faceMesh = this.bk.tessellateFace(faceId, deflection);
    const positions = faceMesh.positions;
    const normals = faceMesh.normals;
    const indices = faceMesh.indices;
    const vertCount = positions.length / 3;

    const uvs: number[] = [];
    for (let i = 0; i < vertCount; i++) {
      uvs.push(0, 0);
    }

    return {
      vertices: new Float32Array(positions),
      normals: new Float32Array(normals),
      triangles: new Uint32Array(indices),
      uvs: new Float32Array(uvs),
      faceGroups: [{ start: 0, count: indices.length, faceHash }],
    };
  }

  /**
   * Extract NURBS curve data from an edge handle.
   * Returns null for line edges (caller can build a linear NURBS).
   * Returns {degree, knots, controlPoints, weights} for NURBS edges.
   */
  private extractNurbsFromEdge(
    shape: KernelShape
  ): { degree: number; knots: number[]; controlPoints: number[]; weights: number[] } | null {
    const h = shape as BrepkitHandle;
    if (h.type !== 'edge') return null;

    // Try to get NURBS data from the edge
    const nurbsJson = this.bk.getEdgeNurbsData(h.id);
    if (nurbsJson) {
      const data = JSON.parse(nurbsJson);
      return {
        degree: data.degree,
        knots: data.knots,
        controlPoints: data.controlPoints,
        weights: data.weights,
      };
    }

    // Line edge: build a degree-1 NURBS from vertices
    const verts = this.bk.getEdgeVertices(h.id);
    return {
      degree: 1,
      knots: [0, 0, 1, 1],
      controlPoints: [verts[0]!, verts[1]!, verts[2]!, verts[3]!, verts[4]!, verts[5]!],
      weights: [1, 1],
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Constraint sketch solver (brepkit-only capability)
  // ═══════════════════════════════════════════════════════════════════════

  /** Create a new constraint sketch. Returns an opaque sketch handle. */
  sketchNew(): number {
    return this.bk.sketchNew();
  }

  /** Add a point to a constraint sketch. Returns the point index. */
  sketchAddPoint(sketch: number, x: number, y: number, fixed: boolean): number {
    return this.bk.sketchAddPoint(sketch, x, y, fixed);
  }

  /** Add a constraint to a sketch (JSON-encoded constraint descriptor). */
  sketchAddConstraint(sketch: number, constraintJson: string): void {
    this.bk.sketchAddConstraint(sketch, constraintJson);
  }

  /**
   * Solve sketch constraints. Returns a JSON result with solved point positions.
   * @param maxIterations — solver iteration limit (e.g. 100)
   * @param tolerance — convergence tolerance (e.g. 1e-10)
   */
  sketchSolve(sketch: number, maxIterations: number, tolerance: number): string {
    return this.bk.sketchSolve(sketch, maxIterations, tolerance);
  }

  /** Get degrees of freedom remaining in a solved or partially-constrained sketch. */
  sketchDof(sketch: number): string {
    return this.bk.sketchDof(sketch);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Extended I/O formats
  // ═══════════════════════════════════════════════════════════════════════

  export3MF(shape: KernelShape, tolerance: number): ArrayBuffer {
    const solidId = unwrapSolidOrThrow(shape, 'export3MF');
    return copyWasmBytes(this.bk.export3mf(solidId, tolerance));
  }

  exportGLB(shape: KernelShape, tolerance: number): ArrayBuffer {
    const solidId = unwrapSolidOrThrow(shape, 'exportGLB');
    return copyWasmBytes(this.bk.exportGlb(solidId, tolerance));
  }

  exportOBJ(shape: KernelShape, tolerance: number): ArrayBuffer {
    const solidId = unwrapSolidOrThrow(shape, 'exportOBJ');
    return copyWasmBytes(this.bk.exportObj(solidId, tolerance));
  }

  exportPLY(shape: KernelShape, tolerance: number): ArrayBuffer {
    const solidId = unwrapSolidOrThrow(shape, 'exportPLY');
    return copyWasmBytes(this.bk.exportPly(solidId, tolerance));
  }

  import3MF(data: ArrayBuffer): KernelShape[] {
    const result = toArray(this.bk.import3mf(new Uint8Array(data)));
    return result.map((id) => solidHandle(id));
  }

  importOBJ(data: ArrayBuffer): KernelShape {
    const result = this.bk.importObj(new Uint8Array(data));
    return solidHandle(result);
  }

  importGLB(data: ArrayBuffer): KernelShape {
    const result = this.bk.importGlb(new Uint8Array(data));
    return solidHandle(result);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Advanced modeling
  // ═══════════════════════════════════════════════════════════════════════

  filletVariable(shape: KernelShape, spec: string): KernelShape {
    const solidId = unwrapSolidOrThrow(shape, 'filletVariable');
    return solidHandle(this.bk.filletVariable(solidId, spec));
  }

  helicalSweep(
    profile: KernelShape,
    axisOrigin: [number, number, number],
    axisDirection: [number, number, number],
    radius: number,
    pitch: number,
    turns: number
  ): KernelShape {
    const profileId = unwrap(profile, 'face');
    return solidHandle(
      this.bk.helicalSweep(
        profileId,
        axisOrigin[0],
        axisOrigin[1],
        axisOrigin[2],
        axisDirection[0],
        axisDirection[1],
        axisDirection[2],
        radius,
        pitch,
        turns
      )
    );
  }

  sweepWithOptions(
    profile: KernelShape,
    pathEdge: KernelShape,
    contactMode: string,
    scaleValues: number[],
    segments: number
  ): KernelShape {
    const profileId = unwrap(profile, 'face');
    const pathId = unwrap(pathEdge, 'edge');
    return solidHandle(
      this.bk.sweepWithOptions(profileId, pathId, contactMode, scaleValues, segments, 'transformed')
    );
  }

  draft(
    shape: KernelShape,
    faces: KernelShape[],
    pullDirection: [number, number, number],
    neutralPlane: [number, number, number],
    angleDeg: number | ((face: KernelShape) => number)
  ): KernelShape {
    const [dx, dy, dz] = pullDirection;
    const [nx, ny, nz] = neutralPlane;

    if (typeof angleDeg === 'function') {
      // Resolve per-face angles; brepkit only supports a single uniform angle
      // per draft call (face IDs become stale after each call), so we require
      // all callback-returned angles to be the same value.
      const faceIds: number[] = [];
      let uniformAngle: number | undefined;
      for (const face of faces) {
        const angle = angleDeg(face);
        faceIds.push(unwrap(face, 'face'));
        if (uniformAngle === undefined) {
          uniformAngle = angle;
        } else if (angle !== uniformAngle) {
          throw new Error(
            'brepkit does not support variable draft with multiple distinct angles. ' +
              'Use the OCCT kernel for per-face angle variation, or use a uniform angle.'
          );
        }
      }
      if (uniformAngle === undefined) {
        throw new Error('draft: no faces provided');
      }
      const solidId = unwrapSolidOrThrow(shape, 'draft');
      return solidHandle(this.bk.draft(solidId, faceIds, dx, dy, dz, nx, ny, nz, uniformAngle));
    }

    const solidId = unwrapSolidOrThrow(shape, 'draft');
    const faceIds = faces.map((f) => unwrap(f, 'face'));
    return solidHandle(this.bk.draft(solidId, faceIds, dx, dy, dz, nx, ny, nz, angleDeg));
  }

  defeature(shape: KernelShape, faces: KernelShape[]): KernelShape {
    const solidId = unwrapSolidOrThrow(shape, 'defeature');
    const faceIds = faces.map((f) => unwrap(f, 'face'));
    return solidHandle(this.bk.defeature(solidId, faceIds));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Feature detection
  // ═══════════════════════════════════════════════════════════════════════

  detectSmallFeatures(shape: KernelShape, areaThreshold: number, tolerance: number): KernelShape[] {
    const solidId = unwrapSolidOrThrow(shape, 'detectSmallFeatures');
    return Array.from(this.bk.detectSmallFeatures(solidId, areaThreshold, tolerance)).map((id) =>
      faceHandle(id)
    );
  }

  recognizeFeatures(shape: KernelShape, tolerance: number): string {
    const solidId = unwrapSolidOrThrow(shape, 'recognizeFeatures');
    return this.bk.recognizeFeatures(solidId, tolerance);
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
  // Topology queries
  // ═══════════════════════════════════════════════════════════════════════

  edgeToFaceMap(shape: KernelShape): string {
    const solidId = unwrapSolidOrThrow(shape, 'edgeToFaceMap');
    return this.bk.edgeToFaceMap(solidId);
  }

  sharedEdges(faceA: KernelShape, faceB: KernelShape): KernelShape[] {
    const aId = unwrap(faceA, 'face');
    const bId = unwrap(faceB, 'face');
    return Array.from(this.bk.sharedEdges(aId, bId)).map((id) => edgeHandle(id));
  }

  adjacentFaces(shape: KernelShape, face: KernelShape): KernelShape[] {
    const solidId = unwrapSolidOrThrow(shape, 'adjacentFaces');
    const faceId = unwrap(face, 'face');
    return Array.from(this.bk.adjacentFaces(solidId, faceId)).map((id) => faceHandle(id));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // NURBS curve operations
  // ═══════════════════════════════════════════════════════════════════════

  curveDegreeElevate(edge: KernelShape, elevateBy: number): KernelShape {
    const edgeId = unwrap(edge, 'edge');
    return edgeHandle(this.bk.curveDegreeElevate(edgeId, elevateBy));
  }

  curveKnotInsert(edge: KernelShape, knot: number, times: number): KernelShape {
    const edgeId = unwrap(edge, 'edge');
    return edgeHandle(this.bk.curveKnotInsert(edgeId, knot, times));
  }

  curveKnotRemove(edge: KernelShape, knot: number, tolerance: number): KernelShape {
    const edgeId = unwrap(edge, 'edge');
    return edgeHandle(this.bk.curveKnotRemove(edgeId, knot, tolerance));
  }

  curveSplit(edge: KernelShape, param: number): [KernelShape, KernelShape] {
    const edgeId = unwrap(edge, 'edge');
    const result = this.bk.curveSplit(edgeId, param);
    return [edgeHandle(result[0]!), edgeHandle(result[1]!)];
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
    return faceHandle(
      this.bk.approximateSurfaceLspia(
        coords,
        rows,
        cols,
        degreeU,
        degreeV,
        numCpsU,
        numCpsV,
        tolerance,
        maxIterations
      )
    );
  }

  untrimFace(face: KernelShape, samplesPerCurve: number, interiorSamples: number): KernelShape {
    const faceId = unwrap(face, 'face');
    return faceHandle(this.bk.untrimFace(faceId, samplesPerCurve, interiorSamples));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Validation / Repair
  // ═══════════════════════════════════════════════════════════════════════

  mergeCoincidentVertices(shape: KernelShape, tolerance: number): number {
    const solidId = unwrapSolidOrThrow(shape, 'mergeCoincidentVertices');
    return this.bk.mergeCoincidentVertices(solidId, tolerance);
  }

  removeDegenerateEdges(shape: KernelShape, tolerance: number): number {
    const solidId = unwrapSolidOrThrow(shape, 'removeDegenerateEdges');
    return this.bk.removeDegenerateEdges(solidId, tolerance);
  }

  fixFaceOrientations(shape: KernelShape): number {
    const solidId = unwrapSolidOrThrow(shape, 'fixFaceOrientations');
    return this.bk.fixFaceOrientations(solidId);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Classification
  // ═══════════════════════════════════════════════════════════════════════

  classifyPointRobust(
    shape: KernelShape,
    point: [number, number, number],
    tolerance: number
  ): string {
    const solidId = unwrapSolidOrThrow(shape, 'classifyPointRobust');
    return this.bk.classifyPointRobust(solidId, point[0], point[1], point[2], tolerance);
  }

  classifyPointWinding(
    shape: KernelShape,
    point: [number, number, number],
    tolerance: number
  ): string {
    const solidId = unwrapSolidOrThrow(shape, 'classifyPointWinding');
    return this.bk.classifyPointWinding(solidId, point[0], point[1], point[2], tolerance);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Batch execution
  // ═══════════════════════════════════════════════════════════════════════

  executeBatch(json: string): string {
    return this.bk.executeBatch(json);
  }
}

// ---------------------------------------------------------------------------
// Matrix multiplication (4×4 row-major)
// ---------------------------------------------------------------------------

function multiplyMatrices(a: number[], b: number[]): number[] {
  const result = new Array(16).fill(0);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      for (let k = 0; k < 4; k++) {
        result[i * 4 + j] =
          (result[i * 4 + j] as number) + (a[i * 4 + k] as number) * (b[k * 4 + j] as number);
      }
    }
  }
  return result;
}
