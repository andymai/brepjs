import { box, compound, translate } from 'brepjs';

export default () => {
  using a = box(10, 10, 10);
  using moved = box(10, 10, 10);
  using b = translate(moved, [20, 0, 0]);
  return compound([a, b]);
};
