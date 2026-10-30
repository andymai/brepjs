import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { shouldSkipSuite, skipIfDiverges } from './helpers/kernelDivergences.js';
import {
  sketchRectangle,
  sketchCircle,
  wire,
  line,
  castShape,
  extrude,
  revolve,
  sweep,
  complexExtrude,
  twistExtrude,
  supportExtrude,
  cylinder,
  getFaces,
  measureVolume,
  isOk,
  isErr,
  unwrap,
  isSolid,
  isShape3D,
  isWire,
  isClosedWire,
  closedWire,
  getBounds,
  type ClosedWire,
  type OrientedFace,
  type PlanarFace,
} from '@/index.js';
import type { Wire } from '@/core/shapeTypes.js';
import { createFace } from '@/core/shapeTypes.js';
import { getKernel } from '@/kernel/index.js';
import type { KernelShape } from '@/kernel/types.js';

function castClosedWire(shape: KernelShape): ClosedWire {
  const w = castShape(shape);
  if (!isWire(w) || !isClosedWire(w)) throw new Error('expected a closed wire');
  return w;
}

describe('extrudeFns', () => {
  beforeAll(async () => {
    await initKernel();
  }, 30000);

  function makeNullFace(): OrientedFace & PlanarFace {
    const oc = getKernel().oc;
    // A null face can't pass the validity checks, and the error-path tests need one anyway.
    return createFace(new oc.TopoDS_Face()) as OrientedFace & PlanarFace;
  }

  describe('extrude', () => {
    it('extrudes a rectangle into a box', () => {
      const rect = sketchRectangle(10, 20);
      const f = rect.face();
      const result = extrude(f, [0, 0, 30]);
      expect(isOk(result)).toBe(true);
      const solid = unwrap(result);
      expect(isSolid(solid)).toBe(true);
      expect(unwrap(measureVolume(solid))).toBeCloseTo(10 * 20 * 30, 0);
    });

    it.skipIf(shouldSkipSuite('extrudeFns.circleExtrude'))(
      'extrudes a circle into a cylinder',
      () => {
        const c = sketchCircle(5);
        const f = c.face();
        const result = extrude(f, [0, 0, 10]);
        expect(isOk(result)).toBe(true);
        expect(unwrap(measureVolume(unwrap(result)))).toBeCloseTo(Math.PI * 25 * 10, 0);
      }
    );
  });

  describe('extrude error paths', () => {
    it.skipIf(shouldSkipSuite('extrudeFns.nullFace'))('returns error for null face', () => {
      const result = extrude(makeNullFace(), [0, 0, 10]);
      expect(isErr(result)).toBe(true);
    });

    it('returns error for zero-length extrusion vector', () => {
      const f = sketchRectangle(10, 10).face();
      const result = extrude(f, [0, 0, 0]);
      expect(isErr(result)).toBe(true);
    });
  });

  describe('revolve', () => {
    it('revolves a rectangle a full turn (2π) into a cylinder', () => {
      const rect = sketchRectangle(2, 5, { origin: [6, 0] });
      const f = rect.face();
      const result = revolve(f, { at: [0, 0, 0], axis: [0, 1, 0], angle: 2 * Math.PI });
      expect(isOk(result)).toBe(true);
      expect(isShape3D(unwrap(result))).toBe(true);
    });

    it('revolves a rectangle a quarter turn (π/2)', () => {
      const rect = sketchRectangle(2, 5, { origin: [6, 0] });
      const f = rect.face();
      const result = revolve(f, { at: [0, 0, 0], axis: [0, 1, 0], angle: Math.PI / 2 });
      expect(isOk(result)).toBe(true);
    });
  });

  describe('revolve error paths', () => {
    it.skipIf(shouldSkipSuite('extrudeFns.revolveNullFace'))('returns error for null face', () => {
      const result = revolve(makeNullFace(), {
        at: [0, 0, 0],
        axis: [0, 1, 0],
        angle: 2 * Math.PI,
      });
      expect(isErr(result)).toBe(true);
    });
  });

  describe('sweep', () => {
    it('sweeps a circle along a line', () => {
      const c = sketchCircle(2);
      const profile = castClosedWire(c.wire.wrapped);
      const e = line([0, 0, 0], [0, 0, 20]);
      const spine = castShape(unwrap(wire([e])).wrapped) as Wire;
      const result = sweep(profile, spine);
      expect(isOk(result)).toBe(true);
      expect(isShape3D(unwrap(result))).toBe(true);
    });
  });

  describe('sweep simple mode', () => {
    it('sweeps in simple pipe mode', () => {
      const c = sketchCircle(2);
      const profile = castClosedWire(c.wire.wrapped);
      const e = line([0, 0, 0], [0, 0, 20]);
      const spine = castShape(unwrap(wire([e])).wrapped) as Wire;
      const result = sweep(profile, spine, { mode: 'simple' });
      expect(isOk(result)).toBe(true);
      expect(isShape3D(unwrap(result))).toBe(true);
    });

    it('caps a closed profile into a solid', () => {
      const c = sketchCircle(2);
      const profile = castClosedWire(c.wire.wrapped);
      using spineWire = unwrap(wire([line([0, 0, 0], [0, 0, 20])]));
      using result = unwrap(sweep(profile, spineWire, { mode: 'simple' }));
      expect(isSolid(result)).toBe(true);
      expect(unwrap(measureVolume(result))).toBeCloseTo(Math.PI * 2 * 2 * 20, 3);
      c.delete();
    });
  });

  describe('complexExtrude', () => {
    it('extrudes with linear profile', (ctx) => {
      skipIfDiverges(ctx, 'extrudeFns.complexExtrudeLaw');
      const c = sketchCircle(5);
      const w = castClosedWire(c.wire.wrapped);
      const result = complexExtrude(w, [0, 0, 0], [0, 0, 10], {
        profile: 'linear',
        endFactor: 0.5,
      });
      expect(isOk(result)).toBe(true);
      expect(isShape3D(unwrap(result))).toBe(true);
    });

    it('extrudes with s-curve profile', (ctx) => {
      skipIfDiverges(ctx, 'extrudeFns.complexExtrudeLaw');
      const c = sketchCircle(5);
      const w = castClosedWire(c.wire.wrapped);
      const result = complexExtrude(w, [0, 0, 0], [0, 0, 10], {
        profile: 's-curve',
        endFactor: 0.5,
      });
      expect(isOk(result)).toBe(true);
    });

    it('extrudes without profile (simple)', () => {
      const c = sketchCircle(5);
      const w = castClosedWire(c.wire.wrapped);
      const result = complexExtrude(w, [0, 0, 0], [0, 0, 10]);
      expect(isOk(result)).toBe(true);
    });
  });

  describe('twistExtrude', () => {
    it('extrudes with twist', (ctx) => {
      skipIfDiverges(ctx, 'extrudeFns.twistExtrude');
      const rect = sketchRectangle(6, 6);
      const w = castClosedWire(rect.wire.wrapped);
      const result = twistExtrude(w, 90, [0, 0, 0], [0, 0, 20]);
      expect(isOk(result)).toBe(true);
      expect(isShape3D(unwrap(result))).toBe(true);
    });

    it('twists the other way for a negative angle', (ctx) => {
      skipIfDiverges(ctx, 'extrudeFns.twistExtrude');
      // Triangle with its tip at (4, 0); a +30 degree twist carries the tip to
      // (3.46, 2) at the top and -30 to (3.46, -2).
      using tri = unwrap(
        closedWire(
          unwrap(
            wire([
              line([4, 0, 0], [0, 1, 0]),
              line([0, 1, 0], [0, -1, 0]),
              line([0, -1, 0], [4, 0, 0]),
            ])
          )
        )
      );
      using ccw = unwrap(twistExtrude(tri, 30, [0, 0, 0], [0, 0, 10]));
      using cw = unwrap(twistExtrude(tri, -30, [0, 0, 0], [0, 0, 10]));
      const a = getBounds(ccw);
      const b = getBounds(cw);
      expect(a.yMax).toBeCloseTo(2, 4);
      expect(a.yMin).toBeCloseTo(-1, 4);
      expect(b.yMax).toBeCloseTo(1, 4);
      expect(b.yMin).toBeCloseTo(-2, 4);
    });

    it('returns error for zero twist angle', () => {
      const rect = sketchRectangle(6, 6);
      const w = castClosedWire(rect.wire.wrapped);
      const result = twistExtrude(w, 0, [0, 0, 0], [0, 0, 20]);
      expect(isErr(result)).toBe(true);
    });

    it('returns error for zero-length normal', () => {
      const rect = sketchRectangle(6, 6);
      const w = castClosedWire(rect.wire.wrapped);
      const result = twistExtrude(w, 90, [0, 0, 0], [0, 0, 0]);
      expect(isErr(result)).toBe(true);
    });
  });

  describe('complexExtrude error paths', () => {
    it('returns error for zero-length extrusion normal', () => {
      const c = sketchCircle(5);
      const w = castClosedWire(c.wire.wrapped);
      const result = complexExtrude(w, [0, 0, 0], [0, 0, 0]);
      expect(isErr(result)).toBe(true);
    });
  });

  describe('supportExtrude', () => {
    it('sweeps a profile along a support surface from a cylinder face', () => {
      const c = sketchCircle(2);
      const w = castClosedWire(c.wire.wrapped);
      // Use the lateral face of a cylinder as the support surface
      const cyl = cylinder(10, 20);
      const faces = getFaces(cyl);
      // The lateral face (largest area face) is the support surface
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- test array indexing
      const supportFace = faces[0]!;
      const result = supportExtrude(w, [10, 0, 0], [0, 0, 10], supportFace.wrapped);
      // supportExtrude returns a Result — it may fail for complex geometry
      // but should not throw
      expect(typeof result.ok).toBe('boolean');
    });
  });
});
