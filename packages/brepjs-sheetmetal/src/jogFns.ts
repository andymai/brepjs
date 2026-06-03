import { type Result, type Solid, ok, err, validationError } from 'brepjs';
import type {
  BendFeature,
  BendRule,
  JogFeature,
  JogSpec,
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
 * Author a jog (joggle): two opposite bends (`+θ` then `−θ`) that step a flat by
 * `offsetHeight` perpendicular to its plane, then continue parallel past the step.
 * Built on the contour-flange chainer: a flat position leg, a `+θ` up bend
 * (`jog::<id>::0`), the connecting step run, a `−θ` down bend (`jog::<id>::1`), and
 * a flat run-out leg. The development is EXACT (Σ legs + Σ bend allowances, via the
 * table-aware {@link developedLength}). The connecting step run is
 * `offsetHeight / sin(θ)` so the two bends realize the requested perpendicular step;
 * the result is guarded to a valid single solid. OCCT-WASM-safe construction only.
 */
export function jog(part: SheetMetalPart, spec: JogSpec): Result<SheetMetalPart> {
  if (part.solid === undefined) {
    return err(validationError('NO_SOLID', `part has no solid to attach jog '${jogId(spec)}'`));
  }
  const id = jogId(spec);
  if (id.includes('::')) {
    return err(validationError('INVALID_JOG_ID', `jog id must not contain '::', got '${id}'`));
  }
  for (const existing of part.jogs ?? []) {
    if (existing.id === id) {
      return err(validationError('DUPLICATE_JOG', `duplicate jog id '${id}'`));
    }
  }

  const thickness = part.thickness;
  if (!Number.isFinite(spec.offsetHeight) || spec.offsetHeight <= 0) {
    return err(validationError('INVALID_JOG_OFFSET', `jog offsetHeight must be positive, got ${spec.offsetHeight}`));
  }
  if (!Number.isFinite(spec.position) || spec.position <= 0) {
    return err(validationError('INVALID_JOG_POSITION', `jog position must be positive, got ${spec.position}`));
  }
  const angleDeg = spec.angle ?? 45;
  if (!Number.isFinite(angleDeg) || angleDeg <= 0 || angleDeg >= 90) {
    return err(validationError('INVALID_JOG_ANGLE', `jog angle must be in (0, 90), got ${angleDeg}`));
  }
  const radius = spec.radius ?? thickness;
  if (!Number.isFinite(radius) || radius <= 0) {
    return err(validationError('INVALID_JOG_RADIUS', `jog radius must be positive, got ${radius}`));
  }
  const runOut = spec.runOut ?? spec.position;
  if (!Number.isFinite(runOut) || runOut <= 0) {
    return err(validationError('INVALID_JOG_RUNOUT', `jog runOut must be positive, got ${runOut}`));
  }

  const framesResult = worldFrames(part);
  if (!framesResult.ok) return framesResult;
  const regionId = resolveRegion(spec.region);
  const regionFrame = framesResult.value.get(regionId);
  if (regionFrame === undefined) {
    return err(validationError('UNKNOWN_REGION', `jog '${id}' references unknown region '${spec.region}'`));
  }

  const edge = regionEdge(regionFrame, spec.side);
  const offset = spec.offset ?? 0;
  const span = spec.width ?? edge.length;
  if (!Number.isFinite(offset) || offset < -1e-9) {
    return err(validationError('INVALID_OFFSET', `jog '${id}' offset must be non-negative`));
  }
  if (!Number.isFinite(span) || span <= 0) {
    return err(validationError('INVALID_JOG_WIDTH', `jog '${id}' width must be positive`));
  }
  if (offset + span > edge.length + 1e-6) {
    return err(
      validationError('JOG_OUT_OF_BOUNDS', `jog '${id}' [${offset}, ${offset + span}] exceeds region edge length ${edge.length}`)
    );
  }

  const rule: BendRule = spec.rule ?? { innerRadius: radius, kFactor: 0.44 };
  // The connecting step run carries the flat across the offset at angle θ. The two
  // arcs themselves each rise (T+2r)/2·(1−cosθ) perpendicular to the plane (the
  // up-bend rises (T+r)(1−cosθ), the down-bend r(1−cosθ)); the step run adds
  // L·sinθ. Solving for the total perpendicular rise = offsetHeight gives this L, so
  // the run-out bottom face sits exactly offsetHeight above the base bottom face.
  const theta = (angleDeg * Math.PI) / 180;
  const arcRise = (thickness + 2 * radius) * (1 - Math.cos(theta));
  const stepRun = (spec.offsetHeight - arcRise) / Math.sin(theta);
  if (!(stepRun > 0)) {
    return err(
      validationError(
        'JOG_OFFSET_TOO_SMALL',
        `jog offsetHeight ${spec.offsetHeight} is too small for radius ${radius} at ${angleDeg}° (the bends alone rise ${arcRise.toFixed(3)}); increase offsetHeight or reduce radius/angle`
      )
    );
  }

  let frame: SegmentFrame = initialSegmentFrame(edge, regionFrame.n, offset);
  let solid: Solid = part.solid;
  const bends: BendFeature[] = [];
  const segments: JogFeature['segments'] = [];
  const bendIds: string[] = [];
  let devTotal = 0;

  // 1) Flat position leg out to the first bend.
  {
    const built = buildLineLeg(solid, frame, span, thickness, spec.position);
    if (!built.ok) return built;
    solid = built.value.solid;
    frame = built.value.frame;
    segments.push({ kind: 'line', dev: spec.position });
    devTotal += spec.position;
  }

  // 2) Up bend (+θ), 3) step run, 4) down bend (−θ): the two opposite bends.
  const order: { dir: 'up' | 'down'; step?: number }[] = [
    { dir: 'up', step: stepRun },
    { dir: 'down' },
  ];
  for (let i = 0; i < order.length; i += 1) {
    const o = order[i];
    if (o === undefined) continue;
    const built = buildArcBend(solid, frame, span, thickness, {
      kind: 'arc',
      radius,
      angleDeg,
      direction: o.dir,
    });
    if (!built.ok) return built;
    solid = built.value.solid;
    frame = built.value.frame;

    const devResult = developedLength(angleDeg, thickness, { ...rule, innerRadius: radius });
    if (!devResult.ok) return devResult;
    const dev = devResult.value;

    const bendId = `jog::${id}::${i}`;
    bendIds.push(bendId);
    bends.push({
      id: bendId,
      axisOrigin: [built.value.axisOrigin[0], built.value.axisOrigin[1], built.value.axisOrigin[2]],
      axisDir: [edge.dir[0], edge.dir[1], edge.dir[2]],
      angleDeg,
      direction: o.dir,
      rule: { ...rule, innerRadius: radius },
    });
    segments.push({ kind: 'arc', dev, angleDeg, direction: o.dir, bendId });
    devTotal += dev;

    if (o.step !== undefined) {
      const stepBuilt = buildLineLeg(solid, frame, span, thickness, o.step);
      if (!stepBuilt.ok) return stepBuilt;
      solid = stepBuilt.value.solid;
      frame = stepBuilt.value.frame;
      segments.push({ kind: 'line', dev: o.step });
      devTotal += o.step;
    }
  }

  // 5) Flat run-out leg, parallel to the original plane, offset by offsetHeight.
  {
    const built = buildLineLeg(solid, frame, span, thickness, runOut);
    if (!built.ok) return built;
    solid = built.value.solid;
    segments.push({ kind: 'line', dev: runOut });
    devTotal += runOut;
  }

  const feature: JogFeature = {
    id,
    region: regionId,
    side: spec.side,
    offset,
    span,
    offsetHeight: spec.offsetHeight,
    angleDeg,
    developedLength: devTotal,
    bends: bendIds,
    segments,
  };

  return ok({
    ...part,
    solid: normalizeSolid(solid),
    bends: [...part.bends, ...bends],
    jogs: [...(part.jogs ?? []), feature],
  });
}

function jogId(spec: JogSpec): string {
  return spec.id ?? `jog-${spec.region}-${spec.side}`;
}

function resolveRegion(region: string): string {
  return region === 'base' || region === 'face-0' ? ROOT_FLAT_ID : region;
}
