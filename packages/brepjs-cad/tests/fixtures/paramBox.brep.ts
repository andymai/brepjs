import { box, defineParams } from 'brepjs';

export const params = defineParams({
  width: { type: 'number', default: 10, min: 5, max: 100 },
  height: { type: 'number', default: 10, min: 5, max: 100 },
  label: { type: 'choice', default: 'a', options: ['a', 'b'] },
});

export const expected = (p = params.values) => ({ volume: p.width * 10 * p.height });

export default (p = params.values) => box(p.width, 10, p.height);
