import { cylinder, sphere, box, fuse, intersect, unwrap } from 'brepjs';

// Hemispherical dome cap — a cylinder fused with a hemisphere. There is no half-sphere
// primitive, so the dome is a full sphere clipped to its upper half with intersect()
// (fusing a whole sphere would bulge below the cap face). Units: mm.
const R = 15; // shared radius (Ø30)
const CYL_H = 20; // cylinder height

export default () => {
  const body = cylinder(R, CYL_H); // base at origin → spans z[0, CYL_H]
  const ball = sphere(R, { at: [0, 0, CYL_H] }); // sphere centred on the cap face
  const upperHalf = box(2 * R, 2 * R, R, { at: [0, 0, CYL_H + R / 2] }); // half-space z[CYL_H, CYL_H+R]
  const dome = unwrap(intersect(ball, upperHalf)); // clip to the top hemisphere
  return unwrap(fuse(body, dome));
};
