export const HERO_CODE = `// Parametric spiral staircase (cm)
const steps = 16;
const rise  = 18;   // height per step
const twist = 22.5; // degrees per step
const width = 70;   // tread width
const depth = 25;   // tread depth
const colR  = 12;   // column radius
const thick = 4;    // tread thickness

// Central column + landing pad
const column = cylinder(colR, steps * rise + thick);
const landing = cylinder(colR + width, thick);
let stair = unwrap(fuse(column, landing));

// Spiral treads with railing posts
for (let i = 0; i < steps; i++) {
  const tread = translate(box(colR + width, depth, thick), [0, -depth / 2, 0]);
  const post = translate(cylinder(1.5, 90), [colR + width - 4, 0, thick]);
  const step = unwrap(fuse(tread, post));
  const placed = translate(step, [0, 0, rise * (i + 1)]);
  const rotated = rotate(placed, twist * i);
  stair = unwrap(fuse(stair, rotated));
}

return stair;`;

export const DEFAULT_CODE = `// A filleted box
return shape(box(40, 30, 20)).fillet(3).val;`;
