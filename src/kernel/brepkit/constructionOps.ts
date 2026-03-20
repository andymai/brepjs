/**
 * Shape construction operations for the brepkit adapter.
 * @module
 */

import type { BrepkitKernel } from './brepkitWasmTypes.js';
import type { KernelShape, KernelType } from '@/kernel/types.js';
import {
  type BrepkitHandle,
  isBrepkitHandle,
  solidHandle,
  faceHandle,
  edgeHandle,
  wireHandle,
  vertexHandle,
  compoundHandle,
  unwrap,
  toArray,
  syntheticCompounds,
  nextSyntheticId,
  DEFAULT_SEGMENTS,
  warnOnce,
} from './helpers.js';
import { needsTransform, transformToPlacement } from './internalOps.js';
import { translate, generalTransform } from './transformOps.js';
import { sew } from './topologyOps.js';

export function makeVertex(bk: BrepkitKernel, x: number, y: number, z: number): KernelShape {
  const id = bk.makeVertex(x, y, z);
  return vertexHandle(id);
}

export function makeEdge(
  bk: BrepkitKernel,
  curve: KernelType,
  start?: number,
  end?: number
): KernelShape {
  if (curve && typeof curve === 'object' && 'origin' in curve && 'direction' in curve) {
    const { origin, direction } = curve as {
      origin: [number, number, number];
      direction: [number, number, number];
    };
    const t0 = start ?? 0;
    const t1 = end ?? 1;
    return makeLineEdge(
      bk,
      [origin[0] + direction[0] * t0, origin[1] + direction[1] * t0, origin[2] + direction[2] * t0],
      [origin[0] + direction[0] * t1, origin[1] + direction[1] * t1, origin[2] + direction[2] * t1]
    );
  }
  if (isBrepkitHandle(curve) && curve.type === 'edge') {
    return curve;
  }
  throw new Error('brepkit: makeEdge requires a curve with origin/direction, or an edge handle');
}

export function makeWire(bk: BrepkitKernel, edges: KernelShape[]): KernelShape {
  const edgeIds: number[] = [];
  for (const e of edges) {
    const h = e as BrepkitHandle;
    if (h.type === 'wire') {
      for (const childEdgeId of toArray(bk.getWireEdges(h.id))) {
        edgeIds.push(childEdgeId);
      }
    } else {
      edgeIds.push(unwrap(e, 'edge'));
    }
  }
  const id = bk.makeWire(edgeIds, true);
  return wireHandle(id);
}

export function makeFace(bk: BrepkitKernel, wire: KernelShape, _planar?: boolean): KernelShape {
  const h = wire as BrepkitHandle;
  if (h.type === 'edge') {
    const wireId = bk.makeWire([h.id], true);
    const id = bk.makeFaceFromWire(wireId);
    return faceHandle(id);
  }
  const id = bk.makeFaceFromWire(unwrap(wire, 'wire'));
  return faceHandle(id);
}

export function makeBox(
  bk: BrepkitKernel,
  width: number,
  height: number,
  depth: number
): KernelShape {
  const id = bk.makeBox(width, height, depth);
  return solidHandle(id);
}

export function makeRectangle(bk: BrepkitKernel, width: number, height: number): KernelShape {
  const id = bk.makeRectangle(width, height);
  return faceHandle(id);
}

export function makeCylinder(
  bk: BrepkitKernel,
  radius: number,
  height: number,
  center?: [number, number, number],
  direction?: [number, number, number]
): KernelShape {
  const id = bk.makeCylinder(radius, height);
  const sh = solidHandle(id);
  if (needsTransform(center, direction)) {
    return transformToPlacement(bk, sh, center, direction);
  }
  return sh;
}

export function makeSphere(
  bk: BrepkitKernel,
  radius: number,
  center?: [number, number, number]
): KernelShape {
  const id = bk.makeSphere(radius, DEFAULT_SEGMENTS);
  const sh = solidHandle(id);
  if (center && (center[0] !== 0 || center[1] !== 0 || center[2] !== 0)) {
    return translate(bk, sh, center[0], center[1], center[2]);
  }
  return sh;
}

export function makeCone(
  bk: BrepkitKernel,
  radius1: number,
  radius2: number,
  height: number,
  center?: [number, number, number],
  direction?: [number, number, number]
): KernelShape {
  const id = bk.makeCone(radius1, radius2, height);
  const sh = solidHandle(id);
  if (needsTransform(center, direction)) {
    return transformToPlacement(bk, sh, center, direction);
  }
  return sh;
}

export function makeTorus(
  bk: BrepkitKernel,
  majorRadius: number,
  minorRadius: number,
  center?: [number, number, number],
  direction?: [number, number, number]
): KernelShape {
  const id = bk.makeTorus(majorRadius, minorRadius, DEFAULT_SEGMENTS);
  const sh = solidHandle(id);
  if (needsTransform(center, direction)) {
    return transformToPlacement(bk, sh, center, direction);
  }
  return sh;
}

export function makeEllipsoid(
  bk: BrepkitKernel,
  aLength: number,
  bLength: number,
  cLength: number
): KernelShape {
  const maxR = Math.max(aLength, bLength, cLength);
  const sphere = makeSphere(bk, maxR);
  const scaleX = aLength / maxR;
  const scaleY = bLength / maxR;
  const scaleZ = cLength / maxR;
  return generalTransform(bk, sphere, [scaleX, 0, 0, 0, scaleY, 0, 0, 0, scaleZ], [0, 0, 0], false);
}

export function makeLineEdge(
  bk: BrepkitKernel,
  p1: [number, number, number],
  p2: [number, number, number]
): KernelShape {
  const id = bk.makeLineEdge(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
  return edgeHandle(id);
}

export function makeCircleEdge(
  bk: BrepkitKernel,
  center: [number, number, number],
  normal: [number, number, number],
  radius: number
): KernelShape {
  return makeCircleNurbs(bk, center, normal, radius, 0, 2 * Math.PI);
}

export function makeCircleArc(
  bk: BrepkitKernel,
  center: [number, number, number],
  normal: [number, number, number],
  radius: number,
  startAngle: number,
  endAngle: number
): KernelShape {
  return makeCircleNurbs(bk, center, normal, radius, startAngle, endAngle);
}

/**
 * Compute the circumscribed circle center of three 2D points.
 * Returns `null` when the points are (nearly) collinear and no unique circle exists.
 */
export function computeCircumcircleCenter2D(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number
): [number, number] | null {
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-12) return null;
  const ccx =
    ((ax ** 2 + ay ** 2) * (by - cy) +
      (bx ** 2 + by ** 2) * (cy - ay) +
      (cx ** 2 + cy ** 2) * (ay - by)) /
    d;
  const ccy =
    ((ax ** 2 + ay ** 2) * (cx - bx) +
      (bx ** 2 + by ** 2) * (ax - cx) +
      (cx ** 2 + cy ** 2) * (bx - ax)) /
    d;
  return [ccx, ccy];
}

export function makeArcEdge(
  bk: BrepkitKernel,
  p1: [number, number, number],
  p2: [number, number, number],
  p3: [number, number, number]
): KernelShape {
  const ab: [number, number, number] = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];
  const ac: [number, number, number] = [p3[0] - p1[0], p3[1] - p1[1], p3[2] - p1[2]];
  const normal: [number, number, number] = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
  const nLen = Math.sqrt(normal[0] ** 2 + normal[1] ** 2 + normal[2] ** 2);
  if (nLen < 1e-12) {
    return makeLineEdge(bk, p1, p3);
  }
  const nz: [number, number, number] = [normal[0] / nLen, normal[1] / nLen, normal[2] / nLen];

  const abLen = Math.sqrt(ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2);
  const ux: [number, number, number] = [ab[0] / abLen, ab[1] / abLen, ab[2] / abLen];
  const uy: [number, number, number] = [
    nz[1] * ux[2] - nz[2] * ux[1],
    nz[2] * ux[0] - nz[0] * ux[2],
    nz[0] * ux[1] - nz[1] * ux[0],
  ];

  const proj = (p: [number, number, number]): [number, number] => {
    const dx = p[0] - p1[0],
      dy = p[1] - p1[1],
      dz = p[2] - p1[2];
    return [dx * ux[0] + dy * ux[1] + dz * ux[2], dx * uy[0] + dy * uy[1] + dz * uy[2]];
  };
  const [ax2, ay2] = proj(p1);
  const [bx2, by2] = proj(p2);
  const [cx2, cy2] = proj(p3);

  const cc = computeCircumcircleCenter2D(ax2, ay2, bx2, by2, cx2, cy2);
  if (!cc) return makeLineEdge(bk, p1, p3);
  const [ccx, ccy] = cc;

  const center: [number, number, number] = [
    p1[0] + ccx * ux[0] + ccy * uy[0],
    p1[1] + ccx * ux[1] + ccy * uy[1],
    p1[2] + ccx * ux[2] + ccy * uy[2],
  ];
  const id = bk.makeCircleArc3d(
    p1[0],
    p1[1],
    p1[2],
    p3[0],
    p3[1],
    p3[2],
    center[0],
    center[1],
    center[2],
    nz[0],
    nz[1],
    nz[2]
  );
  return edgeHandle(id);
}

export function makeEllipseEdge(
  bk: BrepkitKernel,
  center: [number, number, number],
  normal: [number, number, number],
  majorRadius: number,
  minorRadius: number,
  xDir?: [number, number, number]
): KernelShape {
  return makeEllipseNurbs(bk, center, normal, majorRadius, minorRadius, 0, 2 * Math.PI, xDir);
}

export function makeEllipseArc(
  bk: BrepkitKernel,
  center: [number, number, number],
  normal: [number, number, number],
  majorRadius: number,
  minorRadius: number,
  startAngle: number,
  endAngle: number,
  xDir?: [number, number, number]
): KernelShape {
  return makeEllipseNurbs(bk, center, normal, majorRadius, minorRadius, startAngle, endAngle, xDir);
}

export function makeBezierEdge(bk: BrepkitKernel, points: [number, number, number][]): KernelShape {
  if (points.length < 2) throw new Error('brepkit: bezier requires at least 2 points');
  const degree = points.length - 1;
  const n = points.length;
  const knots: number[] = [...Array(degree + 1).fill(0), ...Array(degree + 1).fill(1)];
  const weights = Array(n).fill(1);
  const flatCp: number[] = points.flatMap(([x, y, z]) => [x, y, z]);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- known-valid after bounds check
  const startPt = points[0]!;
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- known-valid after bounds check
  const endPt = points[n - 1]!;

  const id = bk.makeNurbsEdge(
    startPt[0],
    startPt[1],
    startPt[2],
    endPt[0],
    endPt[1],
    endPt[2],
    degree,
    knots,
    flatCp,
    weights
  );
  return edgeHandle(id);
}

export function makeTangentArc(
  bk: BrepkitKernel,
  startPoint: [number, number, number],
  startTangent: [number, number, number],
  endPoint: [number, number, number]
): KernelShape {
  if (!bk.makeTangentArc3d) {
    throw new Error('makeTangentArc requires brepkit-wasm >= 1.1.0');
  }
  const id = bk.makeTangentArc3d(
    startPoint[0],
    startPoint[1],
    startPoint[2],
    startTangent[0],
    startTangent[1],
    startTangent[2],
    endPoint[0],
    endPoint[1],
    endPoint[2]
  );
  return edgeHandle(id);
}

export function makeHelixWire(
  bk: BrepkitKernel,
  pitch: number,
  height: number,
  radius: number,
  center?: [number, number, number],
  _direction?: [number, number, number],
  leftHanded?: boolean
): KernelShape {
  const turns = height / pitch;
  const nSamplesPerTurn = 16;
  const nSamples = Math.max(4, Math.ceil(turns * nSamplesPerTurn));
  const cx = center?.[0] ?? 0;
  const cy = center?.[1] ?? 0;
  const cz = center?.[2] ?? 0;
  const sign = leftHanded ? -1 : 1;

  const points: [number, number, number][] = [];
  for (let i = 0; i <= nSamples; i++) {
    const t = i / nSamples;
    const angle = sign * 2 * Math.PI * turns * t;
    points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle), cz + height * t]);
  }

  const edge = interpolatePoints(bk, points);
  return makeWire(bk, [edge]);
}

export function makeWireFromMixed(bk: BrepkitKernel, items: KernelShape[]): KernelShape {
  const edgeIds: number[] = [];
  for (const item of items) {
    const h = item as BrepkitHandle;
    if (h.type === 'edge') {
      edgeIds.push(h.id);
    } else if (h.type === 'wire') {
      for (const childEdgeId of toArray(bk.getWireEdges(h.id))) {
        edgeIds.push(childEdgeId);
      }
    }
  }
  if (edgeIds.length === 0)
    throw new Error('brepkit: makeWireFromMixed requires at least one edge');
  const id = bk.makeWire(edgeIds, false);
  return wireHandle(id);
}

export function makeCompound(bk: BrepkitKernel, shapes: KernelShape[]): KernelShape {
  const handles = shapes.filter(isBrepkitHandle);
  if (handles.length === 0) {
    throw new Error('brepkit: makeCompound requires at least one shape');
  }
  const allSolids = handles.every((h) => h.type === 'solid');
  if (allSolids) {
    const id = bk.makeCompound(handles.map((h) => h.id));
    return compoundHandle(id);
  }
  const id = nextSyntheticId();
  syntheticCompounds.set(id, handles);
  return compoundHandle(id);
}

export function makeBoxFromCorners(
  bk: BrepkitKernel,
  p1: [number, number, number],
  p2: [number, number, number]
): KernelShape {
  const w = Math.abs(p2[0] - p1[0]);
  const h = Math.abs(p2[1] - p1[1]);
  const d = Math.abs(p2[2] - p1[2]);
  const box = makeBox(bk, w, h, d);
  const minX = Math.min(p1[0], p2[0]);
  const minY = Math.min(p1[1], p2[1]);
  const minZ = Math.min(p1[2], p2[2]);
  if (minX !== 0 || minY !== 0 || minZ !== 0) {
    return translate(bk, box, minX, minY, minZ);
  }
  return box;
}

export function solidFromShell(bk: BrepkitKernel, shell: KernelShape): KernelShape {
  const h = shell as BrepkitHandle;
  if (h.type === 'solid') return shell;
  if (h.type === 'shell') {
    try {
      bk.getSolidFaces(h.id);
      return solidHandle(h.id);
    } catch {
      // Genuine shell handle
    }
    const id = bk.solidFromShell(h.id);
    return solidHandle(id);
  }
  const id = bk.solidFromShell(unwrap(shell, 'shell'));
  return solidHandle(id);
}

export function makeNonPlanarFace(bk: BrepkitKernel, wire: KernelShape): KernelShape {
  return makeFace(bk, wire, true);
}

export function addHolesInFace(
  bk: BrepkitKernel,
  face: KernelShape,
  holeWires: KernelShape[]
): KernelShape {
  const wireIds = holeWires.map((w) => unwrap(w, 'wire'));
  const id = bk.addHolesToFace(unwrap(face, 'face'), wireIds);
  return faceHandle(id);
}

export function removeHolesFromFace(bk: BrepkitKernel, face: KernelShape): KernelShape {
  const id = bk.removeHolesFromFace(unwrap(face, 'face'));
  return faceHandle(id);
}

export function makeFaceOnSurface(
  bk: BrepkitKernel,
  _surface: KernelType,
  wire: KernelShape
): KernelShape {
  return makeFace(bk, wire, true);
}

export function bsplineSurface(
  bk: BrepkitKernel,
  points: [number, number, number][],
  rows: number,
  cols: number
): KernelShape {
  const coords: number[] = [];
  for (const [x, y, z] of points) {
    coords.push(x, y, z);
  }
  const degreeU = Math.min(3, rows - 1);
  const degreeV = Math.min(3, cols - 1);
  try {
    const faceId = bk.interpolateSurface(coords, rows, cols, degreeU, degreeV);
    return faceHandle(faceId);
  } catch {
    return triangulatedSurface(bk, points, rows, cols);
  }
}

export function triangulatedSurface(
  bk: BrepkitKernel,
  points: [number, number, number][],
  rows: number,
  cols: number
): KernelShape {
  const faces: KernelShape[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const i00 = r * cols + c;
      const i10 = (r + 1) * cols + c;
      const i01 = r * cols + (c + 1);
      const i11 = (r + 1) * cols + (c + 1);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- known-valid after bounds check
      const f1 = buildTriFace(bk, points[i00]!, points[i10]!, points[i01]!);
      if (f1) faces.push(f1);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- known-valid after bounds check
      const f2 = buildTriFace(bk, points[i10]!, points[i11]!, points[i01]!);
      if (f2) faces.push(f2);
    }
  }
  if (faces.length === 0) throw new Error('brepkit: no valid faces in surface grid');
  return sew(bk, faces, 1e-6);
}

export function buildTriFace(
  bk: BrepkitKernel,
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number]
): KernelShape | null {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const cross = [
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
    ab[1]! * ac[2]! - ab[2]! * ac[1]!,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
    ab[2]! * ac[0]! - ab[0]! * ac[2]!,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
    ab[0]! * ac[1]! - ab[1]! * ac[0]!,
  ];
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
  const area = Math.sqrt(cross[0]! ** 2 + cross[1]! ** 2 + cross[2]! ** 2);
  if (area < 1e-12) return null;

  try {
    const e1 = makeLineEdge(bk, a, b);
    const e2 = makeLineEdge(bk, b, c);
    const e3 = makeLineEdge(bk, c, a);
    const wire = makeWire(bk, [e1, e2, e3]);
    return makeFace(bk, wire);
  } catch (e: unknown) {
    console.warn('brepkit: makeNonPlanarFace failed:', e);
    return null;
  }
}

export function sewAndSolidify(
  bk: BrepkitKernel,
  faces: KernelShape[],
  tolerance: number
): KernelShape {
  const faceIds = faces.map((s) => unwrap(s, 'face'));
  const solidId = bk.sewFaces(faceIds, tolerance);
  return solidHandle(solidId);
}

export function interpolatePoints(
  bk: BrepkitKernel,
  points: [number, number, number][],
  options?: { periodic?: boolean; tolerance?: number }
): KernelShape {
  if (options?.tolerance !== undefined) {
    warnOnce(
      'interpolate-tolerance',
      'interpolatePoints() tolerance parameter is not supported; brepkit uses chord-length parameterisation.'
    );
  }
  if (points.length < 2) throw new Error('brepkit: need at least 2 points');
  if (points.length === 2) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- known-valid after bounds check
    return makeLineEdge(bk, points[0]!, points[1]!);
  }

  const degree = Math.min(3, points.length - 1);
  const coords = points.flatMap(([x, y, z]) => [x, y, z]);
  const id = bk.interpolatePoints(coords, degree);
  return edgeHandle(id);
}

export function approximatePoints(
  bk: BrepkitKernel,
  points: [number, number, number][],
  options?: {
    tolerance?: number;
    degMin?: number;
    degMax?: number;
    smoothing?: [number, number, number] | null;
  }
): KernelShape {
  const degree = options?.degMax ?? 3;
  const tol = options?.tolerance ?? 1e-6;
  const coords: number[] = [];
  for (const p of points) coords.push(p[0], p[1], p[2]);
  const numCps = Math.max(degree + 1, Math.min(points.length, Math.ceil(points.length * 0.7)));
  const id: number = bk.approximateCurveLspia(coords, degree, numCps, tol, 100);
  return edgeHandle(id);
}

export function createPoint3d(_bk: BrepkitKernel, x: number, y: number, z: number): KernelType {
  return { x, y, z };
}

export function createDirection3d(_bk: BrepkitKernel, x: number, y: number, z: number): KernelType {
  const len = Math.sqrt(x * x + y * y + z * z);
  return { x: x / len, y: y / len, z: z / len };
}

export function createVector3d(_bk: BrepkitKernel, x: number, y: number, z: number): KernelType {
  return { x, y, z };
}

export function createAxis1(
  _bk: BrepkitKernel,
  cx: number,
  cy: number,
  cz: number,
  dx: number,
  dy: number,
  dz: number
): KernelType {
  return { origin: [cx, cy, cz], direction: [dx, dy, dz] };
}

export function createAxis2(
  _bk: BrepkitKernel,
  ox: number,
  oy: number,
  oz: number,
  zx: number,
  zy: number,
  zz: number,
  xx?: number,
  xy?: number,
  xz?: number
): KernelType {
  return {
    origin: [ox, oy, oz],
    z: [zx, zy, zz],
    x: xx !== undefined ? [xx, xy, xz] : undefined,
  };
}

export function createAxis3(
  _bk: BrepkitKernel,
  ox: number,
  oy: number,
  oz: number,
  zx: number,
  zy: number,
  zz: number,
  xx?: number,
  xy?: number,
  xz?: number
): KernelType {
  return {
    origin: [ox, oy, oz],
    z: [zx, zy, zz],
    x: xx !== undefined ? [xx, xy, xz] : undefined,
  };
}

// ---------------------------------------------------------------------------
// Internal NURBS helpers
// ---------------------------------------------------------------------------

function makeCircleNurbs(
  bk: BrepkitKernel,
  center: [number, number, number],
  normal: [number, number, number],
  radius: number,
  startAngle: number,
  endAngle: number
): KernelShape {
  const len = Math.sqrt(normal[0] ** 2 + normal[1] ** 2 + normal[2] ** 2);
  const nz = [normal[0] / len, normal[1] / len, normal[2] / len];

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
  const ref = Math.abs(nz[0]!) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const xAxis = [
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
    nz[1]! * ref[2]! - nz[2]! * ref[1]!,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
    nz[2]! * ref[0]! - nz[0]! * ref[2]!,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
    nz[0]! * ref[1]! - nz[1]! * ref[0]!,
  ];
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
  const xLen = Math.sqrt(xAxis[0]! ** 2 + xAxis[1]! ** 2 + xAxis[2]! ** 2);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
  xAxis[0]! /= xLen;
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
  xAxis[1]! /= xLen;
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
  xAxis[2]! /= xLen;
  const yAxis = [
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
    nz[1]! * xAxis[2]! - nz[2]! * xAxis[1]!,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
    nz[2]! * xAxis[0]! - nz[0]! * xAxis[2]!,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
    nz[0]! * xAxis[1]! - nz[1]! * xAxis[0]!,
  ];

  const nSegments = Math.ceil(Math.abs(endAngle - startAngle) / (Math.PI / 2));
  const dAngle = (endAngle - startAngle) / nSegments;

  const controlPoints: number[] = [];
  const weights: number[] = [];

  for (let i = 0; i <= nSegments; i++) {
    const angle = startAngle + i * dAngle;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
    const px = center[0] + radius * (cos * xAxis[0]! + sin * yAxis[0]!);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
    const py = center[1] + radius * (cos * xAxis[1]! + sin * yAxis[1]!);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
    const pz = center[2] + radius * (cos * xAxis[2]! + sin * yAxis[2]!);

    if (i > 0) {
      const midAngle = startAngle + (i - 0.5) * dAngle;
      const midCos = Math.cos(midAngle);
      const midSin = Math.sin(midAngle);
      const midR = radius / Math.cos(dAngle / 2);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
      const mx = center[0] + midR * (midCos * xAxis[0]! + midSin * yAxis[0]!);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
      const my = center[1] + midR * (midCos * xAxis[1]! + midSin * yAxis[1]!);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
      const mz = center[2] + midR * (midCos * xAxis[2]! + midSin * yAxis[2]!);
      controlPoints.push(mx, my, mz);
      weights.push(Math.cos(dAngle / 2));
    }

    controlPoints.push(px, py, pz);
    weights.push(1);
  }

  const degree = 2;
  const knots: number[] = Array(degree + 1).fill(0);
  for (let i = 1; i < nSegments; i++) {
    knots.push(i, i);
  }
  knots.push(...Array(degree + 1).fill(nSegments));

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
  const kMax = knots[knots.length - 1]!;
  for (let i = 0; i < knots.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
    knots[i] = knots[i]! / kMax;
  }

  const startPt = controlPoints.slice(0, 3);
  const endPt = controlPoints.slice(-3);

  const id = bk.makeNurbsEdge(
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
    startPt[0]!,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
    startPt[1]!,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
    startPt[2]!,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
    endPt[0]!,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
    endPt[1]!,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
    endPt[2]!,
    degree,
    knots,
    controlPoints,
    weights
  );
  return edgeHandle(id);
}

function makeEllipseNurbs(
  bk: BrepkitKernel,
  center: [number, number, number],
  normal: [number, number, number],
  majorRadius: number,
  minorRadius: number,
  startAngle: number,
  endAngle: number,
  xDir?: [number, number, number]
): KernelShape {
  const len = Math.sqrt(normal[0] ** 2 + normal[1] ** 2 + normal[2] ** 2);
  const nz = [normal[0] / len, normal[1] / len, normal[2] / len];

  let xAxis: number[];
  if (xDir) {
    const xl = Math.sqrt(xDir[0] ** 2 + xDir[1] ** 2 + xDir[2] ** 2);
    xAxis = [xDir[0] / xl, xDir[1] / xl, xDir[2] / xl];
  } else {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
    const ref = Math.abs(nz[0]!) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    xAxis = [
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
      nz[1]! * ref[2]! - nz[2]! * ref[1]!,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
      nz[2]! * ref[0]! - nz[0]! * ref[2]!,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
      nz[0]! * ref[1]! - nz[1]! * ref[0]!,
    ];
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
    const xLen2 = Math.sqrt(xAxis[0]! ** 2 + xAxis[1]! ** 2 + xAxis[2]! ** 2);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
    xAxis[0]! /= xLen2;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
    xAxis[1]! /= xLen2;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
    xAxis[2]! /= xLen2;
  }
  const yAxis = [
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
    nz[1]! * xAxis[2]! - nz[2]! * xAxis[1]!,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
    nz[2]! * xAxis[0]! - nz[0]! * xAxis[2]!,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
    nz[0]! * xAxis[1]! - nz[1]! * xAxis[0]!,
  ];

  const nSegments = Math.ceil(Math.abs(endAngle - startAngle) / (Math.PI / 2));
  const dAngle = (endAngle - startAngle) / nSegments;

  const controlPoints: number[] = [];
  const weights: number[] = [];

  for (let i = 0; i <= nSegments; i++) {
    const angle = startAngle + i * dAngle;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
    const px = center[0] + majorRadius * cos * xAxis[0]! + minorRadius * sin * yAxis[0]!;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
    const py = center[1] + majorRadius * cos * xAxis[1]! + minorRadius * sin * yAxis[1]!;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
    const pz = center[2] + majorRadius * cos * xAxis[2]! + minorRadius * sin * yAxis[2]!;

    if (i > 0) {
      const midAngle = startAngle + (i - 0.5) * dAngle;
      const midCos = Math.cos(midAngle);
      const midSin = Math.sin(midAngle);
      const scl = 1 / Math.cos(dAngle / 2);
      const mx =
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
        center[0] + majorRadius * scl * midCos * xAxis[0]! + minorRadius * scl * midSin * yAxis[0]!;
      const my =
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
        center[1] + majorRadius * scl * midCos * xAxis[1]! + minorRadius * scl * midSin * yAxis[1]!;
      const mz =
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
        center[2] + majorRadius * scl * midCos * xAxis[2]! + minorRadius * scl * midSin * yAxis[2]!;
      controlPoints.push(mx, my, mz);
      weights.push(Math.cos(dAngle / 2));
    }

    controlPoints.push(px, py, pz);
    weights.push(1);
  }

  const degree = 2;
  const knots: number[] = Array(degree + 1).fill(0);
  for (let i = 1; i < nSegments; i++) {
    knots.push(i, i);
  }
  knots.push(...Array(degree + 1).fill(nSegments));

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
  const kMax = knots[knots.length - 1]!;
  for (let i = 0; i < knots.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
    knots[i] = knots[i]! / kMax;
  }

  const startPt = controlPoints.slice(0, 3);
  const endPt = controlPoints.slice(-3);

  const id = bk.makeNurbsEdge(
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
    startPt[0]!,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
    startPt[1]!,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
    startPt[2]!,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
    endPt[0]!,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
    endPt[1]!,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM array index
    endPt[2]!,
    degree,
    knots,
    controlPoints,
    weights
  );
  return edgeHandle(id);
}
