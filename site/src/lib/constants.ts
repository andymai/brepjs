export const DEFAULT_CODE = `import {
  box,
  cylinder,
  fuse,
  chamfer,
  edgeFinder,
  unwrap,
} from 'brepjs/quick';

const cols = 4;
const rows = 2;
const pitch = 8;
const studR = 2.4;
const studH = 1.8;
const baseT = 4;

const base = box(cols * pitch, rows * pitch, baseT);

let brick = base;
for (let i = 0; i < cols; i++) {
  for (let j = 0; j < rows; j++) {
    const stud = cylinder(studR, studH, {
      at: [i * pitch + pitch / 2, j * pitch + pitch / 2, baseT],
    });
    brick = unwrap(fuse(brick, stud));
  }
}

const studEdges = edgeFinder().ofCurveType('CIRCLE').findAll(brick);
export default unwrap(chamfer(brick, studEdges, 0.3));
`;
