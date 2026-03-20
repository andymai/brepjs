/**
 * Transform operations for the brepkit adapter.
 * @module
 */

import type { BrepkitKernel } from './brepkitWasmTypes.js';
import type { KernelShape } from '@/kernel/types.js';
import {
  type BrepkitHandle,
  solidHandle,
  compoundHandle,
  unwrapSolidOrThrow,
  translationMatrix,
  rotationMatrix,
  scaleMatrix,
  affineMatrix,
  mirrorMatrix,
} from './helpers.js';
import { applyMatrix } from './internalOps.js';
import { curveTangent } from './geometryOps.js';

export function transform(bk: BrepkitKernel, shape: KernelShape, trsf: unknown): KernelShape {
  if (Array.isArray(trsf) && trsf.length === 16) {
    return applyMatrix(bk, shape, trsf);
  }
  throw new Error('brepkit: transform expects a 16-element matrix array');
}

export function translate(
  bk: BrepkitKernel,
  shape: KernelShape,
  x: number,
  y: number,
  z: number
): KernelShape {
  return applyMatrix(bk, shape, translationMatrix(x, y, z));
}

export function rotate(
  bk: BrepkitKernel,
  shape: KernelShape,
  angle: number,
  axis?: readonly [number, number, number],
  center?: readonly [number, number, number]
): KernelShape {
  return applyMatrix(bk, shape, rotationMatrix(angle, axis, center));
}

export function mirror(
  bk: BrepkitKernel,
  shape: KernelShape,
  origin: readonly [number, number, number],
  normal: readonly [number, number, number]
): KernelShape {
  const h = shape as BrepkitHandle;
  if (h.type === 'solid') {
    const id = bk.mirror(h.id, origin[0], origin[1], origin[2], normal[0], normal[1], normal[2]);
    return solidHandle(id);
  }
  return applyMatrix(bk, shape, mirrorMatrix(origin, normal));
}

export function scale(
  bk: BrepkitKernel,
  shape: KernelShape,
  center: readonly [number, number, number],
  factor: number
): KernelShape {
  return applyMatrix(bk, shape, scaleMatrix(center, factor));
}

export function generalTransform(
  bk: BrepkitKernel,
  shape: KernelShape,
  linear: readonly [number, number, number, number, number, number, number, number, number],
  translation: readonly [number, number, number],
  _isOrthogonal: boolean
): KernelShape {
  return applyMatrix(bk, shape, affineMatrix(linear, translation));
}

export function generalTransformNonOrthogonal(
  bk: BrepkitKernel,
  shape: KernelShape,
  linear: readonly [number, number, number, number, number, number, number, number, number],
  translation: readonly [number, number, number]
): KernelShape {
  return applyMatrix(bk, shape, affineMatrix(linear, translation));
}

export function positionOnCurve(
  bk: BrepkitKernel,
  shape: KernelShape,
  spine: KernelShape,
  param: number
): KernelShape {
  const { point, tangent } = curveTangent(bk, spine, param);
  const [tx, ty, tz] = tangent;
  const len = Math.sqrt(tx * tx + ty * ty + tz * tz);
  if (len < 1e-12) return translate(bk, shape, point[0], point[1], point[2]);

  const nx = tx / len,
    ny = ty / len,
    nz = tz / len;
  const dot = nz;
  let result = shape;
  if (Math.abs(dot + 1) < 1e-10) {
    result = rotate(bk, result, 180, [1, 0, 0]);
  } else if (Math.abs(dot - 1) > 1e-10) {
    const axis: [number, number, number] = [-ny, nx, 0];
    const angleDeg = Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI);
    result = rotate(bk, result, angleDeg, axis);
  }
  return translate(bk, result, point[0], point[1], point[2]);
}

export function linearPattern(
  bk: BrepkitKernel,
  shape: KernelShape,
  direction: [number, number, number],
  spacing: number,
  count: number
): KernelShape[] {
  const results: KernelShape[] = [shape];
  for (let i = 1; i < count; i++) {
    const offset = spacing * i;
    results.push(
      translate(bk, shape, direction[0] * offset, direction[1] * offset, direction[2] * offset)
    );
  }
  return results;
}

export function circularPattern(
  bk: BrepkitKernel,
  shape: KernelShape,
  center: [number, number, number],
  axis: [number, number, number],
  angleStep: number,
  count: number
): KernelShape[] {
  const results: KernelShape[] = [shape];
  for (let i = 1; i < count; i++) {
    results.push(rotate(bk, shape, angleStep * i, axis, center));
  }
  return results;
}

export function gridPattern(
  bk: BrepkitKernel,
  shape: KernelShape,
  directionX: [number, number, number],
  directionY: [number, number, number],
  spacingX: number,
  spacingY: number,
  countX: number,
  countY: number
): KernelShape {
  const id = bk.gridPattern(
    unwrapSolidOrThrow(shape, 'gridPattern'),
    directionX[0],
    directionX[1],
    directionX[2],
    directionY[0],
    directionY[1],
    directionY[2],
    spacingX,
    spacingY,
    countX,
    countY
  );
  return compoundHandle(id);
}
