import type { Plane, PlaneName, PlaneInput } from '../core/planeTypes.js';
import { resolvePlane } from '../core/planeOps.js';
import { unwrap } from '../core/result.js';
import { bug } from '../core/errors.js';
import { DisposalScope } from '../core/memory.js';
import { vecSub, vecNormalize, vecCross } from '../core/vecOps.js';
import { assembleWire } from '../topology/shapeHelpers.js';
import { curvesAsEdgesOnPlane } from '../2d/curves.js';
import { samePoint, type Point2D } from '../2d/lib/index.js';
import type { GenericSketcher } from './sketcherlib.js';
import type { Wire } from '../core/shapeTypes.js';
import { createWire } from '../core/shapeTypes.js';
import type { PointInput } from '../core/types.js';
import type { Curve2D } from '../2d/lib/index.js';
import { downcast } from '../topology/cast.js';
import { mirror as mirrorKernelShape } from '../core/geometryHelpers.js';
import { planeToWorld } from '../core/planeOps.js';
import Sketch from './Sketch.js';
import { BaseSketcher2d } from './Sketcher2d.js';

/**
 * Build 2D wire profiles on a 3D plane using a builder-pen API.
 *
 * The Sketcher accumulates 2D curves in the local coordinate system of the
 * chosen plane, then lifts them to 3D edges at finalization.
 *
 * @example
 * ```ts
 * const sketch = new Sketcher("XZ", 5)
 *   .hLine(20)
 *   .vLine(10)
 *   .hLine(-20)
 *   .close();
 * const solid = sketch.extrude(8);
 * ```
 *
 * @see {@link FaceSketcher} for sketching on non-planar surfaces.
 * @see {@link DrawingPen} for the pure-2D equivalent.
 * @category Sketching
 */
export default class Sketcher extends BaseSketcher2d implements GenericSketcher<Sketch> {
  protected plane: Plane;

  /**
   * The sketcher can be defined by a plane, or a simple plane definition,
   * with either a point of origin, or the position on the normal axis from
   * the coordinates origin
   */
  constructor(plane: Plane);
  constructor(plane?: PlaneName, origin?: PointInput | number);
  constructor(plane?: PlaneInput, origin?: PointInput | number) {
    super();
    this.plane =
      plane && typeof plane !== 'string' ? { ...plane } : resolvePlane(plane ?? 'XY', origin);
  }

  /** Release resources held by this sketcher (lightweight — no kernel handles during drawing). */
  delete(): void {
    this.pendingCurves = [];
  }

  /**
   * Override to preserve the original Sketcher's sagitta direction convention.
   *
   * BaseSketcher2d computes the perpendicular as `[-dy, dx]` (counter-clockwise rotation),
   * but the original Sketcher used `cross(diff, plane.zDir)` which produces `[dy, -dx]`
   * (clockwise rotation) for standard planes. Negating the sagitta compensates for this,
   * ensuring all sagitta/bulge arcs curve the same way as the original 3D implementation.
   */
  override sagittaArcTo(end: Point2D, sagitta: number): this {
    return super.sagittaArcTo(end, -sagitta);
  }

  protected buildWire(): Wire {
    if (!this.pendingCurves.length) bug('Sketcher.buildWire', 'No lines to convert into a wire');

    using scope = new DisposalScope();
    const edges = curvesAsEdgesOnPlane(this.pendingCurves, this.plane).map((e) =>
      scope.register(e)
    );
    return unwrap(assembleWire(edges));
  }

  /** Finish drawing and return the open-wire Sketch (does not close the path). */
  done(): Sketch {
    return new Sketch(this.buildWire(), {
      defaultOrigin: this.plane.origin,
      defaultDirection: this.plane.zDir,
    });
  }

  /** Close the path with a straight line to the start point and return the Sketch. */
  close(): Sketch {
    this._closeSketch();
    return this.done();
  }

  /**
   * Close the path by mirroring all edges about the line from first to last point.
   *
   * Mirrors in 3D after assembling the partial wire to ensure exact endpoint
   * matching across kernels.
   */
  closeWithMirror(): Sketch {
    if (samePoint(this.pointer, this.firstPoint))
      bug(
        'Sketcher.closeWithMirror',
        'Cannot close with a mirror when the sketch is already closed'
      );

    const wire = this.buildWire();

    const pointer3d = planeToWorld(this.plane, this.pointer);
    const firstPoint3d = planeToWorld(this.plane, this.firstPoint);
    const diff = vecSub(pointer3d, firstPoint3d);
    const startToEndVector = vecNormalize(diff);
    const normal = vecCross(startToEndVector, this.plane.zDir);

    const clonedWrapped = unwrap(downcast(wire.wrapped));
    const mirroredRaw = mirrorKernelShape(clonedWrapped, normal, pointer3d);
    const mirroredWrapped = unwrap(downcast(mirroredRaw));
    const mirroredWire = createWire(mirroredWrapped);

    const combinedWire = unwrap(assembleWire([wire, mirroredWire]));

    return new Sketch(combinedWire, {
      defaultOrigin: this.plane.origin,
      defaultDirection: this.plane.zDir,
    });
  }

  /**
   * Close the path and apply a custom corner treatment between the last and first segments.
   *
   * @param radius - Fillet/chamfer radius, or a custom corner function.
   * @param mode - Corner treatment type.
   * @returns The closed {@link Sketch}.
   */
  closeWithCustomCorner(
    radius: number | ((f: Curve2D, s: Curve2D) => Curve2D[]),
    mode: 'fillet' | 'chamfer' | 'dogbone' = 'fillet'
  ): Sketch {
    this._closeSketch();
    this._customCornerLastWithFirst(radius, mode);
    return this.done();
  }
}
