/**
 * IR drift gate — wall, slab, column, and beam geometry expressed as CSG IR
 * profile+extrude must match the parametric `*ToSolid` spec path within
 * tolerance. The spec path stays authoritative for parametric IFC; the IR
 * path serves the viewport and dedup, so divergence here is a contract break.
 *
 * Drift metric: with V(fuse(a, b)) ~= V(a) ~= V(b), the two solids coincide
 * up to tolerance (the fuse adds no volume only when each contains the
 * other). Robust against empty-boolean edge cases that a cut-based
 * symmetric-difference check would hit on identical inputs.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import { measureVolume, fuse, unwrap, isOk, csg } from 'brepjs';
import type { AnyShape, Dimension, Shape3D } from 'brepjs';
import { wallToSolid } from '../src/elementFns/wallFns.js';
import { slabToSolid } from '../src/elementFns/slabFns.js';
import { columnToSolid } from '../src/elementFns/columnFns.js';
import { beamToSolid } from '../src/elementFns/beamFns.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

function vol(s: AnyShape<Dimension>): number {
  return unwrap(measureVolume(s));
}

/** Assert `ir` and `bim` describe the same solid within `relTol`. */
function expectCoincident(ir: AnyShape<Dimension>, bim: Shape3D, relTol: number): void {
  const vIr = vol(ir);
  const vBim = vol(bim);
  expect(Math.abs(vIr - vBim) / vBim).toBeLessThan(relTol);
  const fused = fuse(bim, ir as Shape3D);
  expect(isOk(fused)).toBe(true);
  using union = unwrap(fused);
  expect(Math.abs(vol(union) - vBim) / vBim).toBeLessThan(relTol);
}

const PLACEMENT = {
  origin: [0, 0, 0] as [number, number, number],
  axisX: [1, 0, 0] as [number, number, number],
  axisZ: [0, 0, 1] as [number, number, number],
  materialName: 'Concrete',
};

/** Corner-origin rectangle contour in the XY plane. */
function cornerRect(w: number, h: number) {
  return csg.contour(
    [0, 0],
    [csg.lineTo([w, 0]), csg.lineTo([w, h]), csg.lineTo([0, h])]
  );
}

describe('IR drift gate: profile+extrude vs *ToSolid', () => {
  it('wall: corner rect extruded up coincides with wallToSolid', () => {
    using ev = new csg.Evaluator();
    using wall = unwrap(wallToSolid({ length: 3000, height: 2700, thickness: 200, ...PLACEMENT }));
    const ir = unwrap(ev.evaluate(csg.extrude(csg.profile(cornerRect(3000, 200)), [0, 0, 2700])));
    expectCoincident(ir, wall, 1e-6);
  });

  it('slab: footprint extruded by thickness coincides with slabToSolid', () => {
    using ev = new csg.Evaluator();
    using slab = unwrap(slabToSolid({ length: 4000, width: 2500, thickness: 250, ...PLACEMENT }));
    const ir = unwrap(ev.evaluate(csg.extrude(csg.profile(cornerRect(4000, 2500)), [0, 0, 250])));
    expectCoincident(ir, slab, 1e-6);
  });

  it('column (RECTANGULAR): centered profile extruded up coincides with columnToSolid', () => {
    using ev = new csg.Evaluator();
    using column = unwrap(
      columnToSolid({
        height: 3000,
        profile: { kind: 'RECTANGULAR', width: 300, height: 450 },
        ...PLACEMENT,
      })
    );
    const ir = unwrap(ev.evaluate(csg.extrude(csg.rectangularProfile(300, 450), [0, 0, 3000])));
    expectCoincident(ir, column, 1e-6);
  });

  it('column (CIRCULAR): true-arc IR within faceting tolerance of the 32-gon spec path', () => {
    using ev = new csg.Evaluator();
    using column = unwrap(
      columnToSolid({ height: 3000, profile: { kind: 'CIRCULAR', radius: 200 }, ...PLACEMENT })
    );
    const ir = unwrap(ev.evaluate(csg.extrude(csg.circularProfile(200), [0, 0, 3000])));
    // The spec path facets circles into 32 segments (~0.64% area deficit);
    // the IR carries true arcs, so allow the known representational gap.
    expectCoincident(ir, column, 0.01);
  });

  it('column (RECTANGLE_HOLLOW): holes coincide with the extended spec path', () => {
    using ev = new csg.Evaluator();
    using column = unwrap(
      columnToSolid({
        height: 2000,
        profile: { kind: 'RECTANGLE_HOLLOW', xDim: 300, yDim: 200, wallThickness: 20 },
        ...PLACEMENT,
      })
    );
    const ir = unwrap(
      ev.evaluate(
        csg.extrude(
          csg.rectangleHollowProfile({ xDim: 300, yDim: 200, wallThickness: 20 }),
          [0, 0, 2000]
        )
      )
    );
    expectCoincident(ir, column, 1e-6);
  });

  it('beam (ASYMMETRIC_I): extended profile coincides along the length', () => {
    using ev = new csg.Evaluator();
    const profile = {
      kind: 'ASYMMETRIC_I' as const,
      overallDepth: 400,
      webThickness: 10,
      topFlangeWidth: 180,
      topFlangeThickness: 14,
      bottomFlangeWidth: 260,
      bottomFlangeThickness: 18,
    };
    using beam = unwrap(beamToSolid({ length: 5000, profile, materialName: 'Steel', origin: [0, 0, 0], axisX: [1, 0, 0], axisZ: [0, 0, 1] }));
    // Mirror the spec convention in IR: extrude along +Z, then rotate +90
    // about Y so the beam length runs along +X.
    const ir = unwrap(
      ev.evaluate(
        csg.rotate(csg.extrude(csg.asymmetricIProfile(profile), [0, 0, 5000]), 90, {
          axis: [0, 1, 0],
        })
      )
    );
    expectCoincident(ir, beam, 1e-6);
  });
});
