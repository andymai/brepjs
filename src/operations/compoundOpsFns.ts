/**
 * Compound operations — high-level CAD features built from primitives + booleans.
 *
 * drill(), pocket(), boss(), mirrorJoin(), rectangularPattern()
 */

import type { Vec3 } from '@/core/types.js';
import type { Result } from '@/core/result.js';
import { ok, err, isErr } from '@/core/result.js';
import type { ClosedWire, Face, PlanarWire, Shape3D, Wire } from '@/core/shapeTypes.js';
import { validationError, queryError, BrepErrorCode } from '@/core/errors.js';
import { vecScale, vecNormalize, vecIsZero } from '@/core/vecOps.js';
import type {
  Shapeable,
  FinderFn,
  DrawingLike,
  DrillOptions,
  PocketOptions,
  BossOptions,
  MirrorJoinOptions,
  RectangularPatternOptions,
} from '@/topology/apiTypes.js';
import { resolve } from '@/topology/apiTypes.js';
import { getBounds, getFaces, translate, mirror } from '@/topology/shapeFns.js';
import { fuse, cut, fuseAll } from '@/topology/booleanFns.js';
import { extrude } from './extrudeFns.js';
import { faceFinder } from '@/query/finderFns.js';
import { normalAt, faceCenter } from '@/topology/faceFns.js';
import { makeFace as _makeFace, makeCylinder as _makeCylinder } from '@/topology/shapeHelpers.js';
import { firstOrThrow, getAtOrThrow } from '@/utils/arrayAccess.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve a face selection: Face, FinderFn, or default (top Z-facing face). */
function resolveTargetFace(
  shape: Shape3D,
  faceSpec: Face | FinderFn<Face> | undefined
): Result<Face> {
  if (faceSpec === undefined) {
    // Default: top face — face whose center has the highest Z
    const faces = getFaces(shape);
    if (faces.length === 0) {
      return err(
        validationError(BrepErrorCode.COMPOUND_NO_FACES, 'compoundOps: shape has no faces')
      );
    }
    let best = firstOrThrow(faces);
    let bestZ = faceCenter(best)[2];
    for (let i = 1; i < faces.length; i++) {
      const f = getAtOrThrow(faces, i);
      const z = faceCenter(f)[2];
      if (z > bestZ) {
        best = f;
        bestZ = z;
      }
    }
    return ok(best);
  }
  if (typeof faceSpec === 'function') {
    const finder = faceSpec(faceFinder());
    const found = finder.findAll(shape);
    if (found.length === 0) {
      return err(
        queryError(
          BrepErrorCode.COMPOUND_FACE_NOT_FOUND,
          'compoundOps: face finder matched no faces'
        )
      );
    }
    return ok(found[0]!); // eslint-disable-line @typescript-eslint/no-non-null-assertion -- checked length > 0
  }
  return ok(faceSpec);
}

/** Convert a DrawingLike or Wire to a ClosedWire & PlanarWire (profiles are always closed and planar). */
function toWire(profile: DrawingLike | Wire): ClosedWire & PlanarWire {
  if ('sketchOnPlane' in profile && typeof profile.sketchOnPlane === 'function') {
    // planar by construction: sketch operates on XY plane
    return profile.sketchOnPlane('XY').wire as ClosedWire & PlanarWire;
  }
  // planar by construction: remaining cases are either DrawingLike 2D profiles
  // or Wire inputs — callers are expected to pass closed, planar profiles here.
  return profile as ClosedWire & PlanarWire;
}

// ---------------------------------------------------------------------------
// drill — create hole(s) by cutting a cylinder
// ---------------------------------------------------------------------------

/**
 * Drill a hole through a 3D shape.
 *
 * Creates a cylinder at the specified position and cuts it from the shape.
 * If no depth is given, cuts all the way through (computed from bounding box).
 */
export function drill<T extends Shape3D>(shape: Shapeable<T>, options: DrillOptions): Result<T> {
  const s = resolve(shape);
  const { at, radius, axis: rawAxis } = options;
  const axis = rawAxis ?? [0, 0, 1];

  if (radius <= 0) {
    return err(validationError('DRILL_INVALID_RADIUS', 'Drill radius must be positive'));
  }
  if (vecIsZero(axis)) {
    return err(validationError('DRILL_ZERO_AXIS', 'Drill axis cannot be zero'));
  }

  const dir = vecNormalize(axis);

  // Resolve position — Vec2 projects onto axis origin
  const pos: Vec3 = at.length === 2 ? [at[0], at[1], 0] : [at[0], at[1], at[2]];

  // Compute depth and starting position
  let tool: Shape3D;
  if (options.depth !== undefined) {
    // Explicit depth: cylinder starts at pos, extends along dir
    tool = _makeCylinder(radius, options.depth, pos, dir);
  } else {
    // Through-all: project bounding box onto drill axis to find exact extent,
    // then add a small overshoot. This avoids creating an oversized tool that
    // confuses the mesh boolean's inside/outside classification.
    const b = getBounds(s);
    const corners: Vec3[] = [
      [b.xMin, b.yMin, b.zMin],
      [b.xMax, b.yMin, b.zMin],
      [b.xMin, b.yMax, b.zMin],
      [b.xMax, b.yMax, b.zMin],
      [b.xMin, b.yMin, b.zMax],
      [b.xMax, b.yMin, b.zMax],
      [b.xMin, b.yMax, b.zMax],
      [b.xMax, b.yMax, b.zMax],
    ];
    // Project each corner onto the drill axis relative to pos
    let tMin = Infinity;
    let tMax = -Infinity;
    for (const c of corners) {
      const t = (c[0] - pos[0]) * dir[0] + (c[1] - pos[1]) * dir[1] + (c[2] - pos[2]) * dir[2];
      if (t < tMin) tMin = t;
      if (t > tMax) tMax = t;
    }
    const overshoot = 1;
    tMin -= overshoot;
    tMax += overshoot;
    const depth = tMax - tMin;
    const startPos: Vec3 = [pos[0] + dir[0] * tMin, pos[1] + dir[1] * tMin, pos[2] + dir[2] * tMin];
    tool = _makeCylinder(radius, depth, startPos, dir);
  }

  return cut(s, tool, { unsafe: true }) as Result<T>;
}

// ---------------------------------------------------------------------------
// pocket — cut a 2D profile into a face
// ---------------------------------------------------------------------------

/**
 * Cut a pocket (2D profile extruded inward) into a shape.
 *
 * The profile (Drawing or Wire) is positioned on the target face and extruded
 * inward by the specified depth, then subtracted from the shape.
 */
export function pocket<T extends Shape3D>(shape: Shapeable<T>, options: PocketOptions): Result<T> {
  const s = resolve(shape);
  const { profile, depth } = options;

  if (depth <= 0) {
    return err(validationError('POCKET_INVALID_DEPTH', 'Pocket depth must be positive'));
  }

  const targetResult = resolveTargetFace(s, options.face);
  if (isErr(targetResult)) return targetResult;
  const targetFace = targetResult.value;
  const normal = normalAt(targetFace);
  const center = faceCenter(targetFace);
  const w = toWire(profile);

  const faceResult = _makeFace(w);
  if (isErr(faceResult)) return faceResult;

  // Position the profile on the target face before extruding
  const positioned = translate(faceResult.value, center);
  const extDir = vecScale(vecNormalize(normal), -depth);
  const toolResult = extrude(positioned, extDir);
  if (isErr(toolResult)) return toolResult;

  return cut(s, toolResult.value, { unsafe: true }) as Result<T>;
}

// ---------------------------------------------------------------------------
// boss — extrude a 2D profile onto a face
// ---------------------------------------------------------------------------

/**
 * Add a boss (2D profile extruded outward) onto a shape.
 *
 * The profile (Drawing or Wire) is positioned on the target face and extruded
 * outward by the specified height, then fused with the shape.
 */
export function boss<T extends Shape3D>(shape: Shapeable<T>, options: BossOptions): Result<T> {
  const s = resolve(shape);
  const { profile, height } = options;

  if (height <= 0) {
    return err(validationError('BOSS_INVALID_HEIGHT', 'Boss height must be positive'));
  }

  const targetResult = resolveTargetFace(s, options.face);
  if (isErr(targetResult)) return targetResult;
  const targetFace = targetResult.value;
  const normal = normalAt(targetFace);
  const center = faceCenter(targetFace);
  const w = toWire(profile);

  const faceResult = _makeFace(w);
  if (isErr(faceResult)) return faceResult;

  // Position the profile on the target face before extruding
  const positioned = translate(faceResult.value, center);
  const extDir = vecScale(vecNormalize(normal), height);
  const toolResult = extrude(positioned, extDir);
  if (isErr(toolResult)) return toolResult;

  return fuse(s, toolResult.value, { unsafe: true }) as Result<T>;
}

// ---------------------------------------------------------------------------
// mirrorJoin — mirror and fuse in one step
// ---------------------------------------------------------------------------

/**
 * Mirror a shape and fuse it with the original.
 *
 * Common pattern: model half a part, then mirror-join for symmetry.
 */
export function mirrorJoin<T extends Shape3D>(
  shape: Shapeable<T>,
  options?: MirrorJoinOptions
): Result<T> {
  const s = resolve(shape);
  const normal = options?.normal ?? [1, 0, 0];
  const planeOrigin = options?.at;

  if (vecIsZero(normal)) {
    return err(validationError('MIRROR_ZERO_NORMAL', 'Mirror plane normal cannot be zero'));
  }

  const mirrored = mirror(s, normal, planeOrigin);
  return fuse(s, mirrored, { unsafe: true }) as Result<T>;
}

// ---------------------------------------------------------------------------
// rectangularPattern — 2D array of copies fused together
// ---------------------------------------------------------------------------

/**
 * Create a rectangular (2D grid) pattern of a shape.
 *
 * Replicates the shape along two directions with specified counts and spacings,
 * then fuses all copies into a single shape.
 */
export function rectangularPattern<T extends Shape3D>(
  shape: Shapeable<T>,
  options: RectangularPatternOptions
): Result<T> {
  const s = resolve(shape);
  const { xDir, xCount, xSpacing, yDir, yCount, ySpacing } = options;

  if (xCount < 1 || yCount < 1) {
    return err(validationError('PATTERN_INVALID_COUNT', 'Pattern counts must be at least 1'));
  }
  if (vecIsZero(xDir)) {
    return err(validationError('PATTERN_ZERO_DIRECTION', 'X direction cannot be zero'));
  }
  if (vecIsZero(yDir)) {
    return err(validationError('PATTERN_ZERO_DIRECTION', 'Y direction cannot be zero'));
  }

  if (xCount === 1 && yCount === 1) return ok(s);

  const xNorm = vecNormalize(xDir);
  const yNorm = vecNormalize(yDir);

  // Collect all copies first, then batch-fuse with native N-way boolean.
  // This replaces sequential fuse() (N-1 pairwise operations on growing shapes)
  // with a single BRepAlgoAPI_BuilderAlgo call.
  const copies: Shape3D[] = [s];
  for (let xi = 0; xi < xCount; xi++) {
    for (let yi = 0; yi < yCount; yi++) {
      if (xi === 0 && yi === 0) continue; // skip original
      const offset: Vec3 = [
        xNorm[0] * xSpacing * xi + yNorm[0] * ySpacing * yi,
        xNorm[1] * xSpacing * xi + yNorm[1] * ySpacing * yi,
        xNorm[2] * xSpacing * xi + yNorm[2] * ySpacing * yi,
      ];
      copies.push(translate(s, offset));
    }
  }

  return fuseAll(copies, { unsafe: true }) as Result<T>;
}
