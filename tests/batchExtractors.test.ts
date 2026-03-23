import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  loftAll,
  extrudeAll,
  polygon,
  sketchRoundedRectangle,
  castShape,
  translate,
  getPerformanceStats,
  resetPerformanceStats,
  extrude,
  fuse,
  isSolid,
} from '@/index.js';
import type { Wire } from '@/index.js';
import { initOC } from './setup.js';
import { unwrap } from '@/core/result.js';

/** Helper: create a wire rectangle at a given offset. */
function wireRectAt(w: number, h: number, r: number, dx: number, dy: number, dz: number): Wire {
  const wire = castShape(sketchRoundedRectangle(w, h, r).wire.wrapped);
  if (dx === 0 && dy === 0 && dz === 0) return wire as Wire;
  return translate(wire, [dx, dy, dz]) as Wire;
}

describe('Batch extractors', () => {
  beforeAll(async () => {
    await initOC();
  }, 30000);

  beforeEach(() => {
    resetPerformanceStats();
  });

  describe('loftAll', () => {
    it('builds multiple independent lofts', () => {
      const wire1a = wireRectAt(10, 10, 1, 0, 0, 0);
      const wire1b = wireRectAt(8, 8, 1, 0, 0, 5);
      const wire2a = wireRectAt(20, 20, 2, 0, 0, 0);
      const wire2b = wireRectAt(18, 18, 2, 0, 0, 10);

      const results = unwrap(
        loftAll([
          { wires: [wire1a, wire1b], ruled: true },
          { wires: [wire2a, wire2b], ruled: true },
        ])
      );

      expect(results).toHaveLength(2);
      for (const r of results) {
        expect(isSolid(r)).toBe(true);
      }

      const stats = getPerformanceStats();
      expect(stats.loft.count).toBeGreaterThanOrEqual(1);
    });

    it('returns empty array for empty input', () => {
      const results = unwrap(loftAll([]));
      expect(results).toHaveLength(0);
    });
  });

  describe('extrudeAll', () => {
    it('builds multiple independent extrusions', () => {
      const face1 = unwrap(
        polygon([
          [0, 0, 0],
          [10, 0, 0],
          [10, 10, 0],
          [0, 10, 0],
        ])
      );
      const face2 = unwrap(
        polygon([
          [0, 0, 0],
          [20, 0, 0],
          [20, 5, 0],
          [0, 5, 0],
        ])
      );

      const results = unwrap(
        extrudeAll([
          { face: face1, height: 5 },
          { face: face2, height: 10 },
        ])
      );

      expect(results).toHaveLength(2);
      for (const r of results) {
        expect(isSolid(r)).toBe(true);
      }

      const stats = getPerformanceStats();
      // C++ batch path: 1 call for N extrusions; JS fallback: N calls
      expect(stats.extrude.count).toBeGreaterThanOrEqual(1);
    });

    it('supports Vec3 direction', () => {
      const face = unwrap(
        polygon([
          [0, 0, 0],
          [10, 0, 0],
          [10, 10, 0],
          [0, 10, 0],
        ])
      );

      const results = unwrap(extrudeAll([{ face, height: [5, 0, 0] }]));

      expect(results).toHaveLength(1);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length checked
      expect(isSolid(results[0]!)).toBe(true);
    });

    it('returns empty array for empty input', () => {
      const results = unwrap(extrudeAll([]));
      expect(results).toHaveLength(0);
    });
  });

  describe('gridfinity-like performance test', () => {
    it('batch loft builds multiple socket-like cells', () => {
      const cellEntries = [];
      for (let x = 0; x < 3; x++) {
        for (let y = 0; y < 3; y++) {
          const cx = x * 42;
          const cy = y * 42;
          const topWire = wireRectAt(41, 41, 2, cx, cy, 0);
          const botWire = wireRectAt(39, 39, 1, cx, cy, -5);
          cellEntries.push({ wires: [topWire, botWire], ruled: true });
        }
      }

      resetPerformanceStats();
      const results = unwrap(loftAll(cellEntries));
      expect(results).toHaveLength(9);

      const stats = getPerformanceStats();
      expect(stats.loft.totalMs).toBeGreaterThan(0);
    });

    it('perf stats accumulate across boolean + loft + extrude operations', () => {
      resetPerformanceStats();

      // Loft
      const wire1 = wireRectAt(10, 10, 1, 0, 0, 0);
      const wire2 = wireRectAt(8, 8, 1, 0, 0, 5);
      unwrap(loftAll([{ wires: [wire1, wire2], ruled: true }]));

      // Extrude + Boolean
      const face1 = unwrap(
        polygon([
          [0, 0, 0],
          [10, 0, 0],
          [10, 10, 0],
          [0, 10, 0],
        ])
      );
      const face2 = unwrap(
        polygon([
          [0, 0, 0],
          [5, 0, 0],
          [5, 5, 0],
          [0, 5, 0],
        ])
      );
      const box1 = unwrap(extrude(face1, 5));
      const box2 = unwrap(extrude(face2, 10));
      unwrap(fuse(box1, box2));

      const stats = getPerformanceStats();
      expect(stats.loft.count).toBeGreaterThanOrEqual(1);
      // boolean count may be 0 because the clean API fuse() goes through
      // fuseWithHistory which calls OCCT directly, not our instrumented fuse()
      expect(stats.loft.totalMs).toBeGreaterThan(0);
      expect(stats.extrude.count).toBeGreaterThanOrEqual(2);
    });
  });
});
