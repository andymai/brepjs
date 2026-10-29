import { describe, it, expect, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { skipIfDiverges } from './helpers/kernelDivergences.js';
import {
  box,
  chamfer,
  chamferDistAngleShape,
  fillet,
  getKernel,
  registerKernel,
  shape,
  withKernel,
  isOk,
  isErr,
  unwrap,
  unwrapErr,
  measureVolume,
  isShape3D,
  getEdges,
  getBounds,
} from '@/index.js';
import { faultyEdgeIndexesOf } from '@/kernel/faultyEdges.js';
import type { Dimension, Edge, Shape3D } from '@/core/shapeTypes.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('chamferDistAngleShape', () => {
  it('chamfers a single edge of a box with distance + angle', () => {
    const b = box(10, 10, 10);
    const edges = getEdges(b);
    expect(edges.length).toBe(12);

    const result = chamferDistAngleShape(b, [edges[0]!], 1, 45); // eslint-disable-line @typescript-eslint/no-non-null-assertion
    expect(isOk(result)).toBe(true);
    const chamfered = unwrap(result);
    expect(isShape3D(chamfered)).toBe(true);

    // Chamfered box should have less volume than original
    const origVol = unwrap(measureVolume(b));
    const chamfVol = unwrap(measureVolume(chamfered));
    expect(chamfVol).toBeLessThan(origVol);
    expect(chamfVol).toBeGreaterThan(0);
  });

  it('chamfers multiple edges', () => {
    const b = box(10, 10, 10);
    const edges = getEdges(b);
    const selected = edges.slice(0, 4);

    const result = chamferDistAngleShape(b, selected, 1, 45);
    expect(isOk(result)).toBe(true);
    const chamfered = unwrap(result);
    expect(isShape3D(chamfered)).toBe(true);

    const origVol = unwrap(measureVolume(b));
    const chamfVol = unwrap(measureVolume(chamfered));
    expect(chamfVol).toBeLessThan(origVol);
  });

  it('uses different angles', () => {
    const b = box(20, 20, 20);
    const edges = getEdges(b);

    // A smaller angle should remove less material than a larger angle
    // at the same distance
    const result30 = unwrap(chamferDistAngleShape(b, [edges[0]!], 2, 30)); // eslint-disable-line @typescript-eslint/no-non-null-assertion
    const result60 = unwrap(chamferDistAngleShape(b, [edges[0]!], 2, 60)); // eslint-disable-line @typescript-eslint/no-non-null-assertion

    const vol30 = unwrap(measureVolume(result30));
    const vol60 = unwrap(measureVolume(result60));

    // Both should be valid and less than original
    const origVol = unwrap(measureVolume(b));
    expect(vol30).toBeLessThan(origVol);
    expect(vol60).toBeLessThan(origVol);
    // Different angles produce different volumes
    expect(vol30).not.toBeCloseTo(vol60, 0);
  });

  it('chamfers all 12 edges of a box', () => {
    const b = box(20, 20, 20);
    const edges = getEdges(b);
    expect(edges.length).toBe(12);

    const result = chamferDistAngleShape(b, edges, 1, 45);
    expect(isOk(result)).toBe(true);
    const chamfered = unwrap(result);
    expect(isShape3D(chamfered)).toBe(true);

    const origVol = unwrap(measureVolume(b));
    const chamfVol = unwrap(measureVolume(chamfered));
    expect(chamfVol).toBeLessThan(origVol);
    expect(chamfVol).toBeGreaterThan(origVol * 0.8); // Not too much removed
  });

  it('is immutable — does not modify original shape', () => {
    const b = box(10, 10, 10);
    const origVol = unwrap(measureVolume(b));
    const edges = getEdges(b);

    chamferDistAngleShape(b, [edges[0]!], 1, 45); // eslint-disable-line @typescript-eslint/no-non-null-assertion
    expect(unwrap(measureVolume(b))).toBeCloseTo(origVol, 6);
  });

  it('returns Err for empty edges array', () => {
    const b = box(10, 10, 10);
    const result = chamferDistAngleShape(b, [], 1, 45);
    expect(isErr(result)).toBe(true);
  });

  it('returns Err for non-positive distance', () => {
    const b = box(10, 10, 10);
    const edges = getEdges(b);
    const result = chamferDistAngleShape(b, [edges[0]!], 0, 45); // eslint-disable-line @typescript-eslint/no-non-null-assertion
    expect(isErr(result)).toBe(true);
  });

  it('sets every edge back by the distance and the angle', (ctx) => {
    skipIfDiverges(ctx, 'chamferAngle.exactVolume');
    using b = box(10, 10, 10);
    const vertical = getEdges(b).filter((e) => getBounds(e).zMax - getBounds(e).zMin > 5);
    using chamfered = unwrap(chamferDistAngleShape(b, vertical, 1, 30));
    // Each edge loses a right triangle with legs 1 and tan 30°, along its 10 mm.
    const loss = 4 * 10 * (Math.tan(Math.PI / 6) / 2);
    expect(unwrap(measureVolume(chamfered))).toBeCloseTo(1000 - loss, 6);
  });

  it('names the edge it could not chamfer in the error cause', (ctx) => {
    skipIfDiverges(ctx, 'modifierFns.edgeTreatmentFailedEdges');
    // On a 20 x 20 x 2 plate a 3 mm setback fits a vertical edge, not a top one.
    using plate = box(20, 20, 2);
    const span = (e: Edge) => getBounds(e).zMax - getBounds(e).zMin;
    const edges = getEdges(plate);
    const vertical = edges.find((e) => span(e) > 1);
    const top = edges.find((e) => span(e) < 1e-6 && getBounds(e).zMin > 1.9);
    if (!vertical || !top) throw new Error('plate edges not found');
    const error = unwrapErr(chamferDistAngleShape(plate, [vertical, top], 3, 45));
    expect(error.code).toBe('CHAMFER_ANGLE_FAILED');
    expect(faultyEdgeIndexesOf(error.cause)).toEqual([1]);
  });

  it('returns Err for angle out of range', () => {
    const b = box(10, 10, 10);
    const edges = getEdges(b);
    expect(isErr(chamferDistAngleShape(b, [edges[0]!], 1, 0))).toBe(true); // eslint-disable-line @typescript-eslint/no-non-null-assertion
    expect(isErr(chamferDistAngleShape(b, [edges[0]!], 1, 90))).toBe(true); // eslint-disable-line @typescript-eslint/no-non-null-assertion
    expect(isErr(chamferDistAngleShape(b, [edges[0]!], 1, -10))).toBe(true); // eslint-disable-line @typescript-eslint/no-non-null-assertion
  });
});

// The four vertical edges of a 10 mm cube share no vertex, so a distance-angle
// chamfer on each removes its own prism: a right triangle with legs d and
// d·tan(angle), 10 mm long.
describe('chamfer() with { distance, angle } per edge', () => {
  type DistAngle = { distance: number; angle: number };
  const loss = ({ distance, angle }: DistAngle) =>
    10 * ((distance * distance * Math.tan((angle * Math.PI) / 180)) / 2);

  function verticalEdges(solid: Shape3D): Edge[] {
    return getEdges(solid).filter((e) => getBounds(e).zMax - getBounds(e).zMin > 5);
  }

  /** The value for a vertical edge on the x = 0 side, or on the x = 10 side. */
  function bySide<V>(nearSide: V, farSide: V): (edge: Edge<Dimension>) => V {
    return (edge) => (getBounds(edge).xMin < 5 ? nearSide : farSide);
  }

  /** A kernel that forwards to the active one except for `overrides`. */
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

  const near: DistAngle = { distance: 1, angle: 30 };
  const far: DistAngle = { distance: 2, angle: 60 };

  it('chamfers each edge by its own distance and angle', (ctx) => {
    skipIfDiverges(ctx, 'chamferAngle.perEdge');
    using b = box(10, 10, 10);
    using chamfered = unwrap(chamfer(b, verticalEdges(b), bySide(near, far)));
    expect(unwrap(measureVolume(chamfered))).toBeCloseTo(1000 - 2 * loss(near) - 2 * loss(far), 6);

    const steeper: DistAngle = { distance: 1, angle: 60 };
    using angled = unwrap(chamfer(b, verticalEdges(b), bySide(near, steeper)));
    expect(unwrap(measureVolume(angled))).toBeCloseTo(1000 - 2 * loss(near) - 2 * loss(steeper), 6);
  });

  it('chamfers each edge by its own distance and angle through the fluent wrapper', (ctx) => {
    skipIfDiverges(ctx, 'chamferAngle.perEdge');
    using b = box(10, 10, 10);
    using chamfered = shape(b).chamfer((e) => e.inDirection('Z'), bySide(near, far)).val;
    expect(unwrap(measureVolume(chamfered))).toBeCloseTo(1000 - 2 * loss(near) - 2 * loss(far), 6);
  });

  it('applies a callback that gives every edge it keeps the same { distance, angle }', (ctx) => {
    skipIfDiverges(ctx, 'chamferAngle.exactVolume');
    using b = box(10, 10, 10);
    using all = unwrap(chamfer(b, verticalEdges(b), () => near));
    expect(unwrap(measureVolume(all))).toBeCloseTo(1000 - 4 * loss(near), 6);
    using some = unwrap(chamfer(b, verticalEdges(b), bySide<DistAngle | null>(near, null)));
    expect(unwrap(measureVolume(some))).toBeCloseTo(1000 - 2 * loss(near), 6);
  });

  it('keeps the uniform { distance, angle } form', (ctx) => {
    skipIfDiverges(ctx, 'chamferAngle.exactVolume');
    using b = box(10, 10, 10);
    using chamfered = unwrap(chamfer(b, verticalEdges(b), near));
    expect(unwrap(measureVolume(chamfered))).toBeCloseTo(1000 - 4 * loss(near), 6);
  });

  it('rejects a callback that mixes plain distances with { distance, angle }', () => {
    using b = box(10, 10, 10);
    const error = unwrapErr(chamfer(b, verticalEdges(b), bySide<number | DistAngle>(1, near)));
    expect(error.code).toBe('INVALID_CHAMFER_DISTANCE');
    expect(error.message).toContain('{ distance, angle }');
  });

  it('treats a non-positive plain distance next to { distance, angle } as a skipped edge', (ctx) => {
    skipIfDiverges(ctx, 'chamferAngle.exactVolume');
    using b = box(10, 10, 10);
    using chamfered = unwrap(chamfer(b, verticalEdges(b), bySide<number | DistAngle>(0, near)));
    expect(unwrap(measureVolume(chamfered))).toBeCloseTo(1000 - 2 * loss(near), 6);
  });

  it('returns a failed Result when the callback throws', () => {
    using b = box(10, 10, 10);
    const error = unwrapErr(
      chamfer(b, verticalEdges(b), () => {
        throw new Error('could not measure the edge');
      })
    );
    expect(error.code).toBe('CHAMFER_FAILED');
    expect(error.message).toContain('could not measure the edge');
  });

  it('rejects an angle outside (0, 90) from the callback', () => {
    using b = box(10, 10, 10);
    const error = unwrapErr(chamfer(b, verticalEdges(b), bySide(near, { distance: 1, angle: 90 })));
    expect(error.code).toBe('CHAMFER_ANGLE_BAD_ANGLE');
  });

  it('returns UNSUPPORTED on a kernel without per-edge distance-angle chamfers', () => {
    registerStubKernel('no-per-edge-dist-angle', { chamferDistAngles: undefined });
    using b = box(10, 10, 10);
    const edges = verticalEdges(b);
    const error = unwrapErr(
      withKernel('no-per-edge-dist-angle', () => chamfer(b, edges, bySide(near, far)))
    );
    expect(error.kind).toBe('UNSUPPORTED');
    expect(error.code).toBe('UNSUPPORTED_CAPABILITY');
    // One { distance, angle } for every edge needs only the single-value call.
    const uniform = withKernel('no-per-edge-dist-angle', () => chamfer(b, edges, () => near));
    expect(isOk(uniform)).toBe(true);
    if (isOk(uniform)) uniform.value[Symbol.dispose]();
  });

  it('names the edge it could not chamfer', (ctx) => {
    skipIfDiverges(ctx, 'chamferAngle.perEdge');
    skipIfDiverges(ctx, 'modifierFns.edgeTreatmentFailedEdges');
    // On a 20 x 20 x 2 plate a 3 mm setback fits a vertical edge, not a top one.
    using plate = box(20, 20, 2);
    const span = (e: Edge) => getBounds(e).zMax - getBounds(e).zMin;
    const edges = getEdges(plate);
    const vertical = edges.find((e) => span(e) > 1);
    const top = edges.find((e) => span(e) < 1e-6 && getBounds(e).zMin > 1.9);
    if (!vertical || !top) throw new Error('plate edges not found');
    const error = unwrapErr(
      chamfer(plate, [vertical, top], (e) => (e === top ? { distance: 3, angle: 45 } : near))
    );
    expect(error.code).toBe('CHAMFER_ANGLE_FAILED');
    expect(error.metadata?.['failedEdges']).toEqual([top]);
  });

  it('returns Err when edges of one tangent-continuous contour get different setbacks', (ctx) => {
    skipIfDiverges(ctx, 'chamferAngle.perEdge');
    using b = box(20, 20, 10);
    using rounded = unwrap(fillet(b, verticalEdges(b), 3));
    const top = getEdges(rounded).filter((e) => getBounds(e).zMin > 9.9);
    const straight = (e: Edge<Dimension>) => {
      const { xMin, xMax, yMin, yMax } = getBounds(e);
      return xMax - xMin < 1e-6 || yMax - yMin < 1e-6;
    };
    const result = chamfer(rounded, top, (e) => (straight(e) ? near : { distance: 1, angle: 45 }));
    const error = unwrapErr(result);
    expect(error.code).toBe('CHAMFER_ANGLE_FAILED');
    expect(error.message).toContain('tangent-continuous');
  });
});
