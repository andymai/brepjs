import type { Vec3 } from '@/core/types.js';
import { type Result, ok, err, isErr } from '@/core/result.js';
import { validationError } from '@/core/errors.js';
import { DisposalScope } from '@/core/disposal.js';
import type { ClosedWire, Edge, PlanarWire } from '@/core/shapeTypes.js';
import {
  assembleWire,
  makeBSplineInterpolation,
  makeLine,
  makeThreePointArc,
} from '@/topology/curveBuilders.js';
import { firstOrThrow, lastOrThrow } from '@/utils/arrayAccess.js';
import {
  type GearGeometry,
  adaptiveSampleCount,
  cosineSpaceFlankSamples,
  gearGeometry,
  inv,
} from './gearMath.js';

function buildToothPeriodEdges(
  tm: GearGeometry,
  toothIndex: number,
  totalTeeth: number,
  samples: number,
  scope: DisposalScope
): Result<Edge[]> {
  const center = toothIndex * tm.toothPitch;
  const nextCenter = ((toothIndex + 1) % totalTeeth) * tm.toothPitch;
  const invPitch = inv(tm.alphaPitch);

  // θ(α) = θ0 + sign·inv(α); at α_pitch the involute must hit center ± halfToothAngle, so:
  //   left:  θ0 = center − halfToothAngle − inv(α_pitch)   (sign=+1)
  //   right: θ0 = center + halfToothAngle + inv(α_pitch)   (sign=-1)
  const thetaLeft = center - tm.halfToothAngle - invPitch;
  const thetaRight = center + tm.halfToothAngle + invPitch;

  // Right flank reversed so the edge chain runs base→tip→base→nextBase in geometric order.
  // Without this, the wire has a discontinuity that OCCT silently fixes via auto-reorientation
  // but brepkit doesn't, producing a face with reversed orientation.
  const leftFlank = cosineSpaceFlankSamples(tm.rb, tm.alphaTip, thetaLeft, samples, 1);
  const rightFlank = cosineSpaceFlankSamples(tm.rb, tm.alphaTip, thetaRight, samples, -1).reverse();
  const leftBase = firstOrThrow(leftFlank);
  const leftTip = lastOrThrow(leftFlank);
  const rightTip = firstOrThrow(rightFlank);
  const rightBase = lastOrThrow(rightFlank);

  const edges: Edge[] = [];
  const push = (e: Edge): void => {
    scope.register(e);
    edges.push(e);
  };

  // Root below base (external) or above it (internal): involute can't reach root; bridge radially.
  const needsRadialBridge = tm.isInternal ? tm.rb < tm.rRoot : tm.rb > tm.rRoot;
  if (needsRadialBridge) {
    const rootPt: Vec3 = [tm.rRoot * Math.cos(thetaLeft), tm.rRoot * Math.sin(thetaLeft), 0];
    push(makeLine(rootPt, leftBase));
  }

  const interpTol = tm.rPitch * 1e-5;
  const leftEdge = makeBSplineInterpolation(leftFlank, { tolerance: interpTol });
  if (isErr(leftEdge)) return leftEdge;
  push(leftEdge.value);

  const tipMid: Vec3 = [tm.rTip * Math.cos(center), tm.rTip * Math.sin(center), 0];
  push(makeThreePointArc(leftTip, tipMid, rightTip));

  const rightEdge = makeBSplineInterpolation(rightFlank, { tolerance: interpTol });
  if (isErr(rightEdge)) return rightEdge;
  push(rightEdge.value);

  if (needsRadialBridge) {
    const rootPt: Vec3 = [tm.rRoot * Math.cos(thetaRight), tm.rRoot * Math.sin(thetaRight), 0];
    push(makeLine(rightBase, rootPt));
  }

  const rootEndAngle = nextCenter - tm.halfToothAngle - invPitch;
  let midAngle = 0.5 * (thetaRight + rootEndAngle);
  if (rootEndAngle < thetaRight) midAngle += Math.PI; // CCW wrap on last tooth

  const rootStart: Vec3 = needsRadialBridge
    ? [tm.rRoot * Math.cos(thetaRight), tm.rRoot * Math.sin(thetaRight), 0]
    : rightBase;
  const rootMid: Vec3 = [tm.rRoot * Math.cos(midAngle), tm.rRoot * Math.sin(midAngle), 0];
  const nextLeftStart: Vec3 = needsRadialBridge
    ? [tm.rRoot * Math.cos(rootEndAngle), tm.rRoot * Math.sin(rootEndAngle), 0]
    : [tm.rb * Math.cos(rootEndAngle), tm.rb * Math.sin(rootEndAngle), 0];
  push(makeThreePointArc(rootStart, rootMid, nextLeftStart));

  return ok(edges);
}

export interface GearWireParams {
  teeth: number;
  moduleSize: number;
  /** Pressure angle in radians. */
  pressureAngle: number;
  shift: number;
  clearance: number;
  backlashHalf: number;
  /** Override sample count per flank; defaults to adaptiveSampleCount(moduleSize). */
  samples?: number;
}

export function makeExternalGearProfileWire(
  params: GearWireParams
): Result<ClosedWire & PlanarWire> {
  return makeProfileWire(params, false);
}

export function makeInternalGearProfileWire(
  params: GearWireParams
): Result<ClosedWire & PlanarWire> {
  return makeProfileWire(params, true);
}

function makeProfileWire(
  params: GearWireParams,
  isInternal: boolean
): Result<ClosedWire & PlanarWire> {
  const {
    teeth,
    moduleSize,
    pressureAngle,
    shift,
    clearance,
    backlashHalf,
    samples = adaptiveSampleCount(moduleSize),
  } = params;

  if (teeth < 4)
    return err(validationError('GEAR_TEETH_TOO_FEW', `gear needs ≥ 4 teeth, got ${teeth}`));
  if (moduleSize <= 0)
    return err(validationError('GEAR_MODULE_NONPOSITIVE', `module must be > 0, got ${moduleSize}`));

  const tm = gearGeometry(
    teeth,
    moduleSize,
    pressureAngle,
    shift,
    clearance,
    backlashHalf,
    isInternal
  );

  // Register every per-tooth edge with a disposal scope so a mid-loop failure
  // doesn't leak orphaned WASM handles. assembleWire deep-copies into the wire,
  // so disposing the registered edges after wire construction is safe.
  using scope = new DisposalScope();
  const allEdges: Edge[] = [];
  for (let i = 0; i < teeth; i++) {
    const periodEdges = buildToothPeriodEdges(tm, i, teeth, samples, scope);
    if (isErr(periodEdges)) return periodEdges;
    allEdges.push(...periodEdges.value);
  }

  const wireResult = assembleWire(allEdges);
  if (isErr(wireResult)) return wireResult;
  // Wire is closed and planar by construction (4·N edges chain end-to-end in XY);
  // skipping smart-constructor validation here because brepkit's isPlanarWire builds
  // a temporary face that interferes with the wire's downstream usability.
  return ok(wireResult.value as ClosedWire & PlanarWire);
}
