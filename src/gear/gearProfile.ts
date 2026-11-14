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
  involutePoint,
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

  // The profile is the outline of the tooth (external) or of the tooth space (ring). In both
  // the flank runs from the inner circle to the outer circle: root→tip for an external gear,
  // tip→root for a ring, whose teeth point inward.
  const rInner = tm.isInternal ? tm.rTip : tm.rRoot;
  const rOuter = tm.isInternal ? tm.rRoot : tm.rTip;

  // Right flank reversed so the edge chain runs base→tip→base→nextBase in geometric order.
  // Without this, the wire has a discontinuity that OCCT silently fixes via auto-reorientation
  // but brepkit doesn't, producing a face with reversed orientation.
  // A gear with many teeth has its base circle inside its inner circle. The flank then starts
  // on the inner circle: a flank from the base circle goes below it, and the inner arc
  // between two such flanks crosses them.
  const alphaInner = tm.rb < rInner ? Math.acos(tm.rb / rInner) : 0;
  const leftFlank = cosineSpaceFlankSamples(tm.rb, tm.alphaTip, thetaLeft, samples, 1, alphaInner);
  const rightFlank = cosineSpaceFlankSamples(
    tm.rb,
    tm.alphaTip,
    thetaRight,
    samples,
    -1,
    alphaInner
  ).reverse();
  const leftBase = firstOrThrow(leftFlank);
  const leftTip = lastOrThrow(leftFlank);
  const rightTip = firstOrThrow(rightFlank);
  const rightBase = lastOrThrow(rightFlank);

  const edges: Edge[] = [];
  const push = (e: Edge): void => {
    scope.register(e);
    edges.push(e);
  };

  // Inner circle below the base circle: the involute can't reach it; bridge radially.
  const needsRadialBridge = tm.rb > rInner;
  if (needsRadialBridge) {
    const innerPt: Vec3 = [rInner * Math.cos(thetaLeft), rInner * Math.sin(thetaLeft), 0];
    push(makeLine(innerPt, leftBase));
  }

  const interpTol = tm.rPitch * 1e-5;
  const leftEdge = makeBSplineInterpolation(leftFlank, { tolerance: interpTol });
  if (isErr(leftEdge)) return leftEdge;
  push(leftEdge.value);

  const outerMid: Vec3 = [rOuter * Math.cos(center), rOuter * Math.sin(center), 0];
  push(makeThreePointArc(leftTip, outerMid, rightTip));

  const rightEdge = makeBSplineInterpolation(rightFlank, { tolerance: interpTol });
  if (isErr(rightEdge)) return rightEdge;
  push(rightEdge.value);

  if (needsRadialBridge) {
    const innerPt: Vec3 = [rInner * Math.cos(thetaRight), rInner * Math.sin(thetaRight), 0];
    push(makeLine(rightBase, innerPt));
  }

  const innerEndAngle = nextCenter - tm.halfToothAngle - invPitch;
  // The inner arc runs CCW from the foot of this right flank to the foot of the next left
  // flank. The feet are inv(alphaInner) inside the two θ0 angles, and the θ0 angles cross
  // from about 106 teeth, so their order can't tell which way round the arc goes.
  const arcStart = thetaRight - inv(alphaInner);
  const arcEnd = center + tm.toothPitch - tm.halfToothAngle - invPitch + inv(alphaInner);
  const midAngle = 0.5 * (arcStart + arcEnd);

  const innerStart: Vec3 = needsRadialBridge
    ? [rInner * Math.cos(thetaRight), rInner * Math.sin(thetaRight), 0]
    : rightBase;
  const innerMid: Vec3 = [rInner * Math.cos(midAngle), rInner * Math.sin(midAngle), 0];
  const nextLeftStart: Vec3 = needsRadialBridge
    ? [rInner * Math.cos(innerEndAngle), rInner * Math.sin(innerEndAngle), 0]
    : involutePoint(tm.rb, alphaInner, innerEndAngle, 1);
  push(makeThreePointArc(innerStart, innerMid, nextLeftStart));

  return ok(edges);
}

export interface GearWireParams {
  teeth: number;
  moduleSize: number;
  /** Pressure angle in radians. */
  pressureAngle: number;
  shift: number;
  clearance: number;
  /** Per-gear flank thinning (mm); see {@link ExternalGearParams.flankThinning}. */
  flankThinning: number;
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
    flankThinning,
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
    flankThinning,
    isInternal
  );

  // The two flanks of a tooth (or of a ring's tooth space) converge toward the outer circle.
  // When they meet inside it, the outer arc runs backward and the profile crosses itself.
  const outerHalfAngle = tm.halfToothAngle + inv(tm.alphaPitch) - inv(tm.alphaTip);
  if (outerHalfAngle <= 0)
    return err(
      validationError(
        'GEAR_TOOTH_POINTED',
        `${isInternal ? 'tooth space' : 'tooth'} flanks cross inside the ${isInternal ? 'root' : 'tip'} circle (teeth=${teeth}, shift=${shift}): use more teeth or a lower shift`,
        undefined,
        { teeth, shift, outerHalfAngle }
      )
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
