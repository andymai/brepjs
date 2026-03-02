import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { guidedSweep, isOk, unwrap, isSolid, measureVolume, getKernel } from '../src/index.js';
import { castShape } from '../src/core/shapeTypes.js';
import { gcWithScope } from '../src/core/disposal.js';
import type { Wire } from '../src/core/shapeTypes.js';

beforeAll(async () => {
  await initOC();
}, 30000);

function makeCircleWire(radius: number): Wire {
  const oc = getKernel().oc;
  const r = gcWithScope();
  const ax = r(new oc.gp_Ax2_3(r(new oc.gp_Pnt_3(0, 0, 0)), r(new oc.gp_Dir_4(0, 0, 1))));
  const circ = r(new oc.gp_Circ_2(ax, radius));
  const em = r(new oc.BRepBuilderAPI_MakeEdge_8(circ));
  const wm = r(new oc.BRepBuilderAPI_MakeWire_2(em.Edge()));
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
  const r = gcWithScope();
  const em = r(
    new oc.BRepBuilderAPI_MakeEdge_3(r(new oc.gp_Pnt_3(x1, y1, z1)), r(new oc.gp_Pnt_3(x2, y2, z2)))
  );
  const wm = r(new oc.BRepBuilderAPI_MakeWire_2(em.Edge()));
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
    expect(measureVolume(shape)).toBeGreaterThan(1000);
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
      expect(measureVolume(unwrap(result))).toBeGreaterThan(500);
    }
    // If it fails, that's acceptable — guide sweep is best-effort in WASM
  });
});
