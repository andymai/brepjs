import { describe, it, beforeAll, expect } from 'vitest';
import { currentKernel, initKernel } from './setup.js';
import {
  box,
  curveEndPoint,
  curveStartPoint,
  fillet,
  getEdges,
  getFaces,
  getVertices,
  isValid,
  measureVolume,
  unwrap,
  unwrapErr,
  vertexPosition,
  type Edge,
  type Solid,
  type Vec3,
  type Vertex,
} from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

const isBrepkit = currentKernel === 'brepkit';
const descBk = isBrepkit ? describe : describe.skip;

const near = (a: Vec3, b: Vec3): boolean => a.every((c, k) => Math.abs(c - (b[k] ?? 0)) < 1e-6);
/** The vertex of a box furthest along x, y and z, and the three edges that meet there. */
const corner = (solid: Solid): { vertex: Vertex; edges: Edge[] } => {
  const sum = (v: Vertex): number => vertexPosition(v).reduce((a, b) => a + b, 0);
  const vertex = getVertices(solid).reduce((best, v) => (sum(v) > sum(best) ? v : best));
  const at = vertexPosition(vertex);
  const edges = getEdges(solid).filter(
    (e) => near(curveStartPoint(e), at) || near(curveEndPoint(e), at)
  );
  return { vertex, edges };
};
/** Three radius 2 rounds on a 20 box, closed by a ball: the box less three edge strips, plus the corner. */
const ROLLED = 7949.8348;

describe('fillet corner options', () => {
  it.skipIf(isBrepkit)('reports a kernel without them as unsupported', () => {
    using b = box(20, 20, 20);
    const { vertex, edges } = corner(b);
    const error = unwrapErr(fillet(b, edges, 2, { corners: [{ vertex, corner: 'g2' }] }));
    expect(error.code).toBe('UNSUPPORTED_CAPABILITY');
    expect(error.suggestion).toMatch(/brepkit-wasm 4\.10\.0/);
  });

  it('refuses a varying radius and a set-back that is not positive', () => {
    using b = box(20, 20, 20);
    const { vertex, edges } = corner(b);
    expect(unwrapErr(fillet(b, edges, [1, 2], { corners: [{ vertex }] })).code).toBe(
      'FILLET_CORNERS_NEED_CONSTANT_RADIUS'
    );
    const setbacks = edges.map((edge) => ({ edge, distance: 0 }));
    expect(unwrapErr(fillet(b, edges, 2, { corners: [{ vertex, setbacks }] })).code).toBe(
      'FILLET_BAD_SETBACK'
    );
  });
});

descBk('brepkit fillet corner options', () => {
  it('leaves a rolling corner with no set-backs as a ball', () => {
    using b = box(20, 20, 20);
    const { vertex, edges } = corner(b);
    using rounded = unwrap(fillet(b, edges, 2, { corners: [{ vertex, corner: 'rolling' }] }));
    expect(isValid(rounded)).toBe(true);
    expect(unwrap(measureVolume(rounded))).toBeCloseTo(ROLLED, 2);
  });

  it('sets a corner back along each of its rounds', () => {
    using b = box(20, 20, 20);
    const { vertex, edges } = corner(b);
    const setbacks = edges.map((edge, i) => ({ edge, distance: 3 + i }));
    using rounded = unwrap(fillet(b, edges, 2, { corners: [{ vertex, setbacks }] }));
    expect(isValid(rounded)).toBe(true);
    // Six planes, three rounds, and two patches closing the corner.
    expect(getFaces(rounded)).toHaveLength(11);
    const volume = unwrap(measureVolume(rounded));
    expect(volume).toBeLessThan(ROLLED - 0.01);
    expect(volume).toBeGreaterThan(ROLLED - 10);

    const further = edges.map((edge, i) => ({ edge, distance: 5 + i }));
    using more = unwrap(fillet(b, edges, 2, { corners: [{ vertex, setbacks: further }] }));
    expect(unwrap(measureVolume(more))).toBeLessThan(volume);
  });

  it('closes a corner with a G2 patch', () => {
    using b = box(20, 20, 20);
    const { vertex, edges } = corner(b);
    using rounded = unwrap(fillet(b, edges, 2, { corners: [{ vertex, corner: 'g2' }] }));
    expect(isValid(rounded)).toBe(true);
    expect(getFaces(rounded)).toHaveLength(11);
    const volume = unwrap(measureVolume(rounded));
    expect(volume).toBeLessThan(ROLLED - 0.001);
    expect(volume).toBeGreaterThan(ROLLED - 10);
  });

  it('reports a set-back that stops short of the ball', () => {
    using b = box(20, 20, 20);
    const { vertex, edges } = corner(b);
    const setbacks = edges.map((edge) => ({ edge, distance: 0.5 }));
    const error = unwrapErr(fillet(b, edges, 2, { corners: [{ vertex, setbacks }] }));
    expect(error.code).not.toBe('UNSUPPORTED_CAPABILITY');
  });
});
