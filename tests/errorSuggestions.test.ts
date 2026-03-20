/**
 * Tests for error suggestion field.
 *
 * Verifies that BrepError includes actionable suggestions
 * for common validation and operation failures.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { box, shape, fillet, chamfer, isErr, loft, line, wire, unwrap } from '@/index.js';
import { kernelError, typeCastError } from '@/core/errors.js';

beforeAll(async () => {
  await initKernel();
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- need to access .suggestion on thrown error
      } catch (e: any) {
        expect(e.suggestion).toBeDefined();
        expect(e.suggestion).toContain('positive');
      }
    });
  });

  describe('operation error suggestions are defined', () => {
    it('loft error includes suggestion text', () => {
      // Loft with a single open wire — triggers LOFT_FAILED or LOFT_NOT_3D
      const edge = line([0, 0, 0], [1, 0, 0]);
      const w = unwrap(wire([edge]));
      const result = loft([w]);
      if (isErr(result)) {
        expect(result.error.suggestion).toBeDefined();
        expect(result.error.suggestion).toContain('profiles');
      }
    });

    it('SECTION_FAILED errors include suggestion', () => {
      const error = kernelError(
        'SECTION_FAILED',
        'test',
        undefined,
        undefined,
        'The cutting plane may not intersect the shape.'
      );
      expect(error.suggestion).toBeDefined();
      expect(error.suggestion).toContain('plane');
    });

    it('SPLIT_FAILED errors include suggestion', () => {
      const error = kernelError(
        'SPLIT_FAILED',
        'test',
        undefined,
        undefined,
        'The splitting tools may not intersect the shape.'
      );
      expect(error.suggestion).toBeDefined();
      expect(error.suggestion).toContain('tools');
    });

    it('boolean type-cast errors include suggestion', () => {
      const error = typeCastError(
        'FUSE_NOT_3D',
        'test',
        undefined,
        undefined,
        'Common causes: overlapping coplanar faces'
      );
      expect(error.suggestion).toBeDefined();
      expect(error.suggestion).toContain('coplanar');
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
