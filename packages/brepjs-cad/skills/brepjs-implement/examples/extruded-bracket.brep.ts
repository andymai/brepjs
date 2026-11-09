// 2D sketch -> extrude: a rounded-corner mounting plate with two bolt holes.
import { drawRoundedRectangle, drawCircle, cut } from 'brepjs';

const PLATE_WIDTH = 60; // mm (X)
const PLATE_DEPTH = 30; // mm (Y)
const CORNER_RADIUS = 5; // mm
const THICKNESS = 6; // mm (Z extrusion)
const HOLE_RADIUS = 3.2; // mm (M6 clearance)
const HOLE_INSET = 10; // mm from each short edge to the hole center

export default () => {
  const plate = drawRoundedRectangle(PLATE_WIDTH, PLATE_DEPTH, CORNER_RADIUS)
    .sketchOnPlane('XY')
    .extrude(THICKNESS);

  const holeX = PLATE_WIDTH / 2 - HOLE_INSET;
  const leftHole = drawCircle(HOLE_RADIUS).sketchOnPlane('XY', [-holeX, 0]).extrude(THICKNESS);
  const rightHole = drawCircle(HOLE_RADIUS).sketchOnPlane('XY', [holeX, 0]).extrude(THICKNESS);

  const drilledLeft = cut(plate, leftHole);
  if (!drilledLeft.ok) return drilledLeft;
  return cut(drilledLeft.value, rightHole);
};
