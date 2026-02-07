import { HERO_CODE } from './constants.js';

export interface Example {
  id: string;
  title: string;
  description: string;
  category: string;
  code: string;
}

export const examples: Example[] = [
  {
    id: 'simple-box',
    title: 'Simple Box',
    description: 'A basic box primitive — the simplest possible shape.',
    category: 'Primitives',
    code: `// A simple 40×30×20 box
const box = makeBox([0, 0, 0], [40, 30, 20]);
return box;`,
  },
  {
    id: 'filleted-box',
    title: 'Filleted Box',
    description: 'Round all edges of a box with a fillet radius.',
    category: 'Operations',
    code: `// Create a box and fillet all edges
const box = makeBox([0, 0, 0], [40, 30, 20]);
const filleted = unwrap(filletShape(box, undefined, 3));
return filleted;`,
  },
  {
    id: 'boolean-subtraction',
    title: 'Boolean Subtraction',
    description: 'Cut a cylinder from a box to create a hole.',
    category: 'Booleans',
    code: `// Box with a cylindrical hole
const box = makeBox([0, 0, 0], [40, 40, 20]);
const cyl = translateShape(
  makeCylinder(10, 30),
  [20, 20, -5]
);
const result = unwrap(cutShape(box, cyl));
return result;`,
  },
  {
    id: 'chamfered-cylinder',
    title: 'Chamfered Cylinder',
    description: 'Apply chamfers to the top edges of a cylinder.',
    category: 'Operations',
    code: `// Cylinder with chamfered top edges
const cyl = makeCylinder(20, 40);
const edges = getEdges(cyl);
// Chamfer only the top circular edge
const chamfered = unwrap(chamferShape(cyl, [edges[1]], 3));
return chamfered;`,
  },
  {
    id: 'extruded-l-shape',
    title: 'Extruded L-Shape',
    description: 'Sketch a 2D L-profile and extrude it into a solid.',
    category: 'Sketching',
    code: `// Draw an L-shaped profile and extrude
const sketch = new Sketcher()
  .lineTo(40, 0)
  .lineTo(0, 10)
  .lineTo(-25, 0)
  .lineTo(0, 30)
  .lineTo(-15, 0)
  .close();

const face = sketch.face();
const solid = basicFaceExtrusion(face, [0, 0, 15]);
return solid;`,
  },
  {
    id: 'revolved-profile',
    title: 'Revolved Profile',
    description: 'Revolve a 2D profile around the Z axis to make a vase.',
    category: 'Sketching',
    code: `// Revolve a profile to create a vase shape
const sketch = new Sketcher()
  .lineTo(15, 0)
  .lineTo(5, 20)
  .lineTo(-5, 15)
  .lineTo(8, 25)
  .lineTo(-23, 0)
  .close();

const face = sketch.face();
const vase = unwrap(revolveFace(face));
return vase;`,
  },
  {
    id: 'sphere-with-holes',
    title: 'Sphere with Holes',
    description: 'Subtract cylinders from a sphere along three axes.',
    category: 'Booleans',
    code: `// Sphere with holes along X, Y, and Z axes
let shape = makeSphere(25);
const hole = makeCylinder(8, 60);

// Z-axis hole
const holeZ = translateShape(hole, [0, 0, -30]);
shape = unwrap(cutShape(shape, holeZ));

// X-axis hole
const holeX = rotateShape(
  translateShape(hole, [0, 0, -30]),
  90, [0, 0, 0], [0, 1, 0]
);
shape = unwrap(cutShape(shape, holeX));

// Y-axis hole
const holeY = rotateShape(
  translateShape(hole, [0, 0, -30]),
  90, [0, 0, 0], [1, 0, 0]
);
shape = unwrap(cutShape(shape, holeY));

return shape;`,
  },
  {
    id: 'spiral-staircase',
    title: 'Spiral Staircase',
    description: 'A parametric spiral staircase with treads and posts.',
    category: 'Advanced',
    code: HERO_CODE,
  },
];

export function findExample(id: string): Example | undefined {
  return examples.find((e) => e.id === id);
}

/** IDs of examples to highlight on the landing page (visually diverse set). */
export const featuredExampleIds: string[] = [
  'filleted-box',
  'boolean-subtraction',
  'chamfered-cylinder',
  'extruded-l-shape',
  'revolved-profile',
  'spiral-staircase',
];
