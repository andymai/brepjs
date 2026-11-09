import { box, cylinder, fuse, cut, unwrap } from 'brepjs';

// L-shaped mounting bracket: a base plate fused to an upright web,
// then four bolt holes bored through the base. Units: mm.
const PLATE_W = 60; // base plate width  (X)
const PLATE_D = 40; // base plate depth  (Y)
const PLATE_T = 6; // base plate thickness (Z)

const WEB_T = 6; // upright web thickness (Y)
const WEB_H = 34; // upright web height above the plate (Z)

const HOLE_R = 3; // bolt hole radius
const HOLE_INSET = 8; // hole inset from each plate edge

export default () => {
  const plate = box(PLATE_W, PLATE_D, PLATE_T, { at: [0, 0, PLATE_T / 2] });

  // Upright web rises from the back edge of the plate, overlapping it for a clean fuse.
  const webY = PLATE_D / 2 - WEB_T / 2;
  const webH = WEB_H + PLATE_T;
  const web = box(PLATE_W, WEB_T, webH, { at: [0, webY, webH / 2] });

  const bracket = unwrap(fuse(plate, web));

  // Four bolt holes through the base plate, set in from each corner.
  const hx = PLATE_W / 2 - HOLE_INSET;
  const hy = -PLATE_D / 2 + HOLE_INSET;
  const corners: [number, number][] = [
    [hx, hy],
    [-hx, hy],
    [hx, hy + 2 * HOLE_INSET],
    [-hx, hy + 2 * HOLE_INSET],
  ];

  let result = bracket;
  for (const [x, y] of corners) {
    const drill = cylinder(HOLE_R, PLATE_T + 2, { at: [x, y, -1] });
    result = unwrap(cut(result, drill));
  }
  return result;
};
