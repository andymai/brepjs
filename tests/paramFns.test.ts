import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  BrepErrorCode,
  defineParams,
  isParams,
  resolveParams,
  unwrap,
  unwrapErr,
} from '../src/index.js';

const params = defineParams({
  width: { type: 'number', default: 50, min: 10, max: 200, unit: 'mm' },
  holes: { type: 'number', default: 4, min: 0, max: 12, integer: true },
  vented: { type: 'boolean', default: false },
  label: { type: 'string', default: 'A1', maxLength: 4 },
  style: { type: 'choice', default: 'round', options: ['round', 'square'] },
});

describe('defineParams', () => {
  it('collects the defaults as values', () => {
    expect(params.values).toEqual({
      width: 50,
      holes: 4,
      vented: false,
      label: 'A1',
      style: 'round',
    });
  });

  it('keeps the declarations for a tool to read', () => {
    expect(params.kind).toBe('brepjs.params');
    expect(params.defs.width).toEqual({
      type: 'number',
      default: 50,
      min: 10,
      max: 200,
      unit: 'mm',
    });
  });

  it('survives a JSON round trip as a declaration', () => {
    expect(isParams(JSON.parse(JSON.stringify(params)))).toBe(true);
  });

  it('infers the value type of each parameter', () => {
    expectTypeOf(params.values).toEqualTypeOf<{
      readonly width: number;
      readonly holes: number;
      readonly vented: boolean;
      readonly label: string;
      readonly style: 'round' | 'square';
    }>();
  });

  it('types a part function from its default argument', () => {
    const part = (p = params.values) => `${p.style}:${p.width}`;
    expectTypeOf(part).parameter(0).toEqualTypeOf<typeof params.values | undefined>();
    expect(part()).toBe('round:50');
    expect(part(unwrap(resolveParams(params, { width: 80 })))).toBe('round:80');
  });

  it('rejects a choice default that is not an option, at compile time', () => {
    // @ts-expect-error -- 'hex' is not in options
    defineParams({ style: { type: 'choice', default: 'hex', options: ['round', 'square'] } });
  });
});

describe('isParams', () => {
  it.each([null, undefined, 42, 'params', {}, { kind: 'brepjs.params' }, { defs: {}, values: {} }])(
    'is false for %j',
    (value) => {
      expect(isParams(value)).toBe(false);
    }
  );

  it('is true for a declaration with no parameters', () => {
    expect(isParams(defineParams({}))).toBe(true);
  });
});

describe('resolveParams', () => {
  it('returns the defaults when the input is absent', () => {
    expect(unwrap(resolveParams(params))).toEqual(params.values);
  });

  it('merges input over the defaults', () => {
    const values = unwrap(resolveParams(params, { width: 80, style: 'square' }));
    expect(values).toEqual({ ...params.values, width: 80, style: 'square' });
  });

  it('treats an undefined input value as absent', () => {
    expect(unwrap(resolveParams(params, { width: undefined })).width).toBe(50);
  });

  it('converts a string for a number or a boolean parameter', () => {
    const values = unwrap(resolveParams(params, { width: '80.5', holes: '6', vented: 'true' }));
    expect(values.width).toBe(80.5);
    expect(values.holes).toBe(6);
    expect(values.vented).toBe(true);
  });

  it('accepts a value on a limit', () => {
    expect(unwrap(resolveParams(params, { width: 10 })).width).toBe(10);
    expect(unwrap(resolveParams(params, { width: 200 })).width).toBe(200);
  });

  it('rejects an input key that is not declared', () => {
    const error = unwrapErr(resolveParams(params, { widht: 80 }));
    expect(error.code).toBe(BrepErrorCode.PARAM_UNKNOWN);
    expect(error.kind).toBe('VALIDATION');
    expect(error.suggestion).toContain('width');
  });

  it.each([
    ['below min', { width: 9 }],
    ['above max', { width: 201 }],
    ['longer than maxLength', { label: 'ABCDE' }],
  ])('rejects a value %s', (_case, input) => {
    expect(unwrapErr(resolveParams(params, input)).code).toBe(BrepErrorCode.PARAM_OUT_OF_RANGE);
  });

  it.each([
    ['text for a number', { width: 'wide' }],
    ['an empty string for a number', { width: '' }],
    ['NaN', { width: Number.NaN }],
    ['Infinity', { width: Number.POSITIVE_INFINITY }],
    ['a fraction for an integer', { holes: 2.5 }],
    ['a number for a boolean', { vented: 1 }],
    ['a number for a string', { label: 7 }],
    ['a value that is not an option', { style: 'hex' }],
  ])('rejects %s', (_case, input) => {
    expect(unwrapErr(resolveParams(params, input)).code).toBe(BrepErrorCode.PARAM_INVALID_VALUE);
  });

  it('names the parameter and the limit in the message', () => {
    const error = unwrapErr(resolveParams(params, { width: 500 }));
    expect(error.message).toBe('Parameter "width" must be <= 200, got 500');
    expect(error.metadata).toEqual({ param: 'width', value: 500 });
  });

  it('rejects a default that breaks its own limits', () => {
    const bad = defineParams({ bevel: { type: 'number', default: 20, max: 8 } });
    expect(unwrapErr(resolveParams(bad)).code).toBe(BrepErrorCode.PARAM_OUT_OF_RANGE);
  });

  it('resolves a declaration that came through JSON', () => {
    const copy: unknown = JSON.parse(JSON.stringify(params));
    if (!isParams(copy)) throw new Error('not a declaration');
    expect(unwrap(resolveParams(copy, { width: '120' }))['width']).toBe(120);
  });
});
