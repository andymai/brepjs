/**
 * Gear profile wires — assemble involute flanks, tip arcs, and root arcs into
 * closed planar wires for external and internal gears.
 *
 * Tip and root arcs are stored as `Geom_Circle` segments via `makeThreePointArc`,
 * so they round-trip through STEP as analytic circles, not B-spline approximations.
 * Flanks are `Geom_BSplineCurve` approximations of the involute.
 */

import type { Vec3 } from '@/core/types.js';
import { type Result, ok, err, isErr } from '@/core/result.js';
import { validationError } from '@/core/errors.js';
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
  adaptiveBSplineTolerance,
  adaptiveSampleCount,
  cosineSpaceFlankSamples,
  gearGeometry,
  inv,
} from './gearMath.js';

// ── Tooth-period edge construction ───────────────────────────────────────────

/**
 * Build the edges for one tooth period, in order:
 *   [optional radial line up from root to base], left flank, tip arc,
 *   right flank, [optional radial line down to root], root arc to next tooth.
 *
 * Endpoints are coincident by construction so `assembleWire` accepts the chain.
 */
function buildToothPeriodEdges(
  tm: GearGeometry,
  toothIndex: number,
  totalTeeth: number,
  samples: number,
  tolerance: number
): Result<Edge[]> {
  const center = toothIndex * tm.toothPitch;
  const nextCenter = ((toothIndex + 1) % totalTeeth) * tm.toothPitch;
  const invPitch = inv(tm.alphaPitch);

  // Anchor angles: at α=α_pitch the involute should hit center ± halfToothAngle.
  // θ(α) = θ0 + sign·inv(α). At pitch: θ = θ0 ± inv(α_pitch). So:
  //   left:  θ0 = center − halfToothAngle − inv(α_pitch)   (sign=+1)
  //   right: θ0 = center + halfToothAngle + inv(α_pitch)   (sign=-1)
  const thetaLeft = center - tm.halfToothAngle - invPitch;
  const thetaRight = center + tm.halfToothAngle + invPitch;

  const leftFlank = cosineSpaceFlankSamples(tm.rb, tm.alphaTip, thetaLeft, samples, 1);
  const rightFlank = cosineSpaceFlankSamples(tm.rb, tm.alphaTip, thetaRight, samples, -1);
  const leftBase = firstOrThrow(leftFlank);
  const leftTip = lastOrThrow(leftFlank);
  const rightTip = firstOrThrow(rightFlank);
  const rightBase = lastOrThrow(rightFlank);

  const edges: Edge[] = [];

  // If root is BELOW the base circle (external) or ABOVE it (internal), the involute
  // can't reach the root. Bridge with a radial line from root to the flank's base point.
  const needsRadialBridge = tm.isInternal ? tm.rb < tm.rRoot : tm.rb > tm.rRoot;
  if (needsRadialBridge) {
    const rootPt: Vec3 = [tm.rRoot * Math.cos(thetaLeft), tm.rRoot * Math.sin(thetaLeft), 0];
    edges.push(makeLine(rootPt, leftBase));
  }

  const leftEdge = makeBSplineInterpolation(leftFlank, { tolerance });
  if (isErr(leftEdge)) return leftEdge;
  edges.push(leftEdge.value);

  const tipMid: Vec3 = [tm.rTip * Math.cos(center), tm.rTip * Math.sin(center), 0];
  edges.push(makeThreePointArc(leftTip, tipMid, rightTip));

  const rightEdge = makeBSplineInterpolation(rightFlank, { tolerance });
  if (isErr(rightEdge)) return rightEdge;
  edges.push(rightEdge.value);

  if (needsRadialBridge) {
    const rootPt: Vec3 = [tm.rRoot * Math.cos(thetaRight), tm.rRoot * Math.sin(thetaRight), 0];
    edges.push(makeLine(rightBase, rootPt));
  }

  // Root arc: from current tooth's right anchor to next tooth's left anchor, midpoint on bisector.
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
  edges.push(makeThreePointArc(rootStart, rootMid, nextLeftStart));

  return ok(edges);
}

// ── Public profile wire builders ─────────────────────────────────────────────

export interface GearWireParams {
  teeth: number;
  moduleSize: number;
  pressureAngle: number; // radians
  shift: number;
  clearance: number;
  backlashHalf: number;
  /** Override sample count per flank; defaults to adaptiveSampleCount(moduleSize). */
  samples?: number;
  /** Override B-spline tolerance; defaults to adaptiveBSplineTolerance(moduleSize). */
  tolerance?: number;
}

/**
 * Build a closed planar wire for an external (spur) gear, centered at origin in XY.
 *
 * The wire bounds the gear's tooth profile (outer boundary). Caller wraps in a Sketch
 * or face-with-hole construction depending on whether a bore is desired.
 */
export function makeExternalGearProfileWire(
  params: GearWireParams
): Result<ClosedWire & PlanarWire> {
  return makeProfileWire(params, false);
}

/**
 * Build a closed planar wire for an internal (ring) gear's TOOTHED inner boundary.
 *
 * The returned wire is suitable for use as a *hole* in a larger casing face. Caller
 * combines it with an outer cylinder/casing wire to form the ring's annular face.
 */
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
    tolerance = adaptiveBSplineTolerance(moduleSize),
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

  const allEdges: Edge[] = [];
  for (let i = 0; i < teeth; i++) {
    const periodEdges = buildToothPeriodEdges(tm, i, teeth, samples, tolerance);
    if (isErr(periodEdges)) return periodEdges;
    allEdges.push(...periodEdges.value);
  }

  const wire = assembleWire(allEdges);
  if (isErr(wire)) return wire;

  return ok(wire.value as ClosedWire & PlanarWire);
}
