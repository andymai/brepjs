/**
 * Modifier operations for the brepkit adapter.
 * @module
 */

import type { BrepkitKernel } from './brepkitWasmTypes.js';
import type { KernelShape } from '@/kernel/types.js';
import type { KernelAdapter } from '@/kernel/interfaces/index.js';
import { UnsupportedKernelOperationError } from '@/kernel/unsupported.js';
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

  const radii = new Set<number>();
  for (const edge of edges) {
    const r = typeof radius === 'function' ? radius(edge) : radius;
    const [start, end] = Array.isArray(r) ? r : [r, r];
    if (start !== end) throw varyingFilletUnsupported();
    radii.add(start);
  }
  if (radii.size > 1) throw perEdgeUnsupported('fillet radii');
  const [only] = radii;
  if (only === undefined) throw new Error('brepkit: fillet needs at least one edge');
  return solidHandle(bk.fillet(solidId, edgeIds, only));
}

/**
 * brepkit takes one value for every edge of a fillet or chamfer call, and a
 * second call on the first one's result cannot name the input's other edges:
 * a chamfer fails on them ("no manifold edges to chamfer"), and a fillet builds
 * the right body but leaves the input solid corrupt, so that filleting the
 * input's four vertical cube edges at 2 mm afterwards cuts a flat chamfer.
 */
function perEdgeUnsupported(what: string): UnsupportedKernelOperationError {
  return new UnsupportedKernelOperationError(
    `brepkit: different ${what} on different edges in one call is not supported`
  );
}

/**
 * brepkit-wasm's filletVariable does not build a rolling-ball blend: on the
 * 40 mm top edge of a 40 x 30 x 20 box, a radius running 2 to 5 removes 260 mm3
 * where the blend removes about 113, and even a constant law of 3 removes 180
 * (the flat chamfer) where fillet removes 77.26. A radius that varies along an
 * edge is refused rather than built that way.
 */
function varyingFilletUnsupported(): UnsupportedKernelOperationError {
  return new UnsupportedKernelOperationError(
    'brepkit: a fillet radius that varies along an edge is not supported'
  );
}

/** occt's hashCode upper bound, which the kernel-agnostic filletVariable spec hashes edges with. */
const HASH_UPPER_BOUND = 2147483647;

interface VariableFilletSpec {
  readonly edge?: number;
  readonly radii?: ReadonlyArray<{ readonly param: number; readonly radius: number }>;
  readonly edgeId?: number;
  readonly startRadius?: number;
  readonly endRadius?: number;
}

/**
 * A variable fillet spec on one edge: `{ edge: hashCode, radii: [{ param, radius }] }`
 * from variableFillet, or `{ edgeId, startRadius, endRadius }`. A constant radius is
 * an ordinary fillet; a radius that varies is unsupported (see
 * {@link varyingFilletUnsupported}).
 */
export function filletVariable(bk: BrepkitKernel, shape: KernelShape, spec: string): KernelShape {
  const solidId = unwrapSolidOrThrow(shape, 'filletVariable');
  const parsed = JSON.parse(spec) as VariableFilletSpec;
  let edgeId: number | undefined;
  let radii: number[];
  if (parsed.edge !== undefined && parsed.radii !== undefined && parsed.radii.length > 0) {
    const hash = parsed.edge;
    edgeId = toArray(bk.getSolidEdges(solidId)).find((id) => id % HASH_UPPER_BOUND === hash);
    radii = parsed.radii.map((r) => r.radius);
  } else if (
    parsed.edgeId !== undefined &&
    parsed.startRadius !== undefined &&
    parsed.endRadius !== undefined
  ) {
    edgeId = parsed.edgeId;
    radii = [parsed.startRadius, parsed.endRadius];
  } else {
    throw new UnsupportedKernelOperationError('brepkit: filletVariable: unrecognized spec');
  }
  if (edgeId === undefined) {
    throw new Error('brepkit: filletVariable: the edge is not an edge of the shape');
  }
  const [first = 0] = radii;
  if (radii.some((r) => r !== first)) throw varyingFilletUnsupported();
  return solidHandle(bk.fillet(solidId, [edgeId], first));
}

/**
 * A symmetric chamfer for two equal distances, brepkit's two-distance chamfer
 * otherwise. brepkit sets `d1` back on the edge's first face in its own face
 * order, which need not be the face occt-wasm picks for the same edge.
 */
function chamferTwoDistances(
  bk: BrepkitKernel,
  solidId: number,
  edgeIds: number[],
  d1: number,
  d2: number
): number {
  return d1 === d2 ? bk.chamfer(solidId, edgeIds, d1) : bk.chamferV2(solidId, edgeIds, d1, d2);
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
    return solidHandle(chamferTwoDistances(bk, solidId, edgeIds, distance[0], distance[1]));
  }

  const pairs = new Map<string, [number, number]>();
  for (const edge of edges) {
    const r = distance(edge);
    const [d1, d2] = Array.isArray(r) ? r : [r, r];
    pairs.set(`${d1},${d2}`, [d1, d2]);
  }
  if (pairs.size > 1) throw perEdgeUnsupported('chamfer distances');
  const [only] = pairs.values();
  if (only === undefined) throw new Error('brepkit: chamfer needs at least one edge');
  return solidHandle(chamferTwoDistances(bk, solidId, edgeIds, only[0], only[1]));
}

/**
 * brepkit sets `distance` back on the edge's first face in its own face order
 * and the other face back by distance·tan(angle).
 */
export function chamferDistAngle(
  bk: BrepkitKernel,
  shape: KernelShape,
  edges: KernelShape[],
  distance: number,
  angleDeg: number
): KernelShape {
  const solidId = unwrapSolidOrThrow(shape, 'chamferDistAngle');
  const edgeIds = edges.map((e) => unwrap(e, 'edge'));
  return solidHandle(
    bk.chamferDistanceAngle(solidId, edgeIds, distance, (angleDeg * Math.PI) / 180)
  );
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
