import { box, cutAll, getSolids, unwrap } from 'brepjs';

// Gridfinity divider / insert (simplified, faithful primitive). Units: mm.
// A drop-in tray that splits a bin's interior into a DIV_X x DIV_Y grid of
// compartments: a solid block sized to the bin cavity, with a thin floor and
// BLADE-thick walls left between pockets. Built subtractively => one solid.
const GRID = 42; // gridfinity grid unit (mm)
const CLEARANCE = 0.5; // bin's outer clearance
const WALL = 1.2; // bin wall thickness
const FIT = 0.3; // slip-fit gap between divider and bin cavity

const GRID_X = 2; // bin cells in X
const GRID_Y = 1; // bin cells in Y
const DIV_X = 3; // compartments across X
const DIV_Y = 1; // compartments across Y

const BLADE = 1.2; // divider wall thickness
const FLOOR = 1.0; // tray floor thickness
const DIV_H = 14; // divider height (mm)

// Inner cavity footprint of the target bin, minus a slip-fit gap.
const innerW = GRID_X * GRID - CLEARANCE - 2 * WALL - 2 * FIT;
const innerD = GRID_Y * GRID - CLEARANCE - 2 * WALL - 2 * FIT;

// Each compartment's interior opening (cell pitch minus the surrounding blades).
const cellW = (innerW - BLADE * (DIV_X + 1)) / DIV_X;
const cellD = (innerD - BLADE * (DIV_Y + 1)) / DIV_Y;
const pocketH = DIV_H - FLOOR;

export default () => {
  const block = box(innerW, innerD, DIV_H, { at: [innerW / 2, innerD / 2, DIV_H / 2] });

  // One pocket per compartment, opening from the top, leaving a FLOOR floor.
  const pockets = [];
  for (let i = 0; i < DIV_X; i++) {
    for (let j = 0; j < DIV_Y; j++) {
      const px = BLADE + i * (cellW + BLADE) + cellW / 2;
      const py = BLADE + j * (cellD + BLADE) + cellD / 2;
      pockets.push(box(cellW, cellD, pocketH + 1, { at: [px, py, FLOOR + pocketH / 2 + 0.5] }));
    }
  }
  const tray = unwrap(cutAll(block, pockets));

  const solids = getSolids(tray);
  return solids.length === 1 ? solids[0] : tray;
};
