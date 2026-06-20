import { box, chamfer, unwrap } from 'brepjs';

// A rectangular block with every edge chamfered — the canonical chamfer example.
// Keep the distance under the shortest adjacent edge so the kernel can build the bevels.
// Units: mm.
const WIDTH = 50; // X
const DEPTH = 30; // Y
const HEIGHT = 20; // Z
const DISTANCE = 3; // chamfer distance on all edges

export default () => {
  const block = box(WIDTH, DEPTH, HEIGHT, { centered: true });
  return unwrap(chamfer(block, DISTANCE));
};
