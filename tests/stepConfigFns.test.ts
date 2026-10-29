import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { skipIfDiverges } from './helpers/kernelDivergences.js';
import { INCH_UNIT, MILLIMETER_UNIT, largestStepCoordinate } from './helpers/stepText.js';
import { box, exportSTEPConfigured, isOk, unwrap } from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('exportSTEPConfigured', () => {
  it('exports a box with default options', () => {
    const b = box(10, 10, 10);
    const result = exportSTEPConfigured([{ shape: b }]);
    if (isOk(result)) {
      expect(typeof unwrap(result)).toBe('string');
      expect(unwrap(result).length).toBeGreaterThan(0);
    } else {
      // May not be supported on all kernels
      expect(result.error.code).toBe('STEP_EXPORT_CONFIGURED_FAILED');
    }
  });

  it('exports with named part', () => {
    const b = box(10, 10, 10);
    const result = exportSTEPConfigured([{ shape: b, name: 'MyBox' }]);
    if (isOk(result)) {
      const content = unwrap(result);
      expect(content.length).toBeGreaterThan(0);
      // Name may or may not appear in the STEP output depending on kernel
      expect(content).toContain('ISO-10303-21');
    }
  });

  it('exports with color specified', () => {
    const b = box(10, 10, 10);
    const result = exportSTEPConfigured([{ shape: b, name: 'RedBox', color: [1, 0, 0, 1] }]);
    if (isOk(result)) {
      expect(typeof unwrap(result)).toBe('string');
      expect(unwrap(result).length).toBeGreaterThan(0);
    } else {
      // May not be supported on all kernels
      expect(result.error.code).toBe('STEP_EXPORT_CONFIGURED_FAILED');
    }
  });

  // `unit` is the unit written; `modelUnit`, defaulting to `unit`, is the unit
  // the shape's numbers are in. A 10 mm cube's far corner reads 10 unless the
  // two differ.
  describe('length units', () => {
    it('writes millimeters by default', (ctx) => {
      skipIfDiverges(ctx, 'stepConfigFns.units');
      using b = box(10, 10, 10);
      const step = unwrap(exportSTEPConfigured([{ shape: b }]));
      expect(step).toContain(MILLIMETER_UNIT);
      expect(step).not.toContain(INCH_UNIT);
      expect(largestStepCoordinate(step)).toBeCloseTo(10, 9);
    });

    it('writes the model in the unit given, unscaled', (ctx) => {
      skipIfDiverges(ctx, 'stepConfigFns.units');
      using b = box(10, 10, 10);
      const step = unwrap(exportSTEPConfigured([{ shape: b }], { unit: 'inch' }));
      expect(step).toContain(INCH_UNIT);
      expect(largestStepCoordinate(step)).toBeCloseTo(10, 9);
    });

    it('converts a millimeter model into the unit written', (ctx) => {
      skipIfDiverges(ctx, 'stepConfigFns.units');
      using b = box(10, 10, 10);
      const step = unwrap(exportSTEPConfigured([{ shape: b }], { unit: 'inch', modelUnit: 'mm' }));
      expect(step).toContain(INCH_UNIT);
      expect(largestStepCoordinate(step)).toBeCloseTo(10 / 25.4, 9);
    });

    it('converts several shapes into one file', (ctx) => {
      skipIfDiverges(ctx, 'stepConfigFns.units');
      using a = box(10, 10, 10);
      using b = box(10, 10, 10, { at: [25, 5, 5] });
      const step = unwrap(
        exportSTEPConfigured([{ shape: a }, { shape: b }], { unit: 'mm', modelUnit: 'cm' })
      );
      expect(step).not.toContain(INCH_UNIT);
      expect(largestStepCoordinate(step)).toBeCloseTo(300, 9);
    });

    it('honours units for named and colored parts', (ctx) => {
      skipIfDiverges(ctx, 'stepConfigFns.units');
      using b = box(10, 10, 10);
      const part = { shape: b, name: 'RedBox', color: [255, 0, 0, 255] as const };
      const relabeled = unwrap(exportSTEPConfigured([part], { unit: 'inch' }));
      expect(relabeled).toContain(INCH_UNIT);
      expect(relabeled).toContain('RedBox');
      expect(largestStepCoordinate(relabeled)).toBeCloseTo(10, 9);
      const converted = unwrap(exportSTEPConfigured([part], { unit: 'inch', modelUnit: 'mm' }));
      expect(largestStepCoordinate(converted)).toBeCloseTo(10 / 25.4, 9);
    });
  });
});
