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

/** @deprecated Use measureVolumeProps() instead. */
export class VolumePhysicalProperties extends PhysicalProperties {
  get volume(): number {
    return this.wrapped.Mass();
  }
}

/** @deprecated Use measureSurfaceProps() instead. */
export class SurfacePhysicalProperties extends PhysicalProperties {
  get area(): number {
    return this.wrapped.Mass();
  }
}

/** @deprecated Use measureLinearProps() instead. */
export class LinearPhysicalProperties extends PhysicalProperties {
  get length(): number {
    return this.wrapped.Mass();
  }
}

export function measureShapeSurfaceProperties(shape: Face | Shape3D): SurfacePhysicalProperties {
  const oc = getKernel().oc;
  const properties = new oc.GProp_GProps_1();
  oc.BRepGProp.SurfaceProperties_1(shape.wrapped, properties, false, false);
  return new SurfacePhysicalProperties(properties);
}

export function measureShapeLinearProperties(shape: AnyShape): LinearPhysicalProperties {
  const oc = getKernel().oc;
  const properties = new oc.GProp_GProps_1();
  oc.BRepGProp.LinearProperties(shape.wrapped, properties, false, false);
  return new LinearPhysicalProperties(properties);
}

export function measureShapeVolumeProperties(shape: Shape3D): VolumePhysicalProperties {
  const oc = getKernel().oc;
  const properties = new oc.GProp_GProps_1();
  oc.BRepGProp.VolumeProperties_1(shape.wrapped, properties, false, false, false);
  return new VolumePhysicalProperties(properties);
}

export function measureVolume(shape: Shape3D): number {
  const [r, gc] = localGC();
  const props = r(measureShapeVolumeProperties(shape));
  const v = props.volume;
  gc();
  return v;
}

export function measureArea(shape: Face | Shape3D): number {
  const [r, gc] = localGC();
  const props = r(measureShapeSurfaceProperties(shape));
  const a = props.area;
  gc();
  return a;
}

export function measureLength(shape: AnyShape): number {
  const [r, gc] = localGC();
  const props = r(measureShapeLinearProperties(shape));
  const l = props.length;
  gc();
  return l;
}

/** @deprecated Use measureDistance() instead. */
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

export function measureDistanceBetween(shape1: AnyShape, shape2: AnyShape): number {
  const [r, gc] = localGC();
  const tool = r(new DistanceTool());
  const dist = tool.distanceBetween(shape1, shape2);
  gc();
  return dist;
}

/** @deprecated Use createDistanceQuery() instead. */
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
