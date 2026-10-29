/**
 * Shape modifier operations for the occt-wasm adapter.
 *
 * @module
 */

import type { KernelShape } from '@/kernel/types.js';
import type { OcctKernelWasm, OcctWasmModule } from './occtWasmTypes.js';
import {
  draftAnglesRad,
  makeVecDouble,
  makeVecU32,
  needsOcctWasm59,
  reportingFaultyEdges,
  runEdgeTreatment,
  unwrap,
  wrapResult,
} from './helpers.js';
import type { EdgeValueSpec } from './helpers.js';
import { UnsupportedKernelOperationError } from '@/kernel/unsupported.js';

// occt's hashCode upper bound (INT_MAX). Mirrors core's HASH_CODE_MAX but is kept
// kernel-local so this layer-0 file need not import from core (layer 1); the
// kernel-agnostic filletVariable spec stores edge hashes at this bound, so the
// resolution below must hash with the same value.
const HASH_UPPER_BOUND = 2147483647;

export function fillet(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shape: KernelShape,
  edges: KernelShape[],
  radius: EdgeValueSpec
): KernelShape {
  const id = unwrap(shape);
  const resultId = runEdgeTreatment(
    Module,
    edges,
    radius,
    (edgeVec, r) => k.fillet(id, edgeVec, r),
    (edgeVec, startRadii, endRadii) => {
      if (!k.filletRadii) throw needsOcctWasm59('per-edge or tapered fillet radii');
      return k.filletRadii(id, edgeVec, startRadii, endRadii);
    }
  );
  return wrapResult(k, resultId);
}

export function chamfer(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shape: KernelShape,
  edges: KernelShape[],
  distance: EdgeValueSpec
): KernelShape {
  const id = unwrap(shape);
  // No reference faces: each edge sets distance1 back on its first adjacent face.
  const faceVec = makeVecU32(Module, []);
  try {
    const resultId = runEdgeTreatment(
      Module,
      edges,
      distance,
      (edgeVec, d) => k.chamfer(id, edgeVec, d),
      (edgeVec, distances1, distances2) => {
        if (!k.chamferDistances) throw needsOcctWasm59('per-edge or asymmetric chamfer distances');
        return k.chamferDistances(id, edgeVec, distances1, distances2, faceVec);
      }
    );
    return wrapResult(k, resultId);
  } finally {
    faceVec.delete();
  }
}

interface DistAngle {
  readonly distance: number;
  readonly angleDeg: number;
}

/**
 * Chamfer edge i by `distances[i]` and `anglesDeg[i]`. Builds without the
 * per-edge entry point take only `shared`, the one value every edge has.
 */
function runChamferDistAngles(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shape: KernelShape,
  edges: readonly KernelShape[],
  distances: number[],
  anglesDeg: number[],
  shared: DistAngle | undefined
): KernelShape {
  const id = unwrap(shape);
  const edgeVec = makeVecU32(Module, edges.map(unwrap));
  try {
    if (!k.chamferDistAngles) {
      if (!shared) throw needsOcctWasm59('per-edge distance-angle chamfers');
      return wrapResult(k, k.chamferDistAngle(id, edgeVec, shared.distance, shared.angleDeg));
    }
    // chamferDistAngles names the edges a failed chamfer could not build;
    // the single-value chamferDistAngle does not.
    const chamferDistAngles = k.chamferDistAngles.bind(k);
    const distanceVec = makeVecDouble(Module, distances);
    const angleVec = makeVecDouble(Module, anglesDeg);
    // No reference faces: each edge's distance is set back on its first adjacent face.
    const faceVec = makeVecU32(Module, []);
    try {
      const resultId = reportingFaultyEdges(edges, () =>
        chamferDistAngles(id, edgeVec, distanceVec, angleVec, faceVec)
      );
      return wrapResult(k, resultId);
    } finally {
      distanceVec.delete();
      angleVec.delete();
      faceVec.delete();
    }
  } finally {
    edgeVec.delete();
  }
}

export function chamferDistAngle(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shape: KernelShape,
  edges: KernelShape[],
  distance: number,
  angleDeg: number
): KernelShape {
  const distances = Array<number>(edges.length).fill(distance);
  const anglesDeg = Array<number>(edges.length).fill(angleDeg);
  return runChamferDistAngles(k, Module, shape, edges, distances, anglesDeg, {
    distance,
    angleDeg,
  });
}

/** The distance and angle every edge takes, or `undefined` when they differ. */
function sharedDistAngle(entries: readonly DistAngle[]): DistAngle | undefined {
  const [first] = entries;
  if (first === undefined) return undefined;
  const same = entries.every((e) => e.distance === first.distance && e.angleDeg === first.angleDeg);
  return same ? first : undefined;
}

export function chamferDistAngles(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shape: KernelShape,
  entries: ReadonlyArray<{ edge: KernelShape } & DistAngle>
): KernelShape {
  return runChamferDistAngles(
    k,
    Module,
    shape,
    entries.map((e) => e.edge),
    entries.map((e) => e.distance),
    entries.map((e) => e.angleDeg),
    sharedDistAngle(entries)
  );
}

export function shell(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shape: KernelShape,
  faces: KernelShape[],
  thickness: number,
  tolerance?: number
): KernelShape {
  const vec = makeVecU32(Module, faces.map(unwrap));
  try {
    return wrapResult(k, k.shell(unwrap(shape), vec, thickness, tolerance ?? 1e-3));
  } finally {
    vec.delete();
  }
}

export function thicken(k: OcctKernelWasm, shape: KernelShape, thickness: number): KernelShape {
  // 1e-3 matches OCCT's pre-3.0 hardcoded default; thicken's tolerance isn't
  // exposed via brepjs's KernelInstance interface.
  return wrapResult(k, k.thicken(unwrap(shape), thickness, 1e-3));
}

export function offset(
  k: OcctKernelWasm,
  shape: KernelShape,
  distance: number,
  tolerance?: number
): KernelShape {
  return wrapResult(k, k.offset(unwrap(shape), distance, tolerance ?? 1e-6));
}

/**
 * Run occt-wasm's variable-fillet primitive and return the resulting solid.
 * The primitive wraps its result in a single-solid compound (uniform fillet
 * returns a bare solid); getSubShapes copies that solid into its own arena slot,
 * so keep it and release the compound wrapper. An unexpected topology (zero or
 * several solids) is returned as-is for the caller to reject.
 */
function runFilletVariable(
  k: OcctKernelWasm,
  shapeId: number,
  edgeId: number,
  startRadius: number,
  endRadius: number
): KernelShape {
  const resultId = k.filletVariable(shapeId, edgeId, startRadius, endRadius);
  // Release resultId on any failure before it is either handed to the caller
  // (unexpected topology) or released as the compound wrapper below — otherwise a
  // throw from getSubShapes would leak it.
  let releaseResult = true;
  try {
    const solids = k.getSubShapes(resultId, 'solid');
    try {
      const kept = solids.size() === 1 ? solids.get(0) : -1;
      for (let i = 0, n = solids.size(); i < n; i++) {
        const id = solids.get(i);
        if (id !== kept) k.release(id);
      }
      if (kept === -1) {
        releaseResult = false;
        return wrapResult(k, resultId);
      }
      return wrapResult(k, kept);
    } finally {
      solids.delete();
    }
  } finally {
    if (releaseResult) k.release(resultId);
  }
}

export function filletVariable(k: OcctKernelWasm, shape: KernelShape, spec: string): KernelShape {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON parse of a kernel-agnostic spec
  const parsed: any = JSON.parse(spec);

  // Legacy explicit form: { edgeId, startRadius, endRadius }.
  if (
    parsed.edgeId !== undefined &&
    parsed.startRadius !== undefined &&
    parsed.endRadius !== undefined
  ) {
    return runFilletVariable(k, unwrap(shape), parsed.edgeId, parsed.startRadius, parsed.endRadius);
  }

  // Form emitted by the high-level variableFillet: { edge: hashCode, radii: [{param, radius}] }.
  // occt-wasm's primitive builds a single linear start->end taper on one edge, so a constant
  // (1-point) or linear (2-point) profile maps directly onto it. A genuine multi-point profile
  // can't be represented and stays unsupported rather than being silently flattened to a line.
  if (parsed.edge !== undefined && Array.isArray(parsed.radii) && parsed.radii.length > 0) {
    const radii = parsed.radii;
    if (radii.length > 2) {
      throw new UnsupportedKernelOperationError(
        'occt-wasm: filletVariable supports only a linear (<=2-point) radius profile; ' +
          'a multi-point variable radius requires the brepkit kernel'
      );
    }
    const startRadius = radii[0].radius;
    const endRadius = radii[radii.length - 1].radius;
    // The spec is kernel-agnostic and identifies the edge by stable hash (brepkit resolves it
    // natively); occt-wasm's primitive takes the edge's arena slot id, so resolve the hash
    // against the solid's edges. getSubShapes copies each edge into its own slot, so release
    // every queried copy except the matched one (freed after the fillet runs).
    const shapeId = unwrap(shape);
    const edgeVec = k.getSubShapes(shapeId, 'edge');
    let matchedEdgeId = -1;
    try {
      for (let i = 0, n = edgeVec.size(); i < n; i++) {
        const id = edgeVec.get(i);
        if (k.hashCode(id, HASH_UPPER_BOUND) === parsed.edge) {
          matchedEdgeId = id;
          break;
        }
      }
    } finally {
      for (let i = 0, n = edgeVec.size(); i < n; i++) {
        const id = edgeVec.get(i);
        if (id !== matchedEdgeId) k.release(id);
      }
      edgeVec.delete();
    }
    if (matchedEdgeId === -1) {
      throw new UnsupportedKernelOperationError(
        'occt-wasm: filletVariable: target edge not found on the shape'
      );
    }
    try {
      return runFilletVariable(k, shapeId, matchedEdgeId, startRadius, endRadius);
    } finally {
      k.release(matchedEdgeId);
    }
  }

  throw new UnsupportedKernelOperationError('occt-wasm: filletVariable: unrecognized spec');
}

/**
 * Before 5.9 occt-wasm drafts one face per call about the XY plane through the
 * origin. That is the caller's plane (through `neutralPlane`, normal to the
 * pull) only for a pull along Z and a point at z = 0.
 */
function legacyDraft(
  k: OcctKernelWasm,
  shape: KernelShape,
  faces: KernelShape[],
  pullDirection: [number, number, number],
  neutralPlane: [number, number, number],
  anglesRad: number[]
): KernelShape {
  const [face] = faces;
  const [angle] = anglesRad;
  const [dx, dy, dz] = pullDirection;
  const fits = faces.length === 1 && dx === 0 && dy === 0 && neutralPlane[2] === 0;
  if (!fits || face === undefined || angle === undefined) {
    throw needsOcctWasm59('drafting several faces, or about a neutral plane off z = 0,');
  }
  return wrapResult(k, k.draft(unwrap(shape), unwrap(face), angle, dx, dy, dz));
}

/** Draft every face in one operation about the plane through `neutralPlane` normal to the pull. */
export function draft(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shape: KernelShape,
  faces: KernelShape[],
  pullDirection: [number, number, number],
  neutralPlane: [number, number, number],
  angleDeg: number | ((face: KernelShape) => number)
): KernelShape {
  const anglesRad = draftAnglesRad(faces, angleDeg);
  if (!k.draftFaces) return legacyDraft(k, shape, faces, pullDirection, neutralPlane, anglesRad);
  const faceVec = makeVecU32(Module, faces.map(unwrap));
  const angleVec = makeVecDouble(Module, anglesRad);
  try {
    return wrapResult(
      k,
      k.draftFaces(
        unwrap(shape),
        faceVec,
        angleVec,
        ...pullDirection,
        ...neutralPlane,
        ...pullDirection
      )
    );
  } finally {
    faceVec.delete();
    angleVec.delete();
  }
}

export function defeature(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shape: KernelShape,
  faces: KernelShape[]
): KernelShape {
  const vec = makeVecU32(Module, faces.map(unwrap));
  try {
    return wrapResult(k, k.defeature(unwrap(shape), vec, 0));
  } finally {
    vec.delete();
  }
}

export function offsetWire2D(
  k: OcctKernelWasm,
  wire: KernelShape,
  offset: number,
  joinType?: number | 'arc' | 'intersection' | 'tangent'
): KernelShape {
  let jt = 0; // arc
  if (joinType === 'intersection' || joinType === 1) jt = 1;
  else if (joinType === 'tangent' || joinType === 2) jt = 2;
  else if (typeof joinType === 'number') jt = joinType;
  return wrapResult(k, k.offsetWire2D(unwrap(wire), offset, jt));
}

export function simplify(k: OcctKernelWasm, shape: KernelShape): KernelShape {
  return wrapResult(k, k.simplify(unwrap(shape)));
}

export function reverseShape(k: OcctKernelWasm, shape: KernelShape): KernelShape {
  return wrapResult(k, k.reverseShape(unwrap(shape)));
}
