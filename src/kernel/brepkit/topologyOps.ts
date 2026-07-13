/**
 * Topology introspection operations for the brepkit adapter.
 * @module
 */

import type { BrepkitKernel } from './brepkitWasmTypes.js';
import type { KernelShape, ShapeType, ShapeOrientation } from '@/kernel/types.js';
import type { KernelAdapter } from '@/kernel/interfaces/index.js';
import {
  type BrepkitHandle,
  isBrepkitHandle,
  solidHandle,
  faceHandle,
  edgeHandle,
  wireHandle,
  vertexHandle,
  shellHandle,
  unwrap,
  unwrapSolidOrThrow,
  toArray,
  syntheticCompounds,
} from './helpers.js';
import { wasmIndex } from '@/utils/vec3.js';

function iterCompound(bk: BrepkitKernel, h: number, type: ShapeType): KernelShape[] {
  const children = syntheticCompounds.get(h);
  if (children) {
    return children.flatMap((child) =>
      child.type === type ? [child] : iterShapes(bk, child, type)
    );
  }
  if (type === 'solid') {
    return toArray(bk.getCompoundSolids(h)).map(solidHandle);
  }
  if (type === 'face' || type === 'edge' || type === 'vertex' || type === 'wire') {
    const solids = toArray(bk.getCompoundSolids(h)).map(solidHandle);
    return solids.flatMap((s) => iterShapes(bk, s, type));
  }
  return [];
}

function iterSolid(
  bk: BrepkitKernel,
  shape: KernelShape,
  h: number,
  type: ShapeType
): KernelShape[] {
  switch (type) {
    case 'solid':
      return [shape];
    case 'shell':
      return toArray(bk.getSolidShells(h)).map(shellHandle);
    case 'face':
      return toArray(bk.getSolidFaces(h)).map(faceHandle);
    case 'edge':
      return toArray(bk.getSolidEdges(h)).map(edgeHandle);
    case 'vertex':
      return toArray(bk.getSolidVertices(h)).map(vertexHandle);
    case 'wire':
      return toArray(bk.getSolidFaces(h)).flatMap((faceId: number) =>
        toArray(bk.getFaceWires(faceId)).map(wireHandle)
      );
    default:
      return [];
  }
}

function iterShellChildren(bk: BrepkitKernel, h: number, type: 'edge' | 'vertex'): KernelShape[] {
  const faces = toArray(bk.getShellFaces(h)).map(faceHandle);
  const seen = new Set<number>();
  const results: KernelShape[] = [];
  for (const face of faces) {
    for (const child of iterShapes(bk, face, type)) {
      const childId = unwrap(child);
      if (seen.has(childId)) continue;
      seen.add(childId);
      results.push(child);
    }
  }
  return results;
}

function iterShell(
  bk: BrepkitKernel,
  shape: KernelShape,
  h: number,
  type: ShapeType
): KernelShape[] {
  if (type === 'shell') return [shape];
  if (type === 'face') return toArray(bk.getShellFaces(h)).map(faceHandle);
  if (type === 'edge' || type === 'vertex') return iterShellChildren(bk, h, type);
  return [];
}

function iterFace(
  bk: BrepkitKernel,
  shape: KernelShape,
  h: number,
  type: ShapeType
): KernelShape[] {
  if (type === 'face') return [shape];
  if (type === 'edge') return toArray(bk.getFaceEdges(h)).map(edgeHandle);
  if (type === 'vertex') return toArray(bk.getFaceVertices(h)).map(vertexHandle);
  if (type === 'wire') return toArray(bk.getFaceWires(h)).map(wireHandle);
  return [];
}

function uniqueWireVertices(bk: BrepkitKernel, h: number): KernelShape[] {
  const edgeIds = toArray(bk.getWireEdges(h));
  const seen = new Set<string>();
  const results: KernelShape[] = [];
  for (const eid of edgeIds) {
    const verts = bk.getEdgeVertices(eid);
    const coords = [
      [wasmIndex(verts, 0), wasmIndex(verts, 1), wasmIndex(verts, 2)],
      [wasmIndex(verts, 3), wasmIndex(verts, 4), wasmIndex(verts, 5)],
    ] as const;
    for (const [x, y, z] of coords) {
      const key = `${x},${y},${z}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(vertexHandle(bk.makeVertex(x, y, z)));
    }
  }
  return results;
}

function iterWire(
  bk: BrepkitKernel,
  shape: KernelShape,
  h: number,
  type: ShapeType
): KernelShape[] {
  if (type === 'wire') return [shape];
  if (type === 'edge') return toArray(bk.getWireEdges(h)).map(edgeHandle);
  if (type === 'vertex') return uniqueWireVertices(bk, h);
  return [];
}

function iterEdge(
  bk: BrepkitKernel,
  shape: KernelShape,
  h: number,
  type: ShapeType
): KernelShape[] {
  if (type === 'edge') return [shape];
  if (type === 'vertex') {
    const verts = bk.getEdgeVertices(h);
    const v1 = bk.makeVertex(wasmIndex(verts, 0), wasmIndex(verts, 1), wasmIndex(verts, 2));
    const v2 = bk.makeVertex(wasmIndex(verts, 3), wasmIndex(verts, 4), wasmIndex(verts, 5));
    return [vertexHandle(v1), vertexHandle(v2)];
  }
  return [];
}

export function iterShapes(bk: BrepkitKernel, shape: KernelShape, type: ShapeType): KernelShape[] {
  const h = unwrap(shape);
  const bkHandle = shape as BrepkitHandle;

  switch (bkHandle.type) {
    case 'compound':
      return iterCompound(bk, h, type);
    case 'solid':
      return iterSolid(bk, shape, h, type);
    case 'shell':
      return iterShell(bk, shape, h, type);
    case 'face':
      return iterFace(bk, shape, h, type);
    case 'wire':
      return iterWire(bk, shape, h, type);
    case 'edge':
      return iterEdge(bk, shape, h, type);
    default:
      return [];
  }
}

export function iterShapeList(
  _bk: BrepkitKernel,
  list: KernelShape,
  callback: (item: KernelShape) => void
): void {
  if (Array.isArray(list)) {
    for (const item of list) callback(item);
  }
}

export function shapeType(_bk: BrepkitKernel, shape: KernelShape): ShapeType {
  if (isBrepkitHandle(shape)) return shape.type;
  throw new Error('brepkit: cannot determine shape type of non-brepkit handle');
}

export function isSame(_bk: BrepkitKernel, a: KernelShape, b: KernelShape): boolean {
  return isBrepkitHandle(a) && isBrepkitHandle(b) && a.id === b.id && a.type === b.type;
}

export function isEqual(_bk: BrepkitKernel, a: KernelShape, b: KernelShape): boolean {
  return isSame(_bk, a, b);
}

export function downcast(_bk: BrepkitKernel, shape: KernelShape, _type?: ShapeType): KernelShape {
  return shape;
}

export function hashCode(_bk: BrepkitKernel, shape: KernelShape, upperBound: number): number {
  if (!isBrepkitHandle(shape)) return 0;
  return shape.id % upperBound;
}

export function isNull(_bk: BrepkitKernel, shape: KernelShape): boolean {
  return !shape || !isBrepkitHandle(shape);
}

export function shapeOrientation(bk: BrepkitKernel, shape: KernelShape): ShapeOrientation {
  const h = unwrap(shape);
  const orient = bk.getShapeOrientation(h);
  return orient as ShapeOrientation;
}

export function edgeToFaceMap(bk: BrepkitKernel, shape: KernelShape): string {
  const solidId = unwrapSolidOrThrow(shape, 'edgeToFaceMap');
  return bk.edgeToFaceMap(solidId);
}

export function sharedEdges(
  bk: BrepkitKernel,
  faceA: KernelShape,
  faceB: KernelShape
): KernelShape[] {
  const aId = unwrap(faceA, 'face');
  const bId = unwrap(faceB, 'face');
  return Array.from(bk.sharedEdges(aId, bId)).map((id) => edgeHandle(id));
}

export function adjacentFaces(
  bk: BrepkitKernel,
  shape: KernelShape,
  face: KernelShape
): KernelShape[] {
  const solidId = unwrapSolidOrThrow(shape, 'adjacentFaces');
  const faceId = unwrap(face, 'face');
  return Array.from(bk.adjacentFaces(solidId, faceId)).map((id) => faceHandle(id));
}

function faceIdsForSew(bk: BrepkitKernel, shape: KernelShape): number[] {
  const h = shape as BrepkitHandle;
  if (h.type === 'face') return [h.id];
  if (h.type === 'solid') return toArray(bk.getSolidFaces(h.id));
  if (h.type === 'shell') return toArray(bk.getShellFaces(h.id));
  return [];
}

export function sew(bk: BrepkitKernel, shapes: KernelShape[], tolerance?: number): KernelShape {
  const faceIds = shapes.flatMap((s) => faceIdsForSew(bk, s));
  const tol = tolerance ?? 1e-7;
  try {
    const id = bk.weldShellsAndFaces(faceIds, tol);
    return shellHandle(id);
  } catch (e: unknown) {
    console.warn('brepkit: weldShellsAndFaces failed, falling back to sewFaces:', e);
  }
  const id = bk.sewFaces(faceIds, tol);
  return shellHandle(id);
}

/** Co-located factory: returns the topology-iteration slice of {@link KernelAdapter} bound to `bk`. */
export function makeTopologyOps(bk: BrepkitKernel) {
  return {
    iterShapes: (shape, type) => iterShapes(bk, shape, type),
    iterShapeList: (list, callback) => {
      iterShapeList(bk, list, callback);
    },
    shapeType: (shape) => shapeType(bk, shape),
    isSame: (a, b) => isSame(bk, a, b),
    isEqual: (a, b) => isEqual(bk, a, b),
    downcast: (shape, type) => downcast(bk, shape, type),
    // brepkit never frees handles individually (arena; delete is a no-op), so
    // the aliased handle is safe to "dispose" independently of the source.
    copyShape: (shape) => downcast(bk, shape),
    hashCode: (shape, upperBound) => hashCode(bk, shape, upperBound),
    isNull: (shape) => isNull(bk, shape),
    shapeOrientation: (shape) => shapeOrientation(bk, shape),
    edgeToFaceMap: (shape) => edgeToFaceMap(bk, shape),
    sharedEdges: (faceA, faceB) => sharedEdges(bk, faceA, faceB),
    adjacentFaces: (shape, face) => adjacentFaces(bk, shape, face),
    sew: (shapes, tolerance) => sew(bk, shapes, tolerance),
  } satisfies Pick<
    KernelAdapter,
    | 'iterShapes'
    | 'iterShapeList'
    | 'shapeType'
    | 'isSame'
    | 'isEqual'
    | 'downcast'
    | 'copyShape'
    | 'hashCode'
    | 'isNull'
    | 'shapeOrientation'
    | 'edgeToFaceMap'
    | 'sharedEdges'
    | 'adjacentFaces'
    | 'sew'
  >;
}
