import type { Shape3D } from '../topology/shapes.js';
import Sketcher from './Sketcher.js';

/**
 * Create a box centered on the XY plane and extruded along Z.
 *
 * @param xLength - Width of the box along X.
 * @param yLength - Depth of the box along Y.
 * @param zLength - Height of the box along Z (extrusion distance).
 * @returns The extruded 3D box shape.
 *
 * @example
 * ```ts
 * const box = makeBaseBox(10, 20, 5);
 * ```
 */
export const makeBaseBox = (xLength: number, yLength: number, zLength: number): Shape3D => {
  return new Sketcher()
    .movePointerTo([-xLength / 2, yLength / 2])
    .hLine(xLength)
    .vLine(-yLength)
    .hLine(-xLength)
    .close()
    .extrude(zLength);
};
