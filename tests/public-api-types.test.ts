/**
 * Public API type coverage — verifies every documented type is exported
 * from src/index.ts and has the correct structure.
 *
 * This test file does NOT require WASM initialization. It tests:
 *   1. Export verification — every documented type/value is importable
 *   2. Type structure — interfaces have the correct fields
 *   3. Type values — union types contain the documented members
 *   4. Runtime constructors — error/result constructors produce correct shapes
 */
import { describe, expect, it } from 'vitest';
import * as API from '../src/index.js';

// ── Import every documented type and value from the public API ──
import {
  // Result types
  ok,
  err,
  OK,
  isOk,
  isErr,
  unwrap,
  pipeline,

  // Error types
  BrepErrorCode,
  occtError,
  validationError,
  typeCastError,
  sketcherStateError,
  moduleInitError,
  computationError,
  ioError,
  queryError,

  // Core value helpers
  toVec3,
  toVec2,
  resolveDirection,

  // Shape type runtime functions
  createAssemblyNode,
  addChild,
  removeChild,
  updateNode,
  findNode,
  walkAssembly,
  countNodes,
  collectShapes,

  // History functions
  createHistory,
  addStep,
  undoLast,
  findStep,
  getHistoryShape,
  stepCount,
  stepsFrom,
  registerShape,
  createRegistry,
  registerOperation,

  // Plane
  createPlane,
} from '../src/index.js';

import type {
  // Core types
  Vec3,
  Vec2,
  PointInput,
  DirectionInput,

  // Plane types
  Plane,
  PlaneName,
  PlaneInput,

  // Shape types
  ShapeKind,
  AnyShape,
  Shape3D,
  Shape1D,

  // Disposal
  ShapeHandle,

  // Error types
  BrepError,
  BrepErrorKind,
  Result,

  // Mesh types
  ShapeMesh,
  EdgeMesh,
  MeshOptions,

  // Boolean types
  BooleanOptions,

  // Topology types
  Bounds3D,
  ShapeDescription,
  CurveType,

  // Healing
  HealingReport,
  HealingStepDiagnostic,

  // Measurement
  InterferenceResult,
  CurvatureResult,

  // Projection
  Camera,
  ProjectionPlane,

  // Assembly
  AssemblyNode,

  // History
  ModelHistory,
  OperationStep,
  OperationFn,
  HistoryOperationRegistry,

  // Legacy
  Point,
  Point2D,
} from '../src/index.js';

// ═══════════════════════════════════════════════════════════════════════
// 0. Export surface snapshot — fails when exports are added or removed
// ═══════════════════════════════════════════════════════════════════════

/**
 * This list is the authoritative snapshot of every runtime export from
 * src/index.ts. If you add or remove a public export, this test will
 * fail. Update the list below AND add corresponding type-structure
 * tests in the sections that follow.
 */
const EXPECTED_RUNTIME_EXPORTS: readonly string[] = [
  'BaseSketcher2d',
  'Blueprint',
  'BlueprintSketcher',
  'Blueprints',
  'BoundingBox2d',
  'BrepBugError',
  'BrepErrorCode',
  'BrepWrapperError',
  'CompoundBlueprint',
  'CompoundSketch',
  'Curve2D',
  'DEG2RAD',
  'DisposalScope',
  'Drawing',
  'DrawingPen',
  'FaceSketcher',
  'HASH_CODE_MAX',
  'OK',
  'RAD2DEG',
  'Sketch',
  'Sketcher',
  'Sketches',
  'addChild',
  'addHoles',
  'addHolesInFace',
  'addStep',
  'adjacentFaces',
  'andThen',
  'applyGlue',
  'approximateCurve',
  'asTopo',
  'assembleWire',
  'autoHeal',
  'axis2d',
  'basicFaceExtrusion',
  'bezier',
  'blueprintBoundingBox',
  'blueprintIsInside',
  'blueprintOrientation',
  'blueprintToDXF',
  'blueprintToSVGPathD',
  'boss',
  'box',
  'bsplineApprox',
  'bug',
  'cameraFromPlane',
  'cameraLookAt',
  'cast',
  'castShape',
  'chamfer',
  'chamferDistAngleShape',
  'chamferShape',
  'checkAllInterferences',
  'checkInterference',
  'circle',
  'circularPattern',
  'classifyPointOnFace',
  'clearMeshCache',
  'clone',
  'cloneShape',
  'collect',
  'collectShapes',
  'combineFinderFilters',
  'complexExtrude',
  'compound',
  'compoundSketchExtrude',
  'compoundSketchFace',
  'compoundSketchLoft',
  'compoundSketchRevolve',
  'computationError',
  'cone',
  'cornerFinder',
  'countNodes',
  'createAssembly',
  'createAssemblyNode',
  'createBlueprint',
  'createCamera',
  'createCompound',
  'createDistanceQuery',
  'createEdge',
  'createFace',
  'createHandle',
  'createHistory',
  'createMeshCache',
  'createNamedPlane',
  'createOcHandle',
  'createOperationRegistry',
  'createPlane',
  'createRegistry',
  'createShell',
  'createSolid',
  'createTaskQueue',
  'createVertex',
  'createWire',
  'createWorkerClient',
  'createWorkerHandler',
  'curve2dBoundingBox',
  'curve2dDistanceFrom',
  'curve2dFirstPoint',
  'curve2dIsOnCurve',
  'curve2dLastPoint',
  'curve2dParameter',
  'curve2dSplitAt',
  'curve2dTangentAt',
  'curveEndPoint',
  'curveIsClosed',
  'curveIsPeriodic',
  'curveLength',
  'curvePeriod',
  'curvePointAt',
  'curveStartPoint',
  'curveTangentAt',
  'cut',
  'cut2D',
  'cutAll',
  'cutBlueprint2D',
  'cutBlueprints',
  'cutShape',
  'cylinder',
  'dequeueTask',
  'describe',
  'describeShape',
  'deserializeDrawing',
  'deserializeShape',
  'downcast',
  'draw',
  'drawCircle',
  'drawEllipse',
  'drawFaceOutline',
  'drawParametricFunction',
  'drawPointsInterpolation',
  'drawPolysides',
  'drawProjection',
  'drawRectangle',
  'drawRoundedRectangle',
  'drawSingleCircle',
  'drawSingleEllipse',
  'drawText',
  'drawingChamfer',
  'drawingCut',
  'drawingFillet',
  'drawingFuse',
  'drawingIntersect',
  'drawingToSketchOnPlane',
  'drill',
  'edgeFinder',
  'edgesOfFace',
  'ellipse',
  'ellipseArc',
  'ellipsoid',
  'enqueueTask',
  'err',
  'exportAssemblySTEP',
  'exportDXF',
  'exportGlb',
  'exportGltf',
  'exportIGES',
  'exportOBJ',
  'exportSTEP',
  'exportSTL',
  'exportThreeMF',
  'extrude',
  'extrudeFace',
  'face',
  'faceCenter',
  'faceFinder',
  'faceGeomType',
  'faceOrientation',
  'facesOfEdge',
  'filledFace',
  'fillet',
  'filletShape',
  'findCurveType',
  'findNode',
  'findStep',
  'flatMap',
  'flipFaceOrientation',
  'flipOrientation',
  'fromBREP',
  'fromOcDir',
  'fromOcPnt',
  'fromOcVec',
  'fuse',
  'fuse2D',
  'fuseAll',
  'fuseBlueprint2D',
  'fuseBlueprints',
  'fuseShape',
  'gcWithObject',
  'gcWithScope',
  'genericSweep',
  'getBounds',
  'getCurveType',
  'getEdges',
  'getFaces',
  'getFont',
  'getHashCode',
  'getHistoryShape',
  'getKernel',
  'getOrientation',
  'getShapeKind',
  'getSingleFace',
  'getSurfaceType',
  'getVertices',
  'getWires',
  'heal',
  'healFace',
  'healShape',
  'healSolid',
  'healWire',
  'helix',
  'importIGES',
  'importSTEP',
  'importSTL',
  'importSVG',
  'importSVGPathD',
  'initFromOC',
  'innerWires',
  'interpolateCurve',
  'intersect',
  'intersect2D',
  'intersectBlueprint2D',
  'intersectBlueprints',
  'intersectShape',
  'ioError',
  'isChamferRadius',
  'isCompSolid',
  'isCompound',
  'isDisposeRequest',
  'isEdge',
  'isEmpty',
  'isEqualShape',
  'isErr',
  'isErrorResponse',
  'isFace',
  'isFilletRadius',
  'isInitRequest',
  'isNumber',
  'isOk',
  'isOperationRequest',
  'isPoint',
  'isProjectionPlane',
  'isQueueEmpty',
  'isSameShape',
  'isShape1D',
  'isShape3D',
  'isShapeNull',
  'isShapeValid',
  'isShell',
  'isSolid',
  'isSuccessResponse',
  'isValid',
  'isVertex',
  'isWire',
  'iterEdges',
  'iterFaces',
  'iterTopo',
  'iterVertices',
  'iterWires',
  'kernelCall',
  'kernelCallRaw',
  'line',
  'linearPattern',
  'loadFont',
  'localGC',
  'loft',
  'loftWires',
  'makeBSplineApproximation',
  'makeBaseBox',
  'makeBezierCurve',
  'makeBox',
  'makeCircle',
  'makeCompound',
  'makeCone',
  'makeCylinder',
  'makeEllipse',
  'makeEllipseArc',
  'makeEllipsoid',
  'makeFace',
  'makeHelix',
  'makeLine',
  'makeNewFaceWithinFace',
  'makeNonPlanarFace',
  'makeOffset',
  'makePlane',
  'makePlaneFromFace',
  'makePolygon',
  'makeProjectedEdges',
  'makeSolid',
  'makeSphere',
  'makeTangentArc',
  'makeThreePointArc',
  'makeTorus',
  'makeVertex',
  'map',
  'mapErr',
  'match',
  'measureArea',
  'measureCurvatureAt',
  'measureCurvatureAtMid',
  'measureDistance',
  'measureLength',
  'measureLinearProps',
  'measureSurfaceProps',
  'measureVolume',
  'measureVolumeProps',
  'mesh',
  'meshEdges',
  'meshShape',
  'meshShapeEdges',
  'mirror',
  'mirrorBlueprint',
  'mirrorDrawing',
  'mirrorJoin',
  'mirrorShape',
  'modifyStep',
  'moduleInitError',
  'normalAt',
  'ocMirror',
  'ocRotate',
  'ocScale',
  'ocTranslate',
  'occtError',
  'offset',
  'offsetFace',
  'offsetShape',
  'offsetWire2D',
  'ok',
  'organiseBlueprints',
  'outerWire',
  'pendingCount',
  'pipe',
  'pipeline',
  'pivotPlane',
  'pocket',
  'pointOnSurface',
  'polygon',
  'polysideInnerRadius',
  'polysidesBlueprint',
  'projectEdges',
  'projectPointOnFace',
  'queryError',
  'rectangularPattern',
  'registerHandler',
  'registerOperation',
  'registerShape',
  'rejectAll',
  'removeChild',
  'replayFrom',
  'replayHistory',
  'resolve',
  'resolve3D',
  'resolveDirection',
  'resolvePlane',
  'reverseCurve',
  'revolution',
  'revolve',
  'revolveFace',
  'rotate',
  'rotateBlueprint',
  'rotateDrawing',
  'rotateShape',
  'roundedRectangleBlueprint',
  'scale',
  'scaleBlueprint',
  'scaleDrawing',
  'scaleShape',
  'section',
  'sectionShape',
  'serializeShape',
  'sewShells',
  'shape',
  'shapeType',
  'sharedEdges',
  'shell',
  'shellShape',
  'simplify',
  'simplifyShape',
  'sketchBlueprintOnFace',
  'sketchBlueprintOnPlane',
  'sketchCircle',
  'sketchEllipse',
  'sketchExtrude',
  'sketchFace',
  'sketchFaceOffset',
  'sketchHelix',
  'sketchLoft',
  'sketchParametricFunction',
  'sketchPolysides',
  'sketchRectangle',
  'sketchRevolve',
  'sketchRoundedRectangle',
  'sketchSweep',
  'sketchText',
  'sketchWires',
  'sketcherStateError',
  'slice',
  'sliceShape',
  'solid',
  'sphere',
  'split',
  'splitShape',
  'stepCount',
  'stepsFrom',
  'stretchBlueprint',
  'subFace',
  'supportExtrude',
  'sweep',
  'tangentArc',
  'textBlueprints',
  'thicken',
  'thickenSurface',
  'threePointArc',
  'toBREP',
  'toBufferGeometryData',
  'toGroupedBufferGeometryData',
  'toLineGeometryData',
  'toOcVec',
  'toVec2',
  'toVec3',
  'torus',
  'translate',
  'translateBlueprint',
  'translateDrawing',
  'translatePlane',
  'translateShape',
  'tryCatch',
  'tryCatchAsync',
  'twistExtrude',
  'typeCastError',
  'undoLast',
  'unwrap',
  'unwrapErr',
  'unwrapOr',
  'unwrapOrElse',
  'updateNode',
  'uvBounds',
  'uvCoordinates',
  'validationError',
  'vecAdd',
  'vecAngle',
  'vecCross',
  'vecDistance',
  'vecDot',
  'vecEquals',
  'vecIsZero',
  'vecLength',
  'vecLengthSq',
  'vecNegate',
  'vecNormalize',
  'vecProjectToPlane',
  'vecRepr',
  'vecRotate',
  'vecScale',
  'vecSub',
  'vertex',
  'vertexFinder',
  'vertexPosition',
  'verticesOfEdge',
  'walkAssembly',
  'weldShellsAndFaces',
  'wire',
  'wireFinder',
  'wiresOfFace',
  'withOcDir',
  'withOcPnt',
  'withOcVec',
  'withScope',
];

describe('Public API export surface', () => {
  it('matches the expected runtime export list (update this list when adding/removing exports)', () => {
    const actual = Object.keys(API).sort();
    expect(actual).toEqual(EXPECTED_RUNTIME_EXPORTS);
  });

  it('has no unexpected new exports (add them to EXPECTED_RUNTIME_EXPORTS and add type tests)', () => {
    const actual = new Set(Object.keys(API));
    const expected = new Set(EXPECTED_RUNTIME_EXPORTS);
    const unexpected = [...actual].filter((k) => !expected.has(k));
    expect(unexpected).toEqual([]);
  });

  it('has no missing exports (were they accidentally removed?)', () => {
    const actual = new Set(Object.keys(API));
    const expected = new Set(EXPECTED_RUNTIME_EXPORTS);
    const missing = [...expected].filter((k) => !actual.has(k));
    expect(missing).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 1. Export verification — every documented name resolves to a real value
// ═══════════════════════════════════════════════════════════════════════

describe('Public API exports — runtime values', () => {
  it('exports Result constructors and combinators', () => {
    expect(ok).toBeTypeOf('function');
    expect(err).toBeTypeOf('function');
    expect(OK).toBeDefined();
    expect(isOk).toBeTypeOf('function');
    expect(isErr).toBeTypeOf('function');
    expect(unwrap).toBeTypeOf('function');
    expect(pipeline).toBeTypeOf('function');
  });

  it('exports BrepErrorCode constant object', () => {
    expect(BrepErrorCode).toBeDefined();
    expect(typeof BrepErrorCode).toBe('object');
  });

  it('exports error constructors', () => {
    expect(occtError).toBeTypeOf('function');
    expect(validationError).toBeTypeOf('function');
    expect(typeCastError).toBeTypeOf('function');
    expect(sketcherStateError).toBeTypeOf('function');
    expect(moduleInitError).toBeTypeOf('function');
    expect(computationError).toBeTypeOf('function');
    expect(ioError).toBeTypeOf('function');
    expect(queryError).toBeTypeOf('function');
  });

  it('exports core value helpers', () => {
    expect(toVec3).toBeTypeOf('function');
    expect(toVec2).toBeTypeOf('function');
    expect(resolveDirection).toBeTypeOf('function');
  });

  it('exports assembly functions', () => {
    expect(createAssemblyNode).toBeTypeOf('function');
    expect(addChild).toBeTypeOf('function');
    expect(removeChild).toBeTypeOf('function');
    expect(updateNode).toBeTypeOf('function');
    expect(findNode).toBeTypeOf('function');
    expect(walkAssembly).toBeTypeOf('function');
    expect(countNodes).toBeTypeOf('function');
    expect(collectShapes).toBeTypeOf('function');
  });

  it('exports history functions', () => {
    expect(createHistory).toBeTypeOf('function');
    expect(addStep).toBeTypeOf('function');
    expect(undoLast).toBeTypeOf('function');
    expect(findStep).toBeTypeOf('function');
    expect(getHistoryShape).toBeTypeOf('function');
    expect(stepCount).toBeTypeOf('function');
    expect(stepsFrom).toBeTypeOf('function');
    expect(registerShape).toBeTypeOf('function');
    expect(createRegistry).toBeTypeOf('function');
    expect(registerOperation).toBeTypeOf('function');
  });

  it('exports plane constructor', () => {
    expect(createPlane).toBeTypeOf('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 2. Type structure verification — interfaces have the correct fields
// ═══════════════════════════════════════════════════════════════════════

describe('Type structures — runtime field verification', () => {
  describe('Vec3 / Vec2 / PointInput', () => {
    it('Vec3 is a readonly 3-tuple', () => {
      const v: Vec3 = [1, 2, 3];
      expect(v).toHaveLength(3);
      expect(v[0]).toBe(1);
      expect(v[1]).toBe(2);
      expect(v[2]).toBe(3);
    });

    it('Vec2 is a readonly 2-tuple', () => {
      const v: Vec2 = [1, 2];
      expect(v).toHaveLength(2);
      expect(v[0]).toBe(1);
      expect(v[1]).toBe(2);
    });

    it('toVec3 normalizes PointInput to Vec3', () => {
      const from2d: Vec3 = toVec3([1, 2]);
      expect(from2d).toEqual([1, 2, 0]);

      const from3d: Vec3 = toVec3([1, 2, 3]);
      expect(from3d).toEqual([1, 2, 3]);
    });

    it('toVec2 normalizes PointInput to Vec2', () => {
      const v: Vec2 = toVec2([1, 2, 3]);
      expect(v).toEqual([1, 2]);
    });
  });

  describe('DirectionInput', () => {
    it('accepts named axes', () => {
      expect(resolveDirection('X')).toEqual([1, 0, 0]);
      expect(resolveDirection('Y')).toEqual([0, 1, 0]);
      expect(resolveDirection('Z')).toEqual([0, 0, 1]);
    });

    it('accepts Vec3', () => {
      const d: DirectionInput = [1, 0, 0];
      expect(resolveDirection(d)).toEqual([1, 0, 0]);
    });
  });

  describe('Plane', () => {
    it('has origin, xDir, yDir, zDir fields', () => {
      const plane: Plane = {
        origin: [0, 0, 0],
        xDir: [1, 0, 0],
        yDir: [0, 1, 0],
        zDir: [0, 0, 1],
      };
      expect(plane.origin).toEqual([0, 0, 0]);
      expect(plane.xDir).toEqual([1, 0, 0]);
      expect(plane.yDir).toEqual([0, 1, 0]);
      expect(plane.zDir).toEqual([0, 0, 1]);
    });

    it('PlaneInput accepts a PlaneName or Plane object', () => {
      const byName: PlaneInput = 'XY';
      expect(byName).toBe('XY');

      const byObj: PlaneInput = {
        origin: [0, 0, 0],
        xDir: [1, 0, 0],
        yDir: [0, 1, 0],
        zDir: [0, 0, 1],
      };
      expect(byObj).toHaveProperty('origin');
    });
  });

  describe('Result<T>', () => {
    it('ok() creates Ok variant with .ok=true and .value', () => {
      const r: Result<number> = ok(42);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value).toBe(42);
      }
    });

    it('err() creates Err variant with .ok=false and .error', () => {
      const e = validationError('TEST', 'test error');
      const r: Result<number> = err(e);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error).toHaveProperty('kind', 'VALIDATION');
        expect(r.error).toHaveProperty('code', 'TEST');
        expect(r.error).toHaveProperty('message', 'test error');
      }
    });

    it('OK is Ok<undefined>', () => {
      expect(OK.ok).toBe(true);
      if (OK.ok) {
        expect(OK.value).toBeUndefined();
      }
    });

    it('isOk / isErr guard correctly', () => {
      const good: Result<string> = ok('hello');
      const bad: Result<string> = err(validationError('X', 'x'));
      expect(isOk(good)).toBe(true);
      expect(isErr(good)).toBe(false);
      expect(isOk(bad)).toBe(false);
      expect(isErr(bad)).toBe(true);
    });

    it('pipeline chains Result transforms', () => {
      const r = pipeline(10)
        .then((x) => ok(x * 2))
        .then((x) => ok(x + 1)).result;
      expect(isOk(r)).toBe(true);
      if (r.ok) expect(r.value).toBe(21);
    });
  });

  describe('BrepError', () => {
    it('has kind, code, message fields', () => {
      const e: BrepError = occtError('TEST_CODE', 'Test message');
      expect(e.kind).toBe('OCCT_OPERATION');
      expect(e.code).toBe('TEST_CODE');
      expect(e.message).toBe('Test message');
    });

    it('optionally has cause and metadata', () => {
      const cause = new Error('underlying');
      const meta = { detail: 'extra' };
      const e: BrepError = occtError('C', 'msg', cause, meta);
      expect(e.cause).toBe(cause);
      expect(e.metadata).toEqual({ detail: 'extra' });
    });

    it('constructors produce correct BrepErrorKind', () => {
      const kindMap: [typeof occtError, BrepErrorKind][] = [
        [occtError, 'OCCT_OPERATION'],
        [validationError, 'VALIDATION'],
        [typeCastError, 'TYPE_CAST'],
        [sketcherStateError, 'SKETCHER_STATE'],
        [moduleInitError, 'MODULE_INIT'],
        [computationError, 'COMPUTATION'],
        [ioError, 'IO'],
        [queryError, 'QUERY'],
      ];
      for (const [ctor, expectedKind] of kindMap) {
        const e = ctor('CODE', 'msg');
        expect(e.kind).toBe(expectedKind);
      }
    });
  });

  describe('BrepErrorCode', () => {
    it('contains documented error codes', () => {
      // Spot-check key codes from each category
      expect(BrepErrorCode.FUSE_FAILED).toBe('FUSE_FAILED');
      expect(BrepErrorCode.CUT_FAILED).toBe('CUT_FAILED');
      expect(BrepErrorCode.ELLIPSE_RADII).toBe('ELLIPSE_RADII');
      expect(BrepErrorCode.FUSE_NOT_3D).toBe('FUSE_NOT_3D');
      expect(BrepErrorCode.STEP_EXPORT_FAILED).toBe('STEP_EXPORT_FAILED');
      expect(BrepErrorCode.STEP_IMPORT_FAILED).toBe('STEP_IMPORT_FAILED');
      expect(BrepErrorCode.FINDER_NOT_UNIQUE).toBe('FINDER_NOT_UNIQUE');
    });
  });

  describe('Bounds3D', () => {
    it('has xMin, xMax, yMin, yMax, zMin, zMax', () => {
      const b: Bounds3D = { xMin: -1, xMax: 1, yMin: -2, yMax: 2, zMin: -3, zMax: 3 };
      expect(b.xMin).toBe(-1);
      expect(b.xMax).toBe(1);
      expect(b.yMin).toBe(-2);
      expect(b.yMax).toBe(2);
      expect(b.zMin).toBe(-3);
      expect(b.zMax).toBe(3);
    });
  });

  describe('ShapeDescription', () => {
    it('has kind, faceCount, edgeCount, wireCount, vertexCount, valid, bounds', () => {
      const desc: ShapeDescription = {
        kind: 'solid',
        faceCount: 6,
        edgeCount: 12,
        wireCount: 6,
        vertexCount: 8,
        valid: true,
        bounds: { xMin: 0, xMax: 10, yMin: 0, yMax: 10, zMin: 0, zMax: 10 },
      };
      expect(desc.kind).toBe('solid');
      expect(desc.faceCount).toBe(6);
      expect(desc.edgeCount).toBe(12);
      expect(desc.wireCount).toBe(6);
      expect(desc.vertexCount).toBe(8);
      expect(desc.valid).toBe(true);
      expect(desc.bounds).toHaveProperty('xMin');
      expect(desc.bounds).toHaveProperty('zMax');
    });
  });

  describe('BooleanOptions', () => {
    it('accepts documented strategy values', () => {
      const native: BooleanOptions = { strategy: 'native' };
      const pairwise: BooleanOptions = { strategy: 'pairwise' };
      expect(native.strategy).toBe('native');
      expect(pairwise.strategy).toBe('pairwise');
    });

    it('accepts documented optimisation values', () => {
      const none: BooleanOptions = { optimisation: 'none' };
      const commonFace: BooleanOptions = { optimisation: 'commonFace' };
      const sameFace: BooleanOptions = { optimisation: 'sameFace' };
      expect(none.optimisation).toBe('none');
      expect(commonFace.optimisation).toBe('commonFace');
      expect(sameFace.optimisation).toBe('sameFace');
    });

    it('accepts simplify flag', () => {
      const opts: BooleanOptions = { simplify: true };
      expect(opts.simplify).toBe(true);
    });
  });

  describe('MeshOptions', () => {
    it('accepts tolerance and angularTolerance', () => {
      const opts: MeshOptions = { tolerance: 0.01, angularTolerance: 0.5 };
      expect(opts.tolerance).toBe(0.01);
      expect(opts.angularTolerance).toBe(0.5);
    });
  });

  describe('ShapeMesh', () => {
    it('has triangles, vertices, normals, uvs, faceGroups', () => {
      const mesh: ShapeMesh = {
        triangles: new Uint32Array([0, 1, 2]),
        vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
        normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
        uvs: new Float32Array([0, 0, 1, 0, 0, 1]),
        faceGroups: [{ start: 0, count: 3, faceId: 1 }],
      };
      expect(mesh.triangles).toBeInstanceOf(Uint32Array);
      expect(mesh.vertices).toBeInstanceOf(Float32Array);
      expect(mesh.normals).toBeInstanceOf(Float32Array);
      expect(mesh.uvs).toBeInstanceOf(Float32Array);
      expect(mesh.faceGroups).toHaveLength(1);
      expect(mesh.faceGroups[0]).toHaveProperty('start');
      expect(mesh.faceGroups[0]).toHaveProperty('count');
      expect(mesh.faceGroups[0]).toHaveProperty('faceId');
    });
  });

  describe('EdgeMesh', () => {
    it('has lines and edgeGroups', () => {
      const mesh: EdgeMesh = {
        lines: [0, 0, 0, 1, 0, 0],
        edgeGroups: [{ start: 0, count: 6, edgeId: 1 }],
      };
      expect(Array.isArray(mesh.lines)).toBe(true);
      expect(mesh.edgeGroups).toHaveLength(1);
      expect(mesh.edgeGroups[0]).toHaveProperty('start');
      expect(mesh.edgeGroups[0]).toHaveProperty('count');
      expect(mesh.edgeGroups[0]).toHaveProperty('edgeId');
    });
  });

  describe('HealingReport', () => {
    it('has isValid, wiresHealed, facesHealed, solidHealed, steps, diagnostics', () => {
      const report: HealingReport = {
        isValid: true,
        wiresHealed: 0,
        facesHealed: 0,
        solidHealed: false,
        steps: ['Shape already valid'],
        diagnostics: [{ name: 'validation', attempted: true, succeeded: true }],
      };
      expect(report.isValid).toBe(true);
      expect(report.wiresHealed).toBe(0);
      expect(report.facesHealed).toBe(0);
      expect(report.solidHealed).toBe(false);
      expect(report.steps).toHaveLength(1);
      expect(report.diagnostics).toHaveLength(1);
    });

    it('HealingStepDiagnostic has name, attempted, succeeded, and optional detail', () => {
      const diag: HealingStepDiagnostic = {
        name: 'healSolid',
        attempted: true,
        succeeded: false,
        detail: 'failed to fix topology',
      };
      expect(diag.name).toBe('healSolid');
      expect(diag.attempted).toBe(true);
      expect(diag.succeeded).toBe(false);
      expect(diag.detail).toBe('failed to fix topology');
    });
  });

  describe('InterferenceResult', () => {
    it('has hasInterference, minDistance, pointOnShape1, pointOnShape2', () => {
      const r: InterferenceResult = {
        hasInterference: false,
        minDistance: 5.0,
        pointOnShape1: [0, 0, 0],
        pointOnShape2: [5, 0, 0],
      };
      expect(r.hasInterference).toBe(false);
      expect(r.minDistance).toBe(5.0);
      expect(r.pointOnShape1).toEqual([0, 0, 0]);
      expect(r.pointOnShape2).toEqual([5, 0, 0]);
    });
  });

  describe('CurvatureResult', () => {
    it('has mean, gaussian, maxCurvature, minCurvature, maxDirection, minDirection', () => {
      const c: CurvatureResult = {
        mean: 0.5,
        gaussian: 0.25,
        maxCurvature: 1.0,
        minCurvature: 0.0,
        maxDirection: [1, 0, 0],
        minDirection: [0, 1, 0],
      };
      expect(c.mean).toBe(0.5);
      expect(c.gaussian).toBe(0.25);
      expect(c.maxCurvature).toBe(1.0);
      expect(c.minCurvature).toBe(0.0);
      expect(c.maxDirection).toEqual([1, 0, 0]);
      expect(c.minDirection).toEqual([0, 1, 0]);
    });
  });

  describe('Camera', () => {
    it('has position, direction, xAxis, yAxis', () => {
      const cam: Camera = {
        position: [0, 0, 10],
        direction: [0, 0, -1],
        xAxis: [1, 0, 0],
        yAxis: [0, 1, 0],
      };
      expect(cam.position).toEqual([0, 0, 10]);
      expect(cam.direction).toEqual([0, 0, -1]);
      expect(cam.xAxis).toEqual([1, 0, 0]);
      expect(cam.yAxis).toEqual([0, 1, 0]);
    });
  });

  describe('AssemblyNode', () => {
    it('has required name and children, optional shape/translate/rotate/metadata', () => {
      const node: AssemblyNode = createAssemblyNode('root');
      expect(node.name).toBe('root');
      expect(node.children).toEqual([]);
      expect(node.shape).toBeUndefined();
      expect(node.translate).toBeUndefined();
      expect(node.rotate).toBeUndefined();
      expect(node.metadata).toBeUndefined();
    });

    it('accepts all optional fields', () => {
      const node: AssemblyNode = createAssemblyNode('part', {
        translate: [10, 0, 0],
        rotate: { angle: 45, axis: [0, 0, 1] },
        metadata: { material: 'steel' },
      });
      expect(node.name).toBe('part');
      expect(node.translate).toEqual([10, 0, 0]);
      expect(node.rotate).toEqual({ angle: 45, axis: [0, 0, 1] });
      expect(node.metadata).toEqual({ material: 'steel' });
    });
  });

  describe('ModelHistory', () => {
    it('has steps (ReadonlyArray) and shapes (ReadonlyMap)', () => {
      const h: ModelHistory = createHistory();
      expect(h.steps).toEqual([]);
      expect(h.shapes).toBeInstanceOf(Map);
      expect(h.shapes.size).toBe(0);
    });
  });

  describe('OperationStep', () => {
    it('has id, type, parameters, inputIds, outputId, timestamp, optional metadata', () => {
      const step: OperationStep = {
        id: 'step-1',
        type: 'extrude',
        parameters: { height: 10 },
        inputIds: ['face-1'],
        outputId: 'solid-1',
        timestamp: Date.now(),
        metadata: { note: 'first extrude' },
      };
      expect(step.id).toBe('step-1');
      expect(step.type).toBe('extrude');
      expect(step.parameters).toEqual({ height: 10 });
      expect(step.inputIds).toEqual(['face-1']);
      expect(step.outputId).toBe('solid-1');
      expect(step.timestamp).toBeTypeOf('number');
      expect(step.metadata).toEqual({ note: 'first extrude' });
    });
  });

  describe('OperationFn', () => {
    it('is a function type (inputs, params) => AnyShape', () => {
      // We can only verify that a conforming function is assignable
      const fn: OperationFn = (_inputs, _params) => {
        // Would return an AnyShape in real use
        return null as unknown as ReturnType<OperationFn>;
      };
      expect(fn).toBeTypeOf('function');
    });
  });

  describe('HistoryOperationRegistry', () => {
    it('has operations: ReadonlyMap<string, OperationFn>', () => {
      const reg: HistoryOperationRegistry = createRegistry();
      expect(reg.operations).toBeInstanceOf(Map);
      expect(reg.operations.size).toBe(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 3. Union/literal type value verification
// ═══════════════════════════════════════════════════════════════════════

describe('Union type values', () => {
  describe('ShapeKind', () => {
    it('includes all 8 documented kinds', () => {
      const kinds: ShapeKind[] = [
        'vertex',
        'edge',
        'wire',
        'face',
        'shell',
        'solid',
        'compsolid',
        'compound',
      ];
      expect(kinds).toHaveLength(8);
      // Verify no duplicates
      expect(new Set(kinds).size).toBe(8);
    });
  });

  describe('BrepErrorKind', () => {
    it('includes all 8 documented kinds', () => {
      const kinds: BrepErrorKind[] = [
        'OCCT_OPERATION',
        'VALIDATION',
        'TYPE_CAST',
        'SKETCHER_STATE',
        'MODULE_INIT',
        'COMPUTATION',
        'IO',
        'QUERY',
      ];
      expect(kinds).toHaveLength(8);
      expect(new Set(kinds).size).toBe(8);
    });
  });

  describe('PlaneName', () => {
    it('includes all 12 documented plane names', () => {
      const names: PlaneName[] = [
        'XY',
        'YZ',
        'ZX',
        'XZ',
        'YX',
        'ZY',
        'front',
        'back',
        'left',
        'right',
        'top',
        'bottom',
      ];
      expect(names).toHaveLength(12);
      expect(new Set(names).size).toBe(12);
    });
  });

  describe('CurveType', () => {
    it('includes all 9 documented curve types', () => {
      const types: CurveType[] = [
        'LINE',
        'CIRCLE',
        'ELLIPSE',
        'HYPERBOLA',
        'PARABOLA',
        'BEZIER_CURVE',
        'BSPLINE_CURVE',
        'OFFSET_CURVE',
        'OTHER_CURVE',
      ];
      expect(types).toHaveLength(9);
      expect(new Set(types).size).toBe(9);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 4. Type-only assignability checks (compile-time — if it compiles, it passes)
// ═══════════════════════════════════════════════════════════════════════

describe('Type assignability (compile-time checks)', () => {
  it('Point2D is a [number, number] tuple', () => {
    const p: Point2D = [1, 2];
    expect(p).toEqual([1, 2]);
  });

  it('PlaneInput accepts PlaneName or Plane', () => {
    const a: PlaneInput = 'XY';
    const b: PlaneInput = { origin: [0, 0, 0], xDir: [1, 0, 0], yDir: [0, 1, 0], zDir: [0, 0, 1] };
    expect(a).toBe('XY');
    expect(b).toHaveProperty('origin');
  });

  it('ShapeHandle interface shape is checked at compile time', () => {
    // ShapeHandle requires wrapped, disposed, and Symbol.dispose
    // We check the interface keys exist in the type system
    type Keys = keyof ShapeHandle;
    // This is a compile-time assertion: if ShapeHandle didn't have these,
    // the type would be 'never'
    const keys: Keys[] = ['wrapped', 'disposed'];
    expect(keys).toContain('wrapped');
    expect(keys).toContain('disposed');
  });

  it('AnyShape extends ShapeHandle', () => {
    // AnyShape is a union of branded ShapeHandles.
    // If we can assign a ShapeHandle field, the brand constraint is working.
    // This is a compile-time check — the test passing means the types compile.
    type HasWrapped = AnyShape extends { readonly wrapped: unknown } ? true : false;
    const check: HasWrapped = true;
    expect(check).toBe(true);
  });

  it('Shape3D is a subset of AnyShape', () => {
    type IsSubset = Shape3D extends AnyShape ? true : false;
    const check: IsSubset = true;
    expect(check).toBe(true);
  });

  it('Shape1D is a subset of AnyShape', () => {
    type IsSubset = Shape1D extends AnyShape ? true : false;
    const check: IsSubset = true;
    expect(check).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 5. Runtime integration — pure-data types that don't need WASM
// ═══════════════════════════════════════════════════════════════════════

describe('Runtime integration — pure data types', () => {
  describe('Assembly tree operations', () => {
    it('builds a tree and traverses it', () => {
      const root = addChild(
        addChild(
          createAssemblyNode('root'),
          createAssemblyNode('child-a', { translate: [10, 0, 0] })
        ),
        createAssemblyNode('child-b', { translate: [0, 10, 0] })
      );

      expect(countNodes(root)).toBe(3);
      expect(findNode(root, 'child-a')?.translate).toEqual([10, 0, 0]);

      const names: string[] = [];
      walkAssembly(root, (n) => names.push(n.name));
      expect(names).toEqual(['root', 'child-a', 'child-b']);

      const removed = removeChild(root, 'child-a');
      expect(countNodes(removed)).toBe(2);
    });

    it('updateNode preserves name and children', () => {
      const node = createAssemblyNode('part', { translate: [1, 2, 3] });
      const updated = updateNode(node, { translate: [4, 5, 6] });
      expect(updated.name).toBe('part');
      expect(updated.translate).toEqual([4, 5, 6]);
    });
  });

  describe('History operations', () => {
    it('creates, registers shapes, and counts steps', () => {
      let h = createHistory();
      expect(stepCount(h)).toBe(0);

      // We can't create real shapes without WASM, but we can test the structure
      // by registering a mock shape handle
      const mockShape = {
        wrapped: {},
        disposed: false,
        [Symbol.dispose]() {},
      } as unknown as AnyShape;

      h = registerShape(h, 'input-1', mockShape);
      expect(getHistoryShape(h, 'input-1')).toBe(mockShape);

      h = addStep(
        h,
        {
          id: 'step-1',
          type: 'extrude',
          parameters: { height: 10 },
          inputIds: ['input-1'],
          outputId: 'output-1',
        },
        mockShape
      );
      expect(stepCount(h)).toBe(1);
      expect(findStep(h, 'step-1')?.type).toBe('extrude');

      const fromStep = stepsFrom(h, 'step-1');
      expect(fromStep).toHaveLength(1);

      h = undoLast(h);
      expect(stepCount(h)).toBe(0);
    });

    it('registry stores and retrieves operations', () => {
      let reg: HistoryOperationRegistry = createRegistry();
      const fn: OperationFn = (inputs) => inputs[0] as ReturnType<OperationFn>;
      reg = registerOperation(reg, 'myOp', fn);
      expect(reg.operations.get('myOp')).toBe(fn);
    });
  });

  describe('Error construction', () => {
    it('all 8 error kinds produce valid BrepError', () => {
      const constructors = [
        occtError,
        validationError,
        typeCastError,
        sketcherStateError,
        moduleInitError,
        computationError,
        ioError,
        queryError,
      ];
      for (const ctor of constructors) {
        const e = ctor('CODE', 'message');
        expect(e).toHaveProperty('kind');
        expect(e).toHaveProperty('code', 'CODE');
        expect(e).toHaveProperty('message', 'message');
      }
    });
  });
});
