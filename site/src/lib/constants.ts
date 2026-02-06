export const HERO_CODE = `// Create a box with a cylindrical hole + fillets
const box = castShape(
  makeBox([0, 0, 0], [30, 30, 30]).wrapped
);

const hole = castShape(
  makeCylinder(8, 40)
    .translate([15, 15, -5]).wrapped
);

const cut = unwrap(cutShape(box, hole));
const result = unwrap(
  filletShape(cut, undefined, 1.5)
);

return result;`;

export const DEFAULT_CODE = `// Welcome to the brepjs playground!
// All brepjs functions are available as globals.
// Your code must return a shape.

const box = castShape(
  makeBox([0, 0, 0], [20, 20, 20]).wrapped
);
const sphere = castShape(
  makeSphere(14).translate([10, 10, 10]).wrapped
);

const result = unwrap(intersectShapes(box, sphere));
return result;
`;
