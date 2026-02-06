export const HERO_CODE = `// Parametric spiral staircase (cm)
const steps = 16;
const rise  = 18;   // height per step
const twist = 22.5; // degrees per step
const width = 70;   // tread width
const depth = 25;   // tread depth
const colR  = 12;   // column radius
const railH = 90;   // railing height
const thick = 4;    // tread thickness

// Base: landing pad + central column
const column = castShape(
  makeCylinder(colR, steps * rise + thick).wrapped
);
const landing = castShape(
  makeCylinder(colR + width, thick).wrapped
);
let shape = unwrap(fuseShapes(column, landing));

// Spiral: treads with railing posts
for (let i = 0; i < steps; i++) {
  const tread = castShape(
    makeBox(
      [0, -depth / 2, 0],
      [colR + width, depth / 2, thick]
    ).wrapped
  );
  const post = castShape(
    makeCylinder(1.5, railH)
      .translate([colR + width - 4, 0, thick])
      .wrapped
  );

  const step = unwrap(fuseShapes(tread, post));
  const placed = translateShape(
    step, [0, 0, rise * (i + 1)]
  );
  const rotated = rotateShape(placed, twist * i);
  shape = unwrap(fuseShapes(shape, rotated));
}

// Handrail: sweep circle along helix
const railR   = colR + width - 4;
const railTop = rise + thick + railH;
const circle  = makeCircle(
  2, [railR, 0, railTop], [0, 1, 0]
);
const profile = unwrap(assembleWire([circle]));
const spine   = makeHelix(
  steps * rise,
  (steps - 1) * rise,
  railR,
  [0, 0, railTop]
);
const handrail = unwrap(
  genericSweep(profile, spine, { frenet: true })
);
shape = unwrap(fuseShapes(shape, handrail));

// Ball endcaps on handrail ends
const ball = castShape(makeSphere(4).wrapped);
const end1 = translateShape(
  ball, [railR, 0, railTop]
);
shape = unwrap(fuseShapes(shape, end1));
const end2 = rotateShape(
  translateShape(cloneShape(ball),
    [railR, 0, railTop + rise * (steps - 1)]
  ),
  twist * (steps - 1)
);
shape = unwrap(fuseShapes(shape, end2));

return shape;`;

export const DEFAULT_CODE = `// Welcome to the brepjs playground!
// All brepjs functions are available as globals.
// Your code must return a shape.

` + HERO_CODE;
