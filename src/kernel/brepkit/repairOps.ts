/**
 * Validation and repair operations for the brepkit adapter.
 * @module
 */

import type { BrepkitKernel } from '../brepkitWasmTypes.js';
import type { KernelShape } from '../types.js';
import { type BrepkitHandle, isBrepkitHandle, unwrap, unwrapSolidOrThrow } from './helpers.js';

export function isValid(bk: BrepkitKernel, shape: KernelShape): boolean {
  if (!isBrepkitHandle(shape)) return false;
  if (shape.type !== 'solid') return true;
  try {
    const errors: number = bk.validateSolidRelaxed(shape.id);
    return errors === 0;
  } catch (e: unknown) {
    console.warn('brepkit: isValid check failed:', e);
    return false;
  }
}

export function isValidStrict(bk: BrepkitKernel, shape: KernelShape): boolean {
  if (!isBrepkitHandle(shape)) return false;
  if (shape.type !== 'solid') return true;
  try {
    const errors: number = bk.validateSolid(shape.id);
    return errors === 0;
  } catch (e: unknown) {
    console.warn('brepkit: isValidStrict check failed:', e);
    return false;
  }
}

export function healSolid(bk: BrepkitKernel, shape: KernelShape): KernelShape | null {
  const h = shape as BrepkitHandle;
  if (h.type !== 'solid') {
    throw new Error(
      `brepkit: healSolid requires a solid, got ${h.type}. ` +
        'Consider using makeCompound() to combine shapes first.'
    );
  }
  try {
    // repairSolid is the comprehensive healer (0.4.3+), healSolid is the legacy in-place version
    const remaining = bk.repairSolid(unwrap(shape));
    if (remaining > 0) {
      console.warn(`brepkit: repairSolid left ${remaining} error(s) on solid.`);
    }
    return shape;
  } catch (e: unknown) {
    // Fall back to basic healSolid if repairSolid fails
    try {
      bk.healSolid(unwrap(shape));
      return shape;
    } catch (healErr: unknown) {
      console.warn(
        'brepkit: healSolid failed (repairSolid error:',
        e,
        ', healSolid error:',
        healErr,
        ')'
      );
      return null;
    }
  }
}

export function healFace(_bk: BrepkitKernel, shape: KernelShape): KernelShape {
  return shape; // No-op: brepkit doesn't have face-level healing
}

export function healWire(_bk: BrepkitKernel, wire: KernelShape, _face?: KernelShape): KernelShape {
  return wire; // No-op: brepkit doesn't have wire-level healing
}

export function mergeCoincidentVertices(
  bk: BrepkitKernel,
  shape: KernelShape,
  tolerance: number
): number {
  const solidId = unwrapSolidOrThrow(shape, 'mergeCoincidentVertices');
  return bk.mergeCoincidentVertices(solidId, tolerance);
}

export function removeDegenerateEdges(
  bk: BrepkitKernel,
  shape: KernelShape,
  tolerance: number
): number {
  const solidId = unwrapSolidOrThrow(shape, 'removeDegenerateEdges');
  return bk.removeDegenerateEdges(solidId, tolerance);
}

export function fixFaceOrientations(bk: BrepkitKernel, shape: KernelShape): number {
  const solidId = unwrapSolidOrThrow(shape, 'fixFaceOrientations');
  return bk.fixFaceOrientations(solidId);
}

export function fixShape(bk: BrepkitKernel, shape: KernelShape): KernelShape {
  const h = shape as BrepkitHandle;
  if (h.type === 'solid') {
    bk.healSolid(h.id);
  }
  return shape;
}

export function fixSelfIntersection(_bk: BrepkitKernel, wire: KernelShape): KernelShape {
  // Wire-level self-intersection fixing not yet available in brepkit
  return wire;
}

export function validationDetails(bk: BrepkitKernel, shape: KernelShape): string | null {
  if (!isBrepkitHandle(shape) || shape.type !== 'solid') return null;
  try {
    if (typeof bk.validateSolidDetails === 'function') {
      return bk.validateSolidDetails(shape.id);
    }
    return null;
  } catch {
    return null;
  }
}
