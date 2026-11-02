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
  unwrapErr,
  vertex,
} from '@/index.js';
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
