/**
 * Constraint sketch operations for the brepkit adapter.
 * @module
 */

import type { BrepkitKernel } from './brepkitWasmTypes.js';
import type { ConstraintSketchCapability } from '@/kernel/types.js';

/** Create a new constraint sketch. Returns an opaque sketch handle. */
export function sketchNew(bk: BrepkitKernel): number {
  return bk.sketchNew();
}

/** Add a point to a constraint sketch. Returns the point index. */
export function sketchAddPoint(
  bk: BrepkitKernel,
  sketch: number,
  x: number,
  y: number,
  fixed: boolean
): number {
  return bk.sketchAddPoint(sketch, x, y, fixed);
}

/** Add a constraint to a sketch (JSON-encoded constraint descriptor). */
export function sketchAddConstraint(
  bk: BrepkitKernel,
  sketch: number,
  constraintJson: string
): void {
  bk.sketchAddConstraint(sketch, constraintJson);
}

/**
 * Solve sketch constraints. Returns a JSON result with solved point positions.
 * @param maxIterations — solver iteration limit (e.g. 100)
 * @param tolerance — convergence tolerance (e.g. 1e-10)
 */
export function sketchSolve(
  bk: BrepkitKernel,
  sketch: number,
  maxIterations: number,
  tolerance: number
): string {
  return bk.sketchSolve(sketch, maxIterations, tolerance);
}

/** Add an arc to a sketch defined by center, start, end point indices. Returns the arc index. */
export function sketchAddArc(
  bk: BrepkitKernel,
  sketch: number,
  centerIdx: number,
  startIdx: number,
  endIdx: number
): number {
  return bk.sketchAddArc(sketch, centerIdx, startIdx, endIdx);
}

/** Get degrees of freedom remaining in a solved or partially-constrained sketch. */
export function sketchDof(bk: BrepkitKernel, sketch: number): string {
  const result = bk.sketchDof(sketch);
  return typeof result === 'string' ? result : String(result);
}

/** Co-located factory: returns the {@link ConstraintSketchCapability} slice bound to `bk`. */
export function makeSketchOps(bk: BrepkitKernel): ConstraintSketchCapability {
  return {
    sketchNew: () => sketchNew(bk),
    sketchAddPoint: (sketch, x, y, fixed) => sketchAddPoint(bk, sketch, x, y, fixed),
    sketchAddArc: (sketch, centerIdx, startIdx, endIdx) =>
      sketchAddArc(bk, sketch, centerIdx, startIdx, endIdx),
    sketchAddConstraint: (sketch, json) => {
      sketchAddConstraint(bk, sketch, json);
    },
    sketchSolve: (sketch, maxIter, tolerance) => sketchSolve(bk, sketch, maxIter, tolerance),
    sketchDof: (sketch) => sketchDof(bk, sketch),
  };
}
