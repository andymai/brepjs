/**
 * Semantic face roles for an extrusion, recorded while the profile is still
 * known:
 * - `extrude:start`: the cap on the profile.
 * - `extrude:end`: the cap at profile + vector.
 * - `extrude:side:<i>`: the face swept from edge `i` of the profile's outer wire.
 * - `extrude:hole<j>:side:<i>`: the face swept from edge `i` of inner wire `j`.
 *
 * Edge `i` follows the profile's own edge order (the written outline order).
 * Kernels list an extrusion's faces in different orders, so faces are matched
 * by position instead.
 */

import type { Vec3 } from '@/core/types.js';
import type { Dimension, Face, Shape3D } from '@/core/shapeTypes.js';
import { HASH_CODE_MAX } from '@/core/constants.js';
import { vecAdd, vecDistance, vecLength, vecScale } from '@/core/vecOps.js';
import { getKernel } from '@/kernel/index.js';
import type { KernelShape } from '@/kernel/types.js';
import { setFaceRoles } from '@/topology/metadata/faceRoleFns.js';

/** Match tolerance as a fraction of the extrusion's size. */
const RELATIVE_TOLERANCE = 1e-6;

interface Anchor {
  readonly role: string;
  readonly point: Vec3;
}

interface LocatedFace {
  readonly hash: number;
  readonly point: Vec3;
}

function centerOf({ min, max }: { readonly min: Vec3; readonly max: Vec3 }): Vec3 {
  return [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
}

function boxCenter(shape: KernelShape): Vec3 {
  return centerOf(getKernel().boundingBox(shape));
}

function edgeCenters(wire: KernelShape): Vec3[] {
  const kernel = getKernel();
  const centers: Vec3[] = [];
  for (const edge of kernel.iterShapes(wire, 'edge')) {
    try {
      centers.push(boxCenter(edge));
    } finally {
      kernel.dispose(edge);
    }
  }
  return centers;
}

/**
 * Where each role's face sits, as a bounding-box center. A face swept from an
 * edge is the edge's Minkowski sum with the segment [0, vector], so its box
 * center is the edge's box center + vector / 2; the caps are translated copies
 * of the profile. This holds for exact boxes (OCCT) and vertex boxes (brepkit)
 * alike, so predicted and actual centers agree to rounding.
 */
function anchorsFor(profile: KernelShape, start: Vec3, vector: Vec3): Anchor[] {
  const kernel = getKernel();
  const anchors: Anchor[] = [
    { role: 'extrude:start', point: start },
    { role: 'extrude:end', point: vecAdd(start, vector) },
  ];
  const halfVector = vecScale(vector, 0.5);
  const outer = kernel.outerWire(profile);
  try {
    let hole = 0;
    for (const wire of kernel.iterShapes(profile, 'wire')) {
      try {
        const prefix = kernel.isSame(wire, outer) ? 'extrude:side' : `extrude:hole${hole++}:side`;
        edgeCenters(wire).forEach((center, i) => {
          anchors.push({ role: `${prefix}:${i}`, point: vecAdd(center, halfVector) });
        });
      } finally {
        kernel.dispose(wire);
      }
    }
  } finally {
    kernel.dispose(outer);
  }
  return anchors;
}

function locateFaces(solid: KernelShape): LocatedFace[] {
  const kernel = getKernel();
  const located: LocatedFace[] = [];
  for (const face of kernel.iterShapes(solid, 'face')) {
    try {
      located.push({ hash: kernel.hashCode(face, HASH_CODE_MAX), point: boxCenter(face) });
    } finally {
      kernel.dispose(face);
    }
  }
  return located;
}

function lowerBound(sortedKeys: readonly number[], key: number): number {
  let lo = 0;
  let hi = sortedKeys.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((sortedKeys[mid] ?? Infinity) < key) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The coordinate axis along which `points` spread furthest. */
function widestAxis(points: readonly Vec3[]): 0 | 1 | 2 {
  let axis: 0 | 1 | 2 = 0;
  let widest = -Infinity;
  for (const candidate of [0, 1, 2] as const) {
    let min = Infinity;
    let max = -Infinity;
    for (const p of points) {
      min = Math.min(min, p[candidate]);
      max = Math.max(max, p[candidate]);
    }
    if (max - min > widest) {
      axis = candidate;
      widest = max - min;
    }
  }
  return axis;
}

/**
 * Pair each anchor with its nearest face within `tolerance`. Returns undefined
 * unless the pairing is one-to-one over every face, so an unexpected topology
 * records nothing rather than wrong names. Candidates are windowed along the
 * axis the face centers spread furthest on: a profile in the YZ plane puts
 * every side face at one X, which would make a fixed X window scan them all.
 */
function matchAnchors(
  anchors: readonly Anchor[],
  faces: readonly LocatedFace[],
  tolerance: number
): Map<number, string> | undefined {
  if (anchors.length !== faces.length) return undefined;
  const axis = widestAxis(faces.map((f) => f.point));
  const sorted = [...faces].sort((a, b) => a.point[axis] - b.point[axis]);
  const keys = sorted.map((f) => f.point[axis]);
  const claimed = new Set<number>();
  const roles = new Map<number, string>();
  for (const { role, point } of anchors) {
    let best = -1;
    let bestDistance = tolerance;
    for (let i = lowerBound(keys, point[axis] - tolerance); i < sorted.length; i++) {
      const face = sorted[i];
      if (face === undefined || face.point[axis] > point[axis] + tolerance) break;
      const d = vecDistance(face.point, point);
      if (d <= bestDistance) {
        best = i;
        bestDistance = d;
      }
    }
    const match = best < 0 ? undefined : sorted[best];
    if (match === undefined || claimed.has(best)) return undefined;
    claimed.add(best);
    roles.set(match.hash, role);
  }
  return roles;
}

/**
 * Record `extrude:*` face roles on `solid`, the extrusion of `profile` along
 * `vector`, for `assignRoles(solid, 'extrude')` to read. Records nothing on a
 * mesh kernel, or when the faces don't pair one-to-one with the profile's caps
 * and edges; `assignRoles` then falls back to positional names.
 */
export function recordExtrudeRoles(solid: Shape3D, profile: Face<Dimension>, vector: Vec3): void {
  const kernel = getKernel();
  if (!kernel.capabilities.exact) return;
  const profileBox = kernel.boundingBox(profile.wrapped);
  const size = vecDistance(profileBox.min, profileBox.max) + vecLength(vector);
  const roles = matchAnchors(
    anchorsFor(profile.wrapped, centerOf(profileBox), vector),
    locateFaces(solid.wrapped),
    RELATIVE_TOLERANCE * size
  );
  if (roles) setFaceRoles(solid, roles);
}
