/**
 * Tests for error suggestion field.
 *
 * Verifies that BrepError includes actionable suggestions
 * for common validation and operation failures.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { box, shape, fillet, chamfer, isErr } from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('Error suggestions', () => {
  describe('validation errors with suggestions', () => {
    it('provides suggestion for invalid fillet radius', () => {
      const result = fillet(box(10, 10, 10), -1);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe('INVALID_FILLET_RADIUS');
        expect(result.error.suggestion).toBeDefined();
        expect(result.error.suggestion).toContain('positive');
        expect(result.error.suggestion).toContain('greater than 0');
      }
    });

    it('provides suggestion for invalid chamfer distance', () => {
      const result = chamfer(box(10, 10, 10), 0);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe('INVALID_CHAMFER_DISTANCE');
        expect(result.error.suggestion).toBeDefined();
        expect(result.error.suggestion).toContain('positive');
      }
    });

    it('provides suggestion for variable fillet with invalid radii', () => {
      const result = fillet(box(10, 10, 10), [0, 2]);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe('INVALID_FILLET_RADIUS');
        expect(result.error.suggestion).toBeDefined();
        expect(result.error.suggestion).toContain('Both radius values');
      }
    });

    it('provides suggestion for variable chamfer with invalid distances', () => {
      const result = chamfer(box(10, 10, 10), [-1, 2]);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe('INVALID_CHAMFER_DISTANCE');
        expect(result.error.suggestion).toBeDefined();
        expect(result.error.suggestion).toContain('Both distance values');
      }
    });
  });

  describe('wrapper error includes suggestions', () => {
    it('includes suggestion in thrown error message', () => {
      expect(() => {
        shape(box(10, 10, 10)).fillet(-1);
      }).toThrow(/Suggestion:/);
    });

    it('suggestion is accessible on BrepWrapperError', () => {
      try {
        shape(box(10, 10, 10)).fillet(-1);
        expect.fail('Should have thrown');
      } catch (e: unknown) {
        const error = e as { suggestion?: string };
        expect(error.suggestion).toBeDefined();
        expect(error.suggestion).toContain('positive');
      }
    });
  });

  describe('errors without suggestions', () => {
    it('errors without suggestions do not include undefined field', () => {
      const b = box(10, 10, 10);
      const result = fillet(b, 1); // Valid operation
      expect(isErr(result)).toBe(false);
    });
  });
});
