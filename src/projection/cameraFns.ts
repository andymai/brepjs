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

/** Plain camera data object. */
export interface Camera {
  readonly position: Vec3;
  readonly direction: Vec3;
  readonly xAxis: Vec3;
  readonly yAxis: Vec3;
}

/** Create a camera from position, direction, and optional xAxis. */
export function createCamera(
  position: Vec3 = [0, 0, 0],
  direction: Vec3 = [0, 0, 1],
  xAxis?: Vec3
): Camera {
  // Validate direction is not zero-length
  const dirLength = vecLength(direction);
  if (dirLength < 1e-12) {
    throw new Error('Camera direction cannot be a zero-length vector');
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
  return {
    position,
    direction: vecNormalize(direction),
    xAxis: resolvedXAxis,
    yAxis,
  };
}

/** Create a camera that looks at a target from the camera's position. */
export function cameraLookAt(camera: Camera, target: Vec3): Camera {
  const direction = vecNormalize(vecSub(camera.position, target));
  return createCamera(camera.position, direction);
}

/** Create a camera from a named projection plane. */
export function cameraFromPlane(planeName: ProjectionPlane): Camera {
  const config = PROJECTION_PLANES[planeName];
  return createCamera([0, 0, 0], config.dir, config.xAxis);
}

/** Convert a Camera plain object to a ProjectionCamera for use with makeProjectedEdges. */
export function cameraToProjectionCamera(camera: Camera): ProjectionCamera {
  // Cast readonly Vec3 to mutable tuple for ProjectionCamera constructor
  return new ProjectionCamera(
    camera.position as [number, number, number],
    camera.direction as [number, number, number],
    camera.xAxis as [number, number, number]
  );
}

/** Project edges of a shape using a functional Camera. */
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
