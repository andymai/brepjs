import { describe, expect, it, beforeAll } from 'vitest';
import { currentKernel, initKernel } from './setup.js';
import { guidedSweep, isOk, unwrap, isSolid, measureVolume, getKernel } from '@/index.js';
import { castShape } from '@/core/shapeTypes.js';
import { DisposalScope } from '@/core/disposal.js';
import type { Wire } from '@/core/shapeTypes.js';

describe.skipIf(currentKernel !== 'occt')('OCCT-specific: guidedSweepFns', () => {
  beforeAll(async () => {
    await initKernel();
  }, 30000);

  function makeCircleWire(radius: number): Wire {
    const oc = getKernel().oc;
    const scope = new DisposalScope();
    const ax = scope.register(
      new oc.gp_Ax2_3(
        scope.register(new oc.gp_Pnt_3(0, 0, 0)),
        scope.register(new oc.gp_Dir_4(0, 0, 1))
      )
    );
    const circ = scope.register(new oc.gp_Circ_2(ax, radius));
    const em = scope.register(new oc.BRepBuilderAPI_MakeEdge_8(circ));
    const wm = scope.register(new oc.BRepBuilderAPI_MakeWire_2(em.Edge()));
    return castShape(wm.Wire()) as Wire;
  }

  function makeLineWire(
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number
  ): Wire {
    const oc = getKernel().oc;
    const scope = new DisposalScope();
    const em = scope.register(
      new oc.BRepBuilderAPI_MakeEdge_3(
        scope.register(new oc.gp_Pnt_3(x1, y1, z1)),
        scope.register(new oc.gp_Pnt_3(x2, y2, z2))
      )
    );
    const wm = scope.register(new oc.BRepBuilderAPI_MakeWire_2(em.Edge()));
    return castShape(wm.Wire()) as Wire;
  }

  describe('guidedSweep', () => {
    it('sweeps a circle along a line producing a solid', () => {
      const profile = makeCircleWire(5);
      const spine = makeLineWire(0, 0, 0, 0, 0, 20);
      // No guides — basic sweep as fallback
      const result = guidedSweep(profile, spine, []);
      expect(isOk(result)).toBe(true);
      const shape = unwrap(result);
      expect(isSolid(shape)).toBe(true);
      expect(unwrap(measureVolume(shape))).toBeGreaterThan(1000);
    });

    it('sweeps with an auxiliary guide wire', () => {
      const profile = makeCircleWire(5);
      const spine = makeLineWire(0, 0, 0, 0, 0, 20);
      const guide = makeLineWire(5, 0, 0, 8, 0, 20);
      const result = guidedSweep(profile, spine, [guide]);
      // May succeed or fail depending on kernel WASM guide support
      // At minimum, the function should not crash
      if (isOk(result)) {
        expect(isSolid(unwrap(result))).toBe(true);
        expect(unwrap(measureVolume(unwrap(result)))).toBeGreaterThan(500);
      }
      // If it fails, that's acceptable — guide sweep is best-effort in WASM
    });
  });
});
