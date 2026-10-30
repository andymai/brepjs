import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { skipIfDiverges } from './helpers/kernelDivergences.js';
import {
  INCH_UNIT,
  MILLIMETER_UNIT,
  largestStepCoordinate,
  stepProductNames,
} from './helpers/stepText.js';
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
  locate,
  measureVolume,
  translate,
  unwrap,
} from '@/index.js';
import type { AnyShape, Dimension, Shape3D } from '@/index.js';

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

    describe('parts that share geometry', () => {
      /** A plate and a post, each a part twice; `locate` shares the source's geometry. */
      function sharedGeometryStep(units?: { unit: 'MM'; modelUnit: 'CM' }): Blob {
        using plate = box(20, 10, 2);
        using post = box(2, 2, 8);
        using lid = locate(plate, { type: 'translate', v: [0, 0, 10] });
        using postA = locate(post, { type: 'translate', v: [0, 0, 2] });
        using postB = locate(post, { type: 'translate', v: [18, 8, 2] });
        const parts = [
          { shape: plate, name: 'base', color: '#3366cc' },
          { shape: lid, name: 'lid', color: '#cc6633' },
          { shape: postA, name: 'postA', color: '#999999' },
          { shape: postB, name: 'postB', color: '#999999' },
        ];
        return unwrap(exportAssemblySTEP(parts, units));
      }

      /** Each solid's lowest corner, ordered by z, then x. */
      function corners(shape: AnyShape<Dimension>): number[][] {
        return getSolids(shape)
          .map((solid) => getBounds(solid))
          .sort((a, b) => a.zMin - b.zMin || a.xMin - b.xMin)
          .map((b) => [b.xMin, b.yMin, b.zMin]);
      }

      const closeTo = (scale: number, ...v: number[]): unknown[] =>
        v.map((x) => expect.closeTo(x * scale, 3));

      it('writes each as its own part, at its placement', async () => {
        using imported = unwrap(await importSTEP(sharedGeometryStep()));
        expect(getSolids(imported)).toHaveLength(4);
        expect(unwrap(measureVolume(imported as Shape3D))).toBeCloseTo(2 * 400 + 2 * 32, 3);
        expect(corners(imported)).toEqual([
          closeTo(1, 0, 0, 0),
          closeTo(1, 0, 0, 2),
          closeTo(1, 18, 8, 2),
          closeTo(1, 0, 0, 10),
        ]);
      });

      it('keeps the name of each', async (ctx) => {
        skipIfDiverges(ctx, 'exporterFns.partNames');
        const names = stepProductNames(await sharedGeometryStep().text());
        expect(names).toEqual(expect.arrayContaining(['base', 'lid', 'postA', 'postB']));
      });

      it('writes each when scaling from another model unit', async (ctx) => {
        skipIfDiverges(ctx, 'exporterFns.assemblyUnits');
        const step = sharedGeometryStep({ unit: 'MM', modelUnit: 'CM' });
        using imported = unwrap(await importSTEP(step));
        expect(getSolids(imported)).toHaveLength(4);
        expect(unwrap(measureVolume(imported as Shape3D))).toBeCloseTo(864_000, 1);
        expect(corners(imported)).toEqual([
          closeTo(10, 0, 0, 0),
          closeTo(10, 0, 0, 2),
          closeTo(10, 18, 8, 2),
          closeTo(10, 0, 0, 10),
        ]);
      });

      it('writes the same shape listed twice as two parts', async () => {
        using b = box(10, 10, 10);
        const step = unwrap(
          exportAssemblySTEP([
            { shape: b, name: 'first' },
            { shape: b, name: 'second' },
          ])
        );
        using imported = unwrap(await importSTEP(step));
        expect(getSolids(imported)).toHaveLength(2);
        expect(unwrap(measureVolume(imported as Shape3D))).toBeCloseTo(2000, 3);
      });

      it('writes a part listed after several placed copies of it', async () => {
        using b = box(10, 10, 10);
        const copies = [1, 2, 3].map((n) => locate(b, { type: 'translate', v: [20 * n, 0, 0] }));
        try {
          const step = unwrap(
            exportAssemblySTEP([
              ...copies.map((shape, n) => ({ shape, name: `copy${n}` })),
              { shape: b, name: 'original' },
            ])
          );
          using imported = unwrap(await importSTEP(step));
          expect(getSolids(imported)).toHaveLength(4);
          expect(unwrap(measureVolume(imported as Shape3D))).toBeCloseTo(4000, 3);
          expect(corners(imported).map(([x]) => x)).toEqual(closeTo(1, 0, 20, 40, 60));
        } finally {
          for (const copy of copies) copy[Symbol.dispose]();
        }
      });
    });

    it('writes 200 separate parts as 200 solids', async () => {
      using cube = box(1, 1, 1);
      const cubes = Array.from({ length: 200 }, (_, n) => translate(cube, [2 * n, 0, 0]));
      try {
        const step = unwrap(
          exportAssemblySTEP(cubes.map((shape, n) => ({ shape, name: `cube${n}` })))
        );
        using imported = unwrap(await importSTEP(step));
        expect(getSolids(imported)).toHaveLength(200);
        expect(unwrap(measureVolume(imported as Shape3D))).toBeCloseTo(200, 3);
      } finally {
        for (const c of cubes) c[Symbol.dispose]();
      }
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
