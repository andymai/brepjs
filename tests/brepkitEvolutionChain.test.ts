import { describe, expect, it } from 'vitest';
import { chainEvolutionMap, mergeCompoundChildStep } from '@/kernel/brepkit/evolutionOps.js';
import type { KernelShape } from '@/kernel/types.js';

describe('chainEvolutionMap', () => {
  it('keeps one copy of an output that two previous outputs lead to', () => {
    const map = new Map([[1, [10, 11]]]);
    chainEvolutionMap(
      map,
      new Map([
        [10, [20, 21]],
        [11, [20, 21]],
      ]),
      new Set(),
      new Set()
    );
    expect(map.get(1)).toEqual([20, 21]);
  });

  // Engraving a row of glyphs cuts one solid per glyph, and each cut reports
  // the merged shelf faces as modified from every piece: kept as repeats, the
  // entry doubled at every glyph.
  it('stays the size of the last step over a long chain of merging steps', () => {
    const map = new Map([[1, [100, 101]]]);
    for (let step = 1; step <= 30; step++) {
      const prev = 100 * step;
      const next = 100 * (step + 1);
      chainEvolutionMap(
        map,
        new Map([
          [prev, [next, next + 1]],
          [prev + 1, [next, next + 1]],
        ]),
        new Set(),
        new Set()
      );
      // Checked every step, so a repeat fails here instead of doubling on.
      expect(map.get(1)).toEqual([next, next + 1]);
    }
  });

  it("merges a step's generated outputs into an entry without repeats", () => {
    const accum = {
      combinedModified: new Map<number, number[]>(),
      combinedGenerated: new Map([[5, [7]]]),
      combinedDeleted: new Set<number>(),
      inputFaceHashSet: new Set<number>(),
    };
    mergeCompoundChildStep(
      {
        shape: {} as KernelShape,
        evolution: { modified: new Map(), generated: new Map([[5, [7, 8]]]), deleted: new Set() },
      },
      accum
    );
    expect(accum.combinedGenerated.get(5)).toEqual([7, 8]);
  });
});
