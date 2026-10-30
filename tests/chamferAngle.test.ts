import { describe, it, expect, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { shouldSkipSuite, skipIfDiverges } from './helpers/kernelDivergences.js';
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
  getFaces,
  getBounds,
  facesOfEdge,
  isSameShape,
} from '@/index.js';
import { faultyEdgeIndexesOf } from '@/kernel/faultyEdges.js';
import { UnsupportedKernelOperationError } from '@/kernel/unsupported.js';
import type { Edge, Face, Shape3D } from '@/core/shapeTypes.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('chamferDistAngleShape', () => {
  it('chamfers a single edge of a box with distance + angle', (ctx) => {
    skipIfDiverges(ctx, 'chamferAngle.distAngle');
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

  it('chamfers multiple edges', (ctx) => {
    skipIfDiverges(ctx, 'chamferAngle.distAngle');
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

  it('uses different angles', (ctx) => {
    skipIfDiverges(ctx, 'chamferAngle.distAngle');
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

  it('chamfers all 12 edges of a box', (ctx) => {
    skipIfDiverges(ctx, 'chamferAngle.distAngle');
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

  // Runs only where chamferAngle.distAngle is a registered divergence (brepkit).
  it.skipIf(!shouldSkipSuite('chamferAngle.distAngle'))(
    'returns UNSUPPORTED_CAPABILITY on a kernel without a distance-angle chamfer',
    () => {
      using b = box(10, 10, 10);
      const vertical = getEdges(b).filter((e) => getBounds(e).zMax - getBounds(e).zMin > 5);
      const error = unwrapErr(chamferDistAngleShape(b, vertical, 1, 30));
      expect(error.kind).toBe('UNSUPPORTED');
      expect(error.code).toBe('UNSUPPORTED_CAPABILITY');
      expect(unwrapErr(chamfer(b, vertical, { distance: 1, angle: 30 })).code).toBe(
        'UNSUPPORTED_CAPABILITY'
      );
    }
  );
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
  function bySide<V>(nearSide: V, farSide: V): (edge: Edge) => V {
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

  it('returns UNSUPPORTED on a kernel without per-edge distance-angle chamfers', (ctx) => {
    skipIfDiverges(ctx, 'chamferAngle.distAngle');
    registerStubKernel('no-per-edge-dist-angle', {
      chamferDistAngles: undefined,
      chamferDistAnglesWithHistory: undefined,
    });
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

  it('returns UNSUPPORTED on a kernel without a distance-angle chamfer', () => {
    registerStubKernel('no-dist-angle', {
      chamferDistAngle: () => {
        throw new UnsupportedKernelOperationError('stub: no distance-angle chamfer');
      },
      chamferDistAngles: undefined,
      chamferDistAnglesWithHistory: undefined,
    });
    using b = box(10, 10, 10);
    const edges = verticalEdges(b);
    const results = withKernel('no-dist-angle', () => [
      chamferDistAngleShape(b, edges, 1, 30),
      chamfer(b, edges, near),
      chamfer(b, edges, () => near),
      chamfer(b, edges, bySide(near, far)),
    ]);
    for (const result of results) {
      const error = unwrapErr(result);
      expect(error.kind).toBe('UNSUPPORTED');
      expect(error.code).toBe('UNSUPPORTED_CAPABILITY');
    }
    // This kernel has no distance-angle chamfer at all, so the per-edge hint
    // may offer one shared { distance, angle } only on a kernel that has one.
    const perEdge = results.at(-1);
    if (!perEdge) throw new Error('no per-edge result');
    expect(unwrapErr(perEdge).suggestion).toContain(
      'on a kernel that has a distance-angle chamfer'
    );
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
    const straight = (e: Edge) => {
      const { xMin, xMax, yMin, yMax } = getBounds(e);
      return xMax - xMin < 1e-6 || yMax - yMin < 1e-6;
    };
    const result = chamfer(rounded, top, (e) => (straight(e) ? near : { distance: 1, angle: 45 }));
    const error = unwrapErr(result);
    expect(error.code).toBe('CHAMFER_ANGLE_FAILED');
    expect(error.message).toContain('tangent-continuous');
  });

  describe('measured from a given face', () => {
    const corner = (solid: Shape3D) =>
      verticalEdges(solid).find((e) => getBounds(e).xMax < 5 && getBounds(e).yMax < 5);
    /** The face of a chamfered box that slopes across a vertical edge: the bevel. */
    const bevelBounds = (solid: Shape3D) => {
      const sloped = getFaces(solid).filter((f) => {
        const { xMin, xMax, yMin, yMax, zMin, zMax } = getBounds(f);
        return Math.min(xMax - xMin, yMax - yMin, zMax - zMin) > 1e-6;
      });
      expect(sloped).toHaveLength(1);
      return getBounds(sloped[0] as Face);
    };

    it("sets the distance back on the edge's given face", (ctx) => {
      skipIfDiverges(ctx, 'chamferAngle.perEdge');
      using b = box(10, 10, 10);
      const edge = corner(b);
      if (!edge) throw new Error('no corner edge');
      const atX0 = facesOfEdge(b, edge).find((f) => getBounds(f).xMax < 1e-6);
      const atY0 = facesOfEdge(b, edge).find((f) => getBounds(f).yMax < 1e-6);
      if (!atX0 || !atY0) throw new Error('corner faces not found');

      // 1 mm along the reference face, tan 30 along the other.
      using fromX0 = unwrap(chamfer(b, [edge], () => ({ ...near, face: atX0 })));
      expect(bevelBounds(fromX0).yMax).toBeCloseTo(1, 6);
      expect(bevelBounds(fromX0).xMax).toBeCloseTo(Math.tan(Math.PI / 6), 6);
      using fromY0 = unwrap(chamfer(b, [edge], () => ({ ...near, face: atY0 })));
      expect(bevelBounds(fromY0).xMax).toBeCloseTo(1, 6);
      expect(bevelBounds(fromY0).yMax).toBeCloseTo(Math.tan(Math.PI / 6), 6);
      expect(unwrap(measureVolume(fromY0))).toBeCloseTo(1000 - loss(near), 6);
    });

    /** The 20 x 20 x 10 box with rounded vertical edges: its top edges form one tangent chain. */
    function roundedTopChain(solid: Shape3D) {
      const edges = getEdges(solid).filter((e) => getBounds(e).zMin > 9.9);
      const topFace = getFaces(solid).find((f) => getBounds(f).zMin > 10 - 1e-6);
      if (!topFace) throw new Error('no top face');
      const straight = (e: Edge) => {
        const { xMin, xMax, yMin, yMax } = getBounds(e);
        return xMax - xMin < 1e-6 || yMax - yMin < 1e-6;
      };
      const wall = (e: Edge) => facesOfEdge(solid, e).find((f) => !isSameShape(f, topFace));
      return { edges, topFace, straight, wall };
    }

    it('matches a chamfer stated from the other face along a tangent chain', (ctx) => {
      skipIfDiverges(ctx, 'chamferAngle.perEdge');
      using b = box(20, 20, 10);
      using rounded = unwrap(fillet(b, verticalEdges(b), 3));
      const { edges, topFace, straight, wall } = roundedTopChain(rounded);
      expect(edges.filter(straight)).toHaveLength(4);
      expect(edges.filter((e) => !straight(e))).toHaveLength(4);

      using oneSided = unwrap(chamfer(rounded, edges, () => ({ ...near, face: topFace })));
      // 1 mm at 30 degrees from the top sets back tan 30 on the wall, at 60 degrees from it.
      const fromWall = { distance: Math.tan(Math.PI / 6), angle: 60 };
      using restated = unwrap(
        chamfer(rounded, edges, (e) =>
          straight(e) ? { ...near, face: topFace } : { ...fromWall, face: wall(e) }
        )
      );
      const oneSidedVolume = unwrap(measureVolume(oneSided));
      expect(oneSidedVolume).toBeLessThan(unwrap(measureVolume(rounded)));
      expect(unwrap(measureVolume(restated))).toBeCloseTo(oneSidedVolume, 6);
    });

    it('rejects a chain whose edges state different chamfers from opposite faces', (ctx) => {
      skipIfDiverges(ctx, 'chamferAngle.perEdge');
      using b = box(20, 20, 10);
      using rounded = unwrap(fillet(b, verticalEdges(b), 3));
      const { edges, topFace, straight, wall } = roundedTopChain(rounded);
      const error = unwrapErr(
        chamfer(rounded, edges, (e) => ({ ...near, face: straight(e) ? topFace : wall(e) }))
      );
      expect(error.code).toBe('CHAMFER_ANGLE_FAILED');
      expect(error.message).toContain('differ where the faces meet at 90 degrees');
    });

    it('rejects a face that is not one of the two faces its edge joins', () => {
      using b = box(10, 10, 10);
      const edge = corner(b);
      const topFace = getFaces(b).find((f) => getBounds(f).zMin > 10 - 1e-6);
      if (!edge || !topFace) throw new Error('box edge or face not found');
      const error = unwrapErr(chamfer(b, [edge], () => ({ ...near, face: topFace })));
      expect(error.code).toBe('CHAMFER_ANGLE_FACE_NOT_ADJACENT');
      expect(error.metadata?.['edge']).toBe(edge);
      expect(error.metadata?.['face']).toBe(topFace);
    });

    it('returns UNSUPPORTED for a given face on a kernel without per-edge chamfers', () => {
      registerStubKernel('no-per-edge-dist-angle-face', {
        chamferDistAngles: undefined,
        chamferDistAnglesWithHistory: undefined,
      });
      using b = box(10, 10, 10);
      const edges = verticalEdges(b);
      // Every edge takes the same values, so only the faces need the per-edge call.
      const error = unwrapErr(
        withKernel('no-per-edge-dist-angle-face', () =>
          chamfer(b, edges, (e) => ({ ...near, face: facesOfEdge(b, e)[0] }))
        )
      );
      expect(error.code).toBe('UNSUPPORTED_CAPABILITY');
      expect(error.message).toContain('from a given face');
    });
  });
});
