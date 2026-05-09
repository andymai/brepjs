/**
 * Modifier operations for the brepkit adapter.
 * @module
 */

import type { BrepkitKernel } from './brepkitWasmTypes.js';
import type { KernelShape } from '@/kernel/types.js';
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
import { wasmIndex } from '@/utils/vec3.js';

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
  const solidId = unwrapSolidOrThrow(shape, 'chamfer');
  const edgeIds = edges.map((e) => unwrap(e, 'edge'));

  if (typeof distance === 'number') {
    return solidHandle(bk.chamfer(solidId, edgeIds, distance));
  }

  if (Array.isArray(distance)) {
    const [d1, d2] = distance;
    if (typeof bk.chamferAsymmetric === 'function') {
      return solidHandle(bk.chamferAsymmetric(solidId, edgeIds, d1, d2));
    }
    // Fallback: average the two distances
    warnOnce('chamfer-asymmetric', 'chamferAsymmetric not available; using averaged distance.');
    return solidHandle(bk.chamfer(solidId, edgeIds, (d1 + d2) / 2));
  }

  // Callback mode: group edges by distance to batch atomically
  // (avoids stale edge IDs from iterating one-by-one across topology changes)
  const groups = new Map<string, { ids: number[]; d1: number; d2: number }>();
  for (const [i, edge] of edges.entries()) {
    const r = distance(edge);
    const eid = edgeIds[i];
    if (eid === undefined) continue;
    const [d1, d2] = Array.isArray(r) ? r : [r, r];
    const key = `${d1},${d2}`;
    const group = groups.get(key);
    if (group) {
      group.ids.push(eid);
    } else {
      groups.set(key, { ids: [eid], d1, d2 });
    }
  }

  let result = solidId;
  for (const group of groups.values()) {
    if (group.d1 === group.d2) {
      result = bk.chamfer(result, group.ids, group.d1);
    } else if (typeof bk.chamferAsymmetric === 'function') {
      result = bk.chamferAsymmetric(result, group.ids, group.d1, group.d2);
    } else {
      warnOnce(
        'chamfer-callback',
        'chamferAsymmetric not available; asymmetric edges use averaged distance.'
      );
      result = bk.chamfer(result, group.ids, (group.d1 + group.d2) / 2);
    }
  }
  return solidHandle(result);
}

export function chamferDistAngle(
  bk: BrepkitKernel,
  shape: KernelShape,
  edges: KernelShape[],
  distance: number,
  angleDeg: number
): KernelShape {
  const d2 = distance * Math.tan((angleDeg * Math.PI) / 180);
  const solidId = unwrapSolidOrThrow(shape, 'chamferDistAngle');
  const edgeIds = edges.map((e) => unwrap(e, 'edge'));

  if (typeof bk.chamferAsymmetric === 'function') {
    return solidHandle(bk.chamferAsymmetric(solidId, edgeIds, distance, d2));
  }

  // Fallback: averaged symmetric chamfer
  warnOnce('chamfer-dist-angle', 'chamferAsymmetric not available; using averaged distance.');
  return solidHandle(bk.chamfer(solidId, edgeIds, (distance + d2) / 2));
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

    // Centroid-proximity fallback: compare average vertex positions
    try {
      const origVerts = toArray(bk.getFaceVertices(fid));
      if (origVerts.length >= 1) {
        let ox = 0,
          oy = 0,
          oz = 0;
        for (const vid of origVerts) {
          const pos = bk.getVertexPosition(vid);
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM return value
          ox += pos[0]!;
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM return value
          oy += pos[1]!;
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM return value
          oz += pos[2]!;
        }
        const n = origVerts.length;
        ox /= n;
        oy /= n;
        oz /= n;

        let bestCentroidMatch = -1;
        let bestCentroidDist = Infinity;
        for (const sf of solidFaces) {
          try {
            const sv = toArray(bk.getFaceVertices(sf));
            if (sv.length < 1) continue;
            let sx = 0,
              sy = 0,
              sz = 0;
            for (const svid of sv) {
              const spos = bk.getVertexPosition(svid);
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM return value
              sx += spos[0]!;
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM return value
              sy += spos[1]!;
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM return value
              sz += spos[2]!;
            }
            const sn = sv.length;
            sx /= sn;
            sy /= sn;
            sz /= sn;
            const dist = Math.sqrt((ox - sx) ** 2 + (oy - sy) ** 2 + (oz - sz) ** 2);
            if (dist < bestCentroidDist) {
              bestCentroidDist = dist;
              bestCentroidMatch = sf;
            }
          } catch {
            // vertex lookup failed for this face
          }
        }
        if (bestCentroidMatch >= 0 && bestCentroidDist < 1e-3) return bestCentroidMatch;
      }
    } catch {
      // original face vertex lookup failed
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
  const solidId = unwrapSolidOrThrow(shape, 'offset');
  return solidHandle(bk.offsetSolidV2(solidId, distance));
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
    const verts = bk.getEdgeVertices(unwrap(edge, 'edge'));
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM return value
    coords2d.push(verts[0]!, verts[1]!);
  }
  if (coords2d.length < 6) return wire;

  const result = bk.offsetPolygon2d(coords2d, offsetVal, 1e-10);
  const coords3d: number[] = [];
  for (let i = 0; i < result.length; i += 2) {
    coords3d.push(wasmIndex(result, i), wasmIndex(result, i + 1), 0);
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
