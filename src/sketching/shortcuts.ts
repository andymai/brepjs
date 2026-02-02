import type { Shape3D } from '../topology/shapes.js';
import Sketcher from './Sketcher.js';

export const makeBaseBox = (xLength: number, yLength: number, zLength: number): Shape3D => {
  return new Sketcher()
    .movePointerTo([-xLength / 2, yLength / 2])
    .hLine(xLength)
    .vLine(-yLength)
    .hLine(-xLength)
    .close()
    .extrude(zLength);
};
