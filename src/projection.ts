/**
 * brepjs/projection — 3D-to-2D projection cameras and edge extraction.
 *
 * @example
 * ```typescript
 * import { createCamera, projectEdges } from 'brepjs/projection';
 * ```
 */

export {
  createCamera,
  cameraLookAt,
  cameraFromPlane,
  projectEdges,
  type Camera,
} from './projection/cameraFns.js';

export {
  isProjectionPlane,
  type ProjectionPlane,
  type CubeFace,
  type PlaneConfig,
  PROJECTION_PLANES,
} from './projection/projectionPlanes.js';

export { makeProjectedEdges } from './projection/makeProjectedEdges.js';
