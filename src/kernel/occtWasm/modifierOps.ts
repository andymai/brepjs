/**
 * Shape modifier operations for the occt-wasm adapter.
 *
 * @module
 */

import type { KernelShape } from '@/kernel/types.js';
import type { OcctKernelWasm, OcctWasmModule } from './occtWasmTypes.js';
import { makeVecU32, resolveUniformRadius, unwrap, wrapResult } from './helpers.js';

export function fillet(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shape: KernelShape,
  edges: KernelShape[],
  radius: number | [number, number] | ((edge: KernelShape) => number | [number, number])
): KernelShape {
  const r = resolveUniformRadius(edges, radius);
  const vec = makeVecU32(Module, edges.map(unwrap));
  try {
    return wrapResult(k, k.fillet(unwrap(shape), vec, r));
  } finally {
    vec.delete();
  }
}

export function chamfer(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shape: KernelShape,
  edges: KernelShape[],
  distance: number | [number, number] | ((edge: KernelShape) => number | [number, number])
): KernelShape {
  const d = resolveUniformRadius(edges, distance);
  const vec = makeVecU32(Module, edges.map(unwrap));
  try {
    return wrapResult(k, k.chamfer(unwrap(shape), vec, d));
  } finally {
    vec.delete();
  }
}

export function chamferDistAngle(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shape: KernelShape,
  edges: KernelShape[],
  distance: number,
  angleDeg: number
): KernelShape {
  const vec = makeVecU32(Module, edges.map(unwrap));
  try {
    return wrapResult(k, k.chamferDistAngle(unwrap(shape), vec, distance, angleDeg));
  } finally {
    vec.delete();
  }
}

export function shell(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shape: KernelShape,
  faces: KernelShape[],
  thickness: number,
  tolerance?: number
): KernelShape {
  const vec = makeVecU32(Module, faces.map(unwrap));
  try {
    return wrapResult(k, k.shell(unwrap(shape), vec, thickness, tolerance ?? 1e-3));
  } finally {
    vec.delete();
  }
}

export function thicken(k: OcctKernelWasm, shape: KernelShape, thickness: number): KernelShape {
  // 1e-3 matches OCCT's pre-3.0 hardcoded default; thicken's tolerance isn't
  // exposed via brepjs's KernelInstance interface.
  return wrapResult(k, k.thicken(unwrap(shape), thickness, 1e-3));
}

export function offset(
  k: OcctKernelWasm,
  shape: KernelShape,
  distance: number,
  tolerance?: number
): KernelShape {
  return wrapResult(k, k.offset(unwrap(shape), distance, tolerance ?? 1e-6));
}

export function filletVariable(k: OcctKernelWasm, shape: KernelShape, spec: string): KernelShape {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON parse
  const parsed: any = JSON.parse(spec);
  if (
    parsed.edgeId !== undefined &&
    parsed.startRadius !== undefined &&
    parsed.endRadius !== undefined
  ) {
    return wrapResult(
      k,
      k.filletVariable(unwrap(shape), parsed.edgeId, parsed.startRadius, parsed.endRadius)
    );
  }
  throw new Error('occt-wasm: filletVariable (complex spec) not implemented');
}

export function draft(
  k: OcctKernelWasm,
  shape: KernelShape,
  faces: KernelShape[],
  pullDirection: [number, number, number],
  _neutralPlane: [number, number, number],
  angleDeg: number | ((face: KernelShape) => number)
): KernelShape {
  let currentId = unwrap(shape);
  for (const face of faces) {
    const angle = typeof angleDeg === 'function' ? angleDeg(face) : angleDeg;
    const angleRad = (angle * Math.PI) / 180;
    currentId = k.draft(
      currentId,
      unwrap(face),
      angleRad,
      pullDirection[0],
      pullDirection[1],
      pullDirection[2]
    );
  }
  return wrapResult(k, currentId);
}

export function defeature(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shape: KernelShape,
  faces: KernelShape[]
): KernelShape {
  const vec = makeVecU32(Module, faces.map(unwrap));
  try {
    return wrapResult(k, k.defeature(unwrap(shape), vec, 1e-3));
  } finally {
    vec.delete();
  }
}

export function offsetWire2D(
  k: OcctKernelWasm,
  wire: KernelShape,
  offset: number,
  joinType?: number | 'arc' | 'intersection' | 'tangent'
): KernelShape {
  let jt = 0; // arc
  if (joinType === 'intersection' || joinType === 1) jt = 1;
  else if (joinType === 'tangent' || joinType === 2) jt = 2;
  else if (typeof joinType === 'number') jt = joinType;
  return wrapResult(k, k.offsetWire2D(unwrap(wire), offset, jt));
}

export function simplify(k: OcctKernelWasm, shape: KernelShape): KernelShape {
  return wrapResult(k, k.simplify(unwrap(shape)));
}

export function reverseShape(k: OcctKernelWasm, shape: KernelShape): KernelShape {
  return wrapResult(k, k.reverseShape(unwrap(shape)));
}
