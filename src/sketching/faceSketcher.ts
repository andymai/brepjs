import Sketch from './sketch.js';
import { DisposalScope } from '@/core/disposal.js';
import { getKernel } from '@/kernel/index.js';
import { assembleWire } from '@/topology/shapeHelpers.js';
import { unwrap } from '@/core/result.js';
import type { Wire, Face } from '@/core/shapeTypes.js';
import { createEdge, createFace } from '@/core/shapeTypes.js';
import { uvBounds, pointOnSurface, normalAt } from '@/topology/faceFns.js';
import { curveStartPoint, curveIsClosed } from '@/topology/curveFns.js';
import { downcast } from '@/topology/cast.js';
import type { GenericSketcher } from '@/2d/blueprints/genericSketcher.js';
import type { KernelType } from '@/kernel/types.js';
import type { Curve2D, Point2D } from '@/2d/lib/index.js';
import { vecScale } from '@/core/vecOps.js';
import { BaseSketcher2d } from '@/2d/blueprints/baseSketcher2d.js';

type UVBounds = {
  readonly uMin: number;
  readonly uMax: number;
  readonly vMin: number;
  readonly vMax: number;
};

/**
 * The FaceSketcher allows you to sketch on a face that is not planar, for
 * instance the sides of a cylinder.
 *
 * The coordinates passed to the methods corresponds to normalised distances on
 * this surface, between 0 and 1 in both direction.
 *
 * Note that if you are drawing on a closed surface (typically a revolution
 * surface or a cylinder), the first parameters represents the angle and can be
 * smaller than 0 or bigger than 1.
 *
 * @category Sketching
 */
export default class FaceSketcher extends BaseSketcher2d implements GenericSketcher<Sketch> {
  protected face: Face;
  protected _bounds: UVBounds;

  constructor(face: Face, origin: Point2D = [0, 0]) {
    super(origin);
    this.face = createFace(unwrap(downcast(face.wrapped)));
    this._bounds = uvBounds(face);
  }

  protected override _convertToUV([x, y]: Point2D): Point2D {
    const { uMin, uMax, vMin, vMax } = this._bounds;
    return [uMin + x * (uMax - uMin), vMin + y * (vMax - vMin)];
  }

  protected override _convertFromUV([u, v]: Point2D): Point2D {
    const { uMin, uMax, vMin, vMax } = this._bounds;
    return [(u - uMin) / (uMax - uMin), (v - vMin) / (vMax - vMin)];
  }

  _adaptSurface(): KernelType {
    return getKernel().extractSurfaceFromFace(this.face.wrapped);
  }

  /**
   * @ignore
   */
  protected buildWire(): Wire {
    const kernel = getKernel();
    const geomSurf = this._adaptSurface();

    const edges = this.pendingCurves.map((curve) => {
      return createEdge(kernel.buildEdgeOnSurface(curve.wrapped, geomSurf));
    });
    const wire = unwrap(assembleWire(edges));
    kernel.buildCurves3d(wire.wrapped);

    return wire;
  }

  /** Finish drawing and return the resulting {@link Sketch} (does not close the path). */
  done(): Sketch {
    using scope = new DisposalScope();

    const wire = this.buildWire();
    const sketch = new Sketch(wire);
    if (curveIsClosed(wire)) {
      const face = scope.register(sketch.clone().face());
      const origin = pointOnSurface(face, 0.5, 0.5);
      const normal = normalAt(face);
      const direction = vecScale(normal, -1);
      sketch.defaultOrigin = [origin[0], origin[1], origin[2]];
      sketch.defaultDirection = [direction[0], direction[1], direction[2]];
    } else {
      const startPoint = curveStartPoint(wire);
      const normal = normalAt(this.face, [startPoint[0], startPoint[1], startPoint[2]]);
      sketch.defaultOrigin = [startPoint[0], startPoint[1], startPoint[2]];
      sketch.defaultDirection = [normal[0], normal[1], normal[2]];
    }
    sketch.baseFace = this.face;
    return sketch;
  }

  /** Close the path with a straight line to the start point and return the Sketch. */
  close(): Sketch {
    this._closeSketch();
    return this.done();
  }

  /** Close the path by mirroring all curves about the line from first to last point. */
  closeWithMirror(): Sketch {
    this._closeWithMirror();
    return this.close();
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
