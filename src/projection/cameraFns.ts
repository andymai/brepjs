/**
 * Functional camera API — plain objects instead of ProjectionCamera class.
 * The ProjectionCamera class is still needed for makeProjectedEdges,
 * so these functions create/convert between the two representations.
 */

import type { Vec3 } from '../core/types.js';
import { vecCross, vecNormalize, vecSub, vecLength } from '../core/vecOps.js';
import { ProjectionCamera, type ProjectionPlane } from './ProjectionCamera.js';
import { PROJECTION_PLANES } from './projectionPlanes.js';
import type { Edge, AnyShape } from '../topology/shapes.js';
import { makeProjectedEdges } from './makeProjectedEdges.js';
import { type Result, ok, err } from '../core/result.js';
import { validationError } from '../core/errors.js';

/**
 * Immutable plain-object representation of a projection camera.
 *
 * @see {@link ProjectionCamera} for the OCCT-backed class equivalent.
 */
export interface Camera {
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
 *
 * @see {@link ProjectionCamera} for the OOP equivalent.
 */
export function createCamera(
  position: Vec3 = [0, 0, 0],
  direction: Vec3 = [0, 0, 1],
  xAxis?: Vec3
): Result<Camera> {
  // Validate direction is not zero-length
  const dirLength = vecLength(direction);
  if (dirLength < 1e-12) {
    return err(
      validationError('CAMERA_ZERO_DIRECTION', 'Camera direction cannot be a zero-length vector')
    );
  }

  let resolvedXAxis: Vec3;
  if (xAxis) {
    resolvedXAxis = vecNormalize(xAxis);
  } else {
    // Derive xAxis from direction (same logic as ProjectionCamera)
    // Try crossing with Z-axis first, then Y-axis, then X-axis as fallbacks
    let cross = vecCross([0, 0, 1], direction);
    if (vecLength(cross) < 1e-12) {
      cross = vecCross([0, 1, 0], direction);
    }
    if (vecLength(cross) < 1e-12) {
      cross = vecCross([1, 0, 0], direction);
    }
    resolvedXAxis = vecNormalize(cross);
  }
  const yAxis = vecNormalize(vecCross(direction, resolvedXAxis));
  return ok({
    position,
    direction: vecNormalize(direction),
    xAxis: resolvedXAxis,
    yAxis,
  });
}

/**
 * Create a new camera oriented to look at a target point from the current position.
 *
 * @param camera - Existing camera whose position is preserved.
 * @param target - World-space point to look at.
 * @returns `Result<Camera>` with updated direction and derived axes.
 *
 * @see {@link ProjectionCamera.lookAt} for the OOP equivalent.
 */
export function cameraLookAt(camera: Camera, target: Vec3): Result<Camera> {
  const direction = vecNormalize(vecSub(camera.position, target));
  return createCamera(camera.position, direction);
}

/**
 * Create a camera positioned at the origin, looking along a named projection plane.
 *
 * @param planeName - Named projection direction (e.g., `'front'`, `'top'`).
 * @returns `Result<Camera>` configured for that standard view.
 *
 * @see {@link lookFromPlane} for the OOP equivalent.
 */
export function cameraFromPlane(planeName: ProjectionPlane): Result<Camera> {
  const config = PROJECTION_PLANES[planeName];
  return createCamera([0, 0, 0], config.dir, config.xAxis);
}

/**
 * Convert a plain {@link Camera} object to a {@link ProjectionCamera} (OCCT-backed).
 *
 * The caller is responsible for calling `.delete()` on the returned object
 * when it is no longer needed.
 *
 * @param camera - Plain camera data.
 * @returns A new ProjectionCamera instance.
 */
export function cameraToProjectionCamera(camera: Camera): ProjectionCamera {
  // Cast readonly Vec3 to mutable tuple for ProjectionCamera constructor
  return new ProjectionCamera(
    camera.position as [number, number, number],
    camera.direction as [number, number, number],
    camera.xAxis as [number, number, number]
  );
}

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
export function projectEdges(
  shape: AnyShape,
  camera: Camera,
  withHiddenLines = true
): { visible: Edge[]; hidden: Edge[] } {
  const projCamera = cameraToProjectionCamera(camera);
  try {
    return makeProjectedEdges(shape, projCamera, withHiddenLines);
  } finally {
    projCamera.delete();
  }
}
