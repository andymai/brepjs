/**
 * Type definitions for the occt-wasm kernel adapter.
 *
 * occt-wasm is an OCCT V8 kernel compiled to WebAssembly via Emscripten/Embind.
 * All shapes are identified by u32 arena handles, similar to brepkit.
 *
 * @module
 */

import type { ShapeType } from '@/kernel/types.js';

// ---------------------------------------------------------------------------
// Handle wrapper
// ---------------------------------------------------------------------------

/**
 * Typed wrapper around an occt-wasm u32 arena handle.
 *
 * brepjs passes these around as opaque `KernelShape`. The adapter extracts
 * the `.id` when calling back into the WASM kernel.
 */
export interface OcctWasmHandle {
  readonly __occtWasm: true;
  readonly type: ShapeType;
  /** Raw u32 arena index. */
  readonly id: number;
  /** No-op -- arena-based allocation doesn't free individual handles. */
  delete(): void;
  /** OCCT-compatible hash code. */
  HashCode(upperBound: number): number;
  /** OCCT-compatible null check. */
  IsNull(): boolean;
}

// ---------------------------------------------------------------------------
// Embind struct types returned by the C++ facade
// ---------------------------------------------------------------------------

/** MeshData struct returned from tessellate/meshShape. Heap pointers. */
export interface EmMeshData {
  positionCount: number;
  normalCount: number;
  indexCount: number;
  getPositionsPtr(): number;
  getNormalsPtr(): number;
  getIndicesPtr(): number;
  getFaceGroupsPtr(): number;
  faceGroupCount: number;
  delete(): void;
}

/** BBoxData struct returned from getBoundingBox. */
export interface EmBBoxData {
  xmin: number;
  ymin: number;
  zmin: number;
  xmax: number;
  ymax: number;
  zmax: number;
}

/** EdgeData struct returned from wireframe. Heap pointers. */
export interface EmEdgeData {
  pointCount: number;
  edgeGroupCount: number;
  getPointsPtr(): number;
  getEdgeGroupsPtr(): number;
  delete(): void;
}

/** EvolutionData struct returned from *WithHistory methods. */
export interface EmEvolutionData {
  resultId: number;
  modified: EmVectorInt;
  generated: EmVectorInt;
  deleted: EmVectorInt;
  delete(): void;
}

/** ProjectionData struct returned from projectEdges (HLR). */
export interface EmProjectionData {
  visibleOutline: number;
  visibleSmooth: number;
  visibleSharp: number;
  hiddenOutline: number;
  hiddenSmooth: number;
  hiddenSharp: number;
}

/** NurbsCurveData struct returned from getNurbsCurveData. */
export interface EmNurbsCurveData {
  degree: number;
  rational: boolean;
  periodic: boolean;
  knots: EmVectorDouble;
  multiplicities: EmVectorInt;
  poles: EmVectorDouble;
  weights: EmVectorDouble;
  delete(): void;
}

/** Embind std::vector<std::string> wrapper. */
export interface EmVectorString {
  size(): number;
  get(index: number): string;
  push_back(value: string): void;
  delete(): void;
}

/** Embind std::vector<uint32_t> wrapper. */
export interface EmVectorUint32 {
  size(): number;
  get(index: number): number;
  push_back(value: number): void;
  delete(): void;
}

/** Embind std::vector<int> wrapper. */
export interface EmVectorInt {
  size(): number;
  get(index: number): number;
  push_back(value: number): void;
  delete(): void;
}

/** Embind std::vector<double> wrapper. */
export interface EmVectorDouble {
  size(): number;
  get(index: number): number;
  push_back(value: number): void;
  delete(): void;
}

// ---------------------------------------------------------------------------
// OcctKernel WASM interface (mirrors facade/include/occt_kernel.h)
// ---------------------------------------------------------------------------

/**
 * Type-safe view of occt-wasm's Embind `OcctKernel` class.
 *
 * All handle parameters and return values are `number` (u32 arena indices).
 */
export interface OcctKernelWasm {
  // --- Arena management ---
  release(id: number): void;
  releaseAll(): void;
  getShapeCount(): number;

  // --- Primitives ---
  makeBox(dx: number, dy: number, dz: number): number;
  makeBoxFromCorners(
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number
  ): number;
  makeCylinder(radius: number, height: number): number;
  makeSphere(radius: number): number;
  makeCone(r1: number, r2: number, height: number): number;
  makeTorus(majorRadius: number, minorRadius: number): number;
  makeEllipsoid(rx: number, ry: number, rz: number): number;
  makeRectangle(width: number, height: number): number;

  // --- Booleans ---
  fuse(a: number, b: number): number;
  cut(a: number, b: number): number;
  common(a: number, b: number): number;
  intersect(a: number, b: number): number;
  section(a: number, b: number): number;
  fuseAll(shapeIds: EmVectorUint32): number;
  cutAll(shapeId: number, toolIds: EmVectorUint32): number;
  split(shapeId: number, toolIds: EmVectorUint32): number;

  // --- Modeling operations ---
  extrude(shapeId: number, dx: number, dy: number, dz: number): number;
  revolve(
    shapeId: number,
    px: number,
    py: number,
    pz: number,
    dx: number,
    dy: number,
    dz: number,
    angleRad: number
  ): number;
  fillet(solidId: number, edgeIds: EmVectorUint32, radius: number): number;
  chamfer(solidId: number, edgeIds: EmVectorUint32, distance: number): number;
  chamferDistAngle(
    solidId: number,
    edgeIds: EmVectorUint32,
    distance: number,
    angleDeg: number
  ): number;
  shell(solidId: number, faceIds: EmVectorUint32, thickness: number): number;
  offset(solidId: number, distance: number): number;
  draft(
    shapeId: number,
    faceId: number,
    angleRad: number,
    dx: number,
    dy: number,
    dz: number
  ): number;

  // --- Sweep operations ---
  pipe(profileId: number, spineId: number): number;
  simplePipe(profileId: number, spineId: number): number;
  loft(wireIds: EmVectorUint32, isSolid: boolean): number;
  loftWithVertices(
    wireIds: EmVectorUint32,
    isSolid: boolean,
    startVertexId: number,
    endVertexId: number
  ): number;
  sweep(wireId: number, spineId: number, transitionMode: number): number;
  sweepPipeShell(profileId: number, spineId: number, freenet: boolean, smooth: boolean): number;
  draftPrism(shapeId: number, dx: number, dy: number, dz: number, angleDeg: number): number;
  revolveVec(
    shapeId: number,
    cx: number,
    cy: number,
    cz: number,
    dx: number,
    dy: number,
    dz: number,
    angle: number
  ): number;

  // --- Shape construction ---
  makeVertex(x: number, y: number, z: number): number;
  makeEdge(v1: number, v2: number): number;
  makeLineEdge(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): number;
  makeCircleEdge(
    cx: number,
    cy: number,
    cz: number,
    nx: number,
    ny: number,
    nz: number,
    radius: number
  ): number;
  makeCircleArc(
    cx: number,
    cy: number,
    cz: number,
    nx: number,
    ny: number,
    nz: number,
    radius: number,
    startAngle: number,
    endAngle: number
  ): number;
  makeArcEdge(
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number,
    x3: number,
    y3: number,
    z3: number
  ): number;
  makeEllipseEdge(
    cx: number,
    cy: number,
    cz: number,
    nx: number,
    ny: number,
    nz: number,
    majorRadius: number,
    minorRadius: number
  ): number;
  makeEllipseArc(
    cx: number,
    cy: number,
    cz: number,
    nx: number,
    ny: number,
    nz: number,
    majorRadius: number,
    minorRadius: number,
    startAngle: number,
    endAngle: number
  ): number;
  makeBezierEdge(flatPoints: EmVectorDouble): number;
  makeTangentArc(
    x1: number,
    y1: number,
    z1: number,
    tx: number,
    ty: number,
    tz: number,
    x2: number,
    y2: number,
    z2: number
  ): number;
  makeHelixWire(
    px: number,
    py: number,
    pz: number,
    dx: number,
    dy: number,
    dz: number,
    pitch: number,
    height: number,
    radius: number
  ): number;
  makeWire(edgeIds: EmVectorUint32): number;
  makeFace(wireId: number): number;
  makeNonPlanarFace(wireId: number): number;
  addHolesInFace(faceId: number, holeWireIds: EmVectorUint32): number;
  removeHolesFromFace(faceId: number, holeIndices: EmVectorInt): number;
  solidFromShell(shellId: number): number;
  makeSolid(shellId: number): number;
  sew(shapeIds: EmVectorUint32, tolerance: number): number;
  sewAndSolidify(faceIds: EmVectorUint32, tolerance: number): number;
  buildSolidFromFaces(faceIds: EmVectorUint32, tolerance: number): number;
  makeCompound(shapeIds: EmVectorUint32): number;
  buildTriFace(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx: number,
    cy: number,
    cz: number
  ): number;

  // --- Transforms ---
  translate(id: number, dx: number, dy: number, dz: number): number;
  rotate(
    id: number,
    px: number,
    py: number,
    pz: number,
    dx: number,
    dy: number,
    dz: number,
    angleRad: number
  ): number;
  scale(id: number, px: number, py: number, pz: number, factor: number): number;
  mirror(
    id: number,
    px: number,
    py: number,
    pz: number,
    nx: number,
    ny: number,
    nz: number
  ): number;
  copy(id: number): number;
  transform(id: number, matrix: EmVectorDouble): number;
  generalTransform(id: number, matrix: EmVectorDouble): number;
  linearPattern(
    id: number,
    dx: number,
    dy: number,
    dz: number,
    spacing: number,
    count: number
  ): number;
  circularPattern(
    id: number,
    cx: number,
    cy: number,
    cz: number,
    ax: number,
    ay: number,
    az: number,
    angle: number,
    count: number
  ): number;
  composeTransform(m1: EmVectorDouble, m2: EmVectorDouble): EmVectorDouble;

  // --- Topology query ---
  getShapeType(id: number): string;
  getSubShapes(id: number, shapeType: string): EmVectorUint32;
  downcast(id: number, targetType: string): number;
  distanceBetween(a: number, b: number): number;
  isSame(a: number, b: number): boolean;
  isEqual(a: number, b: number): boolean;
  isNull(id: number): boolean;
  hashCode(id: number, upperBound: number): number;
  shapeOrientation(id: number): string;
  sharedEdges(faceA: number, faceB: number): EmVectorUint32;
  adjacentFaces(shapeId: number, faceId: number): EmVectorUint32;
  iterShapes(id: number): EmVectorUint32;
  edgeToFaceMap(id: number, hashUpperBound: number): EmVectorInt;

  // --- Tessellation / Mesh ---
  tessellate(id: number, linearDeflection: number, angularDeflection: number): EmMeshData;
  wireframe(id: number, deflection: number): EmEdgeData;
  hasTriangulation(id: number): boolean;
  meshShape(id: number, linearDeflection: number, angularDeflection: number): EmMeshData;

  // --- I/O ---
  importStep(data: string): number;
  exportStep(id: number): string;
  importStl(data: string): number;
  importIges(data: string): number;
  exportIges(id: number): string;
  exportStl(id: number, linearDeflection: number, ascii: boolean): string;
  toBREP(id: number): string;
  fromBREP(data: string): number;

  // --- Query / Measure ---
  getBoundingBox(id: number): EmBBoxData;
  getVolume(id: number): number;
  getSurfaceArea(id: number): number;
  getLength(id: number): number;
  getCenterOfMass(id: number): EmVectorDouble;
  getLinearCenterOfMass(id: number): EmVectorDouble;
  surfaceCurvature(faceId: number, u: number, v: number): EmVectorDouble;

  // --- Vertex/Surface query ---
  vertexPosition(vertexId: number): EmVectorDouble;
  surfaceType(faceId: number): string;
  surfaceNormal(faceId: number, u: number, v: number): EmVectorDouble;
  pointOnSurface(faceId: number, u: number, v: number): EmVectorDouble;
  outerWire(faceId: number): number;
  uvBounds(faceId: number): EmVectorDouble;
  uvFromPoint(faceId: number, x: number, y: number, z: number): EmVectorDouble;
  projectPointOnFace(faceId: number, x: number, y: number, z: number): EmVectorDouble;
  classifyPointOnFace(faceId: number, u: number, v: number): string;

  // --- Curve ops ---
  curveType(edgeId: number): string;
  curvePointAtParam(edgeId: number, param: number): EmVectorDouble;
  curveTangent(edgeId: number, param: number): EmVectorDouble;
  curveParameters(edgeId: number): EmVectorDouble;
  curveIsClosed(edgeId: number): boolean;
  curveIsPeriodic(edgeId: number): boolean;
  curveLength(edgeId: number): number;
  interpolatePoints(flatPoints: EmVectorDouble, periodic: boolean): number;
  approximatePoints(flatPoints: EmVectorDouble, tolerance: number): number;

  // --- Projection (HLR) ---
  projectEdges(
    shapeId: number,
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    xx: number,
    xy: number,
    xz: number,
    hasXAxis: boolean
  ): EmProjectionData;

  // --- NURBS introspection ---
  getNurbsCurveData(edgeId: number): EmNurbsCurveData;

  // --- 2D→3D curve lifting ---
  liftCurve2dToPlane(
    flatPoints2d: EmVectorDouble,
    planeOx: number,
    planeOy: number,
    planeOz: number,
    planeZx: number,
    planeZy: number,
    planeZz: number,
    planeXx: number,
    planeXy: number,
    planeXz: number
  ): number;

  // --- XCAF ---
  createXCAFDocument(
    shapeIds: EmVectorUint32,
    joinedNames: string,
    flatColors: EmVectorDouble
  ): number;
  writeXCAFToSTEP(docId: number): string;

  // --- Surface construction ---
  bsplineSurface(flatPoints: EmVectorDouble, rows: number, cols: number): number;
  makeFaceOnSurface(faceId: number, wireId: number): number;

  // --- Null shape ---
  makeNullShape(): number;

  // --- Modifier ---
  thicken(shapeId: number, thickness: number): number;
  defeature(shapeId: number, faceIds: EmVectorUint32): number;
  reverseShape(id: number): number;
  simplify(id: number): number;
  filletVariable(solidId: number, edgeId: number, startRadius: number, endRadius: number): number;
  offsetWire2D(wireId: number, offset: number, joinType: number): number;

  // --- Evolution ---
  translateWithHistory(
    id: number,
    dx: number,
    dy: number,
    dz: number,
    inputFaceHashes: EmVectorInt,
    hashUpperBound: number
  ): EmEvolutionData;
  fuseWithHistory(
    a: number,
    b: number,
    inputFaceHashes: EmVectorInt,
    hashUpperBound: number
  ): EmEvolutionData;
  cutWithHistory(
    a: number,
    b: number,
    inputFaceHashes: EmVectorInt,
    hashUpperBound: number
  ): EmEvolutionData;
  filletWithHistory(
    solidId: number,
    edgeIds: EmVectorUint32,
    radius: number,
    inputFaceHashes: EmVectorInt,
    hashUpperBound: number
  ): EmEvolutionData;
  rotateWithHistory(
    id: number,
    px: number,
    py: number,
    pz: number,
    dx: number,
    dy: number,
    dz: number,
    angle: number,
    inputFaceHashes: EmVectorInt,
    hashUpperBound: number
  ): EmEvolutionData;
  mirrorWithHistory(
    id: number,
    px: number,
    py: number,
    pz: number,
    nx: number,
    ny: number,
    nz: number,
    inputFaceHashes: EmVectorInt,
    hashUpperBound: number
  ): EmEvolutionData;
  scaleWithHistory(
    id: number,
    cx: number,
    cy: number,
    cz: number,
    factor: number,
    inputFaceHashes: EmVectorInt,
    hashUpperBound: number
  ): EmEvolutionData;
  intersectWithHistory(
    a: number,
    b: number,
    inputFaceHashes: EmVectorInt,
    hashUpperBound: number
  ): EmEvolutionData;
  chamferWithHistory(
    solidId: number,
    edgeIds: EmVectorUint32,
    distance: number,
    inputFaceHashes: EmVectorInt,
    hashUpperBound: number
  ): EmEvolutionData;
  shellWithHistory(
    solidId: number,
    faceIds: EmVectorUint32,
    thickness: number,
    inputFaceHashes: EmVectorInt,
    hashUpperBound: number
  ): EmEvolutionData;
  offsetWithHistory(
    solidId: number,
    distance: number,
    inputFaceHashes: EmVectorInt,
    hashUpperBound: number
  ): EmEvolutionData;
  thickenWithHistory(
    shapeId: number,
    thickness: number,
    inputFaceHashes: EmVectorInt,
    hashUpperBound: number
  ): EmEvolutionData;

  // --- Wire/curve repair ---
  buildCurves3d(wireId: number): void;
  fixWireOnFace(wireId: number, faceId: number, tolerance: number): number;

  // --- Healing / Repair ---
  fixShape(id: number): number;
  unifySameDomain(id: number): number;
  isValid(id: number): boolean;
  healSolid(id: number, tolerance: number): number;
  healFace(id: number, tolerance: number): number;
  healWire(id: number, tolerance: number): number;
  fixFaceOrientations(id: number): number;
  removeDegenerateEdges(id: number): number;
}

// ---------------------------------------------------------------------------
// Emscripten Module type
// ---------------------------------------------------------------------------

/**
 * Emscripten Module interface for occt-wasm.
 *
 * Provides access to heap views (for reading mesh data from pointers)
 * and Embind vector constructors.
 */
export interface OcctWasmModule {
  /** Float32 view of WASM linear memory. */
  HEAPF32: Float32Array;
  /** Uint32 view of WASM linear memory. */
  HEAPU32: Uint32Array;
  HEAP32: Int32Array;

  /** Embind std::vector<uint32_t> constructor. */
  VectorUint32: new () => EmVectorUint32;
  /** Embind std::vector<int> constructor. */
  VectorInt: new () => EmVectorInt;
  /** Embind std::vector<double> constructor. */
  VectorDouble: new () => EmVectorDouble;
  /** Embind std::vector<std::string> constructor. */
  VectorString: new () => EmVectorString;

  /** OcctKernel constructor (Embind class). */
  OcctKernel: new () => OcctKernelWasm;

  /** Extract error message from a C++ exception (requires -sEXPORT_EXCEPTION_HANDLING_HELPERS). */
  getExceptionMessage(ex: unknown): [string, string];
}
