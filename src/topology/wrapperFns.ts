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

import type { Vec3 } from '../core/types.js';
import type { Result } from '../core/result.js';
import { isErr } from '../core/result.js';
import type {
  AnyShape,
  Edge,
  Face,
  Wire,
  Shell,
  Solid,
  Vertex,
  Shape3D,
} from '../core/shapeTypes.js';
import { isShape3D, isFace, isEdge, isWire } from '../core/shapeTypes.js';
import type {
  Shapeable,
  WrappedMarker,
  FinderFn,
  FilletRadius,
  ChamferDistance,
  DrillOptions,
  PocketOptions,
  BossOptions,
  MirrorJoinOptions,
  RectangularPatternOptions,
} from './apiTypes.js';
import type { ShapeFinder } from '../query/finderFns.js';
import { resolve } from './apiTypes.js';
import type { BooleanOptions } from './booleanFns.js';
import type { Bounds3D, ShapeDescription } from './shapeFns.js';
import type { SurfaceType } from '../topology/faceFns.js';

// Lazy imports to avoid circular dependencies — these are resolved at call time
// We import the actual functions from the public API layer

import {
  translate,
  rotate,
  mirror,
  scale,
  clone,
  fuse,
  cut,
  intersect,
  fillet,
  chamfer,
  shell,
  offset,
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
import type { PlaneInput } from '../core/planeTypes.js';
import type { ShapeMesh, EdgeMesh, MeshOptions } from './meshFns.js';
import { cutAll as cutAllFn } from './booleanFns.js';
import { extrude, revolve } from '../operations/api.js';
import {
  measureVolume,
  measureArea,
  measureVolumeProps,
  measureSurfaceProps,
} from '../measurement/measureFns.js';
import type { VolumeProps, SurfaceProps } from '../measurement/measureFns.js';
import {
  curveStartPoint,
  curveEndPoint,
  curvePointAt,
  curveTangentAt,
  curveLength,
  curveIsClosed,
} from './curveFns.js';
import { normalAt, faceCenter, getSurfaceType, outerWire, innerWires } from './faceFns.js';
import { linearPattern, circularPattern } from '../operations/patternFns.js';
import { sweep as _sweep } from '../operations/extrudeFns.js';
import type { SweepOptions } from '../operations/extrudeFns.js';
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- metadata can be anything
  readonly metadata?: Record<string, any>;

  constructor(brepError: {
    kind: string;
    code: string;
    message: string;
    metadata?: Record<string, unknown>;
  }) {
    super(brepError.message);
    this.name = 'BrepError';
    this.code = brepError.code;
    this.kind = brepError.kind;
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
// Wrapped interfaces (exported for type annotations)
// ---------------------------------------------------------------------------

/** Base wrapper — available on all shapes. */
export interface Wrapped<T extends AnyShape> extends WrappedMarker<T> {
  readonly val: T;
  readonly __wrapped: true;

  // Transforms
  translate(v: Vec3): Wrapped<T>;
  rotate(angle: number, options?: { around?: Vec3; axis?: Vec3 }): Wrapped<T>;
  mirror(options?: { normal?: Vec3; origin?: Vec3 }): Wrapped<T>;
  scale(factor: number, options?: { center?: Vec3 }): Wrapped<T>;

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
}

/** 3D wrapper — booleans, modifiers, measurement, queries. */
export interface Wrapped3D<T extends Shape3D> extends Wrapped<T> {
  // Booleans
  fuse(tool: Shapeable<Shape3D>, options?: BooleanOptions): Wrapped3D<T>;
  cut(tool: Shapeable<Shape3D>, options?: BooleanOptions): Wrapped3D<T>;
  intersect(tool: Shapeable<Shape3D>, options?: BooleanOptions): Wrapped3D<T>;

  // Batch booleans
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
  revolve(options?: { axis?: Vec3; around?: Vec3; angle?: number }): Wrapped3D<Shape3D>;
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

    moveX: (d) => wrapAny(translate(val, [d, 0, 0])),
    moveY: (d) => wrapAny(translate(val, [0, d, 0])),
    moveZ: (d) => wrapAny(translate(val, [0, 0, d])),
    rotateX: (a) => wrapAny(rotate(val, a, { axis: [1, 0, 0] })),
    rotateY: (a) => wrapAny(rotate(val, a, { axis: [0, 1, 0] })),
    rotateZ: (a) => wrapAny(rotate(val, a, { axis: [0, 0, 1] })),

    bounds: () => getBounds(val),
    describe: () => describe(val),
    clone: () => wrapAny(clone(val)),

    // Meshing & Rendering
    mesh: (opts) => meshFn(val, opts),
    meshEdges: (opts) => meshEdgesFn(val, opts),

    // Validation & Utilities
    isValid: () => isValidFn(val),
    isEmpty: () => isEmptyFn(val),
    heal: () => wrapAny(unwrapOrThrow(healFn(val))),
    simplify: () => wrapAny(simplifyFn(val)),
    toBREP: () => toBREPFn(val),

    apply: (fn) => wrapAny(fn(val)),
    applyResult: (fn) => wrapAny(unwrapOrThrow(fn(val))),
  };
  return self;
}

function createWrapped3D<T extends Shape3D>(val: T): Wrapped3D<T> {
  const base = createWrappedBase(val);

  const self: Wrapped3D<T> = {
    ...base,

    // Booleans — cast through unknown to satisfy generic constraint
    fuse: (tool, opts) => wrap3D(unwrapOrThrow(fuse(val, resolve(tool), opts)) as unknown as T),
    cut: (tool, opts) => wrap3D(unwrapOrThrow(cut(val, resolve(tool), opts)) as unknown as T),
    intersect: (tool, opts) =>
      wrap3D(unwrapOrThrow(intersect(val, resolve(tool), opts)) as unknown as T),

    // Batch booleans
    cutAll: (tools, opts) => wrap3D(unwrapOrThrow(cutAllFn(val, tools, opts)) as unknown as T),

    // Boolean variants
    section: (plane, opts) => wrapAny(unwrapOrThrow(sectionFn(val, plane, opts))),
    split: (tools) => wrapAny(unwrapOrThrow(splitFn(val, tools))),
    slice: (planes, opts) => unwrapOrThrow(sliceFn(val, planes, opts)),

    // Modifiers (overloaded — detect by argument types)
    fillet(
      ...args: [FilletRadius] | [Edge[] | FinderFn<Edge> | ShapeFinder<Edge>, FilletRadius]
    ): Wrapped3D<T> {
      if (args.length === 1) {
        return wrap3D(unwrapOrThrow(fillet(val, args[0])) as unknown as T);
      }
      return wrap3D(unwrapOrThrow(fillet(val, args[0], args[1])) as unknown as T);
    },
    chamfer(
      ...args: [ChamferDistance] | [Edge[] | FinderFn<Edge> | ShapeFinder<Edge>, ChamferDistance]
    ): Wrapped3D<T> {
      if (args.length === 1) {
        return wrap3D(unwrapOrThrow(chamfer(val, args[0])) as unknown as T);
      }
      return wrap3D(unwrapOrThrow(chamfer(val, args[0], args[1])) as unknown as T);
    },
    shell: (faces, thickness, opts) =>
      wrap3D(unwrapOrThrow(shell(val, faces, thickness, opts)) as unknown as T),
    offset: (distance, opts) => wrap3D(unwrapOrThrow(offset(val, distance, opts)) as unknown as T),

    // Compound operations
    drill: (opts) => wrap3D(unwrapOrThrow(drillFn(val, opts)) as unknown as T),
    pocket: (opts) => wrap3D(unwrapOrThrow(pocketFn(val, opts)) as unknown as T),
    boss: (opts) => wrap3D(unwrapOrThrow(bossFn(val, opts)) as unknown as T),
    mirrorJoin: (opts) => wrap3D(unwrapOrThrow(mirrorJoinFn(val, opts)) as unknown as T),
    rectangularPattern: (opts) => wrap3D(unwrapOrThrow(rectPatternFn(val, opts)) as unknown as T),

    // Measurement
    volume: () => measureVolume(val),
    area: () => measureArea(val),
    volumeProps: () => measureVolumeProps(val),
    surfaceProps: () => measureSurfaceProps(val),

    // Queries
    edges: () => getEdges(val),
    faces: () => getFaces(val),
    wires: () => getWires(val),
    vertices: () => getVertices(val),

    // Patterns
    linearPattern: (dir, count, spacing) =>
      wrap3D(unwrapOrThrow(linearPattern(val, dir, count, spacing)) as unknown as T),
    circularPattern: (axis, count, angle) =>
      wrap3D(unwrapOrThrow(circularPattern(val, axis, count, angle)) as unknown as T),
  };
  return self;
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
      const w: Wire = val as unknown as Wire;
      const result = unwrapOrThrow(_sweep(w, resolve(spine), opts));
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
    area: () => measureArea(val),
    normalAt: (point) => normalAt(val, point),
    center: () => faceCenter(val),
    surfaceType: () => unwrapOrThrow(getSurfaceType(val)),
    outerWire: () => outerWire(val),
    innerWires: () => innerWires(val),

    extrude: (height) => wrap3D(unwrapOrThrow(extrude(val, height))),
    revolve: (opts) => wrap3D(unwrapOrThrow(revolve(val, opts))),
  };
}

// ---------------------------------------------------------------------------
// Internal wrap helpers — dispatch to the right wrapper type
// ---------------------------------------------------------------------------

function wrapAny<T extends AnyShape>(val: T): Wrapped<T> {
  if (isShape3D(val)) return createWrapped3D(val) as unknown as Wrapped<T>;
  if (isFace(val)) return createWrappedFace(val) as unknown as Wrapped<T>;
  if (isEdge(val) || isWire(val)) return createWrappedCurve(val) as unknown as Wrapped<T>;
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
    if (isFace(s)) return createWrappedFace(s);
    if (isShape3D(s)) return createWrapped3D(s);
    if (isEdge(s) || isWire(s)) return createWrappedCurve(s);
    return createWrappedBase(s);
  }

  throw new Error('shape() requires a Sketch or branded shape type');
}
