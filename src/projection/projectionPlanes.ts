/**
 * Shared projection plane definitions used by cameraFns and makeProjectedEdges.
 */

import type { Vec3 } from '../core/types.js';

/** Named face of an axis-aligned bounding cube. */
export type CubeFace = 'front' | 'back' | 'top' | 'bottom' | 'left' | 'right';

/** Named projection plane — axis pairs or cube face names. */
export type ProjectionPlane =
  | 'XY'
  | 'XZ'
  | 'YZ'
  | 'YX'
  | 'ZX'
  | 'ZY'
  | 'front'
  | 'back'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right';

/** Camera direction and X axis for a projection plane. */
export interface PlaneConfig {
  readonly dir: Vec3;
  readonly xAxis: Vec3;
}

/** Lookup table mapping each {@link ProjectionPlane} to its camera configuration. */
export const PROJECTION_PLANES: Record<ProjectionPlane, PlaneConfig> = {
  XY: { dir: [0, 0, 1], xAxis: [1, 0, 0] },
  XZ: { dir: [0, -1, 0], xAxis: [1, 0, 0] },
  YZ: { dir: [1, 0, 0], xAxis: [0, 1, 0] },
  YX: { dir: [0, 0, -1], xAxis: [0, 1, 0] },
  ZX: { dir: [0, 1, 0], xAxis: [0, 0, 1] },
  ZY: { dir: [-1, 0, 0], xAxis: [0, 0, 1] },

  front: { dir: [0, -1, 0], xAxis: [1, 0, 0] },
  back: { dir: [0, 1, 0], xAxis: [-1, 0, 0] },
  right: { dir: [-1, 0, 0], xAxis: [0, -1, 0] },
  left: { dir: [1, 0, 0], xAxis: [0, 1, 0] },
  bottom: { dir: [0, 0, 1], xAxis: [1, 0, 0] },
  top: { dir: [0, 0, -1], xAxis: [1, 0, 0] },
};

/** Type guard — check if a value is a valid {@link ProjectionPlane} name. */
export function isProjectionPlane(plane: unknown): plane is ProjectionPlane {
  return typeof plane === 'string' && plane in PROJECTION_PLANES;
}
