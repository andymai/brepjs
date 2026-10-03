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
import type {
  EmBBoxData,
  EmVectorInt,
  EmVectorUint32,
  OcctKernelWasm,
  OcctWasmModule,
} from './occtWasmTypes.js';
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
  let args: EmVectorUint32 | undefined;
  let tools: EmVectorUint32 | undefined;
  let hashes: EmVectorInt | undefined;
  try {
    args = makeVecU32(Module, argIds);
    tools = makeVecU32(Module, toolIds);
    hashes = makeVecInt(Module, inputFaceHashes);
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
    args?.delete();
    tools?.delete();
    hashes?.delete();
  }
}

/**
 * Call `fn` with a tool's solids as separate ids, or with the tool alone when
 * it holds at most one solid, and report whether it holds several. Solids are
 * handed to an n-way boolean as separate tools, which OCCT allows to overlap,
 * where one compound of overlapping solids is invalid input. A tool whose
 * solids have pairwise disjoint bounding boxes stays whole: its solids cannot
 * interfere, and OCCT runs it faster as one operand than as several.
 */
export function withToolIds<R>(
  k: OcctKernelWasm,
  tool: KernelShape,
  fn: (ids: number[], multiSolid: boolean) => R
): R {
  return withSolidIds(k, [tool], fn);
}

/**
 * {@link withToolIds} over several shapes: each multi-solid shape contributes
 * its solids, every other shape its own id, in order. `multiSolid` reports
 * whether any shape holds more than one solid, split or not.
 */
export function withSolidIds<R>(
  k: OcctKernelWasm,
  shapes: readonly KernelShape[],
  fn: (ids: number[], multiSolid: boolean) => R
): R {
  const ids: number[] = [];
  const extracted: number[] = [];
  try {
    let multiSolid = false;
    for (const shape of shapes) {
      if (pushSolidIds(k, unwrap(shape), ids, extracted)) multiSolid = true;
    }
    return fn(ids, multiSolid);
  } finally {
    for (const id of extracted) k.release(id);
  }
}

/**
 * Append `id`'s solids to `ids`, or `id` itself when it holds at most one or
 * its solids cannot interfere, and report whether it holds several. Every
 * solid copy the query allocated goes on `extracted` for release.
 */
function pushSolidIds(k: OcctKernelWasm, id: number, ids: number[], extracted: number[]): boolean {
  const solids = k.getSubShapes(id, 'solid');
  try {
    const solidIds: number[] = [];
    for (let i = 0; i < solids.size(); i++) {
      const solidId = solids.get(i);
      if (solidId !== id) extracted.push(solidId);
      solidIds.push(solidId);
    }
    if (solidIds.length > 1 && !boundsPairwiseDisjoint(k, solidIds)) ids.push(...solidIds);
    else ids.push(id);
    return solidIds.length > 1;
  } finally {
    solids.delete();
  }
}

function boundsPairwiseDisjoint(k: OcctKernelWasm, solidIds: readonly number[]): boolean {
  const boxes = solidIds.map((s) => k.getBoundingBox(s, false));
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i] as EmBBoxData;
    for (let j = i + 1; j < boxes.length; j++) {
      const b = boxes[j] as EmBBoxData;
      if (
        a.xmin <= b.xmax &&
        b.xmin <= a.xmax &&
        a.ymin <= b.ymax &&
        b.ymin <= a.ymax &&
        a.zmin <= b.zmax &&
        b.zmin <= a.zmax
      ) {
        return false;
      }
    }
  }
  return true;
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
    const id = withToolIds(k, tool, (toolIds, multiSolid) =>
      multiSolid || needsBooleanOptions(options)
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
  if (shapes.length > 1 && hasBooleanOp(k) && needsBooleanOptions(options)) {
    return withSolidIds(k, shapes, ([first, ...rest]) =>
      wrapResult(
        k,
        runBooleanOp(k, Module, 'fuse', first === undefined ? [] : [first], rest, options).id
      )
    );
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
    return withSolidIds(k, [shape], (argIds) =>
      withSolidIds(k, tools, (toolIds) =>
        wrapResult(k, runBooleanOp(k, Module, 'cut', argIds, toolIds, options).id)
      )
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
