/**
 * Functional measurement utilities using branded shape types.
 * All functions return `Result<T>` for consistent error handling.
 */

import { getKernel } from '@/kernel/index.js';
import type { KernelShape, ShapeType } from '@/kernel/types.js';
import type { Vec3 } from '@/core/types.js';
import type { AnyShape, Dimension, Face, OrientedFace, Shape3D } from '@/core/shapeTypes.js';
import { type Result, ok, err } from '@/core/result.js';
import { kernelCallRaw } from '@/core/kernelCall.js';
import { validationError, BrepErrorCode } from '@/core/errors.js';
import { uvBounds } from '@/topology/faceFns.js';
import type { CurvatureResult } from '@/kernel/occt/measureOps.js';
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

/**
 * Run `fn` on fresh handles to the distinct sub-shapes of `type`, releasing them
 * afterwards. Unlike getFaces and friends this leaves the shape's topology cache
 * alone, so a measurement allocates nothing that outlives it.
 *
 * @internal
 */
export function withSubShapes<R>(
  shape: AnyShape<Dimension>,
  type: ShapeType,
  fn: (items: KernelShape[]) => R
): R {
  const kernel = getKernel();
  const items = kernel.iterShapes(shape.wrapped, type);
  try {
    return fn(items);
  } finally {
    for (const item of items) kernel.dispose(item);
  }
}

/**
 * Run `fn` on a throwaway compound of `parts`, releasing the compound afterwards.
 *
 * @internal
 */
export function withCompoundOf<R>(parts: KernelShape[], fn: (c: KernelShape) => R): R {
  const kernel = getKernel();
  const c = kernel.makeCompound(parts);
  try {
    return fn(c);
  } finally {
    kernel.dispose(c);
  }
}

function volumeOf(target: KernelShape): Result<VolumeProps> {
  const kernel = getKernel();
  const m = kernel.volume(target);
  const comResult = kernelCallRaw(
    () => kernel.centerOfMass(target),
    BrepErrorCode.CENTER_OF_MASS_FAILED,
    'Failed to compute center of mass'
  );
  if (!comResult.ok) return comResult;
  return ok({ mass: m, volume: m, centerOfMass: comResult.value });
}

/** Area-weighted centroid of `faces`, from each face's own surface center of mass. */
function surfaceCentroid(faces: KernelShape[]): Vec3 {
  const kernel = getKernel();
  let total = 0;
  let x = 0;
  let y = 0;
  let z = 0;
  for (const f of faces) {
    const a = kernel.area(f);
    const [cx, cy, cz] = kernel.surfaceCenterOfMass(f);
    total += a;
    x += a * cx;
    y += a * cy;
    z += a * cz;
  }
  return total > 0 ? [x / total, y / total, z / total] : [0, 0, 0];
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

  // Volume is only defined for closed regions: solids, compsolids, and compounds
  // (which may contain solids). An open shell/face/wire encloses no volume.
  // Kernels otherwise diverge here (#1361): occt uses VolumeProperties with
  // OnlyClosed=true and reports 0 for an open shell, while occt-wasm's GProp
  // returns a meaningless divergence-theorem value. Normalize to 0/origin.
  // A compound can also hold loose faces, shells, or wires, which would feed the
  // same meaningless value into the total, so only its solids are measured.
  const type = kernel.shapeType(shape.wrapped);
  const zero: VolumeProps = { mass: 0, volume: 0, centerOfMass: [0, 0, 0] };
  let result: Result<VolumeProps>;
  if (type === 'solid' || type === 'compsolid') {
    result = volumeOf(shape.wrapped);
  } else if (type === 'compound') {
    result = withSubShapes(shape, 'solid', (solids) =>
      solids.length === 0 ? ok(zero) : withCompoundOf(solids, volumeOf)
    );
  } else {
    result = ok(zero);
  }
  if (!result.ok) return result;
  setCachedMeasurement(shape.wrapped, 'volume', result.value);
  return result;
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
  const comResult = kernelCallRaw(
    () =>
      kernel.shapeType(shape.wrapped) === 'face'
        ? kernel.surfaceCenterOfMass(shape.wrapped)
        : withSubShapes(shape, 'face', surfaceCentroid),
    BrepErrorCode.CENTER_OF_MASS_FAILED,
    'Failed to compute center of mass'
  );
  if (!comResult.ok) return comResult;
  const result: SurfaceProps = {
    mass: m,
    area: m,
    centerOfMass: comResult.value,
  };
  setCachedMeasurement(shape.wrapped, 'surface', result);
  return ok(result);
}

/**
 * Measure linear properties of any shape.
 *
 * For edges this is the arc length; for wires it is the total length of their
 * edges; for faces, shells, solids, and compounds it is the total length of
 * their distinct edges, each counted once (a face's seam edge included).
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
  const type = kernel.shapeType(shape.wrapped);
  const linearOf = (target: KernelShape): LinearProps => {
    const m = kernel.length(target);
    return { mass: m, length: m, centerOfMass: kernel.linearCenterOfMass(target) };
  };
  let result: LinearProps;
  if (type === 'vertex' || type === 'edge' || type === 'wire') {
    result = linearOf(shape.wrapped);
  } else {
    // LinearProperties walks every edge occurrence, so on a closed body each edge
    // shared by two faces would count twice, and so would a face's own seam edge,
    // which its wire runs along once each way. Measure the distinct edges instead.
    result = withSubShapes(shape, 'edge', (edges) =>
      edges.length === 0
        ? { mass: 0, length: 0, centerOfMass: [0, 0, 0] }
        : withCompoundOf(edges, linearOf)
    );
  }
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
export type { CurvatureResult } from '@/kernel/occt/measureOps.js';

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
