/**
 * Functional measurement utilities using branded shape types.
 * All functions return `Result<T>` for consistent error handling.
 */

import { getKernel } from '../kernel/index.js';
import type { AnyShape, Dimension, Face, OrientedFace, Shape3D } from '../core/shapeTypes.js';
import { type Result, ok, err } from '../core/result.js';
import { validationError, BrepErrorCode } from '../core/errors.js';
import { uvBounds } from '../topology/faceFns.js';
import type { CurvatureResult } from '../kernel/measureOps.js';
import { getCachedMeasurement, setCachedMeasurement } from './measureCache.js';
import type {
  PhysicalProps,
  VolumeProps,
  SurfaceProps,
  LinearProps,
  DistanceProps,
} from './measureTypes.js';

// Re-export types for consumers
export type { PhysicalProps, VolumeProps, SurfaceProps, LinearProps, DistanceProps };

// ---------------------------------------------------------------------------
// Pre-validation (returns Result instead of throwing)
// ---------------------------------------------------------------------------

function shapeIsNull(shape: { wrapped: { IsNull(): boolean } }): boolean {
  return getKernel().isNull(shape.wrapped);
}

function nullShapeErr(fn: string) {
  return err(validationError(BrepErrorCode.NULL_SHAPE_INPUT, `${fn}: shape is a null shape`));
}

// ---------------------------------------------------------------------------
// Volume, area, length
// ---------------------------------------------------------------------------

/**
 * Measure volume properties of a 3D shape.
 *
 * @param shape - A solid or compound shape.
 * @returns `Result` containing volume, center of mass, and raw mass property.
 * @see {@link measureVolume} for a shorthand that returns only the volume number.
 */
export function measureVolumeProps(shape: Shape3D): Result<VolumeProps> {
  const cached = getCachedMeasurement(shape.wrapped, 'volume');
  if (cached) return ok(cached);
  if (shapeIsNull(shape)) return nullShapeErr('measureVolumeProps');

  const kernel = getKernel();
  const m = kernel.volume(shape.wrapped);
  let com: [number, number, number];
  try {
    com = kernel.centerOfMass(shape.wrapped);
  } catch {
    // centerOfMass can fail for hollow/complex solids — fall back to bbox center
    const bb = kernel.boundingBox(shape.wrapped);
    com = [(bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2, (bb.min[2] + bb.max[2]) / 2];
  }
  const result: VolumeProps = {
    mass: m,
    volume: m,
    centerOfMass: com,
  };
  setCachedMeasurement(shape.wrapped, 'volume', result);
  return ok(result);
}

/**
 * Measure surface properties of a face or 3D shape.
 *
 * @param shape - A Face or any 3D shape (the total outer surface area is measured).
 * @returns `Result` containing surface area, center of mass, and raw mass property.
 * @see {@link measureArea} for a shorthand that returns only the area number.
 */
export function measureSurfaceProps(shape: Face<Dimension> | Shape3D): Result<SurfaceProps> {
  const cached = getCachedMeasurement(shape.wrapped, 'surface');
  if (cached) return ok(cached);
  if (shapeIsNull(shape)) return nullShapeErr('measureSurfaceProps');

  const kernel = getKernel();
  const m = kernel.area(shape.wrapped);
  const com = kernel.centerOfMass(shape.wrapped);
  const result: SurfaceProps = {
    mass: m,
    area: m,
    centerOfMass: com,
  };
  setCachedMeasurement(shape.wrapped, 'surface', result);
  return ok(result);
}

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
export function measureLinearProps(shape: AnyShape<Dimension>): Result<LinearProps> {
  const cached = getCachedMeasurement(shape.wrapped, 'linear');
  if (cached) return ok(cached);
  if (shapeIsNull(shape)) return nullShapeErr('measureLinearProps');

  const kernel = getKernel();
  const m = kernel.length(shape.wrapped);
  const com = kernel.linearCenterOfMass(shape.wrapped);
  const result: LinearProps = {
    mass: m,
    length: m,
    centerOfMass: com,
  };
  setCachedMeasurement(shape.wrapped, 'linear', result);
  return ok(result);
}

/**
 * Get the volume of a 3D shape.
 *
 * @see {@link measureVolumeProps} for the full property set including center of mass.
 */
export function measureVolume(shape: Shape3D): Result<number> {
  const props = measureVolumeProps(shape);
  if (!props.ok) return props;
  return ok(props.value.mass);
}

/**
 * Get the surface area of a face or 3D shape.
 *
 * @see {@link measureSurfaceProps} for the full property set including center of mass.
 */
export function measureArea(shape: Face<Dimension> | Shape3D): Result<number> {
  const props = measureSurfaceProps(shape);
  if (!props.ok) return props;
  return ok(props.value.mass);
}

/**
 * Get the arc length of a shape.
 *
 * @see {@link measureLinearProps} for the full property set including center of mass.
 */
export function measureLength(shape: AnyShape<Dimension>): Result<number> {
  const props = measureLinearProps(shape);
  if (!props.ok) return props;
  return ok(props.value.mass);
}

// ---------------------------------------------------------------------------
// Distance
// ---------------------------------------------------------------------------

/**
 * Measure the minimum distance between two shapes.
 */
export function measureDistance(
  shape1: AnyShape<Dimension>,
  shape2: AnyShape<Dimension>
): Result<number> {
  if (shapeIsNull(shape1)) return nullShapeErr('measureDistance');
  if (shapeIsNull(shape2)) return nullShapeErr('measureDistance');
  return ok(getKernel().distance(shape1.wrapped, shape2.wrapped).value);
}

/**
 * Measure the minimum distance between two shapes, including witness points.
 */
export function measureDistanceProps(
  shape1: AnyShape<Dimension>,
  shape2: AnyShape<Dimension>
): Result<DistanceProps> {
  if (shapeIsNull(shape1)) return nullShapeErr('measureDistanceProps');
  if (shapeIsNull(shape2)) return nullShapeErr('measureDistanceProps');
  const d = getKernel().distance(shape1.wrapped, shape2.wrapped);
  return ok({
    distance: d.value,
    point1: d.point1,
    point2: d.point2,
  });
}

/**
 * Create a reusable distance query from a reference shape.
 *
 * Keeps the reference shape loaded in the kernel distance tool so that
 * multiple `distanceTo` calls avoid re-loading overhead.
 *
 * @remarks Call `dispose()` when done to free the WASM-allocated distance tool.
 */
export function createDistanceQuery(referenceShape: AnyShape<Dimension>): Result<{
  distanceTo: (other: AnyShape<Dimension>) => Result<number>;
  dispose: () => void;
}> {
  if (shapeIsNull(referenceShape)) return nullShapeErr('createDistanceQuery');
  const query = getKernel().createDistanceQuery(referenceShape.wrapped);

  return ok({
    distanceTo(other: AnyShape<Dimension>): Result<number> {
      if (shapeIsNull(other)) return nullShapeErr('createDistanceQuery.distanceTo');
      return ok(query.distanceTo(other.wrapped).value);
    },
    dispose(): void {
      query.dispose();
    },
  });
}

// ---------------------------------------------------------------------------
// Surface curvature
// ---------------------------------------------------------------------------

/** Re-export of the kernel curvature result type. */
export type { CurvatureResult } from '../kernel/measureOps.js';

/**
 * Measure surface curvature at a (u, v) parameter point on a face.
 *
 * Returns mean, Gaussian, and principal curvatures with directions.
 * The u, v parameters correspond to the face's parametric domain.
 */
export function measureCurvatureAt(
  face: OrientedFace<Dimension>,
  u: number,
  v: number
): Result<CurvatureResult> {
  if (shapeIsNull(face)) return nullShapeErr('measureCurvatureAt');
  const result = getKernel().surfaceCurvature(face.wrapped, u, v);
  return ok({
    mean: result.mean,
    gaussian: result.gaussian,
    maxCurvature: result.max,
    minCurvature: result.min,
    maxDirection: result.maxDirection,
    minDirection: result.minDirection,
  });
}

/**
 * Measure surface curvature at the mid-point of a face's UV bounds.
 *
 * Uses `BRepTools::UVBounds` for the actual trimmed face UV region.
 *
 * @see {@link measureCurvatureAt} to evaluate at an arbitrary (u, v) point.
 */
export function measureCurvatureAtMid(face: Face<Dimension>): Result<CurvatureResult> {
  if (shapeIsNull(face)) return nullShapeErr('measureCurvatureAtMid');
  const bounds = uvBounds(face as Face);
  const uMid = (bounds.uMin + bounds.uMax) / 2;
  const vMid = (bounds.vMin + bounds.vMax) / 2;
  const result = getKernel().surfaceCurvature(face.wrapped, uMid, vMid);
  return ok({
    mean: result.mean,
    gaussian: result.gaussian,
    maxCurvature: result.max,
    minCurvature: result.min,
    maxDirection: result.maxDirection,
    minDirection: result.minDirection,
  });
}
