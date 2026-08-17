/**
 * Canned bim-profile builders — independent closed-form area oracle per
 * profile kind, hash determinism, serialization, and extrude composition.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel, currentKernel } from '../setup.js';
import {
  rectangularProfile,
  circularProfile,
  iBeamProfile,
  asymmetricIProfile,
  lShapeProfile,
  tShapeProfile,
  uShapeProfile,
  zShapeProfile,
  cShapeProfile,
  ellipseProfile,
  trapeziumProfile,
  rectangleHollowProfile,
  circleHollowProfile,
  arbitraryClosedProfile,
  arbitraryProfileWithVoids,
  extrude,
  toJSON,
  fromJSON,
  Evaluator,
  type IRNode,
} from '@/csg/index.js';
import { isOk, unwrap, measureArea, measureVolume } from '@/index.js';
import type { AnyShape, Dimension } from '@/core/shapeTypes.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

function area(s: AnyShape<Dimension>): number {
  return unwrap(measureArea(s));
}

const itBrep = it.skipIf(currentKernel === 'manifold');
// Tall ellipses (semiAxis2 > semiAxis1) need edge relocation (occt-only).
const itOcct = it.skipIf(!currentKernel.startsWith('occt'));

interface Golden {
  readonly name: string;
  readonly node: () => IRNode;
  readonly area: number;
}

const GOLDENS: readonly Golden[] = [
  { name: 'RECTANGULAR', node: () => rectangularProfile(40, 30), area: 1200 },
  { name: 'CIRCULAR', node: () => circularProfile(15), area: Math.PI * 225 },
  {
    name: 'I_BEAM',
    node: () =>
      iBeamProfile({ overallWidth: 100, overallDepth: 100, flangeThickness: 10, webThickness: 6 }),
    area: 2 * 100 * 10 + 6 * (100 - 20),
  },
  {
    name: 'ASYMMETRIC_I',
    node: () =>
      asymmetricIProfile({
        overallDepth: 100,
        webThickness: 6,
        topFlangeWidth: 80,
        topFlangeThickness: 8,
        bottomFlangeWidth: 120,
        bottomFlangeThickness: 12,
      }),
    area: 120 * 12 + 80 * 8 + 6 * (100 - 12 - 8),
  },
  {
    name: 'L_SHAPE',
    node: () => lShapeProfile({ depth: 80, width: 60, legThickness: 8 }),
    area: 8 * (60 + 80 - 8),
  },
  {
    name: 'T_SHAPE',
    node: () => tShapeProfile({ depth: 90, flangeWidth: 70, webThickness: 8, flangeThickness: 10 }),
    area: 70 * 10 + 8 * (90 - 10),
  },
  {
    name: 'U_SHAPE',
    node: () => uShapeProfile({ depth: 100, flangeWidth: 50, webThickness: 6, flangeThickness: 8 }),
    area: 6 * (100 - 16) + 2 * 50 * 8,
  },
  {
    name: 'Z_SHAPE',
    node: () => zShapeProfile({ depth: 100, flangeWidth: 50, webThickness: 6, flangeThickness: 8 }),
    area: 6 * 100 + 2 * (50 - 6) * 8,
  },
  {
    name: 'C_SHAPE',
    node: () => cShapeProfile({ depth: 100, width: 50, wallThickness: 5, girth: 20 }),
    area: 2 * 50 * 5 + 5 * (100 - 10) + 2 * 5 * (20 - 5),
  },
  { name: 'ELLIPSE', node: () => ellipseProfile(30, 20), area: Math.PI * 600 },
  {
    name: 'TRAPEZIUM',
    node: () => trapeziumProfile({ bottomXDim: 60, topXDim: 40, yDim: 30, topXOffset: 10 }),
    area: ((60 + 40) / 2) * 30,
  },
  {
    name: 'RECTANGLE_HOLLOW',
    node: () => rectangleHollowProfile({ xDim: 60, yDim: 40, wallThickness: 5 }),
    area: 60 * 40 - 50 * 30,
  },
  {
    name: 'CIRCLE_HOLLOW',
    node: () => circleHollowProfile({ radius: 20, wallThickness: 5 }),
    area: Math.PI * (400 - 225),
  },
  {
    name: 'ARBITRARY_CLOSED',
    node: () =>
      arbitraryClosedProfile([
        [0, 0],
        [40, 0],
        [0, 30],
      ]),
    area: 600,
  },
  {
    name: 'ARBITRARY_WITH_VOIDS',
    node: () =>
      arbitraryProfileWithVoids(
        [
          [0, 0],
          [60, 0],
          [60, 60],
          [0, 60],
        ],
        [
          [
            [20, 20],
            [40, 20],
            [40, 40],
            [20, 40],
          ],
        ]
      ),
    area: 3600 - 400,
  },
];

describe('canned bim profiles', () => {
  for (const g of GOLDENS) {
    itBrep(`${g.name}: exact area`, () => {
      using ev = new Evaluator();
      const r = ev.evaluate(g.node());
      expect(isOk(r)).toBe(true);
      expect(area(unwrap(r))).toBeCloseTo(g.area, 1);
    });
  }

  itOcct('tall ELLIPSE (semiAxis2 > semiAxis1) via edge relocation', () => {
    using ev = new Evaluator();
    const r = ev.evaluate(ellipseProfile(20, 30));
    expect(isOk(r)).toBe(true);
    expect(area(unwrap(r))).toBeCloseTo(Math.PI * 600, 1);
  });

  it('builders are deterministic: identical params share one content address', () => {
    for (const g of GOLDENS) {
      expect(g.node().structuralHash).toBe(g.node().structuralHash);
    }
  });

  it('serialize round-trip preserves the structural hash for every kind', () => {
    for (const g of GOLDENS) {
      const node = g.node();
      const back = fromJSON(toJSON(node));
      expect(isOk(back)).toBe(true);
      expect(unwrap(back).structuralHash).toBe(node.structuralHash);
    }
  });

  itBrep('composes: extruded I-beam has exact volume', () => {
    using ev = new Evaluator();
    const beam = extrude(
      iBeamProfile({ overallWidth: 100, overallDepth: 100, flangeThickness: 10, webThickness: 6 }),
      [0, 0, 500]
    );
    const r = ev.evaluate(beam);
    expect(isOk(r)).toBe(true);
    expect(unwrap(measureVolume(unwrap(r)))).toBeCloseTo(2480 * 500, 0);
  });
});
