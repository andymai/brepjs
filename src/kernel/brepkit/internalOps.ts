/* eslint-disable @typescript-eslint/no-non-null-assertion -- WASM arrays have known-valid indices */
/**
 * Internal (private) helper operations shared across brepkit adapter modules.
 *
 * These correspond to the private methods of BrepkitAdapter that are called
 * from multiple domain modules.
 *
 * @module
 */

import type { BrepkitKernel } from '../brepkitWasmTypes.js';
import type { KernelShape } from '../types.js';
import {
  type BrepkitHandle,
  isBrepkitHandle,
  solidHandle,
  faceHandle,
  edgeHandle,
  wireHandle,
  unwrap,
  DEFAULT_DEFLECTION,
} from './helpers.js';
import { iterShapes } from './topologyOps.js';

/** Apply a 4x4 row-major matrix to a shape (copy + transform). */
export function applyMatrix(bk: BrepkitKernel, shape: KernelShape, matrix: number[]): KernelShape {
  const h = shape as BrepkitHandle;
  if (!isBrepkitHandle(shape)) {
    throw new Error('brepkit: applyMatrix requires a BrepkitHandle');
  }
  switch (h.type) {
    case 'solid': {
      const copy = bk.copySolid(h.id);
      bk.transformSolid(copy, matrix);
      return solidHandle(copy);
    }
    case 'face': {
      if (typeof bk.copyFace !== 'function' || typeof bk.transformFace !== 'function') {
        throw new Error(
          'brepkit: applyMatrix for faces requires copyFace/transformFace WASM exports'
        );
      }
      const copy = bk.copyFace(h.id);
      bk.transformFace(copy, matrix);
      return faceHandle(copy);
    }
    case 'wire': {
      if (typeof bk.copyWire !== 'function' || typeof bk.transformWire !== 'function') {
        throw new Error(
          'brepkit: applyMatrix for wires requires copyWire/transformWire WASM exports'
        );
      }
      const copy = bk.copyWire(h.id);
      bk.transformWire(copy, matrix);
      return wireHandle(copy);
    }
    case 'edge': {
      if (typeof bk.copyEdge !== 'function' || typeof bk.transformEdge !== 'function') {
        throw new Error(
          'brepkit: applyMatrix for edges requires copyEdge/transformEdge WASM exports'
        );
      }
      const copy = bk.copyEdge(h.id);
      bk.transformEdge(copy, matrix);
      return edgeHandle(copy);
    }
    default:
      throw new Error(`brepkit: applyMatrix does not support '${h.type}' shapes`);
  }
}

/** Check if we need to transform from default placement (origin, +Z). */
export function needsTransform(
  center?: [number, number, number],
  direction?: [number, number, number]
): boolean {
  if (center && (center[0] !== 0 || center[1] !== 0 || center[2] !== 0)) return true;
  if (direction && (direction[0] !== 0 || direction[1] !== 0 || direction[2] !== 1)) return true;
  return false;
}

/** Transform a shape from default placement (origin, +Z) to the given center and direction. */
export function transformToPlacement(
  bk: BrepkitKernel,
  shape: KernelShape,
  center?: [number, number, number],
  direction?: [number, number, number]
): KernelShape {
  let result = shape;

  if (direction && (direction[0] !== 0 || direction[1] !== 0 || direction[2] !== 1)) {
    const [dx, dy, dz] = direction;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const nx = dx / len;
    const ny = dy / len;
    const nz = dz / len;

    const dot = nz;
    if (Math.abs(dot + 1) < 1e-10) {
      result = rotate(bk, result, 180, [1, 0, 0]);
    } else if (Math.abs(dot - 1) > 1e-10) {
      const axis: [number, number, number] = [-ny, nx, 0];
      const angleDeg = Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI);
      result = rotate(bk, result, angleDeg, axis);
    }
  }

  if (center && (center[0] !== 0 || center[1] !== 0 || center[2] !== 0)) {
    result = translate(bk, result, center[0], center[1], center[2]);
  }

  return result;
}

/**
 * Extract a plane definition (point + normal) from a face handle.
 * Uses tessellation to find a concrete point on the face.
 */
export function extractPlaneFromFace(
  bk: BrepkitKernel,
  faceShape: KernelShape
): {
  point: [number, number, number];
  normal: [number, number, number];
} {
  let faceId: number;
  const h = faceShape as BrepkitHandle;
  if (h.type === 'solid' || h.type === 'compound') {
    const faces = iterShapes(bk, faceShape, 'face');
    if (faces.length === 0) throw new Error('brepkit: extractPlaneFromFace: no faces found');
    const firstFace = faces[0];
    if (!firstFace) throw new Error('brepkit: extractPlaneFromFace: no faces found');
    let bestId = unwrap(firstFace, 'face');
    let bestArea = 0;
    for (const f of faces) {
      const id = unwrap(f, 'face');
      try {
        const a: number = bk.faceArea(id, DEFAULT_DEFLECTION);
        if (a > bestArea) {
          bestArea = a;
          bestId = id;
        }
      } catch {
        // skip faces that can't compute area
      }
    }
    faceId = bestId;
  } else {
    faceId = unwrap(faceShape, 'face');
  }
  const n = bk.getFaceNormal(faceId);
  const normal: [number, number, number] = [n[0]!, n[1]!, n[2]!];

  const mesh = bk.tessellateFace(faceId, 1.0);
  const positions = mesh.positions;
  if (positions.length >= 3) {
    return { point: [positions[0]!, positions[1]!, positions[2]!], normal };
  }

  return { point: [0, 0, 0], normal };
}

/**
 * Extract NURBS curve data from an edge handle.
 * Returns null for line edges (caller can build a linear NURBS).
 * Returns {degree, knots, controlPoints, weights} for NURBS edges.
 */
export function extractNurbsFromEdge(
  bk: BrepkitKernel,
  shape: KernelShape
): { degree: number; knots: number[]; controlPoints: number[]; weights: number[] } | null {
  const h = shape as BrepkitHandle;
  if (h.type !== 'edge') return null;

  const nurbsJson = bk.getEdgeNurbsData(h.id);
  if (nurbsJson) {
    const data = JSON.parse(nurbsJson);
    return {
      degree: data.degree,
      knots: data.knots,
      controlPoints: data.controlPoints,
      weights: data.weights,
    };
  }

  const verts = bk.getEdgeVertices(h.id);
  return {
    degree: 1,
    knots: [0, 0, 1, 1],
    controlPoints: [verts[0]!, verts[1]!, verts[2]!, verts[3]!, verts[4]!, verts[5]!],
    weights: [1, 1],
  };
}

// Import these here to avoid circular deps -- they are used by transformToPlacement
import { translate, rotate } from './transformOps.js';
