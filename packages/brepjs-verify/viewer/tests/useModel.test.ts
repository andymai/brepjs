import { describe, it, expect } from 'vitest';
import { parseModelParams, extOf } from '@viewer/useModel.js';
describe('parseModelParams', () => {
  it('extracts dir + file', () => {
    expect(parseModelParams('?dir=/abs/project&file=parts/bracket.step')).toEqual({
      dir: '/abs/project',
      file: 'parts/bracket.step',
    });
  });
  it('null when file missing', () => {
    expect(parseModelParams('?dir=/abs/project')).toBeNull();
  });
});
describe('extOf', () => {
  it('lowercased ext with dot', () => {
    expect(extOf('parts/bracket.STP')).toBe('.stp');
  });
});
