/**
 * KernelMeasureOps — measurement and analysis operations.
 *
 * Covers volume, area, length, center of mass, bounding box, distance,
 * curvature, and persistent distance queries. Analogous to OCCT's
 * GProp_GProps and BRepBndLib packages.
 */

import type { DistanceResult, KernelShape } from '../types.js';

export interface KernelMeasureOps {
  volume(shape: KernelShape): number;
  area(shape: KernelShape): number;
  length(shape: KernelShape): number;
  centerOfMass(shape: KernelShape): [number, number, number];
  linearCenterOfMass(shape: KernelShape): [number, number, number];
  boundingBox(shape: KernelShape): {
    min: [number, number, number];
    max: [number, number, number];
  };

  /** Minimum distance between two shapes with witness points. */
  distance(shape1: KernelShape, shape2: KernelShape): DistanceResult;

  /** Compute surface curvature at a UV point on a face. */
  surfaceCurvature(
    face: KernelShape,
    u: number,
    v: number
  ): {
    gaussian: number;
    mean: number;
    max: number;
    min: number;
    maxDirection: [number, number, number];
    minDirection: [number, number, number];
  };

  /** Surface-based center of mass (uses surface properties, not volume). */
  surfaceCenterOfMass(face: KernelShape): [number, number, number];

  /** Create a persistent distance query tool for repeated measurements. */
  createDistanceQuery(referenceShape: KernelShape): {
    distanceTo(shape: KernelShape): {
      value: number;
      point1: [number, number, number];
      point2: [number, number, number];
    };
    dispose(): void;
  };
}
