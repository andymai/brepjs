/**
 * Measurement operations for the manifold adapter.
 *
 * Manifold is a triangle-mesh kernel: it exposes exact `volume()` and
 * `surfaceArea()`, but has no B-rep notion of edges, faces, or surface
 * parametrization. Length, curvature, and witness-point distance are not
 * representable here; those queries are answered by the OCCT kernel via
 * op-graph replay at a higher layer. The methods below cover what the mesh
 * representation can answer directly. All measurements are read-only and
 * record no op-nodes.
 * @module
 */

import type { BulkMeasurement, KernelMeasureOps } from '@/kernel/interfaces/measureOps.js';
import type { KernelAdapter } from '@/kernel/interfaces/index.js';
import type { DistanceResult, KernelShape } from '@/kernel/types.js';
import { getKernel } from '@/kernel/index.js';
import type { ManifoldModule } from './helpers.js';
import { notImplemented } from './helpers.js';
import type { ManifoldShape } from './meshHandle.js';
import type { OpNode } from './opGraph.js';
import { unwrap } from './meshHandle.js';
import { replay } from './replay.js';

type Vec3 = [number, number, number];

interface ManifoldBox {
  readonly min: Vec3;
  readonly max: Vec3;
}

function solidOf(shape: KernelShape): ReturnType<typeof unwrap> {
  return unwrap(shape as ManifoldShape);
}

function boxOf(shape: KernelShape): ManifoldBox {
  return solidOf(shape).boundingBox() as ManifoldBox;
}

export function volume(shape: KernelShape): number {
  return solidOf(shape).volume() as number;
}

export function area(shape: KernelShape): number {
  return solidOf(shape).surfaceArea() as number;
}

export function boundingBox(shape: KernelShape): { min: Vec3; max: Vec3 } {
  const bb = boxOf(shape);
  return { min: [...bb.min], max: [...bb.max] };
}

export function centerOfMass(shape: KernelShape): Vec3 {
  const bb = boxOf(shape);
  return [
    (bb.min[0] + bb.max[0]) / 2,
    (bb.min[1] + bb.max[1]) / 2,
    (bb.min[2] + bb.max[2]) / 2,
  ];
}

/**
 * Axis-aligned bounding-box distance: a coarse lower bound when the meshes are
 * separated, zero when their boxes overlap. Manifold has no exact shape-to-shape
 * distance; exact witness-point distance comes from OCCT replay.
 */
function aabbDistance(a: ManifoldBox, b: ManifoldBox): DistanceResult {
  const axis = (lo1: number, hi1: number, lo2: number, hi2: number): [number, number] => {
    if (hi1 < lo2) return [hi1, lo2];
    if (hi2 < lo1) return [lo1, hi2];
    const overlap = (Math.max(lo1, lo2) + Math.min(hi1, hi2)) / 2;
    return [overlap, overlap];
  };
  const [p1x, p2x] = axis(a.min[0], a.max[0], b.min[0], b.max[0]);
  const [p1y, p2y] = axis(a.min[1], a.max[1], b.min[1], b.max[1]);
  const [p1z, p2z] = axis(a.min[2], a.max[2], b.min[2], b.max[2]);
  const dx = p2x - p1x;
  const dy = p2y - p1y;
  const dz = p2z - p1z;
  return {
    value: Math.sqrt(dx * dx + dy * dy + dz * dz),
    point1: [p1x, p1y, p1z],
    point2: [p2x, p2y, p2z],
  };
}

export function distance(shape1: KernelShape, shape2: KernelShape): DistanceResult {
  return aabbDistance(boxOf(shape1), boxOf(shape2));
}

export function measureBulk(shape: KernelShape, _includeLinear = false): BulkMeasurement {
  return {
    volume: volume(shape),
    area: area(shape),
    length: 0,
    centerOfMass: centerOfMass(shape),
    boundingBox: boundingBox(shape),
  };
}

function asManifoldShape(shape: KernelShape): ManifoldShape | undefined {
  if (shape && typeof shape === 'object' && 'manifold' in shape && 'node' in shape) {
    return shape as ManifoldShape;
  }
  return undefined;
}

function resolveOcct(): KernelAdapter | undefined {
  try {
    return getKernel('occt');
  } catch {
    return undefined;
  }
}

function surfaceCurvature(
  face: KernelShape,
  u: number,
  v: number,
): ReturnType<KernelMeasureOps['surfaceCurvature']> {
  const occt = resolveOcct();
  if (!occt) {
    throw new Error(
      'manifold: surfaceCurvature requires a registered occt kernel; none is available',
    );
  }
  const ms = asManifoldShape(face);
  if (!ms) {
    return occt.surfaceCurvature(face, u, v);
  }
  if (!ms.node.replayable) {
    throw new Error(
      'manifold: surfaceCurvature unsupported; shape originates from a non-replayable op (raw mesh import or mesh boolean)',
    );
  }
  const node = ms.node as OpNode & { _brep?: KernelShape };
  const brep = node._brep ?? (node._brep = replay(node, occt));
  return occt.surfaceCurvature(brep, u, v);
}

export function makeMeasureOps(_module: ManifoldModule): KernelMeasureOps {
  return {
    volume: (shape) => volume(shape),
    area: (shape) => area(shape),
    length: () => notImplemented('length'),
    centerOfMass: (shape) => centerOfMass(shape),
    linearCenterOfMass: (shape) => centerOfMass(shape),
    boundingBox: (shape) => boundingBox(shape),
    distance: (a, b) => distance(a, b),
    surfaceCurvature: (face, u, v) => surfaceCurvature(face, u, v),
    surfaceCenterOfMass: (shape) => centerOfMass(shape),
    measureBulk: (shape, includeLinear) => measureBulk(shape, includeLinear),
    createDistanceQuery: (referenceShape) => ({
      distanceTo: (shape) => distance(referenceShape, shape),
      dispose: () => {},
    }),
  };
}
