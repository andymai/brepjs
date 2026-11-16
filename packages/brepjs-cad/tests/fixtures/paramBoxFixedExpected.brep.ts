import { box, defineParams } from 'brepjs';

export const params = defineParams({
  width: { type: 'number', default: 10, min: 5, max: 100 },
});

export const expected = { volume: 1000 };

export default (p = params.values) => box(p.width, 10, 10);
