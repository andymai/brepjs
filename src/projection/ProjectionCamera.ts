import type { OcType } from '../kernel/types.js';
import type { Vec3, PointInput } from '../core/types.js';
import { toVec3 } from '../core/types.js';
import { WrappingObj, localGC } from '../core/memory.js';
import { toOcPnt, toOcDir, makeOcAx2, fromOcPnt, fromOcDir } from '../core/occtBoundary.js';
import { vecCross, vecLength, vecNormalize } from '../core/vecOps.js';
import {
  PROJECTION_PLANES,
  isProjectionPlane as isProjectionPlaneCheck,
  type CubeFace,
  type ProjectionPlane,
} from './projectionPlanes.js';

// Re-export types for backward compatibility
export type { CubeFace, ProjectionPlane };
export { isProjectionPlaneCheck as isProjectionPlane };

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

  get position(): Vec3 {
    return fromOcPnt(this.wrapped.Location());
  }

  get direction(): Vec3 {
    return fromOcDir(this.wrapped.Direction());
  }

  get xAxis(): Vec3 {
    return fromOcDir(this.wrapped.XDirection());
  }

  get yAxis(): Vec3 {
    return fromOcDir(this.wrapped.YDirection());
  }

  autoAxes(): void {
    const [r, gc] = localGC();
    const dir = this.direction;
    const xAxis = defaultXDir(dir);
    const ocDir = r(toOcDir(xAxis));
    this.wrapped.SetXDirection(ocDir);
    gc();
  }

  setPosition(position: PointInput): this {
    const [r, gc] = localGC();
    const pnt = r(toOcPnt(toVec3(position)));
    this.wrapped.SetLocation(pnt);
    gc();
    return this;
  }

  setXAxis(xAxis: PointInput): this {
    const [r, gc] = localGC();
    const dir = r(toOcDir(toVec3(xAxis)));
    this.wrapped.SetXDirection(dir);
    gc();
    return this;
  }

  setYAxis(yAxis: PointInput): this {
    const [r, gc] = localGC();
    const dir = r(toOcDir(toVec3(yAxis)));
    this.wrapped.SetYDirection(dir);
    gc();
    return this;
  }

  lookAt(shape: { boundingBox: { center: PointInput } } | PointInput): this {
    const [r, gc] = localGC();
    const lookAtPoint = toVec3(
      'boundingBox' in (shape as object)
        ? (shape as { boundingBox: { center: PointInput } }).boundingBox.center
        : (shape as PointInput)
    );
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
