import type { OcType } from '../kernel/types.js';
import { asDir, asPnt, makeAx2, type Point, Vector } from '../core/geometry.js';
import type { BoundingBox } from '../core/geometry.js';
import { WrappingObj } from '../core/memory.js';
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

function defaultXDir(direction: Point): Vector {
  const dir = new Vector(direction);
  let yAxis = new Vector([0, 0, 1]);
  let xAxis = yAxis.cross(dir);
  if (xAxis.Length === 0) {
    yAxis.delete();
    xAxis.delete();
    yAxis = new Vector([0, 1, 0]);
    xAxis = yAxis.cross(dir);
  }
  dir.delete();
  yAxis.delete();
  return xAxis.normalize();
}

export class ProjectionCamera extends WrappingObj<OcType> {
  constructor(position: Point = [0, 0, 0], direction: Point = [0, 0, 1], xAxis?: Point) {
    const xDir = xAxis ? new Vector(xAxis) : defaultXDir(direction);
    const ax2 = makeAx2(position, direction, xDir);
    super(ax2);
    xDir.delete();
  }

  get position(): Vector {
    return new Vector(this.wrapped.Location());
  }

  get direction(): Vector {
    return new Vector(this.wrapped.Direction());
  }

  get xAxis(): Vector {
    return new Vector(this.wrapped.XDirection());
  }

  get yAxis(): Vector {
    return new Vector(this.wrapped.YDirection());
  }

  autoAxes(): void {
    const dir = this.direction;
    const xAxis = defaultXDir(dir);
    const ocDir = asDir(xAxis);
    this.wrapped.SetXDirection(ocDir);
    ocDir.delete();
    dir.delete();
    xAxis.delete();
  }

  setPosition(position: Point): this {
    const pnt = asPnt(position);
    this.wrapped.SetLocation(pnt);
    pnt.delete();
    return this;
  }

  setXAxis(xAxis: Point): this {
    const dir = asDir(xAxis);
    this.wrapped.SetXDirection(dir);
    dir.delete();
    return this;
  }

  setYAxis(yAxis: Point): this {
    const dir = asDir(yAxis);
    this.wrapped.SetYDirection(dir);
    dir.delete();
    return this;
  }

  lookAt(shape: { boundingBox: BoundingBox } | Point): this {
    const lookAtPoint = new Vector(
      'boundingBox' in (shape as object)
        ? (shape as { boundingBox: BoundingBox }).boundingBox.center
        : (shape as Point)
    );
    const pos = this.position;
    const diff = pos.sub(lookAtPoint);
    const direction = diff.normalized();
    const ocDir = direction.toDir();

    this.wrapped.SetDirection(ocDir);
    ocDir.delete();
    diff.delete();
    pos.delete();
    lookAtPoint.delete();
    direction.delete();
    this.autoAxes();
    return this;
  }
}
