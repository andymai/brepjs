/**
 * Sweep / loft / revolve / extrusion operations for the occt-wasm adapter.
 *
 * @module
 */

import type { KernelShape, KernelType } from '@/kernel/types.js';
import type { OcctKernelWasm, OcctWasmModule } from './occtWasmTypes.js';
import { makeVecU32, unwrap, wrapResult } from './helpers.js';

// occt-wasm SweepMode / SweepContact / TransitionMode ordinals. Mirrored rather
// than imported so the adapter keeps working against the raw Embind kernel,
// which carries no enum objects.
const SWEEP_MODE_FIXED = 0;
const SWEEP_MODE_FRENET = 1;
const SWEEP_MODE_AUXILIARY = 3;
const GUIDE_CONTACT_NONE = 0;

/**
 * Map brepjs's transition mode onto BRepBuilderAPI_TransitionMode, matching
 * `getTransitionMode` in the opencascade adapter. Absent means Transformed,
 * which is what OCCT applies when SetTransitionMode is never called.
 */
function transitionModeValue(mode?: 'transformed' | 'round' | 'right'): number {
  switch (mode) {
    case 'round':
      return 2;
    case 'right':
      return 1;
    case 'transformed':
    default:
      return 0;
  }
}

export function extrude(
  k: OcctKernelWasm,
  face: KernelShape,
  direction: [number, number, number],
  length: number
): KernelShape {
  const dx = direction[0] * length;
  const dy = direction[1] * length;
  const dz = direction[2] * length;
  return wrapResult(k, k.extrude(unwrap(face), dx, dy, dz));
}

export function revolve(
  k: OcctKernelWasm,
  shape: KernelShape,
  axis: KernelType,
  angle: number
): KernelShape {
  // axis is a KernelType from createAxis1
  const o = axis.origin;
  const d = axis.direction;
  return wrapResult(k, k.revolve(unwrap(shape), o.x, o.y, o.z, d.x, d.y, d.z, angle));
}

export function loft(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  wires: KernelShape[],
  ruled?: boolean,
  startShape?: KernelShape,
  endShape?: KernelShape
): KernelShape {
  const startV = startShape ? unwrap(startShape) : 0;
  const endV = endShape ? unwrap(endShape) : 0;
  const vec = makeVecU32(Module, wires.map(unwrap));
  try {
    if (startV || endV) {
      return wrapResult(k, k.loftWithVertices(vec, true, ruled ?? false, startV, endV));
    }
    return wrapResult(k, k.loft(vec, true, ruled ?? false));
  } finally {
    vec.delete();
  }
}

export function sweep(
  k: OcctKernelWasm,
  wire: KernelShape,
  spine: KernelShape,
  options?: { transitionMode?: number }
): KernelShape {
  const mode = options?.transitionMode ?? 0;
  return wrapResult(k, k.sweep(unwrap(wire), unwrap(spine), mode));
}

export function simplePipe(
  k: OcctKernelWasm,
  profile: KernelShape,
  spine: KernelShape
): KernelShape {
  return wrapResult(k, k.simplePipe(unwrap(profile), unwrap(spine)));
}

export function sweepPipeShell(
  k: OcctKernelWasm,
  profile: KernelShape,
  spine: KernelShape,
  options?: {
    transitionMode?: 'transformed' | 'round' | 'right';
    auxiliary?: KernelShape;
    law?: KernelType;
    contact?: boolean;
    correction?: boolean;
    frenet?: boolean;
    support?: KernelType;
    shellMode?: boolean;
    tolerance?: number | undefined;
    boundTolerance?: number | undefined;
    angularTolerance?: number | undefined;
    maxDegree?: number | undefined;
    maxSegments?: number | undefined;
  }
): KernelShape | { shape: KernelShape; firstShape: KernelShape; lastShape: KernelShape } {
  const shellMode = options?.shellMode ?? false;

  // A guide overrides Frenet, matching the opencascade adapter's ordering
  // (SetMode_5 is applied after SetMode_1 there).
  const auxiliary = options?.auxiliary;
  const mode = auxiliary
    ? SWEEP_MODE_AUXILIARY
    : options?.frenet
      ? SWEEP_MODE_FRENET
      : SWEEP_MODE_FIXED;

  // OCCT's SetTolerance defaults are absolute; mirror the opencascade adapter's
  // fallbacks rather than the facade's so both kernels approximate alike.
  const tolerance = options?.tolerance;
  const tol3d = tolerance ?? 0;
  const boundTol = tolerance === undefined ? 0 : (options?.boundTolerance ?? tolerance);
  const tolAngular = tolerance === undefined ? 0 : (options?.angularTolerance ?? 1e-7);

  const result = wrapResult(
    k,
    k.sweepAdvanced(
      unwrap(profile),
      unwrap(spine),
      mode,
      0,
      0,
      1,
      auxiliary ? unwrap(auxiliary) : 0,
      false,
      GUIDE_CONTACT_NONE,
      transitionModeValue(options?.transitionMode),
      options?.contact ?? false,
      options?.correction ?? false,
      tol3d,
      boundTol,
      tolAngular
    )
  );
  if (shellMode) {
    const edges = k.getSubShapes(unwrap(result), 'wire');
    try {
      const firstWire = edges.size() > 0 ? wrapResult(k, edges.get(0)) : result;
      const lastWire = edges.size() > 1 ? wrapResult(k, edges.get(edges.size() - 1)) : result;
      return { shape: result, firstShape: firstWire, lastShape: lastWire };
    } finally {
      edges.delete();
    }
  }
  return result;
}

export function loftAdvanced(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  wires: KernelShape[],
  options?: {
    solid?: boolean;
    ruled?: boolean;
    tolerance?: number;
    startVertex?: KernelShape;
    endVertex?: KernelShape;
  }
): KernelShape {
  const isSolid = options?.solid ?? true;
  const ruled = options?.ruled ?? false;
  const startV = options?.startVertex ? unwrap(options.startVertex) : 0;
  const endV = options?.endVertex ? unwrap(options.endVertex) : 0;
  const vec = makeVecU32(Module, wires.map(unwrap));
  try {
    if (startV || endV) {
      return wrapResult(k, k.loftWithVertices(vec, isSolid, ruled, startV, endV));
    }
    return wrapResult(k, k.loft(vec, isSolid, ruled));
  } finally {
    vec.delete();
  }
}

export function buildExtrusionLaw(
  _k: OcctKernelWasm,
  profile: 'linear' | 's-curve',
  length: number,
  endFactor: number
): KernelType {
  // Return a JS law object with Trim method (matching OCCT Law_Linear/Law_S)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- opaque law object
  const law: any = {
    __occtWasmLaw: true,
    profile,
    length,
    endFactor,
    Trim(first: number, last: number, _tol: number) {
      return { ...law, trimFirst: first, trimLast: last };
    },
    delete() {
      /* no-op */
    },
  };
  return law;
}

export function revolveVec(
  k: OcctKernelWasm,
  shape: KernelShape,
  center: [number, number, number],
  direction: [number, number, number],
  angle: number
): KernelShape {
  return wrapResult(
    k,
    k.revolveVec(
      unwrap(shape),
      center[0],
      center[1],
      center[2],
      direction[0],
      direction[1],
      direction[2],
      angle
    )
  );
}

export function draftPrism(
  k: OcctKernelWasm,
  shape: KernelShape,
  _face: KernelShape,
  _baseFace: KernelShape,
  height: number | null,
  angleDeg: number,
  _fuse: boolean
): KernelShape {
  // The C++ facade takes (shapeId, dx, dy, dz, angleDeg). Assume extrusion along Z.
  const h = height ?? 10;
  return wrapResult(k, k.draftPrism(unwrap(shape), 0, 0, h, angleDeg));
}
