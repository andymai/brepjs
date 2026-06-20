import { box, fuse, translate, unwrap, type MaterialFn } from 'brepjs';

// Two stacked boxes so there are faces both below and above z = 10.
export default () => {
  const lower = box(10, 10, 10);
  const upper = translate(box(10, 10, 10), [0, 0, 10]);
  return unwrap(fuse(lower, upper));
};

// Paint faces by centroid height — the CLI evaluates this per face group.
export const materials: MaterialFn = ({ center }) =>
  center[2] < 10
    ? { name: 'wood', baseColor: [0.78, 0.63, 0.41, 1], roughness: 0.5 }
    : { name: 'white', baseColor: [0.95, 0.94, 0.92, 1], roughness: 0.7 };
