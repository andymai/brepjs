import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import {
  box,
  rotate,
  translate,
  orientedBoundingBox,
  getKernel,
  isErr,
  unwrap,
  polygon,
  type Vec3,
} from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

const hasInertia = (): boolean => getKernel().inertia !== undefined;

const deg = Math.PI / 180;
const rotZ = (v: Vec3, a: number): Vec3 => [
  v[0] * Math.cos(a * deg) - v[1] * Math.sin(a * deg),
  v[0] * Math.sin(a * deg) + v[1] * Math.cos(a * deg),
  v[2],
];
const rotX = (v: Vec3, a: number): Vec3 => [
  v[0],
  v[1] * Math.cos(a * deg) - v[2] * Math.sin(a * deg),
  v[1] * Math.sin(a * deg) + v[2] * Math.cos(a * deg),
];

function expectVec(actual: Vec3, expected: Vec3, digits = 6): void {
  for (let i = 0; i < 3; i++) expect(actual[i]).toBeCloseTo(expected[i] ?? 0, digits);
}

describe('orientedBoundingBox', () => {
  it('keeps the world axes for a shape already on them', (ctx) => {
    if (!hasInertia()) return ctx.skip();
    const board = translate(box(600, 400, 18.5), [100, 50, 0]);
    const obb = unwrap(orientedBoundingBox(board));
    expectVec(obb.size, [600, 400, 18.5]);
    expectVec(obb.center, [400, 250, 9.25]);
    expectVec(obb.axes[0], [1, 0, 0]);
    expectVec(obb.axes[1], [0, 1, 0]);
    expectVec(obb.axes[2], [0, 0, 1]);
  });

  it('finds the frame of a turned board', (ctx) => {
    if (!hasInertia()) return ctx.skip();
    const board = translate(box(600, 400, 18.5), [100, 50, 0]);
    const turned = rotate(rotate(board, 30, { axis: [0, 0, 1] }), -20, { axis: [1, 0, 0] });
    const turn = (v: Vec3): Vec3 => rotX(rotZ(v, 30), -20);
    const obb = unwrap(orientedBoundingBox(turned));
    expectVec(obb.size, [600, 400, 18.5]);
    expectVec(obb.center, turn([400, 250, 9.25]));
    expectVec(obb.axes[0], turn([1, 0, 0]));
    expectVec(obb.axes[1], turn([0, 1, 0]));
    expectVec(obb.axes[2], turn([0, 0, 1]));
  });

  it('orders the axes by decreasing size, right-handed', (ctx) => {
    if (!hasInertia()) return ctx.skip();
    const obb = unwrap(orientedBoundingBox(box(400, 600, 18)));
    expectVec(obb.size, [600, 400, 18]);
    expectVec(obb.axes[0], [0, 1, 0]);
    expectVec(obb.axes[1], [1, 0, 0]);
    expectVec(obb.axes[2], [0, 0, -1]);
  });

  it('rejects a shape that is not a solid', (ctx) => {
    if (!hasInertia()) return ctx.skip();
    const face = unwrap(
      polygon([
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
      ])
    );
    expect(isErr(orientedBoundingBox(face as never))).toBe(true);
  });

  it('reports UNSUPPORTED on a kernel without inertia', (ctx) => {
    if (hasInertia()) return ctx.skip();
    const result = orientedBoundingBox(box(1, 2, 3));
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.kind).toBe('UNSUPPORTED');
  });
});
