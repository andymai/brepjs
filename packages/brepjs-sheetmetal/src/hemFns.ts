import { type Result, type Solid, ok, err, validationError } from 'brepjs';
import type {
  BendFeature,
  BendRule,
  HemFeature,
  HemSpec,
  SheetMetalPart,
} from './types.js';
import { normalizeSolid } from './internal.js';
import { developedLength } from './allowanceFns.js';
import { worldFrames } from './authorFns.js';
import { ROOT_FLAT_ID } from './featureTreeFns.js';
import {
  type SegmentFrame,
  buildLineLeg,
  buildArcBend,
  regionEdge,
  initialSegmentFrame,
} from './contourFlangeFns.js';

/**
 * A small clearance baked into a CLOSED hem's curl radius. A true closed hem folds
 * the return flat against the parent with zero gap; modelling that exactly makes the
 * curl's inner cylinder coincide with the parent face, so the boolean fuse produces
 * a self-touching (non-manifold) solid. Inflating the inner radius by this HAIR
 * leaves a sub-thickness air gap that keeps the fused solid valid while still
 * reading as a closed hem. Documented so a reader understands the gap is intentional.
 */
const CLOSED_HEM_HAIR = 0.05;

/** Sub-arc cap (deg): the bend-patch wedge degenerates at ≥180°, so curls split. */
const MAX_SUBARC_DEG = 120;

interface HemPlan {
  /** Total curl angle in degrees (≈180 for closed/open, >180 teardrop, ~270 rolled). */
  curlDeg: number;
  /** Inner bend radius used for the curl. */
  radius: number;
  /** Flat return-leg length past the curl (0 for rolled). */
  returnLength: number;
}

/**
 * Author a hem: fold a region edge back ~180°+ onto its parent flat, then run a
 * short return leg. Built on the contour-flange segment chainer — the curl is one
 * or more ≤120° sub-arcs (each a recorded `hem::<id>::<n>` bend) followed by a flat
 * return — so the development is EXACT: Σ curl bend allowances (via the table-aware
 * {@link developedLength}) + the return length, laid out straight past the edge.
 * Four `type`s set the curl/gap geometry (see {@link HemSpec}). Construction stays
 * on the public, OCCT-WASM-safe API; the result is guarded to a valid single solid.
 */
export function hem(part: SheetMetalPart, spec: HemSpec): Result<SheetMetalPart> {
  if (part.solid === undefined) {
    return err(validationError('NO_SOLID', `part has no solid to attach hem '${hemId(spec)}'`));
  }
  const id = hemId(spec);
  if (id.includes('::')) {
    return err(validationError('INVALID_HEM_ID', `hem id must not contain '::', got '${id}'`));
  }
  for (const existing of part.hems ?? []) {
    if (existing.id === id) {
      return err(validationError('DUPLICATE_HEM', `duplicate hem id '${id}'`));
    }
  }

  const thickness = part.thickness;
  const planResult = planHem(spec, thickness);
  if (!planResult.ok) return planResult;
  const plan = planResult.value;

  const framesResult = worldFrames(part);
  if (!framesResult.ok) return framesResult;
  const regionId = resolveRegion(spec.region);
  const regionFrame = framesResult.value.get(regionId);
  if (regionFrame === undefined) {
    return err(validationError('UNKNOWN_REGION', `hem '${id}' references unknown region '${spec.region}'`));
  }

  const edge = regionEdge(regionFrame, spec.side);
  const offset = spec.offset ?? 0;
  const span = spec.width ?? edge.length;
  if (!Number.isFinite(offset) || offset < -1e-9) {
    return err(validationError('INVALID_OFFSET', `hem '${id}' offset must be non-negative`));
  }
  if (!Number.isFinite(span) || span <= 0) {
    return err(validationError('INVALID_HEM_WIDTH', `hem '${id}' width must be positive`));
  }
  if (offset + span > edge.length + 1e-6) {
    return err(
      validationError('HEM_OUT_OF_BOUNDS', `hem '${id}' [${offset}, ${offset + span}] exceeds region edge length ${edge.length}`)
    );
  }

  const rule: BendRule = spec.rule ?? { innerRadius: plan.radius, kFactor: 0.44 };
  const subAngles = splitAngle(plan.curlDeg);

  // The curl is split into ≤120° sub-arcs only because the bend-patch wedge
  // degenerates at ≥180°; the DEVELOPMENT is one physical curl. Resolve the full
  // curl angle's allowance as a single table/formula query, then apportion it to
  // the sub-arcs by angle. Querying each sub-arc separately would over-count a
  // table sparse in angle (each sub-angle clamps up to the nearest tabulated row).
  const fullDevResult = developedLength(plan.curlDeg, thickness, { ...rule, innerRadius: plan.radius });
  if (!fullDevResult.ok) return fullDevResult;
  const devPerDeg = plan.curlDeg > 0 ? fullDevResult.value / plan.curlDeg : 0;

  let frame: SegmentFrame = initialSegmentFrame(edge, regionFrame.n, offset);
  let solid: Solid = part.solid;
  const bends: BendFeature[] = [];
  const segments: HemFeature['segments'] = [];
  const subBends: string[] = [];
  let devTotal = 0;

  for (let i = 0; i < subAngles.length; i += 1) {
    const subDeg = subAngles[i];
    if (subDeg === undefined) continue;
    const built = buildArcBend(solid, frame, span, thickness, {
      kind: 'arc',
      radius: plan.radius,
      angleDeg: subDeg,
      direction: 'up',
    });
    if (!built.ok) return built;
    solid = built.value.solid;
    frame = built.value.frame;

    const dev = devPerDeg * subDeg;

    const bendId = `hem::${id}::${i}`;
    subBends.push(bendId);
    bends.push({
      id: bendId,
      axisOrigin: [built.value.axisOrigin[0], built.value.axisOrigin[1], built.value.axisOrigin[2]],
      axisDir: [edge.dir[0], edge.dir[1], edge.dir[2]],
      angleDeg: subDeg,
      direction: 'up',
      rule: { ...rule, innerRadius: plan.radius },
    });
    segments.push({ kind: 'arc', dev, angleDeg: subDeg, direction: 'up', bendId });
    devTotal += dev;
  }

  if (plan.returnLength > 0) {
    const built = buildLineLeg(solid, frame, span, thickness, plan.returnLength);
    if (!built.ok) return built;
    solid = built.value.solid;
    segments.push({ kind: 'line', dev: plan.returnLength });
    devTotal += plan.returnLength;
  }

  const feature: HemFeature = {
    id,
    type: spec.type,
    region: regionId,
    side: spec.side,
    offset,
    span,
    returnLength: plan.returnLength,
    developedLength: devTotal,
    subBends,
    segments,
  };

  return ok({
    ...part,
    solid: normalizeSolid(solid),
    bends: [...part.bends, ...bends],
    hems: [...(part.hems ?? []), feature],
  });
}

/** The hem's id: an explicit `spec.id`, else a deterministic region/side/type key. */
function hemId(spec: HemSpec): string {
  return spec.id ?? `hem-${spec.region}-${spec.side}-${spec.type}`;
}

function resolveRegion(region: string): string {
  return region === 'base' || region === 'face-0' ? ROOT_FLAT_ID : region;
}

/**
 * Resolve a {@link HemSpec} into its curl angle, radius and return length. The
 * radius defaults to one thickness (the tightest practical hem). A closed hem
 * inflates the radius by {@link CLOSED_HEM_HAIR} so the fused solid stays valid;
 * an open hem widens the radius to span the requested gap; teardrop/rolled set a
 * larger curl angle.
 */
function planHem(spec: HemSpec, thickness: number): Result<HemPlan> {
  if (!Number.isFinite(thickness) || thickness <= 0) {
    return err(validationError('INVALID_THICKNESS', `hem thickness must be positive, got ${thickness}`));
  }
  if (spec.radius !== undefined && (!Number.isFinite(spec.radius) || spec.radius < 0)) {
    return err(validationError('INVALID_HEM_RADIUS', `hem radius must be non-negative, got ${spec.radius}`));
  }
  // Inner-radius default differs by type: a closed hem folds essentially flat
  // (radius ≈ 0, just the HAIR clearance) so it is actually closed; teardrop/rolled
  // default to one thickness. Open derives its radius from the requested gap below.
  const baseRadius = spec.radius ?? thickness;

  switch (spec.type) {
    case 'closed': {
      const returnLength = spec.length ?? 0;
      if (!Number.isFinite(returnLength) || returnLength <= 0) {
        return err(
          validationError('INVALID_HEM_LENGTH', `closed hem requires a positive return length, got ${spec.length}`)
        );
      }
      if (returnLength < thickness) {
        return err(
          validationError('HEM_LENGTH_TOO_SHORT', `closed hem return length ${returnLength} must be ≥ thickness ${thickness}`)
        );
      }
      // Default to a tight (≈0) radius so the return folds flat against the parent
      // (an actually-closed hem); the HAIR keeps the coincident-face fuse valid.
      return ok({ curlDeg: 180, radius: (spec.radius ?? 0) + CLOSED_HEM_HAIR, returnLength });
    }
    case 'open': {
      const returnLength = spec.length ?? 0;
      if (!Number.isFinite(returnLength) || returnLength <= 0) {
        return err(
          validationError('INVALID_HEM_LENGTH', `open hem requires a positive return length, got ${spec.length}`)
        );
      }
      // `gap` is the physical clear distance between the return and the parent. A
      // 180° fold at inner radius r lands the return 2r away, so the radius is gap/2.
      const gap = spec.gap ?? thickness;
      if (!Number.isFinite(gap) || gap <= 0) {
        return err(validationError('INVALID_HEM_GAP', `open hem gap must be positive, got ${gap}`));
      }
      return ok({ curlDeg: 180, radius: gap / 2, returnLength });
    }
    case 'teardrop': {
      const returnLength = spec.length ?? 0;
      if (!Number.isFinite(returnLength) || returnLength <= 0) {
        return err(
          validationError('INVALID_HEM_LENGTH', `teardrop hem requires a positive return length, got ${spec.length}`)
        );
      }
      return ok({ curlDeg: 210, radius: baseRadius, returnLength });
    }
    case 'rolled':
      // A full circular roll (curled / safe edge): no flat return.
      return ok({ curlDeg: 270, radius: baseRadius, returnLength: 0 });
    default:
      return spec.type satisfies never;
  }
}

/** Split a curl angle into ≤{@link MAX_SUBARC_DEG} equal sub-arcs (the wedge cap). */
function splitAngle(totalDeg: number): number[] {
  const n = Math.max(1, Math.ceil(totalDeg / MAX_SUBARC_DEG));
  const per = totalDeg / n;
  return Array.from({ length: n }, () => per);
}
