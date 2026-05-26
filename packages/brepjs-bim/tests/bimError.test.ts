import { describe, it, expect } from 'vitest';
import { specError, ifcError, geometryError, fromBrepError } from '../src/errors/bimError.js';

describe('BimError constructors', () => {
  it('specError has kind BIM_SPEC', () => {
    const e = specError('WALL_ZERO_LENGTH', 'length must be positive');
    expect(e.kind).toBe('BIM_SPEC');
    expect(e.code).toBe('WALL_ZERO_LENGTH');
    expect(e.message).toBe('length must be positive');
  });

  it('ifcError has kind BIM_IFC', () => {
    const e = ifcError('IFC_WRITE_FAILED', 'failed');
    expect(e.kind).toBe('BIM_IFC');
  });

  it('geometryError has kind BIM_GEOMETRY', () => {
    const e = geometryError('WALL_EXTRUDE_FAILED', 'extrude failed');
    expect(e.kind).toBe('BIM_GEOMETRY');
  });

  it('fromBrepError wraps cause', () => {
    const inner = { kind: 'KERNEL_OPERATION', code: 'EXTRUDE_FAILED', message: 'x' } as const;
    const e = fromBrepError(inner, 'WALL_BUILD_FAILED', 'wall build failed');
    expect(e.cause).toBe(inner);
    expect(e.kind).toBe('BIM_GEOMETRY');
  });
});
