import { describe, it, expect } from 'vitest';
import { parseModelParams, extOf, previewValid } from '@viewer/useModel.js';
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

describe('previewValid', () => {
  it('is false for the empty payload served when the build threw', () => {
    expect(previewValid({ elements: [], failed: [] })).toBe(false);
  });
  it('is true when every element built', () => {
    expect(previewValid({ elements: [{}], failed: [] })).toBe(true);
  });
  it('is false when an element failed', () => {
    expect(previewValid({ elements: [{}], failed: ['wall'] })).toBe(false);
  });
});
