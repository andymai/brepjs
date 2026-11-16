import { describe, it, expect } from 'vitest';
import { defaultsOf, readInput, writeSearch } from '@viewer/publish/urlState.js';
import type { ParamDefs } from '@viewer/publish/protocol.js';

const defs: ParamDefs = {
  width: { type: 'number', default: 50, min: 10, max: 200 },
  vented: { type: 'boolean', default: false },
  style: { type: 'choice', default: 'round', options: ['round', 'square'] },
};

describe('readInput', () => {
  it('reads the declared parameters and leaves the other keys', () => {
    expect(readInput('?width=80&utm_source=x&style=square', defs)).toEqual({
      width: '80',
      style: 'square',
    });
  });
  it('is empty for an empty query', () => {
    expect(readInput('', defs)).toEqual({});
  });
});

describe('writeSearch', () => {
  it('lists the values that differ from the defaults', () => {
    expect(writeSearch('', defs, { width: 80, vented: true, style: 'round' })).toBe(
      '?width=80&vented=true'
    );
  });
  it('is empty when each value is the default', () => {
    expect(writeSearch('?width=80', defs, defaultsOf(defs))).toBe('');
  });
  it('keeps a key that is not a parameter', () => {
    expect(writeSearch('?utm_source=x&width=80', defs, { width: 50 })).toBe('?utm_source=x');
  });
});

describe('defaultsOf', () => {
  it('maps each parameter to its default', () => {
    expect(defaultsOf(defs)).toEqual({ width: 50, vented: false, style: 'round' });
  });
});
