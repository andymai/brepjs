/**
 * AUTO-GENERATED — do not edit manually.
 * Run `npm run generate-types` to regenerate from brepjs package types.
 *
 * Ambient type declarations for brepjs available in the playground editor.
 */

/** @internal */ declare abstract class Finder<Type, FilterType> {}
/** @internal */ declare abstract class Finder3d<Type> extends Finder<Type, AnyShape> {}
/** @internal */ interface BlueprintLike {}
/** @internal */ declare abstract class PhysicalProperties {}
type KernelAdapter = KernelCore & KernelBooleanOps & KernelPrimitiveOps & KernelBuilderOps & KernelSweepOps & KernelModifierOps & KernelTransformOps & KernelEvolutionOps & KernelMeshOps & KernelIOOps & KernelMeasureOps & KernelTopologyOps & KernelCurveOps & KernelSurfaceOps & KernelRepairOps & Kernel2DCapability;

type ShapeType = 'vertex' | 'edge' | 'wire' | 'face' | 'shell' | 'solid' | 'compsolid' | 'compound';

/** Surface type discriminant returned by surfaceType(). */
type SurfaceType = 'plane' | 'cylinder' | 'cone' | 'sphere' | 'torus' | 'bezier' | 'bspline' | 'revolution' | 'extrusion' | 'offset' | 'other';

/** Shape orientation. */
type ShapeOrientation = 'forward' | 'reversed' | 'internal' | 'external';

/** Capability for 2D constraint sketch solving. */
interface ConstraintSketchCapability {
    /** Create a new constraint sketch. Returns an opaque sketch handle. */
    sketchNew(): number;
    /** Add a point to a constraint sketch. Returns the point index. */
    sketchAddPoint(sketch: number, x: number, y: number, fixed: boolean): number;
    /** Add an arc entity to a constraint sketch. Returns the arc index. */
    sketchAddArc(sketch: number, centerIdx: number, startIdx: number, endIdx: number): number;
    /** Add a constraint to a sketch (JSON-encoded constraint descriptor). */
    sketchAddConstraint(sketch: number, constraintJson: string): void;
    /** Solve sketch constraints. Returns a JSON result with solved point positions. */
    sketchSolve(sketch: number, maxIterations: number, tolerance: number): string;
    /** Get degrees of freedom remaining in a constraint sketch. Returns JSON string. */
    sketchDof(sketch: number): string;
}

/** Capability for hidden-line removal (3D → 2D projection). */
interface ProjectionCapability {
    /** Project 3D edges onto a 2D plane (hidden line removal). */
    projectEdges(shape: KernelShape, cameraOrigin: [number, number, number], cameraDirection: [number, number, number], cameraXAxis?: [number, number, number]): {
        visible: {
            outline: KernelShape;
            smooth: KernelShape;
            sharp: KernelShape;
        };
        hidden: {
            outline: KernelShape;
            smooth: KernelShape;
            sharp: KernelShape;
        };
    };
}

/** Check if the kernel supports hidden-line-removal projection. */
declare function supportsProjection(kernel: KernelAdapter): kernel is KernelAdapter & ProjectionCapability;

/** Check if the kernel supports 2D constraint sketch solving. */
declare function supportsConstraintSketch(kernel: KernelAdapter): kernel is KernelAdapter & ConstraintSketchCapability;

interface KernelBooleanOps {
    /** Fuse (union) two shapes. */
    fuse(shape: KernelShape, tool: KernelShape, options?: BooleanOptions): KernelShape;
    /** Cut (subtract) tool from shape. */
    cut(shape: KernelShape, tool: KernelShape, options?: BooleanOptions): KernelShape;
    /** Intersect two shapes. */
    intersect(shape: KernelShape, tool: KernelShape, options?: BooleanOptions): KernelShape;
    /** Cross-section: intersect shape with a plane. */
    section(shape: KernelShape, plane: KernelShape, approximation?: boolean): KernelShape;
    /** Fuse all shapes in one operation (N-way union). */
    fuseAll(shapes: KernelShape[], options?: BooleanOptions): KernelShape;
    /** Cut all tools from shape sequentially. */
    cutAll(shape: KernelShape, tools: KernelShape[], options?: BooleanOptions): KernelShape;
    /** Split shape by tool shapes. */
    split(shape: KernelShape, tools: KernelShape[]): KernelShape;
    /** Pre-validate operands before a boolean operation. */
    checkBoolean(shape: KernelShape, tool: KernelShape, op: BooleanOpType): CheckBooleanResult;
    /**
     * Boolean operation on raw triangle data. Returns merged mesh.
     *
     * **Cross-kernel note**: Only brepkit supports mesh booleans natively.
     * OCCT adapter throws.
     */
    meshBoolean(positionsA: number[], indicesA: number[], positionsB: number[], indicesB: number[], op: string, tolerance: number): KernelMeshResult;
    /** Execute a chained boolean pipeline in a single WASM call (optional). */
    booleanPipeline?(base: KernelShape, steps: ReadonlyArray<{
        op: 'fuse' | 'cut' | 'intersect';
        tool: KernelShape;
    }>, options?: {
        glueMode?: number | undefined;
        fuzzyValue?: number | undefined;
    }): KernelShape | null;
}

interface KernelBuilderOps {
    makeVertex(x: number, y: number, z: number): KernelShape;
    makeEdge(curve: KernelType, start?: number, end?: number): KernelShape;
    makeWire(edges: KernelShape[]): KernelShape;
    makeFace(wire: KernelShape, planar?: boolean): KernelShape;
    makeLineEdge(p1: [number, number, number], p2: [number, number, number]): KernelShape;
    makeCircleEdge(center: [number, number, number], normal: [number, number, number], radius: number): KernelShape;
    makeCircleArc(center: [number, number, number], normal: [number, number, number], radius: number, startAngle: number, endAngle: number): KernelShape;
    makeArcEdge(p1: [number, number, number], p2: [number, number, number], p3: [number, number, number]): KernelShape;
    makeEllipseEdge(center: [number, number, number], normal: [number, number, number], majorRadius: number, minorRadius: number, xDir?: [number, number, number]): KernelShape;
    makeEllipseArc(center: [number, number, number], normal: [number, number, number], majorRadius: number, minorRadius: number, startAngle: number, endAngle: number, xDir?: [number, number, number]): KernelShape;
    makeBezierEdge(points: [number, number, number][]): KernelShape;
    makeTangentArc(startPoint: [number, number, number], startTangent: [number, number, number], endPoint: [number, number, number]): KernelShape;
    makeHelixWire(pitch: number, height: number, radius: number, center?: [number, number, number], direction?: [number, number, number], leftHanded?: boolean): KernelShape;
    /** Build a wire from a mix of edges and wires (uses Add_1 for edges, Add_2 for wires). */
    makeWireFromMixed(items: KernelShape[]): KernelShape;
    makeCompound(shapes: KernelShape[]): KernelShape;
    solidFromShell(shell: KernelShape): KernelShape;
    hull(shapes: KernelShape[], tolerance: number): KernelShape;
    hullFromPoints(points: Array<{
        x: number;
        y: number;
        z: number;
    }>, tolerance: number): KernelShape;
    buildSolidFromFaces(points: Array<{
        x: number;
        y: number;
        z: number;
    }>, faces: Array<readonly [number, number, number]>, tolerance: number): KernelShape;
    /** Build a non-planar face by filling a wire's boundary. */
    makeNonPlanarFace(wire: KernelShape): KernelShape;
    /** Add hole wires to an existing face. */
    addHolesInFace(face: KernelShape, holeWires: KernelShape[]): KernelShape;
    /** Remove all inner wires (holes) from a face. Returns a new face with only the outer boundary. */
    removeHolesFromFace(face: KernelShape): KernelShape;
    /** Build a face on an existing surface bounded by a wire. */
    makeFaceOnSurface(surface: KernelType, wire: KernelShape): KernelShape;
    /** Fit a B-spline surface through a grid of Z-heights. */
    bsplineSurface(points: [number, number, number][], rows: number, cols: number): KernelShape;
    /** Build a triangulated surface from a height grid. */
    triangulatedSurface(points: [number, number, number][], rows: number, cols: number): KernelShape;
    /**
     * Build a triangular face from 3 points. Returns null if degenerate.
     * Used by importers, hull, roof, and surface builders.
     */
    buildTriFace(a: [number, number, number], b: [number, number, number], c: [number, number, number]): KernelShape | null;
    /** Sew triangular faces into a shell and convert to solid. */
    sewAndSolidify(faces: KernelShape[], tolerance: number): KernelShape;
    createPoint3d(x: number, y: number, z: number): KernelType;
    createDirection3d(x: number, y: number, z: number): KernelType;
    createVector3d(x: number, y: number, z: number): KernelType;
    createAxis1(cx: number, cy: number, cz: number, dx: number, dy: number, dz: number): KernelType;
    createAxis2(ox: number, oy: number, oz: number, zx: number, zy: number, zz: number, xx?: number, xy?: number, xz?: number): KernelType;
    createAxis3(ox: number, oy: number, oz: number, zx: number, zy: number, zz: number, xx?: number, xy?: number, xz?: number): KernelType;
}

interface KernelCore {
    /**
     * The raw kernel WASM instance.
     *
     * @internal Only code in `kernel/` and `core/` may access this property.
     * Layer 2+ code must use typed adapter methods instead.
     */
    readonly oc: KernelInstance;
    /**
     * Unique string identifying this kernel implementation.
     * Used to prevent mixing shapes from different kernels.
     */
    readonly kernelId: string;
    /**
     * What this kernel *is* — exact vs mesh-approximate, can export B-rep, how
     * tessellation is controlled. Lets callers route export/measurement and
     * quality without hard-coding kernel ids. See {@link ../capabilities.js}.
     */
    readonly capabilities: KernelCapabilities;
    /**
     * Apply a tessellation quality level. Implemented only by `build-time`
     * kernels (e.g. Manifold maps it to a global circular-segment setting before
     * solids are built); `extract-time` kernels leave this undefined and instead
     * read the active level as their default deflection at `mesh()`/export time.
     */
    setQuality?(level: QualityLevel): void;
    /** Dispose a kernel handle, releasing its resources. */
    dispose(handle: {
        delete(): void;
    }): void;
    /** Execute a batch of kernel operations from JSON. Returns JSON result. */
    executeBatch(json: string): string;
    /** Create an arena checkpoint. Returns checkpoint index. */
    checkpoint(): number;
    /** Get the current number of active checkpoints. */
    checkpointCount(): number;
    /** Restore arena to a checkpoint, freeing all handles created after it. */
    restoreCheckpoint(cp: number): void;
    /** Discard a checkpoint without restoring (keep all handles). */
    discardCheckpoint(cp: number): void;
}

interface KernelCurveOps {
    /** Get the geometric curve type (LINE, CIRCLE, BSPLINE, etc.). */
    curveType(shape: KernelShape): string;
    curveParameters(shape: KernelShape): [number, number];
    /** Evaluate a point at a raw parameter value on a curve. */
    curvePointAtParam(shape: KernelShape, param: number): [number, number, number];
    curveTangent(shape: KernelShape, param: number): {
        point: [number, number, number];
        tangent: [number, number, number];
    };
    /** Check if a curve is closed. */
    curveIsClosed(shape: KernelShape): boolean;
    /** Check if a curve is periodic. */
    curveIsPeriodic(shape: KernelShape): boolean;
    /** Get the period of a periodic curve. */
    curvePeriod(shape: KernelShape): number;
    interpolatePoints(points: [number, number, number][], options?: {
        periodic?: boolean;
        tolerance?: number;
    }): KernelShape;
    approximatePoints(points: [number, number, number][], options?: {
        tolerance?: number;
        degMin?: number;
        degMax?: number;
        smoothing?: [number, number, number] | null;
    }): KernelShape;
    /** Elevate the degree of a NURBS edge curve. */
    curveDegreeElevate(edge: KernelShape, elevateBy: number): KernelShape;
    /** Insert a knot into a NURBS edge curve. */
    curveKnotInsert(edge: KernelShape, knot: number, times: number): KernelShape;
    /** Remove a knot from a NURBS edge curve. */
    curveKnotRemove(edge: KernelShape, knot: number, tolerance: number): KernelShape;
    /** Split a NURBS edge curve at a parameter. Returns two edges. */
    curveSplit(edge: KernelShape, param: number): [KernelShape, KernelShape];
    /** Create a BRepAdaptor for curve evaluation (CompCurve for wires, Curve for edges). */
    createCurveAdaptor(shape: KernelShape): KernelType;
    /** Get the second-to-last Bezier control pole of a 3D edge curve. */
    getBezierPenultimatePole(edge: KernelShape): [number, number, number] | null;
    /** Extract NURBS data from a BSpline/Bezier edge. Returns null for non-NURBS curves. */
    getNurbsCurveData?(edge: KernelShape): NurbsCurveData | null;
}

interface KernelEvolutionOps {
    translateWithHistory(shape: KernelShape, x: number, y: number, z: number, inputFaceHashes: number[], hashUpperBound: number): OperationResult;
    rotateWithHistory(shape: KernelShape, angle: number, inputFaceHashes: number[], hashUpperBound: number, axis?: readonly [number, number, number], center?: readonly [number, number, number]): OperationResult;
    mirrorWithHistory(shape: KernelShape, origin: readonly [number, number, number], normal: readonly [number, number, number], inputFaceHashes: number[], hashUpperBound: number): OperationResult;
    scaleWithHistory(shape: KernelShape, center: readonly [number, number, number], factor: number, inputFaceHashes: number[], hashUpperBound: number): OperationResult;
    generalTransformWithHistory(shape: KernelShape, linear: readonly [number, number, number, number, number, number, number, number, number], translation: readonly [number, number, number], isOrthogonal: boolean, inputFaceHashes: number[], hashUpperBound: number): OperationResult;
    fuseWithHistory(shape: KernelShape, tool: KernelShape, inputFaceHashes: number[], hashUpperBound: number, options?: BooleanOptions): DiagnosticOperationResult;
    cutWithHistory(shape: KernelShape, tool: KernelShape, inputFaceHashes: number[], hashUpperBound: number, options?: BooleanOptions): DiagnosticOperationResult;
    intersectWithHistory(shape: KernelShape, tool: KernelShape, inputFaceHashes: number[], hashUpperBound: number, options?: BooleanOptions): DiagnosticOperationResult;
    filletWithHistory(shape: KernelShape, edges: KernelShape[], radius: number | [number, number] | ((edge: KernelShape) => number | [number, number]), inputFaceHashes: number[], hashUpperBound: number): OperationResult;
    chamferWithHistory(shape: KernelShape, edges: KernelShape[], distance: number | [number, number] | ((edge: KernelShape) => number | [number, number]), inputFaceHashes: number[], hashUpperBound: number): OperationResult;
    shellWithHistory(shape: KernelShape, faces: KernelShape[], thickness: number, inputFaceHashes: number[], hashUpperBound: number, tolerance?: number): OperationResult;
    thickenWithHistory(shape: KernelShape, thickness: number, inputFaceHashes: number[], hashUpperBound: number): OperationResult;
    offsetWithHistory(shape: KernelShape, distance: number, inputFaceHashes: number[], hashUpperBound: number, tolerance?: number): OperationResult;
    draftWithHistory(shape: KernelShape, faces: KernelShape[], pullDirection: [number, number, number], neutralPlane: [number, number, number], angleDeg: number | ((face: KernelShape) => number), inputFaceHashes: number[], hashUpperBound: number): OperationResult;
    /** Apply a composed transform to a shape with history tracking. */
    applyComposedTransformWithHistory(shape: KernelShape, transformHandle: KernelType, inputFaceHashes: number[], hashUpperBound: number): OperationResult;
}

interface KernelIOOps {
    exportSTEP(shapes: KernelShape[]): string;
    exportSTL(shape: KernelShape, binary?: boolean, tolerance?: number, angularTolerance?: number): string | ArrayBuffer;
    importSTEP(data: string | ArrayBuffer): KernelShape[];
    importSTL(data: string | ArrayBuffer): KernelShape;
    exportIGES(shapes: KernelShape[]): string;
    importIGES(data: string | ArrayBuffer): KernelShape[];
    exportSTEPAssembly(parts: StepAssemblyPart[], options?: {
        unit?: string;
    }): string;
    /** Export shape to 3MF format. Returns binary data. */
    export3MF(shape: KernelShape, tolerance: number): ArrayBuffer;
    /** Export shape to GLB format. Returns binary data. */
    exportGLB(shape: KernelShape, tolerance: number): ArrayBuffer;
    /** Export shape to OBJ format. Returns binary data. */
    exportOBJ(shape: KernelShape, tolerance: number): ArrayBuffer;
    /** Export shape to PLY format (binary). Returns binary data. */
    exportPLY(shape: KernelShape, tolerance: number): ArrayBuffer;
    /** Import from 3MF format. Returns solid shapes. */
    import3MF(data: ArrayBuffer): KernelShape[];
    /** Import from OBJ format. Returns a solid shape. */
    importOBJ(data: ArrayBuffer): KernelShape;
    /** Import from GLB format. Returns a solid shape. */
    importGLB(data: ArrayBuffer): KernelShape;
    /**
     * Serialize a shape to a string format for persistence.
     *
     * **Cross-kernel warning**: The serialization format is kernel-specific.
     * OCCT uses its native BREP text format; brepkit proxies to STEP.
     * Data produced by one kernel cannot be deserialized by the other.
     */
    toBREP(shape: KernelShape): string;
    /** @see {@link toBREP} for cross-kernel compatibility notes. */
    fromBREP(data: string): KernelShape;
    /** Create an XCAF document with named, colored shape nodes. Caller must delete the returned handle. */
    createXCAFDocument(shapes: Array<{
        shape: KernelShape;
        name: string;
        color?: [number, number, number, number] | undefined;
    }>): KernelType;
    /** Write an XCAF document to STEP format and return the string. */
    writeXCAFToSTEP(doc: KernelType, options?: {
        unit?: string | undefined;
        modelUnit?: string | undefined;
    }): string;
    /** Export shapes to STEP with full configuration (units, assembly mode). */
    exportSTEPConfigured(shapes: Array<{
        shape: KernelShape;
        name?: string | undefined;
        color?: [number, number, number, number] | undefined;
    }>, options?: {
        unit?: string | undefined;
        modelUnit?: string | undefined;
        schema?: number | undefined;
    }): string;
}

interface KernelMeasureOps {
    volume(shape: KernelShape): number;
    area(shape: KernelShape): number;
    length(shape: KernelShape): number;
    centerOfMass(shape: KernelShape): [number, number, number];
    linearCenterOfMass(shape: KernelShape): [number, number, number];
    boundingBox(shape: KernelShape): {
        min: [number, number, number];
        max: [number, number, number];
    };
    /** Minimum distance between two shapes with witness points. */
    distance(shape1: KernelShape, shape2: KernelShape): DistanceResult;
    /** Compute surface curvature at a UV point on a face. */
    surfaceCurvature(face: KernelShape, u: number, v: number): {
        gaussian: number;
        mean: number;
        max: number;
        min: number;
        maxDirection: [number, number, number];
        minDirection: [number, number, number];
    };
    /** Surface-based center of mass (uses surface properties, not volume). */
    surfaceCenterOfMass(face: KernelShape): [number, number, number];
    /** Compute volume, area, length, center-of-mass, and bounding box in one call. */
    measureBulk(shape: KernelShape, includeLinear?: boolean): BulkMeasurement;
    /** Create a persistent distance query tool for repeated measurements. */
    createDistanceQuery(referenceShape: KernelShape): {
        distanceTo(shape: KernelShape): {
            value: number;
            point1: [number, number, number];
            point2: [number, number, number];
        };
        dispose(): void;
    };
}

interface KernelMeshOps {
    mesh(shape: KernelShape, options: MeshOptions): KernelMeshResult;
    /**
     * Tessellate edges for wireframe display.
     *
     * **Cross-kernel note**: brepkit only supports linear deflection;
     * `angularTolerance` is ignored (a one-time warning is emitted).
     */
    meshEdges(shape: KernelShape, tolerance: number, angularTolerance: number): KernelEdgeMeshResult;
    /** Check if a shape already has triangulation data. */
    hasTriangulation(shape: KernelShape): boolean;
    /**
     * Pre-compute mesh data for a shape (incremental meshing).
     *
     * **Cross-kernel note**: brepkit only supports linear deflection;
     * `angularTolerance` is ignored.
     */
    meshShape(shape: KernelShape, tolerance: number, angularTolerance: number): void;
}

interface KernelModifierOps {
    fillet(shape: KernelShape, edges: KernelShape[], radius: number | [number, number] | ((edge: KernelShape) => number | [number, number])): KernelShape;
    chamfer(shape: KernelShape, edges: KernelShape[], distance: number | [number, number] | ((edge: KernelShape) => number | [number, number])): KernelShape;
    chamferDistAngle(shape: KernelShape, edges: KernelShape[], distance: number, angleDeg: number): KernelShape;
    shell(shape: KernelShape, faces: KernelShape[], thickness: number, tolerance?: number): KernelShape;
    thicken(shape: KernelShape, thickness: number): KernelShape;
    offset(shape: KernelShape, distance: number, tolerance?: number): KernelShape;
    /** Variable-radius fillet. Each entry specifies edges and radii per edge. */
    filletVariable(shape: KernelShape, spec: string): KernelShape;
    /**
     * Draft (taper) faces of a solid along a pull direction about a neutral plane.
     *
     * The neutral plane is the surface where material is neither added nor removed.
     * Angle is in degrees; positive tapers outward from the pull direction.
     *
     * @param angleDeg - Uniform angle, or per-face callback returning degrees (null to skip).
     */
    draft(shape: KernelShape, faces: KernelShape[], pullDirection: [number, number, number], neutralPlane: [number, number, number], angleDeg: number | ((face: KernelShape) => number)): KernelShape;
    /** Remove faces from a solid (defeaturing). */
    defeature(shape: KernelShape, faces: KernelShape[]): KernelShape;
    /** 2D offset for wires on a plane. */
    offsetWire2D(wire: KernelShape, offset: number, joinType?: number | 'arc' | 'intersection' | 'tangent'): KernelShape;
    /** Simplify a shape by merging same-domain faces and edges. */
    simplify(shape: KernelShape): KernelShape;
    /** Return a copy of the shape with reversed orientation. */
    reverseShape(shape: KernelShape): KernelShape;
    /** Batch shell: hollow N solids in a single WASM call. */
    shellBatch?(entries: ReadonlyArray<{
        shape: KernelShape;
        faces: KernelShape[];
        thickness: number;
        tolerance?: number | undefined;
    }>): KernelShape[];
    /** Batch fillet: round edges on N solids in a single WASM call. */
    filletBatch?(entries: ReadonlyArray<{
        shape: KernelShape;
        edges: ReadonlyArray<{
            edge: KernelShape;
            radius: number;
            r2?: number | undefined;
        }>;
    }>): KernelShape[];
}

interface KernelPrimitiveOps {
    makeBox(width: number, height: number, depth: number): KernelShape;
    makeCylinder(radius: number, height: number, center?: [number, number, number], direction?: [number, number, number]): KernelShape;
    makeSphere(radius: number, center?: [number, number, number]): KernelShape;
    makeCone(radius1: number, radius2: number, height: number, center?: [number, number, number], direction?: [number, number, number]): KernelShape;
    makeTorus(majorRadius: number, minorRadius: number, center?: [number, number, number], direction?: [number, number, number]): KernelShape;
    /** Build an ellipsoid solid with the given axis half-lengths. */
    makeEllipsoid(aLength: number, bLength: number, cLength: number): KernelShape;
    makeBoxFromCorners(p1: [number, number, number], p2: [number, number, number]): KernelShape;
    makeRectangle(width: number, height: number): KernelShape;
}

interface KernelRepairOps {
    /**
     * Check if a shape is topologically and geometrically valid.
     *
     * Uses relaxed validation when available — accepts NURBS approximation
     * tolerances that strict mode would flag.
     *
     * **Cross-kernel note**: OCCT uses `BRepCheck_Analyzer` (no relaxed
     * variant). brepkit uses `validateSolidRelaxed()`.
     */
    isValid(shape: KernelShape): boolean;
    /**
     * Strict validation — fails on any geometric or topological issue,
     * including NURBS approximation gaps.
     *
     * **Cross-kernel note**: OCCT's `BRepCheck_Analyzer` is inherently
     * strict, so this is identical to `isValid`. brepkit uses
     * `validateSolid()` (strict).
     */
    isValidStrict?(shape: KernelShape): boolean;
    healSolid(shape: KernelShape): KernelShape | null;
    healFace(shape: KernelShape): KernelShape;
    healWire(wire: KernelShape, face?: KernelShape): KernelShape;
    /** Merge coincident vertices within tolerance. Returns merge count. */
    mergeCoincidentVertices(shape: KernelShape, tolerance: number): number;
    /** Remove zero-length (degenerate) edges. Returns removal count. */
    removeDegenerateEdges(shape: KernelShape, tolerance: number): number;
    /** Fix face orientations for consistent normals. Returns fix count. */
    fixFaceOrientations(shape: KernelShape): number;
    /** Run ShapeFix_Shape on a shape (fixes orientation, etc.). */
    fixShape(shape: KernelShape): KernelShape;
    /** Fix self-intersections in a wire. */
    fixSelfIntersection(wire: KernelShape): KernelShape;
}

interface KernelSurfaceOps {
    vertexPosition(vertex: KernelShape): [number, number, number];
    surfaceType(face: KernelShape): SurfaceType;
    uvBounds(face: KernelShape): {
        uMin: number;
        uMax: number;
        vMin: number;
        vMax: number;
    };
    outerWire(face: KernelShape): KernelShape;
    surfaceNormal(face: KernelShape, u: number, v: number): [number, number, number];
    pointOnSurface(face: KernelShape, u: number, v: number): [number, number, number];
    uvFromPoint(face: KernelShape, point: [number, number, number]): [number, number] | null;
    projectPointOnFace(face: KernelShape, point: [number, number, number]): [number, number, number];
    classifyPointOnFace(face: KernelShape, u: number, v: number, tolerance?: number): 'in' | 'on' | 'out';
    /** Classify a point using robust dual-method. */
    classifyPointRobust(shape: KernelShape, point: [number, number, number], tolerance: number): string;
    /** Classify a point using winding numbers. */
    classifyPointWinding(shape: KernelShape, point: [number, number, number], tolerance: number): string;
    /** Approximate a surface via LSPIA. */
    approximateSurfaceLspia(coords: number[], rows: number, cols: number, degreeU: number, degreeV: number, numCpsU: number, numCpsV: number, tolerance: number, maxIterations: number): KernelShape;
    /** Untrim a NURBS face to its full surface domain. */
    untrimFace(face: KernelShape, samplesPerCurve: number, interiorSamples: number): KernelShape;
    /** Extract cylinder data from a surface handle. Returns null if not a cylinder. */
    getSurfaceCylinderData(surface: KernelType): {
        radius: number;
        isDirect: boolean;
    } | null;
    /**
     * Get a face's analytic axis of symmetry (e.g. a cylinder's axis): a point on
     * the axis plus a unit direction. Returns null if the face has no well-defined
     * axis (non-cylindrical, or the adapter can't determine it).
     */
    getSurfaceAxis(face: KernelShape): {
        origin: [number, number, number];
        direction: [number, number, number];
    } | null;
    /** Reverse the U direction of a surface. Returns a new surface handle. */
    reverseSurfaceU(surface: KernelType): KernelType;
    /** Detect small features (faces below area threshold). Returns face shapes. */
    detectSmallFeatures(shape: KernelShape, areaThreshold: number, tolerance: number): KernelShape[];
    /** Recognize geometric features. Returns JSON description. */
    recognizeFeatures(shape: KernelShape, tolerance: number): string;
    /** Project 3D edges onto a 2D plane (hidden line removal). */
    projectEdges(shape: KernelShape, cameraOrigin: [number, number, number], cameraDirection: [number, number, number], cameraXAxis?: [number, number, number]): {
        visible: {
            outline: KernelShape;
            smooth: KernelShape;
            sharp: KernelShape;
        };
        hidden: {
            outline: KernelShape;
            smooth: KernelShape;
            sharp: KernelShape;
        };
    };
    /** Extract NURBS data from a BSpline face. Returns null for non-BSpline surfaces. */
    getNurbsSurfaceData?(face: KernelShape): NurbsSurfaceData | null;
}

interface KernelSweepOps {
    extrude(face: KernelShape, direction: [number, number, number], length: number): KernelShape;
    revolve(shape: KernelShape, axis: KernelType, angle: number): KernelShape;
    loft(wires: KernelShape[], ruled?: boolean, startShape?: KernelShape, endShape?: KernelShape): KernelShape;
    sweep(wire: KernelShape, spine: KernelShape, options?: {
        transitionMode?: number;
    }): KernelShape;
    simplePipe(profile: KernelShape, spine: KernelShape): KernelShape;
    /** Helical sweep of a profile around an axis. */
    helicalSweep(profile: KernelShape, axisOrigin: [number, number, number], axisDirection: [number, number, number], radius: number, pitch: number, turns: number): KernelShape;
    /** Sweep with options (contact mode, scale law, segments). */
    sweepWithOptions(profile: KernelShape, pathEdge: KernelShape, contactMode: string, scaleValues: number[], segments: number): KernelShape;
    /** Sweep a profile along a spine with advanced options (transition mode, auxiliary spine, law). */
    sweepPipeShell(profile: KernelShape, spine: KernelShape, options?: {
        transitionMode?: 'transformed' | 'round' | 'right';
        auxiliary?: KernelShape;
        law?: KernelType;
        contact?: boolean;
        correction?: boolean;
        frenet?: boolean;
        support?: KernelType;
        shellMode?: boolean;
        tolerance?: number | undefined;
        boundTolerance?: number | undefined;
        angularTolerance?: number | undefined;
        maxDegree?: number | undefined;
        maxSegments?: number | undefined;
    }): KernelShape | {
        shape: KernelShape;
        firstShape: KernelShape;
        lastShape: KernelShape;
    };
    /** Loft through wires with options for shell mode, ruled surface, and vertex caps. */
    loftAdvanced(wires: KernelShape[], options?: {
        solid?: boolean;
        ruled?: boolean;
        tolerance?: number;
        startVertex?: KernelShape;
        endVertex?: KernelShape;
    }): KernelShape;
    /** Build an extrusion scaling law (s-curve or linear). */
    buildExtrusionLaw(profile: 'linear' | 's-curve', length: number, endFactor: number): KernelType;
    /** Revolve a shape around an axis defined by center+direction (Vec3s, not KernelType axis). */
    revolveVec(shape: KernelShape, center: [number, number, number], direction: [number, number, number], angle: number): KernelShape;
    /** Create a draft prism (tapered extrusion with draft angle). */
    draftPrism(shape: KernelShape, face: KernelShape, baseFace: KernelShape, height: number | null, angleDeg: number, fuse: boolean): KernelShape;
    /** Batch loft: build N independent lofts in a single WASM call. */
    loftBatch?(entries: ReadonlyArray<{
        wires: KernelShape[];
        solid?: boolean | undefined;
        ruled?: boolean | undefined;
        tolerance?: number | undefined;
        startVertex?: KernelShape | undefined;
        endVertex?: KernelShape | undefined;
    }>): KernelShape[];
    /** Batch extrude: build N independent extrusions in a single WASM call. */
    extrudeBatch?(entries: ReadonlyArray<{
        face: KernelShape;
        direction: [number, number, number];
        length: number;
    }>): KernelShape[];
}

interface KernelTopologyOps {
    /** Iterate sub-shapes of a given type. */
    iterShapes(shape: KernelShape, type: ShapeType): KernelShape[];
    /** Iterate a TopTools_ListOfShape, calling a callback for each item. */
    iterShapeList(list: KernelShape, callback: (item: KernelShape) => void): void;
    /** Get the topological type of a shape. */
    shapeType(shape: KernelShape): ShapeType;
    /** Test if two shapes are the same topological entity. */
    isSame(a: KernelShape, b: KernelShape): boolean;
    /** Test if two shapes are geometrically equal (same location + orientation). */
    isEqual(a: KernelShape, b: KernelShape): boolean;
    /** Downcast a shape to a more specific type (e.g., any → TopoDS_Edge). */
    downcast(shape: KernelShape, type?: ShapeType): KernelShape;
    /** Compute a hash code for a shape (used for face tracking). */
    hashCode(shape: KernelShape, upperBound: number): number;
    /** Check if a shape handle is null. */
    isNull(shape: KernelShape): boolean;
    /** Get the orientation of a shape (forward, reversed, internal, external). */
    shapeOrientation(shape: KernelShape): ShapeOrientation;
    /** Get edge-to-face adjacency map as JSON. */
    edgeToFaceMap(shape: KernelShape): string;
    /** Get shared edges between two faces. */
    sharedEdges(faceA: KernelShape, faceB: KernelShape): KernelShape[];
    /** Get faces adjacent to a given face within a shape. */
    adjacentFaces(shape: KernelShape, face: KernelShape): KernelShape[];
    /** Sew shapes together at shared edges. */
    sew(shapes: KernelShape[], tolerance?: number): KernelShape;
}

interface KernelTransformOps {
    /** Create a composed transform from a sequence of translate/rotate operations. Returns an opaque handle. */
    composeTransform(ops: Array<{
        type: 'translate';
        x: number;
        y: number;
        z: number;
    } | {
        type: 'rotate';
        angle: number;
        axis?: readonly [number, number, number] | undefined;
        center?: readonly [number, number, number] | undefined;
    }>): {
        handle: KernelType;
        dispose: () => void;
    };
    transform(shape: KernelShape, trsf: KernelType): KernelShape;
    translate(shape: KernelShape, x: number, y: number, z: number): KernelShape;
    rotate(shape: KernelShape, angle: number, axis?: readonly [number, number, number], center?: readonly [number, number, number]): KernelShape;
    mirror(shape: KernelShape, origin: readonly [number, number, number], normal: readonly [number, number, number]): KernelShape;
    scale(shape: KernelShape, center: readonly [number, number, number], factor: number): KernelShape;
    generalTransform(shape: KernelShape, linear: readonly [number, number, number, number, number, number, number, number, number], translation: readonly [number, number, number], isOrthogonal: boolean): KernelShape;
    /** Apply a non-orthogonal general transform (gp_GTrsf path for shear / non-uniform scale). */
    generalTransformNonOrthogonal(shape: KernelShape, linear: readonly [number, number, number, number, number, number, number, number, number], translation: readonly [number, number, number]): KernelShape;
    /** Position a shape at a parameter along a spine curve (Frenet frame transform). */
    positionOnCurve(shape: KernelShape, spine: KernelShape, param: number): KernelShape;
    /** Generate a linear pattern of shapes with pooled transforms for performance. */
    linearPattern(shape: KernelShape, direction: [number, number, number], spacing: number, count: number): KernelShape[];
    /** Generate a circular pattern of shapes. */
    circularPattern(shape: KernelShape, center: [number, number, number], axis: [number, number, number], angleStep: number, count: number): KernelShape[];
    /** Generate a 2D grid pattern (brepkit-native). Returns a compound. */
    gridPattern?(shape: KernelShape, directionX: [number, number, number], directionY: [number, number, number], spacingX: number, spacingY: number, countX: number, countY: number): KernelShape;
    /** Apply N transforms in a single call. */
    transformBatch(entries: TransformEntry[]): KernelShape[];
}

/**
 * Typed wrapper around a brepkit u32 arena handle.
 *
 * brepjs passes these around as opaque `KernelShape`. The adapter extracts
 * the `.id` and `.type` when calling back into brepkit WASM.
 */
interface BrepkitHandle {
    readonly __brepkit: true;
    readonly type: ShapeType;
    /** Raw u32 arena index. */
    readonly id: number;
    /** No-op -- arena-based allocation doesn't free individual handles.
     *  Present for compatibility with OCCT's wasm-bindgen `.delete()` convention. */
    delete(): void;
    /** OCCT-compatible hash code derived from the arena handle id. */
    HashCode(upperBound: number): number;
    /** OCCT-compatible null check -- brepkit handles are never null. */
    IsNull(): boolean;
}

/**
 * Typed wrapper around an occt-wasm u32 arena handle.
 *
 * brepjs passes these around as opaque `KernelShape`. The adapter extracts
 * the `.id` when calling back into the WASM kernel.
 */
interface OcctWasmHandle {
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

/**
 * Type-safe view of occt-wasm's Embind `OcctKernel` class.
 *
 * All handle parameters and return values are `number` (u32 arena indices).
 */
interface OcctKernelWasm {
    release(id: number): void;
    releaseAll(): void;
    getShapeCount(): number;
    makeBox(dx: number, dy: number, dz: number): number;
    makeBoxFromCorners(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): number;
    makeCylinder(radius: number, height: number): number;
    makeSphere(radius: number): number;
    makeCone(r1: number, r2: number, height: number): number;
    makeTorus(majorRadius: number, minorRadius: number): number;
    makeEllipsoid(rx: number, ry: number, rz: number): number;
    makeRectangle(width: number, height: number): number;
    fuse(a: number, b: number): number;
    cut(a: number, b: number): number;
    common(a: number, b: number): number;
    intersect(a: number, b: number): number;
    section(a: number, b: number): number;
    fuseAll(shapeIds: EmVectorUint32): number;
    cutAll(shapeId: number, toolIds: EmVectorUint32): number;
    split(shapeId: number, toolIds: EmVectorUint32): number;
    extrude(shapeId: number, dx: number, dy: number, dz: number): number;
    revolve(shapeId: number, px: number, py: number, pz: number, dx: number, dy: number, dz: number, angleRad: number): number;
    fillet(solidId: number, edgeIds: EmVectorUint32, radius: number): number;
    chamfer(solidId: number, edgeIds: EmVectorUint32, distance: number): number;
    chamferDistAngle(solidId: number, edgeIds: EmVectorUint32, distance: number, angleDeg: number): number;
    shell(solidId: number, faceIds: EmVectorUint32, thickness: number, tolerance: number): number;
    offset(solidId: number, distance: number, tolerance: number): number;
    draft(shapeId: number, faceId: number, angleRad: number, dx: number, dy: number, dz: number): number;
    pipe(profileId: number, spineId: number): number;
    simplePipe(profileId: number, spineId: number): number;
    loft(wireIds: EmVectorUint32, isSolid: boolean, ruled: boolean): number;
    loftWithVertices(wireIds: EmVectorUint32, isSolid: boolean, ruled: boolean, startVertexId: number, endVertexId: number): number;
    sweep(wireId: number, spineId: number, transitionMode: number): number;
    sweepPipeShell(profileId: number, spineId: number, freenet: boolean, smooth: boolean): number;
    draftPrism(shapeId: number, dx: number, dy: number, dz: number, angleDeg: number): number;
    revolveVec(shapeId: number, cx: number, cy: number, cz: number, dx: number, dy: number, dz: number, angle: number): number;
    makeVertex(x: number, y: number, z: number): number;
    makeEdge(v1: number, v2: number): number;
    makeLineEdge(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): number;
    makeCircleEdge(cx: number, cy: number, cz: number, nx: number, ny: number, nz: number, radius: number): number;
    makeCircleArc(cx: number, cy: number, cz: number, nx: number, ny: number, nz: number, radius: number, startAngle: number, endAngle: number): number;
    makeArcEdge(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, x3: number, y3: number, z3: number): number;
    makeEllipseEdge(cx: number, cy: number, cz: number, nx: number, ny: number, nz: number, majorRadius: number, minorRadius: number): number;
    makeEllipseArc(cx: number, cy: number, cz: number, nx: number, ny: number, nz: number, majorRadius: number, minorRadius: number, startAngle: number, endAngle: number): number;
    makeBezierEdge(flatPoints: EmVectorDouble): number;
    makeTangentArc(x1: number, y1: number, z1: number, tx: number, ty: number, tz: number, x2: number, y2: number, z2: number): number;
    makeHelixWire(px: number, py: number, pz: number, dx: number, dy: number, dz: number, pitch: number, height: number, radius: number): number;
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
    buildTriFace(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number): number;
    translate(id: number, dx: number, dy: number, dz: number): number;
    rotate(id: number, px: number, py: number, pz: number, dx: number, dy: number, dz: number, angleRad: number): number;
    scale(id: number, px: number, py: number, pz: number, factor: number): number;
    mirror(id: number, px: number, py: number, pz: number, nx: number, ny: number, nz: number): number;
    copy(id: number): number;
    transform(id: number, matrix: EmVectorDouble): number;
    generalTransform(id: number, matrix: EmVectorDouble): number;
    linearPattern(id: number, dx: number, dy: number, dz: number, spacing: number, count: number): number;
    circularPattern(id: number, cx: number, cy: number, cz: number, ax: number, ay: number, az: number, angle: number, count: number): number;
    composeTransform(m1: EmVectorDouble, m2: EmVectorDouble): EmVectorDouble;
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
    tessellate(id: number, linearDeflection: number, angularDeflection: number): EmMeshData;
    wireframe(id: number, deflection: number): EmEdgeData;
    hasTriangulation(id: number): boolean;
    meshShape(id: number, linearDeflection: number, angularDeflection: number): EmMeshData;
    importStep(data: string): number;
    exportStep(id: number): string;
    importStl(data: string): number;
    importIges(data: string): number;
    exportIges(id: number): string;
    exportStl(id: number, linearDeflection: number, ascii: boolean): string;
    toBREP(id: number): string;
    fromBREP(data: string): number;
    getBoundingBox(id: number, useTriangulation: boolean): EmBBoxData;
    getVolume(id: number): number;
    getSurfaceArea(id: number): number;
    getLength(id: number): number;
    getCenterOfMass(id: number): EmVectorDouble;
    getSurfaceCenterOfMass(faceId: number): EmVectorDouble;
    getLinearCenterOfMass(id: number): EmVectorDouble;
    surfaceCurvature(faceId: number, u: number, v: number): EmVectorDouble;
    vertexPosition(vertexId: number): EmVectorDouble;
    surfaceType(faceId: number): string;
    surfaceNormal(faceId: number, u: number, v: number): EmVectorDouble;
    pointOnSurface(faceId: number, u: number, v: number): EmVectorDouble;
    outerWire(faceId: number): number;
    uvBounds(faceId: number): EmVectorDouble;
    uvFromPoint(faceId: number, x: number, y: number, z: number): EmVectorDouble;
    projectPointOnFace(faceId: number, x: number, y: number, z: number): EmVectorDouble;
    classifyPointOnFace(faceId: number, u: number, v: number): string;
    curveType(edgeId: number): string;
    curvePointAtParam(edgeId: number, param: number): EmVectorDouble;
    curveTangent(edgeId: number, param: number): EmVectorDouble;
    curveParameters(edgeId: number): EmVectorDouble;
    curveIsClosed(edgeId: number): boolean;
    curveIsPeriodic(edgeId: number): boolean;
    curveLength(edgeId: number): number;
    interpolatePoints(flatPoints: EmVectorDouble, periodic: boolean): number;
    approximatePoints(flatPoints: EmVectorDouble, tolerance: number): number;
    projectEdges(shapeId: number, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, xx: number, xy: number, xz: number, hasXAxis: boolean): EmProjectionData;
    getNurbsCurveData(edgeId: number): EmNurbsCurveData;
    curveDegreeElevate(edgeId: number, elevateBy: number): number;
    curveKnotInsert(edgeId: number, knot: number, times: number): number;
    curveKnotRemove(edgeId: number, knot: number, tolerance: number): number;
    curveSplit(edgeId: number, param: number): EmVectorUint32;
    liftCurve2dToPlane(flatPoints2d: EmVectorDouble, planeOx: number, planeOy: number, planeOz: number, planeZx: number, planeZy: number, planeZz: number, planeXx: number, planeXy: number, planeXz: number): number;
    xcafNewDocument(): number;
    xcafClose(docId: number): void;
    xcafAddShape(docId: number, shapeId: number): number;
    xcafSetColor(docId: number, labelId: number, r: number, g: number, b: number): void;
    xcafSetName(docId: number, labelId: number, name: string): void;
    xcafGetRootLabels(docId: number): EmVectorInt;
    xcafExportSTEP(docId: number): string;
    bsplineSurface(flatPoints: EmVectorDouble, rows: number, cols: number): number;
    makeFaceOnSurface(faceId: number, wireId: number): number;
    makeNullShape(): number;
    thicken(shapeId: number, thickness: number, tolerance: number): number;
    defeature(shapeId: number, faceIds: EmVectorUint32, tolerance: number): number;
    reverseShape(id: number): number;
    simplify(id: number): number;
    filletVariable(solidId: number, edgeId: number, startRadius: number, endRadius: number): number;
    offsetWire2D(wireId: number, offset: number, joinType: number): number;
    translateWithHistory(id: number, dx: number, dy: number, dz: number, inputFaceHashes: EmVectorInt, hashUpperBound: number): EmEvolutionData;
    fuseWithHistory(a: number, b: number, inputFaceHashes: EmVectorInt, hashUpperBound: number): EmEvolutionData;
    cutWithHistory(a: number, b: number, inputFaceHashes: EmVectorInt, hashUpperBound: number): EmEvolutionData;
    filletWithHistory(solidId: number, edgeIds: EmVectorUint32, radius: number, inputFaceHashes: EmVectorInt, hashUpperBound: number): EmEvolutionData;
    rotateWithHistory(id: number, px: number, py: number, pz: number, dx: number, dy: number, dz: number, angle: number, inputFaceHashes: EmVectorInt, hashUpperBound: number): EmEvolutionData;
    mirrorWithHistory(id: number, px: number, py: number, pz: number, nx: number, ny: number, nz: number, inputFaceHashes: EmVectorInt, hashUpperBound: number): EmEvolutionData;
    scaleWithHistory(id: number, cx: number, cy: number, cz: number, factor: number, inputFaceHashes: EmVectorInt, hashUpperBound: number): EmEvolutionData;
    intersectWithHistory(a: number, b: number, inputFaceHashes: EmVectorInt, hashUpperBound: number): EmEvolutionData;
    chamferWithHistory(solidId: number, edgeIds: EmVectorUint32, distance: number, inputFaceHashes: EmVectorInt, hashUpperBound: number): EmEvolutionData;
    shellWithHistory(solidId: number, faceIds: EmVectorUint32, thickness: number, tolerance: number, inputFaceHashes: EmVectorInt, hashUpperBound: number): EmEvolutionData;
    offsetWithHistory(solidId: number, distance: number, tolerance: number, inputFaceHashes: EmVectorInt, hashUpperBound: number): EmEvolutionData;
    thickenWithHistory(shapeId: number, thickness: number, tolerance: number, inputFaceHashes: EmVectorInt, hashUpperBound: number): EmEvolutionData;
    buildCurves3d(wireId: number): void;
    fixWireOnFace(wireId: number, faceId: number, tolerance: number): number;
    fixShape(id: number): number;
    unifySameDomain(id: number): number;
    isValid(id: number): boolean;
    healSolid(id: number, tolerance: number): number;
    healFace(id: number, tolerance: number): number;
    healWire(id: number, tolerance: number): number;
    fixFaceOrientations(id: number): number;
    removeDegenerateEdges(id: number): number;
}

/**
 * Emscripten Module interface for occt-wasm.
 *
 * Provides access to heap views (for reading mesh data from pointers)
 * and Embind vector constructors.
 */
interface OcctWasmModule {
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

/** Read accumulated stats (non-destructive). */
declare function getPerformanceStats(): PerformanceStats;

/** Reset all counters to zero. */
declare function resetPerformanceStats(): void;

/** Initialise and register the manifold kernel from a loaded manifold-3d module. */
declare function initFromManifold(module: ManifoldModule): void;

declare function registerKernel(id: string, adapter: KernelAdapter): void;

/**
 * Return a kernel adapter by id, or the default kernel if no id is given.
 *
 * @throws If no kernel has been registered via {@link registerKernel} or {@link initFromOC}.
 */
declare function getKernel(id?: string): KernelAdapter;

declare function withKernel<T extends Exclude<unknown, Promise<unknown>>>(id: string, fn: () => T): T;

/** Capabilities of a kernel (defaults to the active kernel). */
declare function getKernelCapabilities(id?: string): KernelCapabilities;

/**
 * Run `fn` at a tessellation quality level. For `build-time` kernels (Manifold)
 * the level is pushed to the kernel's global setting on enter and restored on
 * exit; for `extract-time` kernels (OCCT) it becomes the default deflection at
 * `mesh()`/export inside `fn`. Synchronous only (mirrors {@link withKernel}).
 */
declare function withQuality<T extends Exclude<unknown, Promise<unknown>>>(level: QualityLevel, fn: () => T): T;

/**
 * Bind a named tier to a (kernel, quality) pair — e.g. a `'preview'` tier on a
 * fast mesh kernel at `'draft'` quality, and an `'exact'` tier on an OCCT
 * kernel at `'fine'`. Lets call sites express intent (`withTier('preview', …)`)
 * instead of hard-coding a kernel id + quality knob.
 */
declare function registerKernelTier(name: string, tier: KernelTier): void;

/** The (kernel, quality) a tier resolves to, or undefined if unregistered. */
declare function getKernelTier(name: string): KernelTier | undefined;

/**
 * Run `fn` under a registered tier: switches to the tier's kernel and applies
 * its quality (both restored on exit). Composes {@link withKernel} and
 * {@link withQuality}. Throws if the tier is unregistered.
 */
declare function withTier<T extends Exclude<unknown, Promise<unknown>>>(name: string, fn: () => T): T;

/** Initialise the brepjs kernel from a loaded WASM instance. */
declare function initFromOC(oc: KernelInstance): void;

/**
 * Trigger OCCT's deferred internal initialization by performing a trivial
 * geometry operation. The first OCCT call in a WASM session incurs a ~400-900ms
 * JIT penalty; calling `prewarm()` during idle time (e.g., after `init()` resolves
 * but before user interaction) moves this cost off the critical path.
 *
 * Safe to call multiple times — only the first call does work.
 *
 * @example
 * ```ts
 * await init();
 * prewarm(); // fire-and-forget during idle time
 * ```
 */
declare function prewarm(): void;

/**
 * Auto-detect and initialise the best available kernel.
 *
 * Tries `occt-wasm` (the default kernel) first, then falls back to
 * `brepjs-opencascade`, then `brepkit-wasm`. `occt-wasm` loads via its
 * browser-safe `OcctKernel.init()` (auto-locates the `.wasm` via
 * `import.meta.url`), so no manual registration is required.
 *
 * Idempotent — calling it again after a kernel is registered is a no-op that
 * returns the current kernel ID immediately.
 *
 * @returns The kernel ID that was initialised (`'occt-wasm'`, `'occt'`, or `'brepkit'`).
 * @throws If no kernel package can be imported.
 *
 * @example
 * ```ts
 * import { init, box } from 'brepjs';
 *
 * await init();
 * const myBox = box(10, 10, 10);
 * ```
 */
declare function init(): Promise<string>;

/**
 * Tessellation quality levels — a kernel-agnostic fidelity/speed dial.
 *
 * Callers pick an intent (`'draft' | 'standard' | 'fine'`) instead of
 * kernel-specific knobs (Manifold circular segments vs. OCCT deflection). Each
 * level maps to:
 * - a **deflection** pair, used as the default at `mesh()`/export for
 *   `extract-time` kernels (OCCT), and
 * - a per-kernel `setQuality()` for `build-time` kernels (Manifold), which
 *   translate the level to their native global setting before a solid is built.
 *
 * The current level is process-global state, scoped by `withQuality()` /
 * `withTier()` in `./index.js`. This module is pure data + state so it has no
 * dependency on the kernel registry.
 * @module
 */
type QualityLevel = 'draft' | 'standard' | 'fine';

/** The active quality level (defaults to `'standard'`). */
declare function currentQuality(): QualityLevel;

/**
 * Kernel capability flags — let callers route work by what a kernel *is*, not by
 * its id. The headline need: send export/measurement to an exact B-rep kernel
 * and fast previews to a mesh kernel without hard-coding `'manifold'` vs
 * `'occt-wasm'` at every call site.
 *
 * `tessellationModel` also tells the quality layer (see {@link ./quality.js})
 * *how* a kernel's mesh resolution is controlled:
 * - `'build-time'`  — the mesh is fixed when the solid is built (e.g. Manifold's
 *   global circular-segment setting); quality must be applied *before* building.
 * - `'extract-time'`— the shape is exact and tessellated on demand with a
 *   per-call deflection (e.g. OCCT); quality is the default deflection at
 *   `mesh()`/export time.
 * - `'none'`        — no tessellation control (or not a meshing kernel).
 * @module
 */
type TessellationModel = 'build-time' | 'extract-time' | 'none';

interface KernelCapabilities {
    /** Exact B-rep geometry (vs. a mesh approximation). */
    readonly exact: boolean;
    /** Can serialize to B-rep exchange formats (BREP/STEP). */
    readonly brepExport: boolean;
    /** Volume/area/length match the analytic value (vs. mesh-approximate). */
    readonly exactMeasurement: boolean;
    /** How tessellation resolution is controlled — see module docs. */
    readonly tessellationModel: TessellationModel;
}

/** Default for an exact B-rep kernel (OCCT family, brepkit). */
declare const EXACT_BREP_CAPABILITIES: KernelCapabilities;

/**
 * Conservative fallback for a kernel that doesn't declare capabilities: assume
 * exact B-rep so export/measurement aren't wrongly blocked, but claim no
 * tessellation control.
 */
declare const DEFAULT_CAPABILITIES: KernelCapabilities;

type PerformanceStats = Record<PerfCategory, CategoryStats>;

interface Ok<T> {
    readonly ok: true;
    readonly value: T;
}

interface Err<E> {
    readonly ok: false;
    readonly error: E;
}

type Result<T, E = BrepError> = Ok<T> | Err<E>;

type Unit = undefined;

declare function ok<T>(value: T): Ok<T>;

declare function err<E>(error: E): Err<E>;

declare const OK: Ok<Unit>;

declare function isOk<T, E>(result: Result<T, E>): result is Ok<T>;

declare function isErr<T, E>(result: Result<T, E>): result is Err<E>;

declare function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E>;

declare function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F>;

declare function andThen<T, U, E>(result: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E>;

/** Alias for andThen */
declare const flatMap: typeof andThen;

/** Return `a` if Ok, otherwise return `b`. */
declare function or<T, E, F>(a: Result<T, E>, b: Result<T, F>): Result<T, F>;

/** Return `result` if Ok, otherwise call `fn` with the error and return its result. */
declare function orElse<T, E, F>(result: Result<T, E>, fn: (error: E) => Result<T, F>): Result<T, F>;

/** Combine two independent Results into a Result of a tuple. */
declare function zip<A, B, E>(a: Result<A, E>, b: Result<B, E>): Result<[A, B], E>;

/** Collect an array of Results into a Result of an array. Alias for {@link collect}. */
declare const all: typeof collect;

/** Run a side-effect on an Ok value without transforming the result. */
declare function tap<T, E>(result: Result<T, E>, fn: (value: T) => void): Result<T, E>;

/** Run a side-effect on an Err value without transforming the result. */
declare function tapErr<T, E>(result: Result<T, E>, fn: (error: E) => void): Result<T, E>;

/** Flatten a nested Result<Result<T, E>, E> into Result<T, E>. */
declare function flatten<T, E>(result: Result<Result<T, E>, E>): Result<T, E>;

/** Map both Ok and Err variants in a single pass. */
declare function mapBoth<T, U, E, F>(result: Result<T, E>, okFn: (value: T) => U, errFn: (error: E) => F): Result<U, F>;

/** Convert a nullable value to a Result, using `errorFn` to produce the error for null/undefined. */
declare function fromNullable<T, E>(value: T | null | undefined, errorFn: () => E): Result<T, E>;

declare function unwrap<T, E>(result: Result<T, E>): T;

declare function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T;

declare function unwrapOrElse<T, E>(result: Result<T, E>, fn: (error: E) => T): T;

declare function unwrapErr<T, E>(result: Result<T, E>): E;

declare function match<T, E, U>(result: Result<T, E>, handlers: {
    ok: (value: T) => U;
    err: (error: E) => U;
}): U;

/**
 * Collects an array of Results into a Result of an array.
 * Short-circuits on the first Err.
 */
declare function collect<T, E>(results: Result<T, E>[]): Result<T[], E>;

/**
 * Wraps a throwing function into a Result.
 * The mapError function converts the caught exception into the error type.
 */
declare function tryCatch<T, E>(fn: () => T, mapError: (error: unknown) => E): Result<T, E>;

/**
 * Wraps an async throwing function into a Result.
 * The mapError function converts the caught exception into the error type.
 */
declare function tryCatchAsync<T, E>(fn: () => Promise<T>, mapError: (error: unknown) => E): Promise<Result<T, E>>;

/** A chainable pipeline that short-circuits on the first Err. */
interface ResultPipeline<T, E> {
    /** Chain a Result-returning transform. Short-circuits on Err. */
    then<U>(fn: (value: T) => Result<U, E>): ResultPipeline<U, E>;
    /** Extract the final Result. */
    readonly result: Result<T, E>;
}

/**
 * Create a chainable pipeline from a value or Result.
 *
 * ```ts
 * pipeline(shape)
 *   .then(s => filletShape(s, edges, 2))
 *   .then(s => shellShape(s, [topFace], 1))
 *   .result  // → Result<Shape3D>
 * ```
 */
declare function pipeline<T, E = BrepError>(input: T | Result<T, E>): ResultPipeline<T, E>;

/**
 * Wrap a kernel call that returns an KernelShape, automatically casting
 * the result into a branded AnyShape. On exception, returns an Err
 * with the given error code and message.
 *
 * kernel error messages are automatically translated into user-friendly
 * explanations when the error kind is KERNEL_OPERATION.
 */
declare function kernelCall(fn: () => KernelShape, code: string, message: string, kind?: BrepErrorKind): Result<AnyShape>;

/**
 * Wrap a kernel call that returns an arbitrary value. On exception,
 * returns an Err with the given error code and message.
 *
 * kernel error messages are automatically translated into user-friendly
 * explanations when the error kind is KERNEL_OPERATION.
 */
declare function kernelCallRaw<T>(fn: () => T, code: string, message: string, kind?: BrepErrorKind): Result<T>;

/**
 * Wrap a kernel call that needs intermediate kernel allocations.
 *
 * A DisposalScope is created and passed to fn. The scope is disposed
 * deterministically after fn returns or throws — ensuring no intermediate
 * handles are leaked even on error paths.
 *
 * ```ts
 * return kernelCallScoped(
 *   (scope) => {
 *     const axis = scope.register(makeKernelAx1(origin, dir));
 *     return getKernel().revolveVec(...) // was: oc.BRepBuilderAPI_MakeRevol_1(shape.wrapped, axis).Shape();
 *   },
 *   BrepErrorCode.REVOLUTION_NOT_3D,
 *   'Revolution failed'
 * );
 * ```
 */
declare function kernelCallScoped(fn: (scope: DisposalScope) => KernelShape, code: string, message: string, kind?: BrepErrorKind): Result<AnyShape>;

/**
 * Bug / panic helper — these throw and should never be caught in normal code.
 * Lives in utils (Layer 0) so it can be used by all layers including kernel.
 */
/** Error thrown for invariant violations / programmer bugs (should never be caught). */
declare class BrepBugError extends Error {
    readonly location: string;
    constructor(location: string, message: string);
}

/**
 * Throws a BrepBugError for invariant violations / programmer errors.
 * Equivalent to Rust's panic!() — should never be caught in normal code.
 */
declare function bug(location: string, message: string): never;

/** High-level category for a brepjs error. */
type BrepErrorKind = 'KERNEL_OPERATION' | 'VALIDATION' | 'TYPE_CAST' | 'SKETCHER_STATE' | 'MODULE_INIT' | 'COMPUTATION' | 'IO' | 'QUERY' | 'UNSUPPORTED';

/**
 * Typed string constants for all known brepjs error codes, grouped by category.
 *
 * Use these instead of raw strings so that typos are caught at compile time.
 */
declare const BrepErrorCode: {
    readonly BSPLINE_FAILED: "BSPLINE_FAILED";
    readonly FACE_BUILD_FAILED: "FACE_BUILD_FAILED";
    readonly SWEEP_FAILED: "SWEEP_FAILED";
    readonly LOFT_FAILED: "LOFT_FAILED";
    readonly FUSE_FAILED: "FUSE_FAILED";
    readonly CUT_FAILED: "CUT_FAILED";
    readonly HEAL_NO_EFFECT: "HEAL_NO_EFFECT";
    readonly BOOLEAN_HAS_ERRORS: "BOOLEAN_HAS_ERRORS";
    readonly VARIABLE_FILLET_FAILED: "VARIABLE_FILLET_FAILED";
    readonly POSITION_ON_CURVE_FAILED: "POSITION_ON_CURVE_FAILED";
    readonly FIX_SHAPE_FAILED: "FIX_SHAPE_FAILED";
    readonly SOLID_FROM_SHELL_FAILED: "SOLID_FROM_SHELL_FAILED";
    readonly FIX_SELF_INTERSECTION_FAILED: "FIX_SELF_INTERSECTION_FAILED";
    readonly ELLIPSE_RADII: "ELLIPSE_RADII";
    readonly FUSE_ALL_EMPTY: "FUSE_ALL_EMPTY";
    readonly FILLET_NO_EDGES: "FILLET_NO_EDGES";
    readonly CHAMFER_NO_EDGES: "CHAMFER_NO_EDGES";
    readonly CHAMFER_ANGLE_NO_EDGES: "CHAMFER_ANGLE_NO_EDGES";
    readonly CHAMFER_ANGLE_BAD_DISTANCE: "CHAMFER_ANGLE_BAD_DISTANCE";
    readonly CHAMFER_ANGLE_BAD_ANGLE: "CHAMFER_ANGLE_BAD_ANGLE";
    readonly BEZIER_MIN_POINTS: "BEZIER_MIN_POINTS";
    readonly POLYGON_MIN_POINTS: "POLYGON_MIN_POINTS";
    readonly ZERO_LENGTH_EXTRUSION: "ZERO_LENGTH_EXTRUSION";
    readonly ZERO_TWIST_ANGLE: "ZERO_TWIST_ANGLE";
    readonly LOFT_EMPTY: "LOFT_EMPTY";
    readonly UNSUPPORTED_PROFILE: "UNSUPPORTED_PROFILE";
    readonly UNKNOWN_PLANE: "UNKNOWN_PLANE";
    readonly NULL_SHAPE_INPUT: "NULL_SHAPE_INPUT";
    readonly INVALID_FILLET_RADIUS: "INVALID_FILLET_RADIUS";
    readonly INVALID_CHAMFER_DISTANCE: "INVALID_CHAMFER_DISTANCE";
    readonly INVALID_THICKNESS: "INVALID_THICKNESS";
    readonly ZERO_OFFSET: "ZERO_OFFSET";
    readonly NO_EDGES: "NO_EDGES";
    readonly NO_FACES: "NO_FACES";
    readonly DRAFT_NO_FACES: "DRAFT_NO_FACES";
    readonly DRAFT_INVALID_ANGLE: "DRAFT_INVALID_ANGLE";
    readonly DRAFT_NOT_3D: "DRAFT_NOT_3D";
    readonly DRAFT_FAILED: "DRAFT_FAILED";
    readonly FUSE_NOT_3D: "FUSE_NOT_3D";
    readonly CUT_NOT_3D: "CUT_NOT_3D";
    readonly INTERSECT_NOT_3D: "INTERSECT_NOT_3D";
    readonly FUSE_ALL_NOT_3D: "FUSE_ALL_NOT_3D";
    readonly CUT_ALL_NOT_3D: "CUT_ALL_NOT_3D";
    readonly LOFT_NOT_3D: "LOFT_NOT_3D";
    readonly SWEEP_NOT_3D: "SWEEP_NOT_3D";
    readonly REVOLUTION_NOT_3D: "REVOLUTION_NOT_3D";
    readonly FILLET_NOT_3D: "FILLET_NOT_3D";
    readonly CHAMFER_NOT_3D: "CHAMFER_NOT_3D";
    readonly CHAMFER_ANGLE_NOT_3D: "CHAMFER_ANGLE_NOT_3D";
    readonly CHAMFER_ANGLE_FAILED: "CHAMFER_ANGLE_FAILED";
    readonly CSG_NOT_3D: "CSG_NOT_3D";
    readonly SHELL_NOT_3D: "SHELL_NOT_3D";
    readonly OFFSET_NOT_3D: "OFFSET_NOT_3D";
    readonly NULL_SHAPE: "NULL_SHAPE";
    readonly NO_WRAPPER: "NO_WRAPPER";
    readonly WELD_NOT_SHELL: "WELD_NOT_SHELL";
    readonly SOLID_BUILD_FAILED: "SOLID_BUILD_FAILED";
    readonly OFFSET_NOT_WIRE: "OFFSET_NOT_WIRE";
    readonly UNKNOWN_SURFACE_TYPE: "UNKNOWN_SURFACE_TYPE";
    readonly UNKNOWN_CURVE_TYPE: "UNKNOWN_CURVE_TYPE";
    readonly SWEEP_START_NOT_WIRE: "SWEEP_START_NOT_WIRE";
    readonly SWEEP_END_NOT_WIRE: "SWEEP_END_NOT_WIRE";
    readonly STEP_EXPORT_FAILED: "STEP_EXPORT_FAILED";
    readonly STEP_EXPORT_CONFIGURED_FAILED: "STEP_EXPORT_CONFIGURED_FAILED";
    readonly STEP_FILE_READ_ERROR: "STEP_FILE_READ_ERROR";
    readonly STEP_EXPORT_CRASHED: "STEP_EXPORT_CRASHED";
    readonly STEP_EXPORT_UNSERIALIZABLE: "STEP_EXPORT_UNSERIALIZABLE";
    readonly STL_EXPORT_FAILED: "STL_EXPORT_FAILED";
    readonly STL_FILE_READ_ERROR: "STL_FILE_READ_ERROR";
    readonly STL_EXPORT_CRASHED: "STL_EXPORT_CRASHED";
    readonly STL_EXPORT_UNSERIALIZABLE: "STL_EXPORT_UNSERIALIZABLE";
    readonly STEP_IMPORT_FAILED: "STEP_IMPORT_FAILED";
    readonly STL_IMPORT_FAILED: "STL_IMPORT_FAILED";
    readonly IGES_EXPORT_FAILED: "IGES_EXPORT_FAILED";
    readonly IGES_IMPORT_FAILED: "IGES_IMPORT_FAILED";
    readonly DXF_IMPORT_FAILED: "DXF_IMPORT_FAILED";
    readonly OBJ_IMPORT_FAILED: "OBJ_IMPORT_FAILED";
    readonly THREEMF_IMPORT_FAILED: "THREEMF_IMPORT_FAILED";
    readonly PARAMETER_NOT_FOUND: "PARAMETER_NOT_FOUND";
    readonly INTERSECTION_FAILED: "INTERSECTION_FAILED";
    readonly SELF_INTERSECTION_FAILED: "SELF_INTERSECTION_FAILED";
    readonly STRAIGHT_SKELETON_FAILED: "STRAIGHT_SKELETON_FAILED";
    readonly CENTER_OF_MASS_FAILED: "CENTER_OF_MASS_FAILED";
    readonly COMPOUND_NO_FACES: "COMPOUND_NO_FACES";
    readonly COMPOUND_FACE_NOT_FOUND: "COMPOUND_FACE_NOT_FOUND";
    readonly FINDER_NOT_UNIQUE: "FINDER_NOT_UNIQUE";
    readonly HULL_EMPTY_INPUT: "HULL_EMPTY_INPUT";
    readonly HULL_FAILED: "HULL_FAILED";
    readonly HULL_DEGENERATE: "HULL_DEGENERATE";
    readonly HULL_NOT_3D: "HULL_NOT_3D";
    readonly MINKOWSKI_FAILED: "MINKOWSKI_FAILED";
    readonly MINKOWSKI_NULL_TOOL: "MINKOWSKI_NULL_TOOL";
    readonly MINKOWSKI_NOT_3D: "MINKOWSKI_NOT_3D";
    readonly POLYHEDRON_INSUFFICIENT_POINTS: "POLYHEDRON_INSUFFICIENT_POINTS";
    readonly POLYHEDRON_INSUFFICIENT_FACES: "POLYHEDRON_INSUFFICIENT_FACES";
    readonly POLYHEDRON_INVALID_INDEX: "POLYHEDRON_INVALID_INDEX";
    readonly POLYHEDRON_FAILED: "POLYHEDRON_FAILED";
    readonly VALIDATION_FAILED: "VALIDATION_FAILED";
    readonly ROOF_FAILED: "ROOF_FAILED";
    readonly MULTI_SWEEP_INSUFFICIENT_SECTIONS: "MULTI_SWEEP_INSUFFICIENT_SECTIONS";
    readonly MULTI_SWEEP_FAILED: "MULTI_SWEEP_FAILED";
    readonly GUIDED_SWEEP_FAILED: "GUIDED_SWEEP_FAILED";
    readonly SURFACE_GRID_TOO_SMALL: "SURFACE_GRID_TOO_SMALL";
    readonly SURFACE_GRID_JAGGED: "SURFACE_GRID_JAGGED";
    readonly SURFACE_FAILED: "SURFACE_FAILED";
    readonly ASSEMBLY_MATE_INVALID: "ASSEMBLY_MATE_INVALID";
    readonly ASSEMBLY_SOLVE_FAILED: "ASSEMBLY_SOLVE_FAILED";
    readonly ASSEMBLY_NOT_CONVERGED: "ASSEMBLY_NOT_CONVERGED";
    readonly BLUEPRINT_EMPTY_CURVES: "BLUEPRINT_EMPTY_CURVES";
    readonly COMPOUND_BLUEPRINT_EMPTY: "COMPOUND_BLUEPRINT_EMPTY";
    readonly GLB_IMPORT_FAILED: "GLB_IMPORT_FAILED";
    readonly FONT_FETCH_FAILED: "FONT_FETCH_FAILED";
    readonly FONT_PARSE_FAILED: "FONT_PARSE_FAILED";
    readonly NO_FONT_LOADED: "NO_FONT_LOADED";
    readonly CURVE2D_CONSTRUCTION_FAILED: "CURVE2D_CONSTRUCTION_FAILED";
    readonly CURVE2D_INVALID_RADIUS: "CURVE2D_INVALID_RADIUS";
    readonly CURVE2D_TRANSFORM_FAILED: "CURVE2D_TRANSFORM_FAILED";
    readonly CURVE2D_QUERY_FAILED: "CURVE2D_QUERY_FAILED";
    readonly CURVE2D_INTERSECTION_FAILED: "CURVE2D_INTERSECTION_FAILED";
    readonly CURVE2D_BRIDGE_FAILED: "CURVE2D_BRIDGE_FAILED";
    readonly CLONE_FAILED: "CLONE_FAILED";
    readonly SIMPLIFY_FAILED: "SIMPLIFY_FAILED";
    readonly TO_BREP_FAILED: "TO_BREP_FAILED";
    readonly UNSUPPORTED_CAPABILITY: "UNSUPPORTED_CAPABILITY";
};
/** Union of all known error code string literals. */
type BrepErrorCode = (typeof BrepErrorCode)[keyof typeof BrepErrorCode];

/**
 * Structured error returned inside `Result<T>` on failure.
 *
 * Every error carries a `kind` (category), a machine-readable `code`,
 * and a human-readable `message`. Optional `cause` preserves the
 * original exception, and `metadata` holds extra context.
 *
 * The optional `suggestion` field provides actionable recovery hints.
 */
interface BrepError {
    readonly kind: BrepErrorKind;
    readonly code: string;
    readonly message: string;
    readonly suggestion?: string;
    readonly cause?: unknown;
    readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Create an error for a failed kernel kernel operation. */
declare function kernelError(code: string, message: string, cause?: unknown, metadata?: Record<string, unknown>, suggestion?: string): BrepError;

/** Create an error for invalid input parameters. */
declare function validationError(code: string, message: string, cause?: unknown, metadata?: Record<string, unknown>, suggestion?: string): BrepError;

/** Create an error for a failed shape type cast or conversion. */
declare function typeCastError(code: string, message: string, cause?: unknown, metadata?: Record<string, unknown>, suggestion?: string): BrepError;

/** Create an error for an invalid sketcher state transition. */
declare function sketcherStateError(code: string, message: string, cause?: unknown, metadata?: Record<string, unknown>, suggestion?: string): BrepError;

/** Create an error for a module initialisation failure. */
declare function moduleInitError(code: string, message: string, cause?: unknown, metadata?: Record<string, unknown>, suggestion?: string): BrepError;

/** Create an error for a failed geometric computation. */
declare function computationError(code: string, message: string, cause?: unknown, metadata?: Record<string, unknown>, suggestion?: string): BrepError;

/** Create an error for a file import/export failure. */
declare function ioError(code: string, message: string, cause?: unknown, metadata?: Record<string, unknown>, suggestion?: string): BrepError;

/** Create an error for a shape query failure (e.g. finder not unique). */
declare function queryError(code: string, message: string, cause?: unknown, metadata?: Record<string, unknown>, suggestion?: string): BrepError;

/** Create an error for a capability not supported by the current kernel (ADR-0006 Phase 4). */
declare function unsupportedError(code: string, message: string, cause?: unknown, metadata?: Record<string, unknown>, suggestion?: string): BrepError;

/** Maximum hash code value for kernel shape hashing (2^31 - 1). */
declare const HASH_CODE_MAX = 2147483647;

/** Multiply degrees by this constant to convert to radians. */
declare const DEG2RAD: number;

/** Multiply radians by this constant to convert to degrees. */
declare const RAD2DEG: number;

/** Any object that can be cleaned up by calling `delete()` (kernel WASM objects). */
interface Deletable {
    delete: () => void;
}

/** Statistics about WASM handle lifecycle. Zero overhead when not queried. */
interface DisposalStats {
    /** Number of handles currently alive (not disposed). */
    liveHandles: number;
    /** Peak number of simultaneously live handles. */
    peakHandles: number;
    /** Number of handles reclaimed by FinalizationRegistry (GC safety net). */
    gcCollected: number;
    /** Number of DisposalScope.enter() calls. */
    scopeEnters: number;
    /** Number of DisposalScope.dispose() calls. */
    scopeExits: number;
}

/** Get a snapshot of current disposal statistics. */
declare function getDisposalStats(): Readonly<DisposalStats>;

/** Reset all disposal statistics to zero. */
declare function resetDisposalStats(): void;

/** A shape wrapper with Symbol.dispose for auto-cleanup. */
interface ShapeHandle {
    /** The raw kernel shape handle */
    readonly wrapped: KernelShape;
    /** Manually dispose the kernel handle */
    [Symbol.dispose](): void;
    /** Alias for Symbol.dispose — required for Deletable compatibility. */
    delete(): void;
    /** Check if this handle has been disposed */
    readonly disposed: boolean;
}

/** Create a disposable shape handle. */
declare function createHandle(ocShape: KernelShape): ShapeHandle;

/** Execute a function with a disposal scope. Resources registered with the scope
 *  are automatically cleaned up when the function returns. */
declare function withScope<T>(fn: (scope: DisposalScope) => T): T;

/**
 * Run fn inside a DisposalScope. The scope is disposed on all exit paths:
 * Ok return, Err return, and throw. Use in any function that allocates
 * kernel objects and returns Result<T>.
 *
 * ```ts
 * return withScopeResult((scope) => {
 *   const axis = scope.register(makeKernelAx1(origin, dir));
 *   return ok(castShape(getKernel().makeSomething(axis)) as Solid);
 * });
 * ```
 */
declare function withScopeResult<T, E = BrepError>(fn: (scope: DisposalScope) => Result<T, E>): Result<T, E>;

/**
 * Async variant of withScopeResult. The scope is disposed after the
 * returned promise settles (resolved or rejected).
 */
declare function withScopeResultAsync<T, E = BrepError>(fn: (scope: DisposalScope) => Promise<Result<T, E>>): Promise<Result<T, E>>;

/**
 * Returns true if the handle has not been disposed.
 * Provides a named alternative to checking `.disposed` directly.
 *
 * ```ts
 * if (!isLive(handle)) return err(validationError('DISPOSED_HANDLE', '...'));
 * ```
 */
declare function isLive(handle: ShapeHandle | KernelHandle<Deletable>): boolean;

/**
 * Create a {@link Plane} from an origin, optional X direction, and a normal.
 *
 * If `xDirection` is omitted, the X axis is derived automatically via kernel `gp_Ax3`.
 *
 * @param origin - Origin point of the plane.
 * @param xDirection - Explicit X axis direction, or `null` to auto-derive.
 * @param normal - Plane normal (Z direction).
 * @throws If the normal or derived xDir is zero-length.
 */
declare function createPlane(origin: Vec3, xDirection?: Vec3 | null, normal?: Vec3): Plane;

/**
 * Create a standard named plane with an optional origin offset.
 *
 * @param name - One of the predefined {@link PlaneName} values.
 * @param sourceOrigin - Origin point, or a scalar offset along the plane normal.
 * @returns `Ok<Plane>` on success, or `Err` if the name is unknown.
 */
declare function createNamedPlane(name: PlaneName, sourceOrigin?: PointInput | number): Result<Plane>;

/**
 * Resolve a {@link PlaneInput} to a concrete {@link Plane}.
 *
 * @returns `Ok<Plane>` on success, or `Err` if the named plane cannot be resolved.
 */
declare function resolvePlane(input: PlaneInput, origin?: PointInput | number): Result<Plane>;

/**
 * Create or copy a {@link Plane}.
 *
 * When called with a `Plane` object, returns a shallow copy.
 * When called with a `PlaneName` string (or no arguments), resolves the named
 * plane with an optional origin offset.
 *
 * @param plane - A `Plane` object to copy, or a `PlaneName` string to resolve.
 * @param origin - Origin point or scalar offset along the plane normal.
 * @default plane `'XY'`
 */
declare function makePlane(plane: Plane): Plane;
declare function makePlane(plane?: PlaneName, origin?: PointInput | number): Plane;

/** Translate a plane by a vector. */
declare function translatePlane(plane: Plane, offset: Vec3): Plane;

/**
 * Pivot a plane by rotating its axes around a world-space axis.
 *
 * @param angleDeg - Rotation angle in **degrees**.
 * @param axis - World-space axis to rotate around.
 */
declare function pivotPlane(plane: Plane, angleDeg: number, axis?: Vec3): Plane;

/** Discriminant for the geometric type of a 3D curve. */
type CurveType = 'LINE' | 'CIRCLE' | 'ELLIPSE' | 'HYPERBOLA' | 'PARABOLA' | 'BEZIER_CURVE' | 'BSPLINE_CURVE' | 'OFFSET_CURVE' | 'OTHER_CURVE';

/** String literal identifying a topological entity type for TopExp_Explorer iteration. */
type TopoEntity = 'vertex' | 'edge' | 'wire' | 'face' | 'shell' | 'solid' | 'solidCompound' | 'compound' | 'shape';

/** An kernel shape after downcast — same underlying type, used for clarity. */
type GenericTopo = KernelShape;

/** Convert a TopoEntity string to its kernel TopAbs_ShapeEnum value. */
declare const asTopo: (entity: TopoEntity) => KernelType;

declare const iterTopo: (shape: KernelShape, topo: TopoEntity) => IterableIterator<KernelShape>;

/** Get the TopAbs_ShapeEnum type of an kernel shape, returning Err for null shapes. */
declare const shapeType: (shape: KernelShape) => Result<KernelType>;

/**
 * Downcast a generic KernelShape to its concrete kernel type (e.g., kernel topology_Face).
 *
 * @remarks Uses the kernel adapter's downcast method.
 * @returns Ok with the downcasted shape, or Err if the shape type is unknown.
 */
declare function downcast(shape: KernelShape): Result<GenericTopo>;

/**
 * Cast a raw kernel shape to its corresponding branded brepjs type (Vertex, Edge, Face, etc.).
 *
 * Performs downcast + branded handle creation in one step.
 *
 * @returns Ok with a typed AnyShape, or Err if the shape type is unknown.
 */
declare function cast(shape: KernelShape): Result<AnyShape<Dimension>>;

/** Type guard: return true if the shape is a CompSolid. */
declare function isCompSolid(shape: AnyShape<Dimension>): shape is CompSolid;

/**
 * Deserialize a shape from a BREP string representation.
 *
 * @param data - BREP string produced by toBREP().
 * @returns Ok with the deserialized shape, or Err if parsing fails.
 */
declare function fromBREP(data: string): Result<AnyShape<Dimension>>;

/**
 * Applies glue optimization to a boolean operation.
 *
 * @param op - Boolean operation builder with SetGlue method
 * @param optimisation - Optimization level: 'none', 'commonFace', or 'sameFace'
 */
declare function applyGlue(op: {
    SetGlue(glue: KernelType): void;
}, optimisation: 'none' | 'commonFace' | 'sameFace'): void;

/**
 * A chamfer radius specification.
 *
 * - A number for symmetric chamfer.
 * - Two distances for asymmetric chamfer (first distance for the selected face).
 * - A distance and angle for asymmetric chamfer.
 */
type ChamferRadius = number | {
    distances: [number, number];
    selectedFace: (f: FaceFinderFn) => FaceFinderFn;
} | {
    distance: number;
    angle: number;
    selectedFace: (f: FaceFinderFn) => FaceFinderFn;
};

/**
 * A generic way to define radii for fillet or chamfer operations.
 */
type RadiusOptions<R = number> = ((e: Edge) => R | null) | R | {
    filter: EdgeFinderFn;
    radius: R;
    keep?: boolean;
};

declare function isNumber(r: unknown): r is number;

declare function isChamferRadius(r: unknown): r is ChamferRadius;

declare function isFilletRadius(r: unknown): r is FilletRadius;

/** Disposable handle wrapping an XCAF document for STEP assembly export. */
type AssemblyExporter = KernelHandle<KernelType>;

/**
 * Create an XCAF assembly document from a list of shape configurations.
 *
 * Each shape is added as a named, colored node in the XCAF document tree.
 * The returned {@link AssemblyExporter} wraps the live `TDocStd_Document` and
 * must be deleted after use to avoid memory leaks.
 *
 * @returns An {@link AssemblyExporter} wrapping the XCAF document.
 *
 * @see {@link exportSTEP} which calls this internally to produce a STEP blob.
 */
declare function createAssembly(shapes?: ShapeOptions[]): AssemblyExporter;

/**
 * Pure 2D vector/point math — Layer 0 (no internal imports).
 *
 * This is the single source of truth for 2D vector operations (ADR-0006).
 * Both kernel/ (Layer 0) and 2d/ (Layer 2) import from here.
 *
 * Re-exported by src/2d/lib/vectorOperations.ts and src/2d/lib/precision.ts
 * for backward compatibility.
 */
/** A 2D point or vector represented as an `[x, y]` tuple. */
type Point2D = [number, number];

/**
 * Axis-aligned 2D bounding box backed by an kernel `Bnd_Box2d`.
 *
 * Provides bounds queries, containment tests, and union operations for
 * spatial indexing of 2D geometry.
 */
declare class BoundingBox2d {
    private readonly _wrapped;
    private _deleted;
    constructor(wrapped?: KernelType);
    get wrapped(): KernelType;
    delete(): void;
    [Symbol.dispose](): void;
    /** Return a human-readable string of the form `(xMin,yMin) - (xMax,yMax)`. */
    get repr(): string;
    /** Return the `[min, max]` corner points of the bounding box. */
    get bounds(): [Point2D, Point2D];
    /** Return the center point of the bounding box. */
    get center(): Point2D;
    /** Return the width (x-extent) of the bounding box. */
    get width(): number;
    /** Return the height (y-extent) of the bounding box. */
    get height(): number;
    /**
     * Return a point guaranteed to lie outside the bounding box.
     *
     * @param paddingPercent - Extra padding as a percentage of the box dimensions.
     */
    outsidePoint(paddingPercent?: number): Point2D;
    /** Expand this bounding box to include `other`. */
    add(other: BoundingBox2d): void;
    /** Test whether this bounding box and `other` are completely disjoint. */
    isOut(other: BoundingBox2d): boolean;
    /** Test whether the given point lies inside (or on the boundary of) this box. */
    containsPoint(other: Point2D): boolean;
}

/**
 * Handle-wrapped 2D parametric curve backed by an kernel `kernel 2D curve`.
 *
 * Provides evaluation, splitting, projection, tangent queries, and distance
 * computations on a single parametric curve.
 */
declare class Curve2D {
    private readonly _wrapped;
    private _deleted;
    _boundingBox: null | BoundingBox2d;
    private _firstPoint;
    private _lastPoint;
    private _firstParameter;
    private _lastParameter;
    constructor(handle: KernelType);
    get wrapped(): KernelType;
    delete(): void;
    [Symbol.dispose](): void;
    /** Compute (and cache) the 2D bounding box of this curve. */
    get boundingBox(): BoundingBox2d;
    /** Return a human-readable representation, e.g. `LINE (0,0) - (1,1)`. */
    get repr(): string;
    /** Serialize this curve to a string that can be restored with {@link deserializeCurve2D}. */
    serialize(): string;
    /** Evaluate the curve at the given parameter, returning the 2D point. */
    value(parameter: number): Point2D;
    /** Return the point at the start of the curve (cached after first access). */
    get firstPoint(): Point2D;
    /** Return the point at the end of the curve (cached after first access). */
    get lastPoint(): Point2D;
    /** Return the parameter value at the start of the curve (cached after first access). */
    get firstParameter(): number;
    /** Return the parameter value at the end of the curve (cached after first access). */
    get lastParameter(): number;
    /** Return the geometric type of this curve (e.g. `LINE`, `CIRCLE`, `BSPLINE_CURVE`). */
    get geomType(): CurveType;
    /** Create an independent deep copy of this curve. */
    clone(): Curve2D;
    /** Reverse the orientation of this curve in place. */
    reverse(): void;
    private distanceFromPoint;
    private distanceFromCurve;
    /** Compute the minimum distance from this curve to a point or another curve. */
    distanceFrom(element: Curve2D | Point2D): number;
    /** Test whether a point lies on the curve within a tight tolerance (1e-9). */
    isOnCurve(point: Point2D): boolean;
    /**
     * Project a point onto the curve and return its parameter value.
     *
     * @returns `Ok(parameter)` when the point is on the curve, or an error result otherwise.
     */
    parameter(point: Point2D, precision?: number): Result<number>;
    /**
     * Compute the tangent vector at a parameter position or at the projection of a point.
     *
     * @param index - A normalized parameter (0..1) or a Point2D to project onto the curve.
     */
    tangentAt(index: number | Point2D): Point2D;
    /**
     * Split this curve at the given points or parameter values.
     *
     * @returns An array of sub-curves whose union covers the original curve.
     */
    splitAt(points: Point2D[] | number[], precision?: number): Curve2D[];
}

/**
 * Groups an array of blueprints such that blueprints that correspond to holes
 * in other blueprints are set in a `CompoundBlueprint`.
 *
 * The current algorithm does not handle cases where blueprints cross each
 * other
 */
declare const organiseBlueprints: (blueprints: Blueprint[]) => Blueprints;

/** Plain data returned by blueprint sketchOnPlane/sketchOnFace (Layer 2).
 *  Layer 3 wraps this in a Sketch class. */
interface SketchData {
    wire: Wire;
    defaultOrigin?: Vec3;
    defaultDirection?: Vec3;
    baseFace?: Face | null;
}

interface DrawingInterface {
    clone(): DrawingInterface;
    boundingBox: BoundingBox2d;
    stretch(ratio: number, direction: Point2D, origin: Point2D): DrawingInterface;
    rotate(angle: number, center: Point2D): DrawingInterface;
    translate(xDist: number, yDist: number): DrawingInterface;
    translate(translationVector: Point2D): DrawingInterface;
    /**
     * Returns the mirror image of this drawing made with a single point (in
     * center mode, the default, or a plane, (plane mode, with both direction and
     * origin of the plane).
     */
    mirror(centerOrDirection: Point2D, origin?: Point2D, mode?: 'center' | 'plane'): DrawingInterface;
    /**
     * Returns sketch data for the drawing on a plane.
     */
    sketchOnPlane(inputPlane?: PlaneName | Plane, origin?: PointInput | number): SketchData | SketchData[] | (SketchData | SketchData[])[];
    /**
     * Returns sketch data for the drawing on a face.
     *
     * The scale mode corresponds to the way the coordinates of the drawing are
     * interpreted match with the face:
     *
     * - `original` uses global coordinates (1mm in the drawing is 1mm on the
     *   face). This is the default, but currently supported only for planar
     *   and circular faces
     * - `bounds` normalises the UV parameters on the face to [0,1] intervals.
     * - `native` uses the default UV parameters of kernel
     */
    sketchOnFace(face: Face, scaleMode: ScaleMode): SketchData | SketchData[] | (SketchData | SketchData[])[];
    /**
     * Formats the drawing as an SVG image
     */
    toSVG(margin: number): string;
    /**
     * Returns the SVG viewbox that corresponds to this drawing
     */
    toSVGViewBox(margin?: number): string;
    /**
     * Formats the drawing as a list of SVG paths
     */
    toSVGPaths(): string[] | string[][];
}

/**
 * Create a regular polygon blueprint inscribed in a circle of the given radius.
 *
 * @param radius - Circumscribed circle radius.
 * @param sidesCount - Number of sides (3 = triangle, 6 = hexagon, etc.).
 * @param sagitta - When non-zero, sides are replaced by sagitta arcs (bulge height).
 * @returns A closed Blueprint representing the polygon.
 *
 * @example
 * ```ts
 * const hexagon = polysidesBlueprint(10, 6);
 * const roundedTriangle = polysidesBlueprint(10, 3, 2);
 * ```
 */
declare const polysidesBlueprint: (radius: number, sidesCount: number, sagitta?: number) => Blueprint;

/**
 * Create an axis-aligned rectangle blueprint with optional rounded corners.
 *
 * The rectangle is centered at the origin. When `r` is zero the corners
 * are sharp; otherwise they are filleted with circular or elliptical arcs.
 *
 * @param width - Total width of the rectangle.
 * @param height - Total height of the rectangle.
 * @param r - Corner radius. Pass a number for uniform rounding, or
 *   `{ rx, ry }` for elliptical corners. Clamped to half the respective
 *   dimension.
 * @returns A closed Blueprint representing the rectangle.
 *
 * @example
 * ```ts
 * const sharp = roundedRectangleBlueprint(20, 10);
 * const rounded = roundedRectangleBlueprint(20, 10, 3);
 * const elliptical = roundedRectangleBlueprint(20, 10, { rx: 4, ry: 2 });
 * ```
 */
declare const roundedRectangleBlueprint: (width: number, height: number, r?: number | {
    rx?: number;
    ry?: number;
}) => Blueprint;

/**
 * Compute the boolean union of two simple blueprints.
 *
 * Segments each blueprint at their intersection points, discards segments
 * inside the other shape, and reassembles the remaining curves.
 *
 * @param first - First blueprint operand.
 * @param second - Second blueprint operand.
 * @returns The fused outline, a {@link Blueprints} if the result is
 *   disjoint, or `null` if the operation produces no geometry.
 *
 * @remarks Both blueprints must be closed. For compound or multi-blueprint
 * inputs, use {@link fuse2D} instead.
 */
declare function fuseBlueprints(first: Blueprint, second: Blueprint): null | Blueprint | Blueprints;

/**
 * Compute the boolean difference of two simple blueprints (first minus second).
 *
 * Segments the blueprints at their intersections, keeps segments of the first
 * that are outside the second, and segments of the second that are inside the
 * first (reversed to form the boundary of the cut).
 *
 * @param first - Base blueprint to cut from.
 * @param second - Tool blueprint to subtract.
 * @returns The remaining outline, or `null` if nothing remains.
 *
 * @remarks Both blueprints must be closed. For compound inputs use {@link cut2D}.
 */
declare function cutBlueprints(first: Blueprint, second: Blueprint): null | Blueprint | Blueprints;

/**
 * Compute the boolean intersection of two simple blueprints.
 *
 * Keeps only the segments of each blueprint that lie inside the other,
 * producing the overlapping region.
 *
 * @param first - First blueprint operand.
 * @param second - Second blueprint operand.
 * @returns The intersection outline, or `null` if the blueprints do not overlap.
 *
 * @remarks Both blueprints must be closed. For compound inputs use {@link intersect2D}.
 */
declare function intersectBlueprints(first: Blueprint, second: Blueprint): null | Blueprint | Blueprints;

/**
 * Union type for all 2D shape representations, including `null` for empty results.
 *
 * Used throughout the 2D boolean API as both input and output of operations.
 */
type Shape2D = Blueprint | Blueprints | CompoundBlueprint | null;

/**
 * Compute the boolean union of two 2D shapes.
 *
 * Handles all combinations of {@link Blueprint}, {@link CompoundBlueprint},
 * {@link Blueprints}, and `null`. When both inputs are simple blueprints the
 * operation delegates to {@link fuseBlueprints}; compound and multi-blueprint
 * cases are decomposed recursively.
 *
 * @param first - First operand (or `null` for empty).
 * @param second - Second operand (or `null` for empty).
 * @returns The fused shape, or `null` if both operands are empty.
 *
 * @example
 * ```ts
 * const union = fuse2D(circleBlueprint, squareBlueprint);
 * ```
 *
 * @see {@link fuse2D} for the functional API.
 */
declare const fuse2D: (first: Shape2D, second: Shape2D) => Blueprint | Blueprints | CompoundBlueprint | null;

/**
 * Compute the boolean difference of two 2D shapes (first minus second).
 *
 * Removes the region covered by `second` from `first`. When the tool is fully
 * inside the base, the result is a {@link CompoundBlueprint} (base with a
 * hole).
 *
 * @param first - Base shape to cut from.
 * @param second - Tool shape to subtract.
 * @returns The remaining shape, or `null` if nothing remains.
 *
 * @example
 * ```ts
 * const withHole = cut2D(outerRect, innerCircle);
 * ```
 *
 * @see {@link cut2D} for the functional API.
 */
declare const cut2D: (first: Shape2D, second: Shape2D) => Blueprint | Blueprints | CompoundBlueprint | null;

/**
 * Compute the boolean intersection of two 2D shapes.
 *
 * Returns only the region common to both shapes. Compound and multi-blueprint
 * operands are decomposed recursively, with holes handled via complementary
 * cut operations.
 *
 * @param first - First operand.
 * @param second - Second operand.
 * @returns The intersection shape, or `null` if the shapes do not overlap.
 *
 * @example
 * ```ts
 * const overlap = intersect2D(circle, rectangle);
 * ```
 *
 * @see {@link intersect2D} for the functional API.
 */
declare function intersect2D(first: Shape2D, second: Shape2D): Blueprint | Blueprints | CompoundBlueprint | null;

/** How to map 2D sketch coordinates onto a face's parametric UV space. */
type ScaleMode = 'original' | 'bounds' | 'native';

/**
 * Return a reversed copy of the curve (non-mutating).
 *
 * @returns A new `Curve2D` with swapped start/end orientation.
 */
declare function reverseCurve(curve: Curve2D): Curve2D;

/** Get the bounding box of a 2D curve. */
declare function curve2dBoundingBox(curve: Curve2D): BoundingBox2d;

/** Get the first point of a 2D curve. */
declare function curve2dFirstPoint(curve: Curve2D): Point2D;

/** Get the last point of a 2D curve. */
declare function curve2dLastPoint(curve: Curve2D): Point2D;

/**
 * Split a curve at the given parameters or points.
 *
 * @param params - Parameter values or `Point2D` locations at which to split.
 * @returns An ordered array of sub-curves covering the original curve.
 */
declare function curve2dSplitAt(curve: Curve2D, params: Point2D[] | number[], precision?: number): Curve2D[];

/**
 * Find the parameter on the curve closest to the given point.
 *
 * @returns `Ok(parameter)` when the point is on the curve, or an error result.
 */
declare function curve2dParameter(curve: Curve2D, point: Point2D, precision?: number): Result<number>;

/**
 * Get the tangent vector at a parameter position on the curve.
 *
 * @param param - A normalized parameter (0..1) or a `Point2D` to project onto the curve.
 */
declare function curve2dTangentAt(curve: Curve2D, param: number | Point2D): Point2D;

/** Check if a point lies on the curve. */
declare function curve2dIsOnCurve(curve: Curve2D, point: Point2D): boolean;

/** Compute the distance from a point to the curve. */
declare function curve2dDistanceFrom(curve: Curve2D, point: Point2D): number;

/**
 * Create a new Blueprint from an ordered array of 2D curves.
 *
 * Returns a `Result` — use `unwrap()` in tests or `isOk()`/`match()` in
 * production code.
 *
 * @see {@link Blueprint} constructor.
 */
declare function createBlueprint(curves: Blueprint['curves']): Result<Blueprint>;

/**
 * Create a CompoundBlueprint from an outer boundary and optional holes.
 *
 * The first element of `blueprints` is the outer boundary; subsequent
 * elements are subtracted as holes.
 *
 * @see {@link CompoundBlueprint} constructor.
 */
declare function createCompoundBlueprint(blueprints: Blueprint[]): Result<CompoundBlueprint>;

/** Get the axis-aligned bounding box of a 2D blueprint. */
declare function getBounds2D(bp: Blueprint): BoundingBox2d;

/** Get the winding direction of a 2D blueprint. */
declare function getOrientation2D(bp: Blueprint): 'clockwise' | 'counterClockwise';

/** Test whether a 2D point lies strictly inside a blueprint. */
declare function isInside2D(bp: Blueprint, point: Point2D): boolean;

/** Convert a 2D blueprint to an SVG path d attribute string. */
declare function toSVGPathD(bp: Blueprint): string;

/** Translate a 2D blueprint by the given x and y distances. */
declare function translate2D(bp: Blueprint, dx: number, dy: number): Blueprint;

/** Rotate a 2D blueprint by the given angle in degrees. */
declare function rotate2D(bp: Blueprint, angle: number, center?: Point2D): Blueprint;

/** Uniformly scale a 2D blueprint by a factor around a center point. */
declare function scale2D(bp: Blueprint, factor: number, center?: Point2D): Blueprint;

/** Mirror a 2D blueprint across a point or plane. */
declare function mirror2D(bp: Blueprint, centerOrDirection: Point2D, origin?: Point2D, mode?: 'center' | 'plane'): Blueprint;

/** Stretch a 2D blueprint along a direction by a given ratio. */
declare function stretch2D(bp: Blueprint, ratio: number, direction: Point2D, origin?: Point2D): Blueprint;

/** Project a blueprint onto a 3D plane, producing sketch data. */
declare function sketchOnPlane2D(bp: Blueprint, inputPlane?: PlaneName | Plane, origin?: PointInput | number): any;

/** Map a blueprint onto a 3D face's UV surface, producing sketch data. */
declare function sketchOnFace2D(bp: Blueprint, face: Face, scaleMode?: ScaleMode): any;

/**
 * Input that resolves to a single face — a direct Face, a FaceFinderFn,
 * or a finder callback.
 */
type SingleFace = Face | FaceFinderFn | ((f: FaceFinderFn) => FaceFinderFn);

/** Resolve a {@link SingleFace} input to a concrete Face from the given shape. */
declare function getSingleFace(f: SingleFace, shape: AnyShape<Dimension>): Result<Face>;

/**
 * Export a ShapeMesh as a Wavefront OBJ string.
 *
 * Produces vertices (`v`), normals (`vn`), and face indices (`f`) with
 * OBJ's 1-based indexing. When `faceGroups` are present, each group
 * becomes a named OBJ group (`g face_<id>`).
 *
 * @param mesh - Triangulated mesh from `meshShape()`.
 * @returns A Wavefront OBJ string ready to save as a `.obj` file.
 *
 * @example
 * ```ts
 * const mesh = meshShape(solid);
 * const objString = exportOBJ(mesh);
 * ```
 */
declare function exportOBJ(mesh: ShapeMesh): string;

/**
 * PBR material definition for glTF export.
 *
 * Maps to the glTF 2.0 `pbrMetallicRoughness` material model.
 * Assign instances to face IDs via {@link GltfExportOptions.materials}.
 */
interface GltfMaterial {
    name?: string;
    /** RGBA base color factor, each component 0–1. Default: [0.8, 0.8, 0.8, 1.0] */
    baseColor?: [number, number, number, number];
    /** Metallic factor 0–1. Default: 0 */
    metallic?: number;
    /** Roughness factor 0–1. Default: 0.5 */
    roughness?: number;
}

/**
 * A meshed face as presented to a {@link MaterialFn} — its stable id and the
 * centroid of its triangles in part coordinates (Z-up, mm).
 */
interface GltfFace {
    /** Stable face identifier — matches ShapeMesh.faceGroups[].faceId. */
    faceId: number;
    /** Centroid of the face's vertices, in part (Z-up, mm) coordinates. */
    center: [number, number, number];
}

/**
 * Per-face material selector. Called once per face group; return a material to
 * paint that face, or `undefined` to leave it at the glTF default. Consumed by
 * tooling (e.g. brepjs-verify's `export const materials`) that has the mesh and
 * builds the faceId→material map passed to {@link GltfExportOptions.materials}.
 */
type MaterialFn = (face: GltfFace) => GltfMaterial | undefined;

/**
 * Options for glTF/GLB export.
 *
 * When `materials` is provided, faces are grouped into separate
 * glTF primitives by material, enabling per-face coloring.
 */
interface GltfExportOptions {
    /** Map of faceId → material. FaceIds come from ShapeMesh.faceGroups[].faceId. */
    materials?: Map<number, GltfMaterial>;
    /**
     * Up-axis of the emitted document. brepjs geometry is Z-up (CAD convention),
     * but glTF 2.0 mandates Y-up. With `'Y'` (the default) a root node carrying a
     * −90° rotation about X is emitted so the part stands upright in standard glTF
     * viewers (three.js, model-viewer, Blender); vertex data stays Z-up, matching
     * the STEP/STL exports. Use `'Z'` to emit raw Z-up coordinates with no root node.
     */
    upAxis?: 'Y' | 'Z';
}

/**
 * Export a ShapeMesh to a glTF 2.0 JSON string with an embedded base64 buffer.
 *
 * The resulting string is a self-contained `.gltf` file that can be loaded
 * directly by three.js, Babylon.js, or any glTF viewer.
 *
 * @param mesh - Triangulated mesh from `meshShape()`.
 * @param options - Optional material assignments.
 * @returns A JSON string representing the complete glTF document.
 *
 * @example
 * ```ts
 * const mesh = meshShape(solid);
 * const gltfJson = exportGltf(mesh);
 * ```
 *
 * @see {@link exportGlb} for the binary GLB variant.
 */
declare function exportGltf(mesh: ShapeMesh, options?: GltfExportOptions): string;

/**
 * Export a ShapeMesh to a `.glb` binary (ArrayBuffer).
 *
 * GLB packs the JSON header and binary buffer into a single file,
 * which is more efficient for network transfer than base64-encoded glTF.
 *
 * @param mesh - Triangulated mesh from `meshShape()`.
 * @param options - Optional material assignments.
 * @returns An ArrayBuffer containing the complete GLB binary.
 *
 * @example
 * ```ts
 * const mesh = meshShape(solid);
 * const glbBuffer = exportGlb(mesh);
 * const blob = new Blob([glbBuffer], { type: 'model/gltf-binary' });
 * ```
 *
 * @see {@link exportGltf} for the JSON variant.
 */
declare function exportGlb(mesh: ShapeMesh, options?: GltfExportOptions): ArrayBuffer;

/**
 * A single DXF entity (LINE or POLYLINE).
 *
 * LINE maps directly to a DXF LINE entity.
 * POLYLINE maps to an LWPOLYLINE with optional closure.
 */
type DXFEntity = {
    type: 'LINE';
    start: Point2D;
    end: Point2D;
    layer?: string;
} | {
    type: 'POLYLINE';
    points: Point2D[];
    closed?: boolean;
    layer?: string;
};

/** Options controlling DXF ASCII export formatting. */
interface DXFExportOptions {
    /** Default layer name for entities. Default: "0" */
    layer?: string;
    /** Number of segments for curve approximation. Default: 32 */
    curveSegments?: number;
}

/**
 * Export DXF entities to a DXF R12 ASCII string.
 *
 * Produces a complete DXF document with HEADER, TABLES, ENTITIES, and EOF
 * sections. Layer definitions are generated automatically from entities.
 *
 * @param entities - Array of LINE or POLYLINE entities to write.
 * @param options - Layer name and formatting options.
 * @returns A complete DXF ASCII string ready to save as a `.dxf` file.
 *
 * @example
 * ```ts
 * const entities: DXFEntity[] = [
 *   { type: 'LINE', start: [0, 0], end: [10, 0] },
 * ];
 * const dxfString = exportDXF(entities);
 * ```
 *
 * @see {@link blueprintToDXF} for a higher-level API that converts Blueprints directly.
 */
declare function exportDXF(entities: DXFEntity[], options?: DXFExportOptions): string;

/**
 * Convert a Blueprint (or CompoundBlueprint/Blueprints) to a DXF string.
 *
 * Each straight segment becomes a LINE entity; arcs, ellipses, splines,
 * and other curves are approximated as LWPOLYLINE entities.
 *
 * @param drawing - A Blueprint, CompoundBlueprint, or Blueprints collection.
 * @param options - Layer name and curve approximation settings.
 * @returns A complete DXF ASCII string.
 *
 * @example
 * ```ts
 * const dxf = blueprintToDXF(myBlueprint, { curveSegments: 64 });
 * ```
 *
 * @see {@link exportDXF} for the lower-level entity-based API.
 */
declare function blueprintToDXF(drawing: Blueprint | CompoundBlueprint | Blueprints, options?: DXFExportOptions): string;

/** Named material for 3MF basematerials resource. */
interface ThreeMFMaterial {
    /** Display name (e.g. 'PLA-Red'). */
    name: string;
    /** Display color as RGBA 0-1. Falls back to white if omitted. */
    displayColor?: [number, number, number, number];
}

/** Options controlling 3MF archive export. */
interface ThreeMFExportOptions {
    /** Name of the model object inside the 3MF archive. Default: `"model"`. */
    name?: string;
    /** Unit of measurement for vertex coordinates. Default: `"millimeter"`. */
    unit?: 'micron' | 'millimeter' | 'centimeter' | 'meter' | 'inch' | 'foot';
    /** Per-face colors keyed by faceId from ShapeMesh.faceGroups. RGBA 0-1 floats. */
    colors?: Map<number, [number, number, number, number]>;
    /** Per-face named materials keyed by faceId from ShapeMesh.faceGroups. */
    materials?: Map<number, ThreeMFMaterial>;
}

/**
 * Export a ShapeMesh to 3MF format (ArrayBuffer).
 *
 * 3MF is the standard format for modern 3D printing slicers
 * (PrusaSlicer, Cura, etc.). The output is a store-only ZIP archive
 * containing the OPC content types, relationships, and 3D model XML.
 *
 * @param mesh - Triangulated mesh from `meshShape()`.
 * @param options - Model name and unit settings.
 * @returns An ArrayBuffer containing the 3MF ZIP archive.
 *
 * @remarks No external compression library is needed; the archive uses
 * store-only (uncompressed) ZIP entries with CRC-32 integrity checks.
 *
 * @example
 * ```ts
 * const mesh = meshShape(solid);
 * const buf = exportThreeMF(mesh, { unit: 'millimeter' });
 * const blob = new Blob([buf], { type: 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml' });
 * ```
 */
declare function exportThreeMF(mesh: ShapeMesh, options?: ThreeMFExportOptions): ArrayBuffer;

/** Options controlling SVG import behavior. */
interface SVGImportOptions {
    /** Whether to flip the Y axis (default: true, since SVG Y is down). */
    flipY?: boolean;
}

/**
 * Import a single SVG path data string (`d` attribute) as a Blueprint.
 *
 * Supports all SVG path commands: M, L, H, V, C, S, Q, T, A, Z
 * (both absolute and relative). The Y axis is flipped to match
 * brepjs coordinates (Y up).
 *
 * @param pathD - The SVG path data string (e.g., `"M 0 0 L 10 0 L 10 10 Z"`).
 * @returns A `Result` wrapping the Blueprint, or an error if parsing fails.
 *
 * @example
 * ```ts
 * const bp = unwrap(importSVGPathD('M 0 0 L 10 0 L 10 10 Z'));
 * ```
 *
 * @see {@link importSVG} to extract all `<path>` elements from a full SVG string.
 */
declare function importSVGPathD(pathD: string): Result<Blueprint>;

/**
 * Import all `<path>` elements from an SVG string as Blueprints.
 *
 * Uses regex extraction (no DOM parser dependency) to find `<path d="...">`.
 * Each path becomes a separate Blueprint with its curves.
 *
 * @remarks Paths that fail to parse are silently skipped. Only the
 * successfully parsed paths appear in the result. If no paths are found
 * at all, an error `Result` is returned.
 *
 * @param svgString - Complete SVG XML string.
 * @returns A `Result` wrapping an array of Blueprints (one per `<path>` element).
 *
 * @example
 * ```ts
 * const blueprints = unwrap(importSVG(svgFileContents));
 * blueprints.forEach(bp => console.log(bp.curves.length));
 * ```
 *
 * @see {@link importSVGPathD} to import a single path `d` attribute directly.
 */
declare function importSVG(svgString: string): Result<Blueprint[]>;

/** Options for configured STEP export. */
interface StepExportOptions {
    /** Length unit for the STEP file (e.g., 'mm', 'inch', 'm'). */
    readonly unit?: string | undefined;
    /** Model unit override. */
    readonly modelUnit?: string | undefined;
    /** STEP schema version (e.g., 203, 214, 242). */
    readonly schema?: number | undefined;
}

/**
 * Export shapes to STEP format with full control over units and schema.
 *
 * Unlike `exportSTEP`, this function allows specifying the length unit,
 * model unit, and STEP schema version.
 *
 * @returns The STEP file content as a string.
 */
declare function exportSTEPConfigured(parts: ReadonlyArray<StepExportPart>, options?: StepExportOptions): Result<string>;

/**
 * The wasm surface the voxel domain depends on — structurally satisfied by the
 * loaded `brepjs-voxel-wasm` module. Kept snake_case to match the wasm-bindgen
 * exports exactly, so the raw module is a zero-adapter `VoxelEngine`.
 *
 * All buffers are flat (no zero-copy across the wasm boundary, per ADR-0013):
 * `verts` is xyz·V, `tris` is index·T, `queries` is xyz·Q.
 */
interface VoxelEngine {
    /** Generalized winding number per query point (~1 inside, ~0 outside). */
    winding_numbers(verts: Float32Array, tris: Uint32Array, queries: Float32Array): Float32Array;
    /** Inside/outside classification per query point (1 = inside, 0 = outside). */
    points_inside(verts: Float32Array, tris: Uint32Array, queries: Float32Array): Uint8Array;
    /** Voxelize-and-contour a mesh into a closed surface (FWN sign keystone). */
    repair_mesh(verts: Float32Array, tris: Uint32Array, resolution: number, padding: number): VoxelRepairResult;
    /** Fill an FWN-signed solid with a TPMS lattice infill, contoured to a mesh. */
    lattice_infill(verts: Float32Array, tris: Uint32Array, resolution: number, padding: number, lattice_type: number, period: number, thickness: number): VoxelRepairResult;
    /** Contour the infinite TPMS lattice clipped to an axis-aligned box. */
    tpms_box(min_x: number, min_y: number, min_z: number, max_x: number, max_y: number, max_z: number, resolution: number, padding: number, lattice_type: number, period: number, thickness: number): VoxelRepairResult;
    /** Offset a mesh by a true-SDF iso-level shift (>0 outward, <0 inward). */
    offset_mesh(verts: Float32Array, tris: Uint32Array, distance: number, resolution: number, padding: number): VoxelRepairResult;
    /** Hollow a solid mesh into an inward shell of the given thickness (>0). */
    shell_mesh(verts: Float32Array, tris: Uint32Array, thickness: number, resolution: number, padding: number): VoxelRepairResult;
    /** Voxel CSG of two meshes (op: 0=union, 1=intersection, 2=difference A−B). */
    voxel_boolean(verts_a: Float32Array, tris_a: Uint32Array, verts_b: Float32Array, tris_b: Uint32Array, op: number, resolution: number, padding: number): VoxelRepairResult;
    /**
     * Persistent dense voxel-field class, for same-grid op chains: voxelize a mesh
     * once, then boolean/offset/shell/reinit in place, contour once. Structurally
     * satisfied by the generated `VoxelField` wasm-bindgen class.
     */
    VoxelField: WasmVoxelFieldConstructor;
    /**
     * Field-first analytic SDF builder (ADR-0013). Static primitive constructors
     * and combinator methods compose an opaque expression tree that rasterizes
     * directly into a {@link WasmVoxelField} with no input mesh. Structurally
     * satisfied by the generated `Sdf` wasm-bindgen class.
     */
    Sdf: WasmSdfConstructor;
    /**
     * Position-varying scalar fields (brepjs-implicit Phase 2b). Static constructors
     * compose an opaque field that the `Sdf` modulated operators sample per voxel.
     * Structurally satisfied by the generated `ScalarField` wasm-bindgen class.
     */
    ScalarField: WasmScalarFieldConstructor;
    /** Engine artifact version, for loader/artifact compatibility checks. */
    version(): string;
}

/**
 * The repaired-mesh handle the wasm `repair_mesh` returns. Flat xyz
 * `positions`/`normals` (length 3·V) and a triangle-list `indices` (3 per tri),
 * in world space. Structurally satisfied by the generated `RepairResult` class.
 */
interface VoxelRepairResult {
    readonly positions: Float32Array;
    readonly normals: Float32Array;
    readonly indices: Uint32Array;
    /** Release the backing WASM allocation (wasm-bindgen lifecycle). */
    free(): void;
    [Symbol.dispose](): void;
}

/**
 * Minimal triangle-soup input for sign queries. Structurally satisfied by a
 * {@link KernelMeshResult} (which also carries normals/uvs/faceGroups).
 */
interface VoxelMeshInput {
    vertices: Float32Array;
    triangles: Uint32Array;
}

/**
 * Generalized winding number at each query point against a triangle-soup mesh.
 *
 * `queries` is flat xyz (length 3·Q); the result has length Q. ~1 inside, ~0
 * outside for a closed mesh; degrades gracefully on holes (the keystone that
 * makes non-watertight repair possible — ADR-0013 §11).
 */
declare function windingNumbers(mesh: VoxelMeshInput, queries: Float32Array, id?: string): Result<Float32Array>;

/**
 * Inside/outside classification (winding number > 0.5) at each query point.
 *
 * `queries` is flat xyz (length 3·Q); the result has length Q.
 */
declare function pointsInside(mesh: VoxelMeshInput, queries: Float32Array, id?: string): Result<boolean[]>;

/** Voxel-repair tuning. `resolution` sizes the longest bbox axis in voxels;
 *  `padding` is the positive air-margin ring (>= 1) Surface Nets needs. */
interface RepairOptions {
    resolution?: number;
    padding?: number;
}

/**
 * Repair a (possibly non-watertight) triangle-soup mesh into a closed surface:
 * voxelize an FWN-signed SDF, then Surface-Nets contour it back to triangles.
 *
 * The FWN sign classifies inside/outside even on holey input, so a mesh with
 * missing faces still yields a watertight result (ADR-0013 §11). Returns a
 * {@link KernelMeshResult} in world coordinates (a single face group, no UVs).
 */
declare function repairMesh(mesh: VoxelMeshInput, opts?: RepairOptions, id?: string): Result<KernelMeshResult>;

/** Voxel mesh-op tuning. `resolution` sizes the longest bbox axis in voxels;
 *  `padding` is the positive air-margin ring (>= 1) Surface Nets needs. */
interface VoxelOpOptions {
    resolution?: number;
    padding?: number;
}

/**
 * Offset a mesh by `distance` via a true-SDF iso-level shift: voxelize an
 * FWN-signed SDF, subtract `distance`, then Surface-Nets contour it back.
 *
 * `distance > 0` grows the surface outward, `< 0` shrinks it inward. Returns a
 * {@link KernelMeshResult} in world coordinates (a single face group, no UVs).
 */
declare function offsetMesh(mesh: VoxelMeshInput, distance: number, opts?: VoxelOpOptions, id?: string): Result<KernelMeshResult>;

/**
 * Hollow a solid mesh into a shell of the given inward `thickness`: voxelize an
 * FWN-signed SDF, take `max(solid, -(solid + thickness))`, then contour it.
 *
 * `thickness` must be finite and > 0 (inward-only). Returns a
 * {@link KernelMeshResult} in world coordinates (a single face group, no UVs).
 */
declare function shellMesh(mesh: VoxelMeshInput, thickness: number, opts?: VoxelOpOptions, id?: string): Result<KernelMeshResult>;

/**
 * Voxel-based CSG of two meshes: voxelize both onto a shared grid, combine their
 * SDFs (union/intersection/difference), then Surface-Nets contour the result.
 *
 * `op` is `'difference'` = A − B. Robust on non-watertight input (FWN sign).
 * Returns a {@link KernelMeshResult} in world coordinates (single group, no UVs).
 */
declare function voxelBoolean(a: VoxelMeshInput, b: VoxelMeshInput, op: 'union' | 'intersection' | 'difference', opts?: VoxelOpOptions, id?: string): Result<KernelMeshResult>;

/**
 * Offset a B-rep shape by `distance`: tessellate it, then run {@link offsetMesh}
 * on the resulting triangle soup. `distance > 0` grows outward, `< 0` shrinks
 * inward. Threads a meshing failure straight back as an `err(...)`.
 */
declare function offsetShape(shape: AnyShape<Dimension>, distance: number, opts?: VoxelOpOptions, id?: string): Result<KernelMeshResult>;

/**
 * Hollow a B-rep shape into a shell of inward `thickness`: tessellate it, then
 * run {@link shellMesh}. `thickness` must be finite and > 0. Threads a meshing
 * failure straight back as an `err(...)`.
 */
declare function shellShape(shape: AnyShape<Dimension>, thickness: number, opts?: VoxelOpOptions, id?: string): Result<KernelMeshResult>;

/**
 * Voxel CSG of two B-rep shapes: tessellate both, then run {@link voxelBoolean}.
 * `op` is `'difference'` = A − B. Threads either meshing failure back as an
 * `err(...)`.
 */
declare function voxelBooleanShapes(a: AnyShape<Dimension>, b: AnyShape<Dimension>, op: 'union' | 'intersection' | 'difference', opts?: VoxelOpOptions, id?: string): Result<KernelMeshResult>;

/** Field tuning. `resolution` sizes the longest bbox axis in voxels; `padding`
 *  is the air-margin ring (>= 1) Surface Nets needs AND the headroom an outward
 *  offset has before it clips at the grid boundary (the grid is fixed at
 *  voxelize time — size both for the intended maximum offset). */
interface VoxelFieldOptions {
    resolution?: number;
    padding?: number;
}

/** Boolean op selector for {@link fieldBoolean} / {@link VoxelFieldHandle.boolean}. */
type VoxelBooleanOp = 'union' | 'intersection' | 'difference';

/**
 * A persistent, disposable voxel field. Carries the wrapped WASM field as
 * `value` and a fluent op-chain (`.boolean().offset().shell().contour()`) that
 * throws on the rare WASM error (mirroring the `shape()` facade's
 * throw-on-`Err` convention), so a `using`-scoped chain reads cleanly:
 *
 * ```ts
 * using field = voxelField(meshA).unwrap();
 * using other = voxelField(meshB).unwrap();
 * const mesh = field.boolean(other, 'union').offset(2).contour();
 * ```
 *
 * Dispose is mandatory (FinalizationRegistry is an unreliable safety net): use
 * `using`, or call `[Symbol.dispose]()` explicitly, to free the WASM grid.
 */
interface VoxelFieldHandle {
    /** The wrapped WASM field. Throws if the handle has been disposed. */
    readonly value: WasmVoxelField;
    /** Whether the backing WASM grid has been freed. */
    readonly disposed: boolean;
    [Symbol.dispose](): void;
    /** CSG-combine with `other` in place (marks the field for lazy reinit). */
    boolean(other: VoxelFieldHandle, op: VoxelBooleanOp): VoxelFieldHandle;
    /** Offset the surface in place (>0 outward, <0 inward); auto-reinits if dirty. */
    offset(distance: number): VoxelFieldHandle;
    /** Hollow into an inward shell in place (thickness > 0); auto-reinits if dirty. */
    shell(thickness: number): VoxelFieldHandle;
    /** Reinitialize φ to a true SDF while preserving the zero set. */
    reinit(): VoxelFieldHandle;
    /** Surface-Nets contour the current field to a mesh (the field stays alive). */
    contour(): KernelMeshResult;
}

/**
 * Voxelize a mesh into a persistent dense {@link VoxelFieldHandle}: one grid you
 * can boolean / offset / shell / reinit in place, then contour once. The handle
 * is disposable — free the WASM grid with `using` (or `[Symbol.dispose]()`).
 *
 * `resolution` sizes the longest bbox axis; `padding` is the air-margin ring.
 * Errors on an empty/invalid mesh, or if the grid would exceed the dense budget
 * (the persistent path is dense-only) or the voxel cap.
 */
declare function voxelField(mesh: VoxelMeshInput, opts?: VoxelFieldOptions, id?: string): Result<VoxelFieldHandle>;

/**
 * Boolean two meshes into ONE co-registered, chainable {@link VoxelFieldHandle}:
 * voxelize both onto a single shared grid sized to their union bbox, combine by
 * `op`, and keep the field. This is THE correct way to "boolean then chain
 * offset/shell" two independently-described meshes — unlike {@link fieldBoolean},
 * which requires the operands to already share grid geometry. The result is
 * dirty (the blend drifts the gradient), so a subsequent offset/shell
 * auto-reinitializes. The handle is disposable — free it with `using`.
 *
 * `op` is `'difference'` = A − B. Errors on an empty/invalid mesh, or if the
 * shared grid would exceed the dense budget (the persistent path is dense-only).
 */
declare function voxelBooleanField(a: VoxelMeshInput, b: VoxelMeshInput, op: VoxelBooleanOp, opts?: VoxelFieldOptions, id?: string): Result<VoxelFieldHandle>;

/**
 * CSG-combine two fields IN PLACE, returning the SAME `handle` for chaining. The
 * min/max blend keeps the zero set exact but drifts the gradient near the join,
 * so a subsequent {@link fieldOffset}/{@link fieldShell} auto-reinitializes.
 *
 * PRECONDITION: both operands must be CO-REGISTERED — same origin, spacing, AND
 * dims. Two fields built by {@link voxelField} from DIFFERENT meshes generally do
 * NOT share geometry (each sizes its grid to its own bbox), and the WASM guard
 * rejects that mismatch as an `err(...)` rather than silently blending mismatched
 * coordinate frames. For the easy co-registered path, build the field directly
 * from both meshes with {@link voxelBooleanField}.
 */
declare function fieldBoolean(handle: VoxelFieldHandle, other: VoxelFieldHandle, op: VoxelBooleanOp): Result<VoxelFieldHandle>;

/**
 * Offset the field's surface IN PLACE (>0 outward, <0 inward), returning the
 * SAME `handle`. Auto-reinitializes first if the field is dirty (post-boolean),
 * so the iso-shift always rides a true SDF.
 */
declare function fieldOffset(handle: VoxelFieldHandle, distance: number): Result<VoxelFieldHandle>;

/**
 * Hollow the field into an inward shell of `thickness` IN PLACE, returning the
 * SAME `handle`. Auto-reinitializes first if dirty; the result is dirty again
 * (the shell re-introduces a kink).
 */
declare function fieldShell(handle: VoxelFieldHandle, thickness: number): Result<VoxelFieldHandle>;

/**
 * Explicitly reinitialize φ to a true SDF (|∇φ|=1) while preserving the zero
 * set, returning the SAME `handle`. Idempotent on a clean field. Offset/shell
 * already auto-reinitialize, so this is for advanced control only.
 */
declare function fieldReinit(handle: VoxelFieldHandle): Result<VoxelFieldHandle>;

/**
 * Surface-Nets contour the current field to a {@link KernelMeshResult}. The
 * field stays alive and chainable afterwards (contour borrows it). An empty
 * contour surfaces as `VOXEL_DEGENERATE_RESULT`.
 */
declare function fieldContour(handle: VoxelFieldHandle): Result<KernelMeshResult>;

/**
 * Voxelize a B-rep shape into a persistent {@link VoxelFieldHandle}: tessellate
 * it, then run {@link voxelField}. Threads a meshing failure back as an
 * `err(...)`. The handle is disposable — free it with `using`.
 */
declare function voxelFieldFromShape(shape: AnyShape<Dimension>, opts?: VoxelFieldOptions, id?: string): Result<VoxelFieldHandle>;

/**
 * Boolean two B-rep shapes into one co-registered, chainable
 * {@link VoxelFieldHandle}: tessellate both, then run {@link voxelBooleanField}.
 * `op` is `'difference'` = A − B. Threads either meshing failure back as an
 * `err(...)`. The handle is disposable — free it with `using`.
 */
declare function voxelBooleanFieldShapes(a: AnyShape<Dimension>, b: AnyShape<Dimension>, op: VoxelBooleanOp, opts?: VoxelFieldOptions, id?: string): Result<VoxelFieldHandle>;

declare function registerVoxel(id: string, engine: VoxelEngine): void;

/**
 * Return a voxel engine by id, or the default engine if no id is given.
 *
 * @throws If no engine has been registered via {@link initVoxel} or
 * {@link registerVoxel}.
 */
declare function getVoxel(id?: string): VoxelEngine;

/** Return the id of the active default engine, or `null` if none is registered. */
declare function getActiveVoxelId(): string | null;

/**
 * Register a loaded voxel engine and make it the default.
 *
 * Mirrors {@link initFromOC} for the kernel: the loader package
 * (`brepjs-voxel`) instantiates the wasm, then hands the engine here.
 */
declare function initVoxel(engine: VoxelEngine, id?: string): void;

/**
 * Mesh a B-rep shape into the flat triangle-soup {@link VoxelMeshInput} the voxel
 * ops consume. Tessellates via the topology mesh API at `deflection` linear
 * tolerance and forwards its `{ vertices, triangles }` (already Float32Array /
 * Uint32Array). Meshing failures surface as an `err(...)` rather than a throw.
 */
declare function shapeToMeshInput(shape: AnyShape<Dimension>, deflection?: number): Result<VoxelMeshInput>;

/** TPMS lattice families. Maps to the wasm tag (0=Gyroid, 1=SchwarzP, 2=Diamond). */
type LatticeType = 'gyroid' | 'schwarzP' | 'diamond';

/**
 * TPMS lattice tuning. `period` is the unit-cell size (world units); `thickness`
 * is the strut wall width in field units. `resolution` sizes the longest bbox
 * axis in voxels; `padding` is the positive air-margin ring (>= 1) Surface Nets
 * needs.
 */
interface LatticeOptions {
    type: LatticeType;
    period: number;
    thickness: number;
    resolution?: number;
    padding?: number;
}

/**
 * Fill a solid mesh with a TPMS lattice infill: intersect the FWN-signed solid
 * with the chosen lattice shell field, then Surface-Nets contour the result.
 *
 * Returns a {@link KernelMeshResult} in world coordinates (a single face group,
 * no UVs). The TPMS field is the approximate implicit (raw trig), so the surface
 * is contoured at the zero level without distance normalization (ADR-0013).
 */
declare function latticeInfill(mesh: VoxelMeshInput, opts: LatticeOptions, id?: string): Result<KernelMeshResult>;

/**
 * Fill a B-rep shape with a TPMS lattice infill: tessellate the shape, then run
 * {@link latticeInfill} on the resulting triangle soup. Threads a meshing
 * failure straight back as an `err(...)`.
 */
declare function latticeInfillShape(shape: AnyShape<Dimension>, opts: LatticeOptions, id?: string): Result<KernelMeshResult>;

/** Axis-aligned bounds for a clipped TPMS lattice. */
interface LatticeBounds {
    min: [number, number, number];
    max: [number, number, number];
}

/**
 * Contour the infinite TPMS lattice clipped to an axis-aligned box.
 *
 * Returns a {@link KernelMeshResult} in world coordinates (a single face group,
 * no UVs). The TPMS field is the approximate implicit (raw trig), contoured at
 * the zero level without distance normalization (ADR-0013).
 */
declare function tpmsLattice(bounds: LatticeBounds, opts: LatticeOptions, id?: string): Result<KernelMeshResult>;

/**
 * Base class for 2D sketchers that accumulate {@link Curve2D} segments.
 *
 * Provides the shared pen-drawing API (lines, arcs, ellipses, beziers, splines)
 * used by `FaceSketcher`, `BlueprintSketcher`, and `DrawingPen`.
 * Subclasses implement `done()` / `close()` to produce the appropriate output type.
 *
 * @category Sketching
 */
declare class BaseSketcher2d {
    protected pointer: Point2D;
    protected firstPoint: Point2D;
    protected pendingCurves: Curve2D[];
    protected _nextCorner: null | ((f: Curve2D, s: Curve2D) => Curve2D[]);
    constructor(origin?: Point2D);
    protected _convertToUV([x, y]: Point2D): Point2D;
    protected _convertFromUV([u, v]: Point2D): Point2D;
    protected _lastCurve(): Curve2D | null;
    protected _requireLastCurve(caller: string, action: string): Curve2D;
    protected _resolveRelative(xDist: number, yDist: number): Point2D;
    protected _saveCurveAndAdvance(curve: Curve2D, end: Point2D): this;
    /**
     * Returns the current pen position as [x, y] coordinates
     *
     * @category Drawing State
     */
    get penPosition(): Point2D;
    /**
     * Returns the current pen angle in degrees
     *
     * @category Drawing State
     */
    get penAngle(): number;
    /** Move the pen to an absolute 2D position before drawing any curves. */
    movePointerTo(point: Point2D): this;
    protected saveCurve(curve: Curve2D): void;
    /** Draw a straight line to an absolute 2D point. */
    lineTo(point: Point2D): this;
    /** Draw a straight line by relative horizontal and vertical distances. */
    line(xDist: number, yDist: number): this;
    /** Draw a vertical line of the given signed distance. */
    vLine(distance: number): this;
    /** Draw a horizontal line of the given signed distance. */
    hLine(distance: number): this;
    /** Draw a vertical line to an absolute Y coordinate. */
    vLineTo(yPos: number): this;
    /** Draw a horizontal line to an absolute X coordinate. */
    hLineTo(xPos: number): this;
    /** Draw a line to a point given in polar coordinates [r, theta] from the origin. */
    polarLineTo([r, theta]: Point2D): this;
    /** Draw a line in polar coordinates (distance and angle in degrees) from the current point. */
    polarLine(distance: number, angle: number): this;
    /** Draw a line tangent to the previous curve, extending by the given distance. */
    tangentLine(distance: number): this;
    /** Draw a circular arc passing through a mid-point to an absolute end point. */
    threePointsArcTo(end: Point2D, midPoint: Point2D): this;
    /** Draw a circular arc through a via-point to an end point, both as relative distances. */
    threePointsArc(xDist: number, yDist: number, viaXDist: number, viaYDist: number): this;
    /** Draw a circular arc to an absolute end point, bulging by the given sagitta. */
    sagittaArcTo(end: Point2D, sagitta: number): this;
    /** Draw a circular arc to a relative end point, bulging by the given sagitta. */
    sagittaArc(xDist: number, yDist: number, sagitta: number): this;
    /** Draw a vertical sagitta arc of the given distance and bulge. */
    vSagittaArc(distance: number, sagitta: number): this;
    /** Draw a horizontal sagitta arc of the given distance and bulge. */
    hSagittaArc(distance: number, sagitta: number): this;
    /** Draw an arc to an absolute end point using a bulge factor (sagitta as fraction of half-chord). */
    bulgeArcTo(end: Point2D, bulge: number): this;
    /** Draw an arc to a relative end point using a bulge factor. */
    bulgeArc(xDist: number, yDist: number, bulge: number): this;
    /** Draw a vertical bulge arc of the given distance and bulge factor. */
    vBulgeArc(distance: number, bulge: number): this;
    /** Draw a horizontal bulge arc of the given distance and bulge factor. */
    hBulgeArc(distance: number, bulge: number): this;
    /** Draw a circular arc tangent to the previous curve, ending at an absolute point. */
    tangentArcTo(end: Point2D): this;
    /** Draw a circular arc tangent to the previous curve, ending at a relative offset. */
    tangentArc(xDist: number, yDist: number): this;
    /** Draw an elliptical arc to an absolute end point (SVG-style parameters). */
    ellipseTo(end: Point2D, horizontalRadius: number, verticalRadius: number, rotation?: number, longAxis?: boolean, sweep?: boolean): this;
    /** Draw an elliptical arc to a relative end point (SVG-style parameters). */
    ellipse(xDist: number, yDist: number, horizontalRadius: number, verticalRadius: number, rotation?: number, longAxis?: boolean, sweep?: boolean): this;
    /** Draw a half-ellipse arc to an absolute end point with a given minor radius. */
    halfEllipseTo(end: Point2D, minorRadius: number, sweep?: boolean): this;
    /** Draw a half-ellipse arc to a relative end point with a given minor radius. */
    halfEllipse(xDist: number, yDist: number, minorRadius: number, sweep?: boolean): this;
    /** Draw a Bezier curve to an absolute end point through one or more control points. */
    bezierCurveTo(end: Point2D, controlPoints: Point2D | Point2D[]): this;
    /** Draw a quadratic Bezier curve to an absolute end point with a single control point. */
    quadraticBezierCurveTo(end: Point2D, controlPoint: Point2D): this;
    /** Draw a cubic Bezier curve to an absolute end point with start and end control points. */
    cubicBezierCurveTo(end: Point2D, startControlPoint: Point2D, endControlPoint: Point2D): this;
    /** Draw a smooth cubic Bezier spline to an absolute end point, blending tangent with the previous curve. */
    smoothSplineTo(end: Point2D, config?: SplineOptions): this;
    /** Draw a smooth cubic Bezier spline to a relative end point, blending tangent with the previous curve. */
    smoothSpline(xDist: number, yDist: number, splineConfig?: SplineOptions): this;
    /** Changes the corner between the previous and next segments. */
    customCorner(radius: number | ((first: Curve2D, second: Curve2D) => Curve2D[]), mode?: 'fillet' | 'chamfer'): this;
    protected _customCornerLastWithFirst(radius: number | ((f: Curve2D, s: Curve2D) => Curve2D[]), mode?: 'fillet' | 'chamfer' | 'dogbone'): void;
    protected _closeSketch(): void;
    protected _closeWithMirror(): void;
}

/**
 * Configuration for {@link GenericSketcher.smoothSplineTo}.
 *
 * Can be a single tangent value (applied to the end), or an object with
 * separate start/end tangents and distance factors.
 */
type SplineOptions = SplineTangent | {
    endTangent?: SplineTangent;
    startTangent?: StartSplineTangent;
    startFactor?: number;
    endFactor?: number;
};

/**
 * Sketchers allow the user to draw a two dimensional shape using segments of
 * curve. You start by defining where your sketch will start (with the method
 * `movePointerTo`).
 * Each sketching method corresponds to drawing a curve of some type (line,
 * arc, elliptic arc, bezier curve) to a new point. The next segment will start
 * from the end point of the previous segment.
 * Once you end your sketch you will receive a `Sketch` object that allows you
 * to give some three dimensionality to your finished sketch.
 *
 * @category Sketching
 */
interface GenericSketcher<ReturnType> {
    /**
     * Changes the point to start your drawing from
     */
    movePointerTo(point: Point2D): this;
    /**
     * Draws a line from the current point to the point given in argument
     *
     * @category Line Segment
     */
    lineTo(point: Point2D): this;
    /**
     * Draws a line at the horizontal distance xDist and the vertical distance
     * yDist of the current point
     *
     * @category Line Segment
     */
    line(xDist: number, yDist: number): this;
    /**
     * Draws a vertical line of length distance from the current point
     *
     * @category Line Segment
     */
    vLine(distance: number): this;
    /**
     * Draws an horizontal line of length distance from the current point
     *
     * @category Line Segment
     */
    hLine(distance: number): this;
    /**
     * Draws a vertical line to the y coordinate
     *
     * @category Line Segment
     */
    vLineTo(yPos: number): this;
    /**
     * Draws an horizontal line to the x coordinate
     *
     * @category Line Segment
     */
    hLineTo(xPos: number): this;
    /**
     * Draws a line from the current point to the point defined in polar
     * coordinates, of radius r and angle theta (in degrees) from the origin
     *
     * @category Line Segment
     */
    polarLineTo([r, theta]: [number, number]): this;
    /**
     * Draws a line from the current point to the point defined in polar
     * coordinates, of radius r and angle theta (in degrees) from the current
     * point
     *
     * @category Line Segment
     */
    polarLine(r: number, theta: number): this;
    /**
     * Draws a line from the current point as a tangent to the previous part of
     * curve drawn. The distance defines how long the line will be.
     *
     * @category Line Segment
     */
    tangentLine(distance: number): this;
    /** Draws an arc of circle by defining its end point and a third point
     * through which the arc will pass.
     *
     * @category Arc Segment
     */
    threePointsArcTo(end: Point2D, innerPoint: Point2D): this;
    /** Draws an arc of circle by defining its end point and a third point
     * through which the arc will pass. Both points are defined in horizontal
     * (x) and vertical (y) distances from the start point.
     *
     * @category Arc Segment
     */
    threePointsArc(xDist: number, yDist: number, viaXDist: number, viaYDist: number): this;
    /** Draws an arc of circle by defining its end point and the sagitta - the
     * maximum distance between the arc and the straight line going from start to
     * end point.
     *
     * @category Arc Segment
     */
    sagittaArcTo(end: Point2D, sagitta: number): this;
    /** Draws an arc of circle by defining its end point and the sagitta - the
     * maximum distance between the arc and the straight line going from start to
     * end point. The end point is defined by its horizontal and vertical
     * distances from the start point.
     *
     * @category Arc Segment
     */
    sagittaArc(xDist: number, yDist: number, sagitta: number): this;
    /** Draws a vertical arc of circle by defining its end point and the sagitta
     * - the maximum distance between the arc and the straight line going from
     * start to end point. The end point is defined by its vertical distance from
     * the start point.
     *
     * @category Arc Segment
     */
    vSagittaArc(distance: number, sagitta: number): this;
    /** Draws an horizontal arc of circle by defining its end point and the
     * sagitta - the maximum distance between the arc and the straight line going
     * from start to end point. The end point is defined by its horizontal
     * distance from the start point.
     *
     * @category Arc Segment
     */
    hSagittaArc(distance: number, sagitta: number): this;
    /** Draws an arc of circle by defining its end point and the bulge - the
     * maximum distance between the arc and the straight line going from start to
     * end point.
     *
     * @category Arc Segment
     */
    bulgeArcTo(end: Point2D, bulge: number): this;
    /** Draws an arc of circle by defining its end point and the bulge - the
     * maximum distance between the arc and the straight line going from start to
     * end point in units of half the chord. The end point is defined by its horizontal and vertical distances
     * from the start point.
     *
     * @category Arc Segment
     */
    bulgeArc(xDist: number, yDist: number, bulge: number): this;
    /** Draws a vertical arc of circle by defining its end point and the bulge
     * - the maximum distance between the arc and the straight line going from
     * start to end point in units of half the chord. The end point is defined by its vertical distance from
     * the start point.
     *
     * @category Arc Segment
     */
    vBulgeArc(distance: number, bulge: number): this;
    /** Draws an horizontal arc of circle by defining its end point and the bulge
     * - the maximum distance between the arc and the straight line going from
     * start to end point in units of half the chord. The end point is defined by
     * its horizontal distance from the start point.
     *
     * @category Arc Segment
     */
    hBulgeArc(distance: number, bulge: number): this;
    /**
     * Draws an arc of circle from the current point as a tangent to the previous
     * part of curve drawn.
     *
     * @category Arc Segment
     */
    tangentArcTo(end: Point2D): this;
    /**
     * Draws an arc of circle from the current point as a tangent to the previous
     * part of curve drawn. The end point is defined by its horizontal and vertical
     * distances from the start point.
     *
     * @category Arc Segment
     */
    tangentArc(xDist: number, yDist: number): this;
    /**
     * Draws an arc of ellipse by defining its end point and an ellipse.
     *
     * The shape of the ellipse is defined by both its radiuses, its angle
     * relative to the current coordinate system, as well as the long and sweep
     * flags (as defined for SVG paths)
     *
     * @category Ellipse Arc Segment
     */
    ellipseTo(end: Point2D, horizontalRadius: number, verticalRadius: number, rotation: number, longAxis: boolean, sweep: boolean): this;
    /**
     * Draws an arc of ellipse by defining its end point and an ellipse. The end
     * point is defined by distances from the start point.
     *
     * The shape of the ellipse is defined by both its radiuses, its angle
     * relative to the current coordinate system, as well as the long and sweep
     * flags (as defined for SVG paths)
     *
     * @category Ellipse Arc Segment
     */
    ellipse(xDist: number, yDist: number, horizontalRadius: number, verticalRadius: number, rotation: number, longAxis: boolean, sweep: boolean): this;
    /**
     * Draws an arc as half an ellipse, defined by the sagitta of the ellipse
     * (which corresponds to the radius in the axe orthogonal to the straight
     * line).
     *
     * The sweep flag is to be understood as defined for SVG paths.
     *
     * @category Ellipse Arc Segment
     */
    halfEllipseTo(end: Point2D, radius: number, sweep: boolean): this;
    /**
     * Draws an arc as half an ellipse, defined by the sagitta of the ellipse
     * (which corresponds to the radius in the axe orthogonal to the straight
     * line). The end point is defined by distances from the start point.
     *
     * The sweep flag is to be understood as defined for SVG paths.
     *
     * @category Ellipse Arc Segment
     */
    halfEllipse(xDist: number, yDist: number, radius: number, sweep: boolean): this;
    /** Draws a generic bezier curve to the end point, going using a set of
     * control points.
     *
     * This is the generic definition of a bezier curve, you might want to use
     * either the quadratic or cubic (most common) version, unless you know
     * exactly what you are aiming at.
     *
     * @category Bezier Curve
     */
    bezierCurveTo(end: Point2D, controlPoints: Point2D | Point2D[]): this;
    /** Draws a quadratic bezier curve to the end point, using the single control
     * point.
     *
     * @category Bezier Curve
     */
    quadraticBezierCurveTo(end: Point2D, controlPoint: Point2D): this;
    /** Draws a cubic bezier curve to the end point, using the start and end
     * control point to define its shape. This corresponds to the most commonly
     * used bezier curve.
     *
     * If you are struggling setting your control points, the smoothSpline might
     * be better for your needs.
     *
     * @category Bezier Curve
     */
    cubicBezierCurveTo(end: Point2D, startControlPoint: Point2D, endControlPoint: Point2D): this;
    /** Draws a cubic bezier curve to the end point, attempting to make the line
     * smooth with the previous segment.
     *
     * It will base its first control point so that its tangent is the same as
     * the previous segment.
     *
     * The control point relative to the end is by default set to be in the
     * direction of the straight line between start and end. You can specify the
     * `endSkew` either as an angle (in degrees) to this direction, or as an
     * absolute direction in the coordinate system (a Point).
     *
     * The start- and end- factors decide on how far the control point is from
     * the start and end point. At a factor of 1, the distance corresponds to
     * a quarter of the straight line distance.
     *
     * @category Bezier Curve
     */
    smoothSplineTo(end: Point2D, config?: SplineOptions): this;
    /** Draws a cubic bezier curve to the end point, attempting to make the line
     * smooth with the previous segment. The end point is defined by its distance
     * to the first point.
     *
     * It will base its first control point so that its tangent is the same as
     * the previous segment. You can force another tangent by defining
     * `startTangent`.
     *
     * You can configure the tangent of the end point by configuring the
     * `endTangent`, either as "symmetric" to reproduce the start angle, as an
     * angle from the X axis (in the coordinate system) or a 2d direction (still
     * in the coordinate system).
     *
     * The start- and end- factors decide on how far the control point is from
     * the start and end point. At a factor of 1, the distance corresponds to
     * a quarter of the straight line distance.
     *
     * @category Bezier Curve
     */
    smoothSpline(xDist: number, yDist: number, splineConfig: SplineOptions): this;
    /**
     * Changes the corner between the previous and next segments by applying
     * a fillet, chamfer, or custom corner function.
     *
     * @param radius - Fillet/chamfer radius, or a custom corner function.
     * @param mode - Corner treatment type: `'fillet'` (default) or `'chamfer'`.
     *
     * @category Corner Treatment
     */
    customCorner(radius: number | ((first: Curve2D, second: Curve2D) => Curve2D[]), mode?: 'fillet' | 'chamfer'): this;
    /**
     * Returns the current pen position as [x, y] coordinates.
     *
     * @category Drawing State
     */
    readonly penPosition: Point2D;
    /**
     * Returns the current pen angle in degrees, based on the tangent direction
     * at the end of the last drawn segment. Returns 0 if nothing has been drawn.
     *
     * @category Drawing State
     */
    readonly penAngle: number;
    /**
     * Stop drawing and returns the sketch.
     */
    done(): ReturnType;
    /**
     * Stop drawing, make sure the sketch is closed (by adding a straight line to
     * from the last point to the first) and returns the sketch.
     */
    close(): ReturnType;
    /**
     * Stop drawing, make sure the sketch is closed (by mirroring the lines
     * between the first and last points drawn) and returns the sketch.
     */
    closeWithMirror(): ReturnType;
    /**
     * Close the path and apply a custom corner treatment (fillet, chamfer, or dogbone)
     * between the last and first segments.
     *
     * @param radius - Fillet/chamfer radius, or a custom corner function.
     * @param mode - Corner treatment type: `'fillet'` (default), `'chamfer'`, or `'dogbone'`.
     */
    closeWithCustomCorner(radius: number | ((f: Curve2D, s: Curve2D) => Curve2D[]), mode?: 'fillet' | 'chamfer' | 'dogbone'): ReturnType;
}

/** Common interface for sketch-like objects that can be extruded, revolved, or lofted. */
interface SketchInterface {
    /** Transforms the lines into a face. The lines should be closed. */
    face(): Face;
    /**
     * Revolves the drawing on an axis (defined by its direction and an origin
     * (defaults to the sketch origin)
     */
    revolve(revolutionAxis?: PointInput, config?: {
        origin?: PointInput;
    }): Shape3D;
    /**
     * Extrudes the sketch to a certain distance (along the default direction
     * and origin of the sketch).
     *
     * You can define another extrusion direction or origin,
     *
     * It is also possible to twist extrude with an angle (in degrees), or to
     * give a profile to the extrusion (the endFactor will scale the face, and
     * the profile will define how the scale is applied (either linearly or with
     * a s-shape).
     */
    extrude(extrusionDistance: number, extrusionConfig?: {
        extrusionDirection?: PointInput;
        extrusionProfile?: ExtrusionProfile;
        twistAngle?: number;
        origin?: PointInput;
    }): Shape3D;
    /**
     * Loft between this sketch and another sketch (or an array of them)
     *
     * You can also define a `startPoint` for the loft (that will be placed
     * before this sketch) and an `endPoint` after the last one.
     *
     * You can also define if you want the loft to result in a ruled surface.
     *
     * Note that all sketches will be deleted by this operation
     */
    loftWith(otherSketches: SketchInterface | SketchInterface[], loftConfig?: LoftOptions, returnShell?: boolean): Shape3D;
    /**
     * Sweep a profile sketch (built by the `sketchOnPlane` callback) along this
     * sketch's wire path.
     */
    sweepSketch(sketchOnPlane: (plane: Plane, origin: Vec3) => SketchInterface, sweepConfig?: SweepOptions): Shape3D;
}

/**
 * Create a circular Sketch on a given plane.
 *
 * @param radius - Radius of the circle.
 * @param planeConfig - Plane name / origin to sketch on (defaults to XY at origin).
 * @returns A closed circular {@link Sketch}.
 *
 * @example
 * ```ts
 * const circle = sketchCircle(10, { plane: "XZ", origin: 5 });
 * const cylinder = circle.extrude(20);
 * ```
 *
 * @category Sketching
 */
declare const sketchCircle: (radius: number, planeConfig?: PlaneConfig) => Sketch;

/**
 * Create an elliptical Sketch on a given plane.
 *
 * @param xRadius - Semi-axis length along the plane X direction.
 * @param yRadius - Semi-axis length along the plane Y direction.
 * @param planeConfig - Plane name / origin to sketch on (defaults to XY at origin).
 * @returns A closed elliptical {@link Sketch}.
 *
 * @category Sketching
 */
declare const sketchEllipse: (xRadius?: number, yRadius?: number, planeConfig?: PlaneConfig) => Sketch;

/**
 * Create a rectangular Sketch centered on a given plane.
 *
 * @param xLength - Width along the plane X direction.
 * @param yLength - Height along the plane Y direction.
 * @param planeConfig - Plane name / origin to sketch on (defaults to XY at origin).
 * @returns A closed rectangular {@link Sketch}.
 *
 * @example
 * ```ts
 * const rect = sketchRectangle(30, 20);
 * const box = rect.extrude(10);
 * ```
 *
 * @category Sketching
 */
declare const sketchRectangle: (xLength: number, yLength: number, planeConfig?: PlaneConfig) => Sketch;

/**
 * Create a rounded-rectangle Sketch centered on a given plane.
 *
 * @param width - Width of the rectangle.
 * @param height - Height of the rectangle.
 * @param r - Corner radius, or `{ rx, ry }` for elliptical corners (0 = sharp).
 * @param planeConfig - Plane name / origin to sketch on (defaults to XY at origin).
 * @returns A closed rounded-rectangle {@link Sketch}.
 *
 * @category Sketching
 */
declare const sketchRoundedRectangle: (width: number, height: number, r?: number | {
    rx?: number;
    ry?: number;
}, planeConfig?: PlaneConfig) => Sketch;

/**
 * Create a regular-polygon Sketch on a given plane.
 *
 * Sides may optionally be arcs (sagitta != 0). The outer radius is measured
 * to the vertices when sagitta is zero.
 *
 * @param radius - Circumscribed (outer) radius.
 * @param sidesCount - Number of polygon sides.
 * @param sagitta - Arc sagitta per side (0 = straight edges).
 * @param planeConfig - Plane name / origin to sketch on.
 * @returns A closed polygon {@link Sketch}.
 *
 * @example
 * ```ts
 * const hex = sketchPolysides(15, 6);
 * ```
 *
 * @category Sketching
 */
declare const sketchPolysides: (radius: number, sidesCount: number, sagitta?: number, planeConfig?: PlaneConfig) => Sketch;

/**
 * Compute the apothem (inner radius) of a regular polygon, accounting for sagitta.
 *
 * @param outerRadius - Circumscribed radius.
 * @param sidesCount - Number of polygon sides.
 * @param sagitta - Arc sagitta per side (0 = straight edges).
 * @returns The inscribed radius (distance from center to the nearest edge midpoint).
 */
declare const polysideInnerRadius: (outerRadius: number, sidesCount: number, sagitta?: number) => number;

/**
 * Create a Sketch by offsetting the outer wire of a face.
 *
 * A negative offset shrinks inward; a positive offset expands outward.
 *
 * @param face - The face whose outer wire to offset.
 * @param offset - Signed offset distance.
 * @returns A {@link Sketch} of the offset wire, inheriting the face normal.
 *
 * @category Sketching
 */
declare const sketchFaceOffset: (face: Face, offset: number) => Sketch;

/**
 * Create a Sketch from a parametric 2D function, approximated as a B-spline.
 *
 * The function is sampled at `pointsCount + 1` evenly spaced parameter values
 * between `start` and `stop`, then fit with a B-spline approximation.
 *
 * @param func - Parametric function mapping `t` to a 2D point.
 * @param planeConfig - Plane to sketch on (defaults to XY at origin).
 * @param approximationConfig - B-spline fitting options (tolerance, degree, etc.).
 * @returns A {@link Sketch} containing the approximated curve.
 *
 * @category Sketching
 */
declare const sketchParametricFunction: (func: (t: number) => Point2D, planeConfig?: PlaneConfig, { pointsCount, start, stop }?: {
    pointsCount?: number | undefined;
    start?: number | undefined;
    stop?: number | undefined;
}, approximationConfig?: BSplineApproximationOptions) => Sketch;

/**
 * Create a helical Sketch (open wire) with the given pitch, height, and radius.
 *
 * @param pitch - Axial distance per full revolution.
 * @param height - Total height of the helix along its axis.
 * @param radius - Radius of the helix.
 * @param center - Center point of the helix base.
 * @param dir - Axis direction of the helix.
 * @param lefthand - If true, generate a left-handed helix.
 * @returns A {@link Sketch} wrapping the helical wire.
 *
 * @category Sketching
 */
declare const sketchHelix: (pitch: number, height: number, radius: number, center?: PointInput, dir?: PointInput, lefthand?: boolean) => Sketch;

/**
 * Create a box centered on the XY plane and extruded along Z.
 *
 * @param xLength - Width of the box along X.
 * @param yLength - Depth of the box along Y.
 * @param zLength - Height of the box along Z (extrusion distance).
 * @returns The extruded 3D box shape.
 *
 * @example
 * ```ts
 * const box = makeBaseBox(10, 20, 5);
 * ```
 */
declare const makeBaseBox: (xLength: number, yLength: number, zLength: number) => Shape3D;

/**
 * @categoryDescription Drawing
 *
 * Drawing are shapes in the 2D space. You can either use a "builder pen" to
 * draw a shape, or use some of the canned shapes like circles or rectangles.
 */
/**
 * Immutable wrapper around a 2D shape ({@link Blueprint}, {@link CompoundBlueprint}, or {@link Blueprints}).
 *
 * A Drawing can be transformed (translate, rotate, scale, mirror), combined
 * with Boolean operations (cut, fuse, intersect), filleted/chamfered,
 * serialized, and ultimately projected onto a 3D plane via `sketchOnPlane`.
 *
 * @example
 * ```ts
 * const profile = drawRectangle(40, 20)
 *   .fillet(3)
 *   .cut(drawCircle(5).translate(10, 0));
 * const sketch = profile.sketchOnPlane("XY");
 * ```
 *
 * @category Drawing
 */
declare class Drawing {
    private readonly innerShape;
    constructor(innerShape?: Shape2D);
    /** Create an independent deep copy of this drawing. */
    clone(): Drawing;
    /** Serialize the drawing to a JSON string for persistence or transfer. */
    serialize(): string;
    /** Get the axis-aligned 2D bounding box of this drawing. */
    get boundingBox(): BoundingBox2d;
    /** Stretch the drawing by a ratio along a direction from an origin point. */
    stretch(ratio: number, direction: Point2D, origin: Point2D): Drawing;
    /** Return a human-readable string representation of the drawing. */
    get repr(): string;
    /** Rotate the drawing by an angle (in degrees) around an optional center point. */
    rotate(angle: number, center?: Point2D): Drawing;
    /** Translate the drawing by horizontal and vertical distances. */
    translate(xDist: number, yDist: number): Drawing;
    /** Translate the drawing by a 2D vector. */
    translate(translationVector: Point2D): Drawing;
    /** Uniformly scale the drawing by a factor around an optional center point. */
    scale(scaleFactor: number, center?: Point2D): Drawing;
    /** Mirror the drawing about a point or a line defined by direction and origin. */
    mirror(centerOrDirection: Point2D, origin?: Point2D, mode?: 'center' | 'plane'): Drawing;
    /**
     * Builds a new drawing by cutting another drawing into this one
     *
     * @category Drawing Modifications
     */
    cut(other: Drawing): Drawing;
    /**
     * Builds a new drawing by merging another drawing into this one
     *
     * @category Drawing Modifications
     */
    fuse(other: Drawing): Drawing;
    /**
     * Builds a new drawing by intersection this drawing with another
     *
     * @category Drawing Modifications
     */
    intersect(other: Drawing): Drawing;
    /**
     * Creates a new drawing with some corners filleted, as specified by the
     * radius and the corner finder function
     *
     * @category Drawing Modifications
     */
    fillet(radius: number, filter?: (c: CornerFinderFn) => CornerFinderFn): Drawing;
    /**
     * Creates a new drawing with some corners chamfered, as specified by the
     * radius and the corner finder function
     *
     * @category Drawing Modifications
     */
    chamfer(radius: number, filter?: (c: CornerFinderFn) => CornerFinderFn): Drawing;
    /** Project this drawing onto a 3D plane, producing a Sketch or Sketches. */
    sketchOnPlane(inputPlane: Plane): SketchInterface | Sketches;
    /** Project this drawing onto a named plane at an optional origin. */
    sketchOnPlane(inputPlane?: PlaneName, origin?: PointInput | number): SketchInterface | Sketches;
    /** Project this drawing onto a 3D face surface with the given scale mode. */
    sketchOnFace(face: Face, scaleMode: ScaleMode): SketchInterface | Sketches;
    /** Punch the drawing's profile as a hole through a 3D shape on the given face. */
    punchHole(shape: AnyShape<Dimension>, faceFinder: SingleFace, options?: {
        height?: number;
        origin?: PointInput;
        draftAngle?: number;
    }): AnyShape<Dimension>;
    /** Export the drawing as a complete SVG string. */
    toSVG(margin?: number): string;
    /** Return the SVG `viewBox` attribute string for this drawing. */
    toSVGViewBox(margin?: number): string;
    /** Return the SVG `<path>` `d` attribute strings for this drawing. */
    toSVGPaths(): string[] | string[][];
    /** Offset the drawing contour by a signed distance (positive = outward). */
    offset(distance: number, offsetConfig?: Offset2DConfig): Drawing;
    /** Approximate the drawing curves for a target format (currently only `'svg'`). */
    approximate(target: 'svg' | 'arcs', options?: ApproximationOptions): Drawing;
    /** Access the underlying {@link Blueprint}, throwing if the drawing is compound. */
    get blueprint(): Blueprint;
}

/**
 * Deserializes a drawing from a string. String is expected to be in the format
 * generated by `Drawing.serialize()`.
 */
declare function deserializeDrawing(data: string): Drawing;

/**
 * Creates a drawing pen to programatically draw in 2D.
 *
 * @category Drawing
 */
declare function draw(initialPoint?: Point2D): DrawingPen;

/**
 * Creates the `Drawing` of a rectangle with (optional) rounded corners.
 *
 * The rectangle is centered on [0, 0]
 *
 * @category Drawing
 */
declare function drawRoundedRectangle(width: number, height: number, r?: number | {
    rx?: number;
    ry?: number;
}): Drawing;

/** Alias for {@link drawRoundedRectangle}. Creates a rectangle (sharp corners when `r` is 0). */
declare const drawRectangle: typeof drawRoundedRectangle;

/**
 * Creates the `Drawing` of a circle as one single curve.
 *
 * The circle is centered on [0, 0]
 *
 * @category Drawing
 */
declare function drawSingleCircle(radius: number): Drawing;

/**
 * Creates the `Drawing` of an ellipse as one single curve.
 *
 * The ellipse is centered on [0, 0], with axes aligned with the coordinates.
 *
 * @category Drawing
 */
declare function drawSingleEllipse(majorRadius: number, minorRadius: number): Drawing;

/**
 * Creates the `Drawing` of a circle.
 *
 * The circle is centered on [0, 0]
 *
 * @category Drawing
 */
declare function drawCircle(radius: number): Drawing;

/**
 * Creates the `Drawing` of an ellipse.
 *
 * The ellipse is centered on [0, 0], with axes aligned with the coordinates.
 *
 * @category Drawing
 */
declare function drawEllipse(majorRadius: number, minorRadius: number): Drawing;

/**
 * Creates the `Drawing` of a polygon in a defined plane
 *
 * The sides of the polygon can be arcs of circle with a defined sagitta.
 * The radius defines the outer radius of the polygon without sagitta
 *
 * @category Drawing
 */
declare function drawPolysides(radius: number, sidesCount: number, sagitta?: number): Drawing;

/**
 * Creates the `Drawing` of a text, in a defined font size and a font family
 * (which will be the default).
 *
 * @category Drawing
 */
declare function drawText(text: string, { startX, startY, fontSize, fontFamily }?: {
    startX?: number | undefined;
    startY?: number | undefined;
    fontSize?: number | undefined;
    fontFamily?: string | undefined;
}): Drawing;

/**
 * Creates the `Drawing` by interpolating points as a curve
 *
 * The drawing will be a spline approximating the points. Note that the
 * degree should be at maximum 3 if you need to export the drawing as an SVG.
 *
 * @category Drawing
 */
declare const drawPointsInterpolation: (points: Point2D[], approximationConfig?: BSplineApproximationOptions, options?: {
    closeShape?: boolean;
}) => Drawing;

/**
 * Creates the `Drawing` of parametric function
 *
 * The drawing will be a spline approximating the function. Note that the
 * degree should be at maximum 3 if you need to export the drawing as an SVG.
 *
 * @category Drawing
 */
declare const drawParametricFunction: (func: (t: number) => Point2D, { pointsCount, start, stop, closeShape }?: {
    pointsCount?: number | undefined;
    start?: number | undefined;
    stop?: number | undefined;
    closeShape?: boolean | undefined;
}, approximationConfig?: BSplineApproximationOptions) => Drawing;

/**
 * Creates the `Drawing` of a projection of a shape on a plane.
 *
 * The projection is done by projecting the edges of the shape on the plane.
 *
 * @category Drawing
 */
declare function drawProjection(shape: AnyShape, projectionCamera?: ProjectionPlane | Camera): {
    visible: Drawing;
    hidden: Drawing;
};

/**
 * Creates the `Drawing` out of a face
 *
 * @category Drawing
 */
declare function drawFaceOutline(face: Face): Drawing;

/** Build a face from a sketch's closed planar wire. */
declare function sketchFace(sketch: Sketch): OrientedFace & PlanarFace;

/** Return an independent clone of the sketch's wire. */
declare function sketchWires(sketch: Sketch): Wire;

/**
 * Revolve a sketch around an axis to produce a solid of revolution.
 *
 * @remarks Consumes the sketch — calling twice throws on the second call.
 */
declare function sketchRevolve(sketch: Sketch, revolutionAxis?: PointInput, { origin }?: {
    origin?: PointInput;
}): Shape3D;

/**
 * Extrude a sketch to a given distance.
 *
 * Supports profile (taper) extrusion via `extrusionProfile`, twist extrusion
 * via `twistAngle`, and direction/origin overrides.
 *
 * @remarks Consumes the sketch — calling twice throws on the second call.
 */
declare function sketchExtrude(sketch: Sketch, extrusionDistance: number, { extrusionDirection, extrusionProfile, twistAngle, origin, }?: {
    extrusionDirection?: PointInput;
    extrusionProfile?: ExtrusionProfile;
    twistAngle?: number;
    origin?: PointInput;
}): Shape3D;

/**
 * Sweep a profile sketch (built by `sketchOnPlane`) along this sketch's wire path.
 *
 * @remarks Consumes both this sketch and the one returned by `sketchOnPlane` —
 * calling either twice throws on the second call.
 */
declare function sketchSweep(sketch: Sketch, sketchOnPlane: (plane: Plane, origin: Vec3) => SketchInterface, sweepConfig?: SweepOptions): Shape3D;

/**
 * Loft between this sketch and one or more other sketches.
 *
 * @remarks Consumes all input sketches — calling twice throws on the second call.
 */
declare function sketchLoft(sketch: Sketch, otherSketches: SketchInterface | SketchInterface[], loftConfig?: LoftOptions, returnShell?: boolean): Shape3D;

/** Build a face from a compound sketch (outer boundary with holes). */
declare function compoundSketchFace(sketch: CompoundSketch): OrientedFace & PlanarFace;

/**
 * Extrude a compound sketch (outer + holes) along the default or given direction.
 *
 * Supports twist and profile extrusions. For twist/profile modes each
 * sub-sketch is extruded as a shell, then capped into a solid.
 */
declare function compoundSketchExtrude(sketch: CompoundSketch, extrusionDistance: number, { extrusionDirection, extrusionProfile, twistAngle, origin, }?: {
    extrusionDirection?: PointInput;
    extrusionProfile?: ExtrusionProfile;
    twistAngle?: number;
    origin?: PointInput;
}): Shape3D;

/** Revolve a compound sketch (outer + holes) around an axis. */
declare function compoundSketchRevolve(sketch: CompoundSketch, revolutionAxis?: PointInput, { origin }?: {
    origin?: PointInput;
}): Shape3D;

/** Loft between two compound sketches with matching sub-sketch counts. */
declare function compoundSketchLoft(sketch: CompoundSketch, other: CompoundSketch, loftConfig?: LoftOptions): Shape3D;

/**
 * Sketch a drawing onto a 3D plane, producing a Sketch or Sketches.
 *
 * @param drawing - The 2D drawing to project.
 * @param inputPlane - Named plane or Plane object.
 * @param origin - Origin offset on the plane.
 * @returns A Sketch (single profile) or Sketches (multiple profiles).
 *
 * @see {@link Drawing.sketchOnPlane} for the OOP equivalent.
 */
declare function drawingToSketchOnPlane(drawing: Drawing, inputPlane?: PlaneName | Plane, origin?: PointInput | number): SketchInterface | Sketches;

/**
 * Fuse two drawings with a Boolean union.
 *
 * @param a - First drawing.
 * @param b - Second drawing to merge.
 * @returns A new Drawing containing the fused shape.
 *
 * @see {@link Drawing.fuse} for the OOP equivalent.
 */
declare function drawingFuse(a: Drawing, b: Drawing): Drawing;

/**
 * Cut one drawing from another with a Boolean subtraction.
 *
 * @param a - Base drawing.
 * @param b - Drawing to subtract.
 * @returns A new Drawing with `b` removed from `a`.
 *
 * @see {@link Drawing.cut} for the OOP equivalent.
 */
declare function drawingCut(a: Drawing, b: Drawing): Drawing;

/**
 * Intersect two drawings with a Boolean intersection.
 *
 * @param a - First drawing.
 * @param b - Second drawing.
 * @returns A new Drawing containing only the overlapping region.
 *
 * @see {@link Drawing.intersect} for the OOP equivalent.
 */
declare function drawingIntersect(a: Drawing, b: Drawing): Drawing;

/**
 * Fillet corners of a drawing.
 *
 * @param drawing - The drawing to modify.
 * @param radius - Fillet radius.
 * @param filter - Optional corner filter to select which corners to fillet.
 * @returns A new Drawing with filleted corners.
 *
 * @see {@link Drawing.fillet} for the OOP equivalent.
 */
declare function drawingFillet(drawing: Drawing, radius: number, filter?: (c: CornerFinderFn) => CornerFinderFn): Drawing;

/**
 * Chamfer corners of a drawing.
 *
 * @param drawing - The drawing to modify.
 * @param radius - Chamfer distance.
 * @param filter - Optional corner filter to select which corners to chamfer.
 * @returns A new Drawing with chamfered corners.
 *
 * @see {@link Drawing.chamfer} for the OOP equivalent.
 */
declare function drawingChamfer(drawing: Drawing, radius: number, filter?: (c: CornerFinderFn) => CornerFinderFn): Drawing;

/**
 * Translate a drawing by horizontal and vertical distances.
 *
 * @param drawing - The drawing to translate.
 * @param dx - Horizontal distance.
 * @param dy - Vertical distance.
 * @returns A new translated Drawing.
 *
 * @see {@link Drawing.translate} for the OOP equivalent.
 */
declare function translateDrawing(drawing: Drawing, dx: number, dy: number): Drawing;
/** Translate a drawing by a 2D vector. */
declare function translateDrawing(drawing: Drawing, vector: Point2D): Drawing;

/**
 * Rotate a drawing by an angle (in degrees) around an optional center point.
 *
 * @param drawing - The drawing to rotate.
 * @param angle - Rotation angle in degrees.
 * @param center - Optional center of rotation (defaults to origin).
 * @returns A new rotated Drawing.
 *
 * @see {@link Drawing.rotate} for the OOP equivalent.
 */
declare function rotateDrawing(drawing: Drawing, angle: number, center?: Point2D): Drawing;

/**
 * Uniformly scale a drawing by a factor around an optional center point.
 *
 * @param drawing - The drawing to scale.
 * @param factor - Scale factor.
 * @param center - Optional center of scaling (defaults to origin).
 * @returns A new scaled Drawing.
 *
 * @see {@link Drawing.scale} for the OOP equivalent.
 */
declare function scaleDrawing(drawing: Drawing, factor: number, center?: Point2D): Drawing;

/**
 * Mirror a drawing about a point or a line defined by direction and origin.
 *
 * @param drawing - The drawing to mirror.
 * @param centerOrDirection - Mirror center point or line direction.
 * @param origin - Origin point when mirroring about a line.
 * @param mode - `'center'` for point mirror, `'plane'` for line mirror.
 * @returns A new mirrored Drawing.
 *
 * @see {@link Drawing.mirror} for the OOP equivalent.
 */
declare function mirrorDrawing(drawing: Drawing, centerOrDirection: Point2D, origin?: Point2D, mode?: 'center' | 'plane'): Drawing;

/**
 * Load and register an OpenType/TrueType font for use with text drawing functions.
 *
 * The font is fetched (if a URL string) or parsed (if an ArrayBuffer) and
 * stored in an internal registry keyed by `fontFamily`. The first font loaded
 * is also registered as `'default'`.
 *
 * @param fontPath - URL string or raw ArrayBuffer of the font file.
 * @param fontFamily - Registry key for later retrieval (defaults to `'default'`).
 * @param force - If true, overwrite a previously loaded font with the same key.
 * @returns The parsed opentype.js Font object.
 */
declare function loadFont(fontPath: string | ArrayBuffer, fontFamily?: string, force?: boolean): Promise<Result<OpenTypeFont>>;

/**
 * Retrieve a previously loaded font by family name.
 *
 * @param fontFamily - Registry key (defaults to `'default'`).
 * @returns The opentype.js Font object, or `undefined` if not loaded.
 */
declare const getFont: (fontFamily?: string) => OpenTypeFont | undefined;

/**
 * Convert a text string into 2D Blueprints using a loaded font.
 *
 * Each glyph outline is traced as a series of line/bezier curves, then
 * organised into a {@link Blueprints} collection (outer contours + holes).
 *
 * @param text - The string to render.
 * @returns A Blueprints instance representing the text outlines.
 *
 * @remarks Requires a font to be loaded via {@link loadFont} before use.
 */
declare function textBlueprints(text: string, { startX, startY, fontSize, fontFamily }?: {
    startX?: number | undefined;
    startY?: number | undefined;
    fontSize?: number | undefined;
    fontFamily?: string | undefined;
}): Blueprints;

/**
 * Render text as 3D sketch outlines on a plane.
 *
 * Combines {@link textBlueprints} with `sketchOnPlane` to produce a
 * {@link Sketches} collection that can be extruded, revolved, etc.
 *
 * @param text - The string to render.
 * @param textConfig - Font size, family, and start position.
 * @param planeConfig - Plane name / origin to sketch on (defaults to XY at origin).
 * @returns A {@link Sketches} collection of the text outlines.
 *
 * @example
 * ```ts
 * await loadFont("/fonts/Roboto.ttf");
 * const textSketches = sketchText("Hello", { fontSize: 24 });
 * const solid = textSketches.extrude(2);
 * ```
 */
declare function sketchText(text: string, textConfig?: {
    startX?: number;
    startY?: number;
    fontSize?: number;
    fontFamily?: string;
}, planeConfig?: {
    plane?: PlaneName | Plane;
    origin?: PointInput | number;
}): Sketches;

interface TextMetricsResult {
    /** Total advance width of the text string. */
    width: number;
    /** Height from descender to ascender. */
    height: number;
    /** Distance from baseline to top of tallest glyph (positive). */
    ascender: number;
    /** Distance from baseline to bottom of lowest glyph (negative). */
    descender: number;
}

interface FontMetricsResult {
    /** Ascender in font units scaled to fontSize. */
    ascender: number;
    /** Descender in font units scaled to fontSize (negative). */
    descender: number;
    /** Units per em of the font. */
    unitsPerEm: number;
    /** Total line height (ascender - descender + line gap). */
    lineHeight: number;
}

/**
 * Measure the dimensions of a text string without generating geometry.
 *
 * Requires a font to be loaded via {@link loadFont} first.
 */
declare function textMetrics(text: string, options?: {
    fontSize?: number;
    fontFamily?: string;
}): Result<TextMetricsResult>;

/**
 * Retrieve font-level metrics without referencing specific text.
 *
 * Requires a font to be loaded via {@link loadFont} first.
 */
declare function fontMetrics(options?: {
    fontSize?: number;
    fontFamily?: string;
}): Result<FontMetricsResult>;

/** Named face of an axis-aligned bounding cube. */
type CubeFace = 'front' | 'back' | 'top' | 'bottom' | 'left' | 'right';

/** Named projection plane — axis pairs or cube face names. */
type ProjectionPlane = 'XY' | 'XZ' | 'YZ' | 'YX' | 'ZX' | 'ZY' | 'front' | 'back' | 'top' | 'bottom' | 'left' | 'right';

/** Type guard — check if a value is a valid {@link ProjectionPlane} name. */
declare function isProjectionPlane(plane: unknown): plane is ProjectionPlane;

/**
 * Project a 3D shape onto a 2D plane using hidden-line removal (HLR).
 *
 * @param camera - Camera defining the projection plane.
 * @param withHiddenLines - If `true`, also returns hidden (occluded) edges.
 * @returns Separate arrays of visible and hidden projected edges.
 */
declare function makeProjectedEdges(shape: AnyShape, camera: Camera, withHiddenLines?: boolean): {
    visible: Edge[];
    hidden: Edge[];
};

/**
 * Core type definitions for brepjs.
 * Vec3 tuples replace the old Vector class.
 * All operations on vectors are pure functions in vecOps.ts.
 */
/** 3D vector/point as a readonly tuple */
type Vec3 = readonly [number, number, number];

/** 2D point as a readonly tuple */
type Vec2 = readonly [number, number];

/**
 * Flexible point input — accepts various formats for convenience.
 * Use `toVec3()` to normalize to Vec3.
 */
type PointInput = Vec3 | Vec2 | readonly [number, number, number] | readonly [number, number];

/** Normalize any point input to Vec3 */
declare function toVec3(p: PointInput): Vec3;

/** Normalize to Vec2 (drops z) */
declare function toVec2(p: PointInput): Vec2;

/** Direction shorthand — a named axis (`'X'`, `'Y'`, `'Z'`) or an explicit {@link Vec3}. */
type Direction = Vec3 | 'X' | 'Y' | 'Z';

/**
 * Resolve a {@link Direction} shorthand to a unit {@link Vec3}.
 *
 * @throws If the string is not a recognised axis name.
 */
declare function resolveDirection(d: Direction): Vec3;

/** 4x4 affine transformation matrix in row-major order. Bottom row must be [0,0,0,1]. */
type Matrix4x4 = [Row4, Row4, Row4, Row4];

/** Structured matrix input: 3x3 linear part + translation vector. */
interface MatrixTransform {
    /** 3x3 linear part in row-major order: [r00, r01, r02, r10, r11, r12, r20, r21, r22]. */
    readonly linear: readonly [
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number
    ];
    /** Translation vector [tx, ty, tz]. */
    readonly translation: Vec3;
}

/** Input accepted by `applyMatrix`: either a raw 4x4 array or a structured object. */
type MatrixInput = Matrix4x4 | MatrixTransform;

/** Add two 3D vectors component-wise. */
declare function vecAdd(a: Vec3, b: Vec3): Vec3;

/** Subtract vector `b` from vector `a` component-wise. */
declare function vecSub(a: Vec3, b: Vec3): Vec3;

/** Multiply each component of a 3D vector by a scalar. */
declare function vecScale(v: Vec3, s: number): Vec3;

/** Negate all components of a 3D vector. */
declare function vecNegate(v: Vec3): Vec3;

/** Compute the dot product of two 3D vectors. */
declare function vecDot(a: Vec3, b: Vec3): number;

/** Compute the cross product of two 3D vectors. */
declare function vecCross(a: Vec3, b: Vec3): Vec3;

/** Compute the Euclidean length of a 3D vector. */
declare function vecLength(v: Vec3): number;

/** Compute the squared length of a 3D vector (avoids a sqrt). */
declare function vecLengthSq(v: Vec3): number;

/** Compute the Euclidean distance between two 3D points. */
declare function vecDistance(a: Vec3, b: Vec3): number;

/** Return a unit-length vector in the same direction, or `[0,0,0]` for near-zero input. */
declare function vecNormalize(v: Vec3): Vec3;

/**
 * Test whether two 3D vectors are approximately equal.
 *
 * @param tolerance - Per-component absolute tolerance.
 * @default tolerance `1e-5`
 */
declare function vecEquals(a: Vec3, b: Vec3, tolerance?: number): boolean;

/**
 * Test whether a 3D vector is approximately zero-length.
 *
 * @param tolerance - Length threshold below which the vector is considered zero.
 * @default tolerance `1e-10`
 */
declare function vecIsZero(v: Vec3, tolerance?: number): boolean;

/**
 * Compute the unsigned angle between two 3D vectors in **radians**.
 *
 * @returns Angle in `[0, PI]`, or `0` if either vector is zero-length.
 */
declare function vecAngle(a: Vec3, b: Vec3): number;

/** Project vector onto plane defined by its normal */
declare function vecProjectToPlane(v: Vec3, planeOrigin: Vec3, planeNormal: Vec3): Vec3;

/** Rotate vector around an axis by angle (radians) */
declare function vecRotate(v: Vec3, axis: Vec3, angleRad: number): Vec3;

/** Format a Vec3 as a human-readable string rounded to 3 decimal places. */
declare function vecRepr(v: Vec3): string;

/** Convert Vec3 to a kernel 3D vector. Caller must call .delete() when done. */
declare function toKernelVec(v: Vec3): KernelType;

/** Extract Vec3 from a kernel 3D vector */
declare function fromKernelVec(ocVec: KernelType): Vec3;

/** Extract Vec3 from a kernel 3D point */
declare function fromKernelPnt(ocPnt: KernelType): Vec3;

/** Extract Vec3 from a kernel 3D direction */
declare function fromKernelDir(ocDir: KernelType): Vec3;

/** Execute fn with a temporary kernel 3D vector, auto-deleted after. */
declare function withKernelVec<T>(v: Vec3, fn: (ocVec: KernelType) => T): T;

/** Execute fn with a temporary kernel 3D point, auto-deleted after. */
declare function withKernelPnt<T>(v: Vec3, fn: (ocPnt: KernelType) => T): T;

/** Execute fn with a temporary kernel 3D direction, auto-deleted after. */
declare function withKernelDir<T>(v: Vec3, fn: (ocDir: KernelType) => T): T;

/** Query the kernel for the topological type of a shape. */
declare function getShapeKind(shape: AnyShape<Dimension>): ShapeKind;

/** The geometric dimension a shape is embedded in. */
type Dimension = '2D' | '3D';

/**
 * Narrow an unknown-dimension shape to 3D.
 * All shapes from the kernel default to 3D embedding.
 * 2D shapes only exist when explicitly created via 2D API paths
 * that set the `__is2D` runtime marker on the handle.
 *
 * **Note**: Currently no production code path creates 2D-marked shapes.
 * This guard is provided for forward compatibility with future 2D API work.
 */
declare function is3D(s: AnyShape<Dimension>): s is AnyShape<'3D'>;

/**
 * Narrow an unknown-dimension shape to 2D.
 *
 * **Note**: Currently no production code path creates 2D-marked shapes.
 * This guard is provided for forward compatibility with future 2D API work.
 */
declare function is2D(s: AnyShape<Dimension>): s is AnyShape<'2D'>;

/**
 * Assert a shape is 3D. Throws at runtime if wrong.
 * Use when you know the shape is 3D but TypeScript doesn't.
 */
declare function as3D(s: AnyShape<Dimension>): AnyShape<'3D'>;

/**
 * Assert a shape is 2D. Throws at runtime if wrong.
 * Use when you know the shape is 2D but TypeScript doesn't.
 */
declare function as2D(s: AnyShape<Dimension>): AnyShape<'2D'>;

/**
 * A shell proven to be manifold (watertight, no dangling faces).
 * Obtained via `manifoldShell()` or `isManifoldShell()`.
 * Assignable to `Shell`.
 */
type ManifoldShell = Shell & {
    readonly [__manifold]: true;
};

/**
 * A solid proven to pass BRepCheck validation.
 * Obtained via `validSolid()` or `isValidSolid()`.
 * Assignable to `Solid`.
 */
type ValidSolid = Solid & {
    readonly [__valid]: true;
};

/**
 * Type guard — check if a shell is manifold (watertight, no dangling faces).
 * Checks kernel validity, then attempts `solidFromShell` — if the shell
 * can form a valid solid, it is manifold by definition.
 *
 * The temporary solid created for the proof is disposed immediately to avoid
 * WASM memory leaks.
 */
declare function isManifoldShell(shell: Shell): shell is ManifoldShell;

/**
 * Type guard — check if a solid passes BRepCheck validation.
 */
declare function isValidSolid(solid: Solid): solid is ValidSolid;

/**
 * Prove that a shell is manifold, returning a branded `ManifoldShell` on success.
 */
declare function manifoldShell(shell: Shell): Result<ManifoldShell, string>;

/**
 * Prove that a solid is valid, returning a branded `ValidSolid` on success.
 */
declare function validSolid(solid: Solid): Result<ValidSolid, string>;

/** Interface for kernel curve adaptors (BRepAdaptor_Curve / CompCurve). */
interface CurveLike {
    delete(): void;
    Value(v: number): KernelType;
    IsPeriodic(): boolean;
    Period(): number;
    IsClosed(): boolean;
    FirstParameter(): number;
    LastParameter(): number;
    GetType?(): any;
    D1(v: number, p: KernelType, vPrime: KernelType): void;
}

/** String discriminant identifying the topological type of a shape. */
type ShapeKind = 'vertex' | 'edge' | 'wire' | 'face' | 'shell' | 'solid' | 'compsolid' | 'compound';

/** A connected set of faces sharing edges. Always 3D. */
type Shell = ShapeHandle & {
    readonly [__brand]: 'shell';
    readonly [__dim]: '3D';
};

/** A closed volume bounded by shells. Always 3D. */
type Solid = ShapeHandle & {
    readonly [__brand]: 'solid';
    readonly [__dim]: '3D';
};

/** A set of solids connected by faces. Always 3D. */
type CompSolid = ShapeHandle & {
    readonly [__brand]: 'compsolid';
    readonly [__dim]: '3D';
};

/** 3D shapes (solid-like). Always 3D by definition. */
type Shape3D = Shell | Solid | CompSolid | Compound<'3D'>;

/** Any shape whose dimension is unknown (e.g., from file import). Requires narrowing. */
type UnknownDimShape = AnyShape<'2D'> | AnyShape<'3D'>;

/** Wrap a raw kernel shape as a branded {@link Shell} handle. */
declare function createShell(ocShape: KernelShape): Shell;

/** Wrap a raw kernel shape as a branded {@link Solid} handle. */
declare function createSolid(ocShape: KernelShape): Solid;

/** Type guard — check if a shape is a {@link Shell}. */
declare function isShell(s: AnyShape<Dimension>): s is Shell;

/** Type guard — check if a shape is a {@link Solid}. */
declare function isSolid(s: AnyShape<Dimension>): s is Solid;

/** Type guard — check if a shape is a 3D shape (shell, solid, compsolid, or 3D compound). */
declare function isShape3D(s: AnyShape<Dimension>): s is Shape3D;

/** Type-safe cast for shapes known to be 3D. */
declare function castShape3D(ocShape: KernelShape): AnyShape;

/**
 * Compile-time error message for dimension mismatches.
 * Resolves to a string literal type that appears in IDE diagnostics.
 *
 * @example
 * ```ts
 * // Consumer sees:
 * // Type '"❌ fuse: expected 3D, got 2D"' is not assignable to type 'Shape3D'.
 * ```
 */
type DimensionError<Op extends string, Expected extends string, Got extends string> = `❌ ${Op}: expected ${Expected}, got ${Got}`;

/**
 * A disposable handle to a 2D curve (Geom2d_Curve or similar).
 *
 * Created by 2D curve constructors (`line2d`, `circle2d`, etc.) and disposed
 * via `Symbol.dispose` / the `using` keyword.
 *
 * The `.raw` property accesses the underlying kernel handle for passing to
 * kernel methods. Throws if the handle has been disposed.
 */
interface Curve2DHandle extends Disposable {
    readonly [__curve2d]: true;
    /** The underlying kernel handle. Throws if disposed. */
    readonly raw: KernelType;
    /** Whether this handle has been disposed. */
    readonly disposed: boolean;
}

/** Immutable plane defined by origin and three orthogonal direction vectors. */
interface Plane {
    readonly origin: Vec3;
    readonly xDir: Vec3;
    readonly yDir: Vec3;
    readonly zDir: Vec3;
}

/**
 * Named standard planes.
 *
 * Axis pairs (`'XY'`, `'YZ'`, …) and view names (`'front'`, `'top'`, …)
 * are both supported. The axis-pair order determines the normal direction.
 */
type PlaneName = 'XY' | 'YZ' | 'ZX' | 'XZ' | 'YX' | 'ZY' | 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

/** Accept either an explicit {@link Plane} object or a {@link PlaneName} string. */
type PlaneInput = Plane | PlaneName;

/**
 * Invalidate cached topology data for a shape.
 * Call this after operations that modify a shape in-place (e.g., unifyFaces).
 */
declare function invalidateShapeCache(shape: AnyShape<Dimension>): void;

/**
 * Get all solids of a shape as branded Solid handles. Results are cached per shape.
 *
 * Booleans (`cut`/`fuse`/`fuseAll`), `chamfer`/`fillet`, and some sweeps return a
 * `Compound` wrapping the solid(s); use this to unwrap them without reaching into
 * the kernel. Returns `[]` for shapes with no solids (wires, bare faces, shells).
 */
declare function getSolids(shape: AnyShape<Dimension>): Solid[];

/** Get all shells of a shape as branded Shell handles. Results are cached per shape. */
declare function getShells(shape: AnyShape<Dimension>): Shell[];

/** Get all compsolids of a shape as branded CompSolid handles. Results are cached per shape. */
declare function getCompSolids(shape: AnyShape<Dimension>): CompSolid[];

/** Lazily iterate solids of a shape, yielding branded Solid handles one at a time. */
declare function iterSolids(shape: AnyShape<Dimension>): Generator<Solid>;

/** Lazily iterate shells of a shape, yielding branded Shell handles one at a time. */
declare function iterShells(shape: AnyShape<Dimension>): Generator<Shell>;

/** Lazily iterate compsolids of a shape, yielding branded CompSolid handles one at a time. */
declare function iterCompSolids(shape: AnyShape<Dimension>): Generator<CompSolid>;

/** Bounding box as a plain object. */
interface Bounds3D {
    readonly xMin: number;
    readonly xMax: number;
    readonly yMin: number;
    readonly yMax: number;
    readonly zMin: number;
    readonly zMax: number;
}

/** Get the axis-aligned bounding box of a shape. Cached per shape. */
declare function getBounds(shape: AnyShape<Dimension>): Bounds3D;

/** A summary of a shape's topology, geometry, and validity. */
interface ShapeDescription {
    readonly kind: ShapeKind;
    readonly faceCount: number;
    readonly edgeCount: number;
    readonly wireCount: number;
    readonly vertexCount: number;
    readonly valid: boolean;
    readonly bounds: Bounds3D;
}

/** Get the position of a vertex as a Vec3 tuple. */
declare function vertexPosition(vertex: Vertex): Vec3;

/**
 * Tag all faces of a shape with an opaque integer origin.
 * Consumers assign meaning (e.g., source line number).
 */
declare function setShapeOrigin(shape: AnyShape<Dimension>, origin: number): void;

/**
 * Get the face origin map for a shape (faceHash → originTag).
 * Returns undefined if no origins have been set or propagated.
 */
declare function getFaceOrigins(shape: AnyShape<Dimension>): Map<number, number> | undefined;

/** Get the topology hash code of a shape. */
declare function getHashCode(shape: AnyShape<Dimension>): number;

/** Check if two shapes are the same topological entity. */
declare function isSameShape(a: AnyShape<Dimension>, b: AnyShape<Dimension>): boolean;

/** Check if two shapes are geometrically equal. */
declare function isEqualShape(a: AnyShape<Dimension>, b: AnyShape<Dimension>): boolean;

/**
 * Tag selected faces with a string name.
 *
 * @param shape - The shape containing the faces.
 * @param selector - Array of faces, or a predicate function.
 * @param tag - The tag name to assign.
 * @returns The same shape (tags are stored externally).
 */
declare function tagFaces(shape: AnyShape<Dimension>, selector: Face<Dimension>[] | ((face: Face<Dimension>) => boolean), tag: string): AnyShape<Dimension>;

/**
 * Find all faces on a shape that have the given tag.
 *
 * Checks both direct tags and propagated origins (for faces that
 * survived boolean/modifier operations).
 */
declare function findFacesByTag(shape: AnyShape<Dimension>, tag: string): Face<Dimension>[];

/**
 * Get all tags and their associated faces on a shape.
 */
declare function getFaceTags(shape: AnyShape<Dimension>): Map<string, Face<Dimension>[]>;

/**
 * Store arbitrary metadata for a tag on a shape.
 */
declare function setTagMetadata(shape: AnyShape<Dimension>, tag: string, metadata: Record<string, unknown>): AnyShape<Dimension>;

/**
 * Retrieve metadata for a tag on a shape.
 */
declare function getTagMetadata(shape: AnyShape<Dimension>, tag: string): Record<string, unknown> | undefined;

/** RGBA color as 0-1 floats. */
type Color = [number, number, number, number];

/** Accepted color inputs: hex string, RGB tuple, or RGBA tuple. */
type ColorInput = string | [number, number, number] | [number, number, number, number];

/**
 * Get the whole-shape color, or undefined if none set.
 */
declare function getShapeColor(shape: AnyShape<Dimension>): Color | undefined;

/**
 * Get the color of a specific face, or undefined if none set.
 */
declare function getFaceColor(shape: AnyShape<Dimension>, face: Face<Dimension>): Color | undefined;

/**
 * Chamfer edges of a shape using distance + angle.
 *
 * The distance is measured along the face that contains the edge, and the
 * angle (in degrees) determines how the chamfer cuts into the adjacent face.
 *
 * @param shape   - The 3D shape to chamfer.
 * @param edges   - Edges to chamfer (must not be empty).
 * @param distance - Chamfer distance along the face (must be positive).
 * @param angleDeg - Chamfer angle in degrees (must be in range (0, 90)).
 * @returns Ok with the chamfered shape, or Err on invalid input or kernel failure.
 *
 * @remarks Uses `BRepFilletAPI_MakeChamfer.AddDA(dist, angle, edge, face)` internally.
 */
declare function chamferDistAngle(shape: Shape3D, edges: Edge[], distance: number, angleDeg: number): Result<Shape3D>;

/**
 * Get the geometric curve type of an edge or wire (LINE, CIRCLE, BSPLINE, etc.).
 */
declare function getCurveType(shape: Edge<Dimension> | Wire<Dimension>): CurveType;

/** Get the start point of a curve. */
declare function curveStartPoint(shape: Edge<Dimension> | Wire<Dimension>): Vec3;

/** Get the end point of a curve. */
declare function curveEndPoint(shape: Edge<Dimension> | Wire<Dimension>): Vec3;

/**
 * Get a point at a normalized parameter position on the curve.
 * @param shape - Edge or wire to evaluate.
 * @param position - Normalized parameter (0 = start, 0.5 = midpoint, 1 = end).
 */
declare function curvePointAt(shape: Edge<Dimension> | Wire<Dimension>, position?: number): Vec3;

/**
 * Get the tangent vector at a normalized parameter position on the curve.
 * @param shape - Edge or wire to evaluate.
 * @param position - Normalized parameter (0 = start, 0.5 = midpoint, 1 = end).
 */
declare function curveTangentAt(shape: Edge<Dimension> | Wire<Dimension>, position?: number): Vec3;

/** Get the arc length of an edge or wire. */
declare function curveLength(shape: Edge<Dimension> | Wire<Dimension>): number;

/**
 * Axis of a circular edge: the circle's center plus the unit normal of its
 * plane. Returns null for non-circular curves.
 *
 * Derived kernel-agnostically from three sampled points (the circumcenter of a
 * triangle determines the unique circle through its vertices), so it works for
 * full circles and arcs alike without an analytic circle accessor.
 */
declare function curveAxis(shape: Edge<Dimension> | Wire<Dimension>): {
    origin: Vec3;
    direction: Vec3;
} | null;

/** Check if the curve is closed. */
declare function curveIsClosed(shape: Edge<Dimension> | Wire<Dimension>): boolean;

/** Check if the curve is periodic. */
declare function curveIsPeriodic(shape: Edge<Dimension> | Wire<Dimension>): boolean;

/** Get the period of a periodic curve. */
declare function curvePeriod(shape: Edge<Dimension> | Wire<Dimension>): number;

/** Get the topological orientation of an edge or wire. */
declare function getOrientation(shape: Edge<Dimension> | Wire<Dimension>): 'forward' | 'backward';

/** Options for BSpline interpolation through points. */
interface InterpolateCurveOptions {
    /** If true, create a periodic (closed) BSpline. */
    periodic?: boolean;
    /** Fitting tolerance (default varies by kernel). */
    tolerance?: number;
}

/** Options for BSpline approximation through points. */
interface ApproximateCurveOptions {
    /** Maximum deviation from the input points. */
    tolerance?: number;
    /** Minimum BSpline degree. */
    degMin?: number;
    /** Maximum BSpline degree. */
    degMax?: number;
    /** Smoothing weights `[weight1, weight2, weight3]` or null to disable. */
    smoothing?: [number, number, number] | null;
}

/**
 * Interpolate a smooth BSpline curve that passes exactly through the given points.
 *
 * @param points - At least 2 points defining the curve path.
 * @param options - Interpolation options.
 * @returns An Edge representing the interpolated curve.
 */
declare function interpolateCurve(points: Vec3[], options?: InterpolateCurveOptions): Result<Edge>;

/**
 * Approximate a BSpline curve that passes near the given points.
 *
 * @param points - At least 2 points defining the curve path.
 * @param options - Approximation options.
 * @returns An Edge representing the approximated curve.
 */
declare function approximateCurve(points: Vec3[], options?: ApproximateCurveOptions): Result<Edge>;

/**
 * Offset a wire in 2D. Returns a new wire. Does NOT dispose the input.
 *
 * @param wire - The wire to offset.
 * @param offset - Offset distance (positive = outward, negative = inward).
 * @param kind - Join type for offset corners ('arc', 'intersection', or 'tangent').
 * @returns Ok with the offset wire, or Err if the operation fails.
 */
declare function offsetWire2D(wire: Wire<Dimension>, offset: number, kind?: 'arc' | 'intersection' | 'tangent' | 'chamfer'): Result<Wire>;

/**
 * Extract NURBS data from a BSpline or Bezier edge.
 * Returns null if the edge is not a NURBS curve (e.g., line, circle).
 */
declare function getNurbsCurveData(edge: Edge): NurbsCurveData | null;

/**
 * Shape evolution record — tracks how input faces map to result faces
 * through a kernel operation (boolean, transform, fillet, etc.).
 *
 * For each input face hash, `modified` contains the result face hashes it evolved into.
 * `generated` contains hashes of newly created faces (e.g., fillet rounds).
 * `deleted` lists hashes of faces that were removed entirely.
 */
interface ShapeEvolution {
    /** Map from input face hash → result face hashes it was modified into. */
    readonly modified: ReadonlyMap<number, readonly number[]>;
    /** Map from input face hash → newly generated face hashes (e.g., fillet surfaces). */
    readonly generated: ReadonlyMap<number, readonly number[]>;
    /** Set of input face hashes that were deleted by the operation. */
    readonly deleted: ReadonlySet<number>;
}

/** Diagnostic information from a boolean operation. */
interface BooleanDiagnostics {
    /** Whether the OCCT algorithm reported internal errors. */
    readonly hasErrors: boolean;
    /** Whether the OCCT algorithm reported warnings. */
    readonly hasWarnings: boolean;
    /**
     * Human-readable messages. Currently always empty — OCCT's message
     * reporting via Standard_OStream is not accessible in WASM builds.
     * Reserved for future use.
     */
    readonly messages: readonly string[];
}

/** Issue detected during boolean pre-validation. */
interface BooleanIssue {
    readonly operand: 'base' | 'tool';
    readonly issue: 'null-shape' | 'not-valid';
    readonly message: string;
}

/** Result of boolean pre-validation. */
interface CheckBooleanResult {
    readonly valid: boolean;
    readonly issues: readonly BooleanIssue[];
}

/** Boolean operation type for checkBoolean. */
type BooleanOpType = 'fuse' | 'cut' | 'intersect';

/** Read-only NURBS curve data. */
interface NurbsCurveData {
    readonly degree: number;
    readonly poles: ReadonlyArray<readonly [number, number, number]>;
    readonly weights: ReadonlyArray<number>;
    readonly knots: ReadonlyArray<number>;
    readonly multiplicities: ReadonlyArray<number>;
    readonly isPeriodic: boolean;
    readonly isRational: boolean;
}

/** Read-only NURBS surface data. */
interface NurbsSurfaceData {
    readonly degreeU: number;
    readonly degreeV: number;
    readonly nbPolesU: number;
    readonly nbPolesV: number;
    readonly poles: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>>;
    readonly weights: ReadonlyArray<ReadonlyArray<number>>;
    readonly knotsU: ReadonlyArray<number>;
    readonly knotsV: ReadonlyArray<number>;
    readonly multiplicitiesU: ReadonlyArray<number>;
    readonly multiplicitiesV: ReadonlyArray<number>;
    readonly isPeriodicU: boolean;
    readonly isPeriodicV: boolean;
    readonly isRational: boolean;
}

/**
 * Get the geometric surface type of a face.
 *
 * @returns Ok with the surface type, or Err for unrecognized kernel surface types.
 */
declare function getSurfaceType(face: Face): Result<SurfaceType>;

/** Get the surface type of a face (unwrapped convenience). */
declare function faceGeomType(face: Face): SurfaceType;

/** Get the topological orientation of a face. */
declare function faceOrientation(face: Face): 'forward' | 'backward';

/** Flip the orientation of a face. Returns a new face. */
declare function flipFaceOrientation(face: Face): Face;

/** UV parameter bounds of a face. */
interface UVBounds {
    readonly uMin: number;
    readonly uMax: number;
    readonly vMin: number;
    readonly vMax: number;
}

/** Get the UV parameter bounds of a face. */
declare function uvBounds(face: Face): UVBounds;

/**
 * Get a point on a face surface at normalized UV coordinates (0-1 range).
 *
 * @param face - The face to evaluate.
 * @param u - Normalized U parameter (0-1).
 * @param v - Normalized V parameter (0-1).
 */
declare function pointOnSurface(face: Face, u: number, v: number): Vec3;

/** Get the UV coordinates on a face for a given 3D point. */
declare function uvCoordinates(face: Face, point: PointInput): [number, number];

/** Result of projecting a point onto a face surface. */
interface PointProjectionResult {
    /** UV coordinates on the surface. */
    readonly uv: [number, number];
    /** The closest 3D point on the surface. */
    readonly point: Vec3;
    /** Distance from the input point to the projected point. */
    readonly distance: number;
}

/**
 * Project a 3D point onto a face surface.
 *
 * Returns the projected point, its UV coordinates, and the distance
 * from the original point to the surface.
 */
declare function projectPointOnFace(face: Face, point: PointInput): Result<PointProjectionResult>;

/** Get the surface normal at a point (or at the center if no point given). */
declare function normalAt(face: Face, locationPoint?: PointInput): Vec3;

/** Get the center of mass of a face. */
declare function faceCenter(face: Face): Vec3;

/**
 * Get a face's axis of symmetry — a point on the axis plus a unit direction —
 * for analytic faces that have one (e.g. a cylinder's axis). Returns null when
 * the face has no well-defined axis or the active kernel can't determine it.
 */
declare function faceAxis(face: Face): {
    origin: Vec3;
    direction: Vec3;
} | null;

/**
 * Classify a 3D point's position relative to a face boundary.
 * Projects the point onto the face's surface and classifies the UV result.
 *
 * @returns 'in' if inside, 'on' if on the boundary, 'out' if outside
 */
declare function classifyPointOnFace(face: Face, point: PointInput, tolerance?: number): 'in' | 'on' | 'out';

/** Triangle mesh data extracted from a shape, ready for GPU rendering. */
interface ShapeMesh {
    /** Triangle vertex indices (3 per triangle). */
    triangles: Uint32Array;
    /** Flat array of vertex positions (x,y,z interleaved). */
    vertices: Float32Array;
    /** Flat array of vertex normals (x,y,z interleaved). */
    normals: Float32Array;
    /** Flat array of UV coordinates (u,v interleaved), empty if not requested. */
    uvs: Float32Array;
    /** Per-face triangle index ranges for multi-material rendering. */
    faceGroups: {
        start: number;
        count: number;
        faceId: number;
        origin: number;
    }[];
}

/** Line segment mesh data for edge rendering (wireframe). */
interface EdgeMesh {
    /** Flat array of line vertex positions (x,y,z interleaved, 2 vertices per segment). */
    lines: Float32Array;
    /** Per-edge line segment index ranges for highlighting individual edges. */
    edgeGroups: {
        start: number;
        count: number;
        edgeId: number;
    }[];
}

/** Shared options for meshing operations. */
interface MeshOptions {
    /** Linear deflection tolerance. Smaller = finer mesh. Defaults to the active quality level. */
    tolerance?: number;
    /** Angular deflection tolerance in radians. Smaller = finer mesh on curved surfaces. Defaults to the active quality level. */
    angularTolerance?: number;
    /** Abort signal to cancel mesh generation between face iterations. */
    signal?: AbortSignal;
}

declare function exportSTEP(shape: AnyShape<Dimension>): Result<Blob>;

/**
 * Export a shape as an STL file Blob.
 *
 * @returns Ok with a Blob (MIME type `application/sla`), or Err on failure.
 */
declare function exportSTL(shape: AnyShape<Dimension>, opts?: MeshOptions & {
    binary?: boolean;
}): Result<Blob>;

/**
 * Export a shape as an IGES file Blob.
 *
 * @returns Ok with a Blob (MIME type `application/iges`), or Err on failure.
 */
declare function exportIGES(shape: AnyShape<Dimension>): Result<Blob>;

interface MultiLODMesh {
    readonly coarse: ShapeMesh;
    readonly fine: ShapeMesh;
}

/**
 * Produce coarse (preview) + fine (export) meshes for a shape.
 *
 * Coarse mesh uses high tolerance for fast preview rendering.
 * Fine mesh uses low tolerance for export quality.
 */
declare function meshMultiLOD(shape: AnyShape<Dimension>, options?: {
    readonly coarseTolerance?: number | undefined;
    readonly fineTolerance?: number | undefined;
    readonly angularTolerance?: number | undefined;
}): MultiLODMesh;

/**
 * Clear all mesh caches. Call this after modifying shapes to avoid stale results.
 */
declare function clearMeshCache(): void;

/**
 * An isolated mesh cache context for per-viewer or per-worker use.
 *
 * Provides the same get/set interface as the global cache but with
 * independent state, so multiple viewers can cache independently.
 */
interface MeshCacheContext {
    getMesh(shape: KernelShape, key: string): ShapeMesh | undefined;
    setMesh(shape: KernelShape, key: string, value: ShapeMesh): void;
    getEdgeMesh(shape: KernelShape, key: string): EdgeMesh | undefined;
    setEdgeMesh(shape: KernelShape, key: string, value: EdgeMesh): void;
    clear(): void;
}

/** Create an isolated mesh cache that doesn't share state with the global cache. */
declare function createMeshCache(): MeshCacheContext;

/** Data ready to be used with THREE.BufferGeometry. */
interface BufferGeometryData {
    /** Flat float array of vertex positions (x,y,z interleaved). */
    position: Float32Array;
    /** Flat float array of vertex normals (x,y,z interleaved). */
    normal: Float32Array;
    /** Triangle index array (3 indices per triangle). */
    index: Uint32Array;
}

/** Line segment data ready for THREE.LineSegments or THREE.Line. */
interface LineGeometryData {
    /** Flat float array of line vertex positions (x,y,z interleaved). */
    position: Float32Array;
}

/**
 * Convert a ShapeMesh into BufferGeometry-compatible typed arrays.
 *
 * The returned arrays can be used directly with Three.js:
 * ```ts
 * const geo = new THREE.BufferGeometry();
 * geo.setAttribute('position', new THREE.BufferAttribute(data.position, 3));
 * geo.setAttribute('normal', new THREE.BufferAttribute(data.normal, 3));
 * geo.setIndex(new THREE.BufferAttribute(data.index, 1));
 * ```
 */
declare function toBufferGeometryData(mesh: ShapeMesh): BufferGeometryData;

/** A material group entry compatible with THREE.BufferGeometry.addGroup(). */
interface BufferGeometryGroup {
    /** Start index in the triangle index buffer. */
    readonly start: number;
    /** Number of indices in this group. */
    readonly count: number;
    /** Sequential material index (0-based). */
    readonly materialIndex: number;
    /** Face topology ID for correlation with the shape's face. */
    readonly faceId: number;
}

/**
 * Convert a ShapeMesh into grouped BufferGeometry data with face material groups.
 *
 * Each face becomes a separate group, allowing per-face materials in Three.js:
 * ```ts
 * const data = toGroupedBufferGeometryData(mesh);
 * const geo = new THREE.BufferGeometry();
 * geo.setAttribute('position', new THREE.BufferAttribute(data.position, 3));
 * geo.setAttribute('normal', new THREE.BufferAttribute(data.normal, 3));
 * geo.setIndex(new THREE.BufferAttribute(data.index, 1));
 * for (const g of data.groups) {
 *   geo.addGroup(g.start, g.count, g.materialIndex);
 * }
 * ```
 */
declare function toGroupedBufferGeometryData(mesh: ShapeMesh): GroupedBufferGeometryData;

/**
 * Convert an EdgeMesh into position data for THREE.LineSegments.
 *
 * ```ts
 * const geo = new THREE.BufferGeometry();
 * geo.setAttribute('position', new THREE.BufferAttribute(data.position, 3));
 * const lines = new THREE.LineSegments(geo, material);
 * ```
 */
declare function toLineGeometryData(mesh: EdgeMesh): LineGeometryData;

/** LOD-ready geometry data for Three.js LOD class. */
interface LODGeometryData {
    readonly coarse: BufferGeometryData;
    readonly fine: BufferGeometryData;
    /** Camera distance at which to switch to coarse geometry. */
    readonly coarseDistance: number;
    /** Camera distance at which to show fine geometry (typically 0). */
    readonly fineDistance: number;
}

/**
 * Convert a multi-LOD mesh into Three.js LOD-compatible geometry data.
 *
 * @example
 * ```ts
 * const lod = new THREE.LOD();
 * const data = toLODGeometryData(meshMultiLOD(shape));
 * lod.addLevel(new THREE.Mesh(toBufferGeometry(data.fine), mat), data.fineDistance);
 * lod.addLevel(new THREE.Mesh(toBufferGeometry(data.coarse), mat), data.coarseDistance);
 * ```
 */
declare function toLODGeometryData(multiLOD: MultiLODMesh, distances?: {
    readonly coarse?: number | undefined;
    readonly fine?: number | undefined;
}): LODGeometryData;

/** Options shared by all boolean and compound operations. */
interface BooleanOptions {
    /** Glue algorithm hint for faces shared between operands. */
    optimisation?: 'none' | 'commonFace' | 'sameFace';
    /** Merge same-domain faces/edges after the boolean. */
    simplify?: boolean;
    /** Algorithm selection: 'native' uses N-way BRepAlgoAPI_BuilderAlgo; 'pairwise' uses recursive divide-and-conquer. */
    strategy?: 'native' | 'pairwise';
    /** Abort signal to cancel long-running operations between steps. */
    signal?: AbortSignal;
    /**
     * Fuzzy tolerance for boolean operations. When set to a small positive value
     * (e.g., 1e-5), OCCT merges nearly-coincident vertices and edges early,
     * reducing intersection computation. Useful for 3D printing workflows where
     * sub-micron precision is not needed. Default: 0 (exact geometry).
     */
    fuzzyValue?: number | undefined;
    /**
     * When true, accepts any Shape3D (shells, compounds) without requiring
     * ValidSolid branding. This is a type-level escape hatch only — no runtime
     * effect.
     */
    unsafe?: boolean;
    /**
     * When false, skips face evolution tracking (hash collection, Modified/Generated/Deleted
     * queries, metadata propagation). This is a performance optimization for intermediate
     * boolean operations where face tags/colors are not needed. Defaults to `true`.
     */
    trackEvolution?: boolean | undefined;
}

type PipelineOp = 'fuse' | 'cut' | 'intersect';

interface BooleanPipelineStep {
    readonly op: PipelineOp;
    readonly tool: Shape3D;
}

/**
 * Execute a chained boolean pipeline in a single WASM call.
 *
 * More efficient than sequential fuse/cut calls for long chains (e.g., 16-step
 * spiral staircase). Skips UnifySameDomain on intermediate results — only
 * simplifies the final shape.
 *
 * Falls back to sequential operations when the C++ pipeline class is not
 * available in the WASM build.
 */
declare function booleanPipeline(base: Shape3D, steps: readonly BooleanPipelineStep[], options?: {
    readonly optimisation?: 'none' | 'commonFace' | 'sameFace' | undefined;
}): Result<Shape3D>;

interface BatchBisectTelemetry {
    /** Number of inputs the caller passed (tools for cut, shapes for fuse). */
    readonly totalInputs: number;
    /** N-way kernel batch (`cutAll` / `fuseAll`) attempts, including failures. */
    readonly batchAttempts: number;
    /** N-way kernel batch attempts that succeeded. */
    readonly batchSucceeded: number;
    /**
     * 2-input pairwise kernel call attempts after bisection bottomed out. For
     * `cutAllBisect` this counts singleton `cut(base, tool)` calls; for
     * `fuseAllBisect` this counts the `fuse(a, b)` calls that combine the
     * results of two recursive halves. Both flavors mean "the kernel did a
     * pair op, not a batch op."
     */
    readonly singletonFallbacks: number;
    /**
     * Sorted, deduplicated input indices that failed even as pairwise ops and
     * were dropped from the result. Multi-level fuse failures can target the
     * same index from different recursion levels — dedup happens at freeze.
     */
    readonly failedInputs: readonly number[];
}

declare function cutAllBisect(base: ValidSolid, tools: ValidSolid[], options?: BooleanOptions): Result<BatchBisectResult<ValidSolid>>;
declare function cutAllBisect(base: Shape3D, tools: Shape3D[], options: BooleanOptions & {
    unsafe: true;
}): Result<BatchBisectResult>;

declare function fuseAllBisect(shapes: ValidSolid[], options?: BooleanOptions): Result<BatchBisectResult<ValidSolid>>;
declare function fuseAllBisect(shapes: Shape3D[], options: BooleanOptions & {
    unsafe: true;
}): Result<BatchBisectResult>;

/**
 * Pre-validate operands before a boolean operation.
 *
 * Checks that both shapes are non-null and topologically valid.
 * Returns a structured report of any issues found.
 *
 * @example
 * ```typescript
 * const check = checkBoolean(base, tool, 'fuse');
 * if (!check.valid) {
 *   console.warn('Boolean will likely fail:', check.issues);
 * }
 * ```
 */
declare function checkBoolean(base: Shape3D, tool: Shape3D, op: BooleanOpType): CheckBooleanResult;

/** Result of an operation with face evolution tracking. */
interface EvolutionResult<T> {
    readonly shape: T;
    readonly evolution: ShapeEvolution;
}

/**
 * Fuse two 3D shapes together (boolean union), returning both the result
 * shape and the face evolution data.
 *
 * @param a - The first operand.
 * @param b - The second operand.
 * @param options - Boolean operation options.
 * @returns Ok with the fused shape and evolution, or Err on failure.
 */
declare function fuseWithEvolution(a: ValidSolid, b: ValidSolid, options?: BooleanOptions): Result<EvolutionResult<ValidSolid>>;
declare function fuseWithEvolution(a: Shape3D, b: Shape3D, options?: BooleanOptions): Result<EvolutionResult<Shape3D>>;

/**
 * Cut a tool shape from a base shape (boolean subtraction), returning both
 * the result shape and the face evolution data.
 *
 * @param base - The shape to cut from.
 * @param tool - The shape to subtract.
 * @param options - Boolean operation options.
 * @returns Ok with the cut shape and evolution, or Err on failure.
 */
declare function cutWithEvolution(base: ValidSolid, tool: ValidSolid, options?: BooleanOptions): Result<EvolutionResult<ValidSolid>>;
declare function cutWithEvolution(base: Shape3D, tool: Shape3D, options?: BooleanOptions): Result<EvolutionResult<Shape3D>>;

/**
 * Compute the intersection of two shapes (boolean common), returning both
 * the result shape and the face evolution data.
 *
 * @param a - The first operand.
 * @param b - The second operand.
 * @param options - Boolean operation options.
 * @returns Ok with the intersection and evolution, or Err on failure.
 */
declare function intersectWithEvolution(a: ValidSolid, b: ValidSolid, options?: BooleanOptions): Result<EvolutionResult<ValidSolid>>;
declare function intersectWithEvolution(a: Shape3D, b: Shape3D, options?: BooleanOptions): Result<EvolutionResult<Shape3D>>;

/**
 * Apply a fillet (rounded edge) to selected edges, returning both
 * the result shape and the face evolution data.
 *
 * @param shape - The shape to modify.
 * @param edges - Edges to fillet. Pass `undefined` to fillet all edges.
 * @param radius - Constant radius, variable radius `[r1, r2]`, or per-edge callback.
 */
declare function filletWithEvolution(shape: ValidSolid, edges: ReadonlyArray<Edge> | undefined, radius: number | [number, number] | ((edge: Edge) => number | [number, number] | null)): Result<EvolutionResult<ValidSolid>>;

/**
 * Apply a chamfer (beveled edge) to selected edges, returning both
 * the result shape and the face evolution data.
 *
 * @param shape - The shape to modify.
 * @param edges - Edges to chamfer. Pass `undefined` to chamfer all edges.
 * @param distance - Symmetric distance, asymmetric `[d1, d2]`, or per-edge callback.
 */
declare function chamferWithEvolution(shape: ValidSolid, edges: ReadonlyArray<Edge> | undefined, distance: number | [number, number] | ((edge: Edge) => number | [number, number] | null)): Result<EvolutionResult<ValidSolid>>;

/**
 * Create a hollow shell by removing faces and offsetting remaining walls,
 * returning both the result shape and the face evolution data.
 *
 * @param shape - The solid to hollow out.
 * @param faces - Faces to remove.
 * @param thickness - Wall thickness.
 * @param tolerance - Shell operation tolerance (default 1e-3).
 */
declare function shellWithEvolution(shape: ValidSolid, faces: ReadonlyArray<Face>, thickness: number, tolerance?: number): Result<EvolutionResult<Shape3D>>;

/** Geometric snapshot of a face, used for fallback matching when hashes change. */
interface GeometricHint {
    readonly entityType: 'face';
    readonly surfaceType?: SurfaceType;
    readonly normal?: Vec3;
    readonly centroid?: Vec3;
    readonly area?: number | undefined;
}

/**
 * A stable reference to a face, combining a role-based name with a geometric hint.
 * Survives parametric replay even when face hashes change.
 */
interface ShapeRef {
    /** Generic command/step identifier (e.g., 'step_0', 'box_1'). */
    readonly origin: string;
    /** Role name within the origin (e.g., 'box:top', 'fillet:round_0'). */
    readonly role: string;
    /** Geometric snapshot for fallback matching. */
    readonly hint: GeometricHint;
}

/**
 * Immutable table mapping `origin -> role -> faceHash`.
 * Updated through evolution records when the model is rebuilt.
 */
type RoleTable = ReadonlyMap<string, ReadonlyMap<string, number>>;

/** A successfully resolved face reference. */
interface ResolvedRef {
    readonly face: Face;
    readonly confidence: 'exact' | 'geometric-fallback';
}

/** A face reference that could not be resolved. */
interface BrokenRef {
    readonly ref: ShapeRef;
    readonly reason: 'deleted' | 'ambiguous' | 'not-found';
    readonly candidates?: readonly Face[];
}

/** Scoring function: higher score = better match. Returns -Infinity to reject. */
type FaceScorer = (hint: GeometricHint, face: Face) => number;

/**
 * Default face scorer combining surface type, normal alignment, centroid proximity,
 * and area similarity.
 *
 * Scoring breakdown:
 * - Surface type match: +1.0 (mismatch when both defined: -Infinity)
 * - Normal dot product: weighted contribution (rejected if < 0.707)
 * - Centroid distance: quadratic penalty (rejected if distSq > 100)
 * - Area ratio: penalized if |log(hintArea / faceArea)| > 1.0
 */
declare function defaultScorer(hint: GeometricHint, face: Face): number;

/** Snapshot the geometric properties of a face for later matching. */
declare function captureHint(face: Face): GeometricHint;

/**
 * Auto-assign role names to the faces of a shape based on operation type.
 *
 * For 'box': uses face normals to assign cardinal names
 * ('box:top', 'box:bottom', 'box:front', 'box:back', 'box:left', 'box:right').
 * **Note:** Box role detection assumes axis-aligned faces (normal within 0.9 of
 * a cardinal axis). Rotated boxes may receive fewer than 6 named roles; remaining
 * faces fall through to sequential naming.
 *
 * For other types: sequential naming ('opType:face_0', 'opType:face_1', ...).
 *
 * @returns Map from role name to face hash code
 */
declare function assignRoles(shape: Shape3D, operationType: string): Map<string, number>;

/** Create a ShapeRef from an origin ID, role name, and face. */
declare function createRef(origin: string, role: string, face: Face): ShapeRef;

/**
 * Propagate a role table through a ShapeEvolution record.
 * Returns a new RoleTable with hashes updated according to the evolution.
 *
 * - Deleted faces: role removed
 * - Modified faces: hash updated to first result hash
 * - Unchanged faces: hash preserved
 *
 * **Limitation:** When a face splits (1→many in `evolution.modified`), only the
 * first successor hash is tracked. The geometric fallback in `resolveRef` handles
 * cases where this picks the "wrong" successor. A future version may return
 * multi-hash mappings for split-aware resolution.
 */
declare function updateRoles(roles: RoleTable, origin: string, evolution: ShapeEvolution): RoleTable;

/**
 * Resolve a ShapeRef to a face in the current shape.
 *
 * Resolution strategy:
 * 1. Exact lookup via role table hash match
 * 2. Geometric fallback using scorer against all faces
 * 3. Ambiguous if multiple faces score within threshold
 * 4. Not-found if no match above minimum score
 */
declare function resolveRef(ref: ShapeRef, roles: RoleTable, currentShape: Shape3D, scorer?: FaceScorer): ResolvedRef | BrokenRef;

interface SurfaceFromGridOptions {
    /** Physical width in X direction. Default: number of columns - 1. */
    width?: number;
    /** Physical depth in Y direction. Default: number of rows - 1. */
    depth?: number;
    /** Scale factor for Z values. Default: 1. */
    scaleZ?: number;
}

/**
 * Create a B-spline surface (or triangulated shell) from a 2D grid of height values.
 *
 * The grid is interpreted as Z heights at evenly spaced (X, Y) positions.
 * Row index maps to Y, column index maps to X.
 *
 * @param heights - 2D array of Z values, at least 2x2
 * @param options - Physical dimensions and Z scaling
 * @returns Result containing the surface shape (may be a Face or Shell depending on grid complexity)
 */
declare function surfaceFromGrid(heights: ReadonlyArray<ReadonlyArray<number>>, options?: SurfaceFromGridOptions): Result<AnyShape>;

/**
 * Create a surface from an image blob by interpreting pixel brightness as height.
 * Requires `createImageBitmap` and `OffscreenCanvas` (available in browsers and
 * some worker environments; not available in Node.js).
 *
 * @param blob - Image data as a Blob
 * @param options - Channel selection, downsampling, and grid options
 * @returns A Result containing the surface shape
 */
declare function surfaceFromImage(blob: Blob, options?: SurfaceFromImageOptions): Promise<Result<AnyShape>>;

interface HullOptions {
    /** Meshing / sewing tolerance (default: 0.1). */
    tolerance?: number;
}

/**
 * Compute the 3D convex hull of one or more shapes.
 *
 * Returns the tightest convex solid enclosing all input geometry.
 *
 * @param shapes - One or more 3D shapes to hull.
 * @param options - Optional tolerance settings.
 */
declare function hull(shapes: ReadonlyArray<AnyShape<Dimension>>, options?: HullOptions): Result<Solid>;

/**
 * Compute the 3D convex hull of a point cloud.
 *
 * Returns the tightest convex solid enclosing all given points.
 * At least 4 non-coplanar points are required to form a solid.
 *
 * @param points - Array of 3D coordinates.
 * @returns `Result<Solid>` — the convex hull solid, or an error.
 *
 * @example
 * ```ts
 * const solid = unwrap(convexHull([
 *   [0, 0, 0], [10, 0, 0], [0, 10, 0], [0, 0, 10],
 * ]));
 * ```
 */
declare function convexHull(points: ReadonlyArray<Vec3>): Result<Solid>;

/** Options for the minkowski sum operation. */
interface MinkowskiOptions {
    /** Tolerance for geometric operations (default: 1e-6). */
    tolerance?: number;
}

/**
 * Approximate the Minkowski sum of two 3D shapes.
 *
 * When the tool is a sphere, uses the fast offset-shell path.
 * Otherwise, uses vertex placement + edge sweep + boolean fuse.
 *
 * @param shape - The base shape.
 * @param tool - The tool shape (structuring element).
 * @param options - Operation options.
 * @returns Ok with the resulting solid, or Err on failure.
 */
declare function minkowski(shape: Shape3D, tool: Shape3D, options?: MinkowskiOptions): Result<Solid>;

interface PolyhedronOptions {
    tolerance?: number;
}

declare function polyhedron(points: ReadonlyArray<Vec3>, faces: ReadonlyArray<ReadonlyArray<number>>, options?: PolyhedronOptions): Result<Solid>;

/**
 * Position a shape at a point along a spine curve with Frenet frame orientation.
 *
 * The shape is translated and rotated so its origin aligns with the curve point
 * and its Z axis aligns with the curve tangent at the given parameter.
 *
 * @param shape - The shape to position.
 * @param spine - The spine curve (Edge or Wire) to position along.
 * @param param - Normalized parameter (0 = start, 1 = end).
 * @returns The repositioned shape.
 */
declare function positionOnCurve(shape: Shape3D, spine: Edge | Wire, param: number): Result<Shape3D>;

/** Specification for a radius point along a variable-radius fillet. */
interface VariableFilletRadius {
    readonly param: number;
    readonly radius: number;
}

/**
 * Apply a variable-radius fillet to an edge.
 *
 * The radius varies along the edge according to the provided spec points.
 * Each point specifies a normalized parameter (0 = start, 1 = end) and radius.
 *
 * **Cross-kernel note:** Only brepkit supports variable-radius fillet.
 * Returns UNSUPPORTED_CAPABILITY error on OCCT.
 */
declare function variableFillet(shape: ValidSolid, edge: Edge, radii: ReadonlyArray<VariableFilletRadius>): Result<ValidSolid>;

/**
 * Attempt to heal/fix a solid shape.
 *
 * Uses ShapeFix_Solid to repair topology issues like gaps, wrong orientation, etc.
 */
declare function healSolid(solid: Solid): Result<ValidSolid>;

/** Diagnostic for a single healing step. */
interface HealingStepDiagnostic {
    readonly name: string;
    readonly attempted: boolean;
    readonly succeeded: boolean;
    readonly detail?: string;
}

/** Options for autoHeal. All default to true. */
interface AutoHealOptions {
    /** Fix wire issues (gaps, connectivity). Default: true. */
    fixWires?: boolean;
    /** Fix face issues (orientation, geometry). Default: true. */
    fixFaces?: boolean;
    /** Fix solid issues (shell gaps, orientation). Default: true. */
    fixSolids?: boolean;
    /** Tolerance for sewing. If provided, applies sewing as a healing step. */
    sewTolerance?: number;
    /** Fix self-intersections in wires. Default: false. */
    fixSelfIntersection?: boolean;
}

/** Report of what the auto-heal pipeline did. */
interface HealingReport {
    readonly isValid: boolean;
    /** True when the shape was already valid before healing was attempted. */
    readonly alreadyValid: boolean;
    readonly wiresHealed: number;
    readonly facesHealed: number;
    readonly solidHealed: boolean;
    readonly steps: ReadonlyArray<string>;
    readonly diagnostics: ReadonlyArray<HealingStepDiagnostic>;
}

/**
 * Automatically heal a shape using the appropriate shape-level fixer.
 *
 * If the shape is already valid, returns it unchanged with a no-op report.
 * Uses ShapeFix_Solid/Face/Wire depending on shape type, which internally
 * handles sub-shape healing and reconstruction.
 */
declare function autoHeal(shape: AnyShape<Dimension>, options?: AutoHealOptions): Result<{
    shape: AnyShape<Dimension>;
    report: HealingReport;
}>;

/**
 * Convert a closed shell into a solid.
 *
 * The shell must be closed (all faces share edges) for the conversion to succeed.
 */
declare function solidFromShell(shell: AnyShape): Result<ValidSolid>;

/**
 * Fix self-intersections in a wire.
 *
 * Uses ShapeFix_Wire to detect and repair self-intersecting edges.
 */
declare function fixSelfIntersection(wire: Wire): Result<Wire>;

/** Configuration for sweep/pipe operations along a spine. */
interface SweepOptions {
    /** Use Frenet trihedron for profile orientation */
    frenet?: boolean;
    /** Auxiliary spine for twist control */
    auxiliarySpine?: {
        wrapped: KernelType;
    };
    /** Scaling law along the path */
    law?: KernelType;
    /** Transition mode at corners: 'right' (sharp), 'transformed', or 'round' */
    transitionMode?: 'right' | 'transformed' | 'round';
    /** Enable contact detection */
    withContact?: boolean;
    /** Support surface for constrained sweeps */
    support?: KernelType;
    /** Force profile to be orthogonal to spine */
    forceProfileSpineOthogonality?: boolean;
    /**
     * Use BRepOffsetAPI_MakePipe (simple pipe) instead of MakePipeShell.
     * Much faster for constant cross-section profiles, especially rotationally
     * symmetric ones (circles, regular polygons) where orientation doesn't matter.
     * Incompatible with frenet, auxiliarySpine, law, and support options.
     */
    mode?: 'general' | 'simple';
    /** 3D approximation tolerance for MakePipeShell (default: kernel default ~1e-7). */
    tolerance?: number;
    /** Boundary tolerance for MakePipeShell. Defaults to `tolerance` if set. */
    boundTolerance?: number;
    /** Angular tolerance in radians for MakePipeShell. */
    angularTolerance?: number;
    /** Maximum B-spline degree for pipe surface approximation. */
    maxDegree?: number;
    /** Maximum number of approximation segments. */
    maxSegments?: number;
}

/** Configuration for extrusion profile scaling along the path. */
interface ExtrusionProfile {
    /** Profile curve type: 's-curve' for smooth easing, 'linear' for constant scaling */
    profile?: 's-curve' | 'linear';
    /** End scale factor (1 = same size, 0.5 = half size at end) */
    endFactor?: number;
}

/**
 * Sweep a wire profile along a spine wire to create a 3D shape.
 *
 * Supports Frenet framing, auxiliary spine twist, scaling laws, contact
 * detection, and configurable corner transition modes.
 *
 * @param wire - The profile wire to sweep (must be closed for solid output).
 * @param spine - The path wire to sweep along.
 * @param config - Sweep configuration (frenet, transition mode, scaling law, etc.).
 * @param shellMode - When `true`, return `[shell, startWire, endWire]` instead of a solid.
 * @returns `Result` containing either a solid or a `[Shape3D, Wire, Wire]` tuple in shell mode.
 */
declare function sweep(wire: ClosedWire<Dimension>, spine: Wire<Dimension>, config?: SweepOptions, shellMode?: boolean): Result<Shape3D | [Shape3D, Wire, Wire]>;

/**
 * Extrude a wire along a normal constrained to a support surface.
 *
 * Constructs a linear spine from `center` to `center + normal` and sweeps
 * the profile wire along it, constrained by the support surface geometry.
 *
 * @param wire - The profile wire to sweep (must be closed).
 * @param center - Start point of the extrusion spine.
 * @param normal - Direction and length of the extrusion.
 * @param support - kernel support surface that constrains the sweep.
 * @returns `Result` containing the swept 3D shape.
 */
declare function supportExtrude(wire: ClosedWire<Dimension>, center: Vec3, normal: Vec3, support: KernelType): Result<Shape3D>;

/**
 * Extrude a wire along a normal with optional profile scaling.
 *
 * Builds a linear spine from `center` to `center + normal` and sweeps the
 * profile wire. When `profileShape` is provided, a scaling law (s-curve or
 * linear) modulates the cross-section size along the path.
 *
 * @param wire - The profile wire to sweep (must be closed).
 * @param center - Start point of the extrusion spine.
 * @param normal - Direction and length of the extrusion. Must be non-zero.
 * @param profileShape - Optional scaling profile applied along the extrusion.
 * @param shellMode - When `true`, return `[shell, startWire, endWire]` instead of a solid.
 * @returns `Result` containing the extruded shape or a shell tuple.
 */
declare function complexExtrude(wire: ClosedWire<Dimension>, center: Vec3, normal: Vec3, profileShape?: ExtrusionProfile, shellMode?: boolean): Result<Shape3D | [Shape3D, Wire, Wire]>;

/**
 * Extrude a wire along a normal with helical twist and optional profile scaling.
 *
 * Constructs a helical auxiliary spine that rotates the profile by
 * `angleDegrees` over the extrusion length. Combines twist with optional
 * s-curve or linear scaling when `profileShape` is provided.
 *
 * @param wire - The profile wire to sweep (must be closed).
 * @param angleDegrees - Total twist rotation in degrees. Must be non-zero.
 * @param center - Start point of the extrusion spine.
 * @param normal - Direction and length of the extrusion. Must be non-zero.
 * @param profileShape - Optional scaling profile applied along the extrusion.
 * @param shellMode - When `true`, return `[shell, startWire, endWire]` instead of a solid.
 * @returns `Result` containing the twisted extruded shape or a shell tuple.
 */
declare function twistExtrude(wire: ClosedWire<Dimension>, angleDegrees: number, center: Vec3, normal: Vec3, profileShape?: ExtrusionProfile, shellMode?: boolean): Result<Shape3D | [Shape3D, Wire, Wire]>;

/** Configuration for a single entry in a batch extrude operation. */
interface ExtrudeAllEntry {
    /** The planar face to extrude. */
    face: OrientedFace<Dimension> & PlanarFace<Dimension>;
    /** Height (number for Z-direction) or full direction vector. */
    height: number | Vec3;
}

/**
 * Batch extrude: build N independent extrusions in a single kernel call.
 *
 * Uses the C++ ExtrudeBatch extractor when available (single WASM call),
 * falling back to N individual extrude operations otherwise.
 *
 * @returns Array of valid solids, one per entry.
 */
declare function extrudeAll(entries: readonly ExtrudeAllEntry[]): Result<ValidSolid[]>;

/** Configuration for a single sweep section (profile wire + optional location). */
interface SweepSectionConfig {
    /** The profile wire for this section. */
    wire: Wire<Dimension>;
    /** Location along the spine as a parameter in [0.0, 1.0]. Auto-distributed if omitted. */
    location?: number;
}

/** Options for the multi-section sweep operation. */
interface MultiSweepOptions {
    /** Produce a solid (true) or shell (false). Defaults to true. */
    solid?: boolean;
    /** Use ruled (straight) interpolation between sections. Defaults to false. */
    ruled?: boolean;
    /** Tolerance for the loft builder. Defaults to 1e-6. */
    tolerance?: number;
}

/**
 * Sweep multiple profile sections along a spine wire.
 *
 * Each section wire is positioned at a point along the spine (either at an
 * explicit `location` parameter or auto-distributed evenly). The profiles
 * are then lofted using `BRepOffsetAPI_ThruSections`.
 *
 * @param sections - At least 2 section configs with profile wires.
 * @param spine - The path wire to sweep along.
 * @param options - Sweep configuration.
 * @returns Result containing the swept Solid or Shell.
 */
declare function multiSectionSweep(sections: ReadonlyArray<SweepSectionConfig>, spine: Wire<Dimension>, options?: MultiSweepOptions): Result<Solid | Shell>;

/** Options for guide curve sweep. */
interface GuidedSweepOptions {
    /** Transition mode at spine vertices. Defaults to 'transformed'. */
    transition?: 'transformed' | 'round' | 'right';
    /** Produce a solid (true) or shell (false). Defaults to true. */
    solid?: boolean;
    /** Builder tolerance. When set, passed to SetTolerance. */
    tolerance?: number;
}

/**
 * Sweep a profile wire along a spine, using guide wires to control shape evolution.
 *
 * The first guide wire is used as an auxiliary spine via `SetMode_5`, which
 * controls how the profile orientation evolves along the path.
 *
 * @param profile - The cross-section wire to sweep.
 * @param spine - The path wire to sweep along.
 * @param guides - Guide wires controlling profile evolution. First guide is used as auxiliary spine.
 * @param options - Sweep configuration.
 * @returns Result containing the swept Solid or Shell.
 */
declare function guidedSweep(profile: Wire<Dimension>, spine: Wire<Dimension>, guides: ReadonlyArray<Wire<Dimension>>, options?: GuidedSweepOptions): Result<Solid | Shell>;

interface RoofOptions {
    /** Roof slope angle in degrees (default: 45). */
    readonly angle?: number;
}

/**
 * Create a roof solid from a planar wire using the straight skeleton algorithm.
 * Each polygon edge produces a sloped face rising toward the skeleton ridge.
 *
 * @param w - A planar wire defining the roof footprint
 * @param options - Optional angle (degrees) for the roof slope
 * @returns A Result containing the roof Solid, or an error
 */
declare function roof(w: ClosedWire<Dimension> & PlanarWire<Dimension>, options?: RoofOptions): Result<ValidSolid>;

interface SkPoint2D {
    readonly x: number;
    readonly y: number;
}

interface SkeletonNode {
    readonly x: number;
    readonly y: number;
    readonly height: number;
}

interface SkeletonFace {
    readonly vertices: SkPoint2D[];
    readonly heights: number[];
}

interface StraightSkeleton {
    readonly nodes: SkeletonNode[];
    readonly faces: SkeletonFace[];
}

/**
 * Compute the straight skeleton of a simple polygon.
 * The polygon vertices must define a simple (non-self-intersecting) polygon.
 * They will be reordered to CCW if necessary.
 */
declare function computeStraightSkeleton(polygon: SkPoint2D[]): Result<StraightSkeleton>;

/**
 * Shared type definitions for STEP/STL exporters.
 */
/** Supported length units for STEP export. */
type SupportedUnit = 'M' | 'CM' | 'MM' | 'INCH' | 'FT' | 'm' | 'mm' | 'cm' | 'inch' | 'ft';

/** Configuration for a single shape within a functional assembly export. */
interface ShapeOptions {
    /** The branded shape to include in the assembly. */
    shape: AnyShape<Dimension>;
    /** Hex color string (e.g. `'#ff0000'`). Defaults to red. */
    color?: string;
    /** Opacity from 0 (transparent) to 1 (opaque). Defaults to 1. */
    alpha?: number;
    /** Display name for the shape node. Auto-generated UUID if omitted. */
    name?: string;
}

/**
 * Create an XCAF document from shape configs and export as a STEP blob.
 *
 * Builds an in-memory XCAF assembly with named, colored shape nodes, writes
 * it through `STEPCAFControl_Writer`, and returns the file contents as a
 * `Blob`. The XCAF document is deleted after export to avoid memory leaks.
 *
 * @param shapes - Shapes to include in the STEP file.
 * @param options - Optional unit settings for the STEP writer.
 * @param options.unit - Write unit (e.g. `'MM'`, `'INCH'`).
 * @param options.modelUnit - Model unit; defaults to the write unit.
 * @returns `Result` containing a `Blob` with MIME type `application/STEP`.
 *
 * @example
 * ```ts
 * const result = exportAssemblySTEP(
 *   [{ shape: myBox, color: '#00ff00', name: 'box' }],
 *   { unit: 'MM' }
 * );
 * if (result.ok) saveAs(result.value, 'model.step');
 * ```
 *
 * @see {@link exporters!exportSTEP | exportSTEP} for the OOP API equivalent.
 */
declare function exportAssemblySTEP(shapes?: ShapeOptions[], { unit, modelUnit }?: {
    unit?: SupportedUnit;
    modelUnit?: SupportedUnit;
}): Result<Blob>;

/**
 * Create a linear pattern of a shape along a direction.
 *
 * @param shape - The shape to replicate
 * @param direction - Direction vector for the pattern
 * @param count - Total number of copies (including the original)
 * @param spacing - Distance between each copy along the direction
 * @param options - Boolean options for the fuse operation
 * @returns Fused shape of all copies
 */
declare function linearPattern(shape: Shape3D, direction: Vec3, count: number, spacing: number, options?: BooleanOptions): Result<Shape3D>;

/**
 * Create a circular pattern of a shape around an axis.
 *
 * @param shape - The shape to replicate
 * @param axis - Rotation axis direction
 * @param count - Total number of copies (including the original)
 * @param fullAngle - Total angle to spread copies over in degrees (default: 360)
 * @param center - Center point of rotation (default: [0,0,0])
 * @param options - Boolean options for the fuse operation
 * @returns Fused shape of all copies
 */
declare function circularPattern(shape: Shape3D, axis: Vec3, count: number, fullAngle?: number, center?: Vec3, options?: BooleanOptions): Result<Shape3D>;

interface AssemblyNode {
    readonly name: string;
    readonly shape?: AnyShape;
    readonly translate?: Vec3;
    readonly rotate?: {
        angle: number;
        axis?: Vec3;
    };
    readonly metadata?: Readonly<Record<string, unknown>>;
    readonly children: ReadonlyArray<AssemblyNode>;
    readonly mates?: readonly unknown[];
    /** Drivable kinematic joints (see jointFns). Typed loosely to avoid a cycle. */
    readonly joints?: readonly unknown[];
}

interface AssemblyNodeOptions {
    shape?: AnyShape;
    translate?: Vec3;
    rotate?: {
        angle: number;
        axis?: Vec3;
    };
    metadata?: Record<string, unknown>;
}

/** Create a new assembly node. */
declare function createAssemblyNode(name: string, options?: AssemblyNodeOptions): AssemblyNode;

/** Add a child node. Returns a new parent node. */
declare function addChild(parent: AssemblyNode, child: AssemblyNode): AssemblyNode;

/** Remove a child by name (first match). Returns a new parent node. */
declare function removeChild(parent: AssemblyNode, childName: string): AssemblyNode;

/** Update a node's properties. Returns a new node. */
declare function updateNode(node: AssemblyNode, updates: Partial<AssemblyNodeOptions>): AssemblyNode;

/** Find a node by name (depth-first). Returns undefined if not found. */
declare function findNode(root: AssemblyNode, name: string): AssemblyNode | undefined;

/** Walk the tree depth-first, calling visitor for each node. */
declare function walkAssembly(root: AssemblyNode, visitor: (node: AssemblyNode, depth: number) => void, depth?: number): void;

/** Count all nodes in the tree. */
declare function countNodes(root: AssemblyNode): number;

/** Collect all shapes in the tree (depth-first). */
declare function collectShapes(root: AssemblyNode): AnyShape[];

interface MateEntity {
    node: string;
    face?: Face;
    edge?: Edge;
    point?: Vec3;
}

type MateConstraint = {
    type: 'coincident';
    entityA: MateEntity;
    entityB: MateEntity;
} | {
    type: 'concentric';
    axisA: MateEntity;
    axisB: MateEntity;
} | {
    type: 'distance';
    entityA: MateEntity;
    entityB: MateEntity;
    distance: number;
} | {
    type: 'angle';
    entityA: MateEntity;
    entityB: MateEntity;
    angle: number;
} | {
    type: 'fixed';
    entity: MateEntity;
};

interface AssemblySolveResult {
    transforms: Map<string, {
        position: Vec3;
        rotation: [number, number, number, number];
    }>;
    dof: number;
    converged: boolean;
}

/**
 * Add a mate constraint to an assembly.
 * Returns a new assembly node with the constraint added.
 */
declare function addMate(assembly: AssemblyNode, constraint: MateConstraint): AssemblyNode;

/**
 * Solve all mate constraints and compute part transforms.
 */
declare function solveAssembly(assembly: AssemblyNode): Result<AssemblySolveResult>;

/** A joint axis: a point on the axis line plus a direction. */
interface JointAxis {
    readonly origin: Vec3;
    readonly direction: Vec3;
}

type JointType = 'revolute' | 'prismatic' | 'cylindrical' | 'planar' | 'spherical';

/**
 * A single drivable degree of freedom. A `rotation` DOF turns about the joint's
 * anchor point along `axis` (degrees); a `translation` DOF slides along `axis`
 * (length units). `value` is always clamped to `[min, max]`.
 */
interface JointDOF {
    readonly kind: 'rotation' | 'translation';
    readonly axis: Vec3;
    readonly min: number;
    readonly max: number;
    readonly value: number;
}

interface Joint {
    readonly type: JointType;
    /** Reference body (stays put); the child moves relative to it. */
    readonly parent: string;
    readonly child: string;
    /** Primary axis; `origin` is the anchor every rotation DOF pivots about. */
    readonly axis: JointAxis;
    /** Primary-DOF range bounds (mirror of `dofs[0]`). */
    readonly min: number;
    readonly max: number;
    /** Primary-DOF value (mirror of `dofs[0]`), always clamped to `[min, max]`. */
    readonly value: number;
    /** All drivable degrees of freedom, in composition order. */
    readonly dofs: readonly JointDOF[];
    /**
     * Optional fixed transform applied to the child frame *after* the joint
     * motion (`childWorld = parentWorld ∘ jointTransform ∘ offset`). Lets a single
     * joint carry a static link offset (e.g. a Denavit-Hartenberg link geometry)
     * without an extra body. Defaults to identity. See `jointsFromDH`.
     */
    readonly offset?: JointPose;
}

/** A rigid transform: translation + quaternion rotation `[w, x, y, z]`. */
interface JointPose {
    readonly position: Vec3;
    readonly rotation: [number, number, number, number];
}

interface JointOptions {
    /** Range lower bound. Default: -180 (revolute) / 0 (prismatic). */
    min?: number;
    /** Range upper bound. Default: 180 (revolute) / 100 (prismatic). */
    max?: number;
    /** Initial value, clamped to the range. Default: 0. */
    value?: number;
}

/** Per-DOF ranges for a cylindrical joint (rotation about + slide along one axis). */
interface CylindricalOptions {
    /** Rotation DOF (degrees). Default range -180..180. */
    rotation?: JointOptions;
    /**
     * Translation DOF (length). Default range 0..100, matching `prismaticJoint`
     * (both model a slide along an axis). This is deliberately asymmetric with
     * `planarJoint`'s in-plane translations, which default to -100..100 because
     * an unanchored in-plane slide is naturally bidirectional.
     */
    translation?: JointOptions;
}

/** Per-DOF ranges for a planar joint (two in-plane translations + a rotation). */
interface PlanarOptions {
    /** Translation along the in-plane `uDirection`. Default range -100..100. */
    u?: JointOptions;
    /** Translation along `normal × u`. Default range -100..100. */
    v?: JointOptions;
    /** Rotation about the plane normal (degrees). Default range -180..180. */
    rotation?: JointOptions;
    /**
     * In-plane reference direction for the `u` translation. Projected onto the
     * plane and normalized; defaults to an arbitrary perpendicular of the normal.
     */
    uDirection?: Vec3;
}

/** Per-DOF ranges for a spherical joint (three rotations about a pivot). */
interface SphericalOptions {
    /** Rotation about local X through the pivot (degrees). Default range -180..180. */
    x?: JointOptions;
    /** Rotation about local Y through the pivot (degrees). Default range -180..180. */
    y?: JointOptions;
    /** Rotation about local Z through the pivot (degrees). Default range -180..180. */
    z?: JointOptions;
}

/** A revolute (hinge) joint — the child rotates about `axis` by `value` degrees. */
declare function revoluteJoint(parent: string, child: string, axis: JointAxis, opts?: JointOptions): Joint;

/**
 * A prismatic (slider) joint — the child translates along `axis` by `value`
 * units. Only `axis.direction` is used; `axis.origin` is ignored (a pure
 * translation has no anchor point), unlike a revolute joint which rotates about
 * the axis line through `origin`.
 */
declare function prismaticJoint(parent: string, child: string, axis: JointAxis, opts?: JointOptions): Joint;

/**
 * A cylindrical joint — the child both rotates about and slides along a single
 * `axis` (2 DOF). DOF order: `[rotation, translation]`. The two motions share
 * the axis, so they commute; rotation pivots about `axis.origin`.
 */
declare function cylindricalJoint(parent: string, child: string, axis: JointAxis, opts?: CylindricalOptions): Joint;

/**
 * A planar joint — the child translates within a plane and rotates about its
 * normal (3 DOF). `plane.direction` is the normal; `plane.origin` the rotation
 * anchor. DOF order: `[u-translation, v-translation, rotation]`, where the
 * translations are applied in the plane frame (independent of the rotation).
 */
declare function planarJoint(parent: string, child: string, plane: JointAxis, opts?: PlanarOptions): Joint;

/**
 * A spherical (ball) joint — the child rotates freely about a pivot point
 * (3 DOF). DOF order: `[x, y, z]` rotations about the local axes through
 * `pivot`, composed as `Rx · Ry · Rz`.
 */
declare function sphericalJoint(parent: string, child: string, pivot: Vec3, opts?: SphericalOptions): Joint;

/**
 * Return a copy of `joint` with per-DOF values set (each clamped to its range).
 * Values are positional, matching `joint.dofs`; omitted entries keep their
 * stored value. The primary mirror (`value`) is kept in sync with `dofs[0]`.
 */
declare function setJointValues(joint: Joint, values: readonly number[]): Joint;

/** Return a copy of `joint` with its primary DOF set (clamped to range). */
declare function setJointValue(joint: Joint, value: number): Joint;

/**
 * The child's local rigid transform (relative to the parent) for given DOF
 * values. Defaults to each DOF's stored value. A single `number` overrides only
 * the primary DOF (single-DOF ergonomics); an array overrides positionally,
 * with omitted entries keeping their stored value. Each value is clamped to its
 * DOF range.
 *
 * DOFs are folded in array order via frame composition. For same-anchor
 * rotations (e.g. spherical) this composes to a single rotation about the pivot;
 * for a cylindrical axis the rotation and slide commute.
 */
declare function jointTransform(joint: Joint, value?: number | readonly number[]): JointPose;

/** Attach a joint to an assembly node. Returns a new node (immutable). */
declare function addJoint(assembly: AssemblyNode, joint: Joint): AssemblyNode;

/**
 * Forward kinematics: set joint values and propagate world poses down the
 * kinematic chain. Each joint's axis is interpreted in its **parent's** frame,
 * so a child's world pose is `parentWorld ∘ jointTransform(joint, value)`.
 *
 * Bodies not driven by a joint (chain roots) start at the origin. `jointValues`
 * overrides a joint's stored value, keyed by the **child** node name; omitted
 * joints use `joint.value`. Resolution is topological (reuses the Phase-0
 * ordering), so chains of any depth compose. Returns a world pose for every node.
 */
declare function forwardKinematics(assembly: AssemblyNode, jointValues?: Readonly<Record<string, number | readonly number[]>>): Map<string, JointPose>;

/**
 * Open-chain mobility — the number of independent degrees of freedom, summing
 * each joint's DOF count (revolute/prismatic 1, cylindrical 2, planar/spherical
 * 3). For a serial chain this equals the total DOF. (Closed-loop
 * Grübler/Kutzbach analysis is future work.)
 */
declare function mechanismDOF(assembly: AssemblyNode): number;

/** A target for the end-effector: a world position, optionally an orientation. */
interface IKTarget {
    readonly position: Vec3;
    /** Target orientation `[w, x, y, z]`. Omit for position-only IK. */
    readonly rotation?: Quat;
}

interface IKOptions {
    /** Maximum solver iterations. Default 200. */
    maxIterations?: number;
    /** Convergence threshold on the residual norm. Default 1e-5. */
    tolerance?: number;
    /** Damping factor λ for the least-squares step. Default 0.05. */
    damping?: number;
    /** Initial joint values, keyed by child node (number or per-DOF array). */
    seed?: Readonly<Record<string, number | readonly number[]>>;
    /** Local point on the end-effector node to drive to the target. Default origin. */
    tip?: Vec3;
}

interface IKResult {
    /** Solved joint values, keyed by child node, one entry per DOF. */
    readonly values: Record<string, number[]>;
    readonly converged: boolean;
    readonly iterations: number;
    /** Final residual norm (position, plus orientation when targeted). */
    readonly error: number;
}

/**
 * Solve for the joint values that place `endEffector` (offset by `tip`) at
 * `target`, by damped-least-squares descent on a numerical Jacobian. Joint
 * ranges are honored: every iterate is clamped to each DOF's `[min, max]`.
 *
 * Returns the solved per-DOF values keyed by child node (ready to pass to
 * `forwardKinematics`), whether it converged, the iteration count, and the final
 * residual norm. An end-effector with no driving joints, or an unreachable
 * target, returns `converged: false` with the best configuration found.
 */
declare function inverseKinematics(assembly: AssemblyNode, endEffector: string, target: IKTarget, options?: IKOptions): IKResult;

interface TrajectorySample {
    /** Normalized path parameter in `[0, 1]`. */
    readonly t: number;
    /** Interpolated joint values at this step, keyed by child node. */
    readonly values: Record<string, number[]>;
    /** Forward-kinematics world poses for every node at this step. */
    readonly poses: Map<string, JointPose>;
}

/**
 * Sample a straight-line path in joint space from `from` to `to` over `steps`
 * segments, yielding `steps + 1` samples (inclusive of both endpoints). Each
 * sample carries the interpolated per-DOF values (clamped to range) and the
 * forward-kinematics poses of every node. Joints absent from `from`/`to` hold
 * their stored value at both ends.
 */
declare function jointTrajectory(assembly: AssemblyNode, from: Readonly<Record<string, number | readonly number[]>>, to: Readonly<Record<string, number | readonly number[]>>, steps: number): TrajectorySample[];

/** One row of a Denavit-Hartenberg table (angles in degrees). */
interface DHRow {
    /** Link length: translation along the (rotated) x axis. */
    readonly a: number;
    /** Link twist: rotation about the x axis, in degrees. */
    readonly alpha: number;
    /** Link offset: translation along the z axis. For prismatic, the home offset. */
    readonly d: number;
    /** Joint angle about z, in degrees. For revolute, the home angle. */
    readonly theta: number;
    /** Which parameter is the joint variable. Default `'revolute'` (θ varies). */
    readonly type?: 'revolute' | 'prismatic';
    /** Joint range lower bound (degrees for revolute, length for prismatic). */
    readonly min?: number;
    /** Joint range upper bound. */
    readonly max?: number;
    /** Initial joint value (clamped to range). Default 0. */
    readonly value?: number;
    /** Child link name produced by this row. Default `link{i+1}`. */
    readonly name?: string;
}

interface DHOptions {
    /** Name of the base (root) link. Default `'base'`. */
    base?: string;
}

/**
 * Build a serial revolute/prismatic joint chain from a DH table. Joint `i`
 * connects the previous link to row `i`'s link; its motion is the variable
 * parameter (θ for revolute, d for prismatic) about/along +z, and its fixed
 * link geometry is carried on `Joint.offset`. The result drives correctly
 * through `forwardKinematics` and reports `rows.length` DOF via `mechanismDOF`.
 */
declare function jointsFromDH(rows: readonly DHRow[], options?: DHOptions): Joint[];

interface UrdfExportOptions {
    /** `<robot name="...">`. Default `'robot'`. */
    name?: string;
    /** Default `effort` limit emitted for every joint. Default 0. */
    effort?: number;
    /** Default `velocity` limit emitted for every joint. Default 0. */
    velocity?: number;
    /** Per-link mesh filename for a `<visual>` reference, keyed by node name. */
    meshes?: Readonly<Record<string, string>>;
}

interface UrdfDocument {
    readonly name: string;
    readonly links: string[];
    readonly joints: Joint[];
}

/**
 * Serialize an assembly's links and revolute/prismatic joints to a URDF string.
 * Returns an error if any joint is multi-DOF or carries a fixed `offset`, since
 * URDF cannot represent those as a single joint.
 */
declare function exportURDF(assembly: AssemblyNode, options?: UrdfExportOptions): Result<string>;

/**
 * Parse a URDF document into its robot name, link names, and revolute/prismatic
 * joints. `continuous` joints become revolute with a full -180..180 range;
 * `fixed`/`floating`/`planar` joints are skipped (their links are still listed).
 * A non-zero `<origin rpy>` is folded into the joint axis direction; its
 * residual frame rotation is not represented (URDF's pre-motion frame offset has
 * no single-joint brepjs equivalent).
 */
declare function importURDF(xml: string): Result<UrdfDocument>;

interface OperationStep {
    readonly id: string;
    readonly type: string;
    readonly parameters: Readonly<Record<string, unknown>>;
    readonly inputIds: ReadonlyArray<string>;
    readonly outputId: string;
    readonly timestamp: number;
    readonly metadata?: Readonly<Record<string, unknown>>;
}

interface ModelHistory {
    readonly steps: ReadonlyArray<OperationStep>;
    readonly shapes: ReadonlyMap<string, AnyShape<Dimension>>;
}

/** Create a new empty history. */
declare function createHistory(): ModelHistory;

/** Add a step and its output shape. Returns a new history. */
declare function addStep(history: ModelHistory, step: Omit<OperationStep, 'timestamp'>, outputShape: AnyShape<Dimension>): ModelHistory;

/** Remove the last step and clean up orphaned shapes. Returns a new history. */
declare function undoLast(history: ModelHistory): ModelHistory;

/** Find a step by its ID. */
declare function findStep(history: ModelHistory, stepId: string): OperationStep | undefined;

/** Retrieve a shape by its ID. */
declare function getShape(history: ModelHistory, shapeId: string): AnyShape<Dimension> | undefined;

/** Return the number of steps in the history. */
declare function stepCount(history: ModelHistory): number;

/** Return all steps from a given step ID onwards (inclusive). */
declare function stepsFrom(history: ModelHistory, stepId: string): ReadonlyArray<OperationStep>;

/** Register an initial shape without an operation step. Returns a new history. */
declare function registerShape(history: ModelHistory, id: string, shape: AnyShape<Dimension>): ModelHistory;

/** A function that executes a modelling operation. */
type OperationFn = (inputs: AnyShape<Dimension>[], params: Record<string, unknown>) => AnyShape<Dimension>;

/** An immutable registry of named operations. */
interface OperationRegistry {
    readonly operations: ReadonlyMap<string, OperationFn>;
}

/** Create an empty operation registry. */
declare function createRegistry(): OperationRegistry;

/** Register an operation. Returns a new registry (immutable). */
declare function registerOperation(registry: OperationRegistry, type: string, fn: OperationFn): OperationRegistry;

/**
 * Replay an entire history from scratch using the given registry.
 *
 * All initial shapes (those not produced by any step) must already be in the
 * history's shapes map. Steps are replayed in order. Returns a new history
 * with fresh output shapes.
 */
declare function replayHistory(history: ModelHistory, registry: OperationRegistry): Result<ModelHistory>;

/**
 * Replay history from a specific step onwards.
 *
 * Steps before `stepId` are kept as-is. Steps from `stepId` onwards are
 * re-executed using the registry.
 */
declare function replayFrom(history: ModelHistory, stepId: string, registry: OperationRegistry): Result<ModelHistory>;

/**
 * Modify a step's parameters and replay from that point.
 *
 * Creates a new history with the updated parameters for the specified step,
 * then replays from that step onwards.
 */
declare function modifyStep(history: ModelHistory, stepId: string, newParams: Readonly<Record<string, unknown>>, registry: OperationRegistry): Result<ModelHistory>;

/** JSON-safe representation of a ModelHistory. */
interface SerializedHistory {
    readonly steps: ReadonlyArray<OperationStep>;
    /** Shape ID → BREP string. */
    readonly shapes: Readonly<Record<string, string>>;
}

/** Serialize a history to a JSON-safe object (shapes converted via toBREP). */
declare function serializeHistory(history: ModelHistory): Result<SerializedHistory>;

/** Deserialize a history from a JSON-safe object (shapes reconstructed via fromBREP). */
declare function deserializeHistory(data: SerializedHistory): Result<ModelHistory>;

/** Base physical properties returned by BRepGProp measurements. */
interface PhysicalProps {
    /** Raw mass property from BRepGProp (volume, area, or length depending on measurement type). */
    readonly mass: number;
    /** Center of mass as an [x, y, z] tuple. */
    readonly centerOfMass: Vec3;
}

/** Distance measurement result including witness points. */
interface DistanceProps {
    /** The minimum distance between the two shapes. */
    readonly distance: number;
    /** Closest point on the first shape. */
    readonly point1: Vec3;
    /** Closest point on the second shape. */
    readonly point2: Vec3;
}

interface CurvatureResult {
    /** Mean curvature: H = (k1 + k2) / 2 */
    mean: number;
    /** Gaussian curvature: K = k1 * k2 */
    gaussian: number;
    /** Maximum principal curvature */
    maxCurvature: number;
    /** Minimum principal curvature */
    minCurvature: number;
    /** Direction of maximum curvature */
    maxDirection: [number, number, number];
    /** Direction of minimum curvature */
    minDirection: [number, number, number];
}

/**
 * Measure volume properties of a 3D shape.
 *
 * @param shape - A solid or compound shape.
 * @returns `Result` containing volume, center of mass, and raw mass property.
 * @see {@link measureVolume} for a shorthand that returns only the volume number.
 */
declare function measureVolumeProps(shape: Shape3D): Result<VolumeProps>;

/**
 * Measure surface properties of a face or 3D shape.
 *
 * @param shape - A Face or any 3D shape (the total outer surface area is measured).
 * @returns `Result` containing surface area, center of mass, and raw mass property.
 * @see {@link measureArea} for a shorthand that returns only the area number.
 */
declare function measureSurfaceProps(shape: Face<Dimension> | Shape3D): Result<SurfaceProps>;

/**
 * Measure linear properties of any shape.
 *
 * For edges this is the arc length; for wires/compounds it is the total
 * length of all edges.
 *
 * @param shape - Any shape whose linear extent is to be measured.
 * @returns `Result` containing length, center of mass, and raw mass property.
 * @see {@link measureLength} for a shorthand that returns only the length number.
 */
declare function measureLinearProps(shape: AnyShape<Dimension>): Result<LinearProps>;

/**
 * Get the volume of a 3D shape.
 *
 * @see {@link measureVolumeProps} for the full property set including center of mass.
 */
declare function measureVolume(shape: Shape3D): Result<number>;

/**
 * Get the surface area of a face or 3D shape.
 *
 * @see {@link measureSurfaceProps} for the full property set including center of mass.
 */
declare function measureArea(shape: Face<Dimension> | Shape3D): Result<number>;

/**
 * Get the arc length of a shape.
 *
 * @see {@link measureLinearProps} for the full property set including center of mass.
 */
declare function measureLength(shape: AnyShape<Dimension>): Result<number>;

/**
 * Measure the minimum distance between two shapes.
 */
declare function measureDistance(shape1: AnyShape<Dimension>, shape2: AnyShape<Dimension>): Result<number>;

/**
 * Measure the minimum distance between two shapes, including witness points.
 */
declare function measureDistanceProps(shape1: AnyShape<Dimension>, shape2: AnyShape<Dimension>): Result<DistanceProps>;

/**
 * Create a reusable distance query from a reference shape.
 *
 * Keeps the reference shape loaded in the kernel distance tool so that
 * multiple `distanceTo` calls avoid re-loading overhead.
 *
 * @remarks Call `dispose()` when done to free the WASM-allocated distance tool.
 */
declare function createDistanceQuery(referenceShape: AnyShape<Dimension>): Result<{
    distanceTo: (other: AnyShape<Dimension>) => Result<number>;
    dispose: () => void;
}>;

/**
 * Measure surface curvature at a (u, v) parameter point on a face.
 *
 * Returns mean, Gaussian, and principal curvatures with directions.
 * The u, v parameters correspond to the face's parametric domain.
 */
declare function measureCurvatureAt(face: OrientedFace<Dimension>, u: number, v: number): Result<CurvatureResult>;

/**
 * Measure surface curvature at the mid-point of a face's UV bounds.
 *
 * Uses `BRepTools::UVBounds` for the actual trimmed face UV region.
 *
 * @see {@link measureCurvatureAt} to evaluate at an arbitrary (u, v) point.
 */
declare function measureCurvatureAtMid(face: Face<Dimension>): Result<CurvatureResult>;

/** Result of a pairwise interference check between two shapes. */
interface InterferenceResult {
    /** True if shapes are touching or overlapping (distance within tolerance). */
    readonly hasInterference: boolean;
    /** Minimum distance between the shapes. 0 when touching or overlapping. */
    readonly minDistance: number;
    /** Closest point on the first shape as [x, y, z]. */
    readonly pointOnShape1: Vec3;
    /** Closest point on the second shape as [x, y, z]. */
    readonly pointOnShape2: Vec3;
}

/** A pair of shapes that were found to interfere during batch checking. */
interface InterferencePair {
    /** Index of the first shape in the input array. */
    readonly i: number;
    /** Index of the second shape in the input array. */
    readonly j: number;
    /** Detailed interference result for this pair. */
    readonly result: InterferenceResult;
}

/**
 * Check for interference (collision/contact) between two shapes.
 *
 * Returns detailed proximity information including the minimum distance
 * and closest points. Shapes are considered interfering when their
 * minimum distance is within the given tolerance.
 *
 * @param shape1 - First shape.
 * @param shape2 - Second shape.
 * @param tolerance - Distance threshold below which shapes are considered interfering. Default: 1e-6.
 * @returns A `Result` wrapping the {@link InterferenceResult}.
 *
 * @example
 * ```ts
 * const result = unwrap(checkInterference(boxA, boxB));
 * if (result.hasInterference) {
 *   console.log('Collision at distance', result.minDistance);
 * }
 * ```
 */
declare function checkInterference(shape1: AnyShape<Dimension>, shape2: AnyShape<Dimension>, tolerance?: number): Result<InterferenceResult>;

/**
 * Check all pairs in an array of shapes for interference.
 *
 * Returns only pairs that have interference (distance within tolerance).
 * For N shapes, checks N*(N-1)/2 unique pairs.
 *
 * @param shapes - Array of shapes to test pairwise.
 * @param tolerance - Distance threshold for interference. Default: 1e-6.
 * @returns Array of {@link InterferencePair} entries, one per colliding pair.
 *
 * @example
 * ```ts
 * const collisions = checkAllInterferences([box, sphere, cylinder]);
 * collisions.forEach(({ i, j }) => console.log(`Shape ${i} hits shape ${j}`));
 * ```
 */
declare function checkAllInterferences(shapes: ReadonlyArray<AnyShape<Dimension>>, tolerance?: number): InterferencePair[];

/**
 * Import a STEP file from a Blob.
 *
 * Writes the blob to the WASM virtual filesystem, reads it with
 * `STEPControl_Reader`, and returns the resulting shape.
 *
 * @param blob - A Blob or File containing STEP data (.step / .stp).
 * @returns A `Result` wrapping the imported shape, or an error if parsing fails.
 *
 * @remarks The temporary file on the WASM FS is cleaned up automatically.
 *
 * @example
 * ```ts
 * const file = new File([stepData], 'part.step');
 * const shape = unwrap(await importSTEP(file));
 * ```
 */
declare function importSTEP(blob: Blob): Promise<Result<UnknownDimShape>>;

/**
 * Import an STL file from a Blob.
 *
 * Reads the mesh, unifies same-domain faces with `ShapeUpgrade_UnifySameDomain`,
 * and wraps the result as a solid.
 *
 * @param blob - A Blob or File containing STL data (binary or ASCII).
 * @returns A `Result` wrapping the imported solid, or an error if parsing fails.
 *
 * @remarks The temporary file on the WASM FS is cleaned up automatically.
 *
 * @example
 * ```ts
 * const shape = unwrap(await importSTL(stlBlob));
 * ```
 */
declare function importSTL(blob: Blob): Promise<Result<UnknownDimShape>>;

/**
 * Import an IGES file from a Blob.
 *
 * @param blob - A Blob or File containing IGES data (.iges / .igs).
 * @returns A `Result` wrapping the imported shape, or an error if parsing fails.
 *
 * @remarks The temporary file on the WASM FS is cleaned up automatically.
 *
 * @example
 * ```ts
 * const shape = unwrap(await importIGES(igesBlob));
 * ```
 */
declare function importIGES(blob: Blob): Promise<Result<UnknownDimShape>>;

interface DXFImportOptions {
    readonly layer?: string;
}

/**
 * Import a DXF file from a Blob, returning kernel wires.
 *
 * Parses ASCII DXF LINE, CIRCLE, and ARC entities.
 * Edges are assembled into wires using `BRepBuilderAPI_MakeWire`.
 *
 * @param blob - A Blob containing ASCII DXF data.
 * @param options - Optional import settings (layer filter).
 * @returns A `Result` wrapping an array of wires.
 */
declare function importDXF(blob: Blob, options?: DXFImportOptions): Promise<Result<Wire[]>>;

/**
 * Import a Wavefront OBJ file from a Blob.
 *
 * Parses vertex (`v`) and face (`f`) lines, triangulates n-gons via fan
 * triangulation, and builds a solid by sewing the resulting triangular faces.
 *
 * @param blob - A Blob or File containing OBJ text data (.obj).
 * @returns A `Result` wrapping the imported solid, or an error if parsing fails.
 *
 * @example
 * ```ts
 * const file = new File([objData], 'model.obj');
 * const shape = unwrap(await importOBJ(file));
 * ```
 */
declare function importOBJ(blob: Blob): Promise<Result<UnknownDimShape>>;

/**
 * Import a 3MF file from a Blob.
 *
 * Extracts the model XML from the ZIP archive, parses vertices and triangles,
 * and builds a solid by sewing the resulting triangular faces.
 *
 * @param blob - A Blob or File containing 3MF data (.3mf).
 * @returns A `Result` wrapping the imported solid, or an error if parsing fails.
 *
 * @example
 * ```ts
 * const file = new File([data], 'model.3mf');
 * const shape = unwrap(await importThreeMF(file));
 * ```
 */
declare function importThreeMF(blob: Blob): Promise<Result<UnknownDimShape>>;

/**
 * Import a GLB (binary glTF) file from a Blob.
 *
 * Delegates to the kernel's `importGLB` method, which reconstructs
 * B-Rep geometry from the mesh data.
 *
 * @param blob - A Blob or File containing GLB data.
 * @returns A `Result` wrapping the imported shape, or an error if parsing fails.
 *
 * @example
 * ```ts
 * const shape = unwrap(await importGLB(glbBlob));
 * ```
 */
declare function importGLB(blob: Blob): Promise<Result<UnknownDimShape>>;

/** Create an immutable edge finder. */
declare function edgeFinder(): EdgeFinderFn;

/** Create an immutable face finder. */
declare function faceFinder(): FaceFinderFn;

/** Create an immutable wire finder. */
declare function wireFinder(): WireFinderFn;

/** Create an immutable vertex finder. */
declare function vertexFinder(): VertexFinderFn;

interface CornerFilter {
    readonly shouldKeep: (corner: Corner) => boolean;
}

/** Create an immutable corner finder for 2D blueprint corners. */
declare function cornerFinder(): CornerFinderFn;

/**
 * Immutable plain-object representation of a projection camera.
 */
interface Camera {
    readonly position: Vec3;
    readonly direction: Vec3;
    readonly xAxis: Vec3;
    readonly yAxis: Vec3;
}

/**
 * Create a camera from position, direction, and an optional X-axis.
 *
 * If `xAxis` is omitted, it is derived automatically from the direction.
 *
 * @param position - Camera position in world coordinates.
 * @param direction - View direction (camera looks along this vector).
 * @param xAxis - Optional horizontal axis; derived automatically if not provided.
 * @returns `Result<Camera>` -- an error if direction is zero-length.
 */
declare function createCamera(position?: Vec3, direction?: Vec3, xAxis?: Vec3): Result<Camera>;

/**
 * Create a new camera oriented to look at a target point from the current position.
 *
 * @param camera - Existing camera whose position is preserved.
 * @param target - World-space point to look at.
 * @returns `Result<Camera>` with updated direction and derived axes.
 */
declare function cameraLookAt(camera: Camera, target: Vec3): Result<Camera>;

/**
 * Create a camera positioned at the origin, looking along a named projection plane.
 *
 * @param planeName - Named projection direction (e.g., `'front'`, `'top'`).
 * @returns `Result<Camera>` configured for that standard view.
 */
declare function cameraFromPlane(planeName: ProjectionPlane): Result<Camera>;

/**
 * Project the edges of a 3D shape onto a 2D plane defined by a {@link Camera}.
 *
 * @param shape - The 3D shape to project.
 * @param camera - Camera defining the projection plane.
 * @param withHiddenLines - If true, compute hidden-line edges as well.
 * @returns Separate arrays of visible and hidden projected edges.
 *
 * @see {@link drawProjection} for the higher-level Drawing-based API.
 */
declare function projectEdges(shape: AnyShape, camera: Camera, withHiddenLines?: boolean): {
    visible: Edge[];
    hidden: Edge[];
};

/**
 * Worker communication protocol for offloading CAD operations.
 *
 * Messages are sent between the main thread and worker threads.
 * Shapes are transferred as BREP-serialized strings.
 */
/** Base interface for all messages sent from the main thread to a worker. */
interface WorkerRequest {
    /** Unique identifier for correlating requests with responses. */
    readonly id: string;
    /** Discriminant indicating the kind of request. */
    readonly type: 'init' | 'operation' | 'dispose';
}

/** Base interface for all messages sent from a worker back to the main thread. */
interface WorkerResponse {
    /** Matches the {@link WorkerRequest.id} of the originating request. */
    readonly id: string;
    /** Discriminant: `true` for success, `false` for error. */
    readonly success: boolean;
}

/** Narrow a {@link WorkerRequest} to an {@link InitRequest}. */
declare function isInitRequest(msg: WorkerRequest): msg is InitRequest;

/** Narrow a {@link WorkerRequest} to an {@link OperationRequest}. */
declare function isOperationRequest(msg: WorkerRequest): msg is OperationRequest;

/** Narrow a {@link WorkerRequest} to a {@link DisposeRequest}. */
declare function isDisposeRequest(msg: WorkerRequest): msg is DisposeRequest;

/** Narrow a {@link WorkerResponse} to a {@link SuccessResponse}. */
declare function isSuccessResponse(msg: WorkerResponse): msg is SuccessResponse;

/** Narrow a {@link WorkerResponse} to an {@link ErrorResponse}. */
declare function isErrorResponse(msg: WorkerResponse): msg is ErrorResponse;

/**
 * Task queue for managing pending worker operations.
 * Pure data structure -- no Worker API dependency.
 */
/** A task awaiting a response from the worker. */
interface PendingTask<T = unknown> {
    readonly id: string;
    readonly resolve: (value: T) => void;
    readonly reject: (reason: unknown) => void;
    readonly createdAt: number;
}

/** Immutable queue of pending worker tasks, keyed by ID. */
interface TaskQueue<T = unknown> {
    readonly pending: ReadonlyMap<string, PendingTask<T>>;
}

/** Create an empty task queue. */
declare function createTaskQueue<T = unknown>(): TaskQueue<T>;

/** Add a task to the queue. Returns the updated queue. */
declare function enqueueTask<T>(queue: TaskQueue<T>, task: PendingTask<T>): TaskQueue<T>;

/** Remove and return a task from the queue. */
declare function dequeueTask<T>(queue: TaskQueue<T>, taskId: string): {
    queue: TaskQueue<T>;
    task: PendingTask<T> | undefined;
};

/** Get the number of pending tasks. */
declare function pendingCount<T>(queue: TaskQueue<T>): number;

/** Check if the queue has no pending tasks. */
declare function isEmpty<T>(queue: TaskQueue<T>): boolean;

/** Reject all pending tasks with the given reason. */
declare function rejectAll<T>(queue: TaskQueue<T>, reason: unknown): TaskQueue<T>;

/**
 * Worker client for offloading CAD operations to a Web Worker.
 *
 * Provides a promise-based API over the worker message protocol.
 */
interface WorkerClientOptions {
    /** The Worker instance to communicate with. */
    worker: Worker;
    /** Optional URL for the WASM binary (passed to the worker on init). */
    wasmUrl?: string;
}

/** Result returned from a successful worker operation. */
interface WorkerResult {
    resultBrep?: string;
    resultData?: unknown;
}

interface WorkerClient {
    /** Initialize the worker (load WASM). */
    init(): Promise<void>;
    /** Execute a named operation with BREP-serialized shapes and parameters. */
    execute(operation: string, shapesBrep: string[], params: Record<string, unknown>): Promise<WorkerResult>;
    /** Dispose the client, rejecting all pending operations. */
    dispose(): void;
}

/** Create a worker client that communicates using the brepjs worker protocol. */
declare function createWorkerClient(options: WorkerClientOptions): WorkerClient;

/**
 * Worker handler for processing CAD operations inside a Web Worker.
 *
 * Provides a registry-based approach for defining operation handlers.
 */
/** Handler function for a single named worker operation. */
type OperationHandler = (shapesBrep: ReadonlyArray<string>, params: Readonly<Record<string, unknown>>) => {
    resultBrep?: string;
    resultData?: unknown;
};

/** Create an empty operation registry. */
declare function createOperationRegistry(): OperationRegistry;

/** Register a named operation handler. Returns a new registry. */
declare function registerHandler(registry: OperationRegistry, name: string, handler: OperationHandler): OperationRegistry;

/**
 * Set up message handling in a Web Worker context.
 *
 * @param registry - The operation registry.
 * @param initFn - Async function called on InitRequest (e.g., to load WASM).
 */
declare function createWorkerHandler(registry: OperationRegistry, initFn: (wasmUrl?: string) => Promise<void>): void;

/**
 * Structural type matching a Drawing's wire-producing interface.
 * Used in place of importing the actual Drawing class to avoid
 * Layer 2 → Layer 3 boundary violations.
 */
interface DrawingLike {
    sketchOnPlane(plane: string): {
        wire: Wire;
    };
}

/**
 * Fillet radius specification.
 *
 * - `number` — constant radius on all selected edges
 * - `[number, number]` — variable radius (start, end)
 * - callback — per-edge radius; return `null` to skip an edge
 */
type FilletRadius = number | [number, number] | ((edge: Edge<Dimension>) => number | [number, number] | null);

/**
 * Chamfer distance specification.
 *
 * - `number` — equal distance
 * - `[number, number]` — asymmetric distances (dist1, dist2)
 * - `{ distance, angle }` — distance-angle mode (replaces chamferDistAngleShape)
 * - callback — per-edge distance; return `null` to skip an edge
 */
type ChamferDistance = number | [number, number] | {
    distance: number;
    angle: number;
} | ((edge: Edge<Dimension>) => number | [number, number] | {
    distance: number;
    angle: number;
} | null);

/**
 * Draft angle specification.
 *
 * - `number` — constant angle in degrees for all selected faces
 * - callback — per-face angle; return `null` to skip a face
 */
type DraftAngle = number | ((face: Face<Dimension>) => number | null);

/** Options for the draft() modifier. */
interface DraftOptions {
    /** Pull direction (mold opening direction). */
    pullDirection: Vec3;
    /** A point on the neutral plane (where no material is added or removed). */
    neutralPlane: Vec3;
    /** Draft angle in degrees. Constant or per-face callback. */
    angle: DraftAngle;
}

/** Options for the drill() compound operation. */
interface DrillOptions {
    /** Position of the hole (Vec2 projects along axis). */
    at: Vec2 | Vec3;
    /** Hole radius. */
    radius: number;
    /** Hole depth. Omit for through-all (computed from bounds). */
    depth?: number;
    /** Drill axis direction. Default: [0, 0, 1] (Z). */
    axis?: Vec3;
}

/** Options for the pocket() compound operation. */
interface PocketOptions {
    /** 2D profile shape to cut into the face. */
    profile: DrawingLike | Wire;
    /** Which face to pocket. Default: top face. */
    face?: Face | FinderFn<Face>;
    /** Depth of the pocket cut. */
    depth: number;
}

/** Options for the boss() compound operation. */
interface BossOptions {
    /** 2D profile shape to extrude onto the face. */
    profile: DrawingLike | Wire;
    /** Which face to add onto. Default: top face. */
    face?: Face | FinderFn<Face>;
    /** Height of the boss extrusion. */
    height: number;
}

/** Options for the mirrorJoin() compound operation. */
interface MirrorJoinOptions {
    /** Mirror plane normal. Default: [1, 0, 0] (mirror across YZ plane). */
    normal?: Vec3;
    /** Mirror plane origin. Default: [0, 0, 0]. */
    at?: Vec3;
}

/** Options for the rectangularPattern() compound operation. */
interface RectangularPatternOptions {
    /** Direction for X repetition. */
    xDir: Vec3;
    /** Number of copies in X direction. */
    xCount: number;
    /** Spacing between copies in X direction. */
    xSpacing: number;
    /** Direction for Y repetition. */
    yDir: Vec3;
    /** Number of copies in Y direction. */
    yCount: number;
    /** Spacing between copies in Y direction. */
    ySpacing: number;
}

/** Extract the raw branded 3D shape from a Shapeable<Shape3D>. */
declare function resolve3D(s: Shapeable<Shape3D>): Shape3D;

/** Options for {@link box}. */
interface BoxOptions {
    /** Center at this point (center semantics, like {@link sphere}). */
    at?: Vec3;
    /** Center the box at the origin (or at the `at` point). Default: false. */
    centered?: boolean;
}

/**
 * Create a box with the given dimensions.
 *
 * @param width  - Size along X.
 * @param depth  - Size along Y.
 * @param height - Size along Z.
 */
declare function box(width: number, depth: number, height: number, options?: BoxOptions): ValidSolid;

/** Options for {@link cylinder}. */
interface CylinderOptions {
    /** Base position. Default: [0, 0, 0]. */
    at?: Vec3;
    /** Cylinder axis direction. Default: [0, 0, 1] (Z-up). */
    axis?: Vec3;
    /** Center vertically instead of base at origin. */
    centered?: boolean;
}

/**
 * Create a cylinder with the given radius and height.
 */
declare function cylinder(radius: number, height: number, options?: CylinderOptions): ValidSolid;

/** Options for {@link sphere}. */
interface SphereOptions {
    /** Center position. Default: [0, 0, 0]. */
    at?: Vec3;
}

/**
 * Create a sphere with the given radius.
 */
declare function sphere(radius: number, options?: SphereOptions): ValidSolid;

/** Options for {@link cone}. */
interface ConeOptions {
    /** Base position. Default: [0, 0, 0]. */
    at?: Vec3;
    /** Cone axis direction. Default: [0, 0, 1]. */
    axis?: Vec3;
    /** Center vertically instead of base at origin. */
    centered?: boolean;
}

/**
 * Create a cone (or frustum) with the given radii and height.
 *
 * @param bottomRadius - Radius at the base.
 * @param topRadius    - Radius at the top (0 for a full cone).
 * @param height       - Height of the cone.
 */
declare function cone(bottomRadius: number, topRadius: number, height: number, options?: ConeOptions): ValidSolid;

/** Options for {@link torus}. */
interface TorusOptions {
    /** Center position. Default: [0, 0, 0]. */
    at?: Vec3;
    /** Torus axis direction. Default: [0, 0, 1]. */
    axis?: Vec3;
}

/**
 * Create a torus with the given major and minor radii.
 */
declare function torus(majorRadius: number, minorRadius: number, options?: TorusOptions): ValidSolid;

/** Options for {@link ellipsoid}. */
interface EllipsoidOptions {
    /** Center position. Default: [0, 0, 0]. */
    at?: Vec3;
}

/**
 * Create an ellipsoid with the given axis half-lengths.
 *
 * @param rx - Half-length along X.
 * @param ry - Half-length along Y.
 * @param rz - Half-length along Z.
 */
declare function ellipsoid(rx: number, ry: number, rz: number, options?: EllipsoidOptions): ValidSolid;

/** Create a straight edge between two 3D points. */
declare function line(from: Vec3, to: Vec3): Edge;

/** Options for {@link circle}. */
interface CircleOptions {
    /** Center. Default: [0, 0, 0]. */
    at?: Vec3;
    /** Axis direction. Default: [0, 0, 1]. */
    axis?: Vec3;
}

/** Create a circular edge with the given radius. */
declare function circle(radius: number, options?: CircleOptions): Edge;

/** Options for {@link ellipse}. */
interface EllipseOptions {
    /** Center. Default: [0, 0, 0]. */
    at?: Vec3;
    /** Axis direction. Default: [0, 0, 1]. */
    axis?: Vec3;
    /** Major axis direction. */
    xDir?: Vec3;
}

/**
 * Create an elliptical edge.
 *
 * @returns An error if `minorRadius` exceeds `majorRadius`.
 */
declare function ellipse(majorRadius: number, minorRadius: number, options?: EllipseOptions): Result<Edge>;

/** Options for {@link helix}. */
interface HelixOptions {
    /** Base position. Default: [0, 0, 0]. */
    at?: Vec3;
    /** Helix axis. Default: [0, 0, 1]. */
    axis?: Vec3;
    /** Wind in left-hand direction. Default: false. */
    lefthand?: boolean;
}

/**
 * Create a helical wire.
 *
 * @param pitch  - Vertical distance per full turn.
 * @param height - Total height.
 * @param radius - Helix radius.
 */
declare function helix(pitch: number, height: number, radius: number, options?: HelixOptions): Wire;

/** Create a circular arc edge passing through three points. */
declare function threePointArc(p1: Vec3, p2: Vec3, p3: Vec3): Edge;

/** Options for {@link ellipseArc}. */
interface EllipseArcOptions {
    /** Center. Default: [0, 0, 0]. */
    at?: Vec3;
    /** Axis direction. Default: [0, 0, 1]. */
    axis?: Vec3;
    /** Major axis direction. */
    xDir?: Vec3;
}

/**
 * Create an elliptical arc edge between two angles.
 *
 * All angles are in **degrees** (unlike the legacy `makeEllipseArc` which used radians).
 *
 * @param startAngle - Start angle in degrees.
 * @param endAngle   - End angle in degrees.
 */
declare function ellipseArc(majorRadius: number, minorRadius: number, startAngle: number, endAngle: number, options?: EllipseArcOptions): Result<Edge>;

/**
 * Create a B-spline edge that approximates a set of 3D points.
 *
 * @returns An error if the approximation algorithm fails.
 */
declare function bsplineApprox(points: Vec3[], config?: BSplineApproximationOptions): Result<Edge>;

/**
 * Create a Bezier curve edge from control points.
 *
 * @param points - Two or more control points.
 */
declare function bezier(points: Vec3[]): Result<Edge>;

/**
 * Create a circular arc edge tangent to a direction at the start point.
 */
declare function tangentArc(startPoint: Vec3, startTgt: Vec3, endPoint: Vec3): Edge;

/**
 * Assemble edges and/or wires into a single connected wire.
 */
declare function wire(listOfEdges: (Edge | Wire)[]): Result<Wire>;

/**
 * Assemble edges into a wire and verify it forms a closed loop.
 *
 * Combines {@link wire} + the `closedWire` smart constructor in a single step.
 * Returns an error if the edges cannot be assembled or the wire is not closed.
 *
 * @example
 * ```ts
 * const cw = unwrap(wireLoop([e1, e2, e3, e4]));
 * const f = unwrap(face(cw)); // ClosedWire accepted directly
 * ```
 */
declare function wireLoop(listOfEdges: (Edge | Wire)[]): Result<ClosedWire>;

/**
 * Create a planar face from a closed wire, optionally with holes.
 * The resulting face is always oriented (consistent normal direction).
 */
declare function face(w: ClosedWire & PlanarWire, holes?: Array<ClosedWire & PlanarWire>): Result<OrientedFace & PlanarFace>;

/**
 * Create a non-planar face from a wire using surface filling.
 * The resulting face is always oriented.
 */
declare function filledFace(w: ClosedWire): Result<OrientedFace>;

/**
 * Create a face bounded by a wire on an existing face's surface.
 * The resulting face inherits orientation from the origin face.
 */
declare function subFace(originFace: Face, w: ClosedWire): OrientedFace;

/**
 * Create a polygonal face from three or more coplanar points.
 * The resulting face is always oriented.
 */
declare function polygon(points: Vec3[]): Result<OrientedFace & PlanarFace>;

/** Create a vertex at a 3D point. */
declare function vertex(point: Vec3): Vertex;

/**
 * Build a compound from multiple shapes.
 */
declare function compound(shapeArray: AnyShape<Dimension>[]): Compound;

/**
 * Weld faces and shells into a single solid.
 * The resulting solid is always validated.
 */
declare function solid(facesOrShells: Array<Face | Shell>): Result<ValidSolid>;

/**
 * Create an offset shape from a face.
 */
declare function offsetFace(f: Face, distance: number, tolerance?: number): Result<Shape3D>;

/**
 * Weld faces and shells into a single shell.
 */
declare function sewShells(facesOrShells: Array<Face | Shell>, ignoreType?: boolean): Result<Shell>;

/**
 * Add hole wires to an existing face.
 * The resulting face preserves orientation.
 */
declare function addHoles(f: PlanarFace, holes: Array<ClosedWire & PlanarWire>): OrientedFace & PlanarFace;
declare function addHoles(f: Face, holes: ClosedWire[]): OrientedFace;

/** A single transform operation: translate or rotate. */
type TransformOp = {
    readonly type: 'translate';
    readonly v: Vec3;
} | {
    readonly type: 'rotate';
    readonly angle: number;
    readonly axis?: Vec3;
    readonly center?: Vec3;
};

/** A kernel transform with a cleanup function. Call `cleanup()` when done. */
interface ComposedTransform {
    readonly trsf: any;
    readonly cleanup: () => void;
}

/**
 * Compose multiple translate/rotate operations into a single kernel transform.
 * Operations are applied in order (first element applied first).
 * Call `.cleanup()` on the result when done to free the kernel object.
 */
declare function composeTransforms(ops: readonly TransformOp[]): ComposedTransform;

/** Options for {@link rotate}. */
interface RotateOptions {
    /** Pivot point. Default: [0, 0, 0]. */
    at?: Vec3;
    /** Rotation axis. Default: [0, 0, 1] (Z). */
    axis?: Vec3;
}

/** Options for {@link mirror}. */
interface MirrorOptions {
    /** Plane normal. Default: [1, 0, 0]. */
    normal?: Vec3;
    /** Plane origin. Default: [0, 0, 0]. */
    at?: Vec3;
}

/** Options for {@link scale}. */
interface ScaleOptions {
    /** Center of scaling. Default: [0, 0, 0]. */
    center?: Vec3;
}

/** Section (cross-section) a shape with a plane. */
declare function section(shape: Shapeable<AnyShape<Dimension>>, plane: PlaneInput, options?: {
    approximation?: boolean;
    planeSize?: number;
}): Result<AnyShape<Dimension>>;

/** Section a shape with a plane and return a filled Face. */
declare function sectionToFace(shape: Shapeable<AnyShape<Dimension>>, plane: PlaneInput, options?: {
    approximation?: boolean;
    planeSize?: number;
}): Result<Face>;

/** Split a shape with tool shapes. */
declare function split(shape: Shapeable<AnyShape<Dimension>>, tools: AnyShape<Dimension>[]): Result<AnyShape<Dimension>>;

/** Slice a shape with multiple planes. */
declare function slice(shape: Shapeable<AnyShape<Dimension>>, planes: PlaneInput[], options?: {
    approximation?: boolean;
    planeSize?: number;
}): Result<AnyShape<Dimension>[]>;

/** Thicken a surface (face or shell) into a solid. */
declare function thicken(shape: Shapeable<Face<Dimension> | Shell>, thickness: number): Result<Solid>;

/** Mesh a shape for rendering. */
declare function mesh(shape: Shapeable<AnyShape<Dimension>>, options?: meshing.MeshOptions & {
    skipNormals?: boolean;
    includeUVs?: boolean;
    cache?: boolean;
}): meshing.ShapeMesh;

/** Mesh the edges of a shape for wireframe rendering. */
declare function meshEdges(shape: Shapeable<AnyShape<Dimension>>, options?: meshing.MeshOptions & {
    cache?: boolean;
}): meshing.EdgeMesh;

/** Get a summary description of a shape. */
declare function describe(shape: Shapeable<AnyShape<Dimension>>): transforms.ShapeDescription;

/** Serialize a shape to BREP format. */
declare function toBREP(shape: Shapeable<AnyShape<Dimension>>): Result<string>;

/** Deserialize a shape from BREP format. */
declare function fromBREP(data: string): Result<AnyShape<Dimension>>;

/** Check if a shape is valid. */
declare function isValid(shape: Shapeable<AnyShape<Dimension>>): boolean;

/** Check if a shape is empty (null). */
declare function isEmpty(shape: Shapeable<AnyShape<Dimension>>): boolean;

/** Configuration for the functional loft operation. */
interface LoftOptions {
    /** Use ruled (straight) interpolation between profiles. Defaults to `true`. */
    ruled?: boolean;
    /** Optional start vertex before the first wire profile. */
    startPoint?: PointInput;
    /** Optional end vertex after the last wire profile. */
    endPoint?: PointInput;
    /** Sewing tolerance for ThruSections builder. Defaults to `1e-6`. */
    tolerance?: number;
}

/**
 * Extrude a face to produce a solid.
 *
 * @param face   - The face to extrude.
 * @param height - A number for Z-direction extrusion, or a Vec3 direction vector.
 * @returns `Result` containing the extruded solid, or an error if validation or operation fails.
 */
declare function extrude(face: Shapeable<OrientedFace<Dimension> & PlanarFace<Dimension>>, height: number | Vec3): Result<Solid>;

/** Options for {@link revolve}. */
interface RevolveOptions {
    /** Rotation axis. Default: [0, 0, 1] (Z). */
    axis?: Vec3;
    /** Pivot point. Default: [0, 0, 0]. */
    at?: Vec3;
    /** Rotation angle in degrees. Default: 360 (full revolution). */
    angle?: number;
}

/**
 * Revolve a face around an axis to create a solid of revolution.
 */
declare function revolve(face: Shapeable<OrientedFace<Dimension> & PlanarFace<Dimension>>, options?: RevolveOptions): Result<Shape3D>;

/**
 * Loft through a set of wire profiles to create a 3D shape.
 */
declare function loft(wires: Shapeable<Wire<Dimension>>[], options?: lofting.LoftOptions): Result<Shape3D>;

/** Configuration for a single entry in a batch loft operation. */
interface LoftAllEntry {
    /** Ordered wire profiles to loft through. */
    wires: Wire<Dimension>[];
    /** Use ruled (straight) interpolation. Defaults to `true`. */
    ruled?: boolean;
    /** Optional start point before the first wire. */
    startPoint?: PointInput;
    /** Optional end point after the last wire. */
    endPoint?: PointInput;
    /** Sewing tolerance. Defaults to `1e-6`. */
    tolerance?: number;
}

/**
 * Batch loft: build N independent lofts in a single kernel call.
 *
 * Uses the C++ LoftBatch extractor when available (single WASM call),
 * falling back to N individual loft operations otherwise.
 *
 * @returns Array of 3D shapes, one per entry.
 */
declare function loftAll(entries: readonly LoftAllEntry[]): Result<Shape3D[]>;

/** Configuration for {@link thread}. Units are mm; angles derive from pitch. */
interface ThreadOptions {
    /** Core radius (external) or nominal hole radius (internal), at the thread root. */
    radius: number;
    /** Axial distance per full turn. */
    pitch: number;
    /** Total thread length along the axis. Turn count = `height / pitch`. */
    height: number;
    /** Radial thread height (crest minus root). Defaults to `0.6 * pitch` (≈ISO 60° V). */
    depth?: number;
    /** Axial half-width of the V tooth. Defaults to `0.42 * pitch`. */
    toothHalfWidth?: number;
    /** Loft sections per turn — higher is smoother but slower. Defaults to `20`. */
    sectionsPerTurn?: number;
    /** Left-handed thread. Defaults to `false` (right-handed). */
    lefthand?: boolean;
    /** Point the tooth toward the axis (for an internal thread to `cut` from a bore). */
    inward?: boolean;
}

/**
 * Build a helical screw-thread ridge by lofting rotated tooth sections.
 *
 * @param options - {@link ThreadOptions}.
 * @returns `Result` with the thread-ridge solid, or an error.
 *
 * @example External thread (Ø12 rod, 2.5 mm pitch):
 * ```ts
 * const ridge = thread({ radius: 6, pitch: 2.5, height: 7.5 });
 * const rod = fuse(cylinder(6.15, 7.5), unwrap(ridge));
 * ```
 * @example Internal thread (tapped Ø6 hole):
 * ```ts
 * const ridge = thread({ radius: 3, pitch: 1, height: 6, inward: true });
 * const nut = cut(boredBlock, unwrap(ridge));
 * ```
 */
declare function thread(options: ThreadOptions): Result<Shape3D>;

/**
 * Error class thrown by the shape() wrapper when a Result<T> contains an Err.
 * Wraps the structured BrepError for catch-based handling.
 */
declare class BrepWrapperError extends Error {
    readonly code: string;
    readonly kind: string;
    readonly suggestion?: string;
    readonly metadata?: Record<string, any>;
    constructor(brepError: {
        kind: string;
        code: string;
        message: string;
        suggestion?: string;
        metadata?: Record<string, unknown>;
    });
}

type GearDiagnosticSeverity = 'warning' | 'info';

type GearDiagnosticCode = 'CONTACT_RATIO_LOW_SUN_PLANET' | 'CONTACT_RATIO_LOW_PLANET_RING' | 'UNDERCUT_RISK' | 'UNDERCUT_RISK_SUN' | 'UNDERCUT_RISK_PLANET' | 'LEWIS_Y_SHIFT_UNCORRECTED' | 'PLANETARY_SHIFT_KINEMATIC_MISMATCH';

interface GearDiagnostic {
    code: GearDiagnosticCode;
    severity: GearDiagnosticSeverity;
    message: string;
    context?: Record<string, number | string>;
}

interface GearGeometry {
    rPitch: number;
    rb: number;
    /** Outer radius for external, inner for internal. */
    rTip: number;
    /** Inner radius for external, outer for internal. */
    rRoot: number;
    alphaPitch: number;
    /** Half-tooth angular width at the pitch circle, with shift and flank thinning applied. */
    halfToothAngle: number;
    /** Involute parameter α at the radius the flank reaches (rTip ext, rRoot int). */
    alphaTip: number;
    toothPitch: number;
    isInternal: boolean;
}

declare function gearGeometry(z: number, moduleSize: number, alpha: number, shift: number, clearance: number, backlashHalf: number, isInternal: boolean): GearGeometry;

declare function validatePlanetary(zs: number, zp: number, n: number, planetShift: number): Result<void>;

/** Pure-kinematics inputs for {@link planetPlacements}; subset of `PlanetaryGearParams`. */
interface PlanetPlacementParams {
    moduleSize?: number;
    sunTeeth?: number;
    planetTeeth?: number;
    numPlanets?: number;
    pressureAngleDeg?: number;
    sunShift?: number;
    planetShift?: number;
}

interface PlanetPlacement {
    /** Self-rotation around the planet's own Z axis, in degrees. */
    rotationDeg: number;
    /** Center of the planet in the assembly frame: `[x, y, 0]`. */
    position: Vec3;
}

/**
 * Compute the rigid placement of each planet without building any solid.
 *
 * Pairs with one materialized planet from `makeExternalGear` to support
 * GPU-instanced rendering: mesh once, draw N times under these transforms.
 * Defaults match {@link PlanetaryGearParams}.
 */
declare function planetPlacements(params?: PlanetPlacementParams): Result<PlanetPlacement[]>;

interface ExternalGearParams {
    teeth: number;
    moduleSize: number;
    thickness: number;
    pressureAngleDeg?: number;
    shift?: number;
    clearance?: number;
    /**
     * Per-gear flank thinning (mm); 0 = theoretical involute. For an equal-pair
     * mesh, total mesh backlash is 2× this value.
     */
    flankThinning?: number;
    /** Diameter (mm) of central bore; 0 or omitted = no bore. */
    bore?: number;
    /**
     * Sample count per involute flank. Lower = faster mesh, coarser surface.
     * Defaults to `adaptiveSampleCount(moduleSize)` (≈ 16 at module 2). Try
     * 8 for previews, 24+ for 3D printing.
     */
    samples?: number;
}

interface InternalGearParams {
    teeth: number;
    moduleSize: number;
    thickness: number;
    pressureAngleDeg?: number;
    shift?: number;
    clearance?: number;
    flankThinning?: number;
    /** Wall thickness from pitch radius outward; defaults to 2·moduleSize. */
    ringWallThickness?: number;
    /** See {@link ExternalGearParams.samples}. */
    samples?: number;
}

interface PlanetaryGearParams {
    /** Extrusion thickness (mm). */
    thickness: number;
    moduleSize?: number;
    sunTeeth?: number;
    planetTeeth?: number;
    numPlanets?: number;
    pressureAngleDeg?: number;
    clearance?: number;
    /** Total mesh backlash (mm); split as b/2 per gear. */
    backlash?: number;
    sunShift?: number;
    planetShift?: number;
    ringShift?: number;
    ringWallThickness?: number;
    /** Diameter (mm) of central bore in the sun gear; 0 or omitted = no bore. */
    sunBore?: number;
    /** Diameter (mm) of central bore in each planet gear; 0 or omitted = no bore. */
    planetBore?: number;
    /**
     * Applied torque on the SUN (input) shaft, in N·m. Planet and ring stresses
     * are derived via force balance (shared tangential force at the mesh).
     * When supplied, `lewisStress` and `stressConcentrationFactor` are computed.
     */
    appliedTorque?: number;
    /** See {@link ExternalGearParams.samples}. Applied to sun, planet, and ring. */
    samples?: number;
}

interface GearResult {
    solid: ValidSolid;
    pitchDiameter: number;
    baseDiameter: number;
    tipDiameter: number;
    rootDiameter: number;
    /**
     * Diagnostics specific to this gear in isolation (e.g. undercut risk for
     * low-tooth-count gears with no profile shift). Empty when the gear is
     * geometrically clean. Planetary assemblies emit additional cross-mesh
     * diagnostics on `PlanetaryGearAssembly.diagnostics`.
     */
    diagnostics: GearDiagnostic[];
}

interface PlanetaryGearAssembly {
    sun: ValidSolid;
    planets: ValidSolid[];
    ring: ValidSolid;
    ringTeeth: number;
    /** Working pressure angle (radians) under the supplied profile shifts. */
    workingPressureAngle: number;
    /** True (working) center distance between sun and planet axes (mm). */
    centerDistance: number;
    /** Transverse contact ratios per mesh; ≥ 1.2 is industry-acceptable. */
    contactRatio: {
        sunPlanet: number;
        planetRing: number;
    };
    /**
     * Additional profile shift each gear needs to clear the undercut threshold.
     * Positive = undercut risk; zero = clear.
     */
    undercutDeficit: {
        sun: number;
        planet: number;
    };
    /**
     * Root bending stress (MPa) at each gear, with the fillet stress
     * concentration factor applied: `σ = σ_Lewis · K_f`. Only present when
     * `appliedTorque` was supplied. See {@link stressConcentrationFactor} for
     * the K_f values used.
     */
    lewisStress?: {
        sun: number;
        planet: number;
        ring: number;
    };
    /**
     * Dolan-Broghamer stress concentration factor `K_f` at each gear's root
     * fillet, the multiplier already folded into {@link lewisStress}. Exposed
     * so callers can recover the raw Lewis stress (σ_Lewis = lewisStress / K_f)
     * or compare against ISO 6336-3 `Y_F·Y_S` from an external check. The ring
     * value uses the Niemann internal-gear reduction (concave fillet).
     */
    stressConcentrationFactor?: {
        sun: number;
        planet: number;
        ring: number;
    };
    diagnostics: GearDiagnostic[];
}

declare function makeExternalGear(params: ExternalGearParams): Result<GearResult>;

declare function makeInternalGear(params: InternalGearParams): Result<GearResult>;

declare function makePlanetaryGear(params: PlanetaryGearParams): Result<PlanetaryGearAssembly>;

interface BrepkitAdapter extends KernelAdapter, ConstraintSketchCapability, BrepkitExtensions {
}
/**
 * `KernelAdapter` backed by brepkit's WASM kernel.
 *
 * All methods are composed from per-domain factories at construction time.
 * To find a method's implementation, grep for `function <name>` in
 * `src/kernel/brepkit/*Ops.ts`.
 */
declare class BrepkitAdapter {
    readonly oc: KernelInstance;
    readonly kernelId = "brepkit";
    readonly capabilities: KernelCapabilities;
    /** The underlying brepkit WASM kernel instance (typed). */
    private readonly bk;
    constructor(brepkitKernel: KernelInstance);
}

declare class OcctWasmAdapter implements KernelAdapter {
    readonly oc: KernelInstance;
    readonly kernelId = "occt-wasm";
    readonly capabilities: KernelCapabilities;
    private readonly Module;
    private readonly k;
    private readonly owner;
    constructor(module: OcctWasmModule, kernel: OcctKernelWasm, owner?: OcctKernelOwner);
    /**
     * Build an adapter from occt-wasm's `OcctKernel` wrapper, retaining it for the
     * adapter's lifetime. Prefer this over the raw `(module, kernel)` constructor:
     * the wrapper deletes its raw kernel when garbage-collected, so an adapter that
     * only borrows the raw kernel can be left pointing at freed memory.
     */
    static fromKernel(kernel: OcctKernelOwner): OcctWasmAdapter;
    /** The owner retained to keep the borrowed raw kernel alive, or `undefined` when built from a raw kernel. */
    get retainedKernelOwner(): OcctKernelOwner | undefined;
    dispose(h: {
        delete(): void;
    }): void;
    executeBatch(_json: string): string;
    checkpoint(): number;
    checkpointCount(): number;
    restoreCheckpoint(_cp: number): void;
    discardCheckpoint(_cp: number): void;
    makeBox(width: number, height: number, depth: number): KernelShape;
    makeCylinder(radius: number, height: number, center?: [number, number, number], direction?: [number, number, number]): KernelShape;
    makeSphere(radius: number, center?: [number, number, number]): KernelShape;
    makeCone(radius1: number, radius2: number, height: number, center?: [number, number, number], direction?: [number, number, number]): KernelShape;
    makeTorus(majorRadius: number, minorRadius: number, center?: [number, number, number], direction?: [number, number, number]): KernelShape;
    makeEllipsoid(aLength: number, bLength: number, cLength: number): KernelShape;
    makeBoxFromCorners(p1: [number, number, number], p2: [number, number, number]): KernelShape;
    makeRectangle(width: number, height: number): KernelShape;
    fuse(shape: KernelShape, tool: KernelShape, options?: BooleanOptions): KernelShape;
    cut(shape: KernelShape, tool: KernelShape, options?: BooleanOptions): KernelShape;
    intersect(shape: KernelShape, tool: KernelShape, options?: BooleanOptions): KernelShape;
    section(shape: KernelShape, plane: KernelShape, approximation?: boolean): KernelShape;
    fuseAll(shapes: KernelShape[], options?: BooleanOptions): KernelShape;
    cutAll(shape: KernelShape, tools: KernelShape[], options?: BooleanOptions): KernelShape;
    split(shape: KernelShape, tools: KernelShape[]): KernelShape;
    checkBoolean(shape: KernelShape, tool: KernelShape, op: BooleanOpType): CheckBooleanResult;
    meshBoolean(positionsA: number[], indicesA: number[], positionsB: number[], indicesB: number[], op: string, tolerance: number): KernelMeshResult;
    makeVertex(x: number, y: number, z: number): KernelShape;
    makeEdge(curve: KernelType, _start?: number, _end?: number): KernelShape;
    makeWire(edges: KernelShape[]): KernelShape;
    makeFace(wire: KernelShape, planar?: boolean): KernelShape;
    makeLineEdge(p1: [number, number, number], p2: [number, number, number]): KernelShape;
    makeCircleEdge(center: [number, number, number], normal: [number, number, number], radius: number): KernelShape;
    makeCircleArc(center: [number, number, number], normal: [number, number, number], radius: number, startAngle: number, endAngle: number): KernelShape;
    makeArcEdge(p1: [number, number, number], p2: [number, number, number], p3: [number, number, number]): KernelShape;
    makeEllipseEdge(center: [number, number, number], normal: [number, number, number], majorRadius: number, minorRadius: number, _xDir?: [number, number, number]): KernelShape;
    makeEllipseArc(center: [number, number, number], normal: [number, number, number], majorRadius: number, minorRadius: number, startAngle: number, endAngle: number, _xDir?: [number, number, number]): KernelShape;
    makeBezierEdge(points: [number, number, number][]): KernelShape;
    makeTangentArc(startPoint: [number, number, number], startTangent: [number, number, number], endPoint: [number, number, number]): KernelShape;
    makeHelixWire(pitch: number, height: number, radius: number, center?: [number, number, number], direction?: [number, number, number], _leftHanded?: boolean): KernelShape;
    makeWireFromMixed(items: KernelShape[]): KernelShape;
    makeCompound(shapes: KernelShape[]): KernelShape;
    solidFromShell(shell: KernelShape): KernelShape;
    hull(shapes: KernelShape[], tolerance: number): KernelShape;
    hullFromPoints(points: Array<{
        x: number;
        y: number;
        z: number;
    }>, tolerance: number): KernelShape;
    buildSolidFromFaces(points: Array<{
        x: number;
        y: number;
        z: number;
    }>, faces: Array<readonly [number, number, number]>, tolerance: number): KernelShape;
    makeNonPlanarFace(wire: KernelShape): KernelShape;
    addHolesInFace(face: KernelShape, holeWires: KernelShape[]): KernelShape;
    removeHolesFromFace(face: KernelShape): KernelShape;
    makeFaceOnSurface(surface: KernelType, wire: KernelShape): KernelShape;
    bsplineSurface(points: [number, number, number][], rows: number, cols: number): KernelShape;
    triangulatedSurface(points: [number, number, number][], rows: number, cols: number): KernelShape;
    buildTriFace(a: [number, number, number], b: [number, number, number], c: [number, number, number]): KernelShape | null;
    sewAndSolidify(faces: KernelShape[], tolerance: number): KernelShape;
    createPoint3d(x: number, y: number, z: number): KernelType;
    createDirection3d(x: number, y: number, z: number): KernelType;
    createVector3d(x: number, y: number, z: number): KernelType;
    createAxis1(cx: number, cy: number, cz: number, dx: number, dy: number, dz: number): KernelType;
    createAxis2(ox: number, oy: number, oz: number, zx: number, zy: number, zz: number, xx?: number, xy?: number, xz?: number): KernelType;
    createAxis3(ox: number, oy: number, oz: number, zx: number, zy: number, zz: number, xx?: number, xy?: number, xz?: number): KernelType;
    extrude(face: KernelShape, direction: [number, number, number], length: number): KernelShape;
    revolve(shape: KernelShape, axis: KernelType, angle: number): KernelShape;
    loft(wires: KernelShape[], ruled?: boolean, startShape?: KernelShape, endShape?: KernelShape): KernelShape;
    sweep(wire: KernelShape, spine: KernelShape, options?: {
        transitionMode?: number;
    }): KernelShape;
    simplePipe(profile: KernelShape, spine: KernelShape): KernelShape;
    helicalSweep(_profile: KernelShape, _axisOrigin: [number, number, number], _axisDirection: [number, number, number], _radius: number, _pitch: number, _turns: number): KernelShape;
    sweepWithOptions(_profile: KernelShape, _pathEdge: KernelShape, _contactMode: string, _scaleValues: number[], _segments: number): KernelShape;
    sweepPipeShell(profile: KernelShape, spine: KernelShape, options?: {
        transitionMode?: 'transformed' | 'round' | 'right';
        auxiliary?: KernelShape;
        law?: KernelType;
        contact?: boolean;
        correction?: boolean;
        frenet?: boolean;
        support?: KernelType;
        shellMode?: boolean;
        tolerance?: number | undefined;
        boundTolerance?: number | undefined;
        angularTolerance?: number | undefined;
        maxDegree?: number | undefined;
        maxSegments?: number | undefined;
    }): KernelShape | {
        shape: KernelShape;
        firstShape: KernelShape;
        lastShape: KernelShape;
    };
    loftAdvanced(wires: KernelShape[], options?: {
        solid?: boolean;
        ruled?: boolean;
        tolerance?: number;
        startVertex?: KernelShape;
        endVertex?: KernelShape;
    }): KernelShape;
    buildExtrusionLaw(profile: 'linear' | 's-curve', length: number, endFactor: number): KernelType;
    revolveVec(shape: KernelShape, center: [number, number, number], direction: [number, number, number], angle: number): KernelShape;
    draftPrism(shape: KernelShape, face: KernelShape, baseFace: KernelShape, height: number | null, angleDeg: number, fuse: boolean): KernelShape;
    fillet(shape: KernelShape, edges: KernelShape[], radius: number | [number, number] | ((edge: KernelShape) => number | [number, number])): KernelShape;
    chamfer(shape: KernelShape, edges: KernelShape[], distance: number | [number, number] | ((edge: KernelShape) => number | [number, number])): KernelShape;
    chamferDistAngle(shape: KernelShape, edges: KernelShape[], distance: number, angleDeg: number): KernelShape;
    shell(shape: KernelShape, faces: KernelShape[], thickness: number, tolerance?: number): KernelShape;
    thicken(shape: KernelShape, thickness: number): KernelShape;
    offset(shape: KernelShape, distance: number, tolerance?: number): KernelShape;
    filletVariable(shape: KernelShape, spec: string): KernelShape;
    draft(shape: KernelShape, faces: KernelShape[], pullDirection: [number, number, number], neutralPlane: [number, number, number], angleDeg: number | ((face: KernelShape) => number)): KernelShape;
    defeature(shape: KernelShape, faces: KernelShape[]): KernelShape;
    offsetWire2D(wire: KernelShape, offset: number, joinType?: number | 'arc' | 'intersection' | 'tangent'): KernelShape;
    simplify(shape: KernelShape): KernelShape;
    reverseShape(shape: KernelShape): KernelShape;
    composeTransform(ops: Array<{
        type: 'translate';
        x: number;
        y: number;
        z: number;
    } | {
        type: 'rotate';
        angle: number;
        axis?: readonly [number, number, number] | undefined;
        center?: readonly [number, number, number] | undefined;
    }>): {
        handle: KernelType;
        dispose: () => void;
    };
    transform(shape: KernelShape, trsf: KernelType): KernelShape;
    translate(shape: KernelShape, x: number, y: number, z: number): KernelShape;
    rotate(shape: KernelShape, angle: number, axis?: readonly [number, number, number], center?: readonly [number, number, number]): KernelShape;
    mirror(shape: KernelShape, origin: readonly [number, number, number], normal: readonly [number, number, number]): KernelShape;
    scale(shape: KernelShape, center: readonly [number, number, number], factor: number): KernelShape;
    generalTransform(shape: KernelShape, linear: readonly [number, number, number, number, number, number, number, number, number], translation: readonly [number, number, number], isOrthogonal: boolean): KernelShape;
    generalTransformNonOrthogonal(shape: KernelShape, linear: readonly [number, number, number, number, number, number, number, number, number], translation: readonly [number, number, number]): KernelShape;
    positionOnCurve(shape: KernelShape, spine: KernelShape, param: number): KernelShape;
    linearPattern(shape: KernelShape, direction: [number, number, number], spacing: number, count: number): KernelShape[];
    circularPattern(shape: KernelShape, center: [number, number, number], axis: [number, number, number], angleStep: number, count: number): KernelShape[];
    transformBatch(entries: TransformEntry[]): KernelShape[];
    translateWithHistory(shape: KernelShape, x: number, y: number, z: number, inputFaceHashes: number[], hashUpperBound: number): OperationResult;
    rotateWithHistory(shape: KernelShape, angle: number, inputFaceHashes: number[], hashUpperBound: number, axis?: readonly [number, number, number], center?: readonly [number, number, number]): OperationResult;
    mirrorWithHistory(shape: KernelShape, origin: readonly [number, number, number], normal: readonly [number, number, number], inputFaceHashes: number[], hashUpperBound: number): OperationResult;
    scaleWithHistory(shape: KernelShape, center: readonly [number, number, number], factor: number, inputFaceHashes: number[], hashUpperBound: number): OperationResult;
    generalTransformWithHistory(shape: KernelShape, linear: readonly [number, number, number, number, number, number, number, number, number], translation: readonly [number, number, number], isOrthogonal: boolean, inputFaceHashes: number[], _hashUpperBound: number): OperationResult;
    fuseWithHistory(shape: KernelShape, tool: KernelShape, inputFaceHashes: number[], hashUpperBound: number, options?: BooleanOptions): DiagnosticOperationResult;
    cutWithHistory(shape: KernelShape, tool: KernelShape, inputFaceHashes: number[], hashUpperBound: number, options?: BooleanOptions): DiagnosticOperationResult;
    intersectWithHistory(shape: KernelShape, tool: KernelShape, inputFaceHashes: number[], hashUpperBound: number, options?: BooleanOptions): DiagnosticOperationResult;
    filletWithHistory(shape: KernelShape, edges: KernelShape[], radius: number | [number, number] | ((edge: KernelShape) => number | [number, number]), inputFaceHashes: number[], hashUpperBound: number): OperationResult;
    chamferWithHistory(shape: KernelShape, edges: KernelShape[], distance: number | [number, number] | ((edge: KernelShape) => number | [number, number]), inputFaceHashes: number[], hashUpperBound: number): OperationResult;
    shellWithHistory(shape: KernelShape, faces: KernelShape[], thickness: number, inputFaceHashes: number[], hashUpperBound: number, tolerance?: number): OperationResult;
    thickenWithHistory(shape: KernelShape, thickness: number, inputFaceHashes: number[], hashUpperBound: number): OperationResult;
    offsetWithHistory(shape: KernelShape, distance: number, inputFaceHashes: number[], hashUpperBound: number, tolerance?: number): OperationResult;
    draftWithHistory(shape: KernelShape, faces: KernelShape[], pullDirection: [number, number, number], _neutralPlane: [number, number, number], angleDeg: number | ((face: KernelShape) => number), _inputFaceHashes: number[], _hashUpperBound: number): OperationResult;
    applyComposedTransformWithHistory(shape: KernelShape, transformHandle: KernelType, inputFaceHashes: number[], hashUpperBound: number): OperationResult;
    mesh(shape: KernelShape, options: MeshOptions): KernelMeshResult;
    meshEdges(shape: KernelShape, tolerance: number, angularTolerance: number): KernelEdgeMeshResult;
    hasTriangulation(shape: KernelShape): boolean;
    meshShape(shape: KernelShape, tolerance: number, angularTolerance: number): void;
    exportSTEP(shapes: KernelShape[]): string;
    exportSTL(shape: KernelShape, binary?: boolean, tolerance?: number, angularTolerance?: number): string | ArrayBuffer;
    importSTEP(data: string | ArrayBuffer): KernelShape[];
    importSTL(data: string | ArrayBuffer): KernelShape;
    exportIGES(shapes: KernelShape[]): string;
    importIGES(data: string | ArrayBuffer): KernelShape[];
    exportSTEPAssembly(parts: StepAssemblyPart[], options?: {
        unit?: string;
    }): string;
    export3MF(_shape: KernelShape, _tolerance: number): ArrayBuffer;
    exportGLB(shape: KernelShape, tolerance: number): ArrayBuffer;
    exportOBJ(shape: KernelShape, tolerance: number): ArrayBuffer;
    exportPLY(shape: KernelShape, tolerance: number): ArrayBuffer;
    import3MF(_data: ArrayBuffer): KernelShape[];
    importOBJ(_data: ArrayBuffer): KernelShape;
    importGLB(_data: ArrayBuffer): KernelShape;
    toBREP(shape: KernelShape): string;
    fromBREP(data: string): KernelShape;
    createXCAFDocument(shapes: Array<{
        shape: KernelShape;
        name: string;
        color?: [number, number, number, number] | undefined;
    }>): KernelType;
    writeXCAFToSTEP(doc: KernelType, options?: {
        unit?: string | undefined;
        modelUnit?: string | undefined;
    }): string;
    exportSTEPConfigured(shapes: Array<{
        shape: KernelShape;
        name?: string | undefined;
        color?: [number, number, number, number] | undefined;
    }>, options?: {
        unit?: string | undefined;
        modelUnit?: string | undefined;
        schema?: number | undefined;
    }): string;
    volume(shape: KernelShape): number;
    area(shape: KernelShape): number;
    length(shape: KernelShape): number;
    centerOfMass(shape: KernelShape): [number, number, number];
    linearCenterOfMass(shape: KernelShape): [number, number, number];
    boundingBox(shape: KernelShape): {
        min: [number, number, number];
        max: [number, number, number];
    };
    distance(shape1: KernelShape, shape2: KernelShape): DistanceResult;
    surfaceCurvature(face: KernelShape, u: number, v: number): {
        gaussian: number;
        mean: number;
        max: number;
        min: number;
        maxDirection: [number, number, number];
        minDirection: [number, number, number];
    };
    surfaceCenterOfMass(face: KernelShape): [number, number, number];
    measureBulk(shape: KernelShape, includeLinear?: boolean): BulkMeasurement;
    createDistanceQuery(referenceShape: KernelShape): {
        distanceTo(shape: KernelShape): {
            value: number;
            point1: [number, number, number];
            point2: [number, number, number];
        };
        dispose(): void;
    };
    iterShapes(shape: KernelShape, type: ShapeType): KernelShape[];
    iterShapeList(_list: KernelShape, _callback: (item: KernelShape) => void): void;
    shapeType(shape: KernelShape): ShapeType;
    isSame(a: KernelShape, b: KernelShape): boolean;
    isEqual(a: KernelShape, b: KernelShape): boolean;
    downcast(shape: KernelShape, type?: ShapeType): KernelShape;
    hashCode(shape: KernelShape, upperBound: number): number;
    isNull(shape: KernelShape): boolean;
    shapeOrientation(shape: KernelShape): ShapeOrientation;
    edgeToFaceMap(shape: KernelShape): string;
    sharedEdges(faceA: KernelShape, faceB: KernelShape): KernelShape[];
    adjacentFaces(shape: KernelShape, face: KernelShape): KernelShape[];
    sew(shapes: KernelShape[], tolerance?: number): KernelShape;
    curveType(shape: KernelShape): string;
    curveParameters(shape: KernelShape): [number, number];
    curvePointAtParam(shape: KernelShape, param: number): [number, number, number];
    curveTangent(shape: KernelShape, param: number): {
        point: [number, number, number];
        tangent: [number, number, number];
    };
    curveIsClosed(shape: KernelShape): boolean;
    curveIsPeriodic(shape: KernelShape): boolean;
    curvePeriod(shape: KernelShape): number;
    interpolatePoints(points: [number, number, number][], options?: {
        periodic?: boolean;
        tolerance?: number;
    }): KernelShape;
    approximatePoints(points: [number, number, number][], options?: {
        tolerance?: number;
        degMin?: number;
        degMax?: number;
        smoothing?: [number, number, number] | null;
    }): KernelShape;
    curveDegreeElevate(edge: KernelShape, elevateBy: number): KernelShape;
    curveKnotInsert(edge: KernelShape, knot: number, times: number): KernelShape;
    curveKnotRemove(edge: KernelShape, knot: number, tolerance: number): KernelShape;
    curveSplit(edge: KernelShape, param: number): [KernelShape, KernelShape];
    getBezierPenultimatePole(edge: KernelShape): [number, number, number] | null;
    createCurveAdaptor(_shape: KernelShape): KernelType;
    vertexPosition(vertex: KernelShape): [number, number, number];
    surfaceType(face: KernelShape): SurfaceType;
    uvBounds(face: KernelShape): {
        uMin: number;
        uMax: number;
        vMin: number;
        vMax: number;
    };
    outerWire(face: KernelShape): KernelShape;
    surfaceNormal(face: KernelShape, u: number, v: number): [number, number, number];
    pointOnSurface(face: KernelShape, u: number, v: number): [number, number, number];
    uvFromPoint(face: KernelShape, point: [number, number, number]): [number, number] | null;
    projectPointOnFace(face: KernelShape, point: [number, number, number]): [number, number, number];
    classifyPointOnFace(face: KernelShape, u: number, v: number, tolerance?: number): 'in' | 'on' | 'out';
    classifyPointRobust(_shape: KernelShape, _point: [number, number, number], _tolerance: number): string;
    classifyPointWinding(_shape: KernelShape, _point: [number, number, number], _tolerance: number): string;
    approximateSurfaceLspia(_coords: number[], _rows: number, _cols: number, _degreeU: number, _degreeV: number, _numCpsU: number, _numCpsV: number, _tolerance: number, _maxIterations: number): KernelShape;
    untrimFace(_face: KernelShape, _samplesPerCurve: number, _interiorSamples: number): KernelShape;
    getSurfaceCylinderData(surface: KernelType): {
        radius: number;
        isDirect: boolean;
    } | null;
    getSurfaceAxis(face: KernelShape): {
        origin: [number, number, number];
        direction: [number, number, number];
    } | null;
    reverseSurfaceU(_surface: KernelType): KernelType;
    detectSmallFeatures(_shape: KernelShape, _areaThreshold: number, _tolerance: number): KernelShape[];
    recognizeFeatures(_shape: KernelShape, _tolerance: number): string;
    projectEdges(shape: KernelShape, cameraOrigin: [number, number, number], cameraDirection: [number, number, number], cameraXAxis?: [number, number, number]): {
        visible: {
            outline: KernelShape;
            smooth: KernelShape;
            sharp: KernelShape;
        };
        hidden: {
            outline: KernelShape;
            smooth: KernelShape;
            sharp: KernelShape;
        };
    };
    isValid(shape: KernelShape): boolean;
    healSolid(shape: KernelShape): KernelShape | null;
    healFace(shape: KernelShape): KernelShape;
    healWire(wire: KernelShape, face?: KernelShape): KernelShape;
    mergeCoincidentVertices(shape: KernelShape, tolerance: number): number;
    removeDegenerateEdges(shape: KernelShape, tolerance: number): number;
    fixFaceOrientations(shape: KernelShape): number;
    fixShape(shape: KernelShape): KernelShape;
    fixSelfIntersection(_wire: KernelShape): KernelShape;
    createPoint2d(x: number, y: number): KernelType;
    createDirection2d(x: number, y: number): KernelType;
    createVector2d(x: number, y: number): KernelType;
    createAxis2d(px: number, py: number, dx: number, dy: number): KernelType;
    wrapCurve2dHandle(h: KernelType): Curve2dHandle;
    createCurve2dAdaptor(_handle: Curve2dHandle): KernelType;
    makeLine2d(x1: number, y1: number, x2: number, y2: number): Curve2dHandle;
    makeCircle2d(cx: number, cy: number, radius: number, sense?: boolean): Curve2dHandle;
    makeArc2dThreePoints(x1: number, y1: number, xm: number, ym: number, x2: number, y2: number): Curve2dHandle;
    makeArc2dTangent(startX: number, startY: number, tangentX: number, tangentY: number, endX: number, endY: number): Curve2dHandle;
    makeEllipse2d(cx: number, cy: number, majorRadius: number, minorRadius: number, xDirX?: number, xDirY?: number, sense?: boolean): Curve2dHandle;
    makeEllipseArc2d(cx: number, cy: number, majorRadius: number, minorRadius: number, startAngle: number, endAngle: number, xDirX?: number, xDirY?: number, sense?: boolean): Curve2dHandle;
    makeBezier2d(points: [number, number][]): Curve2dHandle;
    makeBSpline2d(points: [number, number][], _options?: {
        degMin?: number;
        degMax?: number;
        continuity?: 'C0' | 'C1' | 'C2' | 'C3';
        tolerance?: number;
        smoothing?: [number, number, number] | null;
    }): Curve2dHandle;
    evaluateCurve2d(curve: Curve2dHandle, param: number): [number, number];
    evaluateCurve2dD1(curve: Curve2dHandle, param: number): {
        point: [number, number];
        tangent: [number, number];
    };
    getCurve2dBounds(curve: Curve2dHandle): {
        first: number;
        last: number;
    };
    getCurve2dType(curve: Curve2dHandle): string;
    trimCurve2d(curve: Curve2dHandle, start: number, end: number): Curve2dHandle;
    reverseCurve2d(curve: Curve2dHandle): void;
    copyCurve2d(curve: Curve2dHandle): Curve2dHandle;
    offsetCurve2d(curve: Curve2dHandle, offset: number): Curve2dHandle;
    translateCurve2d(curve: Curve2dHandle, dx: number, dy: number): Curve2dHandle;
    rotateCurve2d(curve: Curve2dHandle, angle: number, cx: number, cy: number): Curve2dHandle;
    scaleCurve2d(curve: Curve2dHandle, factor: number, cx: number, cy: number): Curve2dHandle;
    mirrorCurve2dAtPoint(curve: Curve2dHandle, cx: number, cy: number): Curve2dHandle;
    mirrorCurve2dAcrossAxis(curve: Curve2dHandle, originX: number, originY: number, dirX: number, dirY: number): Curve2dHandle;
    affinityTransform2d(curve: Curve2dHandle, axisOriginX: number, axisOriginY: number, axisDirX: number, axisDirY: number, ratio: number): Curve2dHandle;
    createIdentityGTrsf2d(): KernelType;
    createAffinityGTrsf2d(originX: number, originY: number, dirX: number, dirY: number, ratio: number): KernelType;
    createTranslationGTrsf2d(dx: number, dy: number): KernelType;
    createMirrorGTrsf2d(cx: number, cy: number, mode: 'point' | 'axis', originX?: number, originY?: number, dirX?: number, dirY?: number): KernelType;
    createRotationGTrsf2d(angle: number, cx: number, cy: number): KernelType;
    createScaleGTrsf2d(factor: number, cx: number, cy: number): KernelType;
    setGTrsf2dTranslationPart(gtrsf: KernelType, dx: number, dy: number): void;
    multiplyGTrsf2d(base: KernelType, other: KernelType): void;
    transformCurve2dGeneral(curve: Curve2dHandle, gtrsf: KernelType): Curve2dHandle;
    intersectCurves2d(c1: Curve2dHandle, c2: Curve2dHandle, tolerance: number): {
        points: [number, number][];
        segments: Curve2dHandle[];
    };
    projectPointOnCurve2d(curve: Curve2dHandle, x: number, y: number): {
        param: number;
        distance: number;
    } | null;
    distanceBetweenCurves2d(c1: Curve2dHandle, c2: Curve2dHandle, p1Start: number, p1End: number, p2Start: number, p2End: number): number;
    approximateCurve2dAsBSpline(curve: Curve2dHandle, _tolerance: number, _continuity: 'C0' | 'C1' | 'C2' | 'C3', maxSegments: number): Curve2dHandle;
    decomposeBSpline2dToBeziers(curve: Curve2dHandle): Curve2dHandle[];
    createBoundingBox2d(): BBox2dHandle;
    addCurveToBBox2d(bbox: BBox2dHandle, curve: Curve2dHandle, tolerance: number): void;
    getBBox2dBounds(bbox: BBox2dHandle): {
        xMin: number;
        yMin: number;
        xMax: number;
        yMax: number;
    };
    mergeBBox2d(target: BBox2dHandle, other: BBox2dHandle): void;
    isBBox2dOut(a: BBox2dHandle, b: BBox2dHandle): boolean;
    isBBox2dOutPoint(bbox: BBox2dHandle, x: number, y: number): boolean;
    getCurve2dCircleData(curve: Curve2dHandle): {
        cx: number;
        cy: number;
        radius: number;
        isDirect: boolean;
    } | null;
    getCurve2dEllipseData(curve: Curve2dHandle): {
        majorRadius: number;
        minorRadius: number;
        xAxisAngle: number;
        isDirect: boolean;
    } | null;
    getCurve2dBezierPoles(curve: Curve2dHandle): [number, number][] | null;
    getCurve2dBezierDegree(curve: Curve2dHandle): number | null;
    getCurve2dBSplineData(_curve: Curve2dHandle): {
        poles: [number, number][];
        knots: number[];
        multiplicities: number[];
        degree: number;
        isPeriodic: boolean;
    } | null;
    serializeCurve2d(curve: Curve2dHandle): string;
    deserializeCurve2d(data: string): Curve2dHandle;
    splitCurve2d(curve: Curve2dHandle, params: number[]): Curve2dHandle[];
    liftCurve2dToPlane(curve: Curve2dHandle, planeOrigin: [number, number, number], planeZ: [number, number, number], planeX: [number, number, number]): KernelShape;
    buildEdgeOnSurface(curve: Curve2dHandle, surface: KernelType): KernelShape;
    extractSurfaceFromFace(face: KernelShape): KernelType;
    extractCurve2dFromEdge(_edge: KernelShape, _face: KernelShape): Curve2dHandle;
    buildCurves3d(wire: KernelShape): void;
    fixWireOnFace(wire: KernelShape, face: KernelShape, tolerance: number): KernelShape;
    fillSurface(_wires: KernelShape[], _options?: {
        order?: number;
        nbPtsOnCur?: number;
        nbIter?: number;
        tol3d?: number;
        tol2d?: number;
        maxDeg?: number;
        maxSeg?: number;
    }): KernelShape;
    getNurbsCurveData(edge: KernelShape): NurbsCurveData | null;
}

/** A disposable wrapper for any kernel object. */
interface KernelHandle<T extends Deletable> {
    readonly value: T;
    readonly disposed: boolean;
    [Symbol.dispose](): void;
}

/** Create a disposable handle for any kernel object. */
declare function createKernelHandle<T extends Deletable>(ocObj: T): KernelHandle<T>;

/** Scope for tracking multiple disposable resources. */
declare class DisposalScope implements Disposable {
    private readonly handles;
    constructor();
    /** Register a resource for disposal when scope ends. */
    register<T extends Deletable>(resource: T): T;
    /** Register a disposable for disposal when scope ends. */
    track<T extends Disposable>(disposable: T): T;
    [Symbol.dispose](): void;
}

/**
 * Represent a closed or open 2D profile as an ordered list of curves.
 *
 * A Blueprint is the fundamental 2D drawing primitive: it stores an ordered
 * sequence of {@link Curve2D} segments that together describe a planar profile.
 * Blueprints can be transformed (translate, rotate, scale, mirror, stretch),
 * projected onto 3D planes or faces, combined with boolean operations, and
 * serialized to SVG.
 *
 * Create instances via {@link BlueprintSketcher} rather than calling the
 * constructor directly.
 *
 * @example
 * ```ts
 * const bp = new BlueprintSketcher()
 *   .movePointerTo([0, 0])
 *   .lineTo([10, 0])
 *   .lineTo([10, 10])
 *   .lineTo([0, 10])
 *   .close();
 *
 * // sketchOnPlane returns SketchData (wire + metadata), not a Face
 * const sketch = bp.sketchOnPlane("XY");
 * ```
 *
 * @see {@link CompoundBlueprint} for blueprints with holes.
 * @see {@link Blueprints} for collections of disjoint blueprints.
 * @see {@link createBlueprint} for the functional API equivalent.
 */
declare class Blueprint implements DrawingInterface {
    /** Ordered 2D curve segments that compose this blueprint. */
    curves: Curve2D[];
    protected _boundingBox: null | BoundingBox2d;
    private readonly _orientation;
    private _guessedOrientation;
    /** Create a blueprint from an ordered array of 2D curves.
     *
     * @throws BrepBugError if the curves array is empty (use {@link createBlueprint} for Result-based validation).
     */
    constructor(curves: Curve2D[]);
    /** Release WASM resources held by the underlying curves and bounding box. */
    delete(): void;
    [Symbol.dispose](): void;
    /** Return a deep copy of this blueprint. */
    clone(): Blueprint;
    /** Return a multi-line string representation for debugging. */
    get repr(): string;
    /** Compute (and cache) the axis-aligned bounding box of all curves. */
    get boundingBox(): BoundingBox2d;
    /** Determine the winding direction of the blueprint via the shoelace formula.
     *
     * @remarks Uses an approximation based on curve midpoints for non-linear
     * segments. The result is cached after the first call.
     */
    get orientation(): 'clockwise' | 'counterClockwise';
    /**
     * Stretch the blueprint along a direction by a given ratio.
     *
     * @param ratio - Stretch factor (1 = unchanged).
     * @param direction - Unit direction vector to stretch along.
     * @param origin - Fixed point of the stretch (defaults to the origin).
     * @returns A new stretched Blueprint.
     */
    stretch(ratio: number, direction: Point2D, origin?: Point2D): Blueprint;
    /**
     * Uniformly scale the blueprint around a center point.
     *
     * @param scaleFactor - Scale multiplier (>1 enlarges, <1 shrinks).
     * @param center - Center of scaling (defaults to the bounding box center).
     * @returns A new scaled Blueprint.
     */
    scale(scaleFactor: number, center?: Point2D): Blueprint;
    /**
     * Rotate the blueprint by an angle in degrees.
     *
     * @param angle - Rotation angle in degrees (positive = counter-clockwise).
     * @param center - Center of rotation (defaults to the origin).
     * @returns A new rotated Blueprint.
     */
    rotate(angle: number, center?: Point2D): Blueprint;
    /**
     * Translate the blueprint by separate x/y distances or a vector.
     *
     * @returns A new translated Blueprint.
     */
    translate(xDist: number, yDist: number): Blueprint;
    translate(translationVector: Point2D): Blueprint;
    /**
     * Mirror the blueprint across a point or plane.
     *
     * @param centerOrDirection - Mirror center (center mode) or plane normal (plane mode).
     * @param origin - Origin for plane-mode mirroring.
     * @param mode - `'center'` for point symmetry, `'plane'` for reflection across an axis.
     * @returns A new mirrored Blueprint.
     */
    mirror(centerOrDirection: Point2D, origin?: Point2D, mode?: 'center' | 'plane'): Blueprint;
    /**
     * Project this 2D blueprint onto a 3D plane, producing a wire and metadata.
     *
     * @param inputPlane - Named plane (`"XY"`, `"XZ"`, etc.) or a custom Plane.
     * @param origin - Origin offset; a number sets the offset along the plane normal.
     * @returns Sketch data containing the projected wire and default orientation.
     */
    sketchOnPlane(inputPlane?: PlaneName | Plane, origin?: PointInput | number): SketchData;
    /**
     * Map this 2D blueprint onto a 3D face's UV surface.
     *
     * @param face - Target face to project onto.
     * @param scaleMode - How UV coordinates are interpreted (`'original'`, `'bounds'`, or `'native'`).
     * @returns Sketch data containing the wire mapped onto the face.
     */
    sketchOnFace(face: Face, scaleMode?: ScaleMode): SketchData;
    /**
     * Create a face on a target face's surface defined by this blueprint's profile.
     *
     * @param face - The face whose surface the sub-face lies on.
     * @param origin - Optional UV origin offset (defaults to the face center).
     * @returns A new Face bounded by the blueprint's profile.
     */
    private subFace;
    /**
     * Cut a prism-shaped hole through a solid along a face using this blueprint.
     *
     * @param shape - The solid to punch through.
     * @param face - The face on which the hole profile is placed.
     * @param options - Optional hole parameters.
     * @param options.height - Hole depth; `null` (default) cuts through the entire solid.
     * @param options.origin - UV origin on the face for the blueprint placement.
     * @param options.draftAngle - Taper angle in degrees (0 = straight hole).
     * @returns The modified shape with the hole removed.
     */
    punchHole(shape: AnyShape<Dimension>, face: SingleFace, { height, origin, draftAngle, }?: {
        height?: number | null;
        origin?: PointInput | null;
        draftAngle?: number;
    }): AnyShape<Dimension>;
    /** Convert the blueprint to an SVG path `d` attribute string. */
    toSVGPathD(): string;
    /** Wrap the SVG path data in a `<path>` element string. */
    toSVGPath(): string;
    /**
     * Compute the SVG `viewBox` attribute for this blueprint.
     *
     * @param margin - Extra padding around the bounding box in drawing units.
     */
    toSVGViewBox(margin?: number): string;
    /** Return the SVG path `d` strings for this blueprint as an array. */
    toSVGPaths(): string[];
    /**
     * Render a complete SVG document string for this blueprint.
     *
     * @param margin - Extra padding around the bounding box in drawing units.
     */
    toSVG(margin?: number): string;
    /** Get the start point of the first curve. */
    get firstPoint(): Point2D;
    /** Get the end point of the last curve. */
    get lastPoint(): Point2D;
    /**
     * Test whether a 2D point lies inside this closed blueprint.
     *
     * Uses ray-casting (intersection counting) against a segment from the point
     * to a location guaranteed to be outside the bounding box.
     *
     * @remarks Returns `false` for points on the boundary.
     * @returns `true` if the point is strictly inside the blueprint.
     */
    isInside(point: Point2D): boolean;
    /** Check whether the first and last points coincide (the profile is closed). */
    isClosed(): boolean;
    /**
     * Test whether this blueprint's curves intersect with another blueprint's curves.
     *
     * @remarks Uses bounding-box pre-filtering for early rejection.
     */
    intersects(other: Blueprint): boolean;
}

/**
 * Represent a 2D profile with holes (an outer boundary minus inner cutouts).
 *
 * The first element of {@link blueprints} is the outer boundary; all subsequent
 * elements are holes subtracted from it. `CompoundBlueprint` implements the
 * same {@link DrawingInterface} as {@link Blueprint}, so it can be transformed,
 * sketched, and serialized to SVG in the same way.
 *
 * @see {@link Blueprint} for simple profiles without holes.
 * @see {@link Blueprints} for collections of disjoint profiles.
 */
declare class CompoundBlueprint implements DrawingInterface {
    /**
     * Ordered array where `blueprints[0]` is the outer boundary and the
     * remaining entries are inner holes.
     */
    blueprints: Blueprint[];
    protected _boundingBox: BoundingBox2d | null;
    /**
     * Create a compound blueprint from an outer boundary and optional holes.
     *
     * @param blueprints - First element is the outer boundary; subsequent
     *   elements are holes.
     * @throws BrepBugError if the array is empty (use {@link createCompoundBlueprint} for Result-based validation).
     */
    constructor(blueprints: Blueprint[]);
    /** Return a deep copy of this compound blueprint and all its children. */
    clone(): CompoundBlueprint;
    /** Compute (and cache) the combined bounding box of all child blueprints. */
    get boundingBox(): BoundingBox2d;
    /** Return a multi-line debug representation showing outline and holes. */
    get repr(): string;
    /** Stretch all child blueprints along a direction by a given ratio. */
    stretch(ratio: number, direction: Point2D, origin: Point2D): CompoundBlueprint;
    /** Rotate all child blueprints by an angle in degrees. */
    rotate(angle: number, center?: Point2D): CompoundBlueprint;
    /** Uniformly scale all child blueprints around a center point. */
    scale(scaleFactor: number, center?: Point2D): CompoundBlueprint;
    /** Translate all child blueprints by separate x/y distances or a vector. */
    translate(xDist: number, yDist: number): CompoundBlueprint;
    translate(translationVector: Point2D): CompoundBlueprint;
    /** Mirror all child blueprints across a point or plane. */
    mirror(centerOrDirection: Point2D, origin?: Point2D, mode?: 'center' | 'plane'): CompoundBlueprint;
    /** Project all child blueprints onto a 3D plane.
     *
     * @returns One {@link SketchData} per child blueprint (outer boundary + holes).
     */
    sketchOnPlane(plane?: PlaneName | Plane, origin?: PointInput | number): SketchData[];
    /** Map all child blueprints onto a 3D face's UV surface.
     *
     * @returns One {@link SketchData} per child blueprint.
     */
    sketchOnFace(face: Face, scaleMode?: ScaleMode): SketchData[];
    /**
     * Punch a hole through a solid using the outer boundary of this compound.
     *
     * @remarks Only the outer boundary (`blueprints[0]`) is used for the hole.
     */
    punchHole(shape: AnyShape<Dimension>, face: SingleFace, options?: {
        height?: number;
        origin?: PointInput;
        draftAngle?: number;
    }): AnyShape<Dimension>;
    /** Compute the SVG `viewBox` attribute for this compound blueprint. */
    toSVGViewBox(margin?: number): string;
    /** Return SVG path `d` strings for every child blueprint. */
    toSVGPaths(): string[];
    /** Wrap all child SVG paths in a `<g>` group element string. */
    toSVGGroup(): string;
    /** Render a complete SVG document string for this compound blueprint. */
    toSVG(margin?: number): string;
}

/**
 * Hold a collection of disjoint 2D profiles (simple or compound).
 *
 * Unlike {@link CompoundBlueprint}, the child blueprints here are independent
 * shapes -- none is treated as a hole in another. `Blueprints` is the typical
 * result of boolean operations that produce multiple disconnected regions.
 *
 * @see {@link Blueprint} for a single contiguous profile.
 * @see {@link CompoundBlueprint} for a profile with holes.
 */
declare class Blueprints implements DrawingInterface {
    /** The independent profiles in this collection. */
    blueprints: Array<Blueprint | CompoundBlueprint>;
    protected _boundingBox: BoundingBox2d | null;
    /** Create a collection from an array of blueprints and/or compound blueprints. */
    constructor(blueprints: Array<Blueprint | CompoundBlueprint>);
    /** Return a multi-line debug representation of every child blueprint. */
    get repr(): string;
    /** Return a deep copy of this collection and all its children. */
    clone(): Blueprints;
    /** Compute (and cache) the combined bounding box of all child blueprints. */
    get boundingBox(): BoundingBox2d;
    /** Stretch all child blueprints along a direction by a given ratio. */
    stretch(ratio: number, direction: Point2D, origin: Point2D): Blueprints;
    /** Rotate all child blueprints by an angle in degrees. */
    rotate(angle: number, center?: Point2D): Blueprints;
    /** Uniformly scale all child blueprints around a center point. */
    scale(scaleFactor: number, center?: Point2D): Blueprints;
    /** Translate all child blueprints by separate x/y distances or a vector. */
    translate(xDist: number, yDist: number): Blueprints;
    translate(translationVector: Point2D): Blueprints;
    /** Mirror all child blueprints across a point or plane. */
    mirror(centerOrDirection: Point2D, origin?: Point2D, mode?: 'center' | 'plane'): Blueprints;
    /** Project all child blueprints onto a 3D plane. */
    sketchOnPlane(plane?: PlaneName | Plane, origin?: PointInput | number): (SketchData | SketchData[])[];
    /** Map all child blueprints onto a 3D face's UV surface. */
    sketchOnFace(face: Face, scaleMode?: ScaleMode): (SketchData | SketchData[])[];
    /**
     * Punch holes through a solid for each child blueprint in sequence.
     *
     * @returns The shape with all holes applied.
     */
    punchHole(shape: AnyShape<Dimension>, face: SingleFace, options?: {
        height?: number;
        origin?: PointInput;
        draftAngle?: number;
    }): AnyShape<Dimension>;
    /** Compute the SVG `viewBox` attribute for this collection. */
    toSVGViewBox(margin?: number): string;
    /** Return nested SVG path `d` string arrays -- one sub-array per child. */
    toSVGPaths(): string[][];
    /** Render a complete SVG document string for all child blueprints. */
    toSVG(margin?: number): string;
}

/**
 * Build 2D wire profiles on a 3D plane using a builder-pen API.
 *
 * The Sketcher accumulates 2D curves in the local coordinate system of the
 * chosen plane, then lifts them to 3D edges at finalization.
 *
 * @example
 * ```ts
 * const sketch = new Sketcher("XZ", 5)
 *   .hLine(20)
 *   .vLine(10)
 *   .hLine(-20)
 *   .close();
 * const solid = sketch.extrude(8);
 * ```
 *
 * @see {@link FaceSketcher} for sketching on non-planar surfaces.
 * @see {@link DrawingPen} for the pure-2D equivalent.
 * @category Sketching
 */
declare class Sketcher extends BaseSketcher2d implements GenericSketcher<Sketch> {
    protected plane: Plane;
    /**
     * The sketcher can be defined by a plane, or a simple plane definition,
     * with either a point of origin, or the position on the normal axis from
     * the coordinates origin
     */
    constructor(plane: Plane);
    constructor(plane?: PlaneName, origin?: PointInput | number);
    /** Release resources held by this sketcher (lightweight — no kernel handles during drawing). */
    delete(): void;
    /**
     * Override to preserve the original Sketcher's sagitta direction convention.
     *
     * BaseSketcher2d computes the perpendicular as `[-dy, dx]` (counter-clockwise rotation),
     * but the original Sketcher used `cross(diff, plane.zDir)` which produces `[dy, -dx]`
     * (clockwise rotation) for standard planes. Negating the sagitta compensates for this,
     * ensuring all sagitta/bulge arcs curve the same way as the original 3D implementation.
     */
    sagittaArcTo(end: Point2D, sagitta: number): this;
    protected buildWire(): Wire;
    /** Finish drawing and return the open-wire Sketch (does not close the path). */
    done(): Sketch;
    /** Close the path with a straight line to the start point and return the Sketch. */
    close(): Sketch;
    /**
     * Close the path by mirroring all edges about the line from first to last point.
     *
     * Mirrors in 3D after assembling the partial wire to ensure exact endpoint
     * matching across kernels.
     */
    closeWithMirror(): Sketch;
    /**
     * Close the path and apply a custom corner treatment between the last and first segments.
     *
     * @param radius - Fillet/chamfer radius, or a custom corner function.
     * @param mode - Corner treatment type.
     * @returns The closed {@link Sketch}.
     */
    closeWithCustomCorner(radius: number | ((f: Curve2D, s: Curve2D) => Curve2D[]), mode?: 'fillet' | 'chamfer' | 'dogbone'): Sketch;
}

/**
 * The FaceSketcher allows you to sketch on a face that is not planar, for
 * instance the sides of a cylinder.
 *
 * The coordinates passed to the methods corresponds to normalised distances on
 * this surface, between 0 and 1 in both direction.
 *
 * Note that if you are drawing on a closed surface (typically a revolution
 * surface or a cylinder), the first parameters represents the angle and can be
 * smaller than 0 or bigger than 1.
 *
 * @category Sketching
 */
declare class FaceSketcher extends BaseSketcher2d implements GenericSketcher<Sketch> {
    protected face: Face;
    protected _bounds: UVBounds;
    constructor(face: Face, origin?: Point2D);
    protected _convertToUV([x, y]: Point2D): Point2D;
    protected _convertFromUV([u, v]: Point2D): Point2D;
    _adaptSurface(): KernelType;
    /**
     * @ignore
     */
    protected buildWire(): Wire;
    /** Finish drawing and return the resulting {@link Sketch} (does not close the path). */
    done(): Sketch;
    /** Close the path with a straight line to the start point and return the Sketch. */
    close(): Sketch;
    /** Close the path by mirroring all curves about the line from first to last point. */
    closeWithMirror(): Sketch;
    /**
     * Close the path and apply a custom corner treatment between the last and first segments.
     *
     * @param radius - Fillet/chamfer radius, or a custom corner function.
     * @param mode - Corner treatment type.
     * @returns The closed {@link Sketch}.
     */
    closeWithCustomCorner(radius: number | ((f: Curve2D, s: Curve2D) => Curve2D[]), mode?: 'fillet' | 'chamfer' | 'dogbone'): Sketch;
}

/**
 * Draw 2D curves and produce a {@link Blueprint} (pure-2D shape, no kernel wire).
 *
 * Use this when you need a reusable 2D profile that can later be sketched onto
 * different planes or faces.
 *
 * @category Sketching
 */
declare class BlueprintSketcher extends BaseSketcher2d implements GenericSketcher<Blueprint> {
    constructor(origin?: Point2D);
    /** Finish drawing and return the resulting {@link Blueprint} (does not close the path). */
    done(): Blueprint;
    /** Close the path with a straight line to the start point and return the Blueprint. */
    close(): Blueprint;
    /** Close the path by mirroring all curves about the line from first to last point. */
    closeWithMirror(): Blueprint;
    /**
     * Close the path and apply a custom corner treatment between the last and first segments.
     *
     * @param radius - Fillet/chamfer radius.
     * @param mode - Corner treatment type.
     * @returns The closed {@link Blueprint}.
     */
    closeWithCustomCorner(radius: number | ((f: Curve2D, s: Curve2D) => Curve2D[]), mode?: 'fillet' | 'chamfer' | 'dogbone'): Blueprint;
}

/**
 * DrawingPen is a helper class to draw in 2D. It is used to create drawings
 * by exposing a builder interface. It is not a drawing itself, but it can be
 * used to create a drawing.
 *
 * @category Drawing
 */
declare class DrawingPen extends BaseSketcher2d implements GenericSketcher<Drawing> {
    constructor(origin?: Point2D);
    /** Finish drawing and return the resulting {@link Drawing} (does not close the path). */
    done(): Drawing;
    /** Close the path with a straight line to the start point and return the Drawing. */
    close(): Drawing;
    /** Close the path by mirroring all curves about the line from first to last point. */
    closeWithMirror(): Drawing;
    /**
     * Close the path and apply a custom corner treatment between the last and first segments.
     *
     * @param radius - Fillet/chamfer radius.
     * @param mode - Corner treatment type.
     * @returns The closed {@link Drawing}.
     */
    closeWithCustomCorner(radius: number | ((f: Curve2D, s: Curve2D) => Curve2D[]), mode?: 'fillet' | 'chamfer' | 'dogbone'): Drawing;
}

/**
 * Represent a closed or open wire profile with a default extrusion origin and direction.
 *
 * A Sketch wraps a single {@link Wire} and carries metadata (origin, direction,
 * optional base face) so that downstream operations like {@link Sketch.extrude},
 * {@link Sketch.revolve}, {@link Sketch.sweepSketch}, and {@link Sketch.loftWith}
 * know how to act on it without extra arguments.
 *
 * The class methods are thin delegations to the canonical functions in
 * `sketchFns.ts` (`sketchExtrude`, `sketchRevolve`, etc.). New functionality
 * should be added there.
 *
 * @remarks Most operations consume (delete) the sketch after producing a solid.
 *
 * @see {@link Sketcher} to build a Sketch interactively.
 * @see {@link CompoundSketch} for multi-wire (outer + holes) profiles.
 * @category Sketching
 */
declare class Sketch implements SketchInterface {
    /**
     * The wire is typed as `ClosedWire & PlanarWire` to reflect the contract at
     * Sketcher boundaries: `Sketcher.close()`, `closeWithMirror()`,
     * `closeWithCustomCorner()`, and the canned-sketch factories all produce
     * closed planar wires. Callers constructing `Sketch` from an arbitrary
     * `Wire` must assert validity at the construction site.
     */
    wire: ClosedWire & PlanarWire;
    /**
     * @ignore
     */
    _defaultOrigin: Vec3;
    /**
     * @ignore
     */
    _defaultDirection: Vec3;
    protected _baseFace: Face | null | undefined;
    constructor(wire: ClosedWire & PlanarWire, { defaultOrigin, defaultDirection, }?: {
        defaultOrigin?: PointInput;
        defaultDirection?: PointInput;
    });
    get baseFace(): Face | null | undefined;
    set baseFace(newFace: Face | null | undefined);
    /** Release all kernel resources held by this sketch. */
    delete(): void;
    /** Create an independent deep copy of this sketch. */
    clone(): Sketch;
    /** Get the 3D origin used as default for extrusion and revolution. */
    get defaultOrigin(): Vec3;
    /** Set the 3D origin used as default for extrusion and revolution. */
    set defaultOrigin(newOrigin: PointInput);
    /** Get the default extrusion/normal direction. */
    get defaultDirection(): Vec3;
    /** Set the default extrusion/normal direction. */
    set defaultDirection(newDirection: PointInput);
    /** Transforms the lines into a face. The lines should be closed. */
    face(): Face;
    /** Return a clone of the underlying wire. */
    wires(): Wire;
    /** Alias for {@link Sketch.face}. */
    faces(): Face;
    /**
     * Revolves the drawing on an axis (defined by its direction and an origin
     * (defaults to the sketch origin)
     *
     * @remarks Consumes the sketch — calling this twice throws on the second call.
     */
    revolve(revolutionAxis?: PointInput, config?: {
        origin?: PointInput;
    }): Shape3D;
    /** Extrudes the sketch to a certain distance (along the default direction
     * and origin of the sketch).
     *
     * You can define another extrusion direction or origin,
     *
     * It is also possible to twist extrude with an angle (in degrees), or to
     * give a profile to the extrusion (the endFactor will scale the face, and
     * the profile will define how the scale is applied (either linearly or with
     * a s-shape).
     *
     * @remarks Consumes the sketch — calling this twice throws on the second call.
     */
    extrude(extrusionDistance: number, config?: {
        extrusionDirection?: PointInput;
        extrusionProfile?: ExtrusionProfile;
        twistAngle?: number;
        origin?: PointInput;
    }): Shape3D;
    /**
     * Sweep along this sketch another sketch defined in the function
     * `sketchOnPlane`.
     *
     * @remarks Consumes both this sketch and the one returned by `sketchOnPlane` —
     * calling either consumer twice throws on the second call.
     */
    sweepSketch(sketchOnPlane: (plane: Plane, origin: Vec3) => SketchInterface, sweepConfig?: SweepOptions): Shape3D;
    /** Loft between this sketch and another sketch (or an array of them)
     *
     * You can also define a `startPoint` for the loft (that will be placed
     * before this sketch) and an `endPoint` after the last one.
     *
     * You can also define if you want the loft to result in a ruled surface.
     *
     * Note that all sketches will be deleted by this operation
     */
    loftWith(otherSketches: SketchInterface | SketchInterface[], loftConfig?: LoftOptions, returnShell?: boolean): Shape3D;
}

/**
 * Represent a face with holes as a group of sketches (one outer + zero or more inner).
 *
 * All contained sketches must share the same base surface. The first sketch is
 * treated as the outer boundary; subsequent sketches define holes.
 *
 * Typically produced from a {@link CompoundBlueprint} via `sketchOnPlane`.
 *
 * The class methods are thin delegations to the canonical functions in
 * `sketchFns.ts` (`compoundSketchExtrude`, `compoundSketchRevolve`, etc.).
 *
 * @see {@link Sketch} for single-wire profiles without holes.
 * @category Sketching
 */
declare class CompoundSketch implements SketchInterface {
    sketches: Sketch[];
    constructor(sketches: Sketch[]);
    /** Release all kernel resources held by every sub-sketch. */
    delete(): void;
    /** Get the outer boundary sketch (the first in the array). */
    get outerSketch(): Sketch;
    /** Get the hole sketches (all but the first). */
    get innerSketches(): Sketch[];
    /** Return all wires (outer + holes) combined into a compound shape. */
    get wires(): import('../core/shapeTypes.js').Compound;
    /** Build a face from the outer boundary with inner wires subtracted as holes. */
    face(): Face;
    /**
     * Extrude the compound face (with holes) along the default or given direction.
     *
     * Supports twist and profile extrusions. For twist/profile modes each
     * sub-sketch is extruded as a shell, then capped into a solid.
     */
    extrude(extrusionDistance: number, config?: {
        extrusionDirection?: PointInput;
        extrusionProfile?: ExtrusionProfile;
        twistAngle?: number;
        origin?: PointInput;
    }): Shape3D;
    /**
     * Revolves the drawing on an axis (defined by its direction and an origin
     * (defaults to the sketch origin)
     */
    revolve(revolutionAxis?: PointInput, config?: {
        origin?: PointInput;
    }): Shape3D;
    /**
     * Loft between this compound sketch and another with matching sub-sketch
     * counts. The target must itself be a compound sketch — lofting a
     * face-with-holes profile to a single-wire one has no defined meaning.
     */
    loftWith(otherCompound: SketchInterface | SketchInterface[], loftConfig?: LoftOptions): Shape3D;
    /** Sweeping a face-with-holes profile has no single well-defined spine. */
    sweepSketch(): Shape3D;
}

/**
 * Batch wrapper around multiple {@link Sketch} or {@link CompoundSketch} instances.
 *
 * Applies the same operation (extrude, revolve, etc.) to every contained sketch
 * and returns the results combined into a single compound shape.
 *
 * Implements {@link SketchInterface} so it is interchangeable with a single
 * {@link Sketch} in the chained `Drawing.sketchOnPlane(...).extrude()` style.
 * Operations with no per-profile batch meaning (`face`, `loftWith`,
 * `sweepSketch`) require a single contained profile and otherwise throw.
 *
 * @category Sketching
 */
declare class Sketches implements SketchInterface {
    sketches: Array<Sketch | CompoundSketch>;
    constructor(sketches: Array<Sketch | CompoundSketch>);
    /**
     * The sole contained {@link Sketch}, for operations that have no
     * multi-profile meaning. Throws when there is more than one profile, or when
     * the single profile is a compound (face-with-holes) sketch.
     */
    private soleSketch;
    /** Build a face from the sole contained profile (see {@link Sketches.faces}). */
    face(): Face;
    /** Loft from the sole contained profile to one or more other sketches. */
    loftWith(otherSketches: SketchInterface | SketchInterface[], loftConfig?: LoftOptions, returnShell?: boolean): Shape3D;
    /** Sweep a profile along the sole contained sketch's wire. */
    sweepSketch(sketchOnPlane: (plane: Plane, origin: Vec3) => SketchInterface, sweepConfig?: SweepOptions): Shape3D;
    /** Return all wires combined into a single compound shape. */
    wires(): Compound;
    /** Return all sketch faces combined into a single compound shape. */
    faces(): Compound;
    /** Extrudes the sketch to a certain distance (along the default direction
     * and origin of the sketch).
     *
     * You can define another extrusion direction or origin,
     *
     * It is also possible to twist extrude with an angle (in degrees), or to
     * give a profile to the extrusion (the endFactor will scale the face, and
     * the profile will define how the scale is applied (either linearly or with
     * a s-shape).
     */
    extrude(extrusionDistance: number, extrusionConfig?: {
        extrusionDirection?: PointInput;
        extrusionProfile?: ExtrusionProfile;
        twistAngle?: number;
        origin?: PointInput;
    }): Compound;
    /**
     * Revolves the drawing on an axis (defined by its direction and an origin
     * (defaults to the sketch origin)
     */
    revolve(revolutionAxis?: PointInput, config?: {
        origin?: PointInput;
    }): Compound;
}

/** A shape with optional name and color for STEP assembly export. */
interface StepExportPart<D extends Dimension = '3D'> {
    readonly shape: AnyShape<D>;
    readonly name?: string | undefined;
    readonly color?: readonly [number, number, number, number] | undefined;
}

/**
 * A wire proven to form a closed loop.
 * The only way to obtain a `ClosedWire` is through smart constructors
 * (`closedWire()`, `rectangleWire()`, etc.) or type guards (`isClosedWire()`).
 * Assignable to `Wire<D>` — a subtype, not a separate type.
 */
type ClosedWire<D extends Dimension = '3D'> = Wire<D> & {
    readonly [__closed]: true;
};

/**
 * A face with proven consistent normal orientation.
 * Obtained via `orientedFace()` or `isOrientedFace()`.
 * Assignable to `Face<D>`.
 */
type OrientedFace<D extends Dimension = '3D'> = Face<D> & {
    readonly [__oriented]: true;
};

/**
 * Type guard — check if a wire is closed (forms a loop).
 * Uses the kernel's `curveIsClosed` to verify at runtime.
 */
declare function isClosedWire<D extends Dimension>(wire: Wire<D>): wire is ClosedWire<D>;

/**
 * Type guard — check if a face is valid and thus safe to use in operations.
 *
 * Uses kernel validity (BRepCheck_Analyzer) which verifies geometric and
 * topological correctness. Faces produced by kernel operations (makeFace,
 * extrude, revolve, boolean ops) are oriented by construction. For faces
 * from STEP/IGES imports or external sources, validity does not guarantee
 * consistent normal orientation — use with caution or re-orient first.
 */
declare function isOrientedFace<D extends Dimension>(face: Face<D>): face is OrientedFace<D>;

/**
 * Prove that a wire is closed, returning a branded `ClosedWire` on success.
 * This is the primary smart constructor for `ClosedWire`.
 *
 * @example
 * ```ts
 * const w = wire([e1, e2, e3]);
 * const closed = closedWire(unwrap(w));
 * if (isOk(closed)) {
 *   const f = face(closed.value); // ClosedWire accepted
 * }
 * ```
 */
declare function closedWire<D extends Dimension>(wire: Wire<D>): Result<ClosedWire<D>, string>;

/**
 * Prove that a face is oriented, returning a branded `OrientedFace` on success.
 */
declare function orientedFace<D extends Dimension>(face: Face<D>): Result<OrientedFace<D>, string>;

/**
 * A face whose underlying surface is a geometric plane.
 * Obtained via `planarFace()` or `isPlanarFace()`.
 * Assignable to `Face<D>`.
 */
type PlanarFace<D extends Dimension = '3D'> = Face<D> & {
    readonly [__planar]: true;
};

/**
 * A wire whose edges all lie in a common plane.
 * Obtained via `planarWire()` or `isPlanarWire()`.
 * Assignable to `Wire<D>`.
 */
type PlanarWire<D extends Dimension = '3D'> = Wire<D> & {
    readonly [__planar]: true;
};

/** Type guard — check if a face is planar (underlying surface is a plane). */
declare function isPlanarFace<D extends Dimension>(face: Face<D>): face is PlanarFace<D>;

/**
 * Type guard — check if a wire is planar (all edges lie in a common plane).
 * Strategy: try planar-only face construction first (fast path on OCCT — throws
 * for non-planar wires). If that succeeds, verify the surface type. If it
 * fails, fall back to general mode and check whether the resulting surface is
 * a plane. This handles kernel-specific differences in the planar flag.
 */
declare function isPlanarWire<D extends Dimension>(wire: Wire<D>): wire is PlanarWire<D>;

/** Prove that a face is planar, returning a branded `PlanarFace` on success. */
declare function planarFace<D extends Dimension>(face: Face<D>): Result<PlanarFace<D>, string>;

/** Prove that a wire is planar, returning a branded `PlanarWire` on success. */
declare function planarWire<D extends Dimension>(wire: Wire<D>): Result<PlanarWire<D>, string>;

/** A topological vertex (0D point). */
type Vertex<D extends Dimension = '3D'> = ShapeHandle & {
    readonly [__brand]: 'vertex';
    readonly [__dim]: D;
};

/** A topological edge (1D curve segment). */
type Edge<D extends Dimension = '3D'> = ShapeHandle & {
    readonly [__brand]: 'edge';
    readonly [__dim]: D;
};

/** An ordered sequence of connected edges forming a path or loop. */
type Wire<D extends Dimension = '3D'> = ShapeHandle & {
    readonly [__brand]: 'wire';
    readonly [__dim]: D;
};

/** A bounded portion of a surface. */
type Face<D extends Dimension = '3D'> = ShapeHandle & {
    readonly [__brand]: 'face';
    readonly [__dim]: D;
};

/** A heterogeneous collection of shapes. */
type Compound<D extends Dimension = '3D'> = ShapeHandle & {
    readonly [__brand]: 'compound';
    readonly [__dim]: D;
};

/** Any branded shape type in a given dimension. Defaults to 3D. */
type AnyShape<D extends Dimension = '3D'> = Vertex<D> | Edge<D> | Wire<D> | Face<D> | Compound<D> | (D extends '3D' ? Shell | Solid | CompSolid : never);

/** 1D shapes (edges and wires) in a given dimension. */
type Shape1D<D extends Dimension = '3D'> = Edge<D> | Wire<D>;

/** Wrap a raw kernel shape as a branded {@link Vertex} handle. */
declare function createVertex<D extends Dimension = '3D'>(ocShape: KernelShape, dim?: D): Vertex<D>;

/** Wrap a raw kernel shape as a branded {@link Edge} handle. */
declare function createEdge<D extends Dimension = '3D'>(ocShape: KernelShape, dim?: D): Edge<D>;

/** Wrap a raw kernel shape as a branded {@link Wire} handle. */
declare function createWire<D extends Dimension = '3D'>(ocShape: KernelShape, dim?: D): Wire<D>;

/** Wrap a raw kernel shape as a branded {@link Face} handle. */
declare function createFace<D extends Dimension = '3D'>(ocShape: KernelShape, dim?: D): Face<D>;

/** Wrap a raw kernel shape as a branded {@link Compound} handle. */
declare function createCompound<D extends Dimension = '3D'>(ocShape: KernelShape, dim?: D): Compound<D>;

/** Type guard — check if a shape is a {@link Vertex}. */
declare function isVertex<D extends Dimension>(s: AnyShape<D>): s is Vertex<D>;

/** Type guard — check if a shape is an {@link Edge}. */
declare function isEdge<D extends Dimension>(s: AnyShape<D>): s is Edge<D>;

/** Type guard — check if a shape is a {@link Wire}. */
declare function isWire<D extends Dimension>(s: AnyShape<D>): s is Wire<D>;

/** Type guard — check if a shape is a {@link Face}. */
declare function isFace<D extends Dimension>(s: AnyShape<D>): s is Face<D>;

/** Type guard — check if a shape is a {@link Compound}. */
declare function isCompound<D extends Dimension>(s: AnyShape<D>): s is Compound<D>;

/** Type guard — check if a shape is a 1D shape (edge or wire). */
declare function isShape1D<D extends Dimension>(s: AnyShape<D>): s is Shape1D<D>;

/**
 * Wrap a raw kernel shape into a properly branded type.
 * Performs a downcast and wraps in a disposable handle.
 *
 * **Note**: When `D` is `'2D'`, Shell/Solid/CompSolid are not valid members
 * of `AnyShape<'2D'>`. If the kernel shape happens to be one of these types,
 * they will be cast unsoundly. Prefer {@link castShape3D} for shapes known
 * to be 3D, and use the default `castShape()` (which defaults to `'3D'`)
 * for normal usage.
 */
declare function castShape<D extends Dimension = '3D'>(ocShape: KernelShape, dim?: D): AnyShape<D>;

/**
 * Conditional type that resolves to T if D matches Expected,
 * otherwise resolves to a readable error string type.
 */
type RequireDimension<D extends Dimension, Expected extends Dimension, T, Op extends string = 'operation'> = D extends Expected ? T : DimensionError<Op, Expected, D>;

/**
 * Asserts both dimensions are equal at the type level.
 * Resolves to the shared dimension if equal, or a readable error if not.
 */
type SameDimension<A extends Dimension, B extends Dimension, Op extends string = 'operation'> = A extends B ? A : DimensionError<Op, A, B>;

/** Get all edges of a shape as branded Edge handles. Results are cached per shape. */
declare function getEdges<D extends Dimension>(shape: AnyShape<D>): Edge<D>[];

/**
 * Get all faces of a shape. Results are cached per shape.
 *
 * Returns `Face[]` — use `isOrientedFace()` or `orientedFace()` to narrow
 * individual faces to `OrientedFace` when the orientation guarantee is needed.
 */
declare function getFaces<D extends Dimension>(shape: AnyShape<D>): Face<D>[];

/** Get all wires of a shape as branded Wire handles. Results are cached per shape. */
declare function getWires<D extends Dimension>(shape: AnyShape<D>): Wire<D>[];

/** Get all vertices of a shape as branded Vertex handles. Results are cached per shape. */
declare function getVertices<D extends Dimension>(shape: AnyShape<D>): Vertex<D>[];

/** Lazily iterate edges of a shape, yielding branded Edge handles one at a time. */
declare function iterEdges<D extends Dimension>(shape: AnyShape<D>): Generator<Edge<D>>;

/** Lazily iterate faces of a shape, yielding branded Face handles one at a time. */
declare function iterFaces<D extends Dimension>(shape: AnyShape<D>): Generator<Face<D>>;

/** Lazily iterate wires of a shape, yielding branded Wire handles one at a time. */
declare function iterWires<D extends Dimension>(shape: AnyShape<D>): Generator<Wire<D>>;

/** Lazily iterate vertices of a shape, yielding branded Vertex handles one at a time. */
declare function iterVertices<D extends Dimension>(shape: AnyShape<D>): Generator<Vertex<D>>;

/**
 * Get all faces adjacent to a given edge within a parent shape.
 *
 * An edge typically borders exactly two faces in a solid, or one face
 * if the edge is on a boundary.
 *
 * @param parent - The parent shape to search within.
 * @param edge - The edge whose adjacent faces to find.
 * @returns Array of unique faces containing the given edge.
 */
declare function facesOfEdge<D extends Dimension>(parent: AnyShape<D>, edge: Edge<D>): Face<D>[];

/**
 * Get all edges bounding a face.
 *
 * @param face - The face whose edges to enumerate.
 * @returns Array of unique edges forming the face boundary.
 */
declare function edgesOfFace<D extends Dimension>(face: Face<D>): Edge<D>[];

/**
 * Get all wires of a face (outer wire + inner hole wires).
 * All wires bounding a face are closed by definition.
 *
 * @param face - The face whose wires to enumerate.
 */
declare function wiresOfFace<D extends Dimension>(face: Face<D>): ClosedWire<D>[];

/**
 * Get the start and end vertices of an edge.
 *
 * @param edge - The edge whose vertices to retrieve.
 * @returns Array of 1-2 vertices (1 if degenerate/closed, 2 otherwise).
 */
declare function verticesOfEdge<D extends Dimension>(edge: Edge<D>): Vertex<D>[];

/**
 * Get all faces that share at least one edge with the given face.
 *
 * The returned list does not include the input face itself.
 * Uses the cached edge→faces adjacency map for the parent shape.
 *
 * @param parent - The parent shape to search within.
 * @param face - The face whose neighbors to find.
 * @returns Array of unique adjacent faces (excluding the input face).
 */
declare function adjacentFaces<D extends Dimension>(parent: AnyShape<D>, face: Face<D>): Face<D>[];

/**
 * Get all edges shared between two faces.
 *
 * @param face1 - The first face.
 * @param face2 - The second face.
 * @returns Array of edges present in both faces (via isSame comparison).
 */
declare function sharedEdges<D extends Dimension>(face1: Face<D>, face2: Face<D>): Edge<D>[];

/** Flip the orientation of an edge or wire. Returns a new shape with the same dimension. */
declare function flipOrientation<D extends Dimension>(shape: Edge<D> | Wire<D>): Edge<D> | Wire<D>;

/**
 * Extract NURBS data from a BSpline face.
 * Returns null if the face is not a BSpline surface (e.g., plane, cylinder).
 */
declare function getNurbsSurfaceData<D extends Dimension>(face: Face<D>): NurbsSurfaceData | null;

/** Get the outer wire of a face. The outer boundary of a face is always closed. */
declare function outerWire<D extends Dimension = '3D'>(face: Face<D>): ClosedWire<D>;

/**
 * Remove all holes (inner wires) from a face, returning a new face with only the outer boundary.
 * Useful for defeaturing workflows where holes need to be temporarily or permanently filled.
 */
declare function removeHolesFromFace<D extends Dimension = '3D'>(face: Face<D>): Face<D>;

/** Get the inner wires (holes) of a face. Hole boundaries are always closed. */
declare function innerWires<D extends Dimension = '3D'>(face: Face<D>): ClosedWire<D>[];

/**
 * Attempt to heal/fix a face.
 *
 * Uses ShapeFix_Face to repair wire ordering, orientation, and geometry issues.
 */
declare function healFace<D extends Dimension>(face: Face<D>): Result<Face<D>>;

/**
 * Attempt to heal/fix a wire.
 *
 * Uses ShapeFix_Wire to repair edge connectivity, gaps, and self-intersections.
 * Requires a face for surface context; pass `undefined` to use a default planar context.
 */
declare function healWire<D extends Dimension>(wire: Wire<D>, face?: Face<D>): Result<Wire<D>>;

/**
 * General-purpose shape repair using ShapeFix_Shape.
 * Fixes orientations, missing curves, and other common issues.
 */
declare function fixShape<D extends Dimension>(shape: AnyShape<D>): Result<AnyShape<D>>;

/**
 * Remove holes from a face by rebuilding it from only the outer wire.
 *
 * Equivalent to OpenSCAD's `fill()` — takes a 2D face with holes and returns
 * a solid face with all internal cutouts filled in.
 */
declare function fill<D extends Dimension = '3D'>(face: PlanarFace<D>): Result<OrientedFace<D> & PlanarFace<D>>;

/** Apply a fillet to all edges of a valid solid. */
declare function fillet<T extends ValidSolid>(shape: Shapeable<T>, radius: FilletRadius): Result<T>;
/** Apply a fillet to selected edges of a valid solid. */
declare function fillet<T extends ValidSolid>(shape: Shapeable<T>, edges: Edge[] | FinderFn<Edge> | ShapeFinder<Edge>, radius: FilletRadius): Result<T>;

/** Apply a chamfer to all edges of a valid solid. */
declare function chamfer<T extends ValidSolid>(shape: Shapeable<T>, distance: ChamferDistance): Result<T>;
/** Apply a chamfer to selected edges of a valid solid. */
declare function chamfer<T extends ValidSolid>(shape: Shapeable<T>, edges: Edge[] | FinderFn<Edge> | ShapeFinder<Edge>, distance: ChamferDistance): Result<T>;

/** Create a hollow shell by removing faces and offsetting remaining walls. */
declare function shell<T extends ValidSolid>(shape: Shapeable<T>, faces: Face[] | FinderFn<Face> | ShapeFinder<Face>, thickness: number, options?: {
    tolerance?: number;
}): Result<T>;

/** Offset all faces of a valid solid by a given distance. */
declare function offset<T extends ValidSolid>(shape: Shapeable<T>, distance: number, options?: {
    tolerance?: number;
}): Result<T>;

/**
 * Draft (taper) selected faces of a 3D shape.
 *
 * Tilts faces by a specified angle relative to a pull direction,
 * pivoting about a neutral plane. Essential for manufacturing workflows
 * (injection molding, casting) where parts must release from a mold.
 */
declare function draft<T extends ValidSolid>(shape: Shapeable<T>, faces: Face[] | FinderFn<Face> | ShapeFinder<Face>, options: DraftOptions): Result<T>;

interface BatchBisectResult<T extends Shape3D = Shape3D> {
    readonly shape: T;
    readonly telemetry: BatchBisectTelemetry;
}

/** Fuse two 3D shapes (boolean union). */
declare function fuse<T extends Shape3D>(a: Shapeable<T>, b: Shapeable<Shape3D>, options?: booleans.BooleanOptions): Result<T>;

/** Cut a tool from a base shape (boolean subtraction). */
declare function cut<T extends Shape3D>(base: Shapeable<T>, tool: Shapeable<Shape3D>, options?: booleans.BooleanOptions): Result<T>;

/** Fuse many 3D shapes (boolean union) in a single operation. */
declare function fuseAll<T extends Shape3D>(shapes: Shapeable<T>[], options?: booleans.BooleanOptions): Result<T>;

/** Cut many tool shapes from a base shape (boolean subtraction) in a single operation. */
declare function cutAll<T extends Shape3D>(base: Shapeable<T>, tools: Shapeable<Shape3D>[], options?: booleans.BooleanOptions): Result<T>;

/** Compute the intersection of two shapes (boolean common). */
declare function intersect<T extends Shape3D>(a: Shapeable<T>, b: Shapeable<Shape3D>, options?: booleans.BooleanOptions): Result<T>;

/**
 * Drill a hole through a 3D shape.
 *
 * Creates a cylinder at the specified position and cuts it from the shape.
 * If no depth is given, cuts all the way through (computed from bounding box).
 */
declare function drill<T extends Shape3D>(shape: Shapeable<T>, options: DrillOptions): Result<T>;

/**
 * Cut a pocket (2D profile extruded inward) into a shape.
 *
 * The profile (Drawing or Wire) is positioned on the target face and extruded
 * inward by the specified depth, then subtracted from the shape.
 */
declare function pocket<T extends Shape3D>(shape: Shapeable<T>, options: PocketOptions): Result<T>;

/**
 * Add a boss (2D profile extruded outward) onto a shape.
 *
 * The profile (Drawing or Wire) is positioned on the target face and extruded
 * outward by the specified height, then fused with the shape.
 */
declare function boss<T extends Shape3D>(shape: Shapeable<T>, options: BossOptions): Result<T>;

/**
 * Mirror a shape and fuse it with the original.
 *
 * Common pattern: model half a part, then mirror-join for symmetry.
 */
declare function mirrorJoin<T extends Shape3D>(shape: Shapeable<T>, options?: MirrorJoinOptions): Result<T>;

/**
 * Create a rectangular (2D grid) pattern of a shape.
 *
 * Replicates the shape along two directions with specified counts and spacings,
 * then fuses all copies into a single shape.
 */
declare function rectangularPattern<T extends Shape3D>(shape: Shapeable<T>, options: RectangularPatternOptions): Result<T>;

/** BufferGeometry data with per-face material groups. */
interface GroupedBufferGeometryData extends BufferGeometryData {
    /** Face groups for use with THREE.BufferGeometry.addGroup(). */
    readonly groups: ReadonlyArray<BufferGeometryGroup>;
}

interface SurfaceFromImageOptions extends SurfaceFromGridOptions {
    /** Which channel to use for height. Default: 'luminance'. */
    channel?: 'r' | 'g' | 'b' | 'luminance';
    /** Downsample factor — use every Nth pixel. Default: 1 (no downsampling). */
    downsample?: number;
}

/** Volume properties with a domain-specific `volume` alias. */
interface VolumeProps extends PhysicalProps {
    readonly volume: number;
}

/** Surface properties with a domain-specific `area` alias. */
interface SurfaceProps extends PhysicalProps {
    readonly area: number;
}

/** Linear properties with a domain-specific `length` alias. */
interface LinearProps extends PhysicalProps {
    readonly length: number;
}

interface CornerFinderFn extends CornerFilter {
    /** Add a custom predicate filter. Returns new finder. */
    readonly when: (predicate: (corner: Corner) => boolean) => CornerFinderFn;
    /** Filter to corners whose point matches one from the list. */
    readonly inList: (points: Point2D[]) => CornerFinderFn;
    /** Filter to corners at a specific distance from a point. */
    readonly atDistance: (distance: number, point?: Point2D) => CornerFinderFn;
    /** Filter to corners at an exact point. */
    readonly atPoint: (point: Point2D) => CornerFinderFn;
    /** Filter to corners within an axis-aligned bounding box. */
    readonly inBox: (corner1: Point2D, corner2: Point2D) => CornerFinderFn;
    /** Filter to corners with a specific interior angle (in degrees). */
    readonly ofAngle: (angle: number) => CornerFinderFn;
    /** Invert a filter. Returns new finder. */
    readonly not: (fn: (f: CornerFinderFn) => CornerFinderFn) => CornerFinderFn;
    /** Combine filters with OR. Returns new finder. */
    readonly either: (fns: ((f: CornerFinderFn) => CornerFinderFn)[]) => CornerFinderFn;
    /** Find matching corners from a blueprint. */
    readonly find: (blueprint: BlueprintLike) => Corner[];
}

/** Request to initialize the worker (load the WASM geometry kernel). */
interface InitRequest extends WorkerRequest {
    readonly type: 'init';
    /** Optional URL to the WASM binary; when omitted the worker uses its default. */
    readonly wasmUrl?: string;
}

/**
 * Request to execute a named CAD operation inside the worker.
 *
 * @remarks Shapes are transferred as BREP-serialized strings, not as live
 * kernel handles, because handles cannot cross the worker boundary.
 */
interface OperationRequest extends WorkerRequest {
    readonly type: 'operation';
    /** Name of the registered operation to invoke. */
    readonly operation: string;
    /** BREP-serialized input shapes. */
    readonly shapesBrep: ReadonlyArray<string>;
    /** Arbitrary key/value parameters forwarded to the operation handler. */
    readonly parameters: Readonly<Record<string, unknown>>;
}

/** Request to dispose the worker, releasing all resources. */
interface DisposeRequest extends WorkerRequest {
    readonly type: 'dispose';
}

/** Response indicating that the requested operation completed successfully. */
interface SuccessResponse extends WorkerResponse {
    readonly success: true;
    /** BREP-serialized result shape, when the operation produces geometry. */
    readonly resultBrep?: string;
    /** Arbitrary result data for non-geometric outputs (e.g., measurements). */
    readonly resultData?: unknown;
}

/** Response indicating that the requested operation failed. */
interface ErrorResponse extends WorkerResponse {
    readonly success: false;
    /** Human-readable error message describing the failure. */
    readonly error: string;
}

/** Resize a shape to exact target dimensions with optional auto-proportional scaling. */
declare function resize<T extends AnyShape<Dimension>>(shape: T, dimensions: [number | undefined, number | undefined, number | undefined], options?: {
    auto?: boolean;
}): Result<T>;

/**
 * Set a whole-shape color (stored externally via WeakMap).
 * Returns the same shape reference.
 */
declare function colorShape<T extends AnyShape<Dimension>>(shape: T, color: ColorInput): T;

/**
 * Set per-face colors on a shape.
 * Returns the same shape reference.
 */
declare function colorFaces<T extends AnyShape<Dimension>>(shape: T, faces: Face<Dimension>[], color: ColorInput): T;

interface ShapeFinder<T extends AnyShape<Dimension>> {
    /** Add a custom predicate filter. Returns new finder. */
    readonly when: (predicate: Predicate<T>) => ShapeFinder<T>;
    /** Filter to elements in a list. Returns new finder. */
    readonly inList: (elements: T[]) => ShapeFinder<T>;
    /** Invert a filter. Returns new finder. */
    readonly not: (builderFn: (f: ShapeFinder<T>) => ShapeFinder<T>) => ShapeFinder<T>;
    /** Combine filters with OR. Returns new finder. */
    readonly either: (fns: ((f: ShapeFinder<T>) => ShapeFinder<T>)[]) => ShapeFinder<T>;
    /** Find all matching elements from a shape. */
    readonly findAll: (shape: AnyShape<Dimension>) => T[];
    /** Find exactly one matching element. Returns error if 0 or more than 1 match. */
    readonly findUnique: (shape: AnyShape<Dimension>) => Result<T>;
    /** Check if an element passes all filters. */
    readonly shouldKeep: (element: T) => boolean;
    /** Intersect: element must match both this finder AND other. */
    readonly and: (other: ShapeFinder<T>) => ShapeFinder<T>;
    /** Union: element must match this finder OR other. */
    readonly or: (other: ShapeFinder<T>) => ShapeFinder<T>;
    /** Negate: invert all filters on this finder. */
    readonly negate: () => ShapeFinder<T>;
    readonly _filters: ReadonlyArray<Predicate<T>>;
    readonly _topoKind: TopoKind;
}

/** Callback that configures a shape finder for inline use in modifiers. */
type FinderFn<T extends AnyShape<Dimension>> = (finder: ShapeFinder<T>) => ShapeFinder<T>;

/**
 * Marker interface for the shape() wrapper.
 *
 * Full definition lives in wrapperFns.ts — this minimal interface is enough
 * for the `resolve()` utility and `Shapeable<T>` type to work without
 * creating circular imports.
 */
interface WrappedMarker<T extends AnyShape<Dimension>> {
    readonly val: T;
    /** Brand property to distinguish wrappers from branded shape handles. */
    readonly __wrapped: true;
}

/**
 * Accept either a raw branded shape or a shape() wrapper.
 *
 * All functional API functions use this as their shape parameter type,
 * enabling seamless interop between styles.
 */
type Shapeable<T extends AnyShape<Dimension>> = T | WrappedMarker<T>;

/** Extract the raw branded shape from a Shapeable value. */
declare function resolve<T extends AnyShape<Dimension>>(s: Shapeable<T>): T;

/** Translate a shape by a vector. Returns a new shape. */
declare function translate<T extends AnyShape<Dimension>>(shape: Shapeable<T>, v: Vec3): T;

/** Rotate a shape around an axis. Angle is in degrees. Returns a new shape. */
declare function rotate<T extends AnyShape<Dimension>>(shape: Shapeable<T>, angle: number, options?: RotateOptions): T;

/** Mirror a shape through a plane. Returns a new shape. */
declare function mirror<T extends AnyShape<Dimension>>(shape: Shapeable<T>, options?: MirrorOptions): T;

/** Scale a shape uniformly. Returns a new shape. */
declare function scale<T extends AnyShape<Dimension>>(shape: Shapeable<T>, factor: number, options?: ScaleOptions): T;

/** Clone a shape (deep copy). */
declare function clone<T extends AnyShape<Dimension>>(shape: Shapeable<T>): Result<T>;

/**
 * Apply a 4x4 affine transformation matrix to a shape.
 * Equivalent to OpenSCAD's `multmatrix`.
 *
 * Accepts either a raw `Matrix4x4` (4 rows of 4 numbers, row-major) or a structured
 * `MatrixTransform` with explicit `linear` and `translation` fields.
 */
declare function applyMatrix<T extends AnyShape<Dimension>>(shape: Shapeable<T>, matrix: MatrixInput): Result<T>;

/**
 * Clone a shape and apply a pre-composed transform in a single kernel operation.
 * Much faster than separate clone() + translate() + rotate() calls for batch patterns.
 */
declare function transformCopy<T extends AnyShape<Dimension>>(shape: Shapeable<T>, composed: transforms.ComposedTransform): T;

/** Heal a shape using the appropriate fixer. */
declare function heal<T extends AnyShape<Dimension>>(shape: Shapeable<T>): Result<T>;

/** Simplify a shape by merging same-domain faces/edges. */
declare function simplify<T extends AnyShape<Dimension>>(shape: Shapeable<T>): Result<T>;

/** Create a typed shape wrapper from a Sketch-like object (converts to Face) or a Face. */
declare function shape(sketchOrFace: {
    face(): Face;
} | Face): WrappedFace;
/** Create a typed shape wrapper from a Solid. */
declare function shape(solid: Solid): Wrapped3D<Solid>;
/** Create a typed shape wrapper from a Shell. */
declare function shape(shell: Shell): Wrapped3D<Shell>;
/** Create a typed shape wrapper from an Edge. */
declare function shape(edge: Edge): WrappedCurve<Edge>;
/** Create a typed shape wrapper from a Wire. */
declare function shape(wire: Wire): WrappedCurve<Wire>;
/** Create a typed shape wrapper from any shape. */
declare function shape<T extends AnyShape>(s: T): Wrapped<T>;

interface EdgeFinderFn extends ShapeFinder<Edge> {
    readonly inDirection: (dir?: DirectionInput, angle?: number) => EdgeFinderFn;
    readonly ofLength: (length: number, tolerance?: number) => EdgeFinderFn;
    readonly ofCurveType: (curveType: CurveType) => EdgeFinderFn;
    readonly parallelTo: (dir?: DirectionInput) => EdgeFinderFn;
    readonly atDistance: (distance: number, point?: Vec3) => EdgeFinderFn;
}

interface FaceFinderFn extends ShapeFinder<Face> {
    readonly inDirection: (dir?: DirectionInput, angle?: number) => FaceFinderFn;
    readonly parallelTo: (dir?: DirectionInput) => FaceFinderFn;
    readonly ofSurfaceType: (surfaceType: SurfaceType) => FaceFinderFn;
    readonly ofArea: (area: number, tolerance?: number) => FaceFinderFn;
    readonly atDistance: (distance: number, point?: Vec3) => FaceFinderFn;
}

interface WireFinderFn extends ShapeFinder<Wire> {
    readonly isClosed: () => WireFinderFn;
    readonly isOpen: () => WireFinderFn;
    readonly ofEdgeCount: (count: number) => WireFinderFn;
}

interface VertexFinderFn extends ShapeFinder<Vertex> {
    /** Filter vertices nearest to a reference point. Returns a new finder that keeps only the closest vertex. */
    readonly nearestTo: (point: Vec3) => VertexFinderFn;
    /** Filter vertices at an exact position (within tolerance). */
    readonly atPosition: (point: Vec3, tolerance?: number) => VertexFinderFn;
    /** Filter vertices within an axis-aligned bounding box. */
    readonly withinBox: (min: Vec3, max: Vec3) => VertexFinderFn;
    /** Filter vertices at a given distance from a point. */
    readonly atDistance: (distance: number, point?: Vec3, tolerance?: number) => VertexFinderFn;
}

/** Base wrapper — available on all shapes. */
interface Wrapped<T extends AnyShape> extends WrappedMarker<T> {
    readonly val: T;
    readonly __wrapped: true;
    translate(v: Vec3): Wrapped<T>;
    rotate(angle: number, options?: {
        at?: Vec3;
        axis?: Vec3;
    }): Wrapped<T>;
    mirror(options?: {
        normal?: Vec3;
        at?: Vec3;
    }): Wrapped<T>;
    scale(factor: number, options?: {
        center?: Vec3;
    }): Wrapped<T>;
    applyMatrix(matrix: MatrixInput): Wrapped<T>;
    moveX(distance: number): Wrapped<T>;
    moveY(distance: number): Wrapped<T>;
    moveZ(distance: number): Wrapped<T>;
    rotateX(angle: number): Wrapped<T>;
    rotateY(angle: number): Wrapped<T>;
    rotateZ(angle: number): Wrapped<T>;
    bounds(): Bounds3D;
    describe(): ShapeDescription;
    clone(): Wrapped<T>;
    mesh(options?: MeshOptions & {
        skipNormals?: boolean;
        includeUVs?: boolean;
        cache?: boolean;
    }): ShapeMesh;
    meshEdges(options?: MeshOptions & {
        cache?: boolean;
    }): EdgeMesh;
    isValid(): boolean;
    isEmpty(): boolean;
    heal(): Wrapped<T>;
    simplify(): Wrapped<T>;
    toBREP(): string;
    apply<U extends AnyShape>(fn: (shape: T) => U): Wrapped<U>;
    applyResult<U extends AnyShape>(fn: (shape: T) => Result<U>): Wrapped<U>;
    done(): T;
}

/** 3D wrapper — booleans, modifiers, measurement, queries. */
interface Wrapped3D<T extends Shape3D> extends Wrapped<T> {
    fuse(tool: Shapeable<Shape3D>, options?: BooleanOptions): Wrapped3D<T>;
    cut(tool: Shapeable<Shape3D>, options?: BooleanOptions): Wrapped3D<T>;
    intersect(tool: Shapeable<Shape3D>, options?: BooleanOptions): Wrapped3D<T>;
    fuseAll(tools: Shapeable<Shape3D>[], options?: BooleanOptions): Wrapped3D<T>;
    cutAll(tools: Shape3D[], options?: BooleanOptions): Wrapped3D<T>;
    section(plane: PlaneInput, options?: {
        approximation?: boolean;
        planeSize?: number;
    }): Wrapped<AnyShape>;
    split(tools: AnyShape[]): Wrapped<AnyShape>;
    slice(planes: PlaneInput[], options?: {
        approximation?: boolean;
        planeSize?: number;
    }): AnyShape[];
    fillet(radius: FilletRadius): Wrapped3D<T>;
    fillet(edges: Edge[] | FinderFn<Edge> | ShapeFinder<Edge>, radius: FilletRadius): Wrapped3D<T>;
    chamfer(distance: ChamferDistance): Wrapped3D<T>;
    chamfer(edges: Edge[] | FinderFn<Edge> | ShapeFinder<Edge>, distance: ChamferDistance): Wrapped3D<T>;
    shell(faces: Face[] | FinderFn<Face> | ShapeFinder<Face>, thickness: number, options?: {
        tolerance?: number;
    }): Wrapped3D<T>;
    offset(distance: number, options?: {
        tolerance?: number;
    }): Wrapped3D<T>;
    draft(faces: Face[] | FinderFn<Face> | ShapeFinder<Face>, options: DraftOptions): Wrapped3D<T>;
    drill(options: DrillOptions): Wrapped3D<T>;
    pocket(options: PocketOptions): Wrapped3D<T>;
    boss(options: BossOptions): Wrapped3D<T>;
    mirrorJoin(options?: MirrorJoinOptions): Wrapped3D<T>;
    rectangularPattern(options: RectangularPatternOptions): Wrapped3D<T>;
    volume(): number;
    area(): number;
    volumeProps(): VolumeProps;
    surfaceProps(): SurfaceProps;
    edges(): Edge[];
    faces(): Face[];
    wires(): Wire[];
    vertices(): Vertex[];
    linearPattern(direction: Vec3, count: number, spacing: number): Wrapped3D<T>;
    circularPattern(axis: Vec3, count: number, angle?: number): Wrapped3D<T>;
}

/** Curve wrapper — edge/wire introspection. */
interface WrappedCurve<T extends Edge | Wire> extends Wrapped<T> {
    length(): number;
    startPoint(): Vec3;
    endPoint(): Vec3;
    pointAt(t?: number): Vec3;
    tangentAt(t?: number): Vec3;
    isClosed(): boolean;
    sweep(spine: Shapeable<Wire>, options?: SweepOptions): Wrapped3D<Shape3D>;
}

/** Face wrapper — face introspection + 2D→3D transitions. */
interface WrappedFace extends Wrapped<Face> {
    area(): number;
    normalAt(point?: Vec3): Vec3;
    center(): Vec3;
    surfaceType(): SurfaceType;
    outerWire(): Wire;
    innerWires(): Wire[];
    extrude(height: number | Vec3): Wrapped3D<Solid>;
    revolve(options?: {
        axis?: Vec3;
        at?: Vec3;
        angle?: number;
    }): Wrapped3D<Shape3D>;
}

// ── Aliases ──

declare const zipResults: typeof zip;
type DirectionInput = Direction;
declare const chamferDistAngleShape: typeof chamferDistAngle;
declare const getHistoryShape: typeof getShape;
type HistoryOperationRegistry = OperationRegistry;
type CleanLoftOptions = LoftOptions;
type CleanSweepOptions = SweepOptions;
