import { getKernel } from '../kernel/index.js';
import type { OcType } from '../kernel/types.js';
import { gcWithScope, WrappingObj, localGC } from '../core/memory.js';
import type { AnyShape, Face, Shape3D } from '../topology/shapes.js';

class PhysicalProperties extends WrappingObj<OcType> {
  get centerOfMass(): [number, number, number] {
    const r = gcWithScope();
    const pnt = r(this.wrapped.CentreOfMass());
    return [pnt.X(), pnt.Y(), pnt.Z()];
  }
}

/**
 * Volume physical properties wrapper around GProp_GProps.
 *
 * @deprecated Use {@link measureVolumeProps} from `measureFns.ts` instead.
 */
export class VolumePhysicalProperties extends PhysicalProperties {
  get volume(): number {
    return this.wrapped.Mass();
  }
}

/**
 * Surface physical properties wrapper around GProp_GProps.
 *
 * @deprecated Use {@link measureSurfaceProps} from `measureFns.ts` instead.
 */
export class SurfacePhysicalProperties extends PhysicalProperties {
  get area(): number {
    return this.wrapped.Mass();
  }
}

/**
 * Linear physical properties wrapper around GProp_GProps.
 *
 * @deprecated Use {@link measureLinearProps} from `measureFns.ts` instead.
 */
export class LinearPhysicalProperties extends PhysicalProperties {
  get length(): number {
    return this.wrapped.Mass();
  }
}

/**
 * Compute surface properties (area, center of mass) for a face or 3D shape.
 *
 * @see {@link measureSurfaceProps} for the preferred functional API.
 */
export function measureShapeSurfaceProperties(shape: Face | Shape3D): SurfacePhysicalProperties {
  const oc = getKernel().oc;
  const properties = new oc.GProp_GProps_1();
  oc.BRepGProp.SurfaceProperties_1(shape.wrapped, properties, false, false);
  return new SurfacePhysicalProperties(properties);
}

/**
 * Compute linear properties (length, center of mass) for any shape.
 *
 * @see {@link measureLinearProps} for the preferred functional API.
 */
export function measureShapeLinearProperties(shape: AnyShape): LinearPhysicalProperties {
  const oc = getKernel().oc;
  const properties = new oc.GProp_GProps_1();
  oc.BRepGProp.LinearProperties(shape.wrapped, properties, false, false);
  return new LinearPhysicalProperties(properties);
}

/**
 * Compute volume properties (volume, center of mass) for a 3D shape.
 *
 * @see {@link measureVolumeProps} for the preferred functional API.
 */
export function measureShapeVolumeProperties(shape: Shape3D): VolumePhysicalProperties {
  const oc = getKernel().oc;
  const properties = new oc.GProp_GProps_1();
  oc.BRepGProp.VolumeProperties_1(shape.wrapped, properties, false, false, false);
  return new VolumePhysicalProperties(properties);
}

/**
 * Get the volume of a 3D shape (OOP measurement API).
 *
 * @see {@link measureVolumeProps} for the preferred functional API.
 */
export function measureVolume(shape: Shape3D): number {
  const [r, gc] = localGC();
  const props = r(measureShapeVolumeProperties(shape));
  const v = props.volume;
  gc();
  return v;
}

/**
 * Get the surface area of a face or 3D shape (OOP measurement API).
 *
 * @see {@link measureSurfaceProps} for the preferred functional API.
 */
export function measureArea(shape: Face | Shape3D): number {
  const [r, gc] = localGC();
  const props = r(measureShapeSurfaceProperties(shape));
  const a = props.area;
  gc();
  return a;
}

/**
 * Get the arc length of a shape (OOP measurement API).
 *
 * @see {@link measureLinearProps} for the preferred functional API.
 */
export function measureLength(shape: AnyShape): number {
  const [r, gc] = localGC();
  const props = r(measureShapeLinearProperties(shape));
  const l = props.length;
  gc();
  return l;
}

/**
 * Stateful distance measurement tool wrapping BRepExtrema_DistShapeShape.
 *
 * @deprecated Use {@link measureDistance} or {@link createDistanceQuery} from `measureFns.ts` instead.
 */
export class DistanceTool extends WrappingObj<OcType> {
  constructor() {
    const oc = getKernel().oc;
    super(new oc.BRepExtrema_DistShapeShape_1());
  }

  distanceBetween(shape1: AnyShape, shape2: AnyShape): number {
    const [r, gc] = localGC();
    this.wrapped.LoadS1(shape1.wrapped);
    this.wrapped.LoadS2(shape2.wrapped);
    const oc = getKernel().oc;
    const progress = r(new oc.Message_ProgressRange_1());
    this.wrapped.Perform(progress);
    gc();
    return this.wrapped.Value();
  }
}

/**
 * Measure the minimum distance between two shapes.
 *
 * @see {@link measureDistance} from `measureFns.ts` for the preferred functional API.
 */
export function measureDistanceBetween(shape1: AnyShape, shape2: AnyShape): number {
  const [r, gc] = localGC();
  const tool = r(new DistanceTool());
  const dist = tool.distanceBetween(shape1, shape2);
  gc();
  return dist;
}

/**
 * Reusable distance query that keeps the first shape loaded.
 *
 * @deprecated Use {@link createDistanceQuery} from `measureFns.ts` instead.
 */
export class DistanceQuery extends WrappingObj<OcType> {
  constructor(shape: AnyShape) {
    const oc = getKernel().oc;
    super(new oc.BRepExtrema_DistShapeShape_1());
    this.wrapped.LoadS1(shape.wrapped);
  }

  distanceTo(shape: AnyShape): number {
    const [r, gc] = localGC();
    this.wrapped.LoadS2(shape.wrapped);
    const oc = getKernel().oc;
    const progress = r(new oc.Message_ProgressRange_1());
    this.wrapped.Perform(progress);
    gc();
    return this.wrapped.Value();
  }
}
