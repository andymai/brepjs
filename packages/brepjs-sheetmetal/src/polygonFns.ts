/**
 * 2D simple-polygon geometry for true-shape (no-fit-polygon) nesting: an ordered
 * vertex loop plus the overlap predicate that is the correctness backbone of the
 * packer. A false negative here would let two parts physically collide on the laser
 * bed, so the predicate is exhaustive: two simple polygons overlap iff any of their
 * edges cross OR one polygon contains a vertex of the other (the latter catches full
 * containment, where no edges cross).
 *
 * Sheet-metal flat outlines are straight-edged polylines; an arc edge (rare in a
 * developed pattern) is approximated by its two endpoints — the same pre-existing
 * assumption the DXF/SVG writers and the bbox nester make.
 */

import { type Result, ok, err, validationError, getEdges, curveStartPoint } from 'brepjs';
import type { Wire } from 'brepjs';

export type Pt2 = [number, number];

/** A simple (non-self-intersecting) polygon as an ordered, non-closing vertex loop. */
export type Polygon = Pt2[];

const EPS = 1e-9;

/**
 * Ordered vertex loop of a closed outline wire — one vertex per edge start point, the
 * same 2D read the DXF writer (`outlinePoints`) and the bbox nester (`patternBbox`)
 * use. The loop is NOT closed (the last vertex is not repeated); edges are taken as
 * `v[i] → v[(i+1) % n]`.
 */
export function wireToPolygon(outline: Wire): Result<Polygon> {
  const edges = getEdges(outline);
  if (edges.length === 0) {
    return err(validationError('EMPTY_OUTLINE', 'outline wire has no edges to read'));
  }
  const poly: Polygon = [];
  for (const edge of edges) {
    const p = curveStartPoint(edge);
    poly.push([p[0], p[1]]);
  }
  if (poly.length < 3) {
    return err(validationError('EMPTY_OUTLINE', 'outline polygon has fewer than 3 vertices'));
  }
  return ok(poly);
}

/** Signed area (CCW positive) — used to normalise orientation and reject degenerates. */
export function signedArea(poly: Polygon): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const pi = poly[i];
    const pj = poly[j];
    if (pi === undefined || pj === undefined) continue;
    a += pj[0] * pi[1] - pi[0] * pj[1];
  }
  return a / 2;
}

/** Axis-aligned bounds `[minX, minY, maxX, maxY]` of a polygon. */
export function polygonBounds(poly: Polygon): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  return [minX, minY, maxX, maxY];
}

/** Rotate every vertex (CCW, degrees, about the origin), then translate by (dx, dy). */
export function transformPolygon(poly: Polygon, dx: number, dy: number, rotationDeg: number): Polygon {
  const rad = (rotationDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return poly.map(([x, y]) => {
    const rx = x * c - y * s;
    const ry = x * s + y * c;
    return [rx + dx, ry + dy] as Pt2;
  });
}

/** Ray-cast point-in-polygon: points strictly inside return true; behaviour for a
 * point exactly on the boundary is undefined (the overlap predicate handles edge
 * contact separately via segment-intersection). */
export function pointInPolygon(poly: Polygon, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const pi = poly[i];
    const pj = poly[j];
    if (pi === undefined || pj === undefined) continue;
    const intersect =
      pi[1] > y !== pj[1] > y && x < ((pj[0] - pi[0]) * (y - pi[1])) / (pj[1] - pi[1]) + pi[0];
    if (intersect) inside = !inside;
  }
  return inside;
}

function orient(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

function onSegment(ax: number, ay: number, bx: number, by: number, px: number, py: number): boolean {
  return (
    Math.min(ax, bx) - EPS <= px &&
    px <= Math.max(ax, bx) + EPS &&
    Math.min(ay, by) - EPS <= py &&
    py <= Math.max(ay, by) + EPS
  );
}

/**
 * Proper-or-improper segment intersection (`p1p2` vs `p3p4`). Returns true when the
 * segments cross OR touch (collinear overlap or a shared endpoint), so it is
 * conservative for the overlap test — never a false negative.
 */
export function segmentsIntersect(p1: Pt2, p2: Pt2, p3: Pt2, p4: Pt2): boolean {
  const d1 = orient(p3[0], p3[1], p4[0], p4[1], p1[0], p1[1]);
  const d2 = orient(p3[0], p3[1], p4[0], p4[1], p2[0], p2[1]);
  const d3 = orient(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]);
  const d4 = orient(p1[0], p1[1], p2[0], p2[1], p4[0], p4[1]);

  if (((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))) {
    return true;
  }

  if (Math.abs(d1) <= EPS && onSegment(p3[0], p3[1], p4[0], p4[1], p1[0], p1[1])) return true;
  if (Math.abs(d2) <= EPS && onSegment(p3[0], p3[1], p4[0], p4[1], p2[0], p2[1])) return true;
  if (Math.abs(d3) <= EPS && onSegment(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1])) return true;
  if (Math.abs(d4) <= EPS && onSegment(p1[0], p1[1], p2[0], p2[1], p4[0], p4[1])) return true;
  return false;
}

/**
 * Do two simple polygons overlap? True iff any edge of `a` intersects any edge of
 * `b`, or one polygon fully contains a vertex of the other. This pair of conditions
 * is exhaustive for simple polygons: a disjoint pair has no crossing edges and no
 * mutually-contained vertex; a touching-but-non-overlapping pair (shared edge/vertex,
 * zero interior overlap) is caught by `segmentsIntersect` and so is reported as
 * overlapping — callers wanting a clearance gap should inflate via {@link polygonsOverlapWithClearance}.
 *
 * Centroid containment is NOT sufficient on its own (a concave part's centroid can
 * lie outside it), so a representative INTERIOR vertex of each polygon is tested for
 * containment in the other — combined with the edge-crossing test this covers the
 * nested-without-crossing case.
 */
export function polygonsOverlap(a: Polygon, b: Polygon): boolean {
  for (let i = 0; i < a.length; i += 1) {
    const a1 = a[i];
    const a2 = a[(i + 1) % a.length];
    if (a1 === undefined || a2 === undefined) continue;
    for (let j = 0; j < b.length; j += 1) {
      const b1 = b[j];
      const b2 = b[(j + 1) % b.length];
      if (b1 === undefined || b2 === undefined) continue;
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  // No edges cross: the only remaining overlap is full containment. If any vertex of
  // one lies strictly inside the other, the polygons overlap. (With no crossings,
  // containment of a single vertex implies containment of the whole polygon.)
  for (const v of a) {
    if (pointInPolygon(b, v[0], v[1])) return true;
  }
  for (const v of b) {
    if (pointInPolygon(a, v[0], v[1])) return true;
  }
  return false;
}

/**
 * Overlap test honoring a clearance gap: the two polygons must stay at least
 * `clearance` apart. Implemented by testing raw overlap and, when disjoint, the
 * minimum edge-to-edge distance against the clearance. `clearance <= 0` is the plain
 * {@link polygonsOverlap}.
 */
export function polygonsOverlapWithClearance(a: Polygon, b: Polygon, clearance: number): boolean {
  if (polygonsOverlap(a, b)) return true;
  if (clearance <= EPS) return false;
  return minEdgeDistance(a, b) < clearance - EPS;
}

/** Minimum distance between any edge of `a` and any edge of `b` (both assumed disjoint). */
function minEdgeDistance(a: Polygon, b: Polygon): number {
  let min = Infinity;
  for (let i = 0; i < a.length; i += 1) {
    const a1 = a[i];
    const a2 = a[(i + 1) % a.length];
    if (a1 === undefined || a2 === undefined) continue;
    for (let j = 0; j < b.length; j += 1) {
      const b1 = b[j];
      const b2 = b[(j + 1) % b.length];
      if (b1 === undefined || b2 === undefined) continue;
      const d = segmentSegmentDistance(a1, a2, b1, b2);
      if (d < min) min = d;
    }
  }
  return min;
}

function segmentSegmentDistance(p1: Pt2, p2: Pt2, p3: Pt2, p4: Pt2): number {
  if (segmentsIntersect(p1, p2, p3, p4)) return 0;
  return Math.min(
    pointSegmentDistance(p1, p3, p4),
    pointSegmentDistance(p2, p3, p4),
    pointSegmentDistance(p3, p1, p2),
    pointSegmentDistance(p4, p1, p2)
  );
}

function pointSegmentDistance(p: Pt2, a: Pt2, b: Pt2): number {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const wx = p[0] - a[0];
  const wy = p[1] - a[1];
  const len2 = vx * vx + vy * vy;
  let t = len2 <= EPS ? 0 : (wx * vx + wy * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  const dx = p[0] - (a[0] + t * vx);
  const dy = p[1] - (a[1] + t * vy);
  return Math.hypot(dx, dy);
}
