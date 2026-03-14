/* eslint-disable @typescript-eslint/no-non-null-assertion -- WASM arrays have known-valid indices */
/**
 * Modifier operations for the brepkit adapter.
 * @module
 */

import type { BrepkitKernel } from '../brepkitWasmTypes.js';
import type { KernelShape } from '../types.js';
import {
  type BrepkitHandle,
  handle,
  solidHandle,
  wireHandle,
  unwrap,
  unwrapSolidOrThrow,
  toArray,
  warnOnce,
} from './helpers.js';
import { iterShapes } from './topologyOps.js';

export function fillet(
  bk: BrepkitKernel,
  shape: KernelShape,
  edges: KernelShape[],
  radius: number | [number, number] | ((edge: KernelShape) => number | [number, number])
): KernelShape {
  const solidId = unwrapSolidOrThrow(shape, 'fillet');
  const edgeIds = edges.map((e) => unwrap(e, 'edge'));

  if (typeof radius === 'number') {
    return solidHandle(bk.fillet(solidId, edgeIds, radius));
  }

  const spec: { edge: number; startRadius: number; endRadius: number }[] = [];
  for (const [i, edge] of edges.entries()) {
    const edgeId = edgeIds[i] ?? 0;
    let r: number | [number, number];
    if (typeof radius === 'function') {
      r = radius(edge);
    } else {
      r = radius;
    }
    const [startR, endR] = Array.isArray(r) ? r : [r, r];
    spec.push({ edge: edgeId, startRadius: startR, endRadius: endR });
  }
  return solidHandle(bk.filletVariable(solidId, JSON.stringify(spec)));
}

export function chamfer(
  bk: BrepkitKernel,
  shape: KernelShape,
  edges: KernelShape[],
  distance: number | [number, number] | ((edge: KernelShape) => number | [number, number])
): KernelShape {
  const d = typeof distance === 'number' ? distance : Array.isArray(distance) ? distance[0] : 1;
  if (typeof distance !== 'number') {
    warnOnce(
      'chamfer-asymmetric',
      typeof distance === 'function'
        ? 'Per-edge chamfer distance function not supported; falling back to distance=1.'
        : 'Asymmetric chamfer not supported; using first distance only.'
    );
  }
  const edgeIds = edges.map((e) => unwrap(e, 'edge'));
  const id = bk.chamfer(unwrapSolidOrThrow(shape, 'chamfer'), edgeIds, d);
  return solidHandle(id);
}

export function chamferDistAngle(
  bk: BrepkitKernel,
  shape: KernelShape,
  edges: KernelShape[],
  distance: number,
  angleDeg: number
): KernelShape {
  warnOnce(
    'chamfer-dist-angle',
    'Distance-angle chamfer approximated as averaged two-distance chamfer.'
  );
  const d2 = distance * Math.tan((angleDeg * Math.PI) / 180);
  const avgDist = (distance + d2) / 2;
  return chamfer(bk, shape, edges, avgDist);
}

export function shell(
  bk: BrepkitKernel,
  shape: KernelShape,
  faces: KernelShape[],
  thickness: number,
  tolerance?: number
): KernelShape {
  if (tolerance !== undefined) {
    warnOnce(
      'shell-tolerance',
      'shell() tolerance parameter is not supported; brepkit uses its own internal tolerance.'
    );
  }
  const solidId = unwrapSolidOrThrow(shape, 'shell');
  const solidFaces = toArray(bk.getSolidFaces(solidId));
  const solidFaceSet = new Set(solidFaces);

  const resolvedFaceIds = faces.map((f) => {
    const fid = unwrap(f, 'face');
    if (solidFaceSet.has(fid)) return fid;

    try {
      const origNormal = bk.getFaceNormal(fid);
      let bestMatch = -1;
      let bestDot = -2;
      for (const sf of solidFaces) {
        try {
          const sn = bk.getFaceNormal(sf);
          const dot =
            (origNormal[0] ?? 0) * (sn[0] ?? 0) +
            (origNormal[1] ?? 0) * (sn[1] ?? 0) +
            (origNormal[2] ?? 0) * (sn[2] ?? 0);
          if (dot > bestDot) {
            bestDot = dot;
            bestMatch = sf;
          }
        } catch {
          // non-planar face, skip
        }
      }
      if (bestMatch >= 0 && bestDot > 0.99) return bestMatch;
    } catch {
      // original face lookup failed
    }
    return fid;
  });

  const id = bk.shell(solidId, thickness, resolvedFaceIds);
  return solidHandle(id);
}

export function thicken(bk: BrepkitKernel, shape: KernelShape, thickness: number): KernelShape {
  const h = shape as BrepkitHandle;
  if (h.type === 'face') {
    const id = bk.thicken(h.id, thickness);
    return solidHandle(id);
  }
  throw new Error('brepkit: thicken() requires a face');
}

export function offset(
  bk: BrepkitKernel,
  shape: KernelShape,
  distance: number,
  tolerance?: number
): KernelShape {
  if (tolerance !== undefined) {
    warnOnce(
      'offset-tolerance',
      'offset() tolerance parameter is not supported; brepkit uses its own internal tolerance.'
    );
  }
  const h = shape as BrepkitHandle;
  if (h.type === 'face') {
    const id = bk.thicken(h.id, distance);
    return solidHandle(id);
  }
  const id = bk.offsetSolid(unwrapSolidOrThrow(shape, 'offset'), distance);
  return solidHandle(id);
}

export function filletVariable(bk: BrepkitKernel, shape: KernelShape, spec: string): KernelShape {
  const solidId = unwrapSolidOrThrow(shape, 'filletVariable');
  return solidHandle(bk.filletVariable(solidId, spec));
}

export function draft(
  bk: BrepkitKernel,
  shape: KernelShape,
  faces: KernelShape[],
  pullDirection: [number, number, number],
  neutralPlane: [number, number, number],
  angleDeg: number
): KernelShape {
  const solidId = unwrapSolidOrThrow(shape, 'draft');
  const faceIds = faces.map((f) => unwrap(f, 'face'));
  return solidHandle(
    bk.draft(
      solidId,
      faceIds,
      pullDirection[0],
      pullDirection[1],
      pullDirection[2],
      neutralPlane[0],
      neutralPlane[1],
      neutralPlane[2],
      angleDeg
    )
  );
}

export function defeature(
  bk: BrepkitKernel,
  shape: KernelShape,
  faces: KernelShape[]
): KernelShape {
  const solidId = unwrapSolidOrThrow(shape, 'defeature');
  const faceIds = faces.map((f) => unwrap(f, 'face'));
  return solidHandle(bk.defeature(solidId, faceIds));
}

export function offsetWire2D(
  bk: BrepkitKernel,
  wire: KernelShape,
  offsetVal: number,
  _joinType?: number | 'arc' | 'intersection' | 'tangent'
): KernelShape {
  const edges = iterShapes(bk, wire, 'edge');
  if (edges.length === 0) return wire;

  const coords2d: number[] = [];
  for (const edge of edges) {
    const verts: number[] = bk.getEdgeVertices(unwrap(edge, 'edge'));
    coords2d.push(verts[0]!, verts[1]!);
  }
  if (coords2d.length < 6) return wire;

  const result: number[] = bk.offsetPolygon2d(coords2d, offsetVal, 1e-10);
  const coords3d: number[] = [];
  for (let i = 0; i < result.length; i += 2) {
    coords3d.push(result[i]!, result[i + 1]!, 0);
  }
  const wireId: number = bk.makePolygonWire(coords3d);
  return wireHandle(wireId);
}

export function simplify(bk: BrepkitKernel, shape: KernelShape): KernelShape {
  if ((shape as BrepkitHandle).type === 'solid') {
    try {
      bk.healSolid(unwrap(shape));
    } catch (e: unknown) {
      console.warn('brepkit: healing failed in simplify:', e);
    }
  }
  return shape;
}

export function reverseShape(bk: BrepkitKernel, shape: KernelShape): KernelShape {
  const h = shape as BrepkitHandle;
  const newId = bk.reverseShape(h.id);
  return handle(h.type, newId);
}
