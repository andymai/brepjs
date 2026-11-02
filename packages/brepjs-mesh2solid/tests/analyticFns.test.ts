import type { Vec3 } from 'brepjs';
import { describe, expect, it } from 'vitest';
import { type AnalyticSurface, type Segmentation, buildAnalytic } from '../src/analyticFns.js';

/** A 10 mm cube's six faces, and the distance from a point to its surface. */
const SIZE = 10;
const faces: { surface: AnalyticSurface; bounds: readonly [Vec3, Vec3] }[] = [0, 1, 2].flatMap(
  (axis) =>
    [0, SIZE].map((at) => {
      const n: Vec3 = [0, 0, 0];
      n[axis] = at === 0 ? -1 : 1;
      const lo: Vec3 = [0, 0, 0];
      const hi: Vec3 = [SIZE, SIZE, SIZE];
      lo[axis] = at;
      hi[axis] = at;
      return { surface: { kind: 'plane', n, d: at === 0 ? 0 : SIZE }, bounds: [lo, hi] as const };
    })
);

function nearestFace(p: Vec3): [number, number] {
  const h = SIZE / 2;
  const q = p.map((x) => Math.abs(x - h) - h);
  const outside = Math.hypot(...q.map((x) => Math.max(x, 0)));
  const dist = outside > 0 ? outside : -Math.max(...q);
  let best = 0;
  for (let i = 1; i < faces.length; i++) {
    const s = faces[i]?.surface;
    const b = faces[best]?.surface;
    if (s?.kind !== 'plane' || b?.kind !== 'plane') continue;
    const di = Math.abs(s.n[0] * p[0] + s.n[1] * p[1] + s.n[2] * p[2] - s.d);
    const db = Math.abs(b.n[0] * p[0] + b.n[1] * p[1] + b.n[2] * p[2] - b.d);
    if (di < db) best = i;
  }
  return [best, dist];
}

/** The cube's mesh, plus a second closed body the fitted surfaces don't reach. */
function twoBodies(): Segmentation {
  return {
    surfaces: faces.map((f) => f.surface),
    bounds: faces.map((f) => f.bounds),
    tolerance: 1e-6,
    unfitTriangles: 0,
    unfitArea: 0,
    nearest: (pts) => {
      const out = new Float64Array((pts.length / 3) * 2);
      for (let i = 0; i < pts.length / 3; i++) {
        const [id, d] = nearestFace([pts[3 * i] ?? 0, pts[3 * i + 1] ?? 0, pts[3 * i + 2] ?? 0]);
        out[2 * i] = id;
        out[2 * i + 1] = d;
      }
      return out;
    },
    bodiesOf: (pts) => new Float64Array(pts.length / 3),
    bodyParent: Int32Array.from([-1, -1]),
    bodyClosed: Uint8Array.from([1, 1]),
    deviation: () => {
      throw new Error('a body without pieces must fail before the distance check');
    },
  };
}

describe('buildAnalytic', () => {
  it('falls back when a mesh body gets no pieces', () => {
    const res = buildAnalytic(twoBodies(), {
      coverage: 1e-3,
      maxDeviation: 1e-2,
      triangulation: 0.1,
      maxUnfitArea: 0,
    });
    expect(res).toEqual({ ok: false, reason: 'no arrangement piece covers body 1' });
  });
});
