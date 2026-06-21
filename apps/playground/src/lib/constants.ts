export const DEFAULT_CODE = `import {
  box,
  cylinder,
  fuse,
  cutAll,
  chamfer,
  edgeFinder,
  unwrap,
} from 'brepjs/quick';

// Parametric stud brick — every standard size falls out of three numbers.
// Try the call at the bottom:
//   studBrick(2, 4, 3)  → 2×4 brick
//   studBrick(2, 4, 1)  → 2×4 plate (a brick is 3 plates tall)
//   studBrick(1, 6, 3)  → 1×6 brick
//   studBrick(8, 8, 1)  → 8×8 baseplate
function studBrick(studsX: number, studsY: number, plateUnits: number) {
  // Interlocking-brick spec (mm).
  const pitch = 8;       // stud-to-stud spacing
  const studR = 2.4;     // stud Ø4.8
  const studH = 1.8;     // stud height
  const plateH = 3.2;    // 1 plate = 3.2 mm; brick = 3 plates
  const wall = 1.6;      // outer wall thickness
  const tubeR = 3.255;   // anti-stud tube OD = 8√2 − 4.8 = 6.51

  const W = studsX * pitch;
  const D = studsY * pitch;
  const H = plateUnits * plateH;
  const opts = { trackEvolution: false };

  // Collect every primitive up-front, then run two batched booleans —
  // ~3× faster than fusing/cutting one stud at a time.
  const studs = [];
  for (let i = 0; i < studsX; i++) {
    for (let j = 0; j < studsY; j++) {
      studs.push(cylinder(studR, studH + 0.3, {
        at: [i * pitch + pitch / 2, j * pitch + pitch / 2, H - 0.3],
      }));
    }
  }

  const tubeOuters = [];
  const tubeInners = [];
  for (let i = 1; i < studsX; i++) {
    for (let j = 1; j < studsY; j++) {
      tubeOuters.push(cylinder(tubeR, H - wall, { at: [i * pitch, j * pitch, 0] }));
      tubeInners.push(cylinder(studR, H - wall, { at: [i * pitch, j * pitch, 0] }));
    }
  }

  // Body + studs welded into ONE solid. The studs overlap the top face (sunk 0.3 mm),
  // and a pairwise fuse() reduce welds reliably where an N-way fuseAll leaves them loose.
  const body = studs.reduce((acc, s) => unwrap(fuse(acc, s, opts)), box(W, D, H));

  // Underside negative space: cavity (carved by tube outers, so the tubes
  // remain solid in the brick) plus the tube interiors. One cut handles all.
  const cavity = box(W - 2 * wall, D - 2 * wall, H - wall, {
    at: [W / 2, D / 2, (H - wall) / 2],
  });
  const negativeSpace = tubeOuters.length === 0
    ? [cavity]
    : [unwrap(cutAll(cavity, tubeOuters, opts)), ...tubeInners];
  const brick = unwrap(cutAll(body, negativeSpace, opts));

  const rims = edgeFinder().ofCurveType('CIRCLE').findAll(brick);
  return unwrap(chamfer(brick, rims, 0.2));
}

export default studBrick(2, 4, 3);
`;
