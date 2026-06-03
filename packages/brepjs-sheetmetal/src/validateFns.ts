import {
  type Vec3,
  type Bounds3D,
  isValid,
  measureVolume,
  getBounds,
  vecNormalize,
  vecAdd,
  vecScale,
  vecCross,
} from 'brepjs';
import type { BendFeature, SheetMetalPart, SheetMetalWarning } from './types.js';
import { ROOT_FLAT_ID } from './featureTreeFns.js';

const OVERLAP_TOL = 1e-6;

/**
 * Manufacturability checks for an authored sheet-metal part. Returns a list of
 * {@link SheetMetalWarning} — these are advisory, never errors: a part with
 * warnings is still produced and exportable. Three checks per plan §6:
 *
 *  - `INVALID_SOLID`: the folded solid is missing, fails kernel validity, or has
 *    no positive volume.
 *  - `COLLISION`: two flanges' axis-aligned bounding boxes overlap once folded —
 *    the cheap interference signal for corners that need a miter or relief cut.
 *  - `MIN_RADIUS`: a bend's inner radius is below one material thickness
 *    (`R < 1×T`), the standard minimum-bend-radius rule of thumb.
 */
export function validatePart(part: SheetMetalPart): SheetMetalWarning[] {
  const warnings: SheetMetalWarning[] = [];
  warnings.push(...checkSolid(part));
  warnings.push(...checkCollisions(part));
  warnings.push(...checkMinRadius(part));
  return warnings;
}

function checkSolid(part: SheetMetalPart): SheetMetalWarning[] {
  const solid = part.solid;
  if (solid === undefined) {
    return [{ code: 'INVALID_SOLID', message: 'part has no folded solid' }];
  }
  if (!isValid(solid)) {
    return [{ code: 'INVALID_SOLID', message: 'folded solid failed kernel validity check' }];
  }
  const vol = measureVolume(solid);
  if (!vol.ok) {
    return [{ code: 'INVALID_SOLID', message: 'folded solid volume could not be measured' }];
  }
  if (vol.value <= 0) {
    return [
      {
        code: 'INVALID_SOLID',
        message: `folded solid has non-positive volume ${vol.value}`,
      },
    ];
  }
  return [];
}

function checkMinRadius(part: SheetMetalPart): SheetMetalWarning[] {
  const warnings: SheetMetalWarning[] = [];
  if (!(part.thickness > 0)) return warnings;
  for (const bend of part.bends) {
    if (bend.id.startsWith('seam::')) continue;
    if (bend.rule.innerRadius < part.thickness) {
      warnings.push({
        code: 'MIN_RADIUS',
        message: `bend '${bend.id}' inner radius ${bend.rule.innerRadius} < thickness ${part.thickness} (R < 1×T)`,
        featureId: bend.id,
      });
    }
  }
  return warnings;
}

function checkCollisions(part: SheetMetalPart): SheetMetalWarning[] {
  const warnings: SheetMetalWarning[] = [];
  if (part.bends.length < 2 || part.solid === undefined) return warnings;

  const b = getBounds(part.solid);
  const center: Vec3 = [(b.xMin + b.xMax) / 2, (b.yMin + b.yMax) / 2, 0];

  const boxes: { id: string; bounds: Bounds3D }[] = [];
  for (const bend of part.bends) {
    const flange = part.flanges.find((f) => f.id === bend.id);
    if (flange === undefined) continue;
    // The analytic flangeBounds re-fold assumes the flange folds off the z=0 base
    // plane: correct for root flanges, but wrong for chained flanges whose parent
    // edge sits off that plane (it would report false-positive corner collisions).
    // For chained flanges, use the AABB authorPart recorded from real geometry.
    const parentId = flange.baseEdge.parentId;
    const isChained =
      parentId !== undefined && parentId !== ROOT_FLAT_ID && parentId !== 'face-0';
    const bounds =
      isChained && flange.foldedBounds !== undefined
        ? flange.foldedBounds
        : flangeBounds(bend, flange.length, flange.span, part.thickness, center);
    boxes.push({ id: bend.id, bounds });
  }

  // A corner resolved by a miter or a corner relief is no longer an interference:
  // both record a `CornerMiter` for the pair, so skip those pairs.
  const resolved = new Set<string>();
  for (const m of part.miters ?? []) {
    resolved.add(pairKey(m.flangeA, m.flangeB));
  }

  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      if (a === undefined || b === undefined) continue;
      if (resolved.has(pairKey(a.id, b.id))) continue;
      if (boundsOverlap(a.bounds, b.bounds)) {
        warnings.push({
          code: 'COLLISION',
          message: `flanges '${a.id}' and '${b.id}' overlap once folded`,
          featureId: a.id,
        });
      }
    }
  }
  return warnings;
}

/**
 * Axis-aligned bounding box of a folded flange flat, computed analytically from
 * its recorded bend feature (no kernel call). The flat is a `length × span ×
 * thickness` box that — before folding — lies in the base plane, extending
 * outward from the bend axis along the run direction. Folding up by `angleDeg`
 * rotates that run+thickness plane about the axis. The eight folded corners give
 * the AABB. This mirrors {@link authorPart}'s `rotate(-θ)` up-fold (which maps the
 * run direction toward +Z) without re-running the boolean construction.
 */
function flangeBounds(
  bend: BendFeature,
  length: number,
  span: number,
  thickness: number,
  center: Vec3
): Bounds3D {
  const axis = vecNormalize(bend.axisDir);
  const run = outwardRun(bend.axisOrigin, axis, center);
  // A down-bend folds the run toward −Z instead of +Z.
  const up: Vec3 = bend.direction === 'down' ? [0, 0, -1] : [0, 0, 1];

  const theta = (bend.angleDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  // Folding up by θ rotates the run/thickness plane about the axis: the run
  // direction tips toward +Z, the sheet normal tips back toward −run.
  const runFolded: Vec3 = [
    run[0] * cos + up[0] * sin,
    run[1] * cos + up[1] * sin,
    run[2] * cos + up[2] * sin,
  ];
  const normalFolded: Vec3 = [
    -run[0] * sin + up[0] * cos,
    -run[1] * sin + up[1] * cos,
    -run[2] * sin + up[2] * cos,
  ];

  const base: Vec3 = [bend.axisOrigin[0], bend.axisOrigin[1], 0];
  const corners: Vec3[] = [];
  for (const s of [0, span]) {
    for (const l of [0, length]) {
      for (const t of [0, thickness]) {
        const p = vecAdd(
          vecAdd(vecAdd(base, vecScale(axis, s)), vecScale(runFolded, l)),
          vecScale(normalFolded, t)
        );
        corners.push(p);
      }
    }
  }

  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  let zMin = Infinity;
  let zMax = -Infinity;
  for (const c of corners) {
    if (c[0] < xMin) xMin = c[0];
    if (c[0] > xMax) xMax = c[0];
    if (c[1] < yMin) yMin = c[1];
    if (c[1] > yMax) yMax = c[1];
    if (c[2] < zMin) zMin = c[2];
    if (c[2] > zMax) zMax = c[2];
  }
  return { xMin, xMax, yMin, yMax, zMin, zMax };
}

/** In-plane perpendicular to the axis pointing away from the part center. */
function outwardRun(axisOrigin: Vec3, axis: Vec3, center: Vec3): Vec3 {
  const perp = vecNormalize(vecCross(axis, [0, 0, 1]));
  const toEdge: Vec3 = [
    axisOrigin[0] - center[0],
    axisOrigin[1] - center[1],
    0,
  ];
  const dot = perp[0] * toEdge[0] + perp[1] * toEdge[1];
  return dot >= 0 ? perp : [-perp[0], -perp[1], -perp[2]];
}

/** Order-independent key for a flange pair (corner identity). */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

function boundsOverlap(a: Bounds3D, b: Bounds3D): boolean {
  return (
    a.xMin < b.xMax - OVERLAP_TOL &&
    b.xMin < a.xMax - OVERLAP_TOL &&
    a.yMin < b.yMax - OVERLAP_TOL &&
    b.yMin < a.yMax - OVERLAP_TOL &&
    a.zMin < b.zMax - OVERLAP_TOL &&
    b.zMin < a.zMax - OVERLAP_TOL
  );
}
