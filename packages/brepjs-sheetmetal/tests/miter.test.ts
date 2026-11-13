import { describe, expect, it, beforeAll } from 'vitest';
import { DisposalScope, getBounds, isValid, measureVolume, unwrap } from 'brepjs';
import { author, miterCorner } from '../src/api.js';
import type { FlangeSide } from '../src/authorFns.js';
import type { SheetMetalPart } from '../src/types.js';
import { initKernel } from '../../../tests/setup.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

const T = 1.5;
const rule = { innerRadius: 2, kFactor: 0.44 };
const LENGTH = 60;
const WIDTH = 40;
const flange = (id: string, side: FlangeSide) => ({ id, side, length: 25, angleDeg: 90, rule });

/** The folded solid of a part, registered so that the scope frees it when the test ends. */
function solidOf(scope: DisposalScope, part: SheetMetalPart) {
  if (part.solid === undefined) throw new Error('the part has no folded solid');
  return scope.register(part.solid);
}

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
        using scope = new DisposalScope();
        const authored = unwrap(
          author({
            thickness: T,
            base: { length: LENGTH, width: WIDTH },
            flanges: [flange('a', first), flange('b', second)],
          })
        );
        const before = solidOf(scope, authored);
        const after = solidOf(scope, unwrap(miterCorner(authored, 'a', 'b', 2.5)));

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
    using scope = new DisposalScope();
    let part = unwrap(
      author({
        thickness: T,
        base: { length: LENGTH, width: WIDTH },
        flanges: [flange('east', 'xmax'), flange('north', 'ymax'), flange('west', 'xmin'), flange('south', 'ymin')],
      })
    );
    const before = solidOf(scope, part);

    let after = before;
    for (const [a, b] of [
      ['east', 'north'],
      ['north', 'west'],
      ['west', 'south'],
      ['south', 'east'],
    ] as const) {
      part = unwrap(miterCorner(part, a, b, 2.5));
      after = solidOf(scope, part);
    }
    expect(isValid(after)).toBe(true);
    expect(unwrap(measureVolume(after))).toBeGreaterThan(0.95 * unwrap(measureVolume(before)));
  });
});
