/* eslint-disable @typescript-eslint/no-non-null-assertion -- WASM arrays have known-valid indices */
/**
 * Boolean operations for the brepkit adapter.
 * @module
 */

import type { BrepkitKernel } from '../brepkitWasmTypes.js';
import type { KernelShape, KernelMeshResult, BooleanOptions } from '../types.js';
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
} from './helpers.js';
import { extractPlaneFromFace } from './internalOps.js';

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
  const baseId = unwrapSolidOrThrow(shape, 'cut');
  const toolHandle = tool as BrepkitHandle;
  if (toolHandle.type === 'compound') {
    const toolSolidIds: number[] = toArray(bk.getCompoundSolids(toolHandle.id));
    let currentId = baseId;
    for (const toolSolidId of toolSolidIds) {
      currentId = bk.cut(currentId, toolSolidId);
    }
    return solidHandle(currentId);
  }
  const result = bk.cut(baseId, unwrapSolidOrThrow(tool, 'cut'));
  return solidHandle(result);
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
  const result = bk.intersect(
    unwrapSolidOrThrow(shape, 'intersect'),
    unwrapSolidOrThrow(tool, 'intersect')
  );
  return solidHandle(result);
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

  const firstWireId = bk.getFaceOuterWire(faceIds[0]!);
  return wireHandle(firstWireId);
}

export function fuseAll(
  bk: BrepkitKernel,
  shapes: KernelShape[],
  options?: BooleanOptions
): KernelShape {
  if (shapes.length === 0) throw new Error('brepkit: fuseAll requires at least one shape');
  if (shapes.length === 1) return shapes[0]!;

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
  return current[0]!;
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
        coords.push(pos[0]!, pos[1]!, pos[2]!);
      }
    } else if (h.type === 'vertex') {
      const pos = bk.getVertexPosition(h.id);
      coords.push(pos[0]!, pos[1]!, pos[2]!);
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
    const p = points[i]!;
    positions[i * 3] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;
  }
  const indices = new Uint32Array(faces.length * 3);
  for (let i = 0; i < faces.length; i++) {
    const f = faces[i]!;
    indices[i * 3] = f[0];
    indices[i * 3 + 1] = f[1];
    indices[i * 3 + 2] = f[2];
  }
  const id = bk.importIndexedMesh(positions, indices);
  return solidHandle(id);
}
