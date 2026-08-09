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

const LAW_NONE = 0;
const LAW_LINEAR = 1;
const LAW_S_CURVE = 2;

/**
 * The law object occt-wasm's adapter hands back from `buildExtrusionLaw`. The
 * kernel has no Law_Function handles to pass around, so the JS side carries
 * the shape of the law and the facade rebuilds it.
 */
interface OcctWasmLaw {
  __occtWasmLaw?: boolean;
  profile?: 'linear' | 's-curve';
  length?: number;
  endFactor?: number;
}

function lawKindValue(law: unknown): number {
  const p = (law as OcctWasmLaw | undefined)?.profile;
  if (p === 'linear') return LAW_LINEAR;
  if (p === 's-curve') return LAW_S_CURVE;
  return LAW_NONE;
}

const warnedOnce = new Set<string>();

/**
 * Name the options the resolved kernel cannot honour, once per shortfall.
 *
 * Older occt-wasm is still inside the peer range, so a sweep may land on a
 * narrower entry point than the caller's options need. Dropping those quietly
 * is the defect this module exists to remove, so say which ones and why.
 */
function warnUnhonoured(key: string, dropped: string[], since: string): void {
  if (dropped.length === 0 || warnedOnce.has(key)) return;
  warnedOnce.add(key);
  console.warn(`occt-wasm: sweep ignored ${dropped.join(', ')} — ${since}.`);
}

/** Split a pipe-shell result into its shape plus first/last wires. */
function splitShellWires(
  k: OcctKernelWasm,
  result: KernelShape
): { shape: KernelShape; firstShape: KernelShape; lastShape: KernelShape } {
  const edges = k.getSubShapes(unwrap(result), 'wire');
  try {
    const firstWire = edges.size() > 0 ? wrapResult(k, edges.get(0)) : result;
    const lastWire = edges.size() > 1 ? wrapResult(k, edges.get(edges.size() - 1)) : result;
    return { shape: result, firstShape: firstWire, lastShape: lastWire };
  } finally {
    edges.delete();
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

/** Options accepted by {@link sweepPipeShell}. */
interface SweepPipeShellOptions {
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

/** The subset of a sweep request every entry point shares, resolved once. */
interface ResolvedSweep {
  mode: number;
  transitionMode: number;
  auxiliaryId: number;
  contact: boolean;
  correction: boolean;
  tol3d: number;
  boundTol: number;
  tolAngular: number;
}

function resolveSweep(o: SweepPipeShellOptions | undefined): ResolvedSweep {
  // A guide overrides Frenet, matching the opencascade adapter's ordering
  // (SetMode_5 is applied after SetMode_1 there).
  const mode = o?.auxiliary
    ? SWEEP_MODE_AUXILIARY
    : o?.frenet
      ? SWEEP_MODE_FRENET
      : SWEEP_MODE_FIXED;

  // OCCT's SetTolerance defaults are absolute; mirror the opencascade adapter's
  // fallbacks rather than the facade's so both kernels approximate alike.
  const tolerance = o?.tolerance;
  return {
    mode,
    transitionMode: transitionModeValue(o?.transitionMode),
    auxiliaryId: o?.auxiliary ? unwrap(o.auxiliary) : 0,
    contact: o?.contact ?? false,
    correction: o?.correction ?? false,
    tol3d: tolerance ?? 0,
    boundTol: tolerance === undefined ? 0 : (o?.boundTolerance ?? tolerance),
    tolAngular: tolerance === undefined ? 0 : (o?.angularTolerance ?? 1e-7),
  };
}

/**
 * Sweep a profile along a spine.
 *
 * Three tiers, because the peer range still accepts kernels older than the
 * entry points these options need: sweepFull (>= 4.2.0) honours everything,
 * sweepAdvanced (>= 4.1.0) drops the law, support and approximation budget,
 * and the original sweepPipeShell drops the guide and placement too. Each
 * lower tier names what it could not honour rather than dropping it quietly.
 */
export function sweepPipeShell(
  k: OcctKernelWasm,
  profile: KernelShape,
  spine: KernelShape,
  options?: SweepPipeShellOptions
): KernelShape | { shape: KernelShape; firstShape: KernelShape; lastShape: KernelShape } {
  const shellMode = options?.shellMode ?? false;
  const r = resolveSweep(options);
  const lawKind = lawKindValue(options?.law);

  const result =
    typeof k.sweepFull === 'function'
      ? sweepViaFull(k, profile, spine, options, r, lawKind)
      : typeof k.sweepAdvanced === 'function'
        ? sweepViaAdvanced(k, profile, spine, options, r, lawKind)
        : sweepViaLegacy(k, profile, spine, options, lawKind);

  return shellMode ? splitShellWires(k, result) : result;
}

function sweepViaFull(
  k: OcctKernelWasm,
  profile: KernelShape,
  spine: KernelShape,
  o: SweepPipeShellOptions | undefined,
  r: ResolvedSweep,
  lawKind: number
): KernelShape {
  // OCCT rejects a support that does not carry the spine. sweepFull reports
  // that; the opencascade adapter discards the same signal and lets OCCT fall
  // back to its default frame, so retry without the support to keep the two
  // kernels agreeing — but say so, because the caller asked for something the
  // geometry could not provide.
  if (o?.support) {
    try {
      return sweepFullCall(k, profile, spine, o, r, lawKind, unwrap(o.support));
    } catch (e) {
      if (!(e instanceof Error) || !e.message.includes('not a valid spine support')) throw e;
      warnUnhonoured(
        'support-invalid',
        ['support'],
        'the support shape does not carry the spine, so OCCT swept with its default frame'
      );
      return sweepFullCall(k, profile, spine, o, r, lawKind, 0);
    }
  }
  return sweepFullCall(k, profile, spine, o, r, lawKind, 0);
}

function sweepFullCall(
  k: OcctKernelWasm,
  profile: KernelShape,
  spine: KernelShape,
  o: SweepPipeShellOptions | undefined,
  r: ResolvedSweep,
  lawKind: number,
  supportId: number
): KernelShape {
  const law = o?.law as OcctWasmLaw | undefined;
  if (typeof k.sweepFull !== 'function') {
    throw new Error('occt-wasm: sweepFull is unavailable');
  }
  return wrapResult(
    k,
    k.sweepFull(
      unwrap(profile),
      unwrap(spine),
      r.mode,
      0,
      0,
      1,
      r.auxiliaryId,
      false,
      GUIDE_CONTACT_NONE,
      r.transitionMode,
      r.contact,
      r.correction,
      r.tol3d,
      r.boundTol,
      r.tolAngular,
      supportId,
      o?.maxDegree ?? 0,
      o?.maxSegments ?? 0,
      lawKind,
      law?.length ?? 0,
      law?.endFactor ?? 1
    )
  );
}

function sweepViaAdvanced(
  k: OcctKernelWasm,
  profile: KernelShape,
  spine: KernelShape,
  o: SweepPipeShellOptions | undefined,
  r: ResolvedSweep,
  lawKind: number
): KernelShape {
  warnUnhonoured(
    'sweepFull',
    [
      ...(lawKind !== LAW_NONE ? ['law'] : []),
      ...(o?.support ? ['support'] : []),
      ...(o?.maxDegree ? ['maxDegree'] : []),
      ...(o?.maxSegments ? ['maxSegments'] : []),
    ],
    'sweepFull requires occt-wasm >= 4.2.0'
  );
  if (typeof k.sweepAdvanced !== 'function') {
    throw new Error('occt-wasm: sweepAdvanced is unavailable');
  }
  return wrapResult(
    k,
    k.sweepAdvanced(
      unwrap(profile),
      unwrap(spine),
      r.mode,
      0,
      0,
      1,
      r.auxiliaryId,
      false,
      GUIDE_CONTACT_NONE,
      r.transitionMode,
      r.contact,
      r.correction,
      r.tol3d,
      r.boundTol,
      r.tolAngular
    )
  );
}

function sweepViaLegacy(
  k: OcctKernelWasm,
  profile: KernelShape,
  spine: KernelShape,
  o: SweepPipeShellOptions | undefined,
  lawKind: number
): KernelShape {
  warnUnhonoured(
    'sweepAdvanced',
    [
      ...(o?.auxiliary ? ['auxiliary'] : []),
      ...(o?.contact ? ['contact'] : []),
      ...(o?.correction ? ['correction'] : []),
      ...(o?.tolerance !== undefined ? ['tolerance'] : []),
      ...(o?.transitionMode === 'right' ? ["transitionMode 'right'"] : []),
      ...(lawKind !== LAW_NONE ? ['law'] : []),
      ...(o?.support ? ['support'] : []),
      ...(o?.maxDegree ? ['maxDegree'] : []),
      ...(o?.maxSegments ? ['maxSegments'] : []),
    ],
    'sweepAdvanced requires occt-wasm >= 4.1.0'
  );
  return wrapResult(
    k,
    k.sweepPipeShell(
      unwrap(profile),
      unwrap(spine),
      o?.frenet ?? false,
      o?.transitionMode === 'round'
    )
  );
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
