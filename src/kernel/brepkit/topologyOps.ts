/* eslint-disable @typescript-eslint/no-non-null-assertion -- WASM arrays have known-valid indices */
/**
 * Topology introspection operations for the brepkit adapter.
 * @module
 */

import type { BrepkitKernel } from './brepkitWasmTypes.js';
import type { KernelShape, ShapeType, ShapeOrientation } from '@/kernel/types.js';
import {
  type BrepkitHandle,
  isBrepkitHandle,
  solidHandle,
  faceHandle,
  edgeHandle,
  wireHandle,
  vertexHandle,
  unwrap,
  toArray,
  syntheticCompounds,
} from './helpers.js';

export function iterShapes(bk: BrepkitKernel, shape: KernelShape, type: ShapeType): KernelShape[] {
  const h = unwrap(shape);
  const bkHandle = shape as BrepkitHandle;

  switch (bkHandle.type) {
    case 'compound': {
      const children = syntheticCompounds.get(h);
      if (children) {
        const results: KernelShape[] = [];
        for (const child of children) {
          if (child.type === type) {
            results.push(child);
          } else {
            results.push(...iterShapes(bk, child, type));
          }
        }
        return results;
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

    case 'solid': {
      switch (type) {
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

    case 'shell': {
      if (type === 'face') {
        return toArray(bk.getShellFaces(h)).map(faceHandle);
      }
      if (type === 'edge' || type === 'vertex') {
        const faces = toArray(bk.getShellFaces(h)).map(faceHandle);
        const seen = new Set<number>();
        const results: KernelShape[] = [];
        for (const face of faces) {
          for (const child of iterShapes(bk, face, type)) {
            const childId = unwrap(child);
            if (!seen.has(childId)) {
              seen.add(childId);
              results.push(child);
            }
          }
        }
        return results;
      }
      return [];
    }

    case 'face': {
      if (type === 'face') return [shape];
      if (type === 'edge') return toArray(bk.getFaceEdges(h)).map(edgeHandle);
      if (type === 'vertex') return toArray(bk.getFaceVertices(h)).map(vertexHandle);
      if (type === 'wire') return toArray(bk.getFaceWires(h)).map(wireHandle);
      return [];
    }

    case 'wire': {
      if (type === 'wire') return [shape];
      if (type === 'edge') return toArray(bk.getWireEdges(h)).map(edgeHandle);
      if (type === 'vertex') {
        const edgeIds = toArray(bk.getWireEdges(h));
        const seen = new Set<string>();
        const results: KernelShape[] = [];
        for (const eid of edgeIds) {
          const verts = bk.getEdgeVertices(eid);
          const coords = [
            [verts[0]!, verts[1]!, verts[2]!],
            [verts[3]!, verts[4]!, verts[5]!],
          ] as const;
          for (const [x, y, z] of coords) {
            const key = `${x},${y},${z}`;
            if (!seen.has(key)) {
              seen.add(key);
              results.push(vertexHandle(bk.makeVertex(x, y, z)));
            }
          }
        }
        return results;
      }
      return [];
    }

    case 'edge': {
      if (type === 'edge') return [shape];
      if (type === 'vertex') {
        const verts = bk.getEdgeVertices(h);
        const v1 = bk.makeVertex(verts[0]!, verts[1]!, verts[2]!);
        const v2 = bk.makeVertex(verts[3]!, verts[4]!, verts[5]!);
        return [vertexHandle(v1), vertexHandle(v2)];
      }
      return [];
    }

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

export function sew(bk: BrepkitKernel, shapes: KernelShape[], tolerance?: number): KernelShape {
  const faceIds: number[] = [];
  for (const s of shapes) {
    const h = s as BrepkitHandle;
    if (h.type === 'face') {
      faceIds.push(h.id);
    } else if (h.type === 'solid') {
      for (const fid of toArray(bk.getSolidFaces(h.id))) {
        faceIds.push(fid);
      }
    } else if (h.type === 'shell') {
      for (const fid of toArray(bk.getShellFaces(h.id))) {
        faceIds.push(fid);
      }
    }
  }
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

// Import needed by edgeToFaceMap, adjacentFaces
import { unwrapSolidOrThrow, shellHandle } from './helpers.js';
