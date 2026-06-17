import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import { isErr } from 'brepjs';
import { author, unfold } from '../src/api.js';
import { flatPatternToPolylines } from '../src/polygonFns.js';
import type { BendRule } from '../src/types.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

const rule: BendRule = { innerRadius: 2, kFactor: 0.44 };

describe('flatPatternToPolylines', () => {
  it('reduces an unfolded L-bracket to outline + bend lines', () => {
    const part = author({
      thickness: 1.5,
      base: { length: 60, width: 40 },
      flanges: [
        { id: 'side', length: 25, angleDeg: 90, side: 'xmax', rule },
        { id: 'front', length: 25, angleDeg: 90, side: 'ymax', rule },
      ],
    });
    if (isErr(part)) throw new Error(part.error.message);
    const unfolded = unfold(part.value);
    if (isErr(unfolded)) throw new Error(unfolded.error.message);

    const poly = flatPatternToPolylines(unfolded.value.pattern);

    // The developed outline is a closed loop with at least a few [x, y] vertices.
    expect(poly.outline.length).toBeGreaterThanOrEqual(4);
    expect(poly.outline.every((p) => p.length === 2)).toBe(true);

    // Two flanges → two bend lines, each a nonzero-length segment with a fold dir.
    expect(poly.bendLines).toHaveLength(2);
    for (const bend of poly.bendLines) {
      expect(bend.from).toHaveLength(2);
      expect(bend.to).toHaveLength(2);
      expect(['up', 'down']).toContain(bend.direction);
      expect(Math.hypot(bend.to[0] - bend.from[0], bend.to[1] - bend.from[1])).toBeGreaterThan(0);
    }
  });
});
