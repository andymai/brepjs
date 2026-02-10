/**
 * Public API functions — short names for transforms, booleans, modifiers, and utilities.
 *
 * These functions provide the primary public API with short names, Shapeable<T> support,
 * and options objects. They delegate to implementations in shapeFns.ts, booleanFns.ts, etc.
 */

import type { Vec3 } from '../core/types.js';
import type { Result } from '../core/result.js';
import type { AnyShape, Edge, Face, Shape3D, Shell, Solid } from '../core/shapeTypes.js';
import type { Shapeable, FinderFn, FilletRadius, ChamferDistance } from './apiTypes.js';
import { resolve } from './apiTypes.js';
import type { ShapeFinder } from '../query/finderFns.js';
import * as transforms from './shapeFns.js';
import * as booleans from './booleanFns.js';
import * as modifiers from './modifierFns.js';
import * as angles from './chamferAngleFns.js';
import * as healing from './healingFns.js';
import * as meshing from './meshFns.js';
import * as casting from './cast.js';
import { edgeFinder, faceFinder } from '../query/finderFns.js';
import type { PlaneInput } from '../core/planeTypes.js';

// ---------------------------------------------------------------------------
// Transforms — accept Shapeable<T>, use options objects
// ---------------------------------------------------------------------------

/** Translate a shape by a vector. Returns a new shape. */
export function translate<T extends AnyShape>(shape: Shapeable<T>, v: Vec3): T {
  return transforms.translate(resolve(shape), v);
}

/** Options for {@link rotate}. */
export interface RotateOptions {
  /** Pivot point. Default: [0, 0, 0]. */
  at?: Vec3;
  /** Rotation axis. Default: [0, 0, 1] (Z). */
  axis?: Vec3;
}

/** Rotate a shape around an axis. Angle is in degrees. Returns a new shape. */
export function rotate<T extends AnyShape>(
  shape: Shapeable<T>,
  angle: number,
  options?: RotateOptions
): T {
  const pivotPoint = options?.at;
  return transforms.rotate(resolve(shape), angle, pivotPoint, options?.axis);
}

/** Options for {@link mirror}. */
export interface MirrorOptions {
  /** Plane normal. Default: [1, 0, 0]. */
  normal?: Vec3;
  /** Plane origin. Default: [0, 0, 0]. */
  at?: Vec3;
}

/** Mirror a shape through a plane. Returns a new shape. */
export function mirror<T extends AnyShape>(shape: Shapeable<T>, options?: MirrorOptions): T {
  const planeOrigin = options?.at;
  return transforms.mirror(resolve(shape), options?.normal ?? [1, 0, 0], planeOrigin);
}

/** Options for {@link scale}. */
export interface ScaleOptions {
  /** Center of scaling. Default: [0, 0, 0]. */
  center?: Vec3;
}

/** Scale a shape uniformly. Returns a new shape. */
export function scale<T extends AnyShape>(
  shape: Shapeable<T>,
  factor: number,
  options?: ScaleOptions
): T {
  return transforms.scale(resolve(shape), factor, options?.center);
}

/** Clone a shape (deep copy). */
export function clone<T extends AnyShape>(shape: Shapeable<T>): T {
  return transforms.clone(resolve(shape));
}

// ---------------------------------------------------------------------------
// Booleans — accept Shapeable, preserve first operand type T
// ---------------------------------------------------------------------------

/** Fuse two 3D shapes (boolean union). */
export function fuse<T extends Shape3D>(
  a: Shapeable<T>,
  b: Shapeable<Shape3D>,
  options?: booleans.BooleanOptions
): Result<T> {
  return booleans.fuse(resolve(a), resolve(b), options) as Result<T>;
}

/** Cut a tool from a base shape (boolean subtraction). */
export function cut<T extends Shape3D>(
  base: Shapeable<T>,
  tool: Shapeable<Shape3D>,
  options?: booleans.BooleanOptions
): Result<T> {
  return booleans.cut(resolve(base), resolve(tool), options) as Result<T>;
}

/** Compute the intersection of two shapes (boolean common). */
export function intersect<T extends Shape3D>(
  a: Shapeable<T>,
  b: Shapeable<Shape3D>,
  options?: booleans.BooleanOptions
): Result<T> {
  return booleans.intersect(resolve(a), resolve(b), options) as Result<T>;
}

/** Section (cross-section) a shape with a plane. */
export function section(
  shape: Shapeable<AnyShape>,
  plane: PlaneInput,
  options?: { approximation?: boolean; planeSize?: number }
): Result<AnyShape> {
  return booleans.section(resolve(shape), plane, options);
}

/** Split a shape with tool shapes. */
export function split(shape: Shapeable<AnyShape>, tools: AnyShape[]): Result<AnyShape> {
  return booleans.split(resolve(shape), tools);
}

/** Slice a shape with multiple planes. */
export function slice(
  shape: Shapeable<AnyShape>,
  planes: PlaneInput[],
  options?: { approximation?: boolean; planeSize?: number }
): Result<AnyShape[]> {
  return booleans.slice(resolve(shape), planes, options);
}

// ---------------------------------------------------------------------------
// Modifiers — accept Shapeable, FinderFn, new radius/distance types
// ---------------------------------------------------------------------------

/**
 * Resolve a FinderFn callback or ShapeFinder into an array of elements.
 * If the argument is already an array, return it directly.
 */
function resolveEdges(
  edgesOrFn: Edge[] | FinderFn<Edge> | ShapeFinder<Edge> | undefined,
  shape: Shape3D
): ReadonlyArray<Edge> | undefined {
  if (edgesOrFn === undefined) return undefined;
  if (Array.isArray(edgesOrFn)) return edgesOrFn;

  // If it's a ShapeFinder, use it directly
  if (typeof edgesOrFn === 'object' && 'findAll' in edgesOrFn) {
    return edgesOrFn.findAll(shape);
  }

  // It's a FinderFn — apply it to edgeFinder() and execute
  const finder = edgesOrFn(edgeFinder());
  return finder.findAll(shape);
}

function resolveFaces(
  facesOrFn: Face[] | FinderFn<Face> | ShapeFinder<Face>,
  shape: Shape3D
): ReadonlyArray<Face> {
  if (Array.isArray(facesOrFn)) return facesOrFn;

  // If it's a ShapeFinder, use it directly
  if (typeof facesOrFn === 'object' && 'findAll' in facesOrFn) {
    return facesOrFn.findAll(shape);
  }

  const finder = facesOrFn(faceFinder());
  return finder.findAll(shape);
}

/**
 * Normalize a FilletRadius to the format the kernel expects.
 */
function normalizeFilletRadius(
  radius: FilletRadius
): number | [number, number] | ((edge: Edge) => number | [number, number] | null) {
  return radius;
}

/**
 * Normalize a ChamferDistance, handling the {distance, angle} case.
 * Returns either a kernel-compatible distance or signals distance-angle mode.
 */
type NormalizedChamfer =
  | {
      mode: 'standard';
      distance: number | [number, number] | ((edge: Edge) => number | [number, number] | null);
    }
  | { mode: 'distAngle'; distance: number; angle: number };

function normalizeChamferDistance(distance: ChamferDistance): NormalizedChamfer {
  if (typeof distance === 'object' && !Array.isArray(distance) && typeof distance !== 'function') {
    // { distance, angle } mode
    return { mode: 'distAngle', distance: distance.distance, angle: distance.angle };
  }
  if (typeof distance === 'function') {
    // Per-edge callback — check if any returns { distance, angle }
    // Wrap callback to extract standard values
    const wrappedFn = (edge: Edge) => {
      const val = distance(edge);
      if (val === null) return null;
      if (typeof val === 'object' && !Array.isArray(val)) {
        // { distance, angle } — not supported in per-edge callback for standard chamfer
        // Fall back to distance-only
        return val.distance;
      }
      return val;
    };
    return { mode: 'standard', distance: wrappedFn };
  }
  return { mode: 'standard', distance };
}

// Overloads: 2-arg (all edges) vs 3-arg (selected edges)

/** Apply a fillet to all edges of a 3D shape. */
export function fillet<T extends Shape3D>(shape: Shapeable<T>, radius: FilletRadius): Result<T>;
/** Apply a fillet to selected edges of a 3D shape. */
export function fillet<T extends Shape3D>(
  shape: Shapeable<T>,
  edges: Edge[] | FinderFn<Edge> | ShapeFinder<Edge>,
  radius: FilletRadius
): Result<T>;
export function fillet<T extends Shape3D>(
  shape: Shapeable<T>,
  edgesOrRadius: Edge[] | FinderFn<Edge> | ShapeFinder<Edge> | FilletRadius,
  maybeRadius?: FilletRadius
): Result<T> {
  const s = resolve(shape);
  let edges: ReadonlyArray<Edge> | undefined;
  let radius: FilletRadius;

  if (maybeRadius !== undefined) {
    // 3-arg form: shape, edges, radius
    edges = resolveEdges(edgesOrRadius as Edge[] | FinderFn<Edge> | ShapeFinder<Edge>, s);
    radius = maybeRadius;
  } else {
    // 2-arg form: shape, radius (fillet all edges)
    edges = undefined;
    radius = edgesOrRadius as FilletRadius;
  }

  return modifiers.fillet(s, edges, normalizeFilletRadius(radius)) as Result<T>;
}

/** Apply a chamfer to all edges of a 3D shape. */
export function chamfer<T extends Shape3D>(
  shape: Shapeable<T>,
  distance: ChamferDistance
): Result<T>;
/** Apply a chamfer to selected edges of a 3D shape. */
export function chamfer<T extends Shape3D>(
  shape: Shapeable<T>,
  edges: Edge[] | FinderFn<Edge> | ShapeFinder<Edge>,
  distance: ChamferDistance
): Result<T>;
export function chamfer<T extends Shape3D>(
  shape: Shapeable<T>,
  edgesOrDistance: Edge[] | FinderFn<Edge> | ShapeFinder<Edge> | ChamferDistance,
  maybeDistance?: ChamferDistance
): Result<T> {
  const s = resolve(shape);
  let edges: ReadonlyArray<Edge> | undefined;
  let distance: ChamferDistance;

  if (maybeDistance !== undefined) {
    edges = resolveEdges(edgesOrDistance as Edge[] | FinderFn<Edge> | ShapeFinder<Edge>, s);
    distance = maybeDistance;
  } else {
    edges = undefined;
    distance = edgesOrDistance as ChamferDistance;
  }

  const normalized = normalizeChamferDistance(distance);
  if (normalized.mode === 'distAngle') {
    // Use chamferDistAngle for distance-angle mode
    const selectedEdges = edges ?? transforms.getEdges(s);
    return angles.chamferDistAngle(
      s,
      [...selectedEdges],
      normalized.distance,
      normalized.angle
    ) as Result<T>;
  }

  return modifiers.chamfer(s, edges, normalized.distance) as Result<T>;
}

/** Create a hollow shell by removing faces and offsetting remaining walls. */
export function shell<T extends Shape3D>(
  shape: Shapeable<T>,
  faces: Face[] | FinderFn<Face> | ShapeFinder<Face>,
  thickness: number,
  options?: { tolerance?: number }
): Result<T> {
  const s = resolve(shape);
  const resolvedFaces = resolveFaces(faces, s);
  return modifiers.shell(s, resolvedFaces, thickness, options?.tolerance) as Result<T>;
}

/** Offset all faces of a shape by a given distance. */
export function offset<T extends Shape3D>(
  shape: Shapeable<T>,
  distance: number,
  options?: { tolerance?: number }
): Result<T> {
  return modifiers.offset(resolve(shape), distance, options?.tolerance) as Result<T>;
}

/** Thicken a surface (face or shell) into a solid. */
export function thicken(shape: Shapeable<Face | Shell>, thickness: number): Result<Solid> {
  return modifiers.thicken(resolve(shape), thickness);
}

// ---------------------------------------------------------------------------
// Utilities — clean names
// ---------------------------------------------------------------------------

/** Heal a shape using the appropriate fixer. */
export function heal<T extends AnyShape>(shape: Shapeable<T>): Result<T> {
  return healing.heal(resolve(shape));
}

/** Simplify a shape by merging same-domain faces/edges. */
export function simplify<T extends AnyShape>(shape: Shapeable<T>): T {
  return transforms.simplify(resolve(shape));
}

/** Mesh a shape for rendering. */
export function mesh(
  shape: Shapeable<AnyShape>,
  options?: meshing.MeshOptions & { skipNormals?: boolean; includeUVs?: boolean; cache?: boolean }
): meshing.ShapeMesh {
  return meshing.mesh(resolve(shape), options);
}

/** Mesh the edges of a shape for wireframe rendering. */
export function meshEdges(
  shape: Shapeable<AnyShape>,
  options?: meshing.MeshOptions & { cache?: boolean }
): meshing.EdgeMesh {
  return meshing.meshEdges(resolve(shape), options);
}

/** Get a summary description of a shape. */
export function describe(shape: Shapeable<AnyShape>): transforms.ShapeDescription {
  return transforms.describe(resolve(shape));
}

/** Serialize a shape to BREP format. */
export function toBREP(shape: Shapeable<AnyShape>): string {
  return transforms.toBREP(resolve(shape));
}

/** Deserialize a shape from BREP format. */
export function fromBREP(data: string): Result<AnyShape> {
  return casting.fromBREP(data);
}

/** Check if a shape is valid. */
export function isValid(shape: Shapeable<AnyShape>): boolean {
  return healing.isValid(resolve(shape));
}

/** Check if a shape is empty (null). */
export function isEmpty(shape: Shapeable<AnyShape>): boolean {
  return transforms.isEmpty(resolve(shape));
}
