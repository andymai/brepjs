import { getKernel } from '@/kernel/index.js';
import type { Edge, Face, Dimension } from '@/core/shapeTypes.js';
import type { NurbsCurveData, NurbsSurfaceData } from '@/kernel/types.js';

/**
 * Extract NURBS data from a BSpline or Bezier edge.
 * Returns null if the edge is not a NURBS curve (e.g., line, circle).
 */
export function getNurbsCurveData(edge: Edge): NurbsCurveData | null {
  const kernel = getKernel();
  if (!kernel.getNurbsCurveData) return null;
  return kernel.getNurbsCurveData(edge.wrapped);
}

/**
 * Extract NURBS data from a BSpline face.
 * Returns null if the face is not a BSpline surface (e.g., plane, cylinder).
 */
export function getNurbsSurfaceData<D extends Dimension>(face: Face<D>): NurbsSurfaceData | null {
  const kernel = getKernel();
  if (!kernel.getNurbsSurfaceData) return null;
  return kernel.getNurbsSurfaceData(face.wrapped);
}
