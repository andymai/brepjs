/**
 * Convex hull operations for the occt-wasm adapter.
 *
 * Runs the shared pure-TS QuickHull over sampled surface vertices, then
 * materialises the resulting facets into an OCCT solid via `buildSolidFromFaces`.
 *
 * @module
 */

import type { KernelShape } from '@/kernel/types.js';
import type { OcctKernelWasm, OcctWasmModule } from './occtWasmTypes.js';
import { quickHull, type Vec3 } from '@/kernel/hullGeometry.js';
import { buildSolidFromFaces } from './constructionOps.js';
import { unwrap } from './helpers.js';

export function hullFromPoints(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  points: Array<{ x: number; y: number; z: number }>,
  tolerance: number
): KernelShape {
  if (points.length < 4) throw new Error('hullFromPoints: need at least 4 points');
  const { points: hullPoints, faces } = quickHull(points, tolerance);
  if (faces.length < 4) throw new Error('hullFromPoints: degenerate hull (fewer than 4 faces)');
  return buildSolidFromFaces(k, Module, [...hullPoints], [...faces], tolerance);
}

/**
 * Sample surface vertices of each shape via tessellation. A coarse deflection
 * keeps the point count low — the convex hull only needs extreme points, and
 * fine meshes on curved surfaces explode the hull cost.
 */
function extractVertices(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shapes: KernelShape[],
  tolerance: number
): Vec3[] {
  const deflection = Math.max(tolerance, 1.0);
  const points: Vec3[] = [];
  for (const shape of shapes) {
    const meshData = k.tessellate(unwrap(shape), deflection, deflection * 0.5);
    try {
      const posCount = meshData.positionCount;
      const posPtr = meshData.getPositionsPtr() >> 2;
      for (let i = 0; i < posCount; i += 3) {
        points.push({
          x: Module.HEAPF32[posPtr + i] ?? 0,
          y: Module.HEAPF32[posPtr + i + 1] ?? 0,
          z: Module.HEAPF32[posPtr + i + 2] ?? 0,
        });
      }
    } finally {
      meshData.delete();
    }
  }
  return points;
}

export function hull(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shapes: KernelShape[],
  tolerance: number
): KernelShape {
  if (shapes.length === 0) throw new Error('hull: no shapes provided');
  const points = extractVertices(k, Module, shapes, tolerance);
  if (points.length < 4) throw new Error('hull: fewer than 4 vertices extracted from input shapes');
  return hullFromPoints(k, Module, points, tolerance);
}
