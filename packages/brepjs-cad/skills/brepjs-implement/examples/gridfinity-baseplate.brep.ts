import { box, cutAll, getSolids, unwrap } from 'brepjs';

// Gridfinity baseplate (simplified, faithful primitive). Units: mm.
// An NxM slab on the 42mm grid; each cell has a square socket recess that a
// bin foot drops into. Light, fast to verify, and a true single solid.
const GRID = 42; // gridfinity grid unit (mm)
const COLS = 3; // cells in X
const ROWS = 2; // cells in Y
const PLATE_H = 5; // baseplate thickness

const SOCKET = 41.5; // socket opening (bin foot + a little play)
const SOCKET_DEPTH = 4; // recess depth (leaves a 1mm floor under each socket)

const plateW = COLS * GRID;
const plateD = ROWS * GRID;

export default () => {
  const plate = box(plateW, plateD, PLATE_H, { at: [plateW / 2, plateD / 2, PLATE_H / 2] });

  // One socket recess per cell, opening from the top face.
  const sockets = [];
  for (let i = 0; i < COLS; i++) {
    for (let j = 0; j < ROWS; j++) {
      sockets.push(
        box(SOCKET, SOCKET, SOCKET_DEPTH + 1, {
          at: [(i + 0.5) * GRID, (j + 0.5) * GRID, PLATE_H - SOCKET_DEPTH / 2 + 0.5],
        })
      );
    }
  }
  const recessed = unwrap(cutAll(plate, sockets));

  const solids = getSolids(recessed);
  return solids.length === 1 ? solids[0] : recessed;
};
