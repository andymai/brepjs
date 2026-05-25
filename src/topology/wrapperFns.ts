/**
 * shape() wrapper — typed, fluent facade over the functional API.
 *
 * Creates a lightweight, immutable wrapper that auto-unwraps Result<T>
 * (throwing BrepError on failure) and preserves type through chains.
 *
 * @example
 * ```ts
 * const bracket = shape(box(30, 20, 10))
 *   .cut(cylinder(5, 15, { at: [15, 10, -1] }))
 *   .fillet((e) => e.inDirection('Z'), 2)
 *   .moveZ(5);
 * ```
 */

import type { Vec3, MatrixInput } from '@/core/types.js';
import type { Result } from '@/core/result.js';
import { isErr } from '@/core/result.js';
import type {
  AnyShape,
  ClosedWire,
  Edge,
  Face,
  OrientedFace,
  Wire,
  Shell,
  Solid,
  Vertex,
  Shape3D,
  ValidSolid,
} from '@/core/shapeTypes.js';
import type { PlanarFace } from '@/core/validityTypes.js';
import { isShape3D, isFace, isEdge, isWire } from '@/core/shapeTypes.js';
import type {
  Shapeable,
  WrappedMarker,
  FinderFn,
  FilletRadius,
  ChamferDistance,
  DraftOptions,
  DrillOptions,
  PocketOptions,
  BossOptions,
  MirrorJoinOptions,
  RectangularPatternOptions,
} from './apiTypes.js';
import type { ShapeFinder } from '@/query/finderFns.js';
import { resolve } from './apiTypes.js';
import type { BooleanOptions } from './booleanFns.js';
import type { Bounds3D, ShapeDescription } from './shapeFns.js';
import type { SurfaceType } from '@/topology/faceFns.js';

// Lazy imports to avoid circular dependencies — these are resolved at call time
// We import the actual functions from the public API layer

import {
  translate,
  rotate,
  mirror,
  scale,
  clone,
  applyMatrix,
  fuse,
  cut,
  intersect,
  fillet,
  chamfer,
  shell,
  offset,
  draft as draftFn,
  describe,
  mesh as meshFn,
  meshEdges as meshEdgesFn,
  isValid as isValidFn,
  isEmpty as isEmptyFn,
  toBREP as toBREPFn,
  heal as healFn,
  simplify as simplifyFn,
  section as sectionFn,
  split as splitFn,
  slice as sliceFn,
} from './api.js';
import { getBounds, getEdges, getFaces, getWires, getVertices } from './shapeFns.js';
import type { PlaneInput } from '@/core/planeTypes.js';
import type { ShapeMesh, EdgeMesh, MeshOptions } from './meshFns.js';
import { cutAll as cutAllFn, fuseAll as fuseAllFn } from './booleanFns.js';
import { extrude, revolve } from '@/operations/api.js';
import {
  measureVolume,
  measureArea,
  measureVolumeProps,
  measureSurfaceProps,
} from '@/measurement/measureFns.js';
import type { VolumeProps, SurfaceProps } from '@/measurement/measureFns.js';
import {
  curveStartPoint,
  curveEndPoint,
  curvePointAt,
  curveTangentAt,
  curveLength,
  curveIsClosed,
} from './curveFns.js';
import { normalAt, faceCenter, getSurfaceType, outerWire, innerWires } from './faceFns.js';
import { linearPattern, circularPattern } from '@/operations/patternFns.js';
import { sweep as _sweep } from '@/operations/extrudeFns.js';
import type { SweepOptions } from '@/operations/extrudeFns.js';
import {
  drill as drillFn,
  pocket as pocketFn,
  boss as bossFn,
  mirrorJoin as mirrorJoinFn,
  rectangularPattern as rectPatternFn,
} from './compoundOpsFns.js';

// ---------------------------------------------------------------------------
// BrepError class for wrapper throws
// ---------------------------------------------------------------------------

/**
 * Error class thrown by the shape() wrapper when a Result<T> contains an Err.
 * Wraps the structured BrepError for catch-based handling.
 */
export class BrepWrapperError extends Error {
  readonly code: string;
  readonly kind: string;
  readonly suggestion?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- metadata can be anything
  readonly metadata?: Record<string, any>;

  constructor(brepError: {
    kind: string;
    code: string;
    message: string;
    suggestion?: string;
    metadata?: Record<string, unknown>;
  }) {
    // Include suggestion in error message if present
    const fullMessage = brepError.suggestion
      ? `${brepError.message}\nSuggestion: ${brepError.suggestion}`
      : brepError.message;
    super(fullMessage);
    this.name = 'BrepError';
    this.code = brepError.code;
    this.kind = brepError.kind;
    if (brepError.suggestion) {
      this.suggestion = brepError.suggestion;
    }
    if (brepError.metadata) {
      this.metadata = brepError.metadata;
    }
  }
}

/** Unwrap a Result, throwing BrepWrapperError on Err. */
function unwrapOrThrow<T>(result: Result<T>): T {
  if (isErr(result)) {
    throw new BrepWrapperError(result.error);
  }
  return result.value;
}

// ---------------------------------------------------------------------------
// Trust casts — fluent-API contract bridges
//
// The wrapper expresses a "trust me" contract: callers building a chain like
// `shape(box(...)).fillet(...)` have implicitly affirmed the shape is a
// ValidSolid by asking for an operation that requires one. Runtime validation
// would defeat the fluent ergonomics, so these helpers consolidate the
// unchecked `unknown` bridge in one auditable place.
// ---------------------------------------------------------------------------

function asValidSolid(s: Shape3D): ValidSolid {
  // brepjs-patterns-disable: no-double-cast
  return s as unknown as ValidSolid;
}

function asOrientedPlanarFace(f: Face): OrientedFace & PlanarFace {
  // brepjs-patterns-disable: no-double-cast
  return f as unknown as OrientedFace & PlanarFace;
}

function asClosedWire(w: Wire): ClosedWire {
  // brepjs-patterns-disable: no-double-cast
  return w as unknown as ClosedWire;
}

/**
 * Trust-cast the result of a Shape3D-returning operation back to the wrapper's
 * generic `T`. The fluent API contract claims chained operations preserve the
 * input shape type T; runtime semantics enforce this (e.g. fillet on a Solid
 * returns a Solid), but TypeScript can't prove it because the underlying
 * functional operations return `Shape3D`.
 *
 * Centralizing the cast in one helper keeps the unchecked bridge auditable.
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- caller-supplied T is the whole purpose of this trust cast
function trustAsT<T extends Shape3D>(s: Shape3D): T {
  // brepjs-patterns-disable: no-double-cast
  return s as unknown as T;
}

// ---------------------------------------------------------------------------
// Wrapped interfaces (exported for type annotations)
// ---------------------------------------------------------------------------

/** Base wrapper — available on all shapes. */
export interface Wrapped<T extends AnyShape> extends WrappedMarker<T> {
  readonly val: T;
  readonly __wrapped: true;

  // Transforms
  translate(v: Vec3): Wrapped<T>;
  rotate(angle: number, options?: { at?: Vec3; axis?: Vec3 }): Wrapped<T>;
  mirror(options?: { normal?: Vec3; at?: Vec3 }): Wrapped<T>;
  scale(factor: number, options?: { center?: Vec3 }): Wrapped<T>;
  applyMatrix(matrix: MatrixInput): Wrapped<T>;

  // Axis shortcuts
  moveX(distance: number): Wrapped<T>;
  moveY(distance: number): Wrapped<T>;
  moveZ(distance: number): Wrapped<T>;
  rotateX(angle: number): Wrapped<T>;
  rotateY(angle: number): Wrapped<T>;
  rotateZ(angle: number): Wrapped<T>;

  // Introspection
  bounds(): Bounds3D;
  describe(): ShapeDescription;
  clone(): Wrapped<T>;

  // Meshing & Rendering
  mesh(
    options?: MeshOptions & { skipNormals?: boolean; includeUVs?: boolean; cache?: boolean }
  ): ShapeMesh;
  meshEdges(options?: MeshOptions & { cache?: boolean }): EdgeMesh;

  // Validation & Utilities
  isValid(): boolean;
  isEmpty(): boolean;
  heal(): Wrapped<T>;
  simplify(): Wrapped<T>;
  toBREP(): string;

  // Escape hatches
  apply<U extends AnyShape>(fn: (shape: T) => U): Wrapped<U>;
  applyResult<U extends AnyShape>(fn: (shape: T) => Result<U>): Wrapped<U>;

  // Extraction
  done(): T;
}

/** 3D wrapper — booleans, modifiers, measurement, queries. */
export interface Wrapped3D<T extends Shape3D> extends Wrapped<T> {
  // Booleans
  fuse(tool: Shapeable<Shape3D>, options?: BooleanOptions): Wrapped3D<T>;
  cut(tool: Shapeable<Shape3D>, options?: BooleanOptions): Wrapped3D<T>;
  intersect(tool: Shapeable<Shape3D>, options?: BooleanOptions): Wrapped3D<T>;

  // Batch booleans
  fuseAll(tools: Shapeable<Shape3D>[], options?: BooleanOptions): Wrapped3D<T>;
  cutAll(tools: Shape3D[], options?: BooleanOptions): Wrapped3D<T>;

  // Boolean variants
  section(
    plane: PlaneInput,
    options?: { approximation?: boolean; planeSize?: number }
  ): Wrapped<AnyShape>;
  split(tools: AnyShape[]): Wrapped<AnyShape>;
  slice(
    planes: PlaneInput[],
    options?: { approximation?: boolean; planeSize?: number }
  ): AnyShape[];

  // Modifiers
  fillet(radius: FilletRadius): Wrapped3D<T>;
  fillet(edges: Edge[] | FinderFn<Edge> | ShapeFinder<Edge>, radius: FilletRadius): Wrapped3D<T>;
  chamfer(distance: ChamferDistance): Wrapped3D<T>;
  chamfer(
    edges: Edge[] | FinderFn<Edge> | ShapeFinder<Edge>,
    distance: ChamferDistance
  ): Wrapped3D<T>;
  shell(
    faces: Face[] | FinderFn<Face> | ShapeFinder<Face>,
    thickness: number,
    options?: { tolerance?: number }
  ): Wrapped3D<T>;
  offset(distance: number, options?: { tolerance?: number }): Wrapped3D<T>;
  draft(faces: Face[] | FinderFn<Face> | ShapeFinder<Face>, options: DraftOptions): Wrapped3D<T>;

  // Compound operations (placeholders — filled in when compoundOpsFns.ts is ready)
  drill(options: DrillOptions): Wrapped3D<T>;
  pocket(options: PocketOptions): Wrapped3D<T>;
  boss(options: BossOptions): Wrapped3D<T>;
  mirrorJoin(options?: MirrorJoinOptions): Wrapped3D<T>;
  rectangularPattern(options: RectangularPatternOptions): Wrapped3D<T>;

  // Measurement
  volume(): number;
  area(): number;
  volumeProps(): VolumeProps;
  surfaceProps(): SurfaceProps;

  // Queries
  edges(): Edge[];
  faces(): Face[];
  wires(): Wire[];
  vertices(): Vertex[];

  // Patterns
  linearPattern(direction: Vec3, count: number, spacing: number): Wrapped3D<T>;
  circularPattern(axis: Vec3, count: number, angle?: number): Wrapped3D<T>;
}

/** Curve wrapper — edge/wire introspection. */
export interface WrappedCurve<T extends Edge | Wire> extends Wrapped<T> {
  length(): number;
  startPoint(): Vec3;
  endPoint(): Vec3;
  pointAt(t?: number): Vec3;
  tangentAt(t?: number): Vec3;
  isClosed(): boolean;

  sweep(spine: Shapeable<Wire>, options?: SweepOptions): Wrapped3D<Shape3D>;
}

/** Face wrapper — face introspection + 2D→3D transitions. */
export interface WrappedFace extends Wrapped<Face> {
  area(): number;
  normalAt(point?: Vec3): Vec3;
  center(): Vec3;
  surfaceType(): SurfaceType;
  outerWire(): Wire;
  innerWires(): Wire[];

  extrude(height: number | Vec3): Wrapped3D<Solid>;
  revolve(options?: { axis?: Vec3; at?: Vec3; angle?: number }): Wrapped3D<Shape3D>;
}

// ---------------------------------------------------------------------------
// Implementation — single factory creating the right wrapper based on shape type
// ---------------------------------------------------------------------------

function createWrappedBase<T extends AnyShape>(val: T): Wrapped<T> {
  const self: Wrapped<T> = {
    val,
    __wrapped: true as const,

    translate: (v) => wrapAny(translate(val, v)),
    rotate: (angle, opts) => wrapAny(rotate(val, angle, opts)),
    mirror: (opts) => wrapAny(mirror(val, opts)),
    scale: (factor, opts) => wrapAny(scale(val, factor, opts)),
    applyMatrix: (matrix) => wrapAny(unwrapOrThrow(applyMatrix(val, matrix))),

    moveX: (d) => wrapAny(translate(val, [d, 0, 0])),
    moveY: (d) => wrapAny(translate(val, [0, d, 0])),
    moveZ: (d) => wrapAny(translate(val, [0, 0, d])),
    rotateX: (a) => wrapAny(rotate(val, a, { axis: [1, 0, 0] })),
    rotateY: (a) => wrapAny(rotate(val, a, { axis: [0, 1, 0] })),
    rotateZ: (a) => wrapAny(rotate(val, a, { axis: [0, 0, 1] })),

    bounds: () => getBounds(val),
    describe: () => describe(val),
    clone: () => wrapAny(unwrapOrThrow(clone(val))),

    // Meshing & Rendering
    mesh: (opts) => meshFn(val, opts),
    meshEdges: (opts) => meshEdgesFn(val, opts),

    // Validation & Utilities
    isValid: () => isValidFn(val),
    isEmpty: () => isEmptyFn(val),
    heal: () => wrapAny(unwrapOrThrow(healFn(val))),
    simplify: () => wrapAny(unwrapOrThrow(simplifyFn(val))),
    toBREP: () => unwrapOrThrow(toBREPFn(val)),

    apply: (fn) => wrapAny(fn(val)),
    applyResult: (fn) => wrapAny(unwrapOrThrow(fn(val))),

    // Extraction
    done: () => val,
  };
  return self;
}

type Wrapped3DBooleans<T extends Shape3D> = Pick<
  Wrapped3D<T>,
  'fuse' | 'cut' | 'intersect' | 'fuseAll' | 'cutAll' | 'section' | 'split' | 'slice'
>;
type Wrapped3DModifiers<T extends Shape3D> = Pick<
  Wrapped3D<T>,
  'fillet' | 'chamfer' | 'shell' | 'offset' | 'draft'
>;
type Wrapped3DCompoundOps<T extends Shape3D> = Pick<
  Wrapped3D<T>,
  'drill' | 'pocket' | 'boss' | 'mirrorJoin' | 'rectangularPattern'
>;
type Wrapped3DMeasurement<T extends Shape3D> = Pick<
  Wrapped3D<T>,
  'volume' | 'area' | 'volumeProps' | 'surfaceProps'
>;
type Wrapped3DQueries<T extends Shape3D> = Pick<
  Wrapped3D<T>,
  'edges' | 'faces' | 'wires' | 'vertices'
>;
type Wrapped3DPatterns<T extends Shape3D> = Pick<Wrapped3D<T>, 'linearPattern' | 'circularPattern'>;

function create3DBooleans<T extends Shape3D>(val: T): Wrapped3DBooleans<T> {
  return {
    // `unsafe: true` bypasses the ValidSolid requirement — fluent callers
    // express trust by chaining, runtime semantics catch genuine failures.
    fuse: (tool, opts) =>
      wrap3D(unwrapOrThrow(fuse(val, resolve(tool), { ...opts, unsafe: true }))),
    cut: (tool, opts) => wrap3D(unwrapOrThrow(cut(val, resolve(tool), { ...opts, unsafe: true }))),
    intersect: (tool, opts) =>
      wrap3D(unwrapOrThrow(intersect(val, resolve(tool), { ...opts, unsafe: true }))),
    fuseAll: (tools, opts) =>
      wrap3D(
        trustAsT<T>(
          unwrapOrThrow(fuseAllFn([val, ...tools.map(resolve)], { ...opts, unsafe: true }))
        )
      ),
    cutAll: (tools, opts) =>
      wrap3D(trustAsT<T>(unwrapOrThrow(cutAllFn(val, tools, { ...opts, unsafe: true })))),
    section: (plane, opts) => wrapAny(unwrapOrThrow(sectionFn(val, plane, opts)) as AnyShape),
    split: (tools) => wrapAny(unwrapOrThrow(splitFn(val, tools)) as AnyShape),
    slice: (planes, opts) => unwrapOrThrow(sliceFn(val, planes, opts)) as AnyShape[],
  };
}

function create3DModifiers<T extends Shape3D>(val: T): Wrapped3DModifiers<T> {
  return {
    fillet(
      ...args: [FilletRadius] | [Edge[] | FinderFn<Edge> | ShapeFinder<Edge>, FilletRadius]
    ): Wrapped3D<T> {
      if (args.length === 1) {
        return wrap3D(trustAsT<T>(unwrapOrThrow(fillet(asValidSolid(val), args[0]))));
      }
      return wrap3D(trustAsT<T>(unwrapOrThrow(fillet(asValidSolid(val), args[0], args[1]))));
    },
    chamfer(
      ...args: [ChamferDistance] | [Edge[] | FinderFn<Edge> | ShapeFinder<Edge>, ChamferDistance]
    ): Wrapped3D<T> {
      if (args.length === 1) {
        return wrap3D(trustAsT<T>(unwrapOrThrow(chamfer(asValidSolid(val), args[0]))));
      }
      return wrap3D(trustAsT<T>(unwrapOrThrow(chamfer(asValidSolid(val), args[0], args[1]))));
    },
    shell: (faces, thickness, opts) =>
      wrap3D(trustAsT<T>(unwrapOrThrow(shell(asValidSolid(val), faces, thickness, opts)))),
    offset: (distance, opts) =>
      wrap3D(trustAsT<T>(unwrapOrThrow(offset(asValidSolid(val), distance, opts)))),
    draft: (faces, opts) =>
      wrap3D(trustAsT<T>(unwrapOrThrow(draftFn(asValidSolid(val), faces, opts)))),
  };
}

function create3DCompoundOps<T extends Shape3D>(val: T): Wrapped3DCompoundOps<T> {
  return {
    drill: (opts) => wrap3D(unwrapOrThrow(drillFn(val, opts))),
    pocket: (opts) => wrap3D(unwrapOrThrow(pocketFn(val, opts))),
    boss: (opts) => wrap3D(unwrapOrThrow(bossFn(val, opts))),
    mirrorJoin: (opts) => wrap3D(unwrapOrThrow(mirrorJoinFn(val, opts))),
    rectangularPattern: (opts) => wrap3D(unwrapOrThrow(rectPatternFn(val, opts))),
  };
}

function create3DMeasurement<T extends Shape3D>(val: T): Wrapped3DMeasurement<T> {
  return {
    volume: () => unwrapOrThrow(measureVolume(val)),
    area: () => unwrapOrThrow(measureArea(val)),
    volumeProps: () => unwrapOrThrow(measureVolumeProps(val)),
    surfaceProps: () => unwrapOrThrow(measureSurfaceProps(val)),
  };
}

function create3DQueries<T extends Shape3D>(val: T): Wrapped3DQueries<T> {
  return {
    edges: () => getEdges(val),
    faces: () => getFaces(val),
    wires: () => getWires(val),
    vertices: () => getVertices(val),
  };
}

function create3DPatterns<T extends Shape3D>(val: T): Wrapped3DPatterns<T> {
  return {
    linearPattern: (dir, count, spacing) =>
      wrap3D(trustAsT<T>(unwrapOrThrow(linearPattern(val, dir, count, spacing)))),
    circularPattern: (axis, count, angle) =>
      wrap3D(trustAsT<T>(unwrapOrThrow(circularPattern(val, axis, count, angle)))),
  };
}

function createWrapped3D<T extends Shape3D>(val: T): Wrapped3D<T> {
  return {
    ...createWrappedBase(val),
    ...create3DBooleans(val),
    ...create3DModifiers(val),
    ...create3DCompoundOps(val),
    ...create3DMeasurement(val),
    ...create3DQueries(val),
    ...create3DPatterns(val),
  };
}

function createWrappedCurve<T extends Edge | Wire>(val: T): WrappedCurve<T> {
  const base = createWrappedBase(val);

  return {
    ...base,
    length: () => curveLength(val),
    startPoint: () => curveStartPoint(val),
    endPoint: () => curveEndPoint(val),
    pointAt: (t) => curvePointAt(val, t),
    tangentAt: (t) => curveTangentAt(val, t),
    isClosed: () => curveIsClosed(val),

    sweep(spine: Shapeable<Wire>, opts?: SweepOptions): Wrapped3D<Shape3D> {
      if (!isWire(val)) throw new Error('sweep requires a Wire');
      const result = unwrapOrThrow(_sweep(asClosedWire(val), resolve(spine), opts));
      // _sweep may return [Shape3D, Wire, Wire] in shell mode; extract the shape
      const shape3D: Shape3D = Array.isArray(result) ? result[0] : result;
      return wrap3D(shape3D);
    },
  };
}

function createWrappedFace(val: Face): WrappedFace {
  const base = createWrappedBase(val);

  return {
    ...base,
    area: () => unwrapOrThrow(measureArea(val)),
    normalAt: (point) => normalAt(val, point),
    center: () => faceCenter(val),
    surfaceType: () => unwrapOrThrow(getSurfaceType(val)),
    outerWire: () => outerWire(val),
    innerWires: () => innerWires(val),

    // Wrapped faces from the fluent API are always oriented and planar
    extrude: (height) => wrap3D(unwrapOrThrow(extrude(asOrientedPlanarFace(val), height))),
    revolve: (opts) => wrap3D(unwrapOrThrow(revolve(asOrientedPlanarFace(val), opts))),
  };
}

// ---------------------------------------------------------------------------
// Internal wrap helpers — dispatch to the right wrapper type
// ---------------------------------------------------------------------------

function wrapAny<T extends AnyShape>(val: T): Wrapped<T> {
  if (isShape3D(val)) return createWrapped3D(val);
  if (isFace(val)) {
    // isFace(val) narrows val to Face at runtime, so T is Face here. TS can't
    // propagate that into the generic, so the cast is safe by construction.
    // brepjs-patterns-disable: no-double-cast
    return createWrappedFace(val) as unknown as Wrapped<T>;
  }
  if (isEdge(val) || isWire(val)) return createWrappedCurve(val);
  return createWrappedBase(val);
}

function wrap3D<T extends Shape3D>(val: T): Wrapped3D<T> {
  return createWrapped3D(val);
}

// ---------------------------------------------------------------------------
// shape() — public entry point
// ---------------------------------------------------------------------------

/** Create a typed shape wrapper from a Sketch-like object (converts to Face) or a Face. */
export function shape(sketchOrFace: { face(): Face } | Face): WrappedFace;
/** Create a typed shape wrapper from a Solid. */
export function shape(solid: Solid): Wrapped3D<Solid>;
/** Create a typed shape wrapper from a Shell. */
export function shape(shell: Shell): Wrapped3D<Shell>;
/** Create a typed shape wrapper from an Edge. */
export function shape(edge: Edge): WrappedCurve<Edge>;
/** Create a typed shape wrapper from a Wire. */
export function shape(wire: Wire): WrappedCurve<Wire>;
/** Create a typed shape wrapper from any shape. */
export function shape<T extends AnyShape>(s: T): Wrapped<T>;

export function shape(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- overload implementation
  s: any
): Wrapped<AnyShape> {
  // Check if it's a Sketch-like object (has face() method + _defaultOrigin)
  if (
    s &&
    typeof s === 'object' &&
    'face' in s &&
    typeof s.face === 'function' &&
    '_defaultOrigin' in s
  ) {
    return createWrappedFace(s.face() as Face);
  }

  // Branded shape types
  if (s && typeof s === 'object' && 'wrapped' in s) {
    if (isFace(s)) return createWrappedFace(s as Face);
    if (isShape3D(s)) return createWrapped3D(s);
    if (isEdge(s) || isWire(s)) return createWrappedCurve(s as Edge | Wire);
    return createWrappedBase(s as AnyShape);
  }

  throw new Error('shape() requires a Sketch or branded shape type');
}
