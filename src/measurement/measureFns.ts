/**
 * Functional measurement utilities using branded shape types.
 * Standalone functions — no classes, no WrappingObj.
 */

import { getKernel } from '../kernel/index.js';
import type { Vec3 } from '../core/types.js';
import type { AnyShape, Face, Shape3D } from '../core/shapeTypes.js';

// ---------------------------------------------------------------------------
// Volume, area, length
// ---------------------------------------------------------------------------

export interface PhysicalProps {
  readonly mass: number;
  readonly centerOfMass: Vec3;
}

/** Measure volume properties of a 3D shape. */
export function measureVolumeProps(shape: Shape3D): PhysicalProps {
  const oc = getKernel().oc;
  const props = new oc.GProp_GProps_1();
  oc.BRepGProp.VolumeProperties_1(shape.wrapped, props, false, false, false);
  const pnt = props.CentreOfMass();
  const result: PhysicalProps = {
    mass: props.Mass(),
    centerOfMass: [pnt.X(), pnt.Y(), pnt.Z()],
  };
  pnt.delete();
  props.delete();
  return result;
}

/** Measure surface properties of a face or 3D shape. */
export function measureSurfaceProps(shape: Face | Shape3D): PhysicalProps {
  const oc = getKernel().oc;
  const props = new oc.GProp_GProps_1();
  oc.BRepGProp.SurfaceProperties_1(shape.wrapped, props, false, false);
  const pnt = props.CentreOfMass();
  const result: PhysicalProps = {
    mass: props.Mass(),
    centerOfMass: [pnt.X(), pnt.Y(), pnt.Z()],
  };
  pnt.delete();
  props.delete();
  return result;
}

/** Measure linear properties of any shape. */
export function measureLinearProps(shape: AnyShape): PhysicalProps {
  const oc = getKernel().oc;
  const props = new oc.GProp_GProps_1();
  oc.BRepGProp.LinearProperties(shape.wrapped, props, false, false);
  const pnt = props.CentreOfMass();
  const result: PhysicalProps = {
    mass: props.Mass(),
    centerOfMass: [pnt.X(), pnt.Y(), pnt.Z()],
  };
  pnt.delete();
  props.delete();
  return result;
}

/** Get the volume of a 3D shape. */
export function measureVolume(shape: Shape3D): number {
  return measureVolumeProps(shape).mass;
}

/** Get the surface area of a face or 3D shape. */
export function measureArea(shape: Face | Shape3D): number {
  return measureSurfaceProps(shape).mass;
}

/** Get the arc length of a shape. */
export function measureLength(shape: AnyShape): number {
  return measureLinearProps(shape).mass;
}

// ---------------------------------------------------------------------------
// Distance
// ---------------------------------------------------------------------------

/** Measure the minimum distance between two shapes. */
export function measureDistance(shape1: AnyShape, shape2: AnyShape): number {
  const oc = getKernel().oc;
  const distTool = new oc.BRepExtrema_DistShapeShape_1();
  distTool.LoadS1(shape1.wrapped);
  distTool.LoadS2(shape2.wrapped);
  const progress = new oc.Message_ProgressRange_1();
  distTool.Perform(progress);
  const dist = distTool.Value();
  progress.delete();
  distTool.delete();
  return dist;
}

/** Create a reusable distance query from a reference shape. */
export function createDistanceQuery(referenceShape: AnyShape): {
  distanceTo: (other: AnyShape) => number;
  dispose: () => void;
} {
  const oc = getKernel().oc;
  const distTool = new oc.BRepExtrema_DistShapeShape_1();
  distTool.LoadS1(referenceShape.wrapped);

  return {
    distanceTo(other: AnyShape): number {
      distTool.LoadS2(other.wrapped);
      const progress = new oc.Message_ProgressRange_1();
      distTool.Perform(progress);
      const dist = distTool.Value();
      progress.delete();
      return dist;
    },
    dispose(): void {
      distTool.delete();
    },
  };
}
