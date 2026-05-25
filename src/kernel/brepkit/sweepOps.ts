/**
 * Sweep, loft, and extrusion operations for the brepkit adapter.
 * @module
 */

import type { BrepkitKernel } from './brepkitWasmTypes.js';
import type { KernelShape, KernelType } from '@/kernel/types.js';
import type { KernelAdapter } from '@/kernel/interfaces/index.js';
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

function mapNumericTransitionMode(mode: number): string | undefined {
  switch (mode) {
    case 0:
      return 'rmf';
    case 1:
      return 'rightCorner';
    case 2:
      return 'roundCorner';
    default:
      return undefined;
  }
}

export function sweep(
  bk: BrepkitKernel,
  wire: KernelShape,
  spine: KernelShape,
  options?: { transitionMode?: number }
): KernelShape {
  const contactMode =
    options?.transitionMode !== undefined
      ? mapNumericTransitionMode(options.transitionMode)
      : undefined;

  const profileHandle = wire as BrepkitHandle;
  const faceId =
    profileHandle.type === 'wire' ? bk.makeFaceFromWire(profileHandle.id) : unwrap(wire, 'face');

  const spineHandle = spine as BrepkitHandle;

  if (spineHandle.type === 'wire') {
    const edges = iterShapes(bk, spine, 'edge');
    const edgeIds = edges.map((e) => unwrap(e, 'edge'));

    if (contactMode && edgeIds.length === 1) {
      const edgeId = edgeIds[0];
      if (edgeId !== undefined) {
        return solidHandle(bk.sweepWithOptions(faceId, edgeId, contactMode, [], 0, 'transformed'));
      }
    }

    if (contactMode && edgeIds.length > 1) {
      warnOnce(
        'sweep-transition-multi-edge',
        'Sweep transition mode not supported for multi-edge wires; ignored.'
      );
    }

    const id = bk.sweepAlongEdges(faceId, edgeIds);
    return solidHandle(id);
  }

  if (contactMode) {
    const edgeId = unwrap(spine, 'edge');
    return solidHandle(bk.sweepWithOptions(faceId, edgeId, contactMode, [], 0, 'transformed'));
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
  return solidHandle(
    bk.sweepWithOptions(profileId, pathId, contactMode, scaleValues, segments, 'transformed')
  );
}

function mapStringTransitionMode(mode: string): string | undefined {
  switch (mode) {
    case 'right':
      return 'rightCorner';
    case 'round':
      return 'roundCorner';
    case 'transformed':
      return 'rmf';
    default:
      return undefined;
  }
}

type PipeShellResult =
  | KernelShape
  | { shape: KernelShape; firstShape: KernelShape; lastShape: KernelShape };

function wrapPipeShellResult(
  shape: KernelShape,
  profile: KernelShape,
  shellMode: boolean
): PipeShellResult {
  if (shellMode) return { shape, firstShape: profile, lastShape: profile };
  return shape;
}

function tryContactModeSweep(
  bk: BrepkitKernel,
  faceId: number,
  edgeId: number,
  contactMode: string
): KernelShape | undefined {
  try {
    return solidHandle(bk.sweepWithOptions(faceId, edgeId, contactMode, [], 0, 'transformed'));
  } catch (e: unknown) {
    console.warn('brepkit: sweepWithOptions failed, falling back to sweepSmooth/simplePipe:', e);
    return undefined;
  }
}

function resolveContactModeEdge(
  bk: BrepkitKernel,
  spine: KernelShape
): { edgeId: number } | undefined {
  // The original sweepPipeShell wrapped both the unwrap and the kernel call
  // in one try/catch so any unexpected spine type silently fell through to
  // sweepSmooth / simplePipe. The wrap must stay here to preserve that.
  try {
    const spineHandle = spine as BrepkitHandle;
    if (spineHandle.type !== 'wire') {
      return { edgeId: unwrap(spine, 'edge') };
    }
    const edges = iterShapes(bk, spine, 'edge');
    if (edges.length === 1) {
      const first = edges[0];
      if (first) return { edgeId: unwrap(first, 'edge') };
      return undefined;
    }
    warnOnce(
      'sweepPipeShell-transition-multi-edge',
      'sweepPipeShell transition mode not supported for multi-edge wires; ignored.'
    );
    return undefined;
  } catch (e: unknown) {
    console.warn(
      'brepkit: resolveContactModeEdge failed for unexpected spine type, falling through:',
      e
    );
    return undefined;
  }
}

function tryContactModePipeShell(
  bk: BrepkitKernel,
  faceId: number,
  spine: KernelShape,
  contactMode: string
): KernelShape | undefined {
  const resolved = resolveContactModeEdge(bk, spine);
  if (!resolved) return undefined;
  return tryContactModeSweep(bk, faceId, resolved.edgeId, contactMode);
}

function trySmoothPipeShell(
  bk: BrepkitKernel,
  faceId: number,
  spine: KernelShape
): KernelShape | undefined {
  const nurbsData = extractNurbsFromEdge(bk, spine);
  if (!nurbsData || nurbsData.degree <= 1) return undefined;
  try {
    const id = bk.sweepSmooth(
      faceId,
      nurbsData.degree,
      nurbsData.knots,
      nurbsData.controlPoints,
      nurbsData.weights
    );
    return solidHandle(id);
  } catch (e: unknown) {
    console.warn('brepkit: sweepSmooth failed, falling back to simplePipe:', e);
    return undefined;
  }
}

export function sweepPipeShell(
  bk: BrepkitKernel,
  profile: KernelShape,
  spine: KernelShape,
  options?: Record<string, unknown>
): PipeShellResult {
  const profileHandle = profile as BrepkitHandle;
  const faceId =
    profileHandle.type === 'wire' ? bk.makeFaceFromWire(profileHandle.id) : unwrap(profile, 'face');

  const shellMode = !!(options && options['shellMode']);
  const transitionMode = options?.['transitionMode'] as string | undefined;
  const contactMode = transitionMode ? mapStringTransitionMode(transitionMode) : undefined;

  if (contactMode) {
    const shape = tryContactModePipeShell(bk, faceId, spine, contactMode);
    if (shape) return wrapPipeShellResult(shape, profile, shellMode);
  }

  const smoothShape = trySmoothPipeShell(bk, faceId, spine);
  if (smoothShape) return wrapPipeShellResult(smoothShape, profile, shellMode);

  return wrapPipeShellResult(simplePipe(bk, profile, spine), profile, shellMode);
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

/** Co-located factory: returns the sweep slice of {@link KernelAdapter} bound to `bk`. */
export function makeSweepOps(bk: BrepkitKernel) {
  return {
    extrude: (face, direction, length) => extrude(bk, face, direction, length),
    revolve: (shape, axis, angle) => revolve(bk, shape, axis, angle),
    revolveVec: (shape, center, direction, angle) =>
      revolveVec(bk, shape, center, direction, angle),
    loft: (wires, ruled, startShape, endShape) => loft(bk, wires, ruled, startShape, endShape),
    sweep: (wire, spine, options) => sweep(bk, wire, spine, options),
    simplePipe: (profile, spine) => simplePipe(bk, profile, spine),
    helicalSweep: (profile, axisOrigin, axisDirection, radius, pitch, turns) =>
      helicalSweep(bk, profile, axisOrigin, axisDirection, radius, pitch, turns),
    sweepWithOptions: (profile, pathEdge, contactMode, scaleValues, segments) =>
      sweepWithOptions(bk, profile, pathEdge, contactMode, scaleValues, segments),
    sweepPipeShell: (profile, spine, options) => sweepPipeShell(bk, profile, spine, options),
    loftAdvanced: (wires, options) => loftAdvanced(bk, wires, options),
    buildExtrusionLaw: (profile, length, endFactor) =>
      buildExtrusionLaw(bk, profile, length, endFactor),
    draftPrism: (shape, face, baseFace, height, angleDeg, fuse) =>
      draftPrism(bk, shape, face, baseFace, height, angleDeg, fuse),
  } satisfies Pick<
    KernelAdapter,
    | 'extrude'
    | 'revolve'
    | 'revolveVec'
    | 'loft'
    | 'sweep'
    | 'simplePipe'
    | 'helicalSweep'
    | 'sweepWithOptions'
    | 'sweepPipeShell'
    | 'loftAdvanced'
    | 'buildExtrusionLaw'
    | 'draftPrism'
  >;
}
