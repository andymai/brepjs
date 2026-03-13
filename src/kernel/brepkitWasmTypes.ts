/**
 * Type-safe interface for the brepkit WASM kernel (`BrepKernel`).
 *
 * This mirrors the Rust `BrepKernel` struct's `#[wasm_bindgen]` exports.
 * Every `this.bk.*` call in `brepkitAdapter.ts` is typed here so TypeScript
 * catches mismatches at compile time.
 *
 * Methods not yet exposed by the WASM build are marked **optional** (`?`).
 * Callers must guard with `typeof this.bk.method === 'function'` before use.
 *
 * @module
 */

// ── Mesh result from tessellation ────────────────────────────────

/** Triangle mesh returned by `tessellateFace` / `tessellateSolid`. */
export interface BrepkitMesh {
  /** Flattened vertex positions `[x, y, z, ...]`. */
  readonly positions: number[];
  /** Flattened per-vertex normals `[nx, ny, nz, ...]`. */
  readonly normals: number[];
  /** Triangle indices (groups of 3). */
  readonly indices: number[];
  /** Number of vertices. */
  readonly vertexCount: number;
  /** Number of triangles. */
  readonly triangleCount: number;
  /** All mesh data in a single packed buffer for efficient FFI transfer. */
  packedBuffer(): Uint8Array;
}

/** Edge polylines returned by `meshEdges`. */
export interface BrepkitEdgeLines {
  /** Flattened vertex positions `[x, y, z, ...]`. */
  readonly positions: number[];
  /** Start index into positions for each edge polyline (already ×3). */
  readonly offsets: number[];
  /** Number of edges. */
  readonly edgeCount: number;
}

// ── Main kernel interface ────────────────────────────────────────

/**
 * Type-safe view of brepkit's WASM `BrepKernel` class.
 *
 * All handle parameters and return values are `number` (u32 arena indices).
 * Coordinate arrays are flat `number[]` (`[x,y,z, ...]`).
 * Matrices are 16-element row-major `number[]`.
 */
export interface BrepkitKernel {
  // ── Primitives ──────────────────────────────────────────────────

  /** Create a box solid centered at origin. Returns solid handle. */
  makeBox(dx: number, dy: number, dz: number): number;

  /** Create a cylinder solid, axis along +Z. Returns solid handle. */
  makeCylinder(radius: number, height: number): number;

  /** Create a sphere solid centered at origin. Returns solid handle. */
  makeSphere(radius: number, segments: number): number;

  /** Create a cone/frustum solid, axis along +Z. Returns solid handle. */
  makeCone(bottomRadius: number, topRadius: number, height: number): number;

  /** Create a torus solid in XY plane. Returns solid handle. */
  makeTorus(majorRadius: number, minorRadius: number, segments: number): number;

  /** Create a rectangular face centered at origin in XY. Returns face handle. */
  makeRectangle(width: number, height: number): number;

  /** Create a polygonal face from flat coords `[x,y,z,...]`. Returns face handle. */
  makePolygon(coords: number[]): number;

  /** Create a circular polygon face in XY. Returns face handle. */
  makeCircle(radius: number, segments: number): number;

  // ── Shape construction (low-level) ─────────────────────────────

  /** Create a vertex at (x,y,z). Returns vertex handle. */
  makeVertex(x: number, y: number, z: number): number;

  /** Create a line edge between two points. Returns edge handle. */
  makeLineEdge(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): number;

  /** Create a circular arc edge. The arc goes from start to end CCW when viewed along the axis. Returns edge handle. */
  makeCircleArc3d(
    startX: number,
    startY: number,
    startZ: number,
    endX: number,
    endY: number,
    endZ: number,
    centerX: number,
    centerY: number,
    centerZ: number,
    axisX: number,
    axisY: number,
    axisZ: number
  ): number;

  /** Create a NURBS curve edge. Returns edge handle. */
  makeNurbsEdge(
    startX: number,
    startY: number,
    startZ: number,
    endX: number,
    endY: number,
    endZ: number,
    degree: number,
    knots: number[],
    controlPoints: number[],
    weights: number[]
  ): number;

  /** Create a wire from ordered edge handles. Returns wire handle. */
  makeWire(edgeHandles: number[], closed: boolean): number;

  /** Create a planar face from a wire. Returns face handle. */
  makeFaceFromWire(wire: number): number;

  /** Create a solid from a shell. Returns solid handle. */
  solidFromShell(shell: number): number;

  /** Create a compound from solid handles. Returns compound handle. */
  makeCompound(solidHandles: number[]): number;

  /** Create a closed polygon wire from flat coords. Returns wire handle. */
  makePolygonWire(coords: number[]): number;

  /** Create a regular polygon wire in XY. Returns wire handle. */
  makeRegularPolygonWire(radius: number, nSides: number): number;

  /** Create a circle face using NURBS arcs. Returns face handle. */
  makeCircleFace(radius: number, segments: number): number;

  /** Add holes (inner wires) to a face. Returns new face handle. */
  addHolesToFace(face: number, wireIds: number[]): number;

  // ── Boolean operations ─────────────────────────────────────────

  /** Fuse (union) two solids. Returns new solid handle. */
  fuse(a: number, b: number): number;

  /** Cut (subtract) solid b from a. Returns new solid handle. */
  cut(a: number, b: number): number;

  /** Intersect two solids. Returns new solid handle. */
  intersect(a: number, b: number): number;

  /** Cut target solid with multiple tool solids in a single WASM call. Returns new solid handle. */
  compoundCut(target: number, tool_ids: Uint32Array): number;

  /** Fuse multiple solids in a single WASM call. Returns new solid handle. Optional — may not exist in older versions. */
  compoundFuse?(solid_ids: Uint32Array): number;

  /** Fuse with evolution tracking. Returns JSON string. */
  fuseWithEvolution(a: number, b: number): string;

  /** Cut with evolution tracking. Returns JSON string. */
  cutWithEvolution(a: number, b: number): string;

  /** Intersect with evolution tracking. Returns JSON string. */
  intersectWithEvolution(a: number, b: number): string;

  // ── Sweep / Loft / Extrude ─────────────────────────────────────

  /** Extrude a face along direction. Returns solid handle. */
  extrude(face: number, dirX: number, dirY: number, dirZ: number, distance: number): number;

  /**
   * Revolve a face around an axis. Angle in degrees.
   * Returns solid handle.
   */
  revolve(
    face: number,
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    angleDegrees: number
  ): number;

  /** Sweep a face along a NURBS path. Returns solid handle. */
  sweep(
    face: number,
    pathDegree: number,
    pathKnots: number[],
    pathControlPoints: number[],
    pathWeights: number[]
  ): number;

  /** Loft through an array of face profiles. Returns solid handle. */
  loft(faceIds: number[]): number;

  /** Loft with smooth NURBS surface fitting. Returns solid handle. */
  loftSmooth(faceIds: number[]): number;

  /** Loft with configurable options (JSON string). Returns solid handle. */
  loftWithOptions(faces: number[], options: string): number;

  /** Thicken a face into a solid by offsetting along its normal. */
  thicken(face: number, thickness: number): number;

  /** Create an ellipsoid primitive. Returns solid handle. */
  makeEllipsoid(rx: number, ry: number, rz: number): number;

  /** Build a solid from an array of face handles. Returns solid handle. */
  makeSolid(faceHandles: Uint32Array): number;

  /** Weld shells and faces into a solid. Returns solid handle. */
  weldShellsAndFaces(faceHandles: number[], tolerance: number): number;

  /** Sweep with smooth NURBS surface fitting along a path. Returns solid handle. */
  sweepSmooth(
    face: number,
    pathDegree: number,
    pathKnots: number[],
    pathControlPoints: number[],
    pathWeights: number[]
  ): number;

  /** Pipe sweep along a NURBS path. Returns solid handle. */
  pipe(
    face: number,
    pathDegree: number,
    pathKnots: number[],
    pathControlPoints: number[],
    pathWeights: number[]
  ): number;

  /** Sweep a face along edge handles. Returns solid handle. */
  sweepAlongEdges(profile: number, edgeIds: number[]): number;

  /** Helical sweep of a profile. Returns solid handle. */
  helicalSweep(
    profile: number,
    axisOriginX: number,
    axisOriginY: number,
    axisOriginZ: number,
    axisDirX: number,
    axisDirY: number,
    axisDirZ: number,
    radius: number,
    pitch: number,
    turns: number
  ): number;

  /** Sweep with advanced options (contact mode, scale law). Returns solid handle. */
  sweepWithOptions(
    profile: number,
    pathEdge: number,
    contactMode: string,
    scaleValues: number[],
    segments: number
  ): number;

  // ── Modifiers ──────────────────────────────────────────────────

  /** Fillet edges of a solid with constant radius. Returns solid handle. */
  fillet(solid: number, edgeIds: number[], radius: number): number;

  /** Fillet edges with variable radius (JSON spec). Returns solid handle. */
  filletVariable(solid: number, json: string): number;

  /** Chamfer edges of a solid. Returns solid handle. */
  chamfer(solid: number, edgeIds: number[], distance: number): number;

  /** Shell a solid by removing faces. Returns solid handle. */
  shell(solid: number, thickness: number, faceIds: number[]): number;

  /** Offset a solid by distance. Returns solid handle. */
  offsetSolid(solid: number, distance: number): number;

  /** Offset a face. Returns solid handle. */
  offsetFace(face: number, distance: number, tolerance: number): number;

  /** Offset a wire on a planar face. Returns wire handle. */
  offsetWire(face: number, distance: number): number;

  /** Draft (taper) faces of a solid. Returns solid handle. */
  draft(
    solid: number,
    faceHandles: number[],
    pullX: number,
    pullY: number,
    pullZ: number,
    neutralX: number,
    neutralY: number,
    neutralZ: number,
    angleDegrees: number
  ): number;

  // ── Section / Split ────────────────────────────────────────────

  /** Section a solid with a plane. Returns face handle array. */
  section(
    solid: number,
    px: number,
    py: number,
    pz: number,
    nx: number,
    ny: number,
    nz: number
  ): Uint32Array;

  /** Split a solid along a plane. Returns `[positive, negative]` solid handles. */
  split(
    solid: number,
    px: number,
    py: number,
    pz: number,
    nx: number,
    ny: number,
    nz: number
  ): Uint32Array;

  // ── Transform / Copy / Mirror / Pattern ────────────────────────

  /** Transform a solid in-place with 4×4 row-major matrix. */
  transformSolid(solid: number, matrix: number[]): void;

  /** Deep copy a solid. Returns new solid handle. */
  copySolid(solid: number): number;

  /** Copy and transform in one pass. Returns new solid handle. */
  copyAndTransformSolid(solid: number, matrix: number[]): number;

  /** Mirror a solid across a plane. Returns new solid handle. */
  mirror(
    solid: number,
    px: number,
    py: number,
    pz: number,
    nx: number,
    ny: number,
    nz: number
  ): number;

  /** Linear pattern (array). Returns compound handle. */
  linearPattern(
    solid: number,
    dx: number,
    dy: number,
    dz: number,
    spacing: number,
    count: number
  ): number;

  /** Circular pattern around axis. Returns compound handle. */
  circularPattern(solid: number, ax: number, ay: number, az: number, count: number): number;

  /** 2D grid pattern. Returns compound handle. */
  gridPattern(
    solid: number,
    dirXx: number,
    dirXy: number,
    dirXz: number,
    dirYx: number,
    dirYy: number,
    dirYz: number,
    spacingX: number,
    spacingY: number,
    countX: number,
    countY: number
  ): number;

  // ── Sewing / Fill ──────────────────────────────────────────────

  /** Sew faces into a solid. Returns solid handle. */
  sewFaces(faceHandles: number[], tolerance: number): number;

  /** Fill a 4-sided boundary with Coons patch. Returns face handle. */
  fillCoonsPatch(boundaryCoords: number[], curveLengths: number[]): number;

  /** Untrim a NURBS face. Returns new face handle. */
  untrimFace(face: number, samplesPerCurve: number, interiorSamples: number): number;

  // ── Topology queries ───────────────────────────────────────────

  /** Get face handles of a solid. */
  getSolidFaces(solid: number): Uint32Array;

  /** Get edge handles of a solid. */
  getSolidEdges(solid: number): Uint32Array;

  /** Get vertex handles of a solid. */
  getSolidVertices(solid: number): Uint32Array;

  /** Get edge handles of a face. */
  getFaceEdges(face: number): Uint32Array;

  /** Get vertex handles of a face. */
  getFaceVertices(face: number): Uint32Array;

  /** Get the outer wire of a face. */
  getFaceOuterWire(face: number): number;

  /** Get all wires (outer + inner) of a face. */
  getFaceWires(face: number): Uint32Array;

  /**
   * Get vertex positions of an edge.
   * Returns `[startX, startY, startZ, endX, endY, endZ]`.
   */
  getEdgeVertices(edge: number): number[];

  /** Get vertex position `[x, y, z]`. */
  getVertexPosition(vertex: number): number[];

  /** Get face normal `[nx, ny, nz]` (planar faces only). */
  getFaceNormal(face: number): number[];

  /** Get entity counts `[faces, edges, vertices]` of a solid. */
  getEntityCounts(solid: number): number[];

  /** Get edge-to-face adjacency map as JSON string. */
  edgeToFaceMap(solid: number): string;

  /** Get shared edges between two faces. */
  sharedEdges(faceA: number, faceB: number): number[];

  /** Get faces adjacent to a face within a solid. */
  adjacentFaces(solid: number, face: number): number[];

  /** Check if an edge is forward in its parent wire. */
  isEdgeForwardInWire(edge: number, wire: number): boolean;

  /** Check if a wire is closed. */
  isWireClosed(wire: number): boolean;

  /** Compute total arc-length of a wire. */
  wireLength(wire: number): number;

  /** Deep copy a wire. Returns new wire handle. */
  copyWire(wire: number): number;

  /** Transform a wire in place with a 4x4 matrix. */
  transformWire(wire: number, matrix: number[]): void;

  /** Measure curvature at parameter t on an edge. Returns [kappa, tx, ty, tz, nx, ny, nz, bx, by, bz]. */
  measureCurvatureAtEdge(edge: number, t: number): Float64Array;

  /** Measure principal curvatures at (u,v) on a face. Returns [k1, k2, d1x, d1y, d1z, d2x, d2y, d2z]. */
  measureCurvatureAtSurface(face: number, u: number, v: number): Float64Array;

  // ── Geometry queries ───────────────────────────────────────────

  /** Get the surface type of a face (e.g. "plane", "cylinder", "nurbs"). */
  getSurfaceType(face: number): string;

  /** Get the curve type of an edge (e.g. "line", "nurbs"). */
  getEdgeCurveType(edge: number): string;

  /** Get edge curve parameter range `[tMin, tMax]`. */
  getEdgeCurveParameters(edge: number): number[];

  /** Evaluate edge curve at parameter. Returns `[x, y, z]`. */
  evaluateEdgeCurve(edge: number, param: number): number[];

  /** Evaluate edge curve + tangent at parameter. Returns `[px,py,pz, tx,ty,tz]`. */
  evaluateEdgeCurveD1(edge: number, param: number): number[];

  /** Evaluate surface at (u,v). Returns `[x, y, z]`. */
  evaluateSurface(face: number, u: number, v: number): number[];

  /** Evaluate surface normal at (u,v). Returns `[nx, ny, nz]`. */
  evaluateSurfaceNormal(face: number, u: number, v: number): number[];

  /** Get UV domain `[uMin, uMax, vMin, vMax]`. */
  getSurfaceDomain(face: number): number[];

  /** Project a 3D point onto a face surface. Returns `[x, y, z]`. */
  projectPointOnSurface(face: number, x: number, y: number, z: number): number[];

  /** Get analytic surface parameters as JSON. */
  getAnalyticSurfaceParams(face: number): string;

  /** Get NURBS curve data for an edge as JSON. */
  getEdgeNurbsData(edge: number): string;

  // ── Measurement ────────────────────────────────────────────────

  /** Bounding box `[minX, minY, minZ, maxX, maxY, maxZ]`. */
  boundingBox(solid: number): number[];

  /** Volume of a solid (tessellation-based). */
  volume(solid: number, deflection: number): number;

  /** Total surface area of a solid. */
  surfaceArea(solid: number, deflection: number): number;

  /** Area of a single face. */
  faceArea(face: number, deflection: number): number;

  /** Center of mass `[x, y, z]`. */
  centerOfMass(solid: number, deflection: number): number[];

  /** Edge length. */
  edgeLength(edge: number): number;

  /** Face perimeter. */
  facePerimeter(face: number): number;

  // ── Distance / Classification ──────────────────────────────────

  /** Classify a point relative to a solid. Returns "inside"|"outside"|"boundary". */
  classifyPoint(solid: number, x: number, y: number, z: number): string;

  /** Classify using generalized winding numbers. */
  classifyPointWinding(solid: number, x: number, y: number, z: number, tolerance: number): string;

  /** Classify using robust dual-method. */
  classifyPointRobust(solid: number, x: number, y: number, z: number, tolerance: number): string;

  /**
   * Distance from a point to a solid.
   * Returns `[distance, closestX, closestY, closestZ]`.
   */
  pointToSolidDistance(px: number, py: number, pz: number, solid: number): number[];

  /**
   * Minimum distance from a point to a face.
   * Returns `[distance, closestX, closestY, closestZ]`.
   */
  pointToFaceDistance(px: number, py: number, pz: number, face: number): number[];

  /**
   * Minimum distance from a point to an edge.
   * Returns `[distance, closestX, closestY, closestZ]`.
   */
  pointToEdgeDistance(px: number, py: number, pz: number, edge: number): number[];

  /** Minimum distance between two solids. */
  solidToSolidDistance(a: number, b: number): number;

  // ── Validation / Repair ────────────────────────────────────────

  /** Validate solid topology (strict). Returns error count. */
  validateSolid(solid: number): number;

  /** Validate solid topology (relaxed, tolerant of NURBS approximation artifacts). Returns error count. */
  validateSolidRelaxed(solid: number): number;

  /** Heal a solid (fix orientations, merge vertices, etc.). */
  healSolid(solid: number): void;

  /** Merge coincident vertices. Returns merge count. */
  mergeCoincidentVertices(solid: number, tolerance: number): number;

  /** Remove zero-length edges. Returns removal count. */
  removeDegenerateEdges(solid: number, tolerance: number): number;

  /** Fix face orientations for consistent normals. Returns fix count. */
  fixFaceOrientations(solid: number): number;

  /** Repair a solid (comprehensive healing). Returns error count after repair. */
  repairSolid(solid: number): number;

  /** Unify adjacent faces on the same surface. Returns removed face count. Optional — added in 1.0.8. */
  unifyFaces?(solid: number): number;

  // ── Tessellation ───────────────────────────────────────────────

  /** Tessellate a face into a triangle mesh. */
  tessellateFace(face: number, deflection: number): BrepkitMesh;

  /** Tessellate all faces of a solid into a merged mesh. */
  tessellateSolid(solid: number, deflection: number): BrepkitMesh;

  /** Tessellate an edge into polyline points. Returns flat `[x,y,z,...]`. */
  tessellateEdge(edge: number, numPoints: number): number[];

  /** Sample edges of a solid into polylines (smooth edges filtered out). */
  meshEdges(solid: number, deflection: number): BrepkitEdgeLines;

  /** Sample all edges of a solid into polylines (no smooth-edge filtering). Optional — added in 1.0.8. */
  meshEdgesAll?(solid: number, deflection: number): BrepkitEdgeLines;

  /** Convex hull from flat coords. Returns solid handle. */
  convexHull(coords: number[]): number;

  // ── Export ─────────────────────────────────────────────────────

  /** Export to STEP format. Returns bytes. */
  exportStep(solid: number): Uint8Array;

  /** Export to binary STL. Returns bytes. */
  exportStl(solid: number, deflection: number): Uint8Array;

  /** Export to ASCII STL. Returns bytes. */
  exportStlAscii(solid: number, deflection: number): Uint8Array;

  /** Export to IGES format. Returns bytes. */
  exportIges(solid: number): Uint8Array;

  /** Export to 3MF format. Returns bytes. */
  export3mf(solid: number, deflection: number): Uint8Array;

  /** Export to OBJ format. Returns bytes. */
  exportObj(solid: number, deflection: number): Uint8Array;

  /** Export to GLB format. Returns bytes. */
  exportGlb(solid: number, deflection: number): Uint8Array;

  /** Export to PLY format (binary). Returns bytes. */
  exportPly(solid: number, deflection: number): Uint8Array;

  // ── Import ─────────────────────────────────────────────────────

  /** Import from STEP. Returns solid handle array. */
  importStep(data: Uint8Array): Uint32Array;

  /** Import from STL. Returns solid handle. */
  importStl(data: Uint8Array): number;

  /** Import from IGES. Returns solid handle array. */
  importIges(data: Uint8Array): Uint32Array;

  /** Import from 3MF. Returns solid handle array. */
  import3mf(data: Uint8Array): Uint32Array;

  /** Import from flat vertex/index arrays. Returns solid handle. */
  importIndexedMesh(positions: Float64Array, indices: Uint32Array): number;

  /** Import from OBJ. Returns solid handle. */
  importObj(data: Uint8Array): number;

  /** Import from GLB. Returns solid handle. */
  importGlb(data: Uint8Array): number;

  // ── NURBS curve operations ─────────────────────────────────────

  /** Approximate a curve through points (least-squares). Returns edge handle. */
  approximateCurve(coords: number[], degree: number, numControlPoints: number): number;

  /** Approximate via LSPIA. Returns edge handle. */
  approximateCurveLspia(
    coords: number[],
    degree: number,
    numControlPoints: number,
    tolerance: number,
    maxIterations: number
  ): number;

  /** Interpolate points into a smooth NURBS edge. Returns edge handle. */
  interpolatePoints(coords: number[], degree: number): number;

  /** Insert a knot into an edge's NURBS curve. Returns new edge handle. */
  curveKnotInsert(edge: number, knot: number, times: number): number;

  /** Remove a knot from a NURBS curve. Returns new edge handle. */
  curveKnotRemove(edge: number, knot: number, tolerance: number): number;

  /** Split a NURBS curve at parameter. Returns `[edge1, edge2]`. */
  curveSplit(edge: number, u: number): number[];

  /** Elevate degree of a NURBS curve. Returns new edge handle. */
  curveDegreeElevate(edge: number, elevateBy: number): number;

  // ── NURBS surface operations ───────────────────────────────────

  /** Interpolate a grid of points into a NURBS surface. Returns face handle. */
  interpolateSurface(
    coords: number[],
    rows: number,
    cols: number,
    degreeU: number,
    degreeV: number
  ): number;

  /** Approximate a point grid via LSPIA. Returns face handle. */
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
  ): number;

  // ── Feature detection ──────────────────────────────────────────

  /** Detect small features (faces below area threshold). Returns face handles. */
  detectSmallFeatures(solid: number, areaThreshold: number, deflection: number): number[];

  /** Recognize geometric features. Returns JSON string. */
  recognizeFeatures(solid: number, deflection: number): string;

  /** Remove faces from a solid (defeaturing). Returns new solid handle. */
  defeature(solid: number, faceHandles: number[]): number;

  // ── Mesh boolean ───────────────────────────────────────────────

  /** Boolean on raw triangle data. Returns BrepkitMesh. */
  meshBoolean(
    positionsA: number[],
    indicesA: number[],
    positionsB: number[],
    indicesB: number[],
    op: string,
    tolerance: number
  ): BrepkitMesh;

  // ── Copy sub-shapes ────────────────────────────────────────────

  /** Deep copy an edge. Returns new edge handle. */
  copyEdge?(edge: number): number;

  /** Deep copy a face. Returns new face handle. */
  copyFace?(face: number): number;

  /** Transform an edge in-place. */
  transformEdge?(edge: number, matrix: number[]): void;

  /** Transform a face in-place. */
  transformFace?(face: number, matrix: number[]): void;

  // ── Sketch ─────────────────────────────────────────────────────

  /** Create a new sketch. Returns sketch index. */
  sketchNew(): number;

  /** Add a point to a sketch. Returns point index. */
  sketchAddPoint(sketch: number, x: number, y: number, fixed: boolean): number;

  /** Add a constraint to a sketch (JSON string). */
  sketchAddConstraint(sketch: number, json: string): void;

  /** Solve sketch constraints. Returns JSON result. */
  sketchSolve(sketch: number, maxIterations: number, tolerance: number): string;

  // ── Assembly ───────────────────────────────────────────────────

  /** Create a new assembly. Returns assembly index. */
  assemblyNew(name: string): number;

  /** Add a root component. Returns component ID. */
  assemblyAddRoot(assembly: number, name: string, solid: number, matrix: number[]): number;

  /** Add a child component. Returns component ID. */
  assemblyAddChild(
    assembly: number,
    parent: number,
    name: string,
    solid: number,
    matrix: number[]
  ): number;

  /** Flatten assembly to JSON `[{solid, matrix}, ...]`. */
  assemblyFlatten(assembly: number): string;

  /** Bill of materials as JSON. */
  assemblyBom(assembly: number): string;

  // ── 2D polygon ─────────────────────────────────────────────────

  /** Offset a 2D polygon. Coords are flat `[x,y, ...]`. Returns flat coords. */
  offsetPolygon2d(coords: number[], distance: number, tolerance: number): number[];

  // Note: The following 2D methods return Float64Array from WASM. Callers must
  // convert via Array.from() before passing downstream (same as Uint32Array pattern).

  /** Chamfer corners of a 2D polygon. Coords flat `[x,y,...]`. Returns flat coords. */
  chamfer2d(coords: number[], distance: number): Float64Array;

  /** Fillet corners of a 2D polygon. Coords flat `[x,y,...]`. Returns flat coords. */
  fillet2d(coords: number[], radius: number): Float64Array;

  /** Check if a point is inside a 2D polygon. Coords flat `[x,y,...]`. */
  pointInPolygon2d?(x: number, y: number, coords: number[]): boolean;

  /** Check if two 2D polygons intersect. Coords flat `[x,y,...]`. */
  polygonsIntersect2d(coordsA: number[], coordsB: number[]): boolean;

  /** Compute intersection polygon of two 2D polygons. Returns flat coords. */
  intersectPolygons2d(coordsA: number[], coordsB: number[]): Float64Array;

  /** Find common boundary segments of two 2D polygons. Returns flat coords. */
  commonSegment2d(coordsA: number[], coordsB: number[]): Float64Array;

  // ── Batch execution ────────────────────────────────────────────

  /** Execute a batch of operations from JSON. Returns JSON result. */
  executeBatch(json: string): string;

  // ── Topology queries (promoted from optional) ─────────────────

  /** Get solids within a compound. */
  getCompoundSolids(compound: number): Uint32Array;

  /** Get faces of a shell. */
  getShellFaces(shell: number): Uint32Array;

  /** Get edges of a wire. */
  getWireEdges(wire: number): Uint32Array;

  /** Get all wires of a face (alternative binding). */
  faceWires(face: number): Uint32Array;

  /** Get shape orientation flag. */
  getShapeOrientation(id: number): string;

  /** Reverse shape orientation. */
  reverseShape(id: number): number;

  /** Get edge start/end vertex arena handles. */
  getEdgeVertexHandles(edge: number): Uint32Array;

  /** Remove holes (inner wires) from a face. Returns new face handle. */
  removeHolesFromFace(face: number): number;

  // ── Checkpoint / Restore ──────────────────────────────────────

  /** Create an arena checkpoint. Returns checkpoint index. */
  checkpoint(): number;

  /** Get the current number of checkpoints. */
  checkpointCount(): number;

  /** Restore arena to a checkpoint, freeing all handles created after it. */
  restore(checkpoint: number): void;

  /** Discard a checkpoint without restoring. */
  discardCheckpoint(checkpoint: number): void;

  // ── Transform helpers ─────────────────────────────────────────

  /** Multiply two 4×4 row-major transform matrices. Returns 16-element result. */
  composeTransforms(a: number[], b: number[]): Float64Array;

  // ── Advanced tessellation ─────────────────────────────────────

  /**
   * Tessellate a solid with per-face grouping info.
   * Returns JSON string with `{ positions, normals, indices, faceOffsets }`.
   */
  tessellateSolidGrouped(solid: number, deflection: number): string;

  /**
   * Tessellate a solid with UV coordinates.
   * Returns JSON string with `{ positions, normals, indices, uvs }`.
   */
  tessellateSolidUV(solid: number, deflection: number): string;

  // ── BREP serialization ────────────────────────────────────────

  /** Serialize a solid to brepkit's native BREP JSON format. */
  toBREP(solid: number): string;

  // ── Sketch ────────────────────────────────────────────────────

  /** Get degrees of freedom remaining in a sketch. */
  sketchDof(sketch: number): number;

  // ── Not yet exposed (future PRs) ──────────────────────────────

  /** Classify a point on a face (trim-aware). (Theme G) */
  classifyPointOnFace?(face: number, u: number, v: number, tolerance: number): number;

  /** Distance between two arbitrary shapes. (Theme G) */
  shapeToShapeDistance?(id1: number, id2: number): number[];

  /** 2D curve intersection. (Theme F) */
  intersectCurves2d?(...args: number[]): number[];

  /** Project point onto 2D curve. (Theme F) */
  projectPointOnCurve2d?(...args: number[]): number[];

  /** Reverse a 2D curve. (Theme F) */
  reverseCurve2d?(...args: number[]): number[];

  // ── wasm-bindgen destructor ────────────────────────────────────

  /** Release the entire arena. */
  free(): void;
}
