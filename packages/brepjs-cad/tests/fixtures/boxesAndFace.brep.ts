import { box, compound, polygon, translate, unwrap } from 'brepjs';

export default () => {
  using a = box(10, 10, 10);
  using moved = box(10, 10, 10);
  using b = translate(moved, [20, 0, 0]);
  using tri = unwrap(polygon([[40, 0, 0], [45, 0, 0], [40, 5, 0]]));
  return compound([a, b, tri]);
};
