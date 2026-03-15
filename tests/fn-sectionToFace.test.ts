import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { box, cut, sectionToFace, measureArea, getWires, unwrap } from '../src/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('sectionToFace', () => {
  describe('sectionToFace', () => {
    it('returns a filled face from sectioning a box at XY', () => {
      const b = box(10, 20, 30);
      const result = sectionToFace(b, 'XY');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const area = unwrap(measureArea(result.value));
      expect(area).toBeCloseTo(200, 0);
      expect(getWires(result.value).length).toBe(1);
    });

    it('returns a face when sectioning a hollow shape', () => {
      const outer = box(20, 20, 20);
      const inner = box(10, 10, 30);
      const cutResult = cut(outer, inner);
      expect(cutResult.ok).toBe(true);
      if (!cutResult.ok) return;
      const result = sectionToFace(cutResult.value, 'XY');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // Area should be outer minus inner: 400 - 100 = 300
      const area = unwrap(measureArea(result.value));
      expect(area).toBeCloseTo(300, 0);
    });

    it('sections at XZ and YZ planes', () => {
      const b = box(10, 20, 30);
      const xzResult = sectionToFace(b, 'XZ');
      expect(xzResult.ok).toBe(true);
      if (!xzResult.ok) return;
      expect(unwrap(measureArea(xzResult.value))).toBeCloseTo(300, 0);

      const yzResult = sectionToFace(b, 'YZ');
      expect(yzResult.ok).toBe(true);
      if (!yzResult.ok) return;
      expect(unwrap(measureArea(yzResult.value))).toBeCloseTo(600, 0);
    });
  });
});
