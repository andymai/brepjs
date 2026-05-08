/* v8 ignore file -- occt-wasm kernel not available in brepkit test suite */
/**
 * Primitive shape constructors for the occt-wasm adapter.
 *
 * @module
 */

import type { KernelShape } from '@/kernel/types.js';
import type { OcctKernelWasm } from './occtWasmTypes.js';
import { handle, rotateZToDirection } from './helpers.js';

export function makeBox(
  k: OcctKernelWasm,
  width: number,
  height: number,
  depth: number
): KernelShape {
  return handle('solid', k.makeBox(width, height, depth));
}

export function makeCylinder(
  k: OcctKernelWasm,
  radius: number,
  height: number,
  center?: [number, number, number],
  direction?: [number, number, number]
): KernelShape {
  let id = k.makeCylinder(radius, height);
  if (direction) {
    id = rotateZToDirection(k, id, direction);
  }
  if (center && (center[0] !== 0 || center[1] !== 0 || center[2] !== 0)) {
    id = k.translate(id, center[0], center[1], center[2]);
  }
  return handle('solid', id);
}

export function makeSphere(
  k: OcctKernelWasm,
  radius: number,
  center?: [number, number, number]
): KernelShape {
  let id = k.makeSphere(radius);
  if (center && (center[0] !== 0 || center[1] !== 0 || center[2] !== 0)) {
    id = k.translate(id, center[0], center[1], center[2]);
  }
  return handle('solid', id);
}

export function makeCone(
  k: OcctKernelWasm,
  radius1: number,
  radius2: number,
  height: number,
  center?: [number, number, number],
  direction?: [number, number, number]
): KernelShape {
  let id = k.makeCone(radius1, radius2, height);
  if (direction) {
    id = rotateZToDirection(k, id, direction);
  }
  if (center && (center[0] !== 0 || center[1] !== 0 || center[2] !== 0)) {
    id = k.translate(id, center[0], center[1], center[2]);
  }
  return handle('solid', id);
}

export function makeTorus(
  k: OcctKernelWasm,
  majorRadius: number,
  minorRadius: number,
  center?: [number, number, number],
  direction?: [number, number, number]
): KernelShape {
  let id = k.makeTorus(majorRadius, minorRadius);
  if (direction) {
    id = rotateZToDirection(k, id, direction);
  }
  if (center && (center[0] !== 0 || center[1] !== 0 || center[2] !== 0)) {
    id = k.translate(id, center[0], center[1], center[2]);
  }
  return handle('solid', id);
}

export function makeEllipsoid(
  k: OcctKernelWasm,
  aLength: number,
  bLength: number,
  cLength: number
): KernelShape {
  return handle('solid', k.makeEllipsoid(aLength, bLength, cLength));
}

export function makeBoxFromCorners(
  k: OcctKernelWasm,
  p1: [number, number, number],
  p2: [number, number, number]
): KernelShape {
  return handle('solid', k.makeBoxFromCorners(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]));
}

export function makeRectangle(k: OcctKernelWasm, width: number, height: number): KernelShape {
  return handle('face', k.makeRectangle(width, height));
}
