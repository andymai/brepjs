/* v8 ignore file -- occt-wasm kernel not available in brepkit test suite */
/**
 * Boolean operations for the occt-wasm adapter.
 *
 * Mirrors the decomposition pattern used by `src/kernel/occt/booleanOps.ts`:
 * each method on the adapter is a thin delegate to a free function here.
 *
 * @module
 */

import type {
  BooleanOpType,
  BooleanOptions,
  CheckBooleanResult,
  KernelMeshResult,
  KernelShape,
} from '@/kernel/types.js';
import type { OcctKernelWasm, OcctWasmModule } from './occtWasmTypes.js';
import { makeVecU32, unwrap, wrapResult } from './helpers.js';

export function fuse(
  k: OcctKernelWasm,
  shape: KernelShape,
  tool: KernelShape,
  _options?: BooleanOptions
): KernelShape {
  return wrapResult(k, k.fuse(unwrap(shape), unwrap(tool)));
}

export function cut(
  k: OcctKernelWasm,
  shape: KernelShape,
  tool: KernelShape,
  _options?: BooleanOptions
): KernelShape {
  return wrapResult(k, k.cut(unwrap(shape), unwrap(tool)));
}

export function intersect(
  k: OcctKernelWasm,
  shape: KernelShape,
  tool: KernelShape,
  _options?: BooleanOptions
): KernelShape {
  return wrapResult(k, k.intersect(unwrap(shape), unwrap(tool)));
}

export function section(
  k: OcctKernelWasm,
  shape: KernelShape,
  plane: KernelShape,
  _approximation?: boolean
): KernelShape {
  return wrapResult(k, k.section(unwrap(shape), unwrap(plane)));
}

export function fuseAll(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shapes: KernelShape[],
  _options?: BooleanOptions
): KernelShape {
  const vec = makeVecU32(Module, shapes.map(unwrap));
  try {
    return wrapResult(k, k.fuseAll(vec));
  } finally {
    vec.delete();
  }
}

export function cutAll(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shape: KernelShape,
  tools: KernelShape[],
  _options?: BooleanOptions
): KernelShape {
  const vec = makeVecU32(Module, tools.map(unwrap));
  try {
    return wrapResult(k, k.cutAll(unwrap(shape), vec));
  } finally {
    vec.delete();
  }
}

export function split(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shape: KernelShape,
  tools: KernelShape[]
): KernelShape {
  const vec = makeVecU32(Module, tools.map(unwrap));
  try {
    return wrapResult(k, k.split(unwrap(shape), vec));
  } finally {
    vec.delete();
  }
}

export function checkBoolean(
  k: OcctKernelWasm,
  shape: KernelShape,
  tool: KernelShape,
  _op: BooleanOpType
): CheckBooleanResult {
  const issues: Array<{
    operand: 'base' | 'tool';
    issue: 'null-shape' | 'not-valid';
    message: string;
  }> = [];
  if (k.isNull(unwrap(shape))) {
    issues.push({ operand: 'base', issue: 'null-shape', message: 'Base shape is null' });
  }
  if (k.isNull(unwrap(tool))) {
    issues.push({ operand: 'tool', issue: 'null-shape', message: 'Tool shape is null' });
  }
  if (issues.length === 0 && !k.isValid(unwrap(shape))) {
    issues.push({ operand: 'base', issue: 'not-valid', message: 'Base shape is not valid' });
  }
  if (issues.length === 0 && !k.isValid(unwrap(tool))) {
    issues.push({ operand: 'tool', issue: 'not-valid', message: 'Tool shape is not valid' });
  }
  return { valid: issues.length === 0, issues };
}

export function meshBoolean(
  _positionsA: number[],
  _indicesA: number[],
  _positionsB: number[],
  _indicesB: number[],
  _op: string,
  _tolerance: number
): KernelMeshResult {
  throw new Error('occt-wasm: meshBoolean is not supported (use brepkit for mesh booleans)');
}
