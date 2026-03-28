/**
 * Face-specific functions — functional replacements for Face class methods.
 * All functions accept branded Face handles and return plain values or branded shapes.
 */

import { getKernel } from '@/kernel/index.js';
import type { SurfaceType as KernelSurfaceType } from '@/kernel/index.js';
import type { Vec3, PointInput } from '@/core/types.js';
import { toVec3 } from '@/core/types.js';
import type { ClosedWire, Dimension, Face } from '@/core/shapeTypes.js';
import { castShape } from '@/core/shapeTypes.js';
import { type Result, ok, err, unwrap } from '@/core/result.js';
import { typeCastError } from '@/core/errors.js';
import { iterTopo, downcast } from './cast.js';
import { getCachedSurfaceType } from './topologyQueryFns.js';

// ---------------------------------------------------------------------------
// Surface type detection
// ---------------------------------------------------------------------------

/** String literal identifying the geometric type of a face's underlying surface. */
export type SurfaceType =
  | 'PLANE'
  | 'CYLINDRE'
  | 'CONE'
  | 'SPHERE'
  | 'TORUS'
  | 'BEZIER_SURFACE'
  | 'BSPLINE_SURFACE'
  | 'REVOLUTION_SURFACE'
  | 'EXTRUSION_SURFACE'
  | 'OFFSET_SURFACE'
  | 'OTHER_SURFACE';

/** Map kernel surface type strings to the public API surface type constants. */
const KERNEL_TO_PUBLIC_SURFACE_TYPE: Record<KernelSurfaceType, SurfaceType> = {
  plane: 'PLANE',
  cylinder: 'CYLINDRE',
  cone: 'CONE',
  sphere: 'SPHERE',
  torus: 'TORUS',
  bezier: 'BEZIER_SURFACE',
  bspline: 'BSPLINE_SURFACE',
  revolution: 'REVOLUTION_SURFACE',
  extrusion: 'EXTRUSION_SURFACE',
  offset: 'OFFSET_SURFACE',
  other: 'OTHER_SURFACE',
};

/**
 * Get the geometric surface type of a face.
 *
 * @returns Ok with the surface type, or Err for unrecognized kernel surface types.
 */
export function getSurfaceType(face: Face): Result<SurfaceType> {
  const kernelType = getCachedSurfaceType(face);
  return ok(KERNEL_TO_PUBLIC_SURFACE_TYPE[kernelType]);
}

/** Get the surface type of a face (unwrapped convenience). */
export function faceGeomType(face: Face): SurfaceType {
  return unwrap(getSurfaceType(face));
}

// ---------------------------------------------------------------------------
// Face orientation
// ---------------------------------------------------------------------------

/** Get the topological orientation of a face. */
export function faceOrientation(face: Face): 'forward' | 'backward' {
  const orient = getKernel().shapeOrientation(face.wrapped);
  return orient === 'forward' ? 'forward' : 'backward';
}

/** Flip the orientation of a face. Returns a new face. */
export function flipFaceOrientation(face: Face): Face {
  return castShape(getKernel().reverseShape(face.wrapped)) as Face;
}

// ---------------------------------------------------------------------------
// UV and surface queries
// ---------------------------------------------------------------------------

/** UV parameter bounds of a face. */
export interface UVBounds {
  readonly uMin: number;
  readonly uMax: number;
  readonly vMin: number;
  readonly vMax: number;
}

/** Get the UV parameter bounds of a face. */
export function uvBounds(face: Face): UVBounds {
  return getKernel().uvBounds(face.wrapped);
}

/**
 * Get a point on a face surface at normalized UV coordinates (0-1 range).
 *
 * @param face - The face to evaluate.
 * @param u - Normalized U parameter (0-1).
 * @param v - Normalized V parameter (0-1).
 */
export function pointOnSurface(face: Face, u: number, v: number): Vec3 {
  const bounds = uvBounds(face);
  const absU = u * (bounds.uMax - bounds.uMin) + bounds.uMin;
  const absV = v * (bounds.vMax - bounds.vMin) + bounds.vMin;
  return getKernel().pointOnSurface(face.wrapped, absU, absV);
}

/** Get the UV coordinates on a face for a given 3D point. */
export function uvCoordinates(face: Face, point: PointInput): [number, number] {
  const v = toVec3(point);
  const result = getKernel().uvFromPoint(face.wrapped, v as [number, number, number]);
  if (!result) {
    // Fallback: return [0, 0] if projection fails (matches previous behavior where
    // LowerDistanceParameters would return default values)
    return [0, 0];
  }
  return result;
}

/** Result of projecting a point onto a face surface. */
export interface PointProjectionResult {
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
export function projectPointOnFace(face: Face, point: PointInput): Result<PointProjectionResult> {
  const v = toVec3(point);

  try {
    const vMut = v as [number, number, number];
    const uvResult = getKernel().uvFromPoint(face.wrapped, vMut);
    if (!uvResult) {
      return err(typeCastError('PROJECTION_FAILED', 'No projection found on the face'));
    }

    const projectedPoint = getKernel().projectPointOnFace(face.wrapped, vMut);

    // Compute distance between input point and projected point
    const dx = v[0] - projectedPoint[0];
    const dy = v[1] - projectedPoint[1];
    const dz = v[2] - projectedPoint[2];
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    return ok({
      uv: uvResult,
      point: projectedPoint,
      distance,
    });
  } catch (e) {
    return err(
      typeCastError(
        'PROJECTION_FAILED',
        `Point projection failed: ${e instanceof Error ? e.message : String(e)}`
      )
    );
  }
}

/** Get the surface normal at a point (or at the center if no point given). */
export function normalAt(face: Face, locationPoint?: PointInput): Vec3 {
  let u: number;
  let v: number;

  if (!locationPoint) {
    const bounds = uvBounds(face);
    u = 0.5 * (bounds.uMin + bounds.uMax);
    v = 0.5 * (bounds.vMin + bounds.vMax);
  } else {
    [u, v] = uvCoordinates(face, locationPoint);
  }

  return getKernel().surfaceNormal(face.wrapped, u, v);
}

/** Get the center of mass of a face. */
export function faceCenter(face: Face): Vec3 {
  return getKernel().surfaceCenterOfMass(face.wrapped);
}

// ---------------------------------------------------------------------------
// Point classification
// ---------------------------------------------------------------------------

/**
 * Classify a 3D point's position relative to a face boundary.
 * Projects the point onto the face's surface and classifies the UV result.
 *
 * @returns 'in' if inside, 'on' if on the boundary, 'out' if outside
 */
export function classifyPointOnFace(
  face: Face,
  point: PointInput,
  tolerance = 1e-6
): 'in' | 'on' | 'out' {
  const [u, v] = uvCoordinates(face, point);
  return getKernel().classifyPointOnFace(face.wrapped, u, v, tolerance);
}

// ---------------------------------------------------------------------------
// Wire extraction from faces
// ---------------------------------------------------------------------------

/** Get the outer wire of a face. The outer boundary of a face is always closed. */
export function outerWire<D extends Dimension = '3D'>(face: Face<D>): ClosedWire<D> {
  return castShape(getKernel().outerWire(face.wrapped)) as ClosedWire<D>;
}

/**
 * Remove all holes (inner wires) from a face, returning a new face with only the outer boundary.
 * Useful for defeaturing workflows where holes need to be temporarily or permanently filled.
 */
export function removeHolesFromFace<D extends Dimension = '3D'>(face: Face<D>): Face<D> {
  return castShape(getKernel().removeHolesFromFace(face.wrapped)) as Face<D>;
}

/** Get the inner wires (holes) of a face. Hole boundaries are always closed. */
export function innerWires<D extends Dimension = '3D'>(face: Face<D>): ClosedWire<D>[] {
  const outer = outerWire(face);
  const allWires = Array.from(iterTopo(face.wrapped, 'wire')).map(
    (w) => castShape(unwrap(downcast(w))) as ClosedWire<D>
  );
  const result = allWires.filter((w) => !getKernel().isSame(w.wrapped, outer.wrapped));
  return result;
}
