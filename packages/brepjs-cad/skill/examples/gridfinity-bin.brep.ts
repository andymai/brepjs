import { box, cylinder, cut, fuse, fuseAll, cutAll, getSolids, unwrap } from 'brepjs';

// Gridfinity bin (simplified, faithful primitive). Units: mm.
// A GRID_X x GRID_Y bin: feet on the 42mm grid, a hollowed body (open top),
// a raised stacking lip rim, and one magnet pocket centered under each cell.
const GRID = 42; // gridfinity grid unit (mm)
const CLEARANCE = 0.5; // gap to neighbours so bins drop into a baseplate
const GRID_X = 2; // cells in X
const GRID_Y = 1; // cells in Y
const HEIGHT_UNITS = 3; // bin height in 7mm "U" units
const U = 7; // one height unit (mm)

const BASE_H = 5; // base/foot height
const WALL = 1.2; // outer wall thickness
const LIP_H = 3.6; // stacking lip height above the body
const LIP_WALL = 1.2; // stacking lip wall thickness

const MAGNET_R = 3.05; // magnet pocket radius (6.1mm magnet)
const MAGNET_DEPTH = 2.2; // pocket depth

const footW = GRID - CLEARANCE;
const bodyW = GRID_X * GRID - CLEARANCE;
const bodyD = GRID_Y * GRID - CLEARANCE;
const totalH = BASE_H + HEIGHT_UNITS * U;
const cx = (GRID_X * GRID) / 2;
const cy = (GRID_Y * GRID) / 2;

export default () => {
  // One foot block per grid cell, fused into the body.
  const feet = [];
  for (let i = 0; i < GRID_X; i++) {
    for (let j = 0; j < GRID_Y; j++) {
      feet.push(
        box(footW, footW, BASE_H, { at: [(i + 0.5) * GRID, (j + 0.5) * GRID, BASE_H / 2] })
      );
    }
  }

  const body = box(bodyW, bodyD, totalH, { at: [cx, cy, BASE_H + (totalH - BASE_H) / 2] });
  const solidBin = unwrap(fuseAll([...feet, body]));

  // Stacking lip: a thin raised rim ring fused onto the top of the body.
  const lipOuter = box(bodyW, bodyD, LIP_H, { at: [cx, cy, totalH + LIP_H / 2] });
  const lipInner = box(bodyW - 2 * LIP_WALL, bodyD - 2 * LIP_WALL, LIP_H + 1, {
    at: [cx, cy, totalH + LIP_H / 2],
  });
  const lipRing = unwrap(cut(lipOuter, lipInner));
  const withLip = unwrap(fuse(solidBin, lipRing));

  // Hollow the bin from the top, leaving WALL walls and a BASE_H floor.
  const cavity = box(bodyW - 2 * WALL, bodyD - 2 * WALL, totalH + LIP_H, {
    at: [cx, cy, BASE_H + (totalH + LIP_H) / 2 + 0.001],
  });
  const hollow = unwrap(cut(withLip, cavity));

  // Magnet pocket centered under each cell, drilled up from below.
  const magnets = [];
  for (let i = 0; i < GRID_X; i++) {
    for (let j = 0; j < GRID_Y; j++) {
      magnets.push(
        cylinder(MAGNET_R, MAGNET_DEPTH, { at: [(i + 0.5) * GRID, (j + 0.5) * GRID, 0] })
      );
    }
  }
  const drilled = unwrap(cutAll(hollow, magnets));

  // Booleans wrap a single solid in a Compound; return the bare Solid so validity is checked.
  const solids = getSolids(drilled);
  return solids.length === 1 ? solids[0] : drilled;
};
