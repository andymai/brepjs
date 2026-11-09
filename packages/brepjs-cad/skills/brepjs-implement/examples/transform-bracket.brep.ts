import { box, cylinder, fuse, mirror, rotate, translate, unwrap } from 'brepjs';

const BASE_W = 60; // X (mm)
const BASE_D = 40; // Y (mm)
const BASE_H = 6; // Z (mm)
const ARM_LEN = 30; // upright arm length before tilt (mm)
const ARM_THICK = 6; // arm cross-section (mm)
const TILT_DEG = 20; // arm lean about Y (degrees)
const PIN_R = 4; // locating pin radius (mm)
const PIN_H = 8; // locating pin height (mm)
const PIN_INSET = 12; // pin offset from base center along X (mm)

export default () => {
  const base = box(BASE_W, BASE_D, BASE_H, { centered: true });

  // One upright arm, tilted about Y, then translated to the +X edge of the base.
  const armBlank = box(ARM_THICK, BASE_D, ARM_LEN, { centered: true });
  const tilted = rotate(armBlank, TILT_DEG, { axis: [0, 1, 0] });
  const armRight = translate(tilted, [BASE_W / 2 - ARM_THICK, 0, BASE_H / 2 + ARM_LEN / 2]);

  // Mirror the arm across the YZ plane to make a symmetric pair.
  const armLeft = mirror(armRight, { normal: [1, 0, 0] });

  // Two locating pins on the base, the second mirrored across YZ.
  const pinRight = cylinder(PIN_R, PIN_H, { at: [PIN_INSET, 0, BASE_H / 2] });
  const pinLeft = mirror(pinRight, { normal: [1, 0, 0] });

  const withArms = unwrap(fuse(unwrap(fuse(base, armRight)), armLeft));
  const withPins = unwrap(fuse(unwrap(fuse(withArms, pinRight)), pinLeft));
  return withPins;
};
