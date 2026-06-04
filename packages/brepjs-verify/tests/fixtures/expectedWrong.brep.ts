import { box } from 'brepjs';

export const expected = {
  volume: 2000,
  tolerancePct: 0.5,
};

export default () => box(10, 10, 10);
