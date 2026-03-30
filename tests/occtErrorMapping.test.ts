import { describe, it, expect } from 'vitest';
import { mapOcctError } from '@/core/occtErrorMapping.js';

describe('mapOcctError', () => {
  it('maps BOOLEAN_FAILED to KERNEL_OPERATION kind', () => {
    const error = new Error('Boolean operation failed');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- simulate OcctError
    (error as any).code = 'BOOLEAN_FAILED';
    const result = mapOcctError(error);
    expect(result.kind).toBe('KERNEL_OPERATION');
    expect(result.code).toBe('BOOLEAN_HAS_ERRORS');
    expect(result.cause).toBe(error);
  });

  it('maps CONSTRUCTION_FAILED to KERNEL_OPERATION with generic code', () => {
    const error = new Error('Build failed');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- simulate OcctError
    (error as any).code = 'CONSTRUCTION_FAILED';
    const result = mapOcctError(error);
    expect(result.kind).toBe('KERNEL_OPERATION');
    expect(result.code).toBe('VALIDATION_FAILED');
    expect(result.cause).toBe(error);
  });

  it('maps IMPORT_EXPORT_FAILED to IO kind with generic IO_FAILED code', () => {
    const error = new Error('STEP import failed');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- simulate OcctError
    (error as any).code = 'IMPORT_EXPORT_FAILED';
    const result = mapOcctError(error);
    expect(result.kind).toBe('IO');
    expect(result.code).toBe('IO_FAILED');
    expect(result.cause).toBe(error);
  });

  it('maps TESSELLATION_FAILED to COMPUTATION kind with TESSELLATION_FAILED code', () => {
    const error = new Error('Tessellation failed');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- simulate OcctError
    (error as any).code = 'TESSELLATION_FAILED';
    const result = mapOcctError(error);
    expect(result.kind).toBe('COMPUTATION');
    expect(result.code).toBe('TESSELLATION_FAILED');
  });

  it('maps HEALING_FAILED to KERNEL_OPERATION with FIX_SHAPE_FAILED', () => {
    const error = new Error('Healing failed');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- simulate OcctError
    (error as any).code = 'HEALING_FAILED';
    const result = mapOcctError(error);
    expect(result.kind).toBe('KERNEL_OPERATION');
    expect(result.code).toBe('FIX_SHAPE_FAILED');
  });

  it('maps INVALID_SHAPE_ID to VALIDATION kind', () => {
    const error = new Error('Invalid shape');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- simulate OcctError
    (error as any).code = 'INVALID_SHAPE_ID';
    const result = mapOcctError(error);
    expect(result.kind).toBe('VALIDATION');
    expect(result.code).toBe('NULL_SHAPE_INPUT');
  });

  it('maps unknown OcctErrorCode to KERNEL_OPERATION with original message', () => {
    const error = new Error('Something unknown');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- simulate OcctError
    (error as any).code = 'UNKNOWN';
    const result = mapOcctError(error);
    expect(result.kind).toBe('KERNEL_OPERATION');
    expect(result.message).toContain('Something unknown');
  });

  it('handles plain Error (no code) gracefully', () => {
    const error = new Error('plain error');
    const result = mapOcctError(error);
    expect(result.kind).toBe('KERNEL_OPERATION');
    expect(result.cause).toBe(error);
  });
});
