import { describe, expect, it } from 'vitest';
import { type PackedCharts, decodeCharts } from '../src/freeformFns.js';

describe('decodeCharts', () => {
  it('reads each packed array once and splits it per run and chart', () => {
    const arrays = {
      run_offsets: Uint32Array.from([0, 2, 4, 6]),
      run_points: Float64Array.from({ length: 18 }, (_, i) => i),
      chart_bodies: Uint32Array.from([0, 1]),
      side_offsets: Uint32Array.from([0, 3, 6]),
      sides: Int32Array.from([0, 1, 2, -1, -3, -2]),
      surface_offsets: Uint32Array.from([0, 16, 32]),
      surface_poles: Float64Array.from({ length: 96 }, (_, i) => i),
      fit_errors: Float64Array.from([0.1, 0.2]),
    };
    // Like the wasm getters, every read copies the whole array.
    const reads: Record<string, number> = {};
    const packed = {} as PackedCharts;
    for (const [key, value] of Object.entries(arrays)) {
      Object.defineProperty(packed, key, {
        get: () => {
          reads[key] = (reads[key] ?? 0) + 1;
          return structuredClone(value);
        },
      });
    }

    const { runs, charts } = decodeCharts(packed);

    expect(reads).toEqual(Object.fromEntries(Object.keys(arrays).map((k) => [k, 1])));
    expect(runs.map((r) => r.points)).toEqual([
      [
        [0, 1, 2],
        [3, 4, 5],
      ],
      [
        [6, 7, 8],
        [9, 10, 11],
      ],
      [
        [12, 13, 14],
        [15, 16, 17],
      ],
    ]);
    expect(charts.map((c) => c.body)).toEqual([0, 1]);
    expect(charts[1]?.sides).toEqual([
      { run: 0, reversed: true },
      { run: 2, reversed: true },
      { run: 1, reversed: true },
    ]);
    expect(charts[1]?.poles).toHaveLength(16);
    expect(charts[1]?.poles[0]).toEqual([48, 49, 50]);
    expect(charts.map((c) => c.fitError)).toEqual([0.1, 0.2]);
  });
});
