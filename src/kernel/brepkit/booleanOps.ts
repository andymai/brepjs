/**
 * Boolean operations for the brepkit adapter.
 * @module
 */

import type { BrepkitKernel } from './brepkitWasmTypes.js';
import type {
  BooleanIssue,
  BooleanOpType,
  CheckBooleanResult,
  KernelShape,
  KernelMeshResult,
  BooleanOptions,
} from '@/kernel/types.js';
import type { KernelAdapter } from '@/kernel/interfaces/index.js';
import {
  type BrepkitHandle,
  solidHandle,
  wireHandle,
  compoundHandle,
  unwrap,
  unwrapSolidOrThrow,
  isBrepkitHandle,
  toArray,
  warnOnce,
  hasBooleanOptions,
  nextSyntheticId,
  syntheticCompounds,
} from './helpers.js';
import { extractPlaneFromFace } from './internalOps.js';
import { isValid as _isValid } from './repairOps.js';
import { wasmIndex } from '@/utils/vec3.js';

// brepkit throws when intersect/cut produces an empty result (disjoint inputs,
// cut-of-self, etc). The brepjs contract treats empty as a valid outcome —
// callers either get an empty compound (caught by castToShape3D as non-3D,
// returned as Err) or check is3D before measuring. Detect by error message
// since brepkit-wasm exposes only the message string at the JS boundary.
//
// Matches both the current `EmptyResult` variant (brepkit-wasm >= 2.88.1,
// "empty result: <reason>") and the legacy `InvalidInput` "produced empty
// result" message that older brepkit-wasm versions emitted.
export function isEmptyBooleanError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const msg = e.message;
  return (
    msg.startsWith('empty result:') ||
    msg.includes('produced empty result') ||
    msg.includes('produces empty result')
  );
}

function isEmptyCompound(bk: BrepkitKernel, h: BrepkitHandle): boolean {
  if (h.type !== 'compound') return false;
  return toArray(bk.getCompoundSolids(h.id)).length === 0;
}

function emptyCompound(bk: BrepkitKernel): KernelShape {
  return compoundHandle(bk.makeCompound([]));
}

export function fuse(
  bk: BrepkitKernel,
  shape: KernelShape,
  tool: KernelShape,
  _options?: BooleanOptions
): KernelShape {
  if (_options && hasBooleanOptions(_options)) {
    warnOnce(
      'boolean-options',
      'BooleanOptions (optimisation, simplify, strategy, fuzzyValue) not supported; ignored.'
    );
  }
  // Identity: fuse(∅, X) = X, fuse(X, ∅) = X.
  if (isEmptyCompound(bk, shape as BrepkitHandle)) return tool;
  if (isEmptyCompound(bk, tool as BrepkitHandle)) return shape;
  const baseId = unwrapSolidOrThrow(shape, 'fuse');
  const toolHandle = tool as BrepkitHandle;
  if (toolHandle.type === 'compound') {
    const toolSolidIds: number[] = toArray(bk.getCompoundSolids(toolHandle.id));
    let currentId = baseId;
    for (const toolSolidId of toolSolidIds) {
      currentId = bk.fuse(currentId, toolSolidId);
    }
    return solidHandle(currentId);
  }
  const result = bk.fuse(baseId, unwrapSolidOrThrow(tool, 'fuse'));
  return solidHandle(result);
}

export function cut(
  bk: BrepkitKernel,
  shape: KernelShape,
  tool: KernelShape,
  _options?: BooleanOptions
): KernelShape {
  if (_options && hasBooleanOptions(_options)) {
    warnOnce(
      'boolean-options',
      'BooleanOptions (optimisation, simplify, strategy, fuzzyValue) not supported; ignored.'
    );
  }
  // Identity: cut(∅, X) = ∅, cut(X, ∅) = X.
  if (isEmptyCompound(bk, shape as BrepkitHandle)) return emptyCompound(bk);
  if (isEmptyCompound(bk, tool as BrepkitHandle)) return shape;
  const baseId = unwrapSolidOrThrow(shape, 'cut');
  const toolHandle = tool as BrepkitHandle;
  if (toolHandle.type === 'compound') {
    const toolSolidIds: number[] = toArray(bk.getCompoundSolids(toolHandle.id));
    let currentId = baseId;
    for (const toolSolidId of toolSolidIds) {
      try {
        currentId = bk.cut(currentId, toolSolidId);
      } catch (e) {
        if (isEmptyBooleanError(e)) return emptyCompound(bk);
        throw e;
      }
    }
    return solidHandle(currentId);
  }
  try {
    const result = bk.cut(baseId, unwrapSolidOrThrow(tool, 'cut'));
    return solidHandle(result);
  } catch (e) {
    if (isEmptyBooleanError(e)) return emptyCompound(bk);
    throw e;
  }
}

export function intersect(
  bk: BrepkitKernel,
  shape: KernelShape,
  tool: KernelShape,
  _options?: BooleanOptions
): KernelShape {
  if (_options && hasBooleanOptions(_options)) {
    warnOnce(
      'boolean-options',
      'BooleanOptions (optimisation, simplify, strategy, fuzzyValue) not supported; ignored.'
    );
  }
  // Identity: intersect(∅, _) = ∅, intersect(_, ∅) = ∅.
  if (isEmptyCompound(bk, shape as BrepkitHandle) || isEmptyCompound(bk, tool as BrepkitHandle)) {
    return emptyCompound(bk);
  }
  try {
    const result = bk.intersect(
      unwrapSolidOrThrow(shape, 'intersect'),
      unwrapSolidOrThrow(tool, 'intersect')
    );
    return solidHandle(result);
  } catch (e) {
    if (isEmptyBooleanError(e)) return emptyCompound(bk);
    throw e;
  }
}

export function section(
  bk: BrepkitKernel,
  shape: KernelShape,
  plane: KernelShape,
  _approximation?: boolean
): KernelShape {
  const { point, normal } = extractPlaneFromFace(bk, plane);

  const solidId =
    isBrepkitHandle(shape) && shape.type === 'solid' ? shape.id : unwrap(shape, 'solid');

  const faceIds = toArray(
    bk.section(solidId, point[0], point[1], point[2], normal[0], normal[1], normal[2])
  );

  if (faceIds.length === 0) {
    return compoundHandle(bk.makeCompound([]));
  }

  const allWireHandles: BrepkitHandle[] = [];
  for (let i = 0; i < faceIds.length; i++) {
    const wireIds = toArray(bk.getFaceWires(wasmIndex(faceIds, i)));
    for (let j = 0; j < wireIds.length; j++) {
      allWireHandles.push(wireHandle(wasmIndex(wireIds, j)));
    }
  }
  const [firstWire] = allWireHandles;
  if (allWireHandles.length === 1 && firstWire !== undefined) {
    return firstWire;
  }
  const syntheticId = nextSyntheticId();
  syntheticCompounds.set(syntheticId, allWireHandles);
  return compoundHandle(syntheticId);
}

export function fuseAll(
  bk: BrepkitKernel,
  shapes: KernelShape[],
  options?: BooleanOptions
): KernelShape {
  if (shapes.length === 0) throw new Error('brepkit: fuseAll requires at least one shape');
  if (shapes.length === 1) return wasmIndex(shapes, 0);

  if (bk.compoundFuse) {
    const solidIds: number[] = [];
    for (const shape of shapes) {
      const h = shape as BrepkitHandle;
      if (h.type === 'compound') {
        solidIds.push(...toArray(bk.getCompoundSolids(h.id)));
      } else {
        solidIds.push(unwrapSolidOrThrow(shape, 'fuseAll'));
      }
    }
    if (solidIds.length === 0) {
      throw new Error('brepkit: fuseAll resolved to zero solid IDs');
    }
    const result = bk.compoundFuse(new Uint32Array(solidIds));
    return solidHandle(result);
  }

  let current = [...shapes];
  while (current.length > 1) {
    const next: KernelShape[] = [];
    for (let i = 0; i < current.length; i += 2) {
      if (i + 1 < current.length) {
        next.push(fuse(bk, current[i], current[i + 1], options));
      } else {
        next.push(current[i]);
      }
    }
    current = next;
  }
  return wasmIndex(current, 0);
}

export function cutAll(
  bk: BrepkitKernel,
  shape: KernelShape,
  tools: KernelShape[],
  options?: BooleanOptions
): KernelShape {
  if (tools.length === 0) return shape;
  if (tools.length === 1) return cut(bk, shape, tools[0], options);

  const baseId = unwrapSolidOrThrow(shape, 'cutAll');
  const toolIds: number[] = [];
  for (const tool of tools) {
    const h = tool as BrepkitHandle;
    if (h.type === 'compound') {
      toolIds.push(...toArray(bk.getCompoundSolids(h.id)));
    } else {
      toolIds.push(unwrapSolidOrThrow(tool, 'cutAll'));
    }
  }
  if (toolIds.length === 0) return shape;

  const result = bk.compoundCut(baseId, new Uint32Array(toolIds));
  return solidHandle(result);
}

export function split(bk: BrepkitKernel, shape: KernelShape, tools: KernelShape[]): KernelShape {
  if (tools.length === 0) throw new Error('brepkit: split requires at least one tool');
  const { point, normal } = extractPlaneFromFace(bk, tools[0]);

  const result = toArray(
    bk.split(unwrap(shape, 'solid'), point[0], point[1], point[2], normal[0], normal[1], normal[2])
  );
  return compoundHandle(bk.makeCompound(result));
}

export function meshBoolean(
  bk: BrepkitKernel,
  positionsA: number[],
  indicesA: number[],
  positionsB: number[],
  indicesB: number[],
  op: string,
  tolerance: number
): KernelMeshResult {
  const mesh = bk.meshBoolean(positionsA, indicesA, positionsB, indicesB, op, tolerance);
  return {
    vertices: new Float32Array(mesh.positions),
    normals: new Float32Array(mesh.normals),
    triangles: new Uint32Array(mesh.indices),
    uvs: new Float32Array(0),
    faceGroups: [{ start: 0, count: mesh.indices.length, faceHash: 0 }],
  };
}

/**
 * Pre-validate operands before a boolean operation.
 *
 * Checks that both shapes are non-null and topologically valid.
 */
export function checkBoolean(
  _bk: BrepkitKernel,
  shape: KernelShape,
  tool: KernelShape,
  // op is accepted for future use (e.g., operation-specific validation)
  // but currently all boolean operations share the same pre-validation checks
  _op: BooleanOpType,
  isValid: (s: KernelShape) => boolean
): CheckBooleanResult {
  const issues: BooleanIssue[] = [];
  if (!isBrepkitHandle(shape) || shape.IsNull()) {
    issues.push({ operand: 'base', issue: 'null-shape', message: 'Base shape is null' });
  }
  if (!isBrepkitHandle(tool) || tool.IsNull()) {
    issues.push({ operand: 'tool', issue: 'null-shape', message: 'Tool shape is null' });
  }
  if (issues.length > 0) return { valid: false, issues };
  if (!isValid(shape)) {
    issues.push({
      operand: 'base',
      issue: 'not-valid',
      message: 'Base shape fails BRepCheck validation. Try autoHeal() first.',
    });
  }
  if (!isValid(tool)) {
    issues.push({
      operand: 'tool',
      issue: 'not-valid',
      message: 'Tool shape fails BRepCheck validation. Try autoHeal() first.',
    });
  }
  return { valid: issues.length === 0, issues };
}

// Re-export for use by hull that needs iterShapes
export { iterShapes as _iterShapes } from './topologyOps.js';

export function hull(bk: BrepkitKernel, shapes: KernelShape[], _tolerance: number): KernelShape {
  const coords: number[] = [];
  for (const shape of shapes) {
    const h = shape as BrepkitHandle;
    if (h.type === 'solid') {
      const vertIds = toArray(bk.getSolidVertices(h.id));
      for (const vid of vertIds) {
        const pos = bk.getVertexPosition(vid);
        coords.push(wasmIndex(pos, 0), wasmIndex(pos, 1), wasmIndex(pos, 2));
      }
    } else if (h.type === 'vertex') {
      const pos = bk.getVertexPosition(h.id);
      coords.push(wasmIndex(pos, 0), wasmIndex(pos, 1), wasmIndex(pos, 2));
    }
  }
  if (coords.length < 12) throw new Error('brepkit: hull requires enough points');
  const id = bk.convexHull(coords);
  return solidHandle(id);
}

export function hullFromPoints(
  bk: BrepkitKernel,
  points: Array<{ x: number; y: number; z: number }>,
  _tolerance: number
): KernelShape {
  if (points.length < 4) throw new Error('brepkit: hull needs at least 4 points');
  const coords: number[] = [];
  for (const p of points) {
    coords.push(p.x, p.y, p.z);
  }
  const id = bk.convexHull(coords);
  return solidHandle(id);
}

export function buildSolidFromFaces(
  bk: BrepkitKernel,
  points: Array<{ x: number; y: number; z: number }>,
  faces: Array<readonly [number, number, number]>,
  _tolerance: number
): KernelShape {
  const positions = new Float64Array(points.length * 3);
  for (let i = 0; i < points.length; i++) {
    const p = wasmIndex(points, i);
    positions[i * 3] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;
  }
  const indices = new Uint32Array(faces.length * 3);
  for (let i = 0; i < faces.length; i++) {
    const f = wasmIndex(faces, i);
    indices[i * 3] = f[0];
    indices[i * 3 + 1] = f[1];
    indices[i * 3 + 2] = f[2];
  }
  const id = bk.importIndexedMesh(positions, indices);
  return solidHandle(id);
}

/** Co-located factory: returns the boolean+hull slice of {@link KernelAdapter} bound to `bk`. */
export function makeBooleanOps(bk: BrepkitKernel) {
  return {
    fuse: (shape, tool, options) => fuse(bk, shape, tool, options),
    cut: (shape, tool, options) => cut(bk, shape, tool, options),
    intersect: (shape, tool, options) => intersect(bk, shape, tool, options),
    section: (shape, plane, approximation) => section(bk, shape, plane, approximation),
    fuseAll: (shapes, options) => fuseAll(bk, shapes, options),
    cutAll: (shape, tools, options) => cutAll(bk, shape, tools, options),
    split: (shape, tools) => split(bk, shape, tools),
    meshBoolean: (positionsA, indicesA, positionsB, indicesB, op, tolerance) =>
      meshBoolean(bk, positionsA, indicesA, positionsB, indicesB, op, tolerance),
    checkBoolean: (shape, tool, op) => checkBoolean(bk, shape, tool, op, (s) => _isValid(bk, s)),
    hull: (shapes, tolerance) => hull(bk, shapes, tolerance),
    hullFromPoints: (points, tolerance) => hullFromPoints(bk, points, tolerance),
    buildSolidFromFaces: (points, faces, tolerance) =>
      buildSolidFromFaces(bk, points, faces, tolerance),
  } satisfies Pick<
    KernelAdapter,
    | 'fuse'
    | 'cut'
    | 'intersect'
    | 'section'
    | 'fuseAll'
    | 'cutAll'
    | 'split'
    | 'meshBoolean'
    | 'checkBoolean'
    | 'hull'
    | 'hullFromPoints'
    | 'buildSolidFromFaces'
  >;
}
