export const HERO_CODE = `// Parametric spiral staircase (cm)
const steps = 16;
const rise  = 18;   // height per step
const twist = 22.5; // degrees per step
const width = 70;   // tread width
const depth = 25;   // tread depth
const colR  = 12;   // column radius
const thick = 4;    // tread thickness
const railH = 90;   // railing post height
const railR = colR + width - 4; // railing radius

// Central column + landing pad
const column = cylinder(colR, steps * rise + thick);
const landing = cylinder(colR + width, thick);
let stair = shape(column).fuse(landing).val;

// Spiral treads with railing posts
for (let i = 0; i < steps; i++) {
  const tread = translate(box(colR + width, depth, thick), [0, -depth / 2, 0]);
  const post = translate(cylinder(1.5, railH), [railR, 0, thick]);
  const step = shape(tread).fuse(post).val;
  const placed = translate(step, [0, 0, rise * (i + 1)]);
  const rotated = rotate(placed, twist * i);
  stair = shape(stair).fuse(rotated).val;
}

// Handrail: sweep circle profile along helical path
const firstTop = rise + thick + railH;
const helixPitch = steps * rise;
const helixHeight = (steps - 1) * rise;
const railProfile = unwrap(wire([circle(2, { at: [railR, 0, firstTop], normal: [0, 1, 0] })]));
const helixSpine = helix(helixPitch, helixHeight, railR, { at: [0, 0, firstTop] });
const handrail = shape(railProfile).sweep(helixSpine, { frenet: true }).val;
stair = shape(stair).fuse(handrail).val;

// Ball endcaps on handrail ends
const ball = sphere(4);
stair = shape(stair).fuse(translate(ball, [railR, 0, firstTop])).val;
const lastTop = firstTop + rise * (steps - 1);
const endBall = rotate(translate(clone(ball), [railR, 0, lastTop]), twist * (steps - 1));
stair = shape(stair).fuse(endBall).val;

return stair;`;

export const DEFAULT_CODE = `// A filleted box
return shape(box(40, 30, 20)).fillet(3).val;`;
