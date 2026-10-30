import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import {
  DEG2RAD,
  box,
  rotate,
  translate,
  compound,
  circle,
  wire,
  closedWire,
  isPlanarWire,
  face,
  getFaces,
  getKernel,
  registerKernel,
  withKernel,
  principalBoundingBox,
  vecCross,
  vecDot,
  measureVolume,
  isOk,
  isErr,
  unwrap,
  unwrapErr,
} from '@/index.js';
import type { Face, Vec3 } from '@/index.js';
import { skipIfDiverges } from './helpers/kernelDivergences.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

function rotZ(v: Vec3, deg: number): Vec3 {
  const c = Math.cos(deg * DEG2RAD);
  const s = Math.sin(deg * DEG2RAD);
  return [c * v[0] - s * v[1], s * v[0] + c * v[1], v[2]];
}

function rotX(v: Vec3, deg: number): Vec3 {
  const c = Math.cos(deg * DEG2RAD);
  const s = Math.sin(deg * DEG2RAD);
  return [v[0], c * v[1] - s * v[2], s * v[1] + c * v[2]];
}

function expectVecClose(actual: Vec3, expected: Vec3, precision: number): void {
  for (let i = 0; i < 3; i++) expect(actual[i]).toBeCloseTo(expected[i] ?? NaN, precision);
}

/** A loose disc face of `radius` in the plane z = `z`. */
function disc(radius: number, z: number): Face {
  using edge = circle(radius, { at: [0, 0, z] });
  using loop = unwrap(closedWire(unwrap(wire([edge]))));
  if (!isPlanarWire(loop)) throw new Error('a circle must be planar');
  return unwrap(face(loop));
}

/** Register a kernel that forwards to the active one except for `overrides`. */
function registerStubKernel(id: string, overrides: Record<string, unknown>): void {
  const base = getKernel();
  registerKernel(
    id,
    new Proxy(base, {
      get(target, prop) {
        if (Object.hasOwn(overrides, prop)) return overrides[prop as string];
        const value: unknown = Reflect.get(target, prop, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    })
  );
}

describe('principalBoundingBox', () => {
  it('reports world axes, exact size, and exact center for a board on the world axes', (ctx) => {
    skipIfDiverges(ctx, 'principalBoxFns.inertia');
    using board = box(600, 400, 18.5);
    const result = principalBoundingBox(board);
    expect(isOk(result)).toBe(true);
    const { center, axes, size } = unwrap(result);
    expectVecClose(size, [600, 400, 18.5], 6);
    expect(axes).toEqual([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);
    expectVecClose(center, [300, 200, 9.25], 9);
  });

  it('keeps size, axes, and center of a rotated and translated board', (ctx) => {
    skipIfDiverges(ctx, 'principalBoxFns.inertia');
    const offset: Vec3 = [1000, -500, 250];
    const place = (v: Vec3): Vec3 => rotX(rotZ(v, 30), -20);
    using board = box(600, 400, 18.5);
    using turned = rotate(board, 30, { axis: [0, 0, 1] });
    using tilted = rotate(turned, -20, { axis: [1, 0, 0] });
    using placed = translate(tilted, offset);

    const { center, axes, size } = unwrap(principalBoundingBox(placed));
    expectVecClose(size, [600, 400, 18.5], 6);
    const expectedAxes = [place([1, 0, 0]), place([0, 1, 0]), place([0, 0, 1])];
    axes.forEach((axis, i) => {
      expect(Math.abs(vecDot(axis, expectedAxes[i] ?? [0, 0, 0]))).toBeCloseTo(1, 9);
    });
    const c = place([300, 200, 9.25]);
    expectVecClose(center, [c[0] + offset[0], c[1] + offset[1], c[2] + offset[2]], 6);
  });

  it('orders axes by decreasing size and returns an orthonormal right-handed frame', (ctx) => {
    skipIfDiverges(ctx, 'principalBoxFns.inertia');
    using slab = box(18.5, 600, 400);
    using turned = rotate(slab, 40, { axis: [1, 1, 0] });
    const { axes, size } = unwrap(principalBoundingBox(turned));
    expect(size[0]).toBeGreaterThanOrEqual(size[1]);
    expect(size[1]).toBeGreaterThanOrEqual(size[2]);
    expectVecClose(size, [600, 400, 18.5], 6);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        expect(vecDot(axes[i] ?? [0, 0, 0], axes[j] ?? [0, 0, 0])).toBeCloseTo(i === j ? 1 : 0, 9);
      }
    }
    expectVecClose(vecCross(axes[0], axes[1]), axes[2], 9);
  });

  it('keeps world-aligned axes right-handed when the long side runs along Y', (ctx) => {
    skipIfDiverges(ctx, 'principalBoxFns.inertia');
    using board = box(400, 600, 18.5);
    const { axes, size } = unwrap(principalBoundingBox(board));
    expectVecClose(size, [600, 400, 18.5], 6);
    expect(axes).toEqual([
      [0, 1, 0],
      [1, 0, 0],
      [0, 0, -1],
    ]);
  });

  it('measures a compound of solids as one body', (ctx) => {
    skipIfDiverges(ctx, 'principalBoxFns.inertia');
    using a = box(10, 10, 10);
    using b0 = box(10, 10, 10);
    using b = translate(b0, [30, 0, 0]);
    using pair = compound([a, b]);
    const { center, size } = unwrap(principalBoundingBox(pair));
    expectVecClose(size, [40, 10, 10], 6);
    expectVecClose(center, [20, 5, 5], 6);
  });

  it('measures only the solids of a compound that also holds a loose face', (ctx) => {
    skipIfDiverges(ctx, 'principalBoxFns.inertia');
    using board = box(30, 20, 10);
    using loose = disc(5, 50);
    using mixed = compound([board, loose]);
    const { center, axes, size } = unwrap(principalBoundingBox(mixed));
    expectVecClose(size, [30, 20, 10], 6);
    expect(axes).toEqual([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);
    expectVecClose(center, [15, 10, 5], 6);
  });

  it('does not reject a solid as zero-volume because of a loose face beside it', (ctx) => {
    skipIfDiverges(ctx, 'principalBoxFns.inertia');
    // A loose face adds a meaningless signed volume term; for this disc below the
    // box it outweighs the box's 1000, so the whole compound read as no volume.
    using cube = box(10, 10, 10);
    using loose = disc(10, -50);
    using mixed = compound([cube, loose]);
    const { center, size } = unwrap(principalBoundingBox(mixed));
    expectVecClose(size, [10, 10, 10], 6);
    expectVecClose(center, [5, 5, 5], 6);
  });

  it('reports the world-axis extent of a rotated square plate (principal axes are not unique)', (ctx) => {
    skipIfDiverges(ctx, 'principalBoxFns.inertia');
    using plate = box(100, 100, 2);
    using turned = rotate(plate, 30, { axis: [0, 0, 1] });
    const { size } = unwrap(principalBoundingBox(turned));
    const diagonalSpan = 100 * (Math.cos(30 * DEG2RAD) + Math.sin(30 * DEG2RAD));
    expectVecClose(size, [diagonalSpan, diagonalSpan, 2], 6);
  });

  it('returns the cached result for a repeated call on the same shape', (ctx) => {
    skipIfDiverges(ctx, 'principalBoxFns.inertia');
    using b = box(30, 20, 10);
    const first = unwrap(principalBoundingBox(b));
    expect(unwrap(principalBoundingBox(b))).toBe(first);
  });

  it('rejects a face', (ctx) => {
    skipIfDiverges(ctx, 'principalBoxFns.inertia');
    using b = box(10, 10, 10);
    const face = getFaces(b)[0];
    if (!face) throw new Error('box must have a face');
    const result = principalBoundingBox(face);
    expect(isErr(result)).toBe(true);
    const error = unwrapErr(result);
    expect(error.kind).toBe('VALIDATION');
    expect(error.code).toBe('NOT_A_SOLID');
  });

  it('rejects a compound made only of faces as zero-volume', (ctx) => {
    skipIfDiverges(ctx, 'principalBoxFns.inertia');
    using b = box(10, 10, 10);
    using faces = compound(getFaces(b));
    const result = principalBoundingBox(faces);
    expect(isErr(result)).toBe(true);
    const error = unwrapErr(result);
    expect(error.kind).toBe('VALIDATION');
    expect(error.code).toBe('ZERO_VOLUME');
  });

  it('returns an UNSUPPORTED error on a kernel without an inertia query', () => {
    registerStubKernel('no-inertia', { inertia: undefined });
    using b = box(10, 10, 10);
    const result = withKernel('no-inertia', () => principalBoundingBox(b));
    expect(isErr(result)).toBe(true);
    const error = unwrapErr(result);
    expect(error.kind).toBe('UNSUPPORTED');
    expect(error.code).toBe('UNSUPPORTED_CAPABILITY');
  });

  it('returns a kernel error when the inertia query throws', () => {
    registerStubKernel('throwing-inertia', {
      inertia: () => {
        throw new Error('inertia exploded');
      },
    });
    using b = box(10, 10, 10);
    const result = withKernel('throwing-inertia', () => principalBoundingBox(b));
    expect(isErr(result)).toBe(true);
    const error = unwrapErr(result);
    expect(error.kind).toBe('KERNEL_OPERATION');
    expect(error.code).toBe('PRINCIPAL_BOX_FAILED');
    expect(error.message).toContain('inertia exploded');
  });

  it.each(['generalTransform', 'boundingBox'])(
    'returns a kernel error and leaves the input intact when %s throws',
    (method) => {
      registerStubKernel(`throwing-${method}`, {
        inertia: () => [3, 0, 0, 0, 2, 0, 0, 0, 1],
        [method]: () => {
          throw new Error(`${method} exploded`);
        },
      });
      using b = box(10, 10, 10);
      const result = withKernel(`throwing-${method}`, () => principalBoundingBox(b));
      expect(isErr(result)).toBe(true);
      const error = unwrapErr(result);
      expect(error.kind).toBe('KERNEL_OPERATION');
      expect(error.code).toBe('PRINCIPAL_BOX_FAILED');
      expect(error.message).toContain(`${method} exploded`);
      expect(unwrap(measureVolume(b))).toBeCloseTo(1000, 6);
    }
  );
});
