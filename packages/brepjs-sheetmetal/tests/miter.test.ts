import { describe, expect, it, beforeAll } from 'vitest';
import { getBounds, isErr, isValid, measureVolume, unwrap } from 'brepjs';
import { author, miterCorner } from '../src/api.js';
import type { FlangeSide } from '../src/authorFns.js';
import { initKernel } from '../../../tests/setup.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

const T = 1.5;
const rule = { innerRadius: 2, kFactor: 0.44 };
const LENGTH = 60;
const WIDTH = 40;
const flange = (id: string, side: FlangeSide) => ({ id, side, length: 25, angleDeg: 90, rule });

describe('miterCorner: the 3D cut', () => {
  const corners: [FlangeSide, FlangeSide][] = [
    ['xmax', 'ymax'],
    ['ymax', 'xmin'],
    ['xmin', 'ymin'],
    ['ymin', 'xmax'],
  ];

  for (const [a, b] of corners) {
    for (const [first, second] of [
      [a, b],
      [b, a],
    ] as const) {
      it(`trims only the flange ends at the ${first}/${second} corner`, () => {
        const authored = author({
          thickness: T,
          base: { length: LENGTH, width: WIDTH },
          flanges: [flange('a', first), flange('b', second)],
        });
        expect(authored.ok).toBe(true);
        if (isErr(authored)) return;
        const before = authored.value.solid;
        expect(before).toBeDefined();
        if (before === undefined) return;

        const mitered = miterCorner(authored.value, 'a', 'b', 2.5);
        expect(mitered.ok).toBe(true);
        if (isErr(mitered)) return;
        const after = mitered.value.solid;
        expect(after).toBeDefined();
        if (after === undefined) return;

        expect(isValid(after)).toBe(true);
        // The cut takes a small prism from the end of each flange, not a part of the base.
        const lost = unwrap(measureVolume(before)) - unwrap(measureVolume(after));
        expect(lost).toBeGreaterThan(0);
        expect(lost).toBeLessThan(0.02 * unwrap(measureVolume(before)));
        // The base flat and both flanges keep their full extent.
        const was = getBounds(before);
        const now = getBounds(after);
        for (const key of ['xMin', 'xMax', 'yMin', 'yMax', 'zMin', 'zMax'] as const) {
          expect(now[key]).toBeCloseTo(was[key], 6);
        }
      });
    }
  }

  it('miters the four corners of a tray and keeps the tray', () => {
    const authored = author({
      thickness: T,
      base: { length: LENGTH, width: WIDTH },
      flanges: [flange('east', 'xmax'), flange('north', 'ymax'), flange('west', 'xmin'), flange('south', 'ymin')],
    });
    expect(authored.ok).toBe(true);
    if (isErr(authored)) return;
    const before = authored.value.solid;
    expect(before).toBeDefined();
    if (before === undefined) return;

    let part = authored.value;
    for (const [a, b] of [
      ['east', 'north'],
      ['north', 'west'],
      ['west', 'south'],
      ['south', 'east'],
    ] as const) {
      const mitered = miterCorner(part, a, b, 2.5);
      expect(mitered.ok).toBe(true);
      if (isErr(mitered)) return;
      part = mitered.value;
    }
    const after = part.solid;
    expect(after).toBeDefined();
    if (after === undefined) return;
    expect(isValid(after)).toBe(true);
    expect(unwrap(measureVolume(after))).toBeGreaterThan(0.95 * unwrap(measureVolume(before)));
  });
});
