import type { OcType } from '../kernel/types.js';
import type { Vec3, PointInput } from '../core/types.js';
import { toVec3 } from '../core/types.js';
import { WrappingObj, localGC } from '../core/memory.js';
import { toOcPnt, toOcDir, makeOcAx2, fromOcPnt, fromOcDir } from '../core/occtBoundary.js';
import { vecCross, vecLength, vecNormalize } from '../core/vecOps.js';
import { getBounds } from '../topology/shapeFns.js';
import type { AnyShape } from '../core/shapeTypes.js';
import {
  PROJECTION_PLANES,
  isProjectionPlane as isProjectionPlaneCheck,
  type CubeFace,
  type ProjectionPlane,
} from './projectionPlanes.js';

// Re-export types for backward compatibility
/** Named face of a bounding cube (e.g., `'front'`, `'top'`). */
export type { CubeFace, ProjectionPlane };
/** Check whether a string is a valid {@link ProjectionPlane} name. */
export { isProjectionPlaneCheck as isProjectionPlane };

/**
 * Create a {@link ProjectionCamera} positioned at the origin looking along a named projection plane.
 *
 * @param projectionPlane - Named projection direction (e.g., `'front'`, `'top'`).
 * @returns A new ProjectionCamera configured for that view.
 */
export function lookFromPlane(projectionPlane: ProjectionPlane): ProjectionCamera {
  const { dir, xAxis } = PROJECTION_PLANES[projectionPlane];
  // Cast readonly Vec3 to mutable Point for constructor compatibility
  return new ProjectionCamera(
    [0, 0, 0],
    dir as [number, number, number],
    xAxis as [number, number, number]
  );
}

function defaultXDir(direction: PointInput): Vec3 {
  const dir = toVec3(direction);
  const yAxis: Vec3 = [0, 0, 1];
  let xAxis = vecCross(yAxis, dir);
  if (vecLength(xAxis) === 0) {
    const yAxis2: Vec3 = [0, 1, 0];
    xAxis = vecCross(yAxis2, dir);
  }
  return vecNormalize(xAxis);
}

/**
 * Camera for projecting 3D shapes onto a 2D plane.
 *
 * Wraps an OCCT `gp_Ax2` coordinate system. Use {@link lookFromPlane} for
 * quick setup from a named view, or construct directly with position,
 * direction, and optional X-axis.
 *
 * @see {@link Camera} and {@link createCamera} for the functional (plain-object) alternative.
 * @category Projection
 */
export class ProjectionCamera extends WrappingObj<OcType> {
  constructor(
    position: PointInput = [0, 0, 0],
    direction: PointInput = [0, 0, 1],
    xAxis?: PointInput
  ) {
    const pos = toVec3(position);
    const dir = toVec3(direction);
    const xDir = xAxis ? toVec3(xAxis) : defaultXDir(direction);
    const ax2 = makeOcAx2(pos, dir, xDir);
    super(ax2);
  }

  /** Get the camera position in world coordinates. */
  get position(): Vec3 {
    return fromOcPnt(this.wrapped.Location());
  }

  /** Get the view direction (camera looks along this vector). */
  get direction(): Vec3 {
    return fromOcDir(this.wrapped.Direction());
  }

  /** Get the camera's local X axis (horizontal in the projected image). */
  get xAxis(): Vec3 {
    return fromOcDir(this.wrapped.XDirection());
  }

  /** Get the camera's local Y axis (vertical in the projected image). */
  get yAxis(): Vec3 {
    return fromOcDir(this.wrapped.YDirection());
  }

  /** Recompute the X and Y axes from the current direction using default up-vector logic. */
  autoAxes(): void {
    const [r, gc] = localGC();
    const dir = this.direction;
    const xAxis = defaultXDir(dir);
    const ocDir = r(toOcDir(xAxis));
    this.wrapped.SetXDirection(ocDir);
    gc();
  }

  /** Set the camera position in world coordinates. */
  setPosition(position: PointInput): this {
    const [r, gc] = localGC();
    const pnt = r(toOcPnt(toVec3(position)));
    this.wrapped.SetLocation(pnt);
    gc();
    return this;
  }

  /** Override the camera's local X axis direction. */
  setXAxis(xAxis: PointInput): this {
    const [r, gc] = localGC();
    const dir = r(toOcDir(toVec3(xAxis)));
    this.wrapped.SetXDirection(dir);
    gc();
    return this;
  }

  /** Override the camera's local Y axis direction. */
  setYAxis(yAxis: PointInput): this {
    const [r, gc] = localGC();
    const dir = r(toOcDir(toVec3(yAxis)));
    this.wrapped.SetYDirection(dir);
    gc();
    return this;
  }

  /** Orient the camera to look at a shape's bounding-box center or a specific point. */
  lookAt(shape: AnyShape | PointInput): this {
    const [r, gc] = localGC();
    let lookAtPoint: Vec3;
    if (typeof shape === 'object' && 'wrapped' in shape) {
      // It's a shape - get bounds and compute center
      const bounds = getBounds(shape);
      lookAtPoint = [
        (bounds.xMin + bounds.xMax) / 2,
        (bounds.yMin + bounds.yMax) / 2,
        (bounds.zMin + bounds.zMax) / 2,
      ];
    } else {
      lookAtPoint = toVec3(shape as PointInput);
    }
    const pos = this.position;
    const diff = vecNormalize([
      pos[0] - lookAtPoint[0],
      pos[1] - lookAtPoint[1],
      pos[2] - lookAtPoint[2],
    ]);
    const ocDir = r(toOcDir(diff));

    this.wrapped.SetDirection(ocDir);
    gc();
    this.autoAxes();
    return this;
  }
}
