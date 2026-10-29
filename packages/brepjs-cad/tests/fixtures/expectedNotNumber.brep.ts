import { cylinder } from 'brepjs';
const r = 5;
const h = 10;
export const expected = { volume: (Math.PI * r * r * h).toFixed(1), bounds: { zMax: 99 } };
export default () => cylinder(r, h);
