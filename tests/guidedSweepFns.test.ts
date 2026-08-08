import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { shouldSkipSuite } from './helpers/kernelDivergences.js';
import {
  guidedSweep,
  isOk,
  unwrap,
  isSolid,
  measureVolume,
  circle,
  line,
  wire,
  getBounds,
} from '@/index.js';
import type { Wire } from '@/core/shapeTypes.js';

describe.skipIf(shouldSkipSuite('guidedSweepFns'))('guidedSweepFns', () => {
  beforeAll(async () => {
    await initKernel();
  }, 30000);

  function circleWire(radius: number): Wire {
    using edge = circle(radius);
    return unwrap(wire([edge]));
  }

  function lineWire(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): Wire {
    using edge = line([x1, y1, z1], [x2, y2, z2]);
    return unwrap(wire([edge]));
  }

  describe('guidedSweep', () => {
    it('sweeps a circle along a line producing a solid', () => {
      using profile = circleWire(5);
      using spine = lineWire(0, 0, 0, 0, 0, 20);
      const result = guidedSweep(profile, spine, []);
      expect(isOk(result)).toBe(true);
      using shape = unwrap(result);
      expect(isSolid(shape)).toBe(true);
      expect(unwrap(measureVolume(shape))).toBeGreaterThan(1000);
    });

    // An auxiliary guide ORIENTS the section (GeomFill_GuideTrihedronPlan); it
    // does not widen or scale it. A circular profile is rotationally symmetric,
    // so rotating it is invisible — volume AND bounding box are identical with
    // and without a guide. Use an asymmetric profile and a guide that swings a
    // quarter turn around the spine, then watch the axis the section rotates
    // INTO. Without the guide reaching the kernel, that extent cannot move.
    it('rotates an asymmetric section to follow the guide', () => {
      const rectWire = (halfX: number, halfY: number): Wire => {
        const corners: [number, number, number][] = [
          [-halfX, -halfY, 0],
          [halfX, -halfY, 0],
          [halfX, halfY, 0],
          [-halfX, halfY, 0],
        ];
        const edges = corners.map((c, i) =>
          line(c, corners[(i + 1) % corners.length] as [number, number, number])
        );
        try {
          return unwrap(wire(edges));
        } finally {
          edges.forEach((e) => {
            e.delete();
          });
        }
      };

      const build = (guides: Wire[]) => {
        using profile = rectWire(6, 1);
        using spine = lineWire(0, 0, 0, 0, 0, 20);
        const result = guidedSweep(profile, spine, guides);
        expect(isOk(result)).toBe(true);
        using shape = unwrap(result);
        expect(isSolid(shape)).toBe(true);
        const b = getBounds(shape);
        return { xMax: b.xMax, yMax: b.yMax };
      };

      const plain = build([]);
      // Swings from +X to +Y over the length of the spine, asking the section
      // for a quarter turn.
      using guide = lineWire(10, 0, 0, 0, 10, 20);
      const guided = build([guide]);

      // Unguided: the 12x2 section stays put, so it is wide in X and thin in Y.
      expect(plain.xMax).toBeCloseTo(6, 3);
      expect(plain.yMax).toBeCloseTo(1, 3);

      // Guided: the section turns toward +Y, so the solid must reach far more
      // in Y than the 1 it would if the guide were dropped.
      expect(guided.yMax).toBeGreaterThan(3);
    });
  });
});
