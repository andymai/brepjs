import { describe, it, expect } from 'vitest';
import {
  kernelError,
  validationError,
  typeCastError,
  sketcherStateError,
  moduleInitError,
  computationError,
  ioError,
  queryError,
  unsupportedError,
  bug,
  BrepBugError,
  BrepErrorCode,
  translateKernelError,
} from '../src/core/errors.js';

describe('Error constructors', () => {
  it('kernelError creates correct shape', () => {
    const e = kernelError('FUSE_FAILED', 'Fuse did not produce a 3D shape');
    expect(e.kind).toBe('KERNEL_OPERATION');
    expect(e.code).toBe('FUSE_FAILED');
    expect(e.message).toBe('Fuse did not produce a 3D shape');
    expect(e.cause).toBeUndefined();
  });

  it('validationError creates correct shape', () => {
    const e = validationError('MINOR_GT_MAJOR', 'The minor radius must be smaller');
    expect(e.kind).toBe('VALIDATION');
    expect(e.code).toBe('MINOR_GT_MAJOR');
  });

  it('typeCastError creates correct shape', () => {
    const e = typeCastError('NO_WRAPPER', 'Could not find a wrapper');
    expect(e.kind).toBe('TYPE_CAST');
  });

  it('sketcherStateError creates correct shape', () => {
    const e = sketcherStateError('NO_CURVE', 'You need a previous curve');
    expect(e.kind).toBe('SKETCHER_STATE');
  });

  it('moduleInitError creates correct shape', () => {
    const e = moduleInitError('KERNEL_NOT_INIT', 'Kernel not initialized');
    expect(e.kind).toBe('MODULE_INIT');
  });

  it('computationError creates correct shape', () => {
    const e = computationError('BSPLINE_FAILED', 'B-spline approximation failed');
    expect(e.kind).toBe('COMPUTATION');
  });

  it('ioError creates correct shape', () => {
    const e = ioError('STEP_WRITE_FAILED', 'Failed to write STEP file');
    expect(e.kind).toBe('IO');
  });

  it('queryError creates correct shape', () => {
    const e = queryError('NOT_UNIQUE', 'Expected unique match');
    expect(e.kind).toBe('QUERY');
  });

  it('unsupportedError creates correct shape', () => {
    const e = unsupportedError('UNSUPPORTED_CAPABILITY', 'Convex hull not supported');
    expect(e.kind).toBe('UNSUPPORTED');
    expect(e.code).toBe('UNSUPPORTED_CAPABILITY');
    expect(e.message).toBe('Convex hull not supported');
    expect(e.cause).toBeUndefined();
  });

  it('preserves cause when provided', () => {
    const original = new Error('kernel internal');
    const e = kernelError('FUSE_FAILED', 'Fuse failed', original);
    expect(e.cause).toBe(original);
  });

  it('metadata is undefined when not provided', () => {
    const e = kernelError('FUSE_FAILED', 'Fuse failed');
    expect(e.metadata).toBeUndefined();
  });

  it('preserves metadata when provided', () => {
    const meta = { operation: 'fuse', tolerance: 1e-3, inputTypes: ['solid', 'solid'] };
    const e = kernelError('FUSE_FAILED', 'Fuse failed', undefined, meta);
    expect(e.metadata).toEqual(meta);
    expect(e.metadata?.operation).toBe('fuse');
    expect(e.metadata?.tolerance).toBe(1e-3);
  });

  it('all factory functions accept metadata', () => {
    const meta = { step: 'build' };
    expect(validationError('V1', 'msg', undefined, meta).metadata).toEqual(meta);
    expect(typeCastError('T1', 'msg', undefined, meta).metadata).toEqual(meta);
    expect(sketcherStateError('S1', 'msg', undefined, meta).metadata).toEqual(meta);
    expect(moduleInitError('M1', 'msg', undefined, meta).metadata).toEqual(meta);
    expect(computationError('C1', 'msg', undefined, meta).metadata).toEqual(meta);
    expect(ioError('I1', 'msg', undefined, meta).metadata).toEqual(meta);
    expect(queryError('Q1', 'msg', undefined, meta).metadata).toEqual(meta);
    expect(unsupportedError('U1', 'msg', undefined, meta).metadata).toEqual(meta);
  });

  it('preserves both cause and metadata together', () => {
    const cause = new Error('root');
    const meta = { inputCount: 3 };
    const e = computationError('BSPLINE_FAILED', 'failed', cause, meta);
    expect(e.cause).toBe(cause);
    expect(e.metadata).toEqual(meta);
    expect(e.kind).toBe('COMPUTATION');
  });
});

describe('BrepErrorCode', () => {
  it('contains all known error codes', () => {
    expect(BrepErrorCode.FUSE_FAILED).toBe('FUSE_FAILED');
    expect(BrepErrorCode.STEP_EXPORT_FAILED).toBe('STEP_EXPORT_FAILED');
    expect(BrepErrorCode.NULL_SHAPE).toBe('NULL_SHAPE');
    expect(BrepErrorCode.PARAMETER_NOT_FOUND).toBe('PARAMETER_NOT_FOUND');
    expect(BrepErrorCode.ELLIPSE_RADII).toBe('ELLIPSE_RADII');
    expect(BrepErrorCode.UNSUPPORTED_CAPABILITY).toBe('UNSUPPORTED_CAPABILITY');
  });

  it('has key names matching their values', () => {
    for (const [key, value] of Object.entries(BrepErrorCode)) {
      expect(key).toBe(value);
    }
  });

  it('works with error constructors', () => {
    const e = kernelError(BrepErrorCode.FUSE_FAILED, 'Fuse operation failed');
    expect(e.code).toBe('FUSE_FAILED');
  });
});

describe('translateKernelError', () => {
  it('translates invalid edge messages', () => {
    const result = translateKernelError('invalid edge configuration detected');
    expect(result).toContain('edges may not form a continuous loop');
    expect(result).toContain('(kernel: invalid edge configuration detected)');
  });

  it('translates boolean operation failure', () => {
    const result = translateKernelError('BRepAlgoAPI_Fuse failed');
    expect(result).toContain('Boolean operation failed');
  });

  it('translates fillet failure', () => {
    const result = translateKernelError('fillet radius too large for edge');
    expect(result).toContain('Fillet operation failed');
  });

  it('translates shell/offset failure', () => {
    const result = translateKernelError('offset failed on shape');
    expect(result).toContain('Shell/offset operation failed');
  });

  it('translates degenerate geometry', () => {
    const result = translateKernelError('degenerate edge found');
    expect(result).toContain('Degenerate geometry detected');
  });

  it('passes through unrecognized messages unchanged', () => {
    const msg = 'some completely unknown error message xyz123';
    expect(translateKernelError(msg)).toBe(msg);
  });
});

describe('bug() helper', () => {
  it('throws BrepBugError', () => {
    expect(() => bug('offset', 'unexpected state')).toThrow(BrepBugError);
  });

  it('includes location in message', () => {
    try {
      bug('transform', 'shape type changed');
    } catch (e) {
      expect(e).toBeInstanceOf(BrepBugError);
      expect((e as BrepBugError).message).toBe('Bug in transform: shape type changed');
      expect((e as BrepBugError).location).toBe('transform');
    }
  });
});
