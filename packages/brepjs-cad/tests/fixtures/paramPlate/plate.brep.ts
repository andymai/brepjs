import { cut, defineParams, drawCircle, drawRoundedRectangle } from 'brepjs';
import { clearanceRadius } from './lib/holes.js';

export const params = defineParams({
  width: { type: 'number', default: 60, min: 30, max: 160, unit: 'mm', group: 'Plate' },
  depth: { type: 'number', default: 30, min: 16, max: 80, unit: 'mm', group: 'Plate' },
  thickness: { type: 'number', default: 6, min: 2, max: 20, step: 0.5, unit: 'mm', group: 'Plate' },
  corner: {
    type: 'number',
    default: 5,
    min: 0.5,
    max: 8,
    step: 0.5,
    unit: 'mm',
    label: 'corner radius',
    group: 'Plate',
  },
  bolt: {
    type: 'choice',
    default: 'M6',
    options: ['M4', 'M5', 'M6'],
    label: 'bolt size',
    group: 'Holes',
  },
  inset: {
    type: 'number',
    default: 10,
    min: 6,
    max: 14,
    unit: 'mm',
    description: 'From each short edge to the hole center.',
    group: 'Holes',
  },
});

export const presets = {
  Small: { width: 40, depth: 20, thickness: 4, bolt: 'M4', inset: 8 },
  Large: { width: 120, depth: 50, thickness: 10 },
};

export default (p = params.values) => {
  const plate = drawRoundedRectangle(p.width, p.depth, p.corner)
    .sketchOnPlane('XY')
    .extrude(p.thickness);
  const radius = clearanceRadius(p.bolt);
  const holeX = p.width / 2 - p.inset;
  const hole = (x: number) => drawCircle(radius).sketchOnPlane('XY', [x, 0]).extrude(p.thickness);

  const drilledLeft = cut(plate, hole(-holeX));
  if (!drilledLeft.ok) return drilledLeft;
  return cut(drilledLeft.value, hole(holeX));
};
