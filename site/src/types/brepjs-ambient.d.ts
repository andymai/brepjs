/**
 * Ambient type declarations for brepjs functions available in the playground.
 * These are injected onto globalThis in the web worker, so user code can
 * use them without imports.
 *
 * This is a handwritten subset (~80 most-used functions).
 * Full generated types are deferred to v2.
 */

// ── Result type ──

interface Ok<T> { readonly value: T; readonly error?: never; }
interface Err<E> { readonly error: E; readonly value?: never; }
type Result<T, E = BrepError> = Ok<T> | Err<E>;

interface BrepError {
  readonly code: string;
  readonly message: string;
}

declare function ok<T>(value: T): Ok<T>;
declare function err<E>(error: E): Err<E>;
declare function isOk<T, E>(result: Result<T, E>): result is Ok<T>;
declare function isErr<T, E>(result: Result<T, E>): result is Err<E>;
declare function unwrap<T>(result: Result<T>): T;
declare function unwrapOr<T>(result: Result<T>, fallback: T): T;

// ── Vec types ──

type Vec3 = [number, number, number];
type Vec2 = [number, number];

// ── Shape types (branded) ──

interface AnyShape { readonly __brand: 'shape'; readonly wrapped: unknown; }
interface Shape3D extends AnyShape { readonly __brand3d: true; }
type FnSolid = Shape3D;
type FnFace = AnyShape;
type FnEdge = AnyShape;
type FnWire = AnyShape;
type FnShell = AnyShape;
type FnCompound = AnyShape;

// ── Casting ──

declare function castShape(ocShape: unknown): AnyShape;

// ── Primitives (legacy class-based, return objects with .wrapped) ──

interface LegacyShape {
  wrapped: unknown;
  translate(point: Vec3 | number[]): LegacyShape;
  rotate(angle: number, axis?: Vec3): LegacyShape;
  fuse(other: LegacyShape): LegacyShape;
  cut(other: LegacyShape): LegacyShape;
}

declare function makeBox(min: Vec3 | number[], max: Vec3 | number[]): LegacyShape;
declare function makeCylinder(radius: number, height: number, center?: Vec3): LegacyShape;
declare function makeSphere(radius: number, center?: Vec3): LegacyShape;
declare function makeCone(r1: number, r2: number, height: number): LegacyShape;
declare function makeTorus(majorR: number, minorR: number): LegacyShape;

// ── Boolean operations ──

declare function fuseShapes(a: AnyShape, b: AnyShape): Result<Shape3D>;
declare function cutShape(a: AnyShape, b: AnyShape): Result<Shape3D>;
declare function intersectShapes(a: AnyShape, b: AnyShape): Result<Shape3D>;
declare function fnFuseAll(shapes: AnyShape[]): Result<Shape3D>;
declare function fnCutAll(base: AnyShape, shapes: AnyShape[]): Result<Shape3D>;
declare function fnBuildCompound(shapes: AnyShape[]): AnyShape;

// ── Transforms ──

declare function translateShape(shape: AnyShape, offset: Vec3): AnyShape;
declare function rotateShape(shape: AnyShape, angleDeg: number, position?: Vec3, direction?: Vec3): AnyShape;
declare function mirrorShape(shape: AnyShape, planeNormal?: Vec3, planeOrigin?: Vec3): AnyShape;
declare function scaleShape(shape: AnyShape, factor: number, center?: Vec3): AnyShape;
declare function cloneShape(shape: AnyShape): AnyShape;

// ── Modifiers ──

declare function filletShape(shape: Shape3D, edges: AnyShape[] | undefined, radius: number): Result<Shape3D>;
declare function chamferShape(shape: Shape3D, edges: AnyShape[] | undefined, distance: number): Result<Shape3D>;
declare function shellShape(shape: Shape3D, faces: AnyShape[], thickness: number): Result<Shape3D>;
declare function offsetShape(shape: AnyShape, offset: number, tolerance?: number): Result<AnyShape>;

// ── Extrusion / Revolution ──

declare function extrudeFace(face: AnyShape, direction: Vec3, length: number): Result<Shape3D>;
declare function revolveFace(face: AnyShape, axis: { origin: Vec3; direction: Vec3 }, angleDeg: number): Result<Shape3D>;

// ── Advanced Extrusion ──

interface SweepConfig {
  frenet?: boolean;
  transitionMode?: 'right' | 'transformed' | 'round';
}
declare function sweep(wire: AnyShape, spine: AnyShape, config?: SweepConfig, shellMode?: boolean): Result<Shape3D>;
declare function genericSweep(wire: AnyShape, spine: AnyShape, config?: SweepConfig, shellMode?: boolean): Result<Shape3D>;
declare function twistExtrude(wire: AnyShape, angleDeg: number, center: Vec3, normal: Vec3, profileShape?: { profile?: 's-curve' | 'linear'; endFactor?: number }, shellMode?: boolean): Result<Shape3D>;

// ── Loft ──

interface LoftConfig { ruled?: boolean; startPoint?: Vec3; endPoint?: Vec3; }
declare function loftWires(wires: AnyShape[], config?: LoftConfig, returnShell?: boolean): Result<Shape3D>;

// ── Patterns ──

declare function linearPattern(shape: Shape3D, direction: Vec3, count: number, spacing: number): Result<Shape3D>;
declare function circularPattern(shape: Shape3D, axis: Vec3, count: number, fullAngle?: number, center?: Vec3): Result<Shape3D>;

// ── Curves ──

declare function makeCircle(radius: number, center?: Vec3, normal?: Vec3): AnyShape;
declare function makeLine(start: Vec3, end: Vec3): AnyShape;
declare function makeHelix(pitch: number, height: number, radius: number, center?: Vec3, dir?: Vec3, lefthand?: boolean): AnyShape;
declare function makeBezierCurve(points: Vec3[]): AnyShape;
declare function makeBSplineApproximation(points: Vec3[], config?: { tolerance?: number; degMax?: number }): Result<AnyShape>;
declare function assembleWire(edges: AnyShape[]): Result<AnyShape>;

// ── Topology queries ──

declare function getEdges(shape: AnyShape): AnyShape[];
declare function getFaces(shape: AnyShape): AnyShape[];
declare function getWires(shape: AnyShape): AnyShape[];
declare function getVertices(shape: AnyShape): AnyShape[];
declare function getBounds(shape: AnyShape): { min: Vec3; max: Vec3 };

// ── Measurement ──

declare function fnMeasureVolume(shape: AnyShape): number;
declare function fnMeasureArea(shape: AnyShape): number;
declare function fnMeasureLength(shape: AnyShape): number;

// ── Meshing & Export ──

declare function meshShape(shape: AnyShape, options?: { tolerance?: number; angularTolerance?: number }): unknown;
declare function fnExportSTEP(shape: AnyShape): Result<Blob>;
declare function fnExportSTL(shape: AnyShape, options?: { tolerance?: number; binary?: boolean }): Result<Blob>;

// ── 2D Drawing API ──

interface Drawing {
  translate(offset: Vec2 | number[]): Drawing;
  rotate(angleDeg: number): Drawing;
  scale(factor: number): Drawing;
  mirror(axis: Vec2 | number[]): Drawing;
}

declare function draw(): DrawingPen;
declare function drawRectangle(width: number, height: number): Drawing;
declare function drawCircle(radius: number): Drawing;
declare function drawRoundedRectangle(width: number, height: number, radius: number): Drawing;
declare function drawPolysides(radius: number, sides: number, sagitta?: number): Drawing;
declare function drawEllipse(rx: number, ry: number): Drawing;

interface DrawingPen {
  lineTo(point: Vec2 | number[]): DrawingPen;
  line(dx: number, dy: number): DrawingPen;
  vLine(dy: number): DrawingPen;
  hLine(dx: number): DrawingPen;
  sagittaArcTo(point: Vec2 | number[], sagitta: number): DrawingPen;
  close(): Drawing;
  closeWithMirror(): Drawing;
}

declare function drawingToSketchOnPlane(drawing: Drawing, plane: string): unknown;
declare function drawingCut(a: Drawing, b: Drawing): Drawing;
declare function drawingFuse(a: Drawing, b: Drawing): Drawing;
declare function drawingIntersect(a: Drawing, b: Drawing): Drawing;

// ── Canned Sketches ──

interface SketchPlaneConfig { plane?: string; origin?: Vec3 | number; }
interface Sketch { wire: AnyShape; face(): AnyShape; clone(): Sketch; delete(): void; }
declare function sketchCircle(radius: number, planeConfig?: SketchPlaneConfig): Sketch;
declare function sketchRectangle(w: number, h: number, planeConfig?: SketchPlaneConfig): Sketch;
declare function sketchRoundedRectangle(w: number, h: number, r?: number, planeConfig?: SketchPlaneConfig): Sketch;
declare function sketchPolysides(radius: number, sides: number, sagitta?: number, planeConfig?: SketchPlaneConfig): Sketch;

// ── Sketch operations ──

/** Extrude a sketch by the given height. Returns a Shape3D directly. */
declare function sketchExtrude(sketch: unknown, height: number, config?: {
  extrusionDirection?: Vec3;
  twistAngle?: number;
  origin?: Vec3;
}): LegacyShape;

/** Revolve a sketch around an axis. Default axis depends on sketch plane. Returns a Shape3D directly. */
declare function sketchRevolve(sketch: unknown, revolutionAxis?: Vec3, options?: { origin?: Vec3 }): LegacyShape;

/** Loft between sketches. Consumes the sketches. */
declare function sketchLoft(sketch: Sketch | unknown, others: Sketch | Sketch[] | unknown | unknown[], config?: LoftConfig): LegacyShape;

/** Sweep another sketch along this sketch's wire. Consumes the sketch. */
declare function sketchSweep(sketch: unknown, profileCb: (plane: unknown, origin: Vec3) => unknown, config?: SweepConfig): LegacyShape;

// ── Face queries ──

declare function faceCenter(face: AnyShape): Vec3;

// ── Disposal ──

declare function withScope<T>(fn: () => T): T;
