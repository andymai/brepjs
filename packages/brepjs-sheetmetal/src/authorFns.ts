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
} from 'brepjs';
import type {
  BendFeature,
  BendRule,
  FlangeFeature,
  EdgeRef,
  MaterialSpec,
  MiterSpec,
  SheetMetalPart,
} from './types.js';
import { normalizeSolid } from './internal.js';

/** Authoring options for the base flat the flanges attach to. */
export interface BaseFlatSpec {
  /** Extent along the run (+X) axis. */
  length: number;
  /** Extent along the width (+Y) axis; shared by every flange. */
  width: number;
}

/** Which base edge a flange folds off. */
export type FlangeSide = 'xmax' | 'ymax';

/** A single flange to author off an edge of the base flat. */
export interface FlangeSpec {
  id: string;
  /** Flat length measured from the end of the bend along the flange plane. */
  length: number;
  /** Signed fold angle in degrees (Phase 1: fold direction is `up`). */
  angleDeg: number;
  rule: BendRule;
  /** Base edge to attach to. Default `'xmax'` (the leading +X edge). */
  side?: FlangeSide | undefined;
  miter?: MiterSpec | undefined;
}

/** Inputs for {@link authorPart}. */
export interface AuthorSpec {
  thickness: number;
  base: BaseFlatSpec;
  flanges: FlangeSpec[];
  material?: MaterialSpec | undefined;
}

/**
 * Stable edge reference for flange attachment. The base flat is `face-0`; every
 * flange face is `face-<n+1>` in authoring order. The leading (+X) edge of a flat
 * is `edgeIndex 0` — the only edge Phase 1 attaches flanges to. This scheme is
 * deterministic from construction order and is what the unfold/feature tree
 * consume (it never reads topology back out of the B-rep).
 */
export function baseEdgeRef(faceIndex: number): EdgeRef {
  return { kind: 'index', faceIndex, edgeIndex: 0 };
}

/**
 * Author a straight-bend sheet-metal part: a base flat plus one or more flanges
 * folded up off its leading edge. Returns a {@link SheetMetalPart} carrying the
 * folded 3D solid and the recorded bend feature tree (axis/angle/direction/rule
 * per bend) that the unfold consumes.
 *
 * Solid construction (plan §4): the base is a thickened rectangle; each flange is
 * a rectangular flat positioned by rotating about its recorded bend axis at the
 * inner-radius offset, joined to the base by a real cylindrical bend patch, then
 * fused. All construction stays on the public, OCCT-WASM-safe API.
 */
export function authorPart(spec: AuthorSpec): Result<SheetMetalPart> {
  const { thickness } = spec;
  if (!Number.isFinite(thickness) || thickness <= 0) {
    return err(validationError('INVALID_THICKNESS', `thickness must be positive, got ${thickness}`));
  }
  const { length: baseLen, width } = spec.base;
  if (!Number.isFinite(baseLen) || baseLen <= 0) {
    return err(validationError('INVALID_BASE_LENGTH', `base.length must be positive, got ${baseLen}`));
  }
  if (!Number.isFinite(width) || width <= 0) {
    return err(validationError('INVALID_BASE_WIDTH', `base.width must be positive, got ${width}`));
  }

  const seen = new Set<string>();
  const seenSides = new Set<FlangeSide>();
  for (const flange of spec.flanges) {
    if (seen.has(flange.id)) {
      return err(validationError('DUPLICATE_FLANGE', `duplicate flange id '${flange.id}'`));
    }
    seen.add(flange.id);
    // Phase 1 places one flange per base edge; two on the same side would overlap
    // and the unfold would silently keep only the last, so reject it up front.
    const side: FlangeSide = flange.side ?? 'xmax';
    if (seenSides.has(side)) {
      return err(
        validationError('DUPLICATE_SIDE', `flange '${flange.id}' reuses side '${side}'; one flange per side in Phase 1`)
      );
    }
    seenSides.add(side);
  }

  let solid: Solid = box(baseLen, width, thickness);

  const flanges: FlangeFeature[] = [];
  const bends: BendFeature[] = [];

  for (const flange of spec.flanges) {
    const built = buildFlange(solid, baseLen, width, thickness, flange);
    if (!built.ok) return built;
    solid = built.value.solid;
    flanges.push(built.value.flange);
    bends.push(built.value.bend);
  }

  return ok({
    thickness,
    baseLength: baseLen,
    width,
    ...(spec.material !== undefined ? { material: spec.material } : {}),
    flanges,
    bends,
    solid: normalizeSolid(solid),
  });
}

interface BuiltFlange {
  solid: Solid;
  flange: FlangeFeature;
  bend: BendFeature;
}

function buildFlange(
  base: Solid,
  baseLen: number,
  width: number,
  thickness: number,
  flange: FlangeSpec
): Result<BuiltFlange> {
  if (!Number.isFinite(flange.length) || flange.length <= 0) {
    return err(validationError('INVALID_FLANGE_LENGTH', `flange '${flange.id}' length must be positive`));
  }
  if (!Number.isFinite(flange.angleDeg) || flange.angleDeg <= 0 || flange.angleDeg > 180) {
    return err(
      validationError('INVALID_FLANGE_ANGLE', `flange '${flange.id}' angleDeg must be in (0, 180], got ${flange.angleDeg}`)
    );
  }
  const r = flange.rule.innerRadius;
  if (!Number.isFinite(r) || r < 0) {
    return err(validationError('INVALID_RADIUS', `flange '${flange.id}' innerRadius must be non-negative`));
  }

  const side: FlangeSide = flange.side ?? 'xmax';
  // The bend axis runs along the chosen edge, raised R above the base top surface
  // so the inner bend radius is R (inner cylinder tangent to the top at z=T). The
  // flange spans the full edge; its bend sweeps up about that axis.
  const span = side === 'xmax' ? width : baseLen;

  // Build the patch + flat in a canonical frame: axis along +Y at the origin, the
  // base contact straight below, run direction +X. Then place onto the real edge.
  const canonOrigin: Vec3 = [0, 0, thickness + r];
  const patch = buildBendPatch(canonOrigin, flange.angleDeg, r, span, thickness);
  if (!patch.ok) return patch;
  const flat = buildFlangeFlat(canonOrigin, flange.angleDeg, span, thickness, flange.length);

  const place = placement(side, baseLen, width);
  const patchPlaced = place(patch.value);
  const flatPlaced = place(flat);

  const fusedPatch = fuse(base, patchPlaced);
  if (!fusedPatch.ok) return fusedPatch;
  const fused = fuse(fusedPatch.value, flatPlaced);
  if (!fused.ok) return fused;

  const axisOrigin: Vec3 =
    side === 'xmax' ? [baseLen, 0, thickness + r] : [0, width, thickness + r];
  const axisDir: Vec3 = side === 'xmax' ? [0, 1, 0] : [1, 0, 0];

  const bend: BendFeature = {
    id: flange.id,
    axisOrigin: [axisOrigin[0], axisOrigin[1], axisOrigin[2]],
    axisDir: [axisDir[0], axisDir[1], axisDir[2]],
    angleDeg: flange.angleDeg,
    direction: 'up',
    rule: flange.rule,
  };

  const flangeFeature: FlangeFeature = {
    id: flange.id,
    baseEdge: baseEdgeRef(0),
    length: flange.length,
    span,
    angleDeg: flange.angleDeg,
    rule: flange.rule,
    ...(flange.miter !== undefined ? { miter: flange.miter } : {}),
  };

  return ok({ solid: fused.value, flange: flangeFeature, bend });
}

/**
 * Map the canonical-frame flange assembly (axis +Y at origin, run +X, spanning
 * +Y over [0, span]) onto the requested base edge. `xmax` is a pure +X shift; for
 * `ymax` a +90° rotation about Z turns the run from +X to +Y and the axis from +Y
 * to −X, after which a shift lands it on the +Y edge spanning X in [0, baseLen].
 */
function placement(side: FlangeSide, baseLen: number, width: number): (s: Solid) => Solid {
  if (side === 'xmax') {
    return (s) => translate(s, [baseLen, 0, 0]);
  }
  return (s) => {
    const rotated = rotate(s, 90, { at: [0, 0, 0], axis: [0, 0, 1] });
    return translate(rotated, [baseLen, width, 0]);
  };
}

/**
 * Cylindrical bend patch: the annular wedge swept by the bend. Built as a hollow
 * tube (outer radius R+T, inner R) along +Y, intersected with the angular wedge
 * spanning the fold, then translated so the inner surface meets the base edge.
 */
function buildBendPatch(
  axisOrigin: Vec3,
  thetaDeg: number,
  r: number,
  width: number,
  thickness: number
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

  const wedge = buildWedge(axisOrigin, thetaDeg, outerR, width);
  if (!wedge.ok) return wedge;
  return intersect(tube, wedge.value) as Result<ValidSolid>;
}

/**
 * Convex angular wedge (≤180°) isolating the fold sweep. The inner arc starts
 * pointing straight down (−Z) at the base contact and sweeps to the flange. With
 * OCCT's `rotate(+90°, +Y)` mapping +X→−Z, the wedge is the intersection of two
 * half-spaces through the bend axis: the +X side of the vertical start plane, and
 * the keep-side of the end plane (the start plane rotated by the fold). Both are
 * generous boxes; the tube intersection trims them to the true annular sector.
 */
function buildWedge(
  axisOrigin: Vec3,
  thetaDeg: number,
  outerR: number,
  width: number
): Result<Solid> {
  const span = outerR * 2 + 2;
  const margin = 1;

  // Half-space A: keep X >= axis.x. A block sitting on the +X side of the axis,
  // covering the full Z extent of the tube and the full width.
  const blockA = box(span, width + 2 * margin, 2 * span);
  const halfA: Solid = translate(blockA, [
    axisOrigin[0],
    axisOrigin[1] - margin,
    axisOrigin[2] - span,
  ]);

  // Half-space B: half-A rotated about the bend axis by (180 - theta) degrees, so
  // its keep-face normal aligns with the end edge of the sweep. Their intersection
  // is the convex wedge between the start (-Z) and flange directions.
  const halfB = rotate(halfA, 180 - thetaDeg, { at: axisOrigin, axis: [0, 1, 0] });

  return intersect(halfA, halfB);
}

/** The flange flat, built lying along +X past the bend, then folded up to angle. */
function buildFlangeFlat(
  axisOrigin: Vec3,
  thetaDeg: number,
  width: number,
  thickness: number,
  length: number
): Solid {
  // Unfolded (theta=0) the flange is coplanar with the base sheet (Z in [0, T]),
  // running in +X from the bend's tangent point at x = axisOrigin.x. Folding up by
  // theta is rotate(-theta) about +Y (which sends +X toward +Z).
  const flat = box(length, width, thickness);
  const positioned: Solid = translate(flat, [axisOrigin[0], axisOrigin[1], 0]);
  return rotate(positioned, -thetaDeg, { at: axisOrigin, axis: [0, 1, 0] });
}
