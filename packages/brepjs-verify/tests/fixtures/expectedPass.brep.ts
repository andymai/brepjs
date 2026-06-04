import { box } from 'brepjs';

export const expected = {
  volume: 1000,
  area: 600,
  bounds: { xMin: 0, xMax: 10, yMin: 0, yMax: 10, zMin: 0, zMax: 10 },
  tolerancePct: 0.5,
};

export default () => box(10, 10, 10);
