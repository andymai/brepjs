/**
 * Pure TypeScript straight skeleton algorithm for simple polygons.
 * No kernel dependency — operates on 2D point arrays.
 */

import type { Result } from '@/core/result.js';
import { ok, err } from '@/core/result.js';
import { computationError, BrepErrorCode } from '@/core/errors.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkPoint2D {
  readonly x: number;
  readonly y: number;
}

export interface SkeletonNode {
  readonly x: number;
  readonly y: number;
  readonly height: number;
}

export interface SkeletonFace {
  readonly vertices: SkPoint2D[];
  readonly heights: number[];
}

export interface StraightSkeleton {
  readonly nodes: SkeletonNode[];
  readonly faces: SkeletonFace[];
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

const EPS = 1e-10;

function cross2(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

function dot2(ax: number, ay: number, bx: number, by: number): number {
  return ax * bx + ay * by;
}

function len2(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

/** Safe polygon access with modular index. */
function polyAt(poly: SkPoint2D[], i: number): SkPoint2D {
  const p = poly[((i % poly.length) + poly.length) % poly.length];
  if (!p) throw new Error(`Invalid polygon index ${i} for length ${poly.length}`);
  return p;
}

/** Ensure polygon is in CCW order. Returns a new array if reversed. */
function ensureCCW(poly: SkPoint2D[]): SkPoint2D[] {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const cur = polyAt(poly, i);
    const nxt = polyAt(poly, i + 1);
    area += cur.x * nxt.y - nxt.x * cur.y;
  }
  if (area < 0) return [...poly].reverse();
  return poly;
}

/** Compute unit bisector direction pointing inward for vertex at index i. */
function bisector(poly: SkPoint2D[], i: number): { dx: number; dy: number } {
  const prev = polyAt(poly, i - 1);
  const cur = polyAt(poly, i);
  const next = polyAt(poly, i + 1);

  const e1x = cur.x - prev.x;
  const e1y = cur.y - prev.y;
  const e1l = len2(e1x, e1y);
  const e2x = next.x - cur.x;
  const e2y = next.y - cur.y;
  const e2l = len2(e2x, e2y);

  if (e1l < EPS || e2l < EPS) return { dx: 0, dy: 0 };

  const n1x = -e1y / e1l;
  const n1y = e1x / e1l;
  const n2x = -e2y / e2l;
  const n2y = e2x / e2l;

  let bx = n1x + n2x;
  let by = n1y + n2y;
  const bl = len2(bx, by);

  if (bl < EPS) {
    return { dx: n1x, dy: n1y };
  }

  bx /= bl;
  by /= bl;

  const cosHalf = dot2(bx, by, n1x, n1y);
  const speed = Math.abs(cosHalf) > EPS ? 1.0 / cosHalf : 1.0;

  return { dx: bx * speed, dy: by * speed };
}

// ---------------------------------------------------------------------------
// LAV (List of Active Vertices)
// ---------------------------------------------------------------------------

interface LavNode {
  x: number;
  y: number;
  bx: number;
  by: number;
  origIdx: number;
  prev: LavNode | null;
  next: LavNode | null;
  active: boolean;
}

/** Is a LAV node reflex based on current LAV positions? */
function isLavNodeReflex(node: LavNode): boolean {
  if (!node.prev || !node.next) return false;
  return (
    cross2(node.x - node.prev.x, node.y - node.prev.y, node.next.x - node.x, node.next.y - node.y) <
    -EPS
  );
}

function createLav(poly: SkPoint2D[]): LavNode[] {
  const nodes: LavNode[] = poly.map((p, i) => {
    const b = bisector(poly, i);
    return {
      x: p.x,
      y: p.y,
      bx: b.dx,
      by: b.dy,
      origIdx: i,
      prev: null,
      next: null,
      active: true,
    };
  });

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const prevNode = nodes[(i - 1 + nodes.length) % nodes.length];
    const nextNode = nodes[(i + 1) % nodes.length];
    if (node && prevNode && nextNode) {
      node.prev = prevNode;
      node.next = nextNode;
    }
  }

  return nodes;
}

/** Deactivate a chain of nodes starting from `start`. */
function deactivateNodes(start: LavNode | null, count: number): void {
  let cur = start;
  for (let i = 0; i < count; i++) {
    if (!cur) break;
    cur.active = false;
    cur = cur.next;
  }
}

/** Count active nodes reachable from a starting node. */
function lavSize(start: LavNode): number {
  let count = 1;
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- circular linked list: prev/next non-null after construction
  let cur = start.next!;
  while (cur !== start) {
    count++;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- circular linked list traversal
    cur = cur.next!;
    if (count > 10000) break;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Event computation
// ---------------------------------------------------------------------------

interface SkEvent {
  time: number;
  x: number;
  y: number;
  nodeA: LavNode;
  nodeB: LavNode;
  type: 'edge' | 'split';
}

/** Time at which two moving bisectors from nodeA and nodeB intersect. */
function bisectorIntersectTime(a: LavNode, b: LavNode): number | null {
  const ddx = a.bx - b.bx;
  const ddy = a.by - b.by;
  const dxp = b.x - a.x;
  const dyp = b.y - a.y;

  if (Math.abs(ddx) < EPS && Math.abs(ddy) < EPS) return null;

  let t: number;
  if (Math.abs(ddx) > Math.abs(ddy)) {
    t = dxp / ddx;
  } else {
    t = dyp / ddy;
  }

  if (t < EPS) return null;

  // Verify the other equation
  const otherDd = Math.abs(ddx) > Math.abs(ddy) ? ddy : ddx;
  const otherDp = Math.abs(ddx) > Math.abs(ddy) ? dyp : dxp;
  if (Math.abs(otherDd) > EPS) {
    const t2 = otherDp / otherDd;
    if (Math.abs(t - t2) > 1e-4 * Math.max(1, Math.abs(t))) return null;
  }

  return t;
}

/** Compute ray-segment intersection time for split events. */
function raySplitTime(node: LavNode, eA: LavNode, eB: LavNode): number | null {
  const edx = eB.x - eA.x;
  const edy = eB.y - eA.y;
  const el = len2(edx, edy);
  if (el < EPS) return null;

  const enx = -edy / el;
  const eny = edx / el;

  const d0 = (node.x - eA.x) * enx + (node.y - eA.y) * eny;
  const relBx = node.bx - (eA.bx + eB.bx) / 2;
  const relBy = node.by - (eA.by + eB.by) / 2;
  const dRate = relBx * enx + relBy * eny;

  if (Math.abs(dRate) < EPS) return null;

  const t = -d0 / dRate;
  if (t < EPS) return null;

  const px = node.x + t * node.bx;
  const py = node.y + t * node.by;
  const ax = eA.x + t * eA.bx;
  const ay = eA.y + t * eA.by;
  const bxx = eB.x + t * eB.bx;
  const byy = eB.y + t * eB.by;

  const segDx = bxx - ax;
  const segDy = byy - ay;
  const segL = len2(segDx, segDy);
  if (segL < EPS) return t;

  const s = dot2(px - ax, py - ay, segDx, segDy) / (segL * segL);
  if (s < -0.01 || s > 1.01) return null;

  return t;
}

function computeEvents(lavNodes: LavNode[]): SkEvent[] {
  const events: SkEvent[] = [];

  for (const node of lavNodes) {
    if (!node.active || !node.next) continue;

    const t = bisectorIntersectTime(node, node.next);
    if (t !== null && t > EPS) {
      const x = node.x + t * node.bx;
      const y = node.y + t * node.by;
      events.push({ time: t, x, y, nodeA: node, nodeB: node.next, type: 'edge' });
    }

    if (isLavNodeReflex(node)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- circular linked list traversal
      let cur = node.next.next!;
      let count = 0;
      while (cur !== node.prev && cur !== node && count < 1000) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- circular linked list traversal
        const st = raySplitTime(node, cur, cur.next!);
        if (st !== null && st > EPS) {
          const x = node.x + st * node.bx;
          const y = node.y + st * node.by;
          events.push({ time: st, x, y, nodeA: node, nodeB: cur, type: 'split' });
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- circular linked list traversal
        cur = cur.next!;
        count++;
      }
    }
  }

  events.sort((a, b) => a.time - b.time);
  return events;
}

// ---------------------------------------------------------------------------
// Main algorithm
// ---------------------------------------------------------------------------

/**
 * Compute the straight skeleton of a simple polygon.
 * The polygon vertices must define a simple (non-self-intersecting) polygon.
 * They will be reordered to CCW if necessary.
 */
export function computeStraightSkeleton(polygon: SkPoint2D[]): Result<StraightSkeleton> {
  if (polygon.length < 3) {
    return ok({ nodes: [], faces: [] });
  }

  try {
    return ok(computeStraightSkeletonImpl(polygon));
  } catch (e: unknown) {
    return err(
      computationError(
        BrepErrorCode.STRAIGHT_SKELETON_FAILED,
        e instanceof Error ? e.message : String(e),
        e
      )
    );
  }
}

/** Internal implementation — may throw on degenerate polygon indices. */
function computeStraightSkeletonImpl(polygon: SkPoint2D[]): StraightSkeleton {
  const poly = ensureCCW(polygon);
  const n = poly.length;

  const skeletonNodes: SkeletonNode[] = [];
  const vertexToSkelNodes: number[][] = Array.from({ length: n }, () => []);

  const lavNodes = createLav(poly);
  let iterations = 0;
  const maxIter = n * n * 2;

  while (iterations < maxIter) {
    iterations++;

    const activeStart = lavNodes.find((nd) => nd.active);
    if (!activeStart) break;

    const sz = lavSize(activeStart);
    if (sz <= 3) {
      if (sz === 3) {
        const a = activeStart;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- circular linked list: 3-node LAV guaranteed non-null
        const b = a.next!;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- circular linked list: 3-node LAV guaranteed non-null
        const c = b.next!;

        const t = bisectorIntersectTime(a, b);
        const time = t !== null && t > EPS ? t : 0;
        const mx = (a.x + b.x + c.x) / 3 + (time * (a.bx + b.bx + c.bx)) / 3;
        const my = (a.y + b.y + c.y) / 3 + (time * (a.by + b.by + c.by)) / 3;

        const nodeIdx = skeletonNodes.length;
        skeletonNodes.push({ x: mx, y: my, height: time });

        const aNodes = vertexToSkelNodes[a.origIdx];
        const bNodes = vertexToSkelNodes[b.origIdx];
        const cNodes = vertexToSkelNodes[c.origIdx];
        if (aNodes) aNodes.push(nodeIdx);
        if (bNodes) bNodes.push(nodeIdx);
        if (cNodes) cNodes.push(nodeIdx);

        a.active = false;
        b.active = false;
        c.active = false;
      } else {
        deactivateNodes(activeStart, sz);
      }
      continue;
    }

    const activeNodes = lavNodes.filter((nd) => nd.active);
    const events = computeEvents(activeNodes);

    if (events.length === 0) {
      for (const nd of activeNodes) {
        nd.active = false;
      }
      break;
    }

    const ev = events[0];
    if (!ev) break;

    if (ev.type === 'edge') {
      const a = ev.nodeA;
      const b = ev.nodeB;

      if (!a.active || !b.active) continue;

      const nodeIdx = skeletonNodes.length;
      skeletonNodes.push({ x: ev.x, y: ev.y, height: ev.time });

      const aNodes = vertexToSkelNodes[a.origIdx];
      const bNodes = vertexToSkelNodes[b.origIdx];
      if (aNodes) aNodes.push(nodeIdx);
      if (bNodes) bNodes.push(nodeIdx);

      a.x = ev.x;
      a.y = ev.y;

      a.next = b.next;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- circular linked list: b.next non-null in active LAV
      b.next!.prev = a;
      b.active = false;

      const lavPoly: SkPoint2D[] = [];
      let cur = a;
      do {
        lavPoly.push({ x: cur.x, y: cur.y });
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- circular linked list traversal
        cur = cur.next!;
      } while (cur !== a);

      const bDir = bisector(lavPoly, 0);
      a.bx = bDir.dx;
      a.by = bDir.dy;
    } else {
      // Split event: reflex vertex `a` reaches opposite edge (nodeB, nodeB.next)
      // Must split the LAV into two independent sub-LAVs
      const a = ev.nodeA;
      const b = ev.nodeB; // start of the opposite edge
      if (!a.active || !b.active) continue;

      const nodeIdx = skeletonNodes.length;
      skeletonNodes.push({ x: ev.x, y: ev.y, height: ev.time });
      const aNodes = vertexToSkelNodes[a.origIdx];
      if (aNodes) aNodes.push(nodeIdx);
      const bNodes = vertexToSkelNodes[b.origIdx];
      if (bNodes) bNodes.push(nodeIdx);

      // Create a copy of `a` at the split point for the second sub-LAV
      const aCopy: LavNode = {
        x: ev.x,
        y: ev.y,
        bx: 0,
        by: 0,
        origIdx: a.origIdx,
        prev: null,
        next: null,
        active: true,
      };
      lavNodes.push(aCopy);

      // Move `a` to the split point
      a.x = ev.x;
      a.y = ev.y;

      // Rewire: LAV 1 runs a -> b.next -> ... -> a.prev -> a
      // Rewire: LAV 2 runs aCopy -> a.next -> ... -> b -> aCopy
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- circular linked list: active nodes have non-null prev/next
      const aNext = a.next!;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- circular linked list: active nodes have non-null prev/next
      const bNext = b.next!;

      // LAV 1: a connects to b.next on the forward side
      a.next = bNext;
      bNext.prev = a;

      // LAV 2: aCopy connects to a's old next on the forward side, b on the back
      aCopy.next = aNext;
      aNext.prev = aCopy;
      aCopy.prev = b;
      b.next = aCopy;

      // Recompute bisectors for both split-point nodes
      const buildLavPoly = (start: LavNode): SkPoint2D[] => {
        const poly: SkPoint2D[] = [];
        let c = start;
        do {
          poly.push({ x: c.x, y: c.y });
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- circular linked list traversal
          c = c.next!;
        } while (c !== start);
        return poly;
      };

      const lav1Poly = buildLavPoly(a);
      const bDir1 = bisector(lav1Poly, 0);
      a.bx = bDir1.dx;
      a.by = bDir1.dy;

      const lav2Poly = buildLavPoly(aCopy);
      const bDir2 = bisector(lav2Poly, 0);
      aCopy.bx = bDir2.dx;
      aCopy.by = bDir2.dy;
    }
  }

  // Build faces: one face per original edge
  const faces: SkeletonFace[] = [];

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const pi = polyAt(poly, i);
    const pj = polyAt(poly, j);
    const faceVerts: SkPoint2D[] = [pi, pj];
    const faceHeights: number[] = [0, 0];

    const jNodes = vertexToSkelNodes[j];
    const iNodes = vertexToSkelNodes[i];

    if (jNodes) {
      for (const ni of jNodes) {
        const sn = skeletonNodes[ni];
        if (sn) {
          faceVerts.push({ x: sn.x, y: sn.y });
          faceHeights.push(sn.height);
        }
      }
    }

    if (iNodes) {
      for (let k = iNodes.length - 1; k >= 0; k--) {
        const idx = iNodes[k];
        if (idx === undefined) continue;
        const sn = skeletonNodes[idx];
        if (!sn) continue;
        const lastVert = faceVerts[faceVerts.length - 1];
        if (!lastVert) continue;
        const dist = len2(sn.x - lastVert.x, sn.y - lastVert.y);
        if (dist > EPS) {
          faceVerts.push({ x: sn.x, y: sn.y });
          faceHeights.push(sn.height);
        }
      }
    }

    if (faceVerts.length >= 3) {
      faces.push({ vertices: faceVerts, heights: faceHeights });
    }
  }

  // Deduplicate skeleton nodes
  const uniqueNodes: SkeletonNode[] = [];
  for (const sn of skeletonNodes) {
    const exists = uniqueNodes.some(
      (un) => Math.abs(un.x - sn.x) < 0.01 && Math.abs(un.y - sn.y) < 0.01
    );
    if (!exists) {
      uniqueNodes.push(sn);
    }
  }

  return { nodes: uniqueNodes, faces };
}
