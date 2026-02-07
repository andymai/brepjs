export const HERO_CODE = `// Parametric spiral staircase (cm)
const steps = 16;
const rise  = 18;   // height per step
const twist = 22.5; // degrees per step
const width = 70;   // tread width
const depth = 25;   // tread depth
const colR  = 12;   // column radius
const thick = 4;    // tread thickness

// Central column + landing pad
const column = makeCylinder(colR, steps * rise + thick);
const landing = makeCylinder(colR + width, thick);
let shape = unwrap(fuseShapes(column, landing));

// Spiral treads with railing posts
for (let i = 0; i < steps; i++) {
  const tread = makeBox(
    [0, -depth / 2, 0],
    [colR + width, depth / 2, thick]
  );
  const post = translateShape(
    makeCylinder(1.5, 90),
    [colR + width - 4, 0, thick]
  );
  const step = unwrap(fuseShapes(tread, post));
  const placed = translateShape(step, [0, 0, rise * (i + 1)]);
  const rotated = rotateShape(placed, twist * i);
  shape = unwrap(fuseShapes(shape, rotated));
}

return shape;`;

export const DEFAULT_CODE = `// A filleted box
const box = makeBox([0, 0, 0], [40, 30, 20]);
const filleted = unwrap(filletShape(box, undefined, 3));
return filleted;`;
