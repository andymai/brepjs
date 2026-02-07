/**
 * Functional measurement utilities using branded shape types.
 * Standalone pure functions returning plain values.
 */

import { getKernel } from '../kernel/index.js';
import { gcWithScope } from '../core/disposal.js';
import type { Vec3 } from '../core/types.js';
import type { AnyShape, Face, Shape3D } from '../core/shapeTypes.js';
import { uvBounds } from '../topology/faceFns.js';
import { surfaceCurvature, type CurvatureResult } from '../kernel/measureOps.js';

// ---------------------------------------------------------------------------
// Volume, area, length
// ---------------------------------------------------------------------------

/** Base physical properties returned by BRepGProp measurements. */
export interface PhysicalProps {
  /** Raw mass property from BRepGProp (volume, area, or length depending on measurement type). */
  readonly mass: number;
  /** Center of mass as an [x, y, z] tuple. */
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

/**
 * Measure volume properties of a 3D shape.
 *
 * @param shape - A solid or compound shape.
 * @returns Volume, center of mass, and raw mass property.
 * @see {@link measureVolume} for a shorthand that returns only the volume number.
 *
 * @example
 * ```ts
 * const props = measureVolumeProps(mySolid);
 * console.log(props.volume, props.centerOfMass);
 * ```
 */
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

/**
 * Measure surface properties of a face or 3D shape.
 *
 * @param shape - A Face or any 3D shape (the total outer surface area is measured).
 * @returns Surface area, center of mass, and raw mass property.
 * @see {@link measureArea} for a shorthand that returns only the area number.
 */
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

/**
 * Measure linear properties of any shape.
 *
 * For edges this is the arc length; for wires/compounds it is the total
 * length of all edges.
 *
 * @param shape - Any shape whose linear extent is to be measured.
 * @returns Length, center of mass, and raw mass property.
 * @see {@link measureLength} for a shorthand that returns only the length number.
 */
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

/**
 * Get the volume of a 3D shape.
 *
 * @see {@link measureVolumeProps} for the full property set including center of mass.
 */
export function measureVolume(shape: Shape3D): number {
  return measureVolumeProps(shape).mass;
}

/**
 * Get the surface area of a face or 3D shape.
 *
 * @see {@link measureSurfaceProps} for the full property set including center of mass.
 */
export function measureArea(shape: Face | Shape3D): number {
  return measureSurfaceProps(shape).mass;
}

/**
 * Get the arc length of a shape.
 *
 * @see {@link measureLinearProps} for the full property set including center of mass.
 */
export function measureLength(shape: AnyShape): number {
  return measureLinearProps(shape).mass;
}

// ---------------------------------------------------------------------------
// Distance
// ---------------------------------------------------------------------------

/**
 * Measure the minimum distance between two shapes.
 *
 * @example
 * ```ts
 * const gap = measureDistance(boxA, boxB);
 * ```
 */
export function measureDistance(shape1: AnyShape, shape2: AnyShape): number {
  return getKernel().distance(shape1.wrapped, shape2.wrapped).value;
}

/**
 * Create a reusable distance query from a reference shape.
 *
 * Keeps the reference shape loaded in the OCCT distance tool so that
 * multiple `distanceTo` calls avoid re-loading overhead.
 *
 * @remarks Call `dispose()` when done to free the WASM-allocated distance tool.
 *
 * @param referenceShape - The shape to measure distances from.
 * @returns An object with `distanceTo(other)` and `dispose()` methods.
 *
 * @example
 * ```ts
 * const query = createDistanceQuery(referenceBox);
 * const d1 = query.distanceTo(otherBox);
 * const d2 = query.distanceTo(sphere);
 * query.dispose();
 * ```
 */
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

// ---------------------------------------------------------------------------
// Surface curvature
// ---------------------------------------------------------------------------

/** Re-export of the kernel curvature result type. */
export type { CurvatureResult } from '../kernel/measureOps.js';

/**
 * Measure surface curvature at a (u, v) parameter point on a face.
 *
 * Returns mean, Gaussian, and principal curvatures with directions.
 * The u, v parameters correspond to the face's parametric domain.
 *
 * @param face - The face to evaluate.
 * @param u - Parameter in the U direction.
 * @param v - Parameter in the V direction.
 *
 * @example
 * ```ts
 * const curv = measureCurvatureAt(cylinderFace, 0.5, 0.5);
 * console.log(curv.meanCurvature, curv.gaussianCurvature);
 * ```
 */
export function measureCurvatureAt(face: Face, u: number, v: number): CurvatureResult {
  const oc = getKernel().oc;
  return surfaceCurvature(oc, face.wrapped, u, v);
}

/**
 * Measure surface curvature at the mid-point of a face's UV bounds.
 *
 * Uses `BRepTools::UVBounds` for the actual trimmed face UV region,
 * avoiding singularities that can occur with surface-level parameter bounds.
 *
 * @param face - The face to evaluate at its parametric center.
 * @see {@link measureCurvatureAt} to evaluate at an arbitrary (u, v) point.
 */
export function measureCurvatureAtMid(face: Face): CurvatureResult {
  const oc = getKernel().oc;
  const bounds = uvBounds(face);
  const uMid = (bounds.uMin + bounds.uMax) / 2;
  const vMid = (bounds.vMin + bounds.vMax) / 2;
  return surfaceCurvature(oc, face.wrapped, uMid, vMid);
}
