/**
 * Semantic face roles recorded by `extrude`: `extrude:start` / `extrude:end`
 * caps, `extrude:side:<i>` per outline edge in written order, and
 * `extrude:hole<j>:side:<i>` per hole edge. Kernels list an extrusion's faces
 * in different orders, so every check locates faces geometrically.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { shouldSkipSuite } from './helpers/kernelDivergences.js';
import {
  box,
  cut,
  drawCircle,
  drawRectangle,
  extrude,
  getFaces,
  getHashCode,
  isEdge,
  polygon,
  rotate,
  translate,
  unwrap,
  type Face,
  type Shape3D,
} from '@/index.js';
import { faceCenter, normalAt } from '@/topology/faceFns.js';
import { sharedEdges } from '@/topology/adjacencyFns.js';
import { curveStartPoint, curveEndPoint } from '@/topology/curveFns.js';
import {
  assignRoles,
  createEdgeRef,
  createRef,
  resolveRefIn,
  type RoleTable,
} from '@/topology/shapeRef/index.js';
import { Evaluator, extrude as extrudeNode, polygon as polygonNode } from '@/csg/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

type P = [number, number, number];

const CCW_SQUARE: P[] = [
  [0, 0, 0],
  [10, 0, 0],
  [10, 10, 0],
  [0, 10, 0],
];

function extrudePolygon(points: P[], vector: P): Shape3D {
  using face = unwrap(polygon(points));
  return unwrap(extrude(face, vector));
}

function regularPolygon(sides: number, radius: number): P[] {
  return Array.from({ length: sides }, (_, i) => {
    const a = (2 * Math.PI * i) / sides;
    return [radius * Math.cos(a), radius * Math.sin(a), 0];
  });
}

function faceFor(shape: Shape3D, roles: Map<string, number[]>, role: string): Face {
  const hashes = roles.get(role) ?? [];
  const face = getFaces(shape).find((f) => hashes.includes(getHashCode(f)));
  if (face === undefined) throw new Error(`no face for role ${role}`);
  return face;
}

function expectPoint(actual: readonly number[], expected: readonly number[]): void {
  expect(actual[0]).toBeCloseTo(expected[0] ?? NaN, 5);
  expect(actual[1]).toBeCloseTo(expected[1] ?? NaN, 5);
  expect(actual[2]).toBeCloseTo(expected[2] ?? NaN, 5);
}

function centerOfRole(shape: Shape3D, role: string): readonly number[] {
  return faceCenter(faceFor(shape, assignRoles(shape, 'extrude'), role));
}

describe.skipIf(shouldSkipSuite('shapeRefExtrudeRoles.recorded'))('extrude face roles', () => {
  it('names the caps and each outline edge of a counter-clockwise square', () => {
    using solid = extrudePolygon(CCW_SQUARE, [0, 0, 5]);
    const roles = assignRoles(solid, 'extrude');
    expect([...roles.keys()].sort()).toEqual([
      'extrude:end',
      'extrude:side:0',
      'extrude:side:1',
      'extrude:side:2',
      'extrude:side:3',
      'extrude:start',
    ]);
    expectPoint(centerOfRole(solid, 'extrude:start'), [5, 5, 0]);
    expectPoint(centerOfRole(solid, 'extrude:end'), [5, 5, 5]);
    expectPoint(centerOfRole(solid, 'extrude:side:0'), [5, 0, 2.5]);
    expectPoint(centerOfRole(solid, 'extrude:side:1'), [10, 5, 2.5]);
    expectPoint(centerOfRole(solid, 'extrude:side:2'), [5, 10, 2.5]);
    expectPoint(centerOfRole(solid, 'extrude:side:3'), [0, 5, 2.5]);
  });

  it('numbers sides in the written order of a clockwise outline', () => {
    using solid = extrudePolygon(
      [
        [0, 0, 0],
        [0, 10, 0],
        [10, 10, 0],
        [10, 0, 0],
      ],
      [0, 0, 5]
    );
    expectPoint(centerOfRole(solid, 'extrude:side:0'), [0, 5, 2.5]);
    expectPoint(centerOfRole(solid, 'extrude:side:1'), [5, 10, 2.5]);
    expectPoint(centerOfRole(solid, 'extrude:side:2'), [10, 5, 2.5]);
    expectPoint(centerOfRole(solid, 'extrude:side:3'), [5, 0, 2.5]);
  });

  it('puts start on the profile and end at profile + vector for any direction', () => {
    using down = extrudePolygon(CCW_SQUARE, [0, 0, -5]);
    expectPoint(centerOfRole(down, 'extrude:start'), [5, 5, 0]);
    expectPoint(centerOfRole(down, 'extrude:end'), [5, 5, -5]);

    using oblique = extrudePolygon(CCW_SQUARE, [2, 3, 5]);
    expectPoint(centerOfRole(oblique, 'extrude:start'), [5, 5, 0]);
    expectPoint(centerOfRole(oblique, 'extrude:end'), [7, 8, 5]);
    expectPoint(centerOfRole(oblique, 'extrude:side:0'), [6, 1.5, 2.5]);
  });

  it('names a profile in the YZ plane extruded along X', () => {
    using solid = extrudePolygon(
      [
        [0, 0, 0],
        [0, 10, 0],
        [0, 10, 10],
        [0, 0, 10],
      ],
      [5, 0, 0]
    );
    expectPoint(centerOfRole(solid, 'extrude:start'), [0, 5, 5]);
    expectPoint(centerOfRole(solid, 'extrude:end'), [5, 5, 5]);
    expectPoint(centerOfRole(solid, 'extrude:side:0'), [2.5, 5, 0]);
    expectPoint(centerOfRole(solid, 'extrude:side:1'), [2.5, 10, 5]);
  });

  it('keeps the cap names when the profile gains a segment', () => {
    using square = extrudePolygon(regularPolygon(4, 10), [0, 0, 8]);
    using pentagon = extrudePolygon(regularPolygon(5, 10), [0, 0, 8]);

    const squareRoles = assignRoles(square, 'extrude');
    const ref = createRef('extrude', 'extrude:end', faceFor(square, squareRoles, 'extrude:end'));
    const resolved = resolveRefIn(ref, pentagon);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(faceCenter(resolved.entity as Face)[2]).toBeCloseTo(8, 5);
    expect(normalAt(resolved.entity as Face)[2]).toBeCloseTo(1, 5);
  });

  it('names hole sides by inner wire', () => {
    const drawing = drawRectangle(30, 30)
      .cut(drawCircle(4).translate(-6, 0))
      .cut(drawCircle(3).translate(8, 0));
    using face = drawing.sketchOnPlane('XY').face() as Parameters<typeof extrude>[0];
    using solid = unwrap(extrude(face, [0, 0, 5]));
    const roles = assignRoles(solid, 'extrude');

    expect([...roles.keys()].filter((r) => r.startsWith('extrude:side:'))).toHaveLength(4);
    expect([...roles.keys()].some((r) => r.includes(':face_'))).toBe(false);
    const holeCenters = [0, 1].map((j) => {
      const sides = [...roles.keys()].filter((r) => r.startsWith(`extrude:hole${j}:side:`));
      expect(sides.length).toBeGreaterThan(0);
      return faceCenter(faceFor(solid, roles, sides[0] ?? ''));
    });
    const holeX = holeCenters.map((c) => Math.sign(c[0])).sort();
    expect(holeX).toEqual([-1, 1]);
  });

  it('carries the roles through translate and rotate', () => {
    using solid = extrudePolygon(CCW_SQUARE, [0, 0, 5]);
    using moved = translate(solid, [10, 0, 0]);
    expectPoint(centerOfRole(moved, 'extrude:end'), [15, 5, 5]);
    expectPoint(centerOfRole(moved, 'extrude:side:0'), [15, 0, 2.5]);

    using turned = rotate(solid, 90, { axis: [1, 0, 0] });
    expectPoint(centerOfRole(turned, 'extrude:end'), [5, -5, 5]);
  });

  it('carries the roles through a boolean and names new faces positionally', () => {
    using solid = extrudePolygon(CCW_SQUARE, [0, 0, 5]);
    using toolBox = box(2, 2, 10);
    using tool = translate(toolBox, [4, 4, -2]);
    using drilled = unwrap(cut(solid, tool));
    const roles = assignRoles(drilled, 'extrude');

    expect(roles.has('extrude:start')).toBe(true);
    expect(roles.has('extrude:side:0')).toBe(true);
    const end = faceFor(drilled, roles, 'extrude:end');
    expect(faceCenter(end)[2]).toBeCloseTo(5, 5);
    expect(normalAt(end)[2]).toBeCloseTo(1, 5);
    expect([...roles.keys()].filter((r) => r.includes(':face_'))).toHaveLength(4);
  });

  it('records the same roles for a csg Extrude node', () => {
    using ev = new Evaluator();
    const solid = unwrap(ev.evaluate(extrudeNode(polygonNode(CCW_SQUARE), [0, 0, 5]))) as Shape3D;
    expectPoint(centerOfRole(solid, 'extrude:end'), [5, 5, 5]);
    expectPoint(centerOfRole(solid, 'extrude:side:1'), [10, 5, 2.5]);
  });

  it('leaves other operation types positional', () => {
    using solid = extrudePolygon(CCW_SQUARE, [0, 0, 5]);
    const roles = assignRoles(solid, 'myOp');
    expect([...roles.keys()].every((r) => r.startsWith('myOp:face_'))).toBe(true);
  });

  it('re-resolves an edge named by two roles on a rebuilt extrusion', () => {
    using square = extrudePolygon(CCW_SQUARE, [0, 0, 5]);
    const roles = assignRoles(square, 'extrude');
    const table: RoleTable = new Map([['extrude', roles]]);
    const [edge] = sharedEdges(
      faceFor(square, roles, 'extrude:end'),
      faceFor(square, roles, 'extrude:side:0')
    );
    if (edge === undefined) throw new Error('no end ∩ side:0 edge');
    const ref = createEdgeRef('extrude', edge, square, table);
    if (ref === undefined) throw new Error('could not capture edge ref');

    using taller = extrudePolygon(
      [
        [0, 0, 0],
        [10, 0, 0],
        [10, 10, 0],
        [5, 14, 0],
        [0, 10, 0],
      ],
      [0, 0, 12]
    );
    const resolved = resolveRefIn(ref, taller);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok || !isEdge(resolved.entity)) throw new Error('edge ref did not resolve');
    for (const p of [curveStartPoint(resolved.entity), curveEndPoint(resolved.entity)]) {
      expect(p[1]).toBeCloseTo(0, 5);
      expect(p[2]).toBeCloseTo(12, 5);
    }
  });
});
