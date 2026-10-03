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
  ShapeEvolution,
} from '@/kernel/types.js';
import type { OcctKernelWasm, OcctWasmModule } from './occtWasmTypes.js';
import { makeVecInt, makeVecU32, parseEvolution, unwrap, wrapResult } from './helpers.js';

const BOOLEAN_OP_CODE = { fuse: 0, cut: 1, common: 2 } as const;
type BooleanKind = keyof typeof BOOLEAN_OP_CODE;

/** Same angular tolerance the opencascade.js adapter hands SimplifyResult. */
const SIMPLIFY_ANGULAR_TOLERANCE = 1e-3;

/** Whether this occt-wasm build has the general `booleanOp`. */
export function hasBooleanOp(k: OcctKernelWasm): boolean {
  return typeof k.booleanOp === 'function';
}

/** Whether `options` asks for anything only `booleanOp` can honor. */
export function needsBooleanOptions(options?: BooleanOptions): boolean {
  if (!options) return false;
  return (
    (options.optimisation !== undefined && options.optimisation !== 'none') ||
    (options.fuzzyValue ?? 0) > 0 ||
    options.simplify === true
  );
}

function glueCode(optimisation: BooleanOptions['optimisation']): number {
  if (optimisation === 'commonFace') return 1;
  if (optimisation === 'sameFace') return 2;
  return 0;
}

/**
 * Run `booleanOp` on raw shape ids, collecting face history when hashes are
 * given. The caller owns the returned id.
 */
export function runBooleanOp(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  kind: BooleanKind,
  argIds: number[],
  toolIds: number[],
  options: BooleanOptions = {},
  inputFaceHashes: number[] = [],
  hashUpperBound = 0
): { id: number; evolution: ShapeEvolution } {
  if (!k.booleanOp) throw new Error('occt-wasm: booleanOp is not available in this build');
  const args = makeVecU32(Module, argIds);
  const tools = makeVecU32(Module, toolIds);
  const hashes = makeVecInt(Module, inputFaceHashes);
  try {
    return parseEvolution(
      k.booleanOp(
        BOOLEAN_OP_CODE[kind],
        args,
        tools,
        glueCode(options.optimisation),
        options.fuzzyValue ?? 0,
        options.simplify === true ? SIMPLIFY_ANGULAR_TOLERANCE : 0,
        hashes,
        hashUpperBound
      )
    );
  } finally {
    args.delete();
    tools.delete();
    hashes.delete();
  }
}

/**
 * Call `fn` with a tool's solids as separate ids, or with the tool alone when
 * it holds at most one solid, and report whether it was split. Solids are
 * handed to an n-way boolean as separate tools, which OCCT allows to overlap,
 * where one compound of overlapping solids is invalid input.
 */
export function withToolIds<R>(
  k: OcctKernelWasm,
  tool: KernelShape,
  fn: (ids: number[], split: boolean) => R
): R {
  const toolId = unwrap(tool);
  const solids = k.getSubShapes(toolId, 'solid');
  try {
    const n = solids.size();
    if (n <= 1) return fn([toolId], false);
    const ids: number[] = [];
    for (let i = 0; i < n; i++) ids.push(solids.get(i));
    return fn(ids, true);
  } finally {
    for (let i = 0, n = solids.size(); i < n; i++) {
      const id = solids.get(i);
      if (id !== toolId) k.release(id);
    }
    solids.delete();
  }
}

/**
 * The resolved tool id plus a `dispose` that releases any temporary the
 * resolution allocated. Callers must call `dispose()` after the boolean.
 */
export interface ResolvedTool {
  id: number;
  dispose: () => void;
}

/**
 * Normalize a boolean tool to a single fused solid when it is a compound of
 * multiple solids (e.g. engraved text — one solid per glyph). occt-wasm's
 * boolean returns an empty result for such compound tools where opencascade
 * tolerated them; fusing the solids first yields a usable single tool.
 * Single-solid (or non-solid) tools pass through untouched.
 */
export function resolveBooleanTool(k: OcctKernelWasm, tool: KernelShape): ResolvedTool {
  const toolId = unwrap(tool);
  const solids = k.getSubShapes(toolId, 'solid');
  try {
    if (solids.size() > 1) {
      // Multi-solid tool: the fused result is a fresh arena slot the caller
      // must release once the boolean has consumed it.
      const fusedId = k.fuseAll(solids);
      return {
        id: fusedId,
        dispose: () => {
          k.release(fusedId);
        },
      };
    }
    return { id: toolId, dispose: () => {} };
  } finally {
    // getSubShapes copies each sub-solid into its own arena slot; the vector
    // delete frees only the container, so release the queried copies too.
    // Guard against releasing the tool itself in case a query ever aliases it.
    for (let i = 0, n = solids.size(); i < n; i++) {
      const id = solids.get(i);
      if (id !== toolId) k.release(id);
    }
    solids.delete();
  }
}

export function fuse(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shape: KernelShape,
  tool: KernelShape,
  options?: BooleanOptions
): KernelShape {
  if (hasBooleanOp(k) && needsBooleanOptions(options)) {
    return wrapResult(
      k,
      runBooleanOp(k, Module, 'fuse', [unwrap(shape)], [unwrap(tool)], options).id
    );
  }
  return wrapResult(k, k.fuse(unwrap(shape), unwrap(tool)));
}

function subtractOrCommon(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  kind: 'cut' | 'common',
  shape: KernelShape,
  tool: KernelShape,
  options?: BooleanOptions
): KernelShape {
  if (hasBooleanOp(k)) {
    const id = withToolIds(k, tool, (toolIds, split) =>
      split || needsBooleanOptions(options)
        ? runBooleanOp(k, Module, kind, [unwrap(shape)], toolIds, options).id
        : null
    );
    if (id !== null) return wrapResult(k, id);
  }
  const resolved = resolveBooleanTool(k, tool);
  try {
    const id =
      kind === 'cut' ? k.cut(unwrap(shape), resolved.id) : k.intersect(unwrap(shape), resolved.id);
    return wrapResult(k, id);
  } finally {
    resolved.dispose();
  }
}

export function cut(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shape: KernelShape,
  tool: KernelShape,
  options?: BooleanOptions
): KernelShape {
  return subtractOrCommon(k, Module, 'cut', shape, tool, options);
}

export function intersect(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shape: KernelShape,
  tool: KernelShape,
  options?: BooleanOptions
): KernelShape {
  return subtractOrCommon(k, Module, 'common', shape, tool, options);
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
  options?: BooleanOptions
): KernelShape {
  const [first, ...rest] = shapes.map(unwrap);
  if (first !== undefined && rest.length > 0 && hasBooleanOp(k) && needsBooleanOptions(options)) {
    return wrapResult(k, runBooleanOp(k, Module, 'fuse', [first], rest, options).id);
  }
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
  options?: BooleanOptions
): KernelShape {
  if (tools.length > 0 && hasBooleanOp(k) && needsBooleanOptions(options)) {
    return wrapResult(
      k,
      runBooleanOp(k, Module, 'cut', [unwrap(shape)], tools.map(unwrap), options).id
    );
  }
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
