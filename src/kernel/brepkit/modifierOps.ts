/**
 * Modifier operations for the brepkit adapter.
 * @module
 */

import type { BrepkitKernel } from './brepkitWasmTypes.js';
import type { KernelShape } from '@/kernel/types.js';
import type { KernelAdapter } from '@/kernel/interfaces/index.js';
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

function faceCentroid(
  bk: BrepkitKernel,
  faceId: number
): { x: number; y: number; z: number } | null {
  const verts = toArray(bk.getFaceVertices(faceId));
  if (verts.length < 1) return null;
  let x = 0,
    y = 0,
    z = 0;
  for (const vid of verts) {
    const pos = bk.getVertexPosition(vid);
    x += wasmIndex(pos, 0);
    y += wasmIndex(pos, 1);
    z += wasmIndex(pos, 2);
  }
  const n = verts.length;
  return { x: x / n, y: y / n, z: z / n };
}

function findBestNormalMatch(
  bk: BrepkitKernel,
  origFaceId: number,
  solidFaces: number[]
): number | null {
  try {
    const origNormal = bk.getFaceNormal(origFaceId);
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
  return null;
}

function findBestCentroidMatch(
  bk: BrepkitKernel,
  origFaceId: number,
  solidFaces: number[]
): number | null {
  try {
    const origCentroid = faceCentroid(bk, origFaceId);
    if (origCentroid === null) return null;

    let bestMatch = -1;
    let bestDist = Infinity;
    for (const sf of solidFaces) {
      try {
        const sc = faceCentroid(bk, sf);
        if (sc === null) continue;
        const dist = Math.sqrt(
          (origCentroid.x - sc.x) ** 2 + (origCentroid.y - sc.y) ** 2 + (origCentroid.z - sc.z) ** 2
        );
        if (dist < bestDist) {
          bestDist = dist;
          bestMatch = sf;
        }
      } catch {
        // vertex lookup failed for this face
      }
    }
    if (bestMatch >= 0 && bestDist < 1e-3) return bestMatch;
  } catch {
    // original face vertex lookup failed
  }
  return null;
}

function resolveShellFaceId(
  bk: BrepkitKernel,
  fid: number,
  solidFaces: number[],
  solidFaceSet: Set<number>
): number {
  if (solidFaceSet.has(fid)) return fid;
  const normalMatch = findBestNormalMatch(bk, fid, solidFaces);
  if (normalMatch !== null) return normalMatch;
  const centroidMatch = findBestCentroidMatch(bk, fid, solidFaces);
  if (centroidMatch !== null) return centroidMatch;
  return fid;
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

  const resolvedFaceIds = faces.map((f) =>
    resolveShellFaceId(bk, unwrap(f, 'face'), solidFaces, solidFaceSet)
  );

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

/** Map a public join-type kind onto the brepkit kernel's join-type strings. */
function brepkitJoinType(
  joinType?: number | 'arc' | 'intersection' | 'tangent'
): 'intersection' | 'arc' | 'chamfer' {
  switch (joinType) {
    case 'arc':
    case 'tangent':
      return 'arc';
    case 'intersection':
      return 'intersection';
    default:
      return 'intersection';
  }
}

export function offsetWire2D(
  bk: BrepkitKernel,
  wire: KernelShape,
  offsetVal: number,
  joinType?: number | 'arc' | 'intersection' | 'tangent'
): KernelShape {
  // Preferred path: route the join type through the join-aware kernel
  // builder so 'arc' produces rounded corners instead of silently
  // collapsing to the sharp polygon offset. Falls back to the legacy
  // polygon path when the binding is unavailable (older wasm builds).
  if (typeof bk.offsetWire2DWithJoin === 'function') {
    const wireId = bk.offsetWire2DWithJoin(
      unwrap(wire, 'wire'),
      offsetVal,
      brepkitJoinType(joinType)
    );
    return wireHandle(wireId);
  }

  const edges = iterShapes(bk, wire, 'edge');
  if (edges.length === 0) return wire;

  const coords2d: number[] = [];
  for (const edge of edges) {
    const verts = bk.getEdgeVertices(unwrap(edge, 'edge'));
    coords2d.push(wasmIndex(verts, 0), wasmIndex(verts, 1));
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

import { resolveUniformAngle } from './helpers.js';

/** Co-located factory: returns the modifier slice of {@link KernelAdapter} bound to `bk`. */
export function makeModifierOps(bk: BrepkitKernel) {
  return {
    fillet: (shape, edges, radius) => fillet(bk, shape, edges, radius),
    chamfer: (shape, edges, distance) => chamfer(bk, shape, edges, distance),
    chamferDistAngle: (shape, edges, distance, angleDeg) =>
      chamferDistAngle(bk, shape, edges, distance, angleDeg),
    shell: (shape, faces, thickness, tolerance) => shell(bk, shape, faces, thickness, tolerance),
    thicken: (shape, thickness) => thicken(bk, shape, thickness),
    offset: (shape, distance, tolerance) => offset(bk, shape, distance, tolerance),
    filletVariable: (shape, spec) => filletVariable(bk, shape, spec),
    draft: (shape, faces, pullDirection, neutralPlane, angleDeg) =>
      draft(bk, shape, faces, pullDirection, neutralPlane, resolveUniformAngle(faces, angleDeg)),
    defeature: (shape, faces) => defeature(bk, shape, faces),
    offsetWire2D: (wire, off, joinType) => offsetWire2D(bk, wire, off, joinType),
    simplify: (shape) => simplify(bk, shape),
    reverseShape: (shape) => reverseShape(bk, shape),
  } satisfies Pick<
    KernelAdapter,
    | 'fillet'
    | 'chamfer'
    | 'chamferDistAngle'
    | 'shell'
    | 'thicken'
    | 'offset'
    | 'filletVariable'
    | 'draft'
    | 'defeature'
    | 'offsetWire2D'
    | 'simplify'
    | 'reverseShape'
  >;
}
