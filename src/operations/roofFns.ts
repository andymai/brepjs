/**
 * Roof generation from a wire using straight skeleton extrusion.
 * Produces a solid roof shape where each edge slopes inward at a given angle.
 *
 * ADR-0006: ear-clip triangulation and 2D geometry helpers stay in TypeScript —
 * these are orchestration for assembling kernel faces, not core geometric
 * evaluation. The kernel builds the actual B-Rep faces and solid.
 */

import { getKernel } from '@/kernel/index.js';
import type { KernelShape } from '@/kernel/types.js';
import type { ClosedWire, Dimension, Wire } from '@/core/shapeTypes.js';
import { createSolid } from '@/core/shapeTypes.js';
import type { PlanarWire, ValidSolid } from '@/core/validityTypes.js';
import { isValidSolid } from '@/core/validityTypes.js';
import { type Result, ok, err } from '@/core/result.js';
import { kernelError, BrepErrorCode } from '@/core/errors.js';
import { getEdges } from '@/topology/shapeFns.js';
import { curveStartPoint } from '@/topology/curveFns.js';
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

function extractPolygon(w: Wire<Dimension>): SkPoint2D[] {
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

/** Fan-triangulate a convex polygon into triangles (index triples). */
function fanTriangulate(count: number): Array<[number, number, number]> {
  const tris: Array<[number, number, number]> = [];
  for (let i = 1; i < count - 1; i++) {
    tris.push([0, i, i + 1]);
  }
  return tris;
}

/** Signed area cross product for three 2D points (positive = CCW). */
function cross2d(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

/** Check if point (px,py) is strictly inside triangle (a,b,c). */
function pointInTriangle(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number
): boolean {
  const d1 = cross2d(ax, ay, bx, by, px, py);
  const d2 = cross2d(bx, by, cx, cy, px, py);
  const d3 = cross2d(cx, cy, ax, ay, px, py);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

/**
 * Ear-clip triangulate a simple polygon into index triples.
 * Handles convex and concave polygons correctly, and normalises CW-wound
 * polygons to CCW traversal so the algorithm always finds ears regardless
 * of the input wire's orientation. Output triangles are always CCW-wound.
 * Returns an empty array for degenerate polygons where no ear is found.
 */
function earClipTriangulate(poly: SkPoint2D[]): Array<[number, number, number]> {
  const n = poly.length;
  if (n < 3) return [];
  if (n === 3) return [[0, 1, 2]];

  // Shoelace signed area: positive → CCW, negative → CW.
  // If CW, reverse the traversal index order to normalise to CCW so the
  // cross-product ear test works correctly without modifying poly itself.
  let area2 = 0;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    if (a && b) area2 += a.x * b.y - b.x * a.y;
  }
  const tris: Array<[number, number, number]> = [];
  const idx: number[] = Array.from({ length: n }, (_, i) => i);
  if (area2 < 0) idx.reverse();

  const isEar = (prev: number, curr: number, next: number): boolean => {
    const a = poly[prev];
    const b = poly[curr];
    const c = poly[next];
    if (!a || !b || !c) return false;
    if (cross2d(a.x, a.y, b.x, b.y, c.x, c.y) <= 0) return false;
    for (const vi of idx) {
      if (vi === prev || vi === curr || vi === next) continue;
      const p = poly[vi];
      if (!p) continue;
      if (pointInTriangle(p.x, p.y, a.x, a.y, b.x, b.y, c.x, c.y)) return false;
    }
    return true;
  };

  while (idx.length > 3) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const prev = idx[(i - 1 + idx.length) % idx.length];
      const curr = idx[i];
      const next = idx[(i + 1) % idx.length];
      if (prev === undefined || curr === undefined || next === undefined) continue;
      if (isEar(prev, curr, next)) {
        tris.push([prev, curr, next]);
        idx.splice(i, 1);
        clipped = true;
        break;
      }
    }
    if (!clipped) break; // degenerate polygon, bail out
  }
  if (idx.length === 3) {
    const [a, b, c] = idx;
    if (a !== undefined && b !== undefined && c !== undefined) tris.push([a, b, c]);
  }
  return tris;
}

/**
 * Convert skeleton faces into 3D triangular kernel faces by lifting vertices
 * to the height dictated by the skeleton, scaled by the roof slope tangent.
 */
function buildSkeletonTriFaces(
  skeleton: { faces: Array<{ vertices: SkPoint2D[]; heights: number[] }> },
  tanAngle: number,
  kernel: ReturnType<typeof getKernel>
): KernelShape[] {
  const triFaces: KernelShape[] = [];
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
  return triFaces;
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
export function roof(
  w: ClosedWire<Dimension> & PlanarWire<Dimension>,
  options?: RoofOptions
): Result<ValidSolid> {
  const angle = (options?.angle ?? 45) * (Math.PI / 180);
  const tanAngle = Math.tan(angle);

  try {
    const polygon = extractPolygon(w);
    if (polygon.length < 3) {
      return err(
        kernelError(
          BrepErrorCode.ROOF_FAILED,
          'Wire must have at least 3 edges for roof generation'
        )
      );
    }

    const skeletonResult = computeStraightSkeleton(polygon);
    if (!skeletonResult.ok) return skeletonResult;
    const skeleton = skeletonResult.value;
    if (skeleton.faces.length === 0) {
      return err(
        kernelError(BrepErrorCode.ROOF_FAILED, 'Straight skeleton computation produced no faces')
      );
    }

    const kernel = getKernel();
    const triFaces: KernelShape[] = buildSkeletonTriFaces(skeleton, tanAngle, kernel);

    // Also add the bottom face (the original polygon at z=0).
    // Use ear-clip triangulation to correctly handle concave footprints.
    for (const [ai, bi, ci] of earClipTriangulate(polygon)) {
      const pa = polygon[ai];
      const pb = polygon[bi];
      const pc = polygon[ci];
      if (!pa || !pb || !pc) continue;
      const va: [number, number, number] = [pa.x, pa.y, 0];
      const vb: [number, number, number] = [pb.x, pb.y, 0];
      const vc: [number, number, number] = [pc.x, pc.y, 0];
      const triFace = kernel.buildTriFace(va, vc, vb); // reversed winding for bottom face
      if (triFace !== null) {
        triFaces.push(triFace);
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
      return ok(createSolid(fixed) as ValidSolid);
    } catch {
      try {
        const sewn = createSolid(kernel.sew(triFaces, 1e-6));
        // sew() doesn't guarantee a valid solid — validate before branding
        if (isValidSolid(sewn)) return ok(sewn);
        return err(kernelError(BrepErrorCode.ROOF_FAILED, 'Sew fallback produced invalid solid'));
      } catch {
        return err(kernelError(BrepErrorCode.ROOF_FAILED, 'Failed to sew roof faces'));
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(kernelError(BrepErrorCode.ROOF_FAILED, `Roof generation failed: ${msg}`, e));
  }
}
