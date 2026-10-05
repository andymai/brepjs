/**
 * Evolution operations (shape history tracking) for the occt-wasm adapter.
 *
 * The C++ facade returns EmEvolutionData with flat vectors of input/output
 * hash pairs; `parseEvolution` decodes them into `ShapeEvolution` maps.
 *
 * @module
 */

import type {
  BooleanOptions,
  DiagnosticOperationResult,
  KernelShape,
  KernelType,
  OperationResult,
  ShapeEvolution,
} from '@/kernel/types.js';
import type { OcctKernelWasm, OcctWasmModule } from './occtWasmTypes.js';
import {
  makeVecInt,
  makeVecU32,
  parseEvolution,
  resolveUniformRadius,
  unwrap,
  wrapResult,
} from './helpers.js';
import {
  hasBooleanOp,
  needsBooleanOptions,
  resolveBooleanTool,
  runBooleanOp,
  withSolidIds,
  withToolIds,
} from './booleanOps.js';
import type { ResolvedTool } from './booleanOps.js';

/**
 * Parse an EvolutionData result from the WASM kernel into a ShapeEvolution.
 * The C++ facade returns flat vectors of [inputHash, count, out1, out2, ..., inputHash, count, ...].
 */
// ─── Transform-with-history ─────────────────────────────────────────────────

export function translateWithHistory(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shape: KernelShape,
  x: number,
  y: number,
  z: number,
  inputFaceHashes: number[],
  hashUpperBound: number
): OperationResult {
  const hashVec = makeVecInt(Module, inputFaceHashes);
  try {
    const evo = k.translateWithHistory(unwrap(shape), x, y, z, hashVec, hashUpperBound);
    const { id, evolution } = parseEvolution(evo);
    return { shape: wrapResult(k, id), evolution };
  } finally {
    hashVec.delete();
  }
}

export function rotateWithHistory(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shape: KernelShape,
  angle: number,
  inputFaceHashes: number[],
  hashUpperBound: number,
  axis?: readonly [number, number, number],
  center?: readonly [number, number, number]
): OperationResult {
  const ax = axis ?? [0, 0, 1];
  const cn = center ?? [0, 0, 0];
  const hashVec = makeVecInt(Module, inputFaceHashes);
  try {
    const evo = k.rotateWithHistory(
      unwrap(shape),
      cn[0],
      cn[1],
      cn[2],
      ax[0],
      ax[1],
      ax[2],
      angle,
      hashVec,
      hashUpperBound
    );
    const { id, evolution } = parseEvolution(evo);
    return { shape: wrapResult(k, id), evolution };
  } finally {
    hashVec.delete();
  }
}

export function mirrorWithHistory(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shape: KernelShape,
  origin: readonly [number, number, number],
  normal: readonly [number, number, number],
  inputFaceHashes: number[],
  hashUpperBound: number
): OperationResult {
  const hashVec = makeVecInt(Module, inputFaceHashes);
  try {
    const evo = k.mirrorWithHistory(
      unwrap(shape),
      origin[0],
      origin[1],
      origin[2],
      normal[0],
      normal[1],
      normal[2],
      hashVec,
      hashUpperBound
    );
    const { id, evolution } = parseEvolution(evo);
    return { shape: wrapResult(k, id), evolution };
  } finally {
    hashVec.delete();
  }
}

export function scaleWithHistory(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shape: KernelShape,
  center: readonly [number, number, number],
  factor: number,
  inputFaceHashes: number[],
  hashUpperBound: number
): OperationResult {
  const hashVec = makeVecInt(Module, inputFaceHashes);
  try {
    const evo = k.scaleWithHistory(
      unwrap(shape),
      center[0],
      center[1],
      center[2],
      factor,
      hashVec,
      hashUpperBound
    );
    const { id, evolution } = parseEvolution(evo);
    return { shape: wrapResult(k, id), evolution };
  } finally {
    hashVec.delete();
  }
}

export function generalTransformWithHistory(
  generalTransformFn: (
    shape: KernelShape,
    linear: readonly [number, number, number, number, number, number, number, number, number],
    translation: readonly [number, number, number],
    isOrthogonal: boolean
  ) => KernelShape,
  shape: KernelShape,
  linear: readonly [number, number, number, number, number, number, number, number, number],
  translation: readonly [number, number, number],
  isOrthogonal: boolean,
  inputFaceHashes: number[]
): OperationResult {
  // No C++ WithHistory for generalTransform — fall back + synthesize identity evolution.
  const result = generalTransformFn(shape, linear, translation, isOrthogonal);
  const modified = new Map<number, number[]>();
  for (const h of inputFaceHashes) modified.set(h, [h]);
  return {
    shape: result,
    evolution: { modified, generated: new Map(), deleted: new Set() },
  };
}

// ─── Boolean-with-history ───────────────────────────────────────────────────

const NO_DIAGNOSTICS = { hasErrors: false, hasWarnings: false, messages: [] };

function viaBooleanOp(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  kind: 'fuse' | 'cut' | 'common',
  argIds: number[],
  toolIds: number[],
  inputFaceHashes: number[],
  hashUpperBound: number,
  options?: BooleanOptions
): DiagnosticOperationResult {
  const { id, evolution } = runBooleanOp(
    k,
    Module,
    kind,
    argIds,
    toolIds,
    options,
    inputFaceHashes,
    hashUpperBound
  );
  return { shape: wrapResult(k, id), evolution, diagnostics: NO_DIAGNOSTICS };
}

export function fuseWithHistory(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shape: KernelShape,
  tool: KernelShape,
  inputFaceHashes: number[],
  hashUpperBound: number,
  options?: BooleanOptions
): DiagnosticOperationResult {
  if (hasBooleanOp(k) && needsBooleanOptions(options)) {
    const ids = [unwrap(shape)];
    return viaBooleanOp(
      k,
      Module,
      'fuse',
      ids,
      [unwrap(tool)],
      inputFaceHashes,
      hashUpperBound,
      options
    );
  }
  const hashVec = makeVecInt(Module, inputFaceHashes);
  try {
    const evo = k.fuseWithHistory(unwrap(shape), unwrap(tool), hashVec, hashUpperBound);
    const { id, evolution } = parseEvolution(evo);
    return { shape: wrapResult(k, id), evolution, diagnostics: NO_DIAGNOSTICS };
  } finally {
    hashVec.delete();
  }
}

function subtractOrCommonWithHistory(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  kind: 'cut' | 'common',
  shape: KernelShape,
  tool: KernelShape,
  inputFaceHashes: number[],
  hashUpperBound: number,
  options?: BooleanOptions
): DiagnosticOperationResult {
  if (hasBooleanOp(k)) {
    const result = withToolIds(k, tool, (toolIds, multiSolid) =>
      multiSolid || needsBooleanOptions(options)
        ? viaBooleanOp(
            k,
            Module,
            kind,
            [unwrap(shape)],
            toolIds,
            inputFaceHashes,
            hashUpperBound,
            options
          )
        : null
    );
    if (result) return result;
  }
  const hashVec = makeVecInt(Module, inputFaceHashes);
  let resolved: ResolvedTool | undefined;
  try {
    resolved = resolveBooleanTool(k, tool);
    const evo =
      kind === 'cut'
        ? k.cutWithHistory(unwrap(shape), resolved.id, hashVec, hashUpperBound)
        : k.intersectWithHistory(unwrap(shape), resolved.id, hashVec, hashUpperBound);
    const { id, evolution } = parseEvolution(evo);
    return { shape: wrapResult(k, id), evolution, diagnostics: NO_DIAGNOSTICS };
  } finally {
    hashVec.delete();
    resolved?.dispose();
  }
}

export function cutWithHistory(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shape: KernelShape,
  tool: KernelShape,
  inputFaceHashes: number[],
  hashUpperBound: number,
  options?: BooleanOptions
): DiagnosticOperationResult {
  return subtractOrCommonWithHistory(
    k,
    Module,
    'cut',
    shape,
    tool,
    inputFaceHashes,
    hashUpperBound,
    options
  );
}

export function intersectWithHistory(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shape: KernelShape,
  tool: KernelShape,
  inputFaceHashes: number[],
  hashUpperBound: number,
  options?: BooleanOptions
): DiagnosticOperationResult {
  return subtractOrCommonWithHistory(
    k,
    Module,
    'common',
    shape,
    tool,
    inputFaceHashes,
    hashUpperBound,
    options
  );
}

/**
 * History for a result that is its input re-stored: `fuseAll` of one solid and
 * `cutAll` with no tools keep the same TShape, so every face keeps its hash.
 */
function identityEvolution(inputFaceHashes: number[]): ShapeEvolution {
  const modified = new Map<number, number[]>();
  for (const h of inputFaceHashes) modified.set(h, [h]);
  return { modified, generated: new Map(), deleted: new Set() };
}

/** N-way fuse with face history over every input. Needs `booleanOp`. */
export function fuseAllWithHistory(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shapes: KernelShape[],
  inputFaceHashes: number[],
  hashUpperBound: number,
  options?: BooleanOptions
): DiagnosticOperationResult {
  return withSolidIds(k, shapes, (ids) => {
    const [first, ...rest] = ids;
    if (first !== undefined && rest.length > 0) {
      return viaBooleanOp(
        k,
        Module,
        'fuse',
        [first],
        rest,
        inputFaceHashes,
        hashUpperBound,
        options
      );
    }
    const vec = makeVecU32(Module, ids);
    try {
      return {
        shape: wrapResult(k, k.fuseAll(vec)),
        evolution: identityEvolution(inputFaceHashes),
        diagnostics: NO_DIAGNOSTICS,
      };
    } finally {
      vec.delete();
    }
  });
}

/** N-way cut with face history over the base and every tool. Needs `booleanOp`. */
export function cutAllWithHistory(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shape: KernelShape,
  tools: KernelShape[],
  inputFaceHashes: number[],
  hashUpperBound: number,
  options?: BooleanOptions
): DiagnosticOperationResult {
  if (tools.length === 0) {
    const vec = makeVecU32(Module, []);
    try {
      return {
        shape: wrapResult(k, k.cutAll(unwrap(shape), vec)),
        evolution: identityEvolution(inputFaceHashes),
        diagnostics: NO_DIAGNOSTICS,
      };
    } finally {
      vec.delete();
    }
  }
  return withSolidIds(k, [shape], (argIds) =>
    withSolidIds(k, tools, (toolIds) =>
      viaBooleanOp(k, Module, 'cut', argIds, toolIds, inputFaceHashes, hashUpperBound, options)
    )
  );
}

// ─── Modifier-with-history ──────────────────────────────────────────────────

export function filletWithHistory(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shape: KernelShape,
  edges: KernelShape[],
  radius: number | [number, number] | ((edge: KernelShape) => number | [number, number]),
  inputFaceHashes: number[],
  hashUpperBound: number
): OperationResult {
  const r = resolveUniformRadius(edges, radius);
  const edgeVec = makeVecU32(Module, edges.map(unwrap));
  const hashVec = makeVecInt(Module, inputFaceHashes);
  try {
    const evo = k.filletWithHistory(unwrap(shape), edgeVec, r, hashVec, hashUpperBound);
    const { id, evolution } = parseEvolution(evo);
    return { shape: wrapResult(k, id), evolution };
  } finally {
    edgeVec.delete();
    hashVec.delete();
  }
}

export function chamferWithHistory(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shape: KernelShape,
  edges: KernelShape[],
  distance: number | [number, number] | ((edge: KernelShape) => number | [number, number]),
  inputFaceHashes: number[],
  hashUpperBound: number
): OperationResult {
  const d = resolveUniformRadius(edges, distance);
  const edgeVec = makeVecU32(Module, edges.map(unwrap));
  const hashVec = makeVecInt(Module, inputFaceHashes);
  try {
    const evo = k.chamferWithHistory(unwrap(shape), edgeVec, d, hashVec, hashUpperBound);
    const { id, evolution } = parseEvolution(evo);
    return { shape: wrapResult(k, id), evolution };
  } finally {
    edgeVec.delete();
    hashVec.delete();
  }
}

export function shellWithHistory(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shape: KernelShape,
  faces: KernelShape[],
  thickness: number,
  inputFaceHashes: number[],
  hashUpperBound: number,
  tolerance?: number
): OperationResult {
  const faceVec = makeVecU32(Module, faces.map(unwrap));
  const hashVec = makeVecInt(Module, inputFaceHashes);
  try {
    const evo = k.shellWithHistory(
      unwrap(shape),
      faceVec,
      thickness,
      tolerance ?? 1e-3,
      hashVec,
      hashUpperBound
    );
    const { id, evolution } = parseEvolution(evo);
    return { shape: wrapResult(k, id), evolution };
  } finally {
    faceVec.delete();
    hashVec.delete();
  }
}

export function thickenWithHistory(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shape: KernelShape,
  thickness: number,
  inputFaceHashes: number[],
  hashUpperBound: number
): OperationResult {
  const hashVec = makeVecInt(Module, inputFaceHashes);
  try {
    const evo = k.thickenWithHistory(unwrap(shape), thickness, 1e-3, hashVec, hashUpperBound);
    const { id, evolution } = parseEvolution(evo);
    return { shape: wrapResult(k, id), evolution };
  } finally {
    hashVec.delete();
  }
}

export function offsetWithHistory(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shape: KernelShape,
  distance: number,
  inputFaceHashes: number[],
  hashUpperBound: number,
  tolerance?: number
): OperationResult {
  const hashVec = makeVecInt(Module, inputFaceHashes);
  try {
    const evo = k.offsetWithHistory(
      unwrap(shape),
      distance,
      tolerance ?? 1e-6,
      hashVec,
      hashUpperBound
    );
    const { id, evolution } = parseEvolution(evo);
    return { shape: wrapResult(k, id), evolution };
  } finally {
    hashVec.delete();
  }
}

export function draftWithHistory(
  k: OcctKernelWasm,
  shape: KernelShape,
  faces: KernelShape[],
  pullDirection: [number, number, number],
  angleDeg: number | ((face: KernelShape) => number)
): OperationResult {
  // Apply draft to each face sequentially (no evolution tracking on this path).
  const [dx, dy, dz] = pullDirection;
  let currentId = unwrap(shape);
  for (const face of faces) {
    const angle = typeof angleDeg === 'number' ? angleDeg : angleDeg(face);
    const angleRad = (angle * Math.PI) / 180;
    currentId = k.draft(currentId, unwrap(face), angleRad, dx, dy, dz);
  }
  return {
    shape: wrapResult(k, currentId),
    evolution: { modified: new Map(), generated: new Map(), deleted: new Set() },
  };
}

// ─── Composed-transform-with-history ────────────────────────────────────────

export function applyComposedTransformWithHistory(
  transformFn: (shape: KernelShape, trsf: KernelType) => KernelShape,
  iterShapesFn: (shape: KernelShape, type: 'face') => KernelShape[],
  hashCodeFn: (shape: KernelShape, upperBound: number) => number,
  shape: KernelShape,
  transformHandle: KernelType,
  inputFaceHashes: number[],
  hashUpperBound: number
): OperationResult {
  const result = transformFn(shape, transformHandle);

  // Synthesize per-face evolution by pairing input/output by iteration index.
  // Affine transforms preserve topology; iterShapes(..., 'face') is order-stable.
  const outFaces = iterShapesFn(result, 'face');
  const modified = new Map<number, number[]>();
  const limit = Math.min(inputFaceHashes.length, outFaces.length);
  for (let i = 0; i < limit; i++) {
    const outFace = outFaces[i];
    const inHash = inputFaceHashes[i];
    if (outFace !== undefined && inHash !== undefined) {
      modified.set(inHash, [hashCodeFn(outFace, hashUpperBound)]);
    }
  }
  return {
    shape: result,
    evolution: { modified, generated: new Map(), deleted: new Set() },
  };
}
