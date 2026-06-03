import {
  type Result,
  type Vec3,
  type Solid,
  ok,
  err,
  validationError,
  box,
  cylinder,
  line,
  wireLoop,
  face,
  extrude,
  cut,
  fuse,
  rotate,
  translate,
  getSolids,
  isValid,
  isPlanarWire,
  vecAdd,
  vecScale,
  vecCross,
  vecNormalize,
} from 'brepjs';
import type { FormSpec, FormFeature, SheetMetalPart } from './types.js';
import { normalizeSolid } from './internal.js';
import type { FlatFrame } from './authorFns.js';
import type { Frame2 } from './unfoldFns.js';
import { regionFrames, regionDevExtent, mapToFrame2 } from './cutoutFns.js';

const EPS = 1e-6;
const HAIR = 0.05;
const CIRCLE_SEGMENTS = 48;

type Pt2 = [number, number];

/**
 * Add a form feature (louver or emboss/dimple) to a named flat region.
 *
 * 3D FIDELITY (simplified, by design — the public CSG-only API makes true forming
 * impractical):
 * - LOUVER: the vent opening (`length × width`) is cut fully through the sheet, and
 *   the formed flap is represented as a thin box hinged on one side and tilted up to
 *   `height`, fused so it stays connected to the body at the hinge. True forming
 *   keeps the flap continuous with the parent and bends it; the cut+tilted-flap
 *   representation captures the vent geometry while keeping a single valid solid.
 * - EMBOSS: a short cylinder fused onto the formed face (raised by `height`).
 *   DIMPLE: a shallow cylindrical recess cut into the formed face (recessed by
 *   `height`, never through). A true spherical/conical form is approximated by the
 *   flat-topped round so the result stays a valid single body.
 *
 * FLAT PATTERN (the fabrication-critical representation): the louver emits its
 * footprint as an OPEN three-side cut path (the fabricator cuts three of its four
 * sides — all but the hinge) plus the hinge fold line; the emboss emits its footprint
 * circle as a marker. Forming removes no net material, so the developed outline and
 * area are unchanged. Guards a valid, single-bodied solid.
 */
export function addForm(part: SheetMetalPart, spec: FormSpec): Result<SheetMetalPart> {
  const solid = part.solid;
  if (solid === undefined) {
    return err(validationError('NO_SOLID', 'addForm: part has no folded solid to form'));
  }

  const framesResult = regionFrames(part, spec.region);
  if (!framesResult.ok) return framesResult;
  const { regionId, world, dev } = framesResult.value;
  const ext = regionDevExtent(part, regionId, world);

  if (spec.kind === 'louver') return louverForm(part, solid, spec, regionId, world, dev, ext);
  return embossForm(part, solid, spec, regionId, world, dev, ext);
}

/** Louver vent: cut the opening, fuse the tilted flap, emit the U-cut + hinge in 2D. */
function louverForm(
  part: SheetMetalPart,
  partSolid: Solid,
  spec: Extract<FormSpec, { kind: 'louver' }>,
  regionId: string,
  world: FlatFrame,
  dev: Frame2,
  ext: { uMax: number; vMax: number }
): Result<SheetMetalPart> {
  if (!Number.isFinite(spec.length) || spec.length <= 0 || !Number.isFinite(spec.width) || spec.width <= 0) {
    return err(validationError('INVALID_FORM', 'louver length/width must be positive'));
  }
  if (!Number.isFinite(spec.height) || spec.height <= 0) {
    return err(validationError('INVALID_FORM', `louver height must be positive, got ${spec.height}`));
  }
  // Louver footprint in region-local coords, centred at (x, y): `length` along u,
  // `width` along v. The hinge is the −v edge of the footprint.
  const hl = spec.length / 2;
  const hw = spec.width / 2;
  const x0 = spec.x - hl;
  const x1 = spec.x + hl;
  const y0 = spec.y - hw;
  const y1 = spec.y + hw;
  if (x0 < -EPS || x1 > ext.uMax + EPS || y0 < -EPS || y1 > ext.vMax + EPS) {
    return err(
      validationError('FORM_OUT_OF_BOUNDS', `louver at (${spec.x}, ${spec.y}) lies outside region [0,${ext.uMax}]×[0,${ext.vMax}]`)
    );
  }

  const dir = spec.direction ?? 'up';
  const sign = dir === 'up' ? 1 : -1;

  // Cut the vent opening fully through the sheet.
  const openingLocal: Pt2[] = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
  const opening = buildThroughTool(openingLocal, world, part.thickness);
  if (!opening.ok) return opening;
  const cutResult = cut(partSolid, opening.value);
  if (!cutResult.ok) return cutResult;
  let solid = normalizeSolid(cutResult.value);

  // Fuse the tilted flap, hinged on the −v edge (y0), rising over the opening to
  // `height` on the formed face. Built in region-local space then placed via the
  // world frame; overlaps the hinge edge so it fuses into one body.
  const flap = buildLouverFlap(world, x0, x1, y0, spec.width, spec.height, part.thickness, sign);
  if (!flap.ok) return flap;
  const fused = fuse(solid, flap.value);
  if (!fused.ok) return fused;
  solid = normalizeSolid(fused.value);

  if (!isValid(solid) || getSolids(solid).length > 1) {
    return err(
      validationError('FORM_INVALID_SOLID', `addForm: louver on region '${spec.region}' did not form a single valid body`)
    );
  }

  // 2D: the louver footprint as the OPEN three-side U-cut the fabricator actually
  // cuts (all but the hinge at y0), plus the hinge segment as a separate fold line.
  // The cut path walks the three non-hinge sides — [x1,y0]→[x1,y1]→[x0,y1]→[x0,y0] —
  // leaving the y0 edge uncut so the flap stays hinged; emitting a closed loop would
  // tell the fabricator to cut all four sides and drop the flap out entirely.
  // Developed outline/area unchanged (forming is net-material-neutral).
  const cutPath: Pt2[] = [
    mapToFrame2([x1, y0], dev),
    mapToFrame2([x1, y1], dev),
    mapToFrame2([x0, y1], dev),
    mapToFrame2([x0, y0], dev),
  ];
  const hingeA = mapToFrame2([x0, y0], dev);
  const hingeB = mapToFrame2([x1, y0], dev);
  const feature: FormFeature = {
    spec,
    region: regionId,
    cuts: [cutPath],
    markers: [],
    hinge: [hingeA, hingeB],
  };
  return ok({ ...part, solid, forms: [...(part.forms ?? []), feature] });
}

/** Emboss/dimple: fuse a raised cylinder or cut a shallow recess; emit a 2D footprint. */
function embossForm(
  part: SheetMetalPart,
  partSolid: Solid,
  spec: Extract<FormSpec, { kind: 'emboss' }>,
  regionId: string,
  world: FlatFrame,
  dev: Frame2,
  ext: { uMax: number; vMax: number }
): Result<SheetMetalPart> {
  if (!Number.isFinite(spec.diameter) || spec.diameter <= 0) {
    return err(validationError('INVALID_FORM', `emboss diameter must be positive, got ${spec.diameter}`));
  }
  if (!Number.isFinite(spec.height) || spec.height <= 0) {
    return err(validationError('INVALID_FORM', `emboss height must be positive, got ${spec.height}`));
  }
  const r = spec.diameter / 2;
  if (spec.x - r < -EPS || spec.x + r > ext.uMax + EPS || spec.y - r < -EPS || spec.y + r > ext.vMax + EPS) {
    return err(
      validationError('FORM_OUT_OF_BOUNDS', `emboss at (${spec.x}, ${spec.y}) lies outside region [0,${ext.uMax}]×[0,${ext.vMax}]`)
    );
  }
  if (spec.form === 'dimple' && spec.height >= part.thickness - EPS) {
    return err(
      validationError('INVALID_FORM', `dimple depth ${spec.height} must be less than thickness ${part.thickness}`)
    );
  }

  // Centre of the form on the formed (+n) face, in world space.
  const faceCentre = vecAdd(
    vecAdd(vecAdd(world.origin, vecScale(world.u, spec.x)), vecScale(world.v, spec.y)),
    vecScale(world.n, part.thickness)
  );

  let solid: Solid;
  if (spec.form === 'emboss') {
    // Raised cylinder: base sunk a hair into the sheet for a robust fuse, extending
    // +n by `height`.
    const base = vecAdd(faceCentre, vecScale(world.n, -HAIR));
    const bump = cylinder(r, spec.height + HAIR, { at: base, axis: world.n });
    const fused = fuse(partSolid, bump);
    if (!fused.ok) return fused;
    solid = normalizeSolid(fused.value);
  } else {
    // Recess: cut a shallow cylinder down from the formed face by `height` (+HAIR so
    // the tool pokes cleanly through the top surface).
    const top = vecAdd(faceCentre, vecScale(world.n, HAIR));
    const tool = cylinder(r, spec.height + HAIR, { at: top, axis: vecScale(world.n, -1) });
    const cutResult = cut(partSolid, tool);
    if (!cutResult.ok) return cutResult;
    solid = normalizeSolid(cutResult.value);
  }

  if (!isValid(solid) || getSolids(solid).length > 1) {
    return err(
      validationError('FORM_INVALID_SOLID', `addForm: ${spec.form} on region '${spec.region}' did not form a single valid body`)
    );
  }

  const marker = circleLocal([spec.x, spec.y], r).map((p) => mapToFrame2(p, dev));
  const feature: FormFeature = {
    spec,
    region: regionId,
    cuts: [],
    markers: [marker],
  };
  return ok({ ...part, solid, forms: [...(part.forms ?? []), feature] });
}

/** A louver vent on a region; see {@link addForm}. */
export function louver(
  part: SheetMetalPart,
  opts: {
    region: string;
    x: number;
    y: number;
    length: number;
    width: number;
    height: number;
    direction?: 'up' | 'down';
  }
): Result<SheetMetalPart> {
  return addForm(part, { kind: 'louver', ...opts });
}

/** An emboss (raised) or dimple (recessed) round form on a region; see {@link addForm}. */
export function emboss(
  part: SheetMetalPart,
  opts: { region: string; x: number; y: number; diameter: number; height: number; kind: 'dimple' | 'emboss' }
): Result<SheetMetalPart> {
  return addForm(part, {
    kind: 'emboss',
    region: opts.region,
    x: opts.x,
    y: opts.y,
    diameter: opts.diameter,
    height: opts.height,
    form: opts.kind,
  });
}

/** Extrude a region-local loop fully through the sheet (a through-cut tool). */
function buildThroughTool(local: Pt2[], f: FlatFrame, thickness: number): Result<Solid> {
  const base = vecAdd(f.origin, vecScale(f.n, -HAIR));
  const worldPts: Vec3[] = local.map(([x, y]) =>
    vecAdd(vecAdd(base, vecScale(f.u, x)), vecScale(f.v, y))
  );
  const edges = [];
  for (let i = 0; i < worldPts.length; i += 1) {
    const a = worldPts[i];
    const b = worldPts[(i + 1) % worldPts.length];
    if (a === undefined || b === undefined) {
      return err(validationError('FORM_TOOL_FAILED', 'failed to index form loop points'));
    }
    edges.push(line(a, b));
  }
  const wire = wireLoop(edges);
  if (!wire.ok) return wire;
  if (!isPlanarWire(wire.value)) {
    return err(validationError('FORM_TOOL_FAILED', 'form profile wire is not planar'));
  }
  const profile = face(wire.value);
  if (!profile.ok) return profile;
  const depth = thickness + 2 * HAIR;
  return extrude(profile.value, [f.n[0] * depth, f.n[1] * depth, f.n[2] * depth]);
}

/**
 * Tilted louver flap, hinged on the `y0` (−v) edge of the opening: a thin plate
 * spanning `[x0,x1]` along u and `width` along v, tilted up about the hinge so its
 * far edge rises by `height` on the formed face (`sign` = +1 up / −1 down). Built in
 * a canonical local frame (hinge along +X at the origin, depth +Y, thickness +Z),
 * tilted about +X, then mapped onto the world frame's u/v/n.
 */
function buildLouverFlap(
  f: FlatFrame,
  x0: number,
  x1: number,
  y0: number,
  width: number,
  height: number,
  thickness: number,
  sign: number
): Result<Solid> {
  const plateThk = Math.max(thickness, EPS);
  const len = x1 - x0;
  // Tilt angle so the far edge (depth `width`) rises by `height`.
  const tiltDeg = (Math.atan2(height, width) * 180) / Math.PI;

  // Canonical flap: hinge along +X over [0,len], depth +Y over [0,width], thickness
  // sunk a hair below 0 so it overlaps the sheet at the hinge for a robust fuse.
  let flap: Solid = box(len, width, plateThk);
  flap = translate(flap, [0, 0, -plateThk + HAIR]);
  flap = rotate(flap, -sign * tiltDeg, { at: [0, 0, 0], axis: [1, 0, 0] });

  // Place: canonical +X→world u, +Y→world v, +Z→world n, origin at the hinge corner
  // on the formed face.
  const u = vecNormalize(f.u);
  const n = vecNormalize(f.n);
  const v = vecNormalize(vecCross(n, u));
  const hingeCorner = vecAdd(
    vecAdd(vecAdd(f.origin, vecScale(f.u, x0)), vecScale(f.v, y0)),
    vecScale(f.n, thickness)
  );
  const placed = mapLocalToWorld(flap, u, v, n, hingeCorner);
  return ok(placed);
}

/** Map a solid built in a canonical XYZ frame onto world axes (uT, vT, nT) at origin. */
function mapLocalToWorld(s: Solid, uT: Vec3, vT: Vec3, nT: Vec3, origin: Vec3): Solid {
  const m: number[] = [uT[0], vT[0], nT[0], uT[1], vT[1], nT[1], uT[2], vT[2], nT[2]];
  const aa = matrixToAxisAngle(m);
  const rotated = aa.angleDeg === 0 ? s : rotate(s, aa.angleDeg, { at: [0, 0, 0], axis: aa.axis });
  return translate(rotated, origin);
}

/** Axis-angle of a 3×3 row-major rotation matrix (columns = target basis). */
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

/** Region-local circle loop (CCW) centred at `c` of radius `r`. */
function circleLocal(c: Pt2, r: number): Pt2[] {
  const pts: Pt2[] = [];
  for (let i = 0; i < CIRCLE_SEGMENTS; i += 1) {
    const a = (2 * Math.PI * i) / CIRCLE_SEGMENTS;
    pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
  }
  return pts;
}
