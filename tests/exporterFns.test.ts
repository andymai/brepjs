import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { skipIfDiverges } from './helpers/kernelDivergences.js';
import { INCH_UNIT, MILLIMETER_UNIT, largestStepCoordinate } from './helpers/stepText.js';
import {
  box,
  sphere,
  castShape,
  exportAssemblySTEP,
  getBounds,
  getKernel,
  getSolids,
  importSTEP,
  isOk,
  measureVolume,
  translate,
  unwrap,
} from '@/index.js';
import type { Shape3D } from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('exportAssemblySTEP', () => {
  describe('exportAssemblySTEP', () => {
    it('exports a single shape', () => {
      const b = castShape(box(10, 10, 10).wrapped);
      const result = exportAssemblySTEP([{ shape: b, name: 'box' }]);
      expect(isOk(result)).toBe(true);
      const blob = unwrap(result);
      expect(blob.size).toBeGreaterThan(0);
    });

    it('exports multiple shapes', () => {
      const b = castShape(box(10, 10, 10).wrapped);
      const s = castShape(sphere(5).wrapped);
      const result = exportAssemblySTEP([
        { shape: b, name: 'box' },
        { shape: s, name: 'sphere' },
      ]);
      expect(isOk(result)).toBe(true);
      const blob = unwrap(result);
      expect(blob.size).toBeGreaterThan(0);
    });

    it('writes every part into one file that imports back at its placement', async () => {
      using plate = box(20, 10, 2);
      using postShape = box(2, 2, 8);
      using post = translate(postShape, [18, 8, 2]);
      using lidShape = box(20, 10, 2);
      using lid = translate(lidShape, [0, 0, 10]);
      const step = await unwrap(
        exportAssemblySTEP([
          { shape: plate, name: 'plate', color: '#3366cc' },
          { shape: post, name: 'post', color: '#999999' },
          { shape: lid, name: 'lid', color: '#cc6633' },
        ])
      ).text();
      expect(step.match(/END-ISO-10303-21;/g)).toHaveLength(1);

      using imported = unwrap(await importSTEP(new Blob([step])));
      expect(unwrap(measureVolume(imported as Shape3D))).toBeCloseTo(400 + 32 + 400, 3);
      const placed = getSolids(imported)
        .map((solid) => getBounds(solid))
        .sort((a, b) => a.zMin - b.zMin);
      expect(placed.map((b) => [b.xMin, b.yMin, b.zMin])).toEqual([
        [expect.closeTo(0, 3), expect.closeTo(0, 3), expect.closeTo(0, 3)],
        [expect.closeTo(18, 3), expect.closeTo(8, 3), expect.closeTo(2, 3)],
        [expect.closeTo(0, 3), expect.closeTo(0, 3), expect.closeTo(10, 3)],
      ]);
    });

    it('exports with unit option', () => {
      const b = castShape(box(10, 10, 10).wrapped);
      const result = exportAssemblySTEP([{ shape: b, name: 'box' }], { unit: 'MM' });
      expect(isOk(result)).toBe(true);
    });

    // `unit` is the unit written; `modelUnit` (default: `unit`) is the unit the
    // shapes' numbers are in, so a 10 mm cube's far corner reads 10 unless they differ.
    it('writes the unit option, scaling only from a different model unit', async (ctx) => {
      skipIfDiverges(ctx, 'exporterFns.assemblyUnits');
      using b = box(10, 10, 10);
      const parts = [{ shape: b, name: 'box' }];
      const relabeled = await unwrap(exportAssemblySTEP(parts, { unit: 'INCH' })).text();
      expect(relabeled).toContain(INCH_UNIT);
      expect(largestStepCoordinate(relabeled)).toBeCloseTo(10, 9);

      const converted = await unwrap(
        exportAssemblySTEP(parts, { unit: 'INCH', modelUnit: 'MM' })
      ).text();
      expect(converted).toContain(INCH_UNIT);
      expect(largestStepCoordinate(converted)).toBeCloseTo(10 / 25.4, 9);

      const fromCm = await unwrap(
        exportAssemblySTEP(parts, { unit: 'MM', modelUnit: 'CM' })
      ).text();
      expect(fromCm).toContain(MILLIMETER_UNIT);
      expect(largestStepCoordinate(fromCm)).toBeCloseTo(100, 9);
    });

    it('converts a document whose source shapes were released before writing', (ctx) => {
      skipIfDiverges(ctx, 'exporterFns.assemblyUnits');
      const kernel = getKernel();
      const doc = (() => {
        using b = box(10, 10, 10);
        return kernel.createXCAFDocument([{ shape: b.wrapped, name: 'box' }]);
      })();
      // A model unit other than millimeters rebuilds the parts scaled, after the
      // caller has released its own handles to them.
      const step = kernel.writeXCAFToSTEP(doc, { unit: 'MM', modelUnit: 'CM' });
      expect(step).toContain(MILLIMETER_UNIT);
      expect(largestStepCoordinate(step)).toBeCloseTo(100, 9);
    });

    it('writes the unit option through the kernel assembly export', (ctx) => {
      skipIfDiverges(ctx, 'stepConfigFns.units');
      using b = box(10, 10, 10);
      const step = getKernel().exportSTEPAssembly([{ shape: b.wrapped, name: 'box' }], {
        unit: 'inch',
      });
      expect(step).toContain(INCH_UNIT);
      expect(largestStepCoordinate(step)).toBeCloseTo(10, 9);
    });
  });
});
