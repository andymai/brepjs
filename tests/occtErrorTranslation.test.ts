/**
 * Tests for kernel error message translation.
 *
 * Verifies that common kernel error patterns are translated into
 * user-friendly messages with actionable guidance.
 */

import { describe, expect, it } from 'vitest';
import { translateKernelError } from '@/core/errors.js';

describe('translateKernelError', () => {
  it('translates invalid edge configuration errors', () => {
    const result = translateKernelError('invalid edge configuration');
    expect(result).toContain('may not form a continuous loop');
    expect(result).toContain('Check that edges connect end-to-end');
  });

  it('translates BRepAlgoAPI boolean operation failures', () => {
    const result = translateKernelError('BRepAlgoAPI: operation failed');
    expect(result).toContain('Boolean operation failed');
    expect(result).toContain('Common causes');
    expect(result).toContain('overlapping faces');
  });

  it('translates fillet failures', () => {
    const result = translateKernelError('fillet failed: radius too large');
    expect(result).toContain('Fillet operation failed');
    expect(result).toContain('radius may be too large');
    expect(result).toContain('Try reducing the radius');
  });

  it('translates chamfer failures', () => {
    const result = translateKernelError('chamfer failed');
    expect(result).toContain('Chamfer operation failed');
    expect(result).toContain('distance may be too large');
  });

  it('translates shell/offset failures', () => {
    const result = translateKernelError('shell operation failed');
    expect(result).toContain('Shell/offset operation failed');
    expect(result).toContain('thickness may be too large');
  });

  it('translates sweep failures', () => {
    const result = translateKernelError('sweep failed');
    expect(result).toContain('Sweep operation failed');
    expect(result).toContain('profile and spine are compatible');
  });

  it('translates loft failures', () => {
    const result = translateKernelError('loft operation failed');
    expect(result).toContain('Loft operation failed');
    expect(result).toContain('Profiles may be incompatible');
  });

  it('translates extrude failures', () => {
    const result = translateKernelError('extrude failed');
    expect(result).toContain('Extrusion failed');
    expect(result).toContain('profile may be invalid');
  });

  it('translates revolve failures', () => {
    const result = translateKernelError('revolution failed');
    expect(result).toContain('Revolution operation failed');
    expect(result).toContain('profile may intersect the axis');
  });

  it('translates self-intersection errors', () => {
    const result = translateKernelError('self-intersection detected');
    expect(result).toContain('Shape has self-intersections');
    expect(result).toContain('overlapping geometry');
  });

  it('translates degenerate geometry errors', () => {
    const result = translateKernelError('degenerate edge');
    expect(result).toContain('Degenerate geometry detected');
    expect(result).toContain('zero length/area');
  });

  it('translates shape validation errors', () => {
    const result = translateKernelError('BRepCheck failed: shape not valid');
    expect(result).toContain('Shape validation failed');
    expect(result).toContain('invalid topology');
  });

  it('preserves original message when no pattern matches', () => {
    const original = 'Some unknown kernel error';
    const result = translateKernelError(original);
    expect(result).toBe(original);
  });

  it('includes original kernel message for reference', () => {
    const original = 'fillet failed';
    const result = translateKernelError(original);
    expect(result).toContain('kernel:');
    expect(result).toContain(original);
  });

  it('is case-insensitive', () => {
    const result1 = translateKernelError('FILLET FAILED');
    const result2 = translateKernelError('Fillet Failed');
    expect(result1).toContain('Fillet operation failed');
    expect(result2).toContain('Fillet operation failed');
  });
});
