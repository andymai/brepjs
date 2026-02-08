/**
 * Clean primitive constructors.
 *
 * Short names, smart defaults, options objects for uncommon parameters.
 * Delegates to existing implementations in shapeHelpers.ts and kernel layer.
 */

import type { Vec3 } from '../core/types.js';
import type { Result } from '../core/result.js';
import type {
  Edge,
  Wire,
  Face,
  Solid,
  Vertex,
  Shell,
  Compound,
  AnyShape,
  Shape3D,
} from '../core/shapeTypes.js';
import { DEG2RAD } from '../core/constants.js';
import {
  makeLine as _makeLine,
  makeCircle as _makeCircle,
  makeEllipse as _makeEllipse,
  makeHelix as _makeHelix,
  makeThreePointArc as _makeThreePointArc,
  makeEllipseArc as _makeEllipseArc,
  makeBSplineApproximation as _makeBSplineApproximation,
  type BSplineApproximationOptions,
  makeBezierCurve as _makeBezierCurve,
  makeTangentArc as _makeTangentArc,
  assembleWire as _assembleWire,
  makeFace as _makeFace,
  makeNewFaceWithinFace as _makeNewFaceWithinFace,
  makeNonPlanarFace as _makeNonPlanarFace,
  makeCylinder as _makeCylinder,
  makeSphere as _makeSphere,
  makeCone as _makeCone,
  makeTorus as _makeTorus,
  makeEllipsoid as _makeEllipsoid,
  makeBox as _makeBox,
  makeVertex as _makeVertex,
  makeOffset as _makeOffset,
  makeCompound as _makeCompound,
  weldShellsAndFaces as _weldShellsAndFaces,
  makeSolid as _makeSolid,
  addHolesInFace as _addHolesInFace,
  makePolygon as _makePolygon,
} from './shapeHelpers.js';
import { getKernel } from '../kernel/index.js';
import { localGC } from '../core/memory.js';
import { createSolid } from '../core/shapeTypes.js';
import { translateShape } from './shapeFns.js';

// Re-export the approximation config type
export type { BSplineApproximationOptions, BSplineApproximationConfig } from './shapeHelpers.js';

// ---------------------------------------------------------------------------
// Solid primitives
// ---------------------------------------------------------------------------

/** Options for {@link box}. */
export interface BoxOptions {
  /** `true` = centered at origin; `Vec3` = centered at point. Omit = corner at origin. */
  center?: true | Vec3;
}

/**
 * Create a box with the given dimensions.
 *
 * @param width  - Size along X.
 * @param depth  - Size along Y.
 * @param height - Size along Z.
 */
export function box(width: number, depth: number, height: number, options?: BoxOptions): Solid {
  const oc = getKernel().oc;
  const [r, gc] = localGC();

  const maker = r(new oc.BRepPrimAPI_MakeBox_2(width, depth, height));
  let solid = createSolid(maker.Solid());
  gc();

  if (options?.center) {
    const c: Vec3 = options.center === true ? [0, 0, 0] : options.center;
    solid = translateShape(solid, [c[0] - width / 2, c[1] - depth / 2, c[2] - height / 2]);
  }
  return solid;
}

/** Options for {@link cylinder}. */
export interface CylinderOptions {
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
export function cylinder(radius: number, height: number, options?: CylinderOptions): Solid {
  const at = options?.at ?? [0, 0, 0];
  const axis = options?.axis ?? [0, 0, 1];
  let solid = _makeCylinder(radius, height, at, axis);
  if (options?.centered) {
    const halfShift: Vec3 = [
      -axis[0] * height * 0.5,
      -axis[1] * height * 0.5,
      -axis[2] * height * 0.5,
    ];
    solid = translateShape(solid, halfShift);
  }
  return solid;
}

/** Options for {@link sphere}. */
export interface SphereOptions {
  /** Center position. Default: [0, 0, 0]. */
  at?: Vec3;
}

/**
 * Create a sphere with the given radius.
 */
export function sphere(radius: number, options?: SphereOptions): Solid {
  let solid = _makeSphere(radius);
  if (options?.at) {
    solid = translateShape(solid, options.at);
  }
  return solid;
}

/** Options for {@link cone}. */
export interface ConeOptions {
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
export function cone(
  bottomRadius: number,
  topRadius: number,
  height: number,
  options?: ConeOptions
): Solid {
  const at = options?.at ?? [0, 0, 0];
  const axis = options?.axis ?? [0, 0, 1];
  let solid = _makeCone(bottomRadius, topRadius, height, at, axis);
  if (options?.centered) {
    const halfShift: Vec3 = [
      -axis[0] * height * 0.5,
      -axis[1] * height * 0.5,
      -axis[2] * height * 0.5,
    ];
    solid = translateShape(solid, halfShift);
  }
  return solid;
}

/** Options for {@link torus}. */
export interface TorusOptions {
  /** Center position. Default: [0, 0, 0]. */
  at?: Vec3;
  /** Torus axis direction. Default: [0, 0, 1]. */
  axis?: Vec3;
}

/**
 * Create a torus with the given major and minor radii.
 */
export function torus(majorRadius: number, minorRadius: number, options?: TorusOptions): Solid {
  return _makeTorus(majorRadius, minorRadius, options?.at ?? [0, 0, 0], options?.axis ?? [0, 0, 1]);
}

/** Options for {@link ellipsoid}. */
export interface EllipsoidOptions {
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
export function ellipsoid(rx: number, ry: number, rz: number, options?: EllipsoidOptions): Solid {
  let solid = _makeEllipsoid(rx, ry, rz);
  if (options?.at) {
    solid = translateShape(solid, options.at);
  }
  return solid;
}

// ---------------------------------------------------------------------------
// Curve primitives
// ---------------------------------------------------------------------------

/** Create a straight edge between two 3D points. */
export function line(from: Vec3, to: Vec3): Edge {
  return _makeLine(from, to);
}

/** Options for {@link circle}. */
export interface CircleOptions {
  /** Center. Default: [0, 0, 0]. */
  at?: Vec3;
  /** @deprecated Use `axis` instead. Will be removed in v8.0.0. */
  normal?: Vec3;
  /** Axis direction. Default: [0, 0, 1]. */
  axis?: Vec3;
}

/** Create a circular edge with the given radius. */
export function circle(radius: number, options?: CircleOptions): Edge {
  const axisDir = options?.axis ?? options?.normal ?? [0, 0, 1];
  return _makeCircle(radius, options?.at ?? [0, 0, 0], axisDir);
}

/** Options for {@link ellipse}. */
export interface EllipseOptions {
  /** Center. Default: [0, 0, 0]. */
  at?: Vec3;
  /** @deprecated Use `axis` instead. Will be removed in v8.0.0. */
  normal?: Vec3;
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
export function ellipse(
  majorRadius: number,
  minorRadius: number,
  options?: EllipseOptions
): Result<Edge> {
  const axisDir = options?.axis ?? options?.normal ?? [0, 0, 1];
  return _makeEllipse(majorRadius, minorRadius, options?.at ?? [0, 0, 0], axisDir, options?.xDir);
}

/** Options for {@link helix}. */
export interface HelixOptions {
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
export function helix(pitch: number, height: number, radius: number, options?: HelixOptions): Wire {
  return _makeHelix(
    pitch,
    height,
    radius,
    options?.at ?? [0, 0, 0],
    options?.axis ?? [0, 0, 1],
    options?.lefthand ?? false
  );
}

/** Create a circular arc edge passing through three points. */
export function threePointArc(p1: Vec3, p2: Vec3, p3: Vec3): Edge {
  return _makeThreePointArc(p1, p2, p3);
}

/** Options for {@link ellipseArc}. */
export interface EllipseArcOptions {
  /** Center. Default: [0, 0, 0]. */
  at?: Vec3;
  /** @deprecated Use `axis` instead. Will be removed in v8.0.0. */
  normal?: Vec3;
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
export function ellipseArc(
  majorRadius: number,
  minorRadius: number,
  startAngle: number,
  endAngle: number,
  options?: EllipseArcOptions
): Result<Edge> {
  const axisDir = options?.axis ?? options?.normal ?? [0, 0, 1];
  return _makeEllipseArc(
    majorRadius,
    minorRadius,
    startAngle * DEG2RAD,
    endAngle * DEG2RAD,
    options?.at ?? [0, 0, 0],
    axisDir,
    options?.xDir
  );
}

/**
 * Create a B-spline edge that approximates a set of 3D points.
 *
 * @returns An error if the approximation algorithm fails.
 */
export function bsplineApprox(points: Vec3[], config?: BSplineApproximationOptions): Result<Edge> {
  return _makeBSplineApproximation(points, config);
}

/**
 * Create a Bezier curve edge from control points.
 *
 * @param points - Two or more control points.
 */
export function bezier(points: Vec3[]): Result<Edge> {
  return _makeBezierCurve(points);
}

/**
 * Create a circular arc edge tangent to a direction at the start point.
 */
export function tangentArc(startPoint: Vec3, startTgt: Vec3, endPoint: Vec3): Edge {
  return _makeTangentArc(startPoint, startTgt, endPoint);
}

// ---------------------------------------------------------------------------
// Topology constructors
// ---------------------------------------------------------------------------

/**
 * Assemble edges and/or wires into a single connected wire.
 */
export function wire(listOfEdges: (Edge | Wire)[]): Result<Wire> {
  return _assembleWire(listOfEdges);
}

/**
 * Create a planar face from a closed wire, optionally with holes.
 */
export function face(w: Wire, holes?: Wire[]): Result<Face> {
  return _makeFace(w, holes);
}

/**
 * Create a non-planar face from a wire using surface filling.
 */
export function filledFace(w: Wire): Result<Face> {
  return _makeNonPlanarFace(w);
}

/**
 * Create a face bounded by a wire on an existing face's surface.
 */
export function subFace(originFace: Face, w: Wire): Face {
  return _makeNewFaceWithinFace(originFace, w);
}

/**
 * Create a polygonal face from three or more coplanar points.
 */
export function polygon(points: Vec3[]): Result<Face> {
  return _makePolygon(points);
}

/** Create a vertex at a 3D point. */
export function vertex(point: Vec3): Vertex {
  return _makeVertex(point);
}

/**
 * Build a compound from multiple shapes.
 */
export function compound(shapeArray: AnyShape[]): Compound {
  return _makeCompound(shapeArray);
}

/**
 * Weld faces and shells into a single solid.
 */
export function solid(facesOrShells: Array<Face | Shell>): Result<Solid> {
  return _makeSolid(facesOrShells);
}

/**
 * Create an offset shape from a face.
 */
export function offsetFace(f: Face, distance: number, tolerance?: number): Result<Shape3D> {
  return _makeOffset(f, distance, tolerance);
}

/**
 * Weld faces and shells into a single shell.
 */
export function sewShells(facesOrShells: Array<Face | Shell>, ignoreType?: boolean): Result<Shell> {
  return _weldShellsAndFaces(facesOrShells, ignoreType);
}

/**
 * Add hole wires to an existing face.
 */
export function addHoles(f: Face, holes: Wire[]): Face {
  return _addHolesInFace(f, holes);
}
