/**
 * Roof generation from a wire using straight skeleton extrusion.
 * Produces a solid roof shape where each edge slopes inward at a given angle.
 */

import { getKernel } from '../kernel/index.js';
import type { KernelShape } from '../kernel/types.js';
import type { Wire, Solid } from '../core/shapeTypes.js';
import { createSolid } from '../core/shapeTypes.js';
import { type Result, ok, err } from '../core/result.js';
import { kernelError, BrepErrorCode } from '../core/errors.js';
import { getEdges } from '../topology/shapeFns.js';
import { curveStartPoint } from '../topology/curveFns.js';
import { computeStraightSkeleton } from './straightSkeleton.js';
import type { SkPoint2D } from './straightSkeleton.js';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface RoofOptions {
  /** Roof slope angle in degrees (default: 45). */
  readonly angle?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractPolygon(w: Wire): SkPoint2D[] {
  const edges = getEdges(w);
  const pts = edges.map((e) => {
    const pt = curveStartPoint(e);
    return { x: pt[0], y: pt[1] };
  });
  // Strip duplicate closing vertex if present
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (
    pts.length > 1 &&
    first &&
    last &&
    Math.abs(first.x - last.x) < 1e-10 &&
    Math.abs(first.y - last.y) < 1e-10
  ) {
    pts.pop();
  }
  return pts;
}

/** Fan-triangulate a polygon into triangles (index triples). */
function fanTriangulate(count: number): Array<[number, number, number]> {
  const tris: Array<[number, number, number]> = [];
  for (let i = 1; i < count - 1; i++) {
    tris.push([0, i, i + 1]);
  }
  return tris;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Create a roof solid from a planar wire using the straight skeleton algorithm.
 * Each polygon edge produces a sloped face rising toward the skeleton ridge.
 *
 * @param w - A planar wire defining the roof footprint
 * @param options - Optional angle (degrees) for the roof slope
 * @returns A Result containing the roof Solid, or an error
 */
export function roof(w: Wire, options?: RoofOptions): Result<Solid> {
  const angle = (options?.angle ?? 45) * (Math.PI / 180);
  const tanAngle = Math.tan(angle);

  try {
    const polygon = extractPolygon(w);
    if (polygon.length < 3) {
      return err(
        kernelError(BrepErrorCode.ROOF_FAILED, 'Wire must have at least 3 edges for roof generation')
      );
    }

    const skeleton = computeStraightSkeleton(polygon);
    if (skeleton.faces.length === 0) {
      return err(
        kernelError(BrepErrorCode.ROOF_FAILED, 'Straight skeleton computation produced no faces')
      );
    }

    const kernel = getKernel();
    const triFaces: KernelShape[] = [];

    // For each skeleton face, build triangles
    for (const skFace of skeleton.faces) {
      const verts3d: Array<[number, number, number]> = skFace.vertices.map(
        (v: SkPoint2D, i: number): [number, number, number] => [
          v.x,
          v.y,
          (skFace.heights[i] ?? 0) * tanAngle,
        ]
      );

      const tris = fanTriangulate(verts3d.length);

      for (const [ai, bi, ci] of tris) {
        const va = verts3d[ai];
        const vb = verts3d[bi];
        const vc = verts3d[ci];
        if (!va || !vb || !vc) continue;

        // Skip degenerate triangles
        const abx = vb[0] - va[0];
        const aby = vb[1] - va[1];
        const abz = vb[2] - va[2];
        const acx = vc[0] - va[0];
        const acy = vc[1] - va[1];
        const acz = vc[2] - va[2];
        const nx = aby * acz - abz * acy;
        const ny = abz * acx - abx * acz;
        const nz = abx * acy - aby * acx;
        const areaSq = nx * nx + ny * ny + nz * nz;
        if (areaSq < 1e-20) continue;

        const triFace = kernel.buildTriFace(va, vb, vc);
        if (triFace !== null) {
          triFaces.push(triFace);
        }
      }
    }

    // Also add the bottom face (the original polygon at z=0)
    const p0 = polygon[0];
    if (p0) {
      for (let i = 1; i < polygon.length - 1; i++) {
        const pi = polygon[i];
        const pi1 = polygon[i + 1];
        if (!pi || !pi1) continue;
        const va: [number, number, number] = [p0.x, p0.y, 0];
        const vb: [number, number, number] = [pi.x, pi.y, 0];
        const vc: [number, number, number] = [pi1.x, pi1.y, 0];
        const triFace = kernel.buildTriFace(va, vc, vb); // reversed winding for bottom
        if (triFace !== null) {
          triFaces.push(triFace);
        }
      }
    }

    if (triFaces.length === 0) {
      return err(
        kernelError(BrepErrorCode.ROOF_FAILED, 'No valid triangular faces could be built')
      );
    }

    try {
      const solid = kernel.sewAndSolidify(triFaces, 1e-6);
      const fixed = kernel.fixShape(solid);
      return ok(createSolid(fixed));
    } catch {
      try {
        return ok(createSolid(kernel.sew(triFaces, 1e-6)));
      } catch {
        return err(kernelError(BrepErrorCode.ROOF_FAILED, 'Failed to sew roof faces'));
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(kernelError(BrepErrorCode.ROOF_FAILED, `Roof generation failed: ${msg}`, e));
  }
}
