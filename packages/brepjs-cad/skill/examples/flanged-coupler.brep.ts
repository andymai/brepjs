import { box, cylinder, chamfer, cut, edgeFinder, fuse, translate, unwrap } from 'brepjs';

const FLANGE_W = 60; // X (mm)
const FLANGE_D = 60; // Y (mm)
const FLANGE_H = 8; // Z (mm)
const HUB_R = 18; // central hub radius (mm)
const HUB_H = 24; // hub height above the flange (mm)
const BORE_R = 9; // through-bore radius (mm)
const BOLT_R = 3.5; // bolt-hole radius (mm)
const BOLT_INSET = 10; // bolt-hole inset from each flange corner (mm)
const CHAMFER = 1.2; // top-edge chamfer (mm)

export default () => {
  const flange = box(FLANGE_W, FLANGE_D, FLANGE_H, { centered: true });
  const hub = cylinder(HUB_R, HUB_H, { at: [0, 0, FLANGE_H / 2] });
  const body = unwrap(fuse(flange, hub));

  // Central through-bore down the full stack.
  const bore = cylinder(BORE_R, FLANGE_H + HUB_H + 4, { at: [0, 0, -FLANGE_H / 2 - 2] });
  let part = unwrap(cut(body, bore));

  // Four corner bolt holes, mirrored by translation across both axes.
  const x = FLANGE_W / 2 - BOLT_INSET;
  const y = FLANGE_D / 2 - BOLT_INSET;
  const drill = cylinder(BOLT_R, FLANGE_H + 4, { at: [0, 0, -FLANGE_H / 2 - 2] });
  for (const [dx, dy] of [
    [x, y],
    [-x, y],
    [x, -y],
    [-x, -y],
  ] as const) {
    part = unwrap(cut(part, translate(drill, [dx, dy, 0])));
  }

  // Chamfer the hub's top circular rim — exercises a modifier before STEP export.
  const topZ = FLANGE_H / 2 + HUB_H;
  const topRim = edgeFinder().ofCurveType('CIRCLE').atDistance(HUB_R, [0, 0, topZ]).findAll(part);
  return unwrap(chamfer(part, topRim, CHAMFER));
};
