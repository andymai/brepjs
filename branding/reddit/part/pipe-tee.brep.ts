import { cylinder, fuseAll, cutAll, unwrap } from 'brepjs';

// Flanged pipe tee. The perpendicular run/branch fusion produces a saddle
// intersection curve — the canonical B-Rep boolean seam — and the bores leave
// exact circular edges on the flange faces.
const RUN_R = 18;
const RUN_LEN = 130;
const BRANCH_R = 15;
const BRANCH_H = 60;
const FLANGE_T = 8;

export default () => {
  const run = cylinder(RUN_R, RUN_LEN, { axis: [1, 0, 0], at: [-RUN_LEN / 2, 0, 0] });
  const branch = cylinder(BRANCH_R, BRANCH_H, { axis: [0, 0, 1], at: [0, 0, 0] });

  const flangeXPlus = cylinder(30, FLANGE_T, { axis: [1, 0, 0], at: [RUN_LEN / 2 - FLANGE_T, 0, 0] });
  const flangeXMinus = cylinder(30, FLANGE_T, { axis: [1, 0, 0], at: [-RUN_LEN / 2, 0, 0] });
  const flangeTop = cylinder(26, FLANGE_T, { axis: [0, 0, 1], at: [0, 0, BRANCH_H - FLANGE_T] });

  const body = unwrap(fuseAll([run, branch, flangeXPlus, flangeXMinus, flangeTop]));

  const runBore = cylinder(11, RUN_LEN + 10, { axis: [1, 0, 0], at: [-RUN_LEN / 2 - 5, 0, 0] });
  const branchBore = cylinder(9, BRANCH_H + 30, { axis: [0, 0, 1], at: [0, 0, -20] });

  return cutAll(body, [runBore, branchBore]);
};

export const expected = {
  bounds: { xMin: -65, xMax: 65, yMin: -30, yMax: 30, zMin: -30, zMax: 60 },
  tolerancePct: 6,
};
