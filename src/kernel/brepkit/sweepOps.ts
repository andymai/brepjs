/**
 * Sweep, loft, and extrusion operations for the brepkit adapter.
 * @module
 */

import type { BrepkitKernel } from '../brepkitWasmTypes.js';
import type { KernelShape, KernelType } from '../types.js';
import { type BrepkitHandle, solidHandle, unwrap, noop, warnOnce } from './helpers.js';
import { extractNurbsFromEdge } from './internalOps.js';
import { iterShapes } from './topologyOps.js';
import { surfaceNormal } from './geometryOps.js';
import { fuse } from './booleanOps.js';

export function extrude(
  bk: BrepkitKernel,
  face: KernelShape,
  direction: [number, number, number],
  length: number
): KernelShape {
  const id = bk.extrude(unwrap(face, 'face'), direction[0], direction[1], direction[2], length);
  return solidHandle(id);
}

export function revolve(
  bk: BrepkitKernel,
  shape: KernelShape,
  axis: KernelType,
  angle: number
): KernelShape {
  if (axis && typeof axis === 'object' && 'origin' in axis && 'direction' in axis) {
    const { origin, direction } = axis as {
      origin: [number, number, number];
      direction: [number, number, number];
    };
    let angleDeg = angle * (180 / Math.PI);
    if (angleDeg > 360) angleDeg = 360;
    const id = bk.revolve(
      unwrap(shape, 'face'),
      origin[0],
      origin[1],
      origin[2],
      direction[0],
      direction[1],
      direction[2],
      angleDeg
    );
    return solidHandle(id);
  }
  throw new Error('brepkit: revolve requires axis with origin and direction');
}

export function revolveVec(
  bk: BrepkitKernel,
  shape: KernelShape,
  center: [number, number, number],
  direction: [number, number, number],
  angle: number
): KernelShape {
  let angleDeg = angle * (180 / Math.PI);
  if (angleDeg > 360) angleDeg = 360;
  const id = bk.revolve(
    unwrap(shape, 'face'),
    center[0],
    center[1],
    center[2],
    direction[0],
    direction[1],
    direction[2],
    angleDeg
  );
  return solidHandle(id);
}

export function loft(
  bk: BrepkitKernel,
  wires: KernelShape[],
  _ruled?: boolean,
  _startShape?: KernelShape,
  _endShape?: KernelShape
): KernelShape {
  if (_ruled !== undefined || _startShape !== undefined || _endShape !== undefined) {
    warnOnce('loft-options', 'Loft options (ruled, startShape, endShape) not supported; ignored.');
  }
  const faceIds = wires.map((w) => {
    const h = w as BrepkitHandle;
    if (h.type === 'wire') {
      return bk.makeFaceFromWire(h.id);
    }
    return unwrap(w, 'face');
  });
  const id = bk.loft(faceIds);
  return solidHandle(id);
}

export function sweep(
  bk: BrepkitKernel,
  wire: KernelShape,
  spine: KernelShape,
  _options?: { transitionMode?: number }
): KernelShape {
  if (_options?.transitionMode !== undefined) {
    warnOnce('sweep-transition', 'Sweep transition mode not supported; ignored.');
  }

  const profileHandle = wire as BrepkitHandle;
  const faceId =
    profileHandle.type === 'wire' ? bk.makeFaceFromWire(profileHandle.id) : unwrap(wire, 'face');

  const spineHandle = spine as BrepkitHandle;

  if (spineHandle.type === 'wire') {
    const edges = iterShapes(bk, spine, 'edge');
    const edgeIds = edges.map((e) => unwrap(e, 'edge'));
    const id = bk.sweepAlongEdges(faceId, edgeIds);
    return solidHandle(id);
  }

  const nurbsData = extractNurbsFromEdge(bk, spine);
  if (!nurbsData) {
    throw new Error('brepkit: sweep spine must be an edge or wire');
  }
  const id = bk.sweep(
    faceId,
    nurbsData.degree,
    nurbsData.knots,
    nurbsData.controlPoints,
    nurbsData.weights
  );
  return solidHandle(id);
}

export function simplePipe(
  bk: BrepkitKernel,
  profile: KernelShape,
  spine: KernelShape
): KernelShape {
  const profileHandle = profile as BrepkitHandle;
  const faceId =
    profileHandle.type === 'wire' ? bk.makeFaceFromWire(profileHandle.id) : unwrap(profile, 'face');

  const spineHandle = spine as BrepkitHandle;

  if (spineHandle.type === 'wire') {
    const edges = iterShapes(bk, spine, 'edge');
    const edgeIds = edges.map((e) => unwrap(e, 'edge'));
    const id = bk.sweepAlongEdges(faceId, edgeIds);
    return solidHandle(id);
  }

  const nurbsData = extractNurbsFromEdge(bk, spine);
  if (!nurbsData) {
    throw new Error('brepkit: pipe spine must be an edge or wire');
  }
  const id = bk.pipe(
    faceId,
    nurbsData.degree,
    nurbsData.knots,
    nurbsData.controlPoints,
    nurbsData.weights
  );
  return solidHandle(id);
}

export function helicalSweep(
  bk: BrepkitKernel,
  profile: KernelShape,
  axisOrigin: [number, number, number],
  axisDirection: [number, number, number],
  radius: number,
  pitch: number,
  turns: number
): KernelShape {
  const profileId = unwrap(profile, 'face');
  return solidHandle(
    bk.helicalSweep(
      profileId,
      axisOrigin[0],
      axisOrigin[1],
      axisOrigin[2],
      axisDirection[0],
      axisDirection[1],
      axisDirection[2],
      radius,
      pitch,
      turns
    )
  );
}

export function sweepWithOptions(
  bk: BrepkitKernel,
  profile: KernelShape,
  pathEdge: KernelShape,
  contactMode: string,
  scaleValues: number[],
  segments: number
): KernelShape {
  const profileId = unwrap(profile, 'face');
  const pathId = unwrap(pathEdge, 'edge');
  return solidHandle(bk.sweepWithOptions(profileId, pathId, contactMode, scaleValues, segments));
}

export function sweepPipeShell(
  bk: BrepkitKernel,
  profile: KernelShape,
  spine: KernelShape,
  options?: Record<string, unknown>
): KernelShape | { shape: KernelShape; firstShape: KernelShape; lastShape: KernelShape } {
  const profileHandle = profile as BrepkitHandle;
  const faceId =
    profileHandle.type === 'wire' ? bk.makeFaceFromWire(profileHandle.id) : unwrap(profile, 'face');

  const shellMode = !!(options && options['shellMode']);

  const nurbsData = extractNurbsFromEdge(bk, spine);
  if (nurbsData && nurbsData.degree > 1) {
    try {
      const id = bk.sweepSmooth(
        faceId,
        nurbsData.degree,
        nurbsData.knots,
        nurbsData.controlPoints,
        nurbsData.weights
      );
      const shape = solidHandle(id);
      if (shellMode) return { shape, firstShape: profile, lastShape: profile };
      return shape;
    } catch (e: unknown) {
      console.warn('brepkit: sweepSmooth failed, falling back to simplePipe:', e);
    }
  }
  const shape = simplePipe(bk, profile, spine);
  if (shellMode) return { shape, firstShape: profile, lastShape: profile };
  return shape;
}

export function loftAdvanced(
  bk: BrepkitKernel,
  wires: KernelShape[],
  options?: {
    solid?: boolean;
    ruled?: boolean;
    startVertex?: KernelShape;
    endVertex?: KernelShape;
    tolerance?: number;
  }
): KernelShape {
  const faceIds: number[] = wires.map((w) => {
    const h = w as BrepkitHandle;
    if (h.type === 'wire') return bk.makeFaceFromWire(h.id);
    return unwrap(w, 'face');
  });

  try {
    const opts: Record<string, unknown> = {};
    if (options?.ruled !== undefined) opts['ruled'] = options.ruled;
    if (options?.solid !== undefined) opts['solid'] = options.solid;
    if (options?.tolerance !== undefined) opts['tolerance'] = options.tolerance;
    if (options?.startVertex) {
      const pos = bk.getVertexPosition(unwrap(options.startVertex, 'vertex'));
      opts['startPoint'] = [pos[0], pos[1], pos[2]];
    }
    if (options?.endVertex) {
      const pos = bk.getVertexPosition(unwrap(options.endVertex, 'vertex'));
      opts['endPoint'] = [pos[0], pos[1], pos[2]];
    }
    const id = bk.loftWithOptions(faceIds, JSON.stringify(opts));
    return solidHandle(id);
  } catch (e: unknown) {
    console.warn('brepkit: loftWithOptions failed, falling back to smooth/basic loft:', e);
  }

  if (!options?.ruled) {
    try {
      const id = bk.loftSmooth(faceIds);
      return solidHandle(id);
    } catch (e: unknown) {
      console.warn('brepkit: loftSmooth failed, falling back to basic loft:', e);
    }
  }
  return loft(bk, wires);
}

export function buildExtrusionLaw(
  _bk: BrepkitKernel,
  profile: 'linear' | 's-curve',
  length: number,
  endFactor: number
): KernelType {
  const law = {
    type: 'extrusionLaw',
    profile,
    length,
    endFactor,
    Trim(_first: number, _last: number, _tol: number) {
      return law;
    },
    delete: noop,
  };
  return law;
}

export function draftPrism(
  bk: BrepkitKernel,
  shape: KernelShape,
  face: KernelShape,
  _baseFace: KernelShape,
  height: number | null,
  _angleDeg: number,
  fuseBool: boolean
): KernelShape {
  if (height !== null) {
    const normal = surfaceNormal(bk, face, 0, 0);
    const extruded = extrude(bk, face, normal, height);
    if (fuseBool) {
      return fuse(bk, shape, extruded);
    }
    return extruded;
  }
  return shape;
}
