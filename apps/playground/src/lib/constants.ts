export const DEFAULT_CODE = `import { box, cylinder, cut, fuse, getSolids, unwrap } from 'brepjs/quick';

// Parametric interlocking brick (LEGO-style). Any size from 3 numbers:
// STUDS_X x STUDS_Y studs in plan, PLATES tall. Units: mm.
//
// Interlocking system:
//  - top: a grid of cylindrical STUDS the next brick's underside grips.
//  - bottom: a hollow cavity ringed by walls, with interior TUBES (between
//    studs) that clamp onto the studs of the brick below.
const PITCH = 8; // stud-to-stud spacing (X and Y)
const CLEARANCE = 0.2; // shrink off the nominal footprint so bricks sit side by side
const PLATE_H = 3.2; // height of one plate layer
const WALL = 1.2; // outer wall thickness
const STUD_R = 2.4; // stud radius (4.8mm dia)
const STUD_H = 1.8; // stud height above the top face
const TUBE_OR = 3.25; // underside clamp tube outer radius
const TUBE_IR = 2.4; // underside clamp tube inner radius (grips a stud)

// --- size from 3 numbers ---
const STUDS_X = 4;
const STUDS_Y = 2;
const PLATES = 3;

const bodyW = STUDS_X * PITCH - CLEARANCE; // X footprint
const bodyD = STUDS_Y * PITCH - CLEARANCE; // Y footprint
const bodyH = PLATES * PLATE_H; // total wall height

// stud centres sit on a PITCH grid inset half a pitch from the footprint corner
const studX = (i: number) => (i + 0.5) * PITCH - (STUDS_X * PITCH) / 2;
const studY = (j: number) => (j + 0.5) * PITCH - (STUDS_Y * PITCH) / 2;

function studBrick() {
  // Solid body, corner-centred on origin in plan, base on z=0.
  const body = box(bodyW, bodyD, bodyH, { at: [0, 0, bodyH / 2] });

  // Hollow the underside: leave WALL walls all round and a thin top roof.
  const cavity = box(bodyW - 2 * WALL, bodyD - 2 * WALL, bodyH - WALL, {
    at: [0, 0, (bodyH - WALL) / 2 - 0.001],
  });
  const shell = unwrap(cut(body, cavity));

  // Studs on the top face.
  const studs = [];
  for (let i = 0; i < STUDS_X; i++) {
    for (let j = 0; j < STUDS_Y; j++) {
      // sink 0.5mm into the roof so the stud overlaps the body and welds
      studs.push(cylinder(STUD_R, STUD_H + 0.5, { at: [studX(i), studY(j), bodyH - 0.5] }));
    }
  }

  // Underside clamp tubes: between adjacent studs, hollow, rising inside the cavity.
  // One tube at each interior (i+0.5, j+0.5) lattice node.
  const tubes = [];
  // run the tube up into the roof (overlap by 0.5) so it welds to the body
  const tubeH = bodyH - WALL + 0.5;
  for (let i = 0; i < STUDS_X - 1; i++) {
    for (let j = 0; j < STUDS_Y - 1; j++) {
      const tx = studX(i) + PITCH / 2;
      const ty = studY(j) + PITCH / 2;
      const outer = cylinder(TUBE_OR, tubeH, { at: [tx, ty, 0] });
      // bore stays below the roof so the tube keeps a closed top inside the body
      const inner = cylinder(TUBE_IR, bodyH - WALL, { at: [tx, ty, -0.5] });
      tubes.push(unwrap(cut(outer, inner)));
    }
  }

  // Pairwise fuse over real overlaps welds reliably into one solid.
  let brick = shell;
  for (const part of [...studs, ...tubes]) {
    brick = unwrap(fuse(brick, part));
  }

  const solids = getSolids(brick);
  return solids.length === 1 ? solids[0] : brick;
}

export default studBrick();`;
