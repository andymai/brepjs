import type { OcType } from '../kernel/types.js';
import { asDir, asPnt, makeAx2, type Point, Vector } from '../core/geometry.js';
import type { BoundingBox } from '../core/geometry.js';
import { WrappingObj, localGC } from '../core/memory.js';
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
  const [r, gc] = localGC();
  const dir = r(new Vector(direction));
  let yAxis = r(new Vector([0, 0, 1]));
  let xAxis = yAxis.cross(dir);
  if (xAxis.Length === 0) {
    xAxis.delete();
    yAxis = r(new Vector([0, 1, 0]));
    xAxis = yAxis.cross(dir);
  }
  gc();
  return xAxis.normalize();
}

export class ProjectionCamera extends WrappingObj<OcType> {
  constructor(position: Point = [0, 0, 0], direction: Point = [0, 0, 1], xAxis?: Point) {
    const [r, gc] = localGC();
    const xDir = xAxis ? r(new Vector(xAxis)) : r(defaultXDir(direction));
    const ax2 = makeAx2(position, direction, xDir);
    gc();
    super(ax2);
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
    const [r, gc] = localGC();
    const dir = r(this.direction);
    const xAxis = r(defaultXDir(dir));
    const ocDir = r(asDir(xAxis));
    this.wrapped.SetXDirection(ocDir);
    gc();
  }

  setPosition(position: Point): this {
    const [r, gc] = localGC();
    const pnt = r(asPnt(position));
    this.wrapped.SetLocation(pnt);
    gc();
    return this;
  }

  setXAxis(xAxis: Point): this {
    const [r, gc] = localGC();
    const dir = r(asDir(xAxis));
    this.wrapped.SetXDirection(dir);
    gc();
    return this;
  }

  setYAxis(yAxis: Point): this {
    const [r, gc] = localGC();
    const dir = r(asDir(yAxis));
    this.wrapped.SetYDirection(dir);
    gc();
    return this;
  }

  lookAt(shape: { boundingBox: BoundingBox } | Point): this {
    const [r, gc] = localGC();
    const lookAtPoint = r(
      new Vector(
        'boundingBox' in (shape as object)
          ? (shape as { boundingBox: BoundingBox }).boundingBox.center
          : (shape as Point)
      )
    );
    const pos = r(this.position);
    const diff = r(pos.sub(lookAtPoint));
    const direction = r(diff.normalized());
    const ocDir = r(direction.toDir());

    this.wrapped.SetDirection(ocDir);
    gc();
    this.autoAxes();
    return this;
  }
}
