/**
 * Functional measurement utilities using branded shape types.
 * Standalone functions — no classes, no WrappingObj.
 */

import { getKernel } from '../kernel/index.js';
import { gcWithScope } from '../core/disposal.js';
import type { Vec3 } from '../core/types.js';
import type { AnyShape, Face, Shape3D } from '../core/shapeTypes.js';

// ---------------------------------------------------------------------------
// Volume, area, length
// ---------------------------------------------------------------------------

export interface PhysicalProps {
  readonly mass: number;
  readonly centerOfMass: Vec3;
}

/** Volume properties with a domain-specific `volume` alias. */
export interface VolumeProps extends PhysicalProps {
  readonly volume: number;
}

/** Surface properties with a domain-specific `area` alias. */
export interface SurfaceProps extends PhysicalProps {
  readonly area: number;
}

/** Linear properties with a domain-specific `length` alias. */
export interface LinearProps extends PhysicalProps {
  readonly length: number;
}

/** Measure volume properties of a 3D shape. */
export function measureVolumeProps(shape: Shape3D): VolumeProps {
  const oc = getKernel().oc;
  const r = gcWithScope();

  const props = r(new oc.GProp_GProps_1());
  oc.BRepGProp.VolumeProperties_1(shape.wrapped, props, false, false, false);
  const pnt = r(props.CentreOfMass());
  const m = props.Mass();
  return {
    mass: m,
    volume: m,
    centerOfMass: [pnt.X(), pnt.Y(), pnt.Z()],
  };
}

/** Measure surface properties of a face or 3D shape. */
export function measureSurfaceProps(shape: Face | Shape3D): SurfaceProps {
  const oc = getKernel().oc;
  const r = gcWithScope();

  const props = r(new oc.GProp_GProps_1());
  oc.BRepGProp.SurfaceProperties_1(shape.wrapped, props, false, false);
  const pnt = r(props.CentreOfMass());
  const m = props.Mass();
  return {
    mass: m,
    area: m,
    centerOfMass: [pnt.X(), pnt.Y(), pnt.Z()],
  };
}

/** Measure linear properties of any shape. */
export function measureLinearProps(shape: AnyShape): LinearProps {
  const oc = getKernel().oc;
  const r = gcWithScope();

  const props = r(new oc.GProp_GProps_1());
  oc.BRepGProp.LinearProperties(shape.wrapped, props, false, false);
  const pnt = r(props.CentreOfMass());
  const m = props.Mass();
  return {
    mass: m,
    length: m,
    centerOfMass: [pnt.X(), pnt.Y(), pnt.Z()],
  };
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
  return getKernel().distance(shape1.wrapped, shape2.wrapped).value;
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
      try {
        distTool.Perform(progress);
        return distTool.Value();
      } finally {
        progress.delete();
      }
    },
    dispose(): void {
      distTool.delete();
    },
  };
}
