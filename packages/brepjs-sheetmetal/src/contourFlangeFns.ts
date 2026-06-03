import {
  type Result,
  type Vec3,
  type Solid,
  type ValidSolid,
  ok,
  err,
  validationError,
  box,
  cylinder,
  fuse,
  cut,
  intersect,
  rotate,
  translate,
  vecAdd,
  vecScale,
  vecSub,
  vecDot,
  vecCross,
  vecNormalize,
} from 'brepjs';
import type {
  BendFeature,
  BendRule,
  ContourFlangeFeature,
  ContourFlangeSpec,
  FlatSide,
  ProfileSegment,
  SheetMetalPart,
} from './types.js';
import { normalizeSolid } from './internal.js';
import { developedLength } from './allowanceFns.js';

interface SegmentFrame {
  /** Origin of the −normal (bottom) surface at the start of this segment. */
  origin: Vec3;
  /** Outward run direction (the segment's local +X). */
  run: Vec3;
  /** Top-surface normal (+Z), n = bendAxis × run. */
  n: Vec3;
  /** Bend axis along the base edge (+Y), shared by every segment. */
  axis: Vec3;
}

/**
 * Author a contour flange: an OPEN 2D profile (alternating line/arc segments) swept
 * along one straight edge of the base flat. Each arc is a cylindrical bend, each
 * line a flat leg; consecutive segments chain frame-to-frame exactly as
 * {@link authorPart} chains flanges, building one connected multi-bend cross-section
 * (a return, a hat, a J). The recorded {@link ContourFlangeFeature} carries each
 * segment's EXACT developed length (lines: `length`; arcs: the canonical
 * {@link developedLength}) so the unfold lays the strip out straight with no error.
 * Construction stays on the public, OCCT-WASM-safe API.
 */
export function authorContourFlange(
  part: SheetMetalPart,
  spec: ContourFlangeSpec
): Result<SheetMetalPart> {
  if (part.solid === undefined) {
    return err(validationError('NO_SOLID', `part has no solid to attach contour flange '${spec.id}'`));
  }
  if (spec.id === '' || spec.id.includes('::')) {
    return err(
      validationError('INVALID_CONTOUR_ID', `contour flange id must be non-empty and must not contain '::', got '${spec.id}'`)
    );
  }
  for (const existing of part.contourFlanges ?? []) {
    if (existing.id === spec.id) {
      return err(validationError('DUPLICATE_CONTOUR', `duplicate contour flange id '${spec.id}'`));
    }
  }
  if (spec.profile.length === 0) {
    return err(validationError('EMPTY_PROFILE', `contour flange '${spec.id}' profile is empty`));
  }

  const thickness = part.thickness;
  const edge = baseEdge(part, spec.side);
  const offset = spec.offset ?? 0;
  const span = spec.width ?? edge.length;
  if (!Number.isFinite(offset) || offset < -1e-9) {
    return err(validationError('INVALID_OFFSET', `contour flange '${spec.id}' offset must be non-negative`));
  }
  if (!Number.isFinite(span) || span <= 0) {
    return err(validationError('INVALID_CONTOUR_WIDTH', `contour flange '${spec.id}' width must be positive`));
  }
  if (offset + span > edge.length + 1e-6) {
    return err(
      validationError('CONTOUR_OUT_OF_BOUNDS', `contour flange '${spec.id}' [${offset}, ${offset + span}] exceeds base edge length ${edge.length}`)
    );
  }

  // The profile is swept across `span` along the base edge starting at `offset`.
  const stripStart = vecAdd(edge.start, vecScale(edge.dir, offset));
  let frame: SegmentFrame = {
    origin: stripStart,
    run: edge.out,
    n: [0, 0, 1],
    axis: edge.dir,
  };

  let solid: Solid = part.solid;
  const bends: BendFeature[] = [];
  const segments: ContourFlangeFeature['segments'] = [];
  let devTotal = 0;
  let arcIndex = 0;

  for (let i = 0; i < spec.profile.length; i += 1) {
    const seg = spec.profile[i];
    if (seg === undefined) continue;
    if (seg.kind === 'line') {
      if (!Number.isFinite(seg.length) || seg.length <= 0) {
        return err(validationError('INVALID_SEGMENT_LENGTH', `contour flange '${spec.id}' line segment ${i} length must be positive`));
      }
      const built = buildLineLeg(solid, frame, span, thickness, seg.length);
      if (!built.ok) return built;
      solid = built.value.solid;
      frame = built.value.frame;
      segments.push({ kind: 'line', dev: seg.length });
      devTotal += seg.length;
    } else {
      const rule: BendRule = spec.rule ?? { innerRadius: seg.radius, kFactor: 0.44 };
      const built = buildArcBend(solid, frame, span, thickness, seg);
      if (!built.ok) return built;
      solid = built.value.solid;
      frame = built.value.frame;

      const devResult = developedLength(seg.angleDeg, thickness, { ...rule, innerRadius: seg.radius });
      if (!devResult.ok) return devResult;
      const dev = devResult.value;

      const bendId = `contour::${spec.id}::${arcIndex}`;
      arcIndex += 1;
      bends.push({
        id: bendId,
        axisOrigin: [built.value.axisOrigin[0], built.value.axisOrigin[1], built.value.axisOrigin[2]],
        axisDir: [edge.dir[0], edge.dir[1], edge.dir[2]],
        angleDeg: seg.angleDeg,
        direction: seg.direction,
        rule: { ...rule, innerRadius: seg.radius },
      });
      segments.push({ kind: 'arc', dev, angleDeg: seg.angleDeg, direction: seg.direction, bendId });
      devTotal += dev;
    }
  }

  const feature: ContourFlangeFeature = {
    id: spec.id,
    side: spec.side,
    offset,
    span,
    developedLength: devTotal,
    segments,
  };

  return ok({
    ...part,
    solid: normalizeSolid(solid),
    bends: [...part.bends, ...bends],
    contourFlanges: [...(part.contourFlanges ?? []), feature],
  });
}

interface BuiltSegment {
  solid: Solid;
  frame: SegmentFrame;
}

interface BuiltArc extends BuiltSegment {
  axisOrigin: Vec3;
}

/**
 * Add one straight leg of `legLength` extending from `frame.origin` along
 * `frame.run`, full thickness along `frame.n`, across `span` along `frame.axis`.
 * The next segment's frame starts at the leg's far end.
 */
function buildLineLeg(
  base: Solid,
  frame: SegmentFrame,
  span: number,
  thickness: number,
  legLength: number
): Result<BuiltSegment> {
  // Canonical box (legLength × span × thickness) at the origin, mapped onto the
  // current segment frame: +X→run, +Y→axis, +Z→n.
  const place = frameTransform(frame.run, frame.axis, frame.n, frame.origin);
  const canon = box(legLength, span, thickness);
  const placed = place.solid(canon);
  const fused = fuse(base, placed);
  if (!fused.ok) return fused;

  const nextOrigin = vecAdd(frame.origin, vecScale(frame.run, legLength));
  return ok({ solid: fused.value, frame: { ...frame, origin: nextOrigin } });
}

/**
 * Add one cylindrical bend turning the running direction by `angleDeg`. Mirrors
 * {@link authorPart}'s bend patch: a hollow tube (outer R+T, inner R) intersected
 * with the fold wedge, in a canonical frame mapped onto the current segment frame.
 * The returned frame's run/normal are rotated by the fold so the next leg continues
 * tangentially.
 */
function buildArcBend(
  base: Solid,
  frame: SegmentFrame,
  span: number,
  thickness: number,
  seg: Extract<ProfileSegment, { kind: 'arc' }>
): Result<BuiltArc> {
  const r = seg.radius;
  if (!Number.isFinite(r) || r < 0) {
    return err(validationError('INVALID_RADIUS', `contour arc radius must be non-negative, got ${r}`));
  }
  if (!Number.isFinite(seg.angleDeg) || seg.angleDeg <= 0 || seg.angleDeg > 180) {
    return err(validationError('INVALID_ARC_ANGLE', `contour arc angleDeg must be in (0, 180], got ${seg.angleDeg}`));
  }

  const sign = seg.direction === 'up' ? 1 : -1;
  // Canonical assembly (authorPart convention): bend axis +Y, run +X, top +Z, with
  // the bend-axis centre line at z = T+r (up) / −r (down). The current segment frame
  // maps +X→run, +Y→axis, +Z→n.
  const canonAxisZ = sign > 0 ? thickness + r : -r;
  const canonOrigin: Vec3 = [0, 0, canonAxisZ];
  const place = frameTransform(frame.run, frame.axis, frame.n, frame.origin);

  const patch = buildBendPatch(canonOrigin, seg.angleDeg, r, span, thickness, seg.direction);
  if (!patch.ok) return patch;
  const placed = place.solid(patch.value);
  const fused = fuse(base, placed);
  if (!fused.ok) return fused;

  // Fold run/normal by ∓θ about the axis (authorPart: rotate −sign·θ about +Y).
  const theta = (seg.angleDeg * Math.PI) / 180;
  const a = -sign * theta;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  // Canonical run +X folds to [ca, 0, −sa]; normal +Z to [sa, 0, ca].
  const runC: Vec3 = [ca, 0, -sa];
  const nC: Vec3 = [sa, 0, ca];
  // The post-bend exit point in canonical coords: the near-bottom corner [0,0,0]
  // rotated about the pivot [0,0,axisZ].
  const dz = -canonAxisZ;
  const cornerC: Vec3 = [dz * sa, 0, canonAxisZ + dz * ca];

  const nextOrigin = place.point(cornerC);
  const nextRun = place.vector(runC);
  const nextN = place.vector(nC);
  const axisOrigin = place.point(canonOrigin);

  return ok({
    solid: fused.value,
    frame: { origin: nextOrigin, run: nextRun, n: nextN, axis: frame.axis },
    axisOrigin,
  });
}

interface PlacedTransform {
  solid: (s: Solid) => Solid;
  point: (p: Vec3) => Vec3;
  vector: (v: Vec3) => Vec3;
}

/**
 * Rigid map of a canonical assembly (run +X, axis +Y, normal +Z, contact at the
 * origin) onto a world frame: align +X→`runT`, +Y→`axisT`, +Z→`nT`, then translate
 * the origin to `origin`.
 */
function frameTransform(runT: Vec3, axisT: Vec3, nT: Vec3, origin: Vec3): PlacedTransform {
  const m: number[] = [
    runT[0], axisT[0], nT[0],
    runT[1], axisT[1], nT[1],
    runT[2], axisT[2], nT[2],
  ];
  const aa = matrixToAxisAngle(m);
  const applyR = (v: Vec3): Vec3 =>
    vecAdd(vecAdd(vecScale(runT, v[0]), vecScale(axisT, v[1])), vecScale(nT, v[2]));
  return {
    solid: (s: Solid) => {
      const rotated = aa.angleDeg === 0 ? s : rotate(s, aa.angleDeg, { at: [0, 0, 0], axis: aa.axis });
      return translate(rotated, origin);
    },
    point: (p: Vec3) => vecAdd(applyR(p), origin),
    vector: applyR,
  };
}

interface BaseEdge {
  dir: Vec3;
  out: Vec3;
  start: Vec3;
  length: number;
}

/** Resolve one of the four edges of the base flat (the contour-flange root). */
function baseEdge(part: SheetMetalPart, side: FlatSide): BaseEdge {
  const o: Vec3 = [0, 0, 0];
  const u: Vec3 = [1, 0, 0];
  const v: Vec3 = [0, 1, 0];
  const n: Vec3 = [0, 0, 1];
  const uLen = part.baseLength;
  const vLen = part.width;

  const uTop = vecAdd(o, vecScale(u, uLen));
  const vTop = vecAdd(o, vecScale(v, vLen));
  const uvTop = vecAdd(uTop, vecScale(v, vLen));

  let out: Vec3;
  let length: number;
  let a: Vec3;
  let b: Vec3;
  switch (side) {
    case 'xmax':
      out = u;
      length = vLen;
      a = uTop;
      b = uvTop;
      break;
    case 'xmin':
      out = vecScale(u, -1);
      length = vLen;
      a = o;
      b = vTop;
      break;
    case 'ymax':
      out = v;
      length = uLen;
      a = vTop;
      b = uvTop;
      break;
    case 'ymin':
      out = vecScale(v, -1);
      length = uLen;
      a = o;
      b = uTop;
      break;
  }
  const dir = vecNormalize(vecCross(n, out));
  const toB = vecSub(b, a);
  const start = vecDot(toB, dir) >= 0 ? a : b;
  return { dir, out, start, length };
}

/** Cylindrical bend patch (hollow tube ∩ fold wedge), mirroring authorFns. */
function buildBendPatch(
  axisOrigin: Vec3,
  thetaDeg: number,
  r: number,
  width: number,
  thickness: number,
  direction: 'up' | 'down'
): Result<ValidSolid> {
  const outerR = r + thickness;
  const outer = cylinder(outerR, width, { at: axisOrigin, axis: [0, 1, 0] });
  let tube: Solid = outer;
  if (r > 1e-9) {
    const inner = cylinder(r, width, { at: axisOrigin, axis: [0, 1, 0] });
    const carved = cut(outer, inner);
    if (!carved.ok) return carved;
    tube = carved.value;
  }
  const wedge = buildWedge(axisOrigin, thetaDeg, outerR, width, direction);
  if (!wedge.ok) return wedge;
  return intersect(tube, wedge.value) as Result<ValidSolid>;
}

function buildWedge(
  axisOrigin: Vec3,
  thetaDeg: number,
  outerR: number,
  width: number,
  direction: 'up' | 'down'
): Result<Solid> {
  const span = outerR * 2 + 2;
  const margin = 1;
  const blockA = box(span, width + 2 * margin, 2 * span);
  const halfA: Solid = translate(blockA, [axisOrigin[0], axisOrigin[1] - margin, axisOrigin[2] - span]);
  const sign = direction === 'up' ? 1 : -1;
  const halfB = rotate(halfA, sign * (180 - thetaDeg), { at: axisOrigin, axis: [0, 1, 0] });
  return intersect(halfA, halfB);
}

/** Axis-angle of a 3×3 rotation matrix (row-major). */
function matrixToAxisAngle(m: number[]): { axis: Vec3; angleDeg: number } {
  const m00 = m[0] ?? 0;
  const m01 = m[1] ?? 0;
  const m02 = m[2] ?? 0;
  const m10 = m[3] ?? 0;
  const m11 = m[4] ?? 0;
  const m12 = m[5] ?? 0;
  const m20 = m[6] ?? 0;
  const m21 = m[7] ?? 0;
  const m22 = m[8] ?? 0;

  const trace = m00 + m11 + m22;
  const cos = Math.max(-1, Math.min(1, (trace - 1) / 2));
  const angle = Math.acos(cos);
  const angleDeg = (angle * 180) / Math.PI;
  if (angle < 1e-9) return { axis: [0, 0, 1], angleDeg: 0 };

  if (Math.PI - angle < 1e-6) {
    const xx = (m00 + 1) / 2;
    const yy = (m11 + 1) / 2;
    const zz = (m22 + 1) / 2;
    let axis: Vec3;
    if (xx >= yy && xx >= zz) {
      const x = Math.sqrt(Math.max(xx, 0));
      axis = [x, (m01 + m10) / (4 * x), (m02 + m20) / (4 * x)];
    } else if (yy >= zz) {
      const y = Math.sqrt(Math.max(yy, 0));
      axis = [(m01 + m10) / (4 * y), y, (m12 + m21) / (4 * y)];
    } else {
      const z = Math.sqrt(Math.max(zz, 0));
      axis = [(m02 + m20) / (4 * z), (m12 + m21) / (4 * z), z];
    }
    return { axis: vecNormalize(axis), angleDeg: 180 };
  }

  const denom = 2 * Math.sin(angle);
  const axis: Vec3 = [(m21 - m12) / denom, (m02 - m20) / denom, (m10 - m01) / denom];
  return { axis: vecNormalize(axis), angleDeg };
}
