import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import {
  ellipsoid,
  filledFace,
  subFace,
  sewShells,
  addHoles,
  offsetFace,
  circle,
  box,
  sketchRectangle,
  sketchCircle,
  castShape,
  measureVolume,
  measureArea,
  isSolid,
  isFace,
  isOk,
  unwrap,
  getFaces,
} from '@/index.js';
import {
  box as box3,
  curvePointAt,
  cylinder as cyl,
  edgeOnFace,
  getEdges,
  line,
  measureDistance,
  measureLength,
  nSidedFace,
  normalAt,
  nurbsSurface,
  pointOnSurface,
  uvBounds,
  unwrapErr,
  vertex,
} from '@/index.js';
import type { NurbsSurfaceInput } from '@/index.js';
import type { ClosedWire, Edge, Face } from '@/core/shapeTypes.js';
import { shouldSkipSuite } from './helpers/kernelDivergences.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('ellipsoid', () => {
  it('creates a solid with expected volume', () => {
    const rx = 10;
    const ry = 5;
    const rz = 3;
    const s = ellipsoid(rx, ry, rz);
    expect(isSolid(s)).toBe(true);
    const expectedVolume = (4 / 3) * Math.PI * rx * ry * rz;
    expect(unwrap(measureVolume(s))).toBeCloseTo(expectedVolume, -1);
  });

  it('creates a sphere when all radii are equal', () => {
    const r = 7;
    const s = ellipsoid(r, r, r);
    expect(isSolid(s)).toBe(true);
    const expectedVolume = (4 / 3) * Math.PI * r * r * r;
    expect(unwrap(measureVolume(s))).toBeCloseTo(expectedVolume, -1);
  });
});

describe('filledFace', () => {
  it('creates a face from a closed wire', () => {
    const c = circle(10);
    const w = castShape(c.wrapped) as ClosedWire;
    const result = filledFace(w);
    expect(isOk(result)).toBe(true);
    const face = unwrap(result);
    expect(isFace(face)).toBe(true);
  });
});

describe('subFace', () => {
  it('creates a face bounded by a wire on an existing face surface', () => {
    // Create a large planar face
    const rect = sketchRectangle(20, 20);
    const outerFace = castShape(rect.face().wrapped) as Face;
    // Create a smaller wire on the same plane
    const innerRect = sketchRectangle(5, 5);
    const innerWire = castShape(innerRect.wire.wrapped) as ClosedWire;

    const result = subFace(outerFace, innerWire);
    expect(isFace(result)).toBe(true);
    // Sub-face area should be approximately 5*5 = 25
    expect(unwrap(measureArea(result))).toBeCloseTo(25, 0);
  });
});

describe('sewShells', () => {
  it('sews multiple faces into a shell', () => {
    // Get faces from a box — they share edges and can be sewn back together
    const b = box(10, 10, 10);
    const faces = getFaces(b);
    const result = sewShells(faces);
    expect(isOk(result)).toBe(true);
  });
});

describe('addHoles', () => {
  it('creates a face with holes that has less area than the original', () => {
    const rect = sketchRectangle(20, 20);
    const outerFace = castShape(rect.face().wrapped) as Face;
    const originalArea = unwrap(measureArea(outerFace));

    // Create a circular hole
    const holeCircle = sketchCircle(3);
    const holeWire = castShape(holeCircle.wire.wrapped) as ClosedWire;

    const faceWithHole = addHoles(outerFace, [holeWire]);
    expect(isFace(faceWithHole)).toBe(true);
    expect(unwrap(measureArea(faceWithHole))).toBeLessThan(originalArea);
  });
});

describe('offsetFace', () => {
  it('offsets a face and returns a result', () => {
    const rect = sketchRectangle(10, 10);
    const f = castShape(rect.face().wrapped) as Face;
    const result = offsetFace(f, 2);
    expect(isOk(result)).toBe(true);
  });
});

type P = [number, number, number];
const SQUARE: P[] = [
  [0, 0, 0],
  [10, 0, 0],
  [10, 10, 0],
  [0, 10, 0],
];
const sides = (corners: P[]): Edge[] =>
  corners.map((a, i) => line(a, corners[(i + 1) % corners.length] ?? a));
const gap = (shape: Face | Edge, p: P) => {
  using v = vertex(p);
  return unwrap(measureDistance(shape, v));
};

describe.skipIf(shouldSkipSuite('primitiveFns.nSidedFace'))('nSidedFace', () => {
  it('fills a square boundary through an interior point', () => {
    const edges = sides(SQUARE);
    using f = unwrap(nSidedFace(edges, { points: [[5, 5, 2]] }));
    expect(isFace(f)).toBe(true);
    expect(gap(f, [5, 5, 2])).toBeLessThan(1e-3);
    for (const c of SQUARE) expect(gap(f, c)).toBeLessThan(1e-4);
    for (const e of edges) e[Symbol.dispose]();
  });

  it('leaves a supported edge tangent to its support face', () => {
    // A flat apron beside the square's left side; bulged up in the middle, a
    // bare filling rises off that edge, a supported one leaves it flat.
    using apron = box3(10, 10, 1, { at: [-5, 5, -0.5] });
    const top = getFaces(apron).find((f) => Math.abs(normalAt(f)[2] - 1) < 1e-9);
    if (top === undefined) throw new Error('no top face');
    const shared = getEdges(top).find(
      (e) => Math.abs(curvePointAt(e, 0)[0]) < 1e-9 && Math.abs(curvePointAt(e, 1)[0]) < 1e-9
    );
    if (shared === undefined) throw new Error('no shared edge');
    const rest = [
      line([0, 0, 0], [10, 0, 0]),
      line([10, 0, 0], [10, 10, 0]),
      line([10, 10, 0], [0, 10, 0]),
    ];
    const bulge = { points: [[5, 5, 2]] as P[] };
    using smooth = unwrap(nSidedFace([...rest, { edge: shared, support: top }], bulge));
    using loose = unwrap(nSidedFace([...rest, shared], bulge));
    expect(Math.abs(normalAt(smooth, [0, 5, 0])[2])).toBeGreaterThan(0.9999);
    expect(Math.abs(normalAt(loose, [0, 5, 0])[2])).toBeLessThan(0.99);
    for (const e of rest) e[Symbol.dispose]();
  });

  it('rejects an empty boundary', () => {
    const res = nSidedFace([]);
    expect(isOk(res)).toBe(false);
    expect(unwrapErr(res).code).toBe('FILL_EMPTY_BOUNDARY');
  });
});

describe.skipIf(shouldSkipSuite('primitiveFns.edgeOnFace'))('edgeOnFace', () => {
  const lateral = (c: ReturnType<typeof cyl>): Face => {
    const f = getFaces(c).find((x) => Math.abs(normalAt(x)[2]) < 1e-6);
    if (f === undefined) throw new Error('no lateral face');
    return f;
  };

  it('lays a closed loop onto a cylinder across its seam', () => {
    using c = cyl(5, 10);
    const ring: P[] = Array.from({ length: 48 }, (_, i) => {
      const t = (2 * Math.PI * i) / 48;
      return [5 * Math.cos(t), 5 * Math.sin(t), 5];
    });
    using e = unwrap(edgeOnFace(lateral(c), ring, { tolerance: 1e-4, closed: true }));
    expect(unwrap(measureLength(e))).toBeCloseTo(2 * Math.PI * 5, 2);
    for (const t of [0, 0.3, 0.7, 1]) {
      const p = curvePointAt(e, t);
      expect(Math.hypot(p[0], p[1])).toBeCloseTo(5, 6);
    }
  });

  it('projects points that sit off the surface onto it', () => {
    using c = cyl(5, 10);
    const arc: P[] = Array.from({ length: 12 }, (_, i) => {
      const t = -1 + (2 * i) / 11;
      return [5.02 * Math.cos(t), 5.02 * Math.sin(t), 3 + t];
    });
    using e = unwrap(edgeOnFace(lateral(c), arc));
    for (const t of [0, 0.5, 1]) {
      const p = curvePointAt(e, t);
      expect(Math.hypot(p[0], p[1])).toBeCloseTo(5, 6);
    }
  });

  it('rejects too few points and a tolerance that is not positive', () => {
    using c = cyl(5, 10);
    const f = lateral(c);
    expect(unwrapErr(edgeOnFace(f, [[5, 0, 1]])).code).toBe('EDGE_ON_FACE_MIN_POINTS');
    expect(
      unwrapErr(
        edgeOnFace(
          f,
          [
            [5, 0, 1],
            [0, 5, 2],
          ],
          { tolerance: 0 }
        )
      ).code
    ).toBe('EDGE_ON_FACE_BAD_TOLERANCE');
  });
});

describe.skipIf(shouldSkipSuite('primitiveFns.nurbsSurface'))('nurbsSurface', () => {
  /** Cox-de Boor basis values at `t` for each of `count` poles. */
  const basis = (t: number, degree: number, knots: number[], mults: number[], count: number) => {
    const flat = knots.flatMap((k, i) => Array<number>(mults[i] ?? 0).fill(k));
    const n = flat.length - 1;
    const end = flat[n] ?? 0;
    let values = Array.from({ length: n }, (_, i): number => {
      const a = flat[i] ?? 0;
      const b = flat[i + 1] ?? 0;
      return (t >= a && t < b) || (b === end && a < b && t === b) ? 1 : 0;
    });
    for (let d = 1; d <= degree; d++) {
      values = Array.from({ length: n - d }, (_, i) => {
        const [a, b, c, e] = [flat[i], flat[i + d], flat[i + 1], flat[i + d + 1]].map(
          (x) => x ?? 0
        ) as [number, number, number, number];
        const left = b > a ? ((t - a) / (b - a)) * (values[i] ?? 0) : 0;
        const right = e > c ? ((e - t) / (e - c)) * (values[i + 1] ?? 0) : 0;
        return left + right;
      });
    }
    return values.slice(0, count);
  };

  /** A wavy 6 x 5 bicubic patch with interior knots, and its point at (u, v). */
  const wavy: NurbsSurfaceInput = {
    degreeU: 3,
    degreeV: 3,
    poles: Array.from({ length: 6 }, (_, i) =>
      Array.from({ length: 5 }, (_, j): P => [2 * i, 3 * j, 2 * Math.sin(i) * Math.cos(j)])
    ),
    knotsU: [0, 1, 2, 3],
    multiplicitiesU: [4, 1, 1, 4],
    knotsV: [0, 0.5, 2],
    multiplicitiesV: [4, 1, 4],
  };
  const at = (u: number, v: number): P => {
    const nu = basis(u, 3, [...wavy.knotsU], [...wavy.multiplicitiesU], 6);
    const nv = basis(v, 3, [...wavy.knotsV], [...wavy.multiplicitiesV], 5);
    let [x, y, z] = [0, 0, 0];
    wavy.poles.forEach((row, i) => {
      row.forEach((q, j) => {
        const b = (nu[i] ?? 0) * (nv[j] ?? 0);
        x += b * q[0];
        y += b * q[1];
        z += b * q[2];
      });
    });
    return [x, y, z];
  };

  it('is exactly the surface its poles and knots describe', () => {
    using f = unwrap(nurbsSurface(wavy));
    expect(isFace(f)).toBe(true);
    const b = uvBounds(f);
    expect(b.uMax - b.uMin).toBeCloseTo(3, 12);
    expect(b.vMax - b.vMin).toBeCloseTo(2, 12);
    for (const [u, v] of [
      [0, 0],
      [0.1, 0.85],
      [0.5, 0.25],
      [0.73, 0.05],
      [1, 1],
    ] as const) {
      const got = pointOnSurface(f, u, v);
      const want = at(3 * u, 2 * v);
      expect(Math.hypot(got[0] - want[0], got[1] - want[1], got[2] - want[2])).toBeLessThan(1e-9);
    }
  });

  it('weights the poles of a rational surface', () => {
    // A quarter cylinder of radius 4: an exact circular arc along u.
    const arc: P[] = [
      [4, 0, 0],
      [4, 4, 0],
      [0, 4, 0],
    ];
    using f = unwrap(
      nurbsSurface({
        degreeU: 2,
        degreeV: 1,
        poles: arc.map((q): P[] => [q, [q[0], q[1], 5]]),
        weights: [
          [1, 1],
          [Math.SQRT1_2, Math.SQRT1_2],
          [1, 1],
        ],
        knotsU: [0, 1],
        multiplicitiesU: [3, 3],
        knotsV: [0, 1],
        multiplicitiesV: [2, 2],
      })
    );
    for (let k = 0; k <= 8; k++) {
      const q = pointOnSurface(f, k / 8, 0.5);
      expect(Math.hypot(q[0], q[1])).toBeCloseTo(4, 12);
      expect(q[2]).toBeCloseTo(2.5, 12);
    }
  });

  it('rejects data that does not describe a surface', () => {
    const code = (change: Partial<NurbsSurfaceInput>) =>
      unwrapErr(nurbsSurface({ ...wavy, ...change })).code;
    expect(code({ degreeU: 0 })).toBe('NURBS_BAD_DEGREE');
    expect(code({ poles: [wavy.poles[0] ?? [], (wavy.poles[1] ?? []).slice(1)] })).toBe(
      'NURBS_BAD_POLES'
    );
    expect(code({ weights: wavy.poles.map((row) => row.map(() => 0)) })).toBe('NURBS_BAD_WEIGHTS');
    expect(code({ knotsU: [0, 2, 1, 3] })).toBe('NURBS_BAD_KNOTS');
    expect(code({ multiplicitiesU: [4, 2, 1, 4] })).toBe('NURBS_BAD_KNOTS');
    expect(code({ multiplicitiesU: [3.5, 2, 1, 3.5] })).toBe('NURBS_BAD_KNOTS');
    expect(code({ isPeriodicV: true })).toBe('NURBS_BAD_KNOTS');
    const bad: readonly [number, number, number] = [NaN, 0, 0];
    const nan = wavy.poles.map((row, i) => row.map((q, j) => (i + j === 0 ? bad : q)));
    expect(code({ poles: nan })).toBe('NURBS_BAD_POLES');
    expect(code({ weights: wavy.poles.map((row) => row.map(() => Infinity)) })).toBe(
      'NURBS_BAD_WEIGHTS'
    );
    expect(code({ knotsU: [0, 1, 2, Infinity] })).toBe('NURBS_BAD_KNOTS');
  });
});
