import { box, fillet, unwrap } from 'brepjs';

// A rectangular block with every edge rounded — the canonical fillet example.
// Keep the radius well under half the thinnest wall so the kernel can fit the rounds.
// Units: mm.
const WIDTH = 50; // X
const DEPTH = 30; // Y
const HEIGHT = 20; // Z
const RADIUS = 4; // fillet radius on all edges

export default () => {
  const block = box(WIDTH, DEPTH, HEIGHT, { centered: true });
  return unwrap(fillet(block, RADIUS));
};
