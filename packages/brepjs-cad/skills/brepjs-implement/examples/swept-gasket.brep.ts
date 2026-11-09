// Sweep: a rectangular gasket frame formed by sweeping a small rectangular
// cross-section along a rounded-rectangle spine.
import { drawRoundedRectangle, draw } from 'brepjs';

const FRAME_WIDTH = 80; // mm (X) — spine outer width
const FRAME_DEPTH = 50; // mm (Y) — spine outer depth
const CORNER_RADIUS = 8; // mm — spine corner rounding
const PROFILE_WIDTH = 4; // mm — cross-section width (outward from spine)
const PROFILE_HEIGHT = 3; // mm — cross-section height (along spine normal)

export default () => {
  const spine = drawRoundedRectangle(FRAME_WIDTH, FRAME_DEPTH, CORNER_RADIUS).sketchOnPlane('XY');

  return spine.sweepSketch(
    (plane, origin) =>
      draw([-PROFILE_WIDTH / 2, 0])
        .hLine(PROFILE_WIDTH)
        .vLine(PROFILE_HEIGHT)
        .hLine(-PROFILE_WIDTH)
        .close()
        .sketchOnPlane(plane, origin),
    { withContact: true }
  );
};
