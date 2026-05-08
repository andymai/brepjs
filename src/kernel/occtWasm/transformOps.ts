/* v8 ignore file -- occt-wasm kernel not available in brepkit test suite */
/**
 * Transform / pattern operations for the occt-wasm adapter.
 *
 * @module
 */

import type { KernelShape, KernelType, ShapeType } from '@/kernel/types.js';
import type { TransformEntry } from '@/kernel/interfaces/transformOps.js';
import type { OcctKernelWasm, OcctWasmModule } from './occtWasmTypes.js';
import { handle, makeVecDouble, multiplyMatrices4x4, noop, unwrap, wrapResult } from './helpers.js';

export function composeTransform(
  ops: Array<
    | { type: 'translate'; x: number; y: number; z: number }
    | {
        type: 'rotate';
        angle: number;
        axis?: readonly [number, number, number] | undefined;
        center?: readonly [number, number, number] | undefined;
      }
  >
): { handle: KernelType; dispose: () => void } {
  // Build a 4x4 identity matrix then compose using PreMultiply order
  // (matches OCCT's trsf.PreMultiply(step) convention).
  let matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const op of ops) {
    if (op.type === 'translate') {
      const t = [1, 0, 0, op.x, 0, 1, 0, op.y, 0, 0, 1, op.z, 0, 0, 0, 1];
      matrix = multiplyMatrices4x4(t, matrix);
    } else {
      const ax = op.axis ?? [0, 0, 1];
      const cn = op.center ?? [0, 0, 0];
      const rad = (op.angle * Math.PI) / 180;
      const c = Math.cos(rad);
      const s = Math.sin(rad);
      const t = 1 - c;
      const len = Math.sqrt(ax[0] ** 2 + ax[1] ** 2 + ax[2] ** 2);
      const [ux, uy, uz] = [ax[0] / len, ax[1] / len, ax[2] / len];
      const r00 = t * ux * ux + c;
      const r01 = t * ux * uy - s * uz;
      const r02 = t * ux * uz + s * uy;
      const r10 = t * uy * ux + s * uz;
      const r11 = t * uy * uy + c;
      const r12 = t * uy * uz - s * ux;
      const r20 = t * uz * ux - s * uy;
      const r21 = t * uz * uy + s * ux;
      const r22 = t * uz * uz + c;
      const tx = cn[0] - (r00 * cn[0] + r01 * cn[1] + r02 * cn[2]);
      const ty = cn[1] - (r10 * cn[0] + r11 * cn[1] + r12 * cn[2]);
      const tz = cn[2] - (r20 * cn[0] + r21 * cn[1] + r22 * cn[2]);
      const rm = [r00, r01, r02, tx, r10, r11, r12, ty, r20, r21, r22, tz, 0, 0, 0, 1];
      matrix = multiplyMatrices4x4(rm, matrix);
    }
  }
  return {
    handle: { __type: 'transform_matrix', matrix, delete: noop },
    dispose: noop,
  };
}

export function transform(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shape: KernelShape,
  trsf: KernelType
): KernelShape {
  // Handle various transform representations.
  // brepjs-patterns-disable: no-double-cast
  const t = trsf;
  let matrix: number[] | undefined;
  if (Array.isArray(t)) {
    matrix = t as number[];
  } else if (typeof t === 'object') {
    if (Array.isArray(t['matrix'])) {
      matrix = t['matrix'] as number[];
      if (matrix.length === 16) matrix = matrix.slice(0, 12);
    } else if (Array.isArray(t['elements'])) matrix = t['elements'] as number[];
  }
  if (matrix) {
    if (matrix.length === 16) {
      matrix = matrix.slice(0, 12);
    }
    if (matrix.length >= 12) {
      const vec = makeVecDouble(Module, matrix);
      try {
        return wrapResult(k, k.transform(unwrap(shape), vec));
      } finally {
        vec.delete();
      }
    }
  }
  return handle(k.getShapeType(unwrap(shape)) as ShapeType, k.copy(unwrap(shape)));
}

export function translate(
  k: OcctKernelWasm,
  shape: KernelShape,
  x: number,
  y: number,
  z: number
): KernelShape {
  return wrapResult(k, k.translate(unwrap(shape), x, y, z));
}

export function rotate(
  k: OcctKernelWasm,
  shape: KernelShape,
  angle: number,
  axis?: readonly [number, number, number],
  center?: readonly [number, number, number]
): KernelShape {
  const ax = axis ?? [0, 0, 1];
  const cn = center ?? [0, 0, 0];
  return wrapResult(k, k.rotate(unwrap(shape), cn[0], cn[1], cn[2], ax[0], ax[1], ax[2], angle));
}

export function mirror(
  k: OcctKernelWasm,
  shape: KernelShape,
  origin: readonly [number, number, number],
  normal: readonly [number, number, number]
): KernelShape {
  return wrapResult(
    k,
    k.mirror(unwrap(shape), origin[0], origin[1], origin[2], normal[0], normal[1], normal[2])
  );
}

export function scale(
  k: OcctKernelWasm,
  shape: KernelShape,
  center: readonly [number, number, number],
  factor: number
): KernelShape {
  return wrapResult(k, k.scale(unwrap(shape), center[0], center[1], center[2], factor));
}

export function generalTransform(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shape: KernelShape,
  linear: readonly [number, number, number, number, number, number, number, number, number],
  translation: readonly [number, number, number],
  _isOrthogonal: boolean
): KernelShape {
  // 3x4 row-major matrix from 3x3 linear + translation (C++ facade expects 12 elements).
  const matrix = [
    linear[0],
    linear[1],
    linear[2],
    translation[0],
    linear[3],
    linear[4],
    linear[5],
    translation[1],
    linear[6],
    linear[7],
    linear[8],
    translation[2],
  ];
  const vec = makeVecDouble(Module, matrix);
  try {
    return wrapResult(k, k.generalTransform(unwrap(shape), vec));
  } finally {
    vec.delete();
  }
}

export function positionOnCurve(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shape: KernelShape,
  spine: KernelShape,
  param: number
): KernelShape {
  // Compute Frenet frame at param: point + tangent direction.
  const ptVec = k.curvePointAtParam(unwrap(spine), param);
  let px = 0,
    py = 0,
    pz = 0,
    tx = 0,
    ty = 0,
    tz = 0;
  try {
    px = ptVec.get(0);
    py = ptVec.get(1);
    pz = ptVec.get(2);
    const tgVec = k.curveTangent(unwrap(spine), param);
    try {
      tx = tgVec.get(0);
      ty = tgVec.get(1);
      tz = tgVec.get(2);
    } finally {
      tgVec.delete();
    }
  } finally {
    ptVec.delete();
  }

  // Build rotation from Z-axis to tangent direction.
  let ux: number, uy: number, uz: number;
  if (Math.abs(tx) < 0.9) {
    ux = 0;
    uy = tz;
    uz = -ty;
  } else {
    ux = -tz;
    uy = 0;
    uz = tx;
  }
  const uLen = Math.sqrt(ux * ux + uy * uy + uz * uz);
  ux /= uLen;
  uy /= uLen;
  uz /= uLen;
  const vx = ty * uz - tz * uy;
  const vy = tz * ux - tx * uz;
  const vz = tx * uy - ty * ux;

  const mat = new Module.VectorDouble();
  mat.push_back(ux);
  mat.push_back(vx);
  mat.push_back(tx);
  mat.push_back(px);
  mat.push_back(uy);
  mat.push_back(vy);
  mat.push_back(ty);
  mat.push_back(py);
  mat.push_back(uz);
  mat.push_back(vz);
  mat.push_back(tz);
  mat.push_back(pz);
  try {
    return wrapResult(k, k.transform(unwrap(shape), mat));
  } finally {
    mat.delete();
  }
}

export function linearPattern(
  k: OcctKernelWasm,
  shape: KernelShape,
  direction: [number, number, number],
  spacing: number,
  count: number
): KernelShape[] {
  const compoundId = k.linearPattern(
    unwrap(shape),
    direction[0],
    direction[1],
    direction[2],
    spacing,
    count
  );
  const subVec = k.getSubShapes(compoundId, 'solid');
  const results: KernelShape[] = [];
  try {
    const n = subVec.size();
    for (let i = 0; i < n; i++) {
      results.push(handle('solid', subVec.get(i)));
    }
  } finally {
    subVec.delete();
  }
  if (results.length === 0) {
    const iter = k.iterShapes(compoundId);
    try {
      const n2 = iter.size();
      for (let i = 0; i < n2; i++) {
        results.push(wrapResult(k, iter.get(i)));
      }
    } finally {
      iter.delete();
    }
  }
  return results;
}

export function circularPattern(
  k: OcctKernelWasm,
  shape: KernelShape,
  center: [number, number, number],
  axis: [number, number, number],
  angleStep: number,
  count: number
): KernelShape[] {
  const compoundId = k.circularPattern(
    unwrap(shape),
    center[0],
    center[1],
    center[2],
    axis[0],
    axis[1],
    axis[2],
    angleStep,
    count
  );
  const subVec = k.getSubShapes(compoundId, 'solid');
  const results: KernelShape[] = [];
  try {
    const n = subVec.size();
    for (let i = 0; i < n; i++) {
      results.push(handle('solid', subVec.get(i)));
    }
  } finally {
    subVec.delete();
  }
  if (results.length === 0) {
    const iter = k.iterShapes(compoundId);
    try {
      const n2 = iter.size();
      for (let i = 0; i < n2; i++) {
        results.push(wrapResult(k, iter.get(i)));
      }
    } finally {
      iter.delete();
    }
  }
  return results;
}

export function transformBatch(k: OcctKernelWasm, entries: TransformEntry[]): KernelShape[] {
  return entries.map((entry) => {
    switch (entry.type) {
      case 'translate':
        return translate(k, entry.shape, entry.x, entry.y, entry.z);
      case 'rotate':
        return rotate(k, entry.shape, entry.angle, entry.axis, entry.center);
      case 'scale':
        return scale(k, entry.shape, entry.center, entry.factor);
      case 'mirror':
        return mirror(k, entry.shape, entry.origin, entry.normal);
      default:
        throw new Error('occt-wasm: transformBatch unknown type');
    }
  });
}
