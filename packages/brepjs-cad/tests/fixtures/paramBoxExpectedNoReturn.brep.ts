import { box, defineParams } from 'brepjs';

export const params = defineParams({
  width: { type: 'number', default: 10, min: 5, max: 100 },
});

// Wrong on purpose: it returns nothing, as an arrow body in braces with no `return` does.
export const expected = (p = params.values) => {
  void p.width;
};

export default (p = params.values) => box(p.width, 10, 10);
