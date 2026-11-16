import { box, defineParams } from 'brepjs';

export const params = defineParams({
  width: { type: 'number', default: 10, min: 5, max: 100 },
});

// Wrong on purpose: the part is 1000 mm³ at its defaults.
export const expected = (p = params.values) => Promise.resolve({ volume: p.width * 200 });

export default (p = params.values) => box(p.width, 10, 10);
