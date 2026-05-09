import type { Curve2D, Point2D } from '@/2d/lib/index.js';
import Blueprint from './blueprint.js';
import { BaseSketcher2d } from './baseSketcher2d.js';
import type { GenericSketcher } from './genericSketcher.js';

/**
 * Draw 2D curves and produce a {@link Blueprint} (pure-2D shape, no kernel wire).
 *
 * Use this when you need a reusable 2D profile that can later be sketched onto
 * different planes or faces.
 *
 * @category Sketching
 */
export class BlueprintSketcher extends BaseSketcher2d implements GenericSketcher<Blueprint> {
  constructor(origin: Point2D = [0, 0]) {
    super();
    this.pointer = origin;
    this.firstPoint = origin;

    this.pendingCurves = [];
  }

  /** Finish drawing and return the resulting {@link Blueprint} (does not close the path). */
  done(): Blueprint {
    return new Blueprint(this.pendingCurves);
  }

  /** Close the path with a straight line to the start point and return the Blueprint. */
  close(): Blueprint {
    this._closeSketch();
    return this.done();
  }

  /** Close the path by mirroring all curves about the line from first to last point. */
  closeWithMirror(): Blueprint {
    this._closeWithMirror();
    return this.close();
  }

  /**
   * Close the path and apply a custom corner treatment between the last and first segments.
   *
   * @param radius - Fillet/chamfer radius.
   * @param mode - Corner treatment type.
   * @returns The closed {@link Blueprint}.
   */
  closeWithCustomCorner(
    radius: number | ((f: Curve2D, s: Curve2D) => Curve2D[]),
    mode: 'fillet' | 'chamfer' | 'dogbone' = 'fillet'
  ): Blueprint {
    this._closeSketch();
    this._customCornerLastWithFirst(radius, mode);

    return this.done();
  }
}
