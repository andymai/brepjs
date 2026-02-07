/**
 * Compound operations — high-level CAD features built from primitives + booleans.
 *
 * drill(), pocket(), boss(), mirrorJoin(), rectangularPattern()
 */

import type { Vec3 } from '../core/types.js';
import type { Result } from '../core/result.js';
import { ok, err, isErr } from '../core/result.js';
import type { Face, Shape3D, Wire } from '../core/shapeTypes.js';
import { validationError } from '../core/errors.js';
import { vecScale, vecNormalize, vecIsZero } from '../core/vecOps.js';
import type {
  Shapeable,
  FinderFn,
  DrillOptions,
  PocketOptions,
  BossOptions,
  MirrorJoinOptions,
  RectangularPatternOptions,
} from './apiTypes.js';
import { resolve } from './apiTypes.js';
import { getBounds, getFaces, translateShape, mirrorShape } from './shapeFns.js';
import { fuseShape, cutShape } from './booleanFns.js';
import { extrudeFace } from '../operations/extrudeFns.js';
import { faceFinder } from '../query/finderFns.js';
import { normalAt, faceCenter } from './faceFns.js';
import { makeFace as _makeFace, makeCylinder as _makeCylinder } from './shapeHelpers.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve a face selection: Face, FinderFn, or default (top Z-facing face). */
function resolveTargetFace(shape: Shape3D, faceSpec: Face | FinderFn<Face> | undefined): Face {
  if (faceSpec === undefined) {
    // Default: top face — face whose center has the highest Z
    const faces = getFaces(shape);
    if (faces.length === 0) {
      throw new Error('compoundOps: shape has no faces');
    }
    let best = faces[0]!; // eslint-disable-line @typescript-eslint/no-non-null-assertion -- checked length > 0
    let bestZ = faceCenter(best)[2];
    for (let i = 1; i < faces.length; i++) {
      const f = faces[i]!; // eslint-disable-line @typescript-eslint/no-non-null-assertion -- bounded by length
      const z = faceCenter(f)[2];
      if (z > bestZ) {
        best = f;
        bestZ = z;
      }
    }
    return best;
  }
  if (typeof faceSpec === 'function') {
    const finder = faceSpec(faceFinder());
    const found = finder.findAll(shape);
    if (found.length === 0) {
      throw new Error('compoundOps: face finder matched no faces');
    }
    return found[0]!; // eslint-disable-line @typescript-eslint/no-non-null-assertion -- checked length > 0
  }
  return faceSpec;
}

/** Convert a Drawing or Wire to a Wire. */
function toWire(profile: { sketchOnPlane?: unknown } | Wire): Wire {
  // If it's a Drawing, call sketchOnPlane() to get a Sketch, then get wire
  if ('sketchOnPlane' in profile && typeof profile.sketchOnPlane === 'function') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drawing type from sketching layer
    const sketch = (profile as any).sketchOnPlane('XY') as { wire: Wire };
    return sketch.wire;
  }
  // Already a Wire
  return profile as Wire;
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

  // Compute depth
  let depth = options.depth;
  if (depth === undefined) {
    // Through-all: use bounding box diagonal as a safe overshoot
    const b = getBounds(s);
    const dx = b.xMax - b.xMin;
    const dy = b.yMax - b.yMin;
    const dz = b.zMax - b.zMin;
    depth = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1;
  }

  const cyl = _makeCylinder(radius, depth, pos, dir);

  // Also shift cylinder backwards by half depth along axis to ensure through-cut
  // when no explicit depth is given
  const startOffset: Vec3 = options.depth === undefined ? vecScale(dir, -depth / 2) : [0, 0, 0];
  const tool =
    startOffset[0] !== 0 || startOffset[1] !== 0 || startOffset[2] !== 0
      ? translateShape(cyl, startOffset)
      : cyl;

  return cutShape(s, tool) as Result<T>;
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

  const targetFace = resolveTargetFace(s, options.face);
  const normal = normalAt(targetFace);
  const w = toWire(profile);

  // Create a face from the wire
  const faceResult = _makeFace(w);
  if (isErr(faceResult)) return faceResult as Result<T>;

  // Extrude inward (opposite to face normal)
  const extDir = vecScale(vecNormalize(normal), -depth);
  const tool = extrudeFace(faceResult.value, extDir);

  return cutShape(s, tool) as Result<T>;
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

  const targetFace = resolveTargetFace(s, options.face);
  const normal = normalAt(targetFace);
  const w = toWire(profile);

  // Create a face from the wire
  const faceResult = _makeFace(w);
  if (isErr(faceResult)) return faceResult as Result<T>;

  // Extrude outward (along face normal)
  const extDir = vecScale(vecNormalize(normal), height);
  const tool = extrudeFace(faceResult.value, extDir);

  return fuseShape(s, tool) as Result<T>;
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
  const origin = options?.origin;

  const mirrored = mirrorShape(s, normal, origin);
  return fuseShape(s, mirrored) as Result<T>;
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

  // Build all copies (skip origin copy at [0,0])
  let result: Shape3D = s;
  for (let xi = 0; xi < xCount; xi++) {
    for (let yi = 0; yi < yCount; yi++) {
      if (xi === 0 && yi === 0) continue; // skip original
      const offset: Vec3 = [
        xNorm[0] * xSpacing * xi + yNorm[0] * ySpacing * yi,
        xNorm[1] * xSpacing * xi + yNorm[1] * ySpacing * yi,
        xNorm[2] * xSpacing * xi + yNorm[2] * ySpacing * yi,
      ];
      const copy = translateShape(s, offset);
      const fuseResult = fuseShape(result, copy);
      if (isErr(fuseResult)) return fuseResult as Result<T>;
      result = fuseResult.value;
    }
  }

  return ok(result) as Result<T>;
}
