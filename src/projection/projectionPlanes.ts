/**
 * Shared projection plane definitions used by both ProjectionCamera and cameraFns.
 */

import type { Vec3 } from '../core/types.js';

export type CubeFace = 'front' | 'back' | 'top' | 'bottom' | 'left' | 'right';
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

export interface PlaneConfig {
  readonly dir: Vec3;
  readonly xAxis: Vec3;
}

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

export function isProjectionPlane(plane: unknown): plane is ProjectionPlane {
  return typeof plane === 'string' && plane in PROJECTION_PLANES;
}
