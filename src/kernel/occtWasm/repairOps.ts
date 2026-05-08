/* v8 ignore file -- occt-wasm kernel not available in brepkit test suite */
/**
 * Shape repair / healing operations for the occt-wasm adapter.
 *
 * @module
 */

import type { KernelShape } from '@/kernel/types.js';
import type { OcctKernelWasm } from './occtWasmTypes.js';
import { unwrap, wrapResult } from './helpers.js';

const HEAL_TOLERANCE = 1e-6;

export function isValid(k: OcctKernelWasm, shape: KernelShape): boolean {
  return k.isValid(unwrap(shape));
}

export function healSolid(k: OcctKernelWasm, shape: KernelShape): KernelShape | null {
  const id = k.healSolid(unwrap(shape), HEAL_TOLERANCE);
  if (id === 0) return null;
  return wrapResult(k, id);
}

export function healFace(k: OcctKernelWasm, shape: KernelShape): KernelShape {
  return wrapResult(k, k.healFace(unwrap(shape), HEAL_TOLERANCE));
}

export function healWire(k: OcctKernelWasm, wire: KernelShape, _face?: KernelShape): KernelShape {
  return wrapResult(k, k.healWire(unwrap(wire), HEAL_TOLERANCE));
}

export function mergeCoincidentVertices(
  _k: OcctKernelWasm,
  _shape: KernelShape,
  _tolerance: number
): number {
  // Not directly in the C++ facade.
  return 0;
}

export function removeDegenerateEdges(
  k: OcctKernelWasm,
  shape: KernelShape,
  _tolerance: number
): number {
  k.removeDegenerateEdges(unwrap(shape));
  return 0; // count not returned by facade
}

export function fixFaceOrientations(k: OcctKernelWasm, shape: KernelShape): number {
  k.fixFaceOrientations(unwrap(shape));
  return 0; // count not returned by facade
}

export function fixShape(k: OcctKernelWasm, shape: KernelShape): KernelShape {
  return wrapResult(k, k.fixShape(unwrap(shape)));
}
